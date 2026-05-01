/**
 * Cloudflare Access JWT validation middleware for Hono.
 *
 * Reads the JWT from the `CF_Authorization` cookie (or the
 * `Cf-Access-Jwt-Assertion` header), verifies the signature, and
 * populates Hono context variables (`userEmail`, `userSub`) for
 * downstream handlers.
 *
 * @module
 */

import type { MiddlewareHandler } from "hono";
import type { CloudflareAccessSettings, Logger } from "./types";
import { createDefaultLogger } from "./default-logger";
import { matchPolicy } from "./policy";
import {
  verifyDevJwt,
  verifyAccessJwt,
  parseCookie,
  JWT_HEADER,
  DEFAULT_DEV_SECRET,
  type VerifiedToken
} from "./jwt";

const LOG_MODULE = "cf-access";

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create a Hono middleware that validates a Cloudflare Access JWT and
 * sets authenticated-user variables on the Hono context.
 *
 * **Policy evaluation** (same policy array as
 * {@link developerAuthentication}):
 *
 * | Policy match       | Behaviour                                      |
 * |--------------------|-------------------------------------------------|
 * | `authenticate: false` | Bypass — skip JWT validation entirely.       |
 * | `authenticate: true`  | Require — valid JWT or 401.                  |
 * | No matching policy    | Controlled by `defaultAction` (see below).   |
 *
 * **`defaultAction`** (applies when no policy matches):
 *
 * - `"block"` *(default)* — return 401 if no valid JWT is present.
 * - `"bypass"` — allow the request through.  If a JWT *is* present and
 *   valid the context variables are still set; otherwise the request
 *   continues with no authenticated user.
 *
 * **Verification order** (when JWT validation is performed):
 *
 * 1. Try HMAC verification with the dev secret (fast, in-process).
 * 2. Fall back to the remote JWKS endpoint for the team domain.
 */
export function cloudflareAccess(settings?: CloudflareAccessSettings): MiddlewareHandler {
  const policies = settings?.policies;
  const defaultAction = settings?.defaultAction ?? "block";
  const devSecret = settings?.devSecret ?? DEFAULT_DEV_SECRET;
  const audience = settings?.audience;
  const teamDomainOverride = settings?.teamDomain;
  const log = createDefaultLogger(LOG_MODULE, settings?.logger);

  return async (c, next) => {
    const pathname = new URL(c.req.url).pathname;

    // -----------------------------------------------------------------
    // 1.  Evaluate path policies.
    // -----------------------------------------------------------------
    const policyMatch = policies ? matchPolicy(pathname, policies) : undefined;

    if (policyMatch === false) {
      // Explicitly public — skip JWT validation entirely.
      log.debug("Path is public – bypassing auth", { pathname });
      return next();
    }

    // Determine whether auth is *required* for this path.
    //   - Explicit `true` from a policy  → required.
    //   - No matching policy + block      → required.
    //   - No matching policy + bypass     → optional (best-effort).
    const authRequired =
      policyMatch === true || (policyMatch === undefined && defaultAction === "block");

    // -----------------------------------------------------------------
    // 2.  Extract the token.
    // -----------------------------------------------------------------
    const token = c.req.header(JWT_HEADER) ?? parseCookie(c.req.header("cookie"));

    if (!token) {
      if (authRequired) {
        log.warn("No JWT found in header or cookie");
        return c.json({ error: "Authentication required" }, 401);
      }
      // Optional auth — no token, continue without user info.
      log.debug("No JWT – continuing (bypass)", { pathname });
      return next();
    }

    // -----------------------------------------------------------------
    // 3.  Verify the token.
    // -----------------------------------------------------------------
    const result = await verifyToken(c, token, {
      devSecret,
      audience,
      teamDomainOverride,
      logger: log
    });

    if (result) {
      log.debug("Verified token", { email: result.email });
      c.set("userEmail", result.email);
      c.set("userSub", result.sub);
      return next();
    }

    // -----------------------------------------------------------------
    // 4.  Verification failed.
    // -----------------------------------------------------------------
    if (authRequired) {
      log.warn("JWT verification failed");
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // Optional auth — bad token, continue without user info.
    log.info("JWT invalid – continuing (bypass)", { pathname });
    return next();
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to verify a JWT, trying the dev secret first and then
 * Cloudflare Access JWKS.
 *
 * Returns the verified claims or `null`.
 */
async function verifyToken(
  c: { env: unknown },
  token: string,
  opts: {
    devSecret: string;
    audience?: string;
    teamDomainOverride?: string;
    logger?: Logger;
  }
): Promise<VerifiedToken | null> {
  const log = createDefaultLogger(LOG_MODULE, opts.logger);

  // Fast path: dev-signed token.
  const devResult = await verifyDevJwt(token, opts.devSecret);
  if (devResult) return devResult;

  // Slow path: Cloudflare Access JWKS.
  const teamDomain =
    opts.teamDomainOverride ?? (c.env as Record<string, string | undefined>).CLOUDFLARE_TEAM_DOMAIN;

  if (!teamDomain) {
    log.error(
      "No team domain configured – set CLOUDFLARE_TEAM_DOMAIN in env or pass teamDomain in settings"
    );
    return null;
  }

  return verifyAccessJwt(token, teamDomain, opts.audience);
}
