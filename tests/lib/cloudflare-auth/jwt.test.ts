import { describe, it, expect, vi } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import {
  signDevJwt,
  verifyDevJwt,
  verifyAccessJwt,
  parseCookie,
  buildCookieHeader,
  DEFAULT_DEV_SECRET,
  COOKIE_NAME
} from "@lib/cloudflare-auth";
import { extractClaims } from "@lib/cloudflare-auth/jwt";

// Mock only getRemoteJwks so we can supply a local key set instead of
// hitting a real Cloudflare Access certs endpoint.  The rest of the
// module (e.g. ensureHttps) is preserved via importOriginal.
vi.mock(import("@lib/cloudflare-auth/jwks"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getRemoteJwks: vi.fn() };
});

import { getRemoteJwks, ensureHttps } from "@lib/cloudflare-auth/jwks";

describe("JWT utilities", () => {
  // -----------------------------------------------------------------------
  // signDevJwt + verifyDevJwt
  // -----------------------------------------------------------------------

  describe("signDevJwt / verifyDevJwt", () => {
    it("creates a token that can be verified with the default secret", async () => {
      const token = await signDevJwt("alice@example.com");
      const result = await verifyDevJwt(token);

      expect(result).not.toBeNull();
      expect(result!.email).toBe("alice@example.com");
      expect(result!.sub).toBe("dev-alice@example.com");
    });

    it("creates a token that can be verified with a custom secret", async () => {
      const secret = "my-custom-test-secret";
      const token = await signDevJwt("bob@example.com", { secret });
      const result = await verifyDevJwt(token, secret);

      expect(result).not.toBeNull();
      expect(result!.email).toBe("bob@example.com");
    });

    it("fails verification when the secret does not match", async () => {
      const token = await signDevJwt("alice@example.com", { secret: "secret-a" });
      const result = await verifyDevJwt(token, "secret-b");

      expect(result).toBeNull();
    });

    it("respects a custom token lifetime", async () => {
      // Create a token that already expired (negative lifetime trick:
      // sign with lifetime=0, then verification should fail on exp).
      const token = await signDevJwt("alice@example.com", { lifetime: -1 });
      const result = await verifyDevJwt(token);

      expect(result).toBeNull();
    });

    it("returns null for garbage input", async () => {
      const result = await verifyDevJwt("not-a-jwt");
      expect(result).toBeNull();
    });

    it("returns null for an empty string", async () => {
      const result = await verifyDevJwt("");
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // parseCookie
  // -----------------------------------------------------------------------

  describe("parseCookie", () => {
    it("extracts the CF_Authorization value", () => {
      const header = `${COOKIE_NAME}=abc123; other=xyz`;
      expect(parseCookie(header)).toBe("abc123");
    });

    it("handles the cookie appearing last", () => {
      const header = `other=xyz; ${COOKIE_NAME}=token-value`;
      expect(parseCookie(header)).toBe("token-value");
    });

    it("handles values containing '=' (JWTs)", () => {
      const jwt = "eyJ.eyJ.sig==";
      const header = `${COOKIE_NAME}=${jwt}`;
      expect(parseCookie(header)).toBe(jwt);
    });

    it("returns undefined when the cookie is absent", () => {
      expect(parseCookie("other=xyz; foo=bar")).toBeUndefined();
    });

    it("returns undefined for null input", () => {
      expect(parseCookie(null)).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(parseCookie(undefined)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // buildCookieHeader
  // -----------------------------------------------------------------------

  describe("buildCookieHeader", () => {
    it("includes Secure flag when isSecure is true", () => {
      const header = buildCookieHeader("tok", true);
      expect(header).toContain("Secure");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=Lax");
      expect(header).toContain("Path=/");
      expect(header).toMatch(new RegExp(`^${COOKIE_NAME}=tok`));
    });

    it("omits Secure flag when isSecure is false", () => {
      const header = buildCookieHeader("tok", false);
      expect(header).not.toContain("Secure");
      expect(header).toContain("HttpOnly");
    });
  });

  // -----------------------------------------------------------------------
  // DEFAULT_DEV_SECRET
  // -----------------------------------------------------------------------

  it("exports a non-empty default dev secret", () => {
    expect(DEFAULT_DEV_SECRET).toBeTruthy();
    expect(typeof DEFAULT_DEV_SECRET).toBe("string");
  });

  // -----------------------------------------------------------------------
  // extractClaims
  // -----------------------------------------------------------------------

  describe("extractClaims", () => {
    it("returns email and sub from a valid payload", () => {
      const result = extractClaims({ email: "a@b.com", sub: "u123" });
      expect(result).toEqual({ email: "a@b.com", sub: "u123" });
    });

    it("returns null when email is missing", () => {
      expect(extractClaims({ sub: "u123" })).toBeNull();
    });

    it("returns null when email is not a string", () => {
      expect(extractClaims({ email: 42, sub: "u123" })).toBeNull();
    });

    it("returns null when email is empty", () => {
      expect(extractClaims({ email: "", sub: "u123" })).toBeNull();
    });

    it("returns null when sub is missing", () => {
      expect(extractClaims({ email: "a@b.com" })).toBeNull();
    });

    it("returns null when sub is not a string", () => {
      // Cast required: JWTPayload types `sub` as string, but the
      // runtime guard must handle malformed payloads.
      expect(extractClaims({ email: "a@b.com", sub: 99 as unknown as string })).toBeNull();
    });

    it("returns null when sub is empty", () => {
      expect(extractClaims({ email: "a@b.com", sub: "" })).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // verifyAccessJwt (with mocked JWKS)
  // -----------------------------------------------------------------------

  describe("verifyAccessJwt", () => {
    it("verifies a JWT signed with a key from the remote JWKS", async () => {
      const { publicKey, privateKey } = await generateKeyPair("RS256");
      const publicJwk = await exportJWK(publicKey);
      publicJwk.alg = "RS256";

      // createLocalJWKSet is callable-compatible with createRemoteJWKSet
      // for verification purposes; the cast is safe.
      const localJwks = createLocalJWKSet({ keys: [publicJwk] }) as ReturnType<typeof getRemoteJwks>;
      vi.mocked(getRemoteJwks).mockReturnValue(localJwks);

      const token = await new SignJWT({ email: "access@cloudflare.com", sub: "cf-user-123" })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      const result = await verifyAccessJwt(token, "test.cloudflareaccess.com");

      expect(result).toEqual({ email: "access@cloudflare.com", sub: "cf-user-123" });
      expect(getRemoteJwks).toHaveBeenCalledWith("test.cloudflareaccess.com");
    });

    it("validates the audience claim when provided", async () => {
      const { publicKey, privateKey } = await generateKeyPair("RS256");
      const publicJwk = await exportJWK(publicKey);
      publicJwk.alg = "RS256";

      const localJwks = createLocalJWKSet({ keys: [publicJwk] }) as ReturnType<typeof getRemoteJwks>;
      vi.mocked(getRemoteJwks).mockReturnValue(localJwks);

      const token = await new SignJWT({ email: "a@b.com", sub: "u1" })
        .setProtectedHeader({ alg: "RS256" })
        .setAudience("my-app-aud")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      // Correct audience → success.
      const ok = await verifyAccessJwt(token, "test.cloudflareaccess.com", "my-app-aud");
      expect(ok).toEqual({ email: "a@b.com", sub: "u1" });

      // Wrong audience → null.
      const bad = await verifyAccessJwt(token, "test.cloudflareaccess.com", "wrong-aud");
      expect(bad).toBeNull();
    });

    it("returns null when the signature does not match the JWKS", async () => {
      // Sign with one key pair, provide a different public key to JWKS.
      const { privateKey } = await generateKeyPair("RS256");
      const { publicKey: otherPublic } = await generateKeyPair("RS256");
      const otherJwk = await exportJWK(otherPublic);
      otherJwk.alg = "RS256";

      const localJwks = createLocalJWKSet({ keys: [otherJwk] }) as ReturnType<typeof getRemoteJwks>;
      vi.mocked(getRemoteJwks).mockReturnValue(localJwks);

      const token = await new SignJWT({ email: "a@b.com", sub: "u1" })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      const result = await verifyAccessJwt(token, "test.cloudflareaccess.com");
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // ensureHttps
  // -----------------------------------------------------------------------

  describe("ensureHttps", () => {
    it("returns the URL unchanged when it already starts with https://", () => {
      expect(ensureHttps("https://example.com")).toBe("https://example.com");
    });

    it("prepends https:// when the URL has no scheme", () => {
      expect(ensureHttps("example.com")).toBe("https://example.com");
    });

    it("prepends https:// to an http:// URL (does not replace)", () => {
      expect(ensureHttps("http://example.com")).toBe("https://http://example.com");
    });

    it("handles an empty string", () => {
      expect(ensureHttps("")).toBe("https://");
    });
  });
});
