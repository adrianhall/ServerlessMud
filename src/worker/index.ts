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

/** Root Hono application bound to the Worker `Env`. */
const app = new Hono<{ Bindings: Env }>();

/** Sub-router mounted at `/api`. */
const api = new Hono<{ Bindings: Env }>();

/**
 * GET /api/
 *
 * Returns basic application metadata.
 */
api.get("/version", (c) => {
  return c.json({ name: "ServerlessMud", version: "0.0.1" });
});

/**
 * GET /api/health
 *
 * Lightweight health-check endpoint.
 */
api.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api", api);

export default app;
