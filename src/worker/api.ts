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
import { ACTIVE_ZONE_DO_NAME } from "./game-constants";
import { parseMovementCommand } from "./directions";
import type { GameInputPayload } from "./types";
import {
  findCharacterForUser,
  playerCharactersApi,
  updateCharacterLastUsed
} from "./player-characters-api";

/** Sub-router mounted at `/api`. */
const api = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

api.route("/player-characters", playerCharactersApi);

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
 * Durable Object instance for the active zone.
 */
api.get("/health", async (c) => {
  const stub = c.env.ZONE_PROCESSOR.getByName(ACTIVE_ZONE_DO_NAME);
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
  const characterName = c.req.query("characterName")?.trim() ?? "";

  if (!characterName) {
    return c.json({ error: "characterName is required" }, 400);
  }

  const character = await findCharacterForUser(c.env.MAP, userEmail, characterName);
  if (!character) {
    return c.json({ error: "Character not found" }, 404);
  }

  await updateCharacterLastUsed(c.env.MAP, userEmail, character.name, new Date().toISOString());

  const stub = c.env.ZONE_PROCESSOR.getByName(ACTIVE_ZONE_DO_NAME);
  const proxyRequest = new Request(c.req.url, {
    headers: {
      "Upgrade": "websocket",
      "X-User-Email": userEmail,
      "X-User-Sub": userSub,
      "X-Character-Name": character.name
    }
  });

  return stub.fetch(proxyRequest);
});

/**
 * GET /api/game/rooms/:roomId
 *
 * Returns static room details and currently connected players for a room
 * in the active zone.
 */
api.get("/game/rooms/:roomId", async (c) => {
  const roomIdParam = c.req.param("roomId");
  if (!/^\d+$/.test(roomIdParam)) {
    return c.json({ error: "roomId must be a number" }, 400);
  }

  const roomId = Number(roomIdParam);
  const stub = c.env.ZONE_PROCESSOR.getByName(ACTIVE_ZONE_DO_NAME);
  const room = await stub.getRoomInfo(c.get("userEmail"), roomId);

  if (!room) {
    return c.json({ error: "Room not found" }, 404);
  }

  return c.json(room);
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
  const stub = c.env.ZONE_PROCESSOR.getByName(ACTIVE_ZONE_DO_NAME);
  const direction = parseMovementCommand(body.text);

  if (direction) {
    await stub.moveRoom(userEmail, direction);
  } else {
    await stub.processInput(userEmail, body.text);
  }

  return c.json({ ok: true });
});

export { api };
