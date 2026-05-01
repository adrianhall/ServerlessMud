import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  cloudflareAccess,
  signDevJwt,
  JWT_HEADER,
  COOKIE_NAME,
  type AuthVariables
} from "@lib/cloudflare-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "http://localhost";

/** Minimal Env stub with the team domain. */
const MOCK_ENV = {
  CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com"
};

/**
 * Create a Hono app with the cloudflareAccess middleware and an echo
 * route that returns the context variables.
 */
function createApp(settings?: Parameters<typeof cloudflareAccess>[0]) {
  const app = new Hono<{ Bindings: typeof MOCK_ENV; Variables: AuthVariables }>();
  app.use(cloudflareAccess(settings));

  app.get("/api/test", (c) => {
    return c.json({
      email: c.get("userEmail") ?? null,
      sub: c.get("userSub") ?? null
    });
  });

  app.get("/api/version", (c) => c.json({ version: "1.0" }));
  app.get("/public", (c) => c.text("ok"));

  return app;
}

/** Shortcut: fetch a route with env bindings. */
function fetchWithEnv(app: ReturnType<typeof createApp>, url: string, init?: RequestInit) {
  return app.fetch(new Request(url, init), MOCK_ENV);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cloudflareAccess middleware", () => {
  // -----------------------------------------------------------------------
  // Dev token verification
  // -----------------------------------------------------------------------

  describe("dev token verification", () => {
    it("sets context variables from a valid dev JWT in the header", async () => {
      const token = await signDevJwt("alice@example.com");
      const app = createApp();

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("alice@example.com");
      expect(body.sub).toBe("dev-alice@example.com");
    });

    it("sets context variables from a valid dev JWT in the cookie", async () => {
      const token = await signDevJwt("bob@example.com");
      const app = createApp();

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { Cookie: `${COOKIE_NAME}=${token}` }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("bob@example.com");
    });

    it("prefers the header over the cookie when both are present", async () => {
      const headerToken = await signDevJwt("header@example.com");
      const cookieToken = await signDevJwt("cookie@example.com");
      const app = createApp();

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: {
          [JWT_HEADER]: headerToken,
          Cookie: `${COOKIE_NAME}=${cookieToken}`
        }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("header@example.com");
    });

    it("works with a custom dev secret", async () => {
      const secret = "my-test-secret";
      const token = await signDevJwt("custom@example.com", { secret });
      const app = createApp({ devSecret: secret });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("custom@example.com");
    });
  });

  // -----------------------------------------------------------------------
  // Missing / invalid token (default: block)
  // -----------------------------------------------------------------------

  describe("missing or invalid token (defaultAction: block)", () => {
    it("returns 401 when no JWT is provided", async () => {
      const app = createApp();
      const res = await fetchWithEnv(app, `${BASE}/api/test`);

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Authentication required");
    });

    it("returns 401 for a malformed JWT", async () => {
      const app = createApp();
      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: "not.a.jwt" }
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid or expired");
    });

    it("returns 401 for an expired dev token", async () => {
      const token = await signDevJwt("expired@example.com", { lifetime: -1 });
      const app = createApp();

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(401);
    });

    it("returns 401 when dev secret does not match", async () => {
      const token = await signDevJwt("alice@example.com", { secret: "secret-a" });
      const app = createApp({ devSecret: "secret-b" });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Policies
  // -----------------------------------------------------------------------

  describe("policies", () => {
    const policies = [
      { pattern: /^\/api\/version$/, authenticate: false },
      { pattern: /^\/public$/, authenticate: false },
      { pattern: /^\/api\//, authenticate: true }
    ];

    it("bypasses auth for paths marked authenticate: false", async () => {
      const app = createApp({ policies });

      const res = await fetchWithEnv(app, `${BASE}/api/version`);
      expect(res.status).toBe(200);
    });

    it("requires auth for paths marked authenticate: true", async () => {
      const app = createApp({ policies });

      const res = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(res.status).toBe(401);
    });

    it("uses first-match-wins ordering", async () => {
      // /api/version matches the first rule (false) before the /api/ catch-all (true).
      const app = createApp({ policies });

      const versionRes = await fetchWithEnv(app, `${BASE}/api/version`);
      expect(versionRes.status).toBe(200);

      const testRes = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(testRes.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // defaultAction: bypass
  // -----------------------------------------------------------------------

  describe("defaultAction: bypass", () => {
    const settings = { defaultAction: "bypass" as const };

    it("allows requests through when no JWT is present", async () => {
      const app = createApp(settings);

      const res = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string | null; sub: string | null };
      expect(body.email).toBeNull();
      expect(body.sub).toBeNull();
    });

    it("sets context variables when a valid JWT is present", async () => {
      const token = await signDevJwt("opt@example.com");
      const app = createApp(settings);

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("opt@example.com");
    });

    it("allows through with an invalid JWT (no user set)", async () => {
      const app = createApp(settings);

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: "garbage.token.here" }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string | null; sub: string | null };
      expect(body.email).toBeNull();
    });

    it("still blocks when a policy explicitly requires auth", async () => {
      const app = createApp({
        defaultAction: "bypass",
        policies: [{ pattern: /^\/api\/test$/, authenticate: true }]
      });

      const res = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Team domain configuration
  // -----------------------------------------------------------------------

  describe("team domain", () => {
    it("returns 401 when team domain is missing and token is not dev-signed", async () => {
      const token = await signDevJwt("alice@example.com", { secret: "unknown-secret" });
      const app = createApp({ devSecret: "other-secret" });

      // Pass an empty env with no CLOUDFLARE_TEAM_DOMAIN.
      const res = await app.fetch(
        new Request(`${BASE}/api/test`, {
          headers: { [JWT_HEADER]: token }
        }),
        {} // no team domain in env
      );

      // Token fails dev verification, then JWKS fails because no domain.
      expect(res.status).toBe(401);
    });
  });
});
