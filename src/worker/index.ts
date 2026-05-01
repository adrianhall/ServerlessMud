/**
 * Worker entry point.
 *
 * Every request hits the Worker first (`run_worker_first: true` in
 * `wrangler.jsonc`).  Authentication middleware runs on all paths,
 * API routes are handled by Hono, and everything else falls through
 * to the static-asset binding.
 *
 * @module
 */

import { Hono } from "hono";
import { api } from "./api";
import {
  developerAuthentication,
  cloudflareAccess,
  type AuthVariables,
  type PathPolicy
} from "@lib/cloudflare-auth";
import { createLogger } from "@lib/cloudflare-logging";

// Re-export Durable Object classes so the Workers runtime can find them.
export { ZoneProcessor } from "./zone-processor";

/**
 * Shared path policies used by both authentication middleware.
 *
 * Rules are evaluated in order — first match wins.
 */
const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
];

/** Root Hono application bound to the Worker `Env`. */
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Developer authentication simulates Cloudflare Access when running
// locally.  In production (behind real Access) it is a transparent no-op.
const devAuthLogger = createLogger("dev-auth", { minLogLevel: "warn" });
app.use(developerAuthentication({ policies: authPolicies, logger: devAuthLogger }));

// Cloudflare Access middleware validates the JWT (real or dev-generated)
// and sets `userEmail` / `userSub` on the Hono context.
const accessLogger = createLogger("cf-access");
app.use(cloudflareAccess({ policies: authPolicies, logger: accessLogger }));

app.route("/api", api);

// Catch-all: after auth middleware and API routes, serve static assets
// (the React SPA) via the ASSETS binding.  Note that this cannot be
// checked in coverage since c.env.ASSETS is not callable in unit tests.
/* istanbul ignore next -- @preserve */
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
