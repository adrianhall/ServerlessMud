/**
 * JWT helpers for the Cloudflare Access authentication library.
 *
 * Uses `jose` v6 for all cryptographic operations.
 *
 * @module
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AccessJwtPayload } from "./types";
import { getRemoteJwks } from "./jwks";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Well-known HMAC secret used by default for signing and verifying
 * developer-generated JWTs.
 *
 * **This is NOT a real secret.**  It only protects the local-dev login
 * flow running on `localhost` and must never be relied on for production
 * security.
 */
export const DEFAULT_DEV_SECRET = "cloudflare-access-dev-secret-do-not-use-in-production";

/** Algorithm used for developer-signed JWTs. */
const DEV_ALG = "HS256";

/** Name of the cookie that stores the JWT. */
export const COOKIE_NAME = "CF_Authorization";

/** Header containing the JWT (set by Cloudflare Access). */
export const JWT_HEADER = "cf-access-jwt-assertion";

/** Header containing the authenticated user's email. */
export const EMAIL_HEADER = "cf-access-authenticated-user-email";

/** Header containing the authenticated user's unique ID. */
export const USER_HEADER = "cf-access-user";

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/** Encode a string secret into a `CryptoKey`-compatible `Uint8Array`. */
function secretToBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Sign (developer mode only)
// ---------------------------------------------------------------------------

/**
 * Create a signed JWT that mimics a Cloudflare Access token.
 *
 * The `type` claim is set to `"dev"` so that the verification layer can
 * distinguish locally-issued tokens from real Access tokens.
 */
export async function signDevJwt(
  email: string,
  options: { secret?: string; lifetime?: number } = {}
): Promise<string> {
  const secret = options.secret ?? DEFAULT_DEV_SECRET;
  const lifetime = options.lifetime ?? 86_400; // 24 h

  const now = Math.floor(Date.now() / 1000);
  const sub = `dev-${email}`;

  return new SignJWT({
    email,
    sub,
    type: "dev",
    iss: "dev-authentication"
  } satisfies Omit<AccessJwtPayload, "iat" | "exp">)
    .setProtectedHeader({ alg: DEV_ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + lifetime)
    .sign(secretToBytes(secret));
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/** Result of a successful JWT verification. */
export interface VerifiedToken {
  email: string;
  sub: string;
}

/**
 * Attempt to verify a JWT as a developer-signed token.
 *
 * Returns `null` if verification fails (wrong key, expired, missing
 * claims, etc.)  — the caller can then fall back to Cloudflare JWKS
 * verification.
 */
export async function verifyDevJwt(
  token: string,
  secret: string = DEFAULT_DEV_SECRET
): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, secretToBytes(secret), {
      algorithms: [DEV_ALG]
    });
    return extractClaims(payload);
  } catch {
    return null;
  }
}

/**
 * Verify a JWT against Cloudflare Access's remote JWKS endpoint.
 *
 * When `audience` is provided the `aud` claim is also verified.
 */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  audience?: string
): Promise<VerifiedToken | null> {
  try {
    const jwks = getRemoteJwks(teamDomain);
    const { payload } = await jwtVerify(token, jwks, {
      audience: audience ?? undefined
    });
    return extractClaims(payload);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pull the required claims out of a verified payload. */
export function extractClaims(payload: JWTPayload): VerifiedToken | null {
  const email = payload.email;
  const sub = payload.sub;

  if (typeof email !== "string" || !email) {
    return null;
  }
  if (typeof sub !== "string" || !sub) {
    return null;
  }

  return { email, sub };
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Build a `Set-Cookie` header value for the authorisation cookie.
 *
 * Mirrors the attributes used by Cloudflare Access:
 *   `HttpOnly; Secure; SameSite=Lax; Path=/`
 *
 * For local dev over plain HTTP the `Secure` flag is omitted when the
 * request was made to `localhost` or `127.0.0.1`.
 */
export function buildCookieHeader(token: string, isSecure: boolean): string {
  const parts = [`${COOKIE_NAME}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/"];
  if (isSecure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Parse the value of the `CF_Authorization` cookie from a `Cookie`
 * header string.  Returns `undefined` when the cookie is absent.
 */
export function parseCookie(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(";")) {
    const [name, ...rest] = pair.split("=");
    if (name.trim() === COOKIE_NAME) {
      return rest.join("=").trim();
    }
  }
  return undefined;
}
