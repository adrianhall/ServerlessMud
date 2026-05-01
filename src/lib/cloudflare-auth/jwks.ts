/**
 * Remote JWKS management for Cloudflare Access JWT verification.
 *
 * Extracted into its own module so that tests can mock
 * {@link getRemoteJwks} and supply a local key set instead of hitting
 * the real Cloudflare Access certs endpoint.
 *
 * @module
 */

import { createRemoteJWKSet } from "jose";

/** Remote JWKS cache keyed by team-domain URL. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Return (or create-and-cache) a remote JWKS function for the given
 * Cloudflare Access team domain.
 */
export function getRemoteJwks(teamDomain: string) {
  // Normalise: strip trailing slash, ensure https prefix.
  const base = teamDomain.replace(/\/+$/, "");
  const url = ensureHttps(base);
  const certsUrl = new URL(`${url}/cdn-cgi/access/certs`);

  let jwks = jwksCache.get(certsUrl.href);
  if (!jwks) {
    jwks = createRemoteJWKSet(certsUrl);
    jwksCache.set(certsUrl.href, jwks);
  }
  return jwks;
}

/**
 * Ensures the base URL for the JWKS endpoint is HTTPS.
 * @param url the base URL to check
 * @returns the modified base URL.
 */
export function ensureHttps(url: string) {
  return url.startsWith("https://") ? url : "https://" + url;
}
