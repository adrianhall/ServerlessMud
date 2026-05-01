/**
 * Worker entry point.
 *
 * Sets up a Hono application that serves the `/api` route tree.  All
 * non-asset, non-navigation requests are forwarded here by the Workers
 * static-asset router (see `wrangler.jsonc`).
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

// Re-export Durable Object classes so the Workers runtime can find them.
export { ZoneProcessor } from "./zone-processor";

/**
 * Shared path policies used by both authentication middleware.
 *
 * Rules are evaluated in order — first match wins.
 */
const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\/health$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
];

/** Root Hono application bound to the Worker `Env`. */
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Developer authentication simulates Cloudflare Access when running
// locally.  In production (behind real Access) it is a transparent no-op.
app.use(developerAuthentication({ policies: authPolicies }));

// Cloudflare Access middleware validates the JWT (real or dev-generated)
// and sets `userEmail` / `userSub` on the Hono context.
app.use(cloudflareAccess({ policies: authPolicies }));

app.route("/api", api);

export default app;
