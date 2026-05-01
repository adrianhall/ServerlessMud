/**
 * Developer authentication middleware for Hono.
 *
 * Simulates Cloudflare Access one-time-PIN authentication when the
 * application is running locally (i.e. without real Cloudflare Access
 * headers).  In production the middleware is a transparent no-op.
 *
 * @module
 */

import type { Context, MiddlewareHandler } from "hono";
import type { DeveloperAuthSettings } from "./types";
import {
  signDevJwt,
  buildCookieHeader,
  parseCookie,
  JWT_HEADER,
  EMAIL_HEADER,
  USER_HEADER
} from "./jwt";
import { matchPolicy } from "./policy";
import { renderLoginPage } from "./login-page";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LOGIN_PATH = "/_auth/login";
const DEFAULT_CALLBACK_PATH = "/_auth/callback";

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create a Hono middleware that simulates Cloudflare Access
 * authentication for local development.
 *
 * When the incoming request already contains the `Cf-Access-Jwt-Assertion`
 * header (set by real Cloudflare Access), the middleware does nothing.
 *
 * Otherwise it drives an interactive email-based login flow:
 *
 * 1. Un-authenticated requests to protected paths are redirected to a
 *    login form.
 * 2. The login form posts the email to a callback endpoint which
 *    generates a signed JWT, sets the `CF_Authorization` cookie, and
 *    redirects back to the original URL.
 * 3. Subsequent requests carry the cookie.  The middleware reads it and
 *    injects the standard `Cf-Access-*` headers so that downstream
 *    middleware (e.g. {@link cloudflareAccess}) can process them
 *    uniformly.
 */
export function developerAuthentication(settings?: DeveloperAuthSettings): MiddlewareHandler {
  const loginPath = settings?.loginPath ?? DEFAULT_LOGIN_PATH;
  const callbackPath = settings?.callbackPath ?? DEFAULT_CALLBACK_PATH;
  const policies = settings?.policies;
  const devSecret = settings?.devSecret;
  const tokenLifetime = settings?.tokenLifetime;

  return async (c, next) => {
    // -----------------------------------------------------------------
    // 1.  Real Cloudflare Access headers present  →  no-op.
    // -----------------------------------------------------------------
    if (c.req.header(JWT_HEADER)) {
      console.info("[dev-auth] Cloudflare Access headers detected – skipping developer auth");
      return next();
    }

    const pathname = new URL(c.req.url).pathname;

    // -----------------------------------------------------------------
    // 2.  Path is public according to policies  →  pass through.
    // -----------------------------------------------------------------
    if (policies && matchPolicy(pathname, policies) === false) {
      console.info(`[dev-auth] Path "${pathname}" is public – skipping auth`);
      return next();
    }

    // -----------------------------------------------------------------
    // 3.  Serve login form.
    // -----------------------------------------------------------------
    if (pathname === loginPath && c.req.method === "GET") {
      console.info("[dev-auth] Serving login page");
      const redirect = defaultTo(new URL(c.req.url).searchParams.get("redirect"), "/");
      return c.html(renderLoginPage(callbackPath, redirect));
    }

    // -----------------------------------------------------------------
    // 4.  Process login callback.
    // -----------------------------------------------------------------
    if (pathname === callbackPath && c.req.method === "POST") {
      return handleCallback(c, { loginPath, devSecret, tokenLifetime });
    }

    // -----------------------------------------------------------------
    // 5.  Cookie present  →  inject headers and continue.
    // -----------------------------------------------------------------
    const token = parseCookie(c.req.header("cookie"));
    if (token) {
      return forwardWithHeaders(c, token, next);
    }

    // -----------------------------------------------------------------
    // 6.  No auth at all  →  redirect to login.
    // -----------------------------------------------------------------
    const redirectTarget = `${loginPath}?redirect=${encodeURIComponent(pathname)}`;
    console.info(`[dev-auth] No auth found – redirecting to ${redirectTarget}`);
    return c.redirect(redirectTarget, 302);
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Handle the `POST /_auth/callback` form submission.
 *
 * Reads the `email` field, generates a developer JWT, sets the cookie,
 * and redirects to the URL the user originally requested.
 */
export async function handleCallback(
  c: Context,
  opts: { loginPath: string; devSecret?: string; tokenLifetime?: number }
): Promise<Response> {
  let email: string | undefined;
  let redirect = "/";

  try {
    const body = await c.req.parseBody();
    email = typeof body.email === "string" ? body.email.trim() : undefined;
    redirect = typeof body.redirect === "string" ? body.redirect : "/";
  } catch (err) {
    console.error("[dev-auth] Failed to parse callback body", err);
  }

  if (!email) {
    console.warn("[dev-auth] Callback received without a valid email");
    return c.html(renderLoginPage(opts.loginPath, redirect, "A valid email address is required."));
  }

  console.info(`[dev-auth] Issuing developer token for ${email}`);

  const token = await signDevJwt(email, {
    secret: opts.devSecret,
    lifetime: opts.tokenLifetime
  });

  const isSecure = new URL(c.req.url).protocol === "https:";
  const cookie = buildCookieHeader(token, isSecure);

  c.header("Set-Cookie", cookie);
  return c.redirect(redirect, 302);
}

/**
 * Inject Cloudflare-Access-style headers derived from the cookie JWT
 * and forward the request to the next middleware.
 *
 * The headers are added to the *incoming* `Request` object so that
 * downstream middleware (particularly {@link cloudflareAccess}) sees
 * them as if Cloudflare Access had set them.
 */
export async function forwardWithHeaders(
  c: Context,
  token: string,
  next: () => Promise<void>
): Promise<void | Response> {
  // We intentionally do NOT validate the JWT here — that is the
  // responsibility of the cloudflareAccess middleware.  We simply
  // decode the payload to extract the email and sub for the header
  // values.
  const parts = token.split(".");
  if (parts.length !== 3) {
    console.warn("[dev-auth] Malformed JWT in cookie – ignoring");
    return next();
  }

  try {
    const payload = JSON.parse(atob(parts[1]));
    const email: string = defaultTo(payload.email, "");
    const sub: string = defaultTo(payload.sub, "");

    // Incoming request headers are immutable in the Workers runtime,
    // so clone the request with the additional headers.
    const headers = new Headers(c.req.raw.headers);
    headers.set(JWT_HEADER, token);
    headers.set(EMAIL_HEADER, email);
    headers.set(USER_HEADER, sub);
    c.req.raw = new Request(c.req.raw, { headers });

    console.info(`[dev-auth] Injected headers for ${email}`);
  } catch (err) {
    console.warn("[dev-auth] Failed to decode JWT payload from cookie", err);
  }

  return next();
}

/**
 * Converts a potentially undefined or null value to a default.
 * @param value the value to test
 * @param defaultValue the default value to return if the input value is undefined or null
 * @returns the defined value or the default value
 */
export function defaultTo<T>(value: T | undefined | null, defaultValue: T) {
  return value ?? defaultValue;
}
