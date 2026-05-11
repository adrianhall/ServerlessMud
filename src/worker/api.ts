/**
 * API route definitions.
 *
 * Exports a Hono sub-router that is mounted at `/api` by the Worker
 * entry point.
 *
 * @module
 */

import { Hono } from "hono";
import type { AuthVariables } from "@adrianhall/cloudflare-auth";
import {
  ACTIVE_ZONE_DO_NAME,
  ACTIVE_ZONE_ID,
  START_ROOM_VNUM,
  zoneProcessorName
} from "./game-constants";
import { DIRECTIONS, parseMovementCommand, type Direction } from "./directions";
import type { GameInputPayload } from "./types";
import {
  findCharacterForUser,
  playerCharactersApi,
  updateCharacterLastUsed
} from "./player-characters-api";

/** Sub-router mounted at `/api`. */
const api = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

interface RoomZoneLookupRow {
  zoneId: number;
}

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
  const zoneId = parsePositiveIntegerQuery(c.req.query("zoneId"), ACTIVE_ZONE_ID);
  const roomId = parsePositiveIntegerQuery(c.req.query("roomId"), START_ROOM_VNUM);
  const fromRoomId = parseNullablePositiveIntegerQuery(c.req.query("fromRoomId"));
  const direction = parseDirectionQuery(c.req.query("direction"));
  const transferMode = parseTransferModeQuery(c.req.query("mode"));

  if (zoneId === null) {
    return c.json({ error: "zoneId must be a positive integer" }, 400);
  }

  if (roomId === null) {
    return c.json({ error: "roomId must be a positive integer" }, 400);
  }

  if (fromRoomId === undefined) {
    return c.json({ error: "fromRoomId must be a positive integer" }, 400);
  }

  if (direction === undefined) {
    return c.json({ error: "direction is invalid" }, 400);
  }

  if (transferMode === undefined) {
    return c.json({ error: "mode is invalid" }, 400);
  }

  if (!characterName) {
    return c.json({ error: "characterName is required" }, 400);
  }

  const character = await findCharacterForUser(c.env.MAP, userEmail, characterName);
  if (!character) {
    return c.json({ error: "Character not found" }, 404);
  }

  const roomZone = await findRoomZone(c.env.MAP, roomId);
  if (!roomZone || roomZone.zoneId !== zoneId) {
    return c.json({ error: "Room not found" }, 404);
  }

  await updateCharacterLastUsed(c.env.MAP, userEmail, character.name, new Date().toISOString());

  const stub = c.env.ZONE_PROCESSOR.getByName(zoneProcessorName(zoneId));
  const headers: Record<string, string> = {
    "Upgrade": "websocket",
    "X-User-Email": userEmail,
    "X-User-Sub": userSub,
    "X-Character-Name": character.name,
    "X-Zone-Id": String(zoneId),
    "X-Start-Room": String(roomId)
  };

  if (c.req.query("zoneId") !== undefined || c.req.query("roomId") !== undefined) {
    if (fromRoomId !== null) headers["X-Transfer-From-Room"] = String(fromRoomId);
    if (direction !== null) headers["X-Transfer-Direction"] = direction;
    if (transferMode !== null) headers["X-Transfer-Mode"] = transferMode;
  }

  const proxyRequest = new Request(c.req.url, {
    headers
  });

  return stub.fetch(proxyRequest);
});

/**
 * GET /api/game/rooms/:roomId
 *
 * Returns static room details and currently connected players for a room
 * from the zone that owns that room.
 */
api.get("/game/rooms/:roomId", async (c) => {
  const roomIdParam = c.req.param("roomId");
  if (!/^\d+$/.test(roomIdParam)) {
    return c.json({ error: "roomId must be a number" }, 400);
  }

  const roomId = Number(roomIdParam);
  const roomZone = await findRoomZone(c.env.MAP, roomId);
  if (!roomZone) {
    return c.json({ error: "Room not found" }, 404);
  }

  const stub = c.env.ZONE_PROCESSOR.getByName(zoneProcessorName(roomZone.zoneId));
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
  const zoneId = parsePositiveIntegerBody(body.zoneId, ACTIVE_ZONE_ID);
  if (zoneId === null) {
    return c.json({ error: "zoneId must be a positive integer" }, 400);
  }

  const stub = c.env.ZONE_PROCESSOR.getByName(zoneProcessorName(zoneId));
  const direction = parseMovementCommand(body.text);

  if (direction) {
    await stub.moveRoom(userEmail, direction);
  } else {
    await stub.processInput(userEmail, body.text);
  }

  return c.json({ ok: true });
});

export { api };

async function findRoomZone(map: D1Database, roomId: number): Promise<RoomZoneLookupRow | null> {
  return await map
    .prepare(
      `SELECT zone_id AS zoneId
       FROM rooms
       WHERE rooms.vnum = ?`
    )
    .bind(roomId)
    .first<RoomZoneLookupRow>();
}

function parsePositiveIntegerQuery(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

function parseNullablePositiveIntegerQuery(value: string | undefined): number | null | undefined {
  if (value === undefined) return null;
  if (!/^\d+$/.test(value)) return undefined;

  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

function parsePositiveIntegerBody(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parseDirectionQuery(value: string | undefined): Direction | null | undefined {
  if (value === undefined) return null;

  const normalized = value.toUpperCase() as Direction;
  return DIRECTIONS.includes(normalized) ? normalized : undefined;
}

function parseTransferModeQuery(value: string | undefined): "teleport" | null | undefined {
  if (value === undefined) return null;
  return value === "teleport" ? "teleport" : undefined;
}
