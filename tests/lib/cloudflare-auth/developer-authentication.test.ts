import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  developerAuthentication,
  signDevJwt,
  buildCookieHeader,
  JWT_HEADER,
  EMAIL_HEADER,
  USER_HEADER,
  COOKIE_NAME,
  type AuthVariables
} from "@lib/cloudflare-auth";
import {
  handleCallback,
  forwardWithHeaders,
  defaultTo
} from "@lib/cloudflare-auth/developer-authentication";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "http://localhost";

/** Create a minimal Hono app with the dev auth middleware and a test route. */
function createApp(settings?: Parameters<typeof developerAuthentication>[0]) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use(developerAuthentication(settings));

  // Echo route — returns whatever headers the middleware injected.
  app.get("/api/test", (c) => {
    return c.json({
      jwtHeader: c.req.header(JWT_HEADER) ?? null,
      emailHeader: c.req.header(EMAIL_HEADER) ?? null,
      userHeader: c.req.header(USER_HEADER) ?? null
    });
  });

  // Simple body route.
  app.get("/public", (c) => c.text("public"));

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("developerAuthentication middleware", () => {
  // -----------------------------------------------------------------------
  // No-op when Cloudflare Access headers are present
  // -----------------------------------------------------------------------

  describe("production (CF Access headers present)", () => {
    it("passes through when Cf-Access-Jwt-Assertion header exists", async () => {
      const app = createApp();
      const res = await app.request(`${BASE}/api/test`, {
        headers: { [JWT_HEADER]: "real-token" }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, string | null>;
      // The middleware should NOT overwrite the existing header.
      expect(body.jwtHeader).toBe("real-token");
    });
  });

  // -----------------------------------------------------------------------
  // Path policies
  // -----------------------------------------------------------------------

  describe("path policies", () => {
    it("skips auth for paths marked as public", async () => {
      const app = createApp({
        policies: [
          { pattern: /^\/public$/, authenticate: false },
          { pattern: /^\/api\//, authenticate: true }
        ]
      });

      const res = await app.request(`${BASE}/public`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("public");
    });

    it("requires auth by default when no policy matches", async () => {
      const app = createApp({
        policies: [{ pattern: /^\/known$/, authenticate: false }]
      });

      // /api/test does not match any policy → default is "require auth".
      const res = await app.request(`${BASE}/api/test`);
      // Should redirect to login.
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/_auth/login");
    });

    it("requires auth when no policies are configured at all", async () => {
      const app = createApp(); // no policies
      const res = await app.request(`${BASE}/api/test`);
      expect(res.status).toBe(302);
    });
  });

  // -----------------------------------------------------------------------
  // Login form
  // -----------------------------------------------------------------------

  describe("login form", () => {
    it("serves an HTML login page at the default login path", async () => {
      const app = createApp();
      const res = await app.request(`${BASE}/_auth/login?redirect=/api/test`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("Developer Login");
      expect(html).toContain("/_auth/callback");
    });

    it("serves a login page at a custom login path", async () => {
      const app = createApp({ loginPath: "/my-login" });
      // The redirect should point to the custom path.
      const res = await app.request(`${BASE}/my-login?redirect=/`);

      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Developer Login");
    });
  });

  // -----------------------------------------------------------------------
  // Login callback
  // -----------------------------------------------------------------------

  describe("login callback", () => {
    it("sets CF_Authorization cookie and redirects on valid email", async () => {
      const app = createApp();
      const body = new URLSearchParams({ email: "test@example.com", redirect: "/api/test" });

      const res = await app.request(`${BASE}/_auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/api/test");

      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(COOKIE_NAME);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
    });

    it("re-renders login form when email is missing", async () => {
      const app = createApp();
      const body = new URLSearchParams({ redirect: "/" });

      const res = await app.request(`${BASE}/_auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("valid email");
    });

    it("defaults redirect to '/' when not provided", async () => {
      const app = createApp();
      const body = new URLSearchParams({ email: "x@y.com" });

      const res = await app.request(`${BASE}/_auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });
  });

  // -----------------------------------------------------------------------
  // Cookie-based header injection
  // -----------------------------------------------------------------------

  describe("cookie → header injection", () => {
    it("injects CF Access headers when the cookie carries a valid JWT", async () => {
      const token = await signDevJwt("injected@example.com");
      const app = createApp();

      const res = await app.request(`${BASE}/api/test`, {
        headers: { Cookie: buildCookieHeader(token, false) }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, string | null>;
      expect(body.jwtHeader).toBe(token);
      expect(body.emailHeader).toBe("injected@example.com");
      expect(body.userHeader).toBe("dev-injected@example.com");
    });

    it("passes through without headers when cookie JWT is malformed", async () => {
      const app = createApp();
      app.get("/api/fallback", (c) => c.text("ok"));

      const res = await app.request(`${BASE}/api/test`, {
        headers: { Cookie: `${COOKIE_NAME}=not-a-jwt` }
      });

      // The middleware should still call next() — the downstream
      // cloudflareAccess middleware will reject the bad token.
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Redirect for unauthenticated requests
  // -----------------------------------------------------------------------

  describe("unauthenticated redirect", () => {
    it("redirects to the login page with the original path", async () => {
      const app = createApp();
      const res = await app.request(`${BASE}/api/test`);

      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/_auth/login");
      expect(location).toContain(encodeURIComponent("/api/test"));
    });
  });

  // -----------------------------------------------------------------------
  // handleCallback – error paths
  // -----------------------------------------------------------------------

  describe("handleCallback (direct)", () => {
    it("re-renders login form when parseBody throws", async () => {
      // Wrap the exported function in a tiny Hono route so we get a
      // real Context object.
      const app = new Hono();
      app.post("/cb", (c) => handleCallback(c, { loginPath: "/_auth/login" }));

      // A malformed multipart body triggers a parse error inside Hono.
      const res = await app.request(`${BASE}/cb`, {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=---" },
        body: "this is not valid multipart"
      });

      // The catch falls through to the "no email" branch → login page.
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("valid email");
    });
  });

  // -----------------------------------------------------------------------
  // forwardWithHeaders – error paths
  // -----------------------------------------------------------------------

  describe("forwardWithHeaders (direct)", () => {
    it("calls next when the JWT payload is not valid base64", async () => {
      const app = new Hono();

      // Expose forwardWithHeaders behind a route so we get a Context.
      app.get("/test", async (c) => {
        let nextCalled = false;
        await forwardWithHeaders(c, "aaa.not-valid-base64.ccc", async () => {
          nextCalled = true;
        });
        // If next() was called the response is controlled by us.
        return c.json({ nextCalled });
      });

      const res = await app.request(`${BASE}/test`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { nextCalled: boolean };
      expect(body.nextCalled).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // defaultTo
  // -----------------------------------------------------------------------

  describe("defaultTo", () => {
    it("returns the value when it is defined", () => {
      expect(defaultTo("hello", "fallback")).toBe("hello");
    });

    it("returns the default when the value is undefined", () => {
      expect(defaultTo(undefined, "fallback")).toBe("fallback");
    });

    it("returns the default when the value is null", () => {
      expect(defaultTo(null, "fallback")).toBe("fallback");
    });

    it("preserves falsy values that are not null/undefined", () => {
      expect(defaultTo("", "fallback")).toBe("");
      expect(defaultTo(0, 42)).toBe(0);
      expect(defaultTo(false, true)).toBe(false);
    });
  });
});
