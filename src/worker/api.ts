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
import type { GameInputPayload } from "./types";

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

/**
 * GET /api/game/connect
 *
 * WebSocket upgrade endpoint.  Proxies the upgrade request to the
 * ZoneProcessor Durable Object with the authenticated user's identity
 * passed via headers.
 */
api.get("/game/connect", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade" }, 400);
  }

  const userEmail = c.get("userEmail");
  const userSub = c.get("userSub");

  const stub = c.env.ZONE_PROCESSOR.getByName("demo");
  const proxyRequest = new Request(c.req.url, {
    headers: {
      "Upgrade": "websocket",
      "X-User-Email": userEmail,
      "X-User-Sub": userSub
    }
  });

  return stub.fetch(proxyRequest);
});

/**
 * POST /api/game/input
 *
 * Accepts a game command from the authenticated user and forwards it
 * to the ZoneProcessor for broadcast.
 */
api.post("/game/input", async (c) => {
  const body = await c.req.json<GameInputPayload>();

  if (typeof body.text !== "string" || body.text.length === 0 || body.text.length > 1000) {
    return c.json({ error: "text must be a non-empty string (max 1000 chars)" }, 400);
  }

  const userEmail = c.get("userEmail");
  const stub = c.env.ZONE_PROCESSOR.getByName("demo");
  await stub.processInput(userEmail, body.text);

  return c.json({ ok: true });
});

export { api };
