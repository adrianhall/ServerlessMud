import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
  developerAuthentication,
  cloudflareAccess,
  signDevJwt,
  COOKIE_NAME,
  JWT_HEADER,
  type AuthVariables,
  type PathPolicy,
  type Logger
} from "@lib/cloudflare-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "http://localhost";

/** Silent logger that suppresses all output during tests. */
const silentLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const MOCK_ENV = {
  CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com"
};

/** Shared policies used by both middleware — mirrors production wiring. */
const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
];

/** Build a full app with both middleware, matching production wiring. */
function createApp() {
  const app = new Hono<{ Bindings: typeof MOCK_ENV; Variables: AuthVariables }>();

  app.use(developerAuthentication({ policies: authPolicies, logger: silentLogger }));
  app.use(cloudflareAccess({ policies: authPolicies, logger: silentLogger }));

  app.get("/api/version", (c) => c.json({ version: "1.0" }));
  app.get("/api/me", (c) =>
    c.json({ email: c.get("userEmail"), sub: c.get("userSub") })
  );

  return app;
}

function fetchWithEnv(app: ReturnType<typeof createApp>, url: string, init?: RequestInit) {
  return app.fetch(new Request(url, init), MOCK_ENV);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auth integration (both middleware together)", () => {
  it("allows anonymous access to public endpoints", async () => {
    const app = createApp();
    const res = await fetchWithEnv(app, `${BASE}/api/version`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string };
    expect(body.version).toBe("1.0");
  });

  it("redirects unauthenticated requests to the login page", async () => {
    const app = createApp();
    const res = await fetchWithEnv(app, `${BASE}/api/me`);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/_auth/login");
  });

  it("completes the full login flow: callback → cookie → authenticated request", async () => {
    const app = createApp();

    // Step 1: POST to the callback to simulate form submission.
    const callbackBody = new URLSearchParams({
      email: "player@example.com",
      redirect: "/api/me"
    });

    const callbackRes = await fetchWithEnv(app, `${BASE}/_auth/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: callbackBody.toString()
    });

    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.get("location")).toBe("/api/me");

    // Extract the cookie from the Set-Cookie header.
    const setCookie = callbackRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(COOKIE_NAME);

    // Parse just the cookie value.
    const cookieValue = setCookie.split(";")[0]; // "CF_Authorization=<token>"

    // Step 2: Make the authenticated request with the cookie.
    const authedRes = await fetchWithEnv(app, `${BASE}/api/me`, {
      headers: { Cookie: cookieValue }
    });

    expect(authedRes.status).toBe(200);
    const body = (await authedRes.json()) as { email: string; sub: string };
    expect(body.email).toBe("player@example.com");
    expect(body.sub).toBe("dev-player@example.com");
  });

  it("passes through when real Cloudflare Access headers are present", async () => {
    const app = createApp();
    // Generate a dev token to simulate "real" Access headers.
    const token = await signDevJwt("prod-user@cloudflare.com");

    const res = await fetchWithEnv(app, `${BASE}/api/me`, {
      headers: { [JWT_HEADER]: token }
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; sub: string };
    expect(body.email).toBe("prod-user@cloudflare.com");
  });

  it("works with bypass defaultAction for unmatched paths", async () => {
    const app = new Hono<{ Bindings: typeof MOCK_ENV; Variables: AuthVariables }>();

    // When using bypass, the policies must agree across both middleware:
    // paths that cloudflareAccess will bypass should be public in
    // developerAuthentication too, otherwise the dev middleware redirects
    // before cloudflareAccess ever runs.
    const policies: PathPolicy[] = [
      { pattern: /^\/api\/secret$/, authenticate: true },
      { pattern: /^\/api\//, authenticate: false } // open by default
    ];

    app.use(developerAuthentication({ policies, logger: silentLogger }));
    app.use(cloudflareAccess({ policies, defaultAction: "bypass", logger: silentLogger }));

    app.get("/api/open", (c) =>
      c.json({ email: c.get("userEmail") ?? null })
    );
    app.get("/api/secret", (c) =>
      c.json({ email: c.get("userEmail") })
    );

    // /api/open matches the catch-all public rule → both middleware skip.
    const openRes = await app.fetch(new Request(`${BASE}/api/open`), MOCK_ENV);
    expect(openRes.status).toBe(200);
    const openBody = (await openRes.json()) as { email: string | null };
    expect(openBody.email).toBeNull();

    // /api/secret is explicitly protected → 302 redirect from dev middleware.
    const secretRes = await app.fetch(new Request(`${BASE}/api/secret`), MOCK_ENV);
    expect(secretRes.status).toBe(302);
  });
});
