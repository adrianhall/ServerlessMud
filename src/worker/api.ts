/**
 * API route definitions.
 *
 * Exports a Hono sub-router that is mounted at `/api` by the Worker
 * entry point.
 *
 * @module
 */

import { Hono } from "hono";
import type { AuthVariables } from "@lib/cloudflare-auth";

/** Sub-router mounted at `/api`. */
const api = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /api/version
 *
 * Returns basic application metadata.
 */
api.get("/version", (c) => {
  return c.json({ name: "ServerlessMud", version: "0.0.1" });
});

/**
 * GET /api/me
 *
 * Returns the authenticated user's email and unique identifier.
 */
api.get("/me", (c) => {
  return c.json({ email: c.get("userEmail"), id: c.get("userSub") });
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
