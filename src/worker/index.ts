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

// Re-export Durable Object classes so the Workers runtime can find them.
export { ZoneProcessor } from "./zone-processor";

/** Root Hono application bound to the Worker `Env`. */
const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

export default app;
