/**
 * API route definitions.
 *
 * Exports a Hono sub-router that is mounted at `/api` by the Worker
 * entry point.
 *
 * @module
 */

import { Hono } from "hono";

/** Sub-router mounted at `/api`. */
const api = new Hono<{ Bindings: Env }>();

/**
 * GET /api/version
 *
 * Returns basic application metadata.
 */
api.get("/version", (c) => {
  return c.json({ name: "ServerlessMud", version: "0.0.1" });
});

/**
 * GET /api/health
 *
 * Lightweight health-check endpoint.  Delegates to the ZoneProcessor
 * Durable Object instance named "demo".
 */
api.get("/health", async (c) => {
  const stub = c.env.ZONE_PROCESSOR.getByName("demo");
  const health = await stub.getHealth();
  return c.json(health);
});

export { api };
