/**
 * Type definitions for the Cloudflare Access authentication library.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Hono context variables
// ---------------------------------------------------------------------------

/**
 * Variables set on the Hono context by the {@link cloudflareAccess} middleware.
 *
 * Wire this into your Hono generic so handlers can call
 * `c.get("userEmail")` and `c.get("userSub")`.
 *
 * @example
 * ```ts
 * const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
 * ```
 */
export type AuthVariables = {
  /** Authenticated user's email address (from the JWT `email` claim). */
  userEmail: string;
  /** Authenticated user's unique identifier (from the JWT `sub` claim). */
  userSub: string;
};

// ---------------------------------------------------------------------------
// Path policy
// ---------------------------------------------------------------------------

/**
 * A single path-matching rule used by both middleware functions to
 * decide whether a request requires authentication.
 *
 * Policies are evaluated in order; the **first match wins**.
 */
export interface PathPolicy {
  /** Regular expression tested against the request pathname. */
  pattern: RegExp;
  /**
   * `true`  - the matching path requires authentication.
   * `false` - the matching path is public / anonymous.
   */
  authenticate: boolean;
}

// ---------------------------------------------------------------------------
// Developer authentication settings
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link developerAuthentication}.
 *
 * Every property is optional; sensible defaults are provided.
 */
export interface DeveloperAuthSettings {
  /**
   * Path policies evaluated in order (first match wins).
   *
   * When omitted **all** paths require authentication.
   *
   * @example
   * ```ts
   * policies: [
   *   { pattern: /^\/api\/version$/, authenticate: false },
   *   { pattern: /^\/api\//, authenticate: true },
   * ]
   * ```
   */
  policies?: PathPolicy[];

  /** Pathname for the login form (default `"/_auth/login"`). */
  loginPath?: string;

  /** Pathname for the login callback (default `"/_auth/callback"`). */
  callbackPath?: string;

  /**
   * HMAC secret used to sign developer JWTs.
   *
   * Defaults to a well-known key that is **only** safe for local
   * development.  Override this if you need a stable secret across
   * restarts.
   */
  devSecret?: string;

  /** JWT lifetime in seconds (default `86400` / 24 h). */
  tokenLifetime?: number;
}

// ---------------------------------------------------------------------------
// Cloudflare Access settings
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link cloudflareAccess}.
 *
 * Every property is optional; sensible defaults are provided.
 */
export interface CloudflareAccessSettings {
  /**
   * Path policies evaluated in order (first match wins).
   *
   * Typically the **same array** passed to
   * {@link developerAuthentication} so that both middleware agree on
   * which paths are public vs. protected.
   *
   * - `authenticate: false` → bypass JWT validation entirely.
   * - `authenticate: true`  → require a valid JWT (401 if missing).
   * - No matching policy     → behaviour is controlled by
   *   {@link defaultAction}.
   */
  policies?: PathPolicy[];

  /**
   * What to do when the request path does **not** match any policy.
   *
   * - `"block"` (default) — return 401 if no valid JWT is present.
   * - `"bypass"` — allow the request through without authentication.
   *   If a valid JWT *is* present it will still be verified and the
   *   context variables will be set; if not, the request continues
   *   with no user information.
   */
  defaultAction?: "block" | "bypass";

  /**
   * Cloudflare Access team domain used to fetch the public JWKS.
   *
   * When omitted the middleware reads `c.env.CLOUDFLARE_TEAM_DOMAIN` at
   * request time.
   */
  teamDomain?: string;

  /**
   * Application Audience Tag.  When provided the middleware verifies the
   * JWT `aud` claim contains this value.  When omitted audience
   * validation is skipped.
   */
  audience?: string;

  /**
   * HMAC secret for validating developer-generated JWTs.
   *
   * Must match the `devSecret` used by {@link developerAuthentication}.
   * Defaults to the same well-known key.
   */
  devSecret?: string;
}

// ---------------------------------------------------------------------------
// Internal JWT payload shape
// ---------------------------------------------------------------------------

/**
 * Subset of the Cloudflare Access JWT payload that the library cares about.
 *
 * @internal
 */
export interface AccessJwtPayload {
  /** User email. */
  email: string;
  /** Subject (unique user identifier). */
  sub: string;
  /** Issuer URL. */
  iss: string;
  /** Audience (application audience tag). */
  aud?: string | string[];
  /** Issued-at timestamp. */
  iat: number;
  /** Expiry timestamp. */
  exp: number;
  /**
   * Token type.  Cloudflare Access sets this to `"app"`.  The developer
   * middleware sets it to `"dev"` so that {@link cloudflareAccess} can
   * choose the correct verification strategy.
   */
  type?: string;
}
