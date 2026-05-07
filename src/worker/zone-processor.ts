/**
 * ZoneProcessor Durable Object.
 *
 * Manages a single game zone, providing health status and (eventually)
 * zone-specific game logic such as NPC ticks, environment updates, etc.
 *
 * @module
 */

import { DurableObject } from "cloudflare:workers";
import { createLogger } from "@lib/cloudflare-logging";
import { ACTIVE_ZONE_ID, START_ROOM_VNUM } from "./game-constants";
import { DIRECTIONS, type Direction, oppositeDirection } from "./directions";
import type { GameMessage, RoomInfo, WebSocketAttachment } from "./types";
import { CommunicationHandler, type ConnectionLifecycleResult } from "./communication";

interface ExitTargetRow {
  targetRoom: number;
}

interface RoomZoneRow {
  zoneId: number;
  zoneName: string | null;
}

type MovementMode = "teleport";

interface EnterGameOptions {
  roomVnum?: number;
  zoneId?: number;
  transferDirection?: Direction | null;
  transferFromRoom?: number | null;
  transferMode?: MovementMode | null;
}

interface RoomRow {
  vnum: number;
  zoneId: number;
  name: string;
  description: string;
}

interface RoomExitRow {
  direction: string;
  description: string;
  targetRoom: number;
  doorType: number;
}

const UNKNOWN_COMMAND_MESSAGES = [
  "I didn't understand that.",
  "Use 'help' to see what I can understand.",
  "Huh?"
];

const ZONE_TRANSFER_CLOSE_CODE = 4000;

/**
 * A Durable Object that manages a single game zone, providing health status and (eventually)
 * zone-specific game logic such as NPC ticks, environment updates, etc.
 */
export class ZoneProcessor extends DurableObject<Env> {
  private comms: CommunicationHandler;
  private unknownCommandIndex = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const log = createLogger("game_log");
    this.comms = new CommunicationHandler(ctx, log);
  }

  /** Returns a lightweight health-check payload. */
  async getHealth() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  /**
   * Handle incoming HTTP requests. Only WebSocket upgrade requests are
   * accepted. User identity is passed via X-User-Email / X-User-Sub
   * headers (set by the Worker route).
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    const email = request.headers.get("X-User-Email");
    const sub = request.headers.get("X-User-Sub");
    const characterName = request.headers.get("X-Character-Name");
    const zoneId = parsePositiveHeader(request.headers.get("X-Zone-Id"), ACTIVE_ZONE_ID);
    const startRoom = parsePositiveHeader(request.headers.get("X-Start-Room"), START_ROOM_VNUM);
    const transferDirection = parseDirectionHeader(request.headers.get("X-Transfer-Direction"));
    const transferFromRoom = parseNullablePositiveHeader(
      request.headers.get("X-Transfer-From-Room")
    );
    const transferMode = parseTransferModeHeader(request.headers.get("X-Transfer-Mode"));

    if (!email || !sub || !characterName) {
      return new Response("Missing user identity headers", { status: 401 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [email]);
    server.serializeAttachment({
      email,
      sub,
      characterName,
      currentRoom: null,
      currentZoneId: zoneId
    } satisfies WebSocketAttachment);
    this.comms.registerConnection(email, server);
    await this.enterGame(email, {
      roomVnum: startRoom,
      zoneId,
      transferDirection,
      transferFromRoom,
      transferMode
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Place a connected player into the starting room for this zone. */
  async enterGame(userEmail: string, options: EnterGameOptions = {}): Promise<void> {
    const roomVnum = options.roomVnum ?? START_ROOM_VNUM;
    const zoneId = options.zoneId ?? ACTIVE_ZONE_ID;
    if (!this.comms.setCurrentLocation(userEmail, zoneId, roomVnum)) return;

    const direction =
      options.transferDirection ? oppositeDirection(options.transferDirection) : null;
    const oldRoomId = options.transferFromRoom ?? null;
    const message = this.makeEnterRoomMessage(
      userEmail,
      direction,
      oldRoomId,
      roomVnum,
      options.transferMode
    );
    this.comms.broadcastToRoom(roomVnum, userEmail, message, message);
  }

  /** Move a connected player through a visible exit in the current room. */
  async moveRoom(userEmail: string, direction: Direction): Promise<void> {
    const currentRoom = this.comms.getCurrentRoom(userEmail);
    const currentZoneId = this.comms.getCurrentZone(userEmail) ?? ACTIVE_ZONE_ID;
    if (currentRoom === null) {
      await this.enterGame(userEmail);
      return;
    }

    const exit = await this.env.MAP.prepare(
      `SELECT target_room AS targetRoom
       FROM exits
       WHERE room_vnum = ? AND direction = ? AND target_room >= 0`
    )
      .bind(currentRoom, direction)
      .first<ExitTargetRow>();

    if (!exit) {
      this.sendPlayerText(userEmail, "You cannot go that way.");
      return;
    }

    const targetRoom = exit.targetRoom;
    const target = await this.env.MAP.prepare(
      `SELECT rooms.zone_id AS zoneId, zones.name AS zoneName
       FROM rooms
       LEFT JOIN zones ON zones.id = rooms.zone_id
       WHERE rooms.vnum = ?`
    )
      .bind(targetRoom)
      .first<RoomZoneRow>();

    if (!target) {
      this.sendPlayerText(userEmail, "You cannot go that way yet.");
      return;
    }

    if (this.comms.getCurrentRoom(userEmail) !== currentRoom) {
      this.sendPlayerText(userEmail, "You are already moving.");
      return;
    }

    if (target.zoneId !== currentZoneId) {
      this.transferZone(
        userEmail,
        direction,
        currentRoom,
        currentZoneId,
        targetRoom,
        target.zoneId,
        target.zoneName
      );
      return;
    }

    const leaveMessage = this.makeLeaveRoomMessage(userEmail, direction, currentRoom, targetRoom);
    this.comms.broadcastToRoom(currentRoom, userEmail, leaveMessage, leaveMessage);

    this.comms.setCurrentLocation(userEmail, target.zoneId, targetRoom);

    const enterMessage = this.makeEnterRoomMessage(
      userEmail,
      oppositeDirection(direction),
      currentRoom,
      targetRoom
    );
    this.comms.broadcastToRoom(targetRoom, userEmail, enterMessage, enterMessage);
  }

  /** Return static room details plus connected players currently in that room. */
  async getRoomInfo(userEmail: string, roomVnum: number): Promise<RoomInfo | null> {
    if (this.comms.getCurrentRoom(userEmail) !== roomVnum) return null;
    const currentZoneId = this.comms.getCurrentZone(userEmail) ?? ACTIVE_ZONE_ID;

    const room = await this.env.MAP.prepare(
      `SELECT vnum, zone_id AS zoneId, name, description
       FROM rooms
       WHERE vnum = ?`
    )
      .bind(roomVnum)
      .first<RoomRow>();

    /* istanbul ignore if -- @preserve currentRoom is controlled by valid room transitions; this guards corrupted socket state. */
    if (!room || room.zoneId !== currentZoneId) return null;

    const exitsResult = await this.env.MAP.prepare(
      `SELECT direction, description, target_room AS targetRoom, door_type AS doorType
       FROM exits
       WHERE room_vnum = ? AND target_room >= 0
       ORDER BY CASE direction
         WHEN 'NORTH' THEN 0
         WHEN 'EAST' THEN 1
         WHEN 'SOUTH' THEN 2
         WHEN 'WEST' THEN 3
         WHEN 'UP' THEN 4
         WHEN 'DOWN' THEN 5
         WHEN 'NORTHWEST' THEN 6
         WHEN 'NORTHEAST' THEN 7
         WHEN 'SOUTHEAST' THEN 8
         WHEN 'SOUTHWEST' THEN 9
         ELSE 10
       END`
    )
      .bind(roomVnum)
      .all<RoomExitRow>();

    /* istanbul ignore next -- @preserve D1 .all() always provides results; fallback protects mocked runtimes. */
    const exitRows = exitsResult.results ?? [];

    return {
      vnum: room.vnum,
      name: room.name,
      description: room.description,
      exits: exitRows.map((exit) => ({
        direction: exit.direction,
        description: exit.description,
        targetRoom: exit.targetRoom,
        hasDoor: exit.doorType > 0
      })),
      players: this.comms.getPlayersInRoom(roomVnum, userEmail)
    };
  }

  /** Process a non-movement game command from a user. */
  async processInput(userEmail: string, text: string): Promise<void> {
    const input = text.trim();
    const command = /^(\S+)(?:\s+([\s\S]*))?$/.exec(input);
    const verb = command?.[1].toLowerCase() ?? "";
    const rest = (command?.[2] ?? "").trim();

    if (verb === "say" && rest) {
      this.sayToRoom(userEmail, rest);
      return;
    }

    if (verb === "shout" && rest) {
      this.shoutToZone(userEmail, rest);
      return;
    }

    if (verb === "tell" && rest) {
      const tell = /^(\S+)\s+([\s\S]+)$/.exec(rest);
      if (tell) {
        this.tellPlayer(userEmail, tell[1], tell[2].trim());
        return;
      }
    }

    if (verb === "teleport") {
      await this.teleportToRoom(userEmail, rest);
      return;
    }

    this.sendUnknownCommand(userEmail);
  }

  private sayToRoom(userEmail: string, message: string): void {
    const currentRoom = this.comms.getCurrentRoom(userEmail);
    if (currentRoom === null) {
      this.sendPlayerText(userEmail, "You are not in a room.", "error");
      return;
    }

    const sub = this.getPlayerSub(userEmail);
    this.comms.broadcastToRoom(
      currentRoom,
      userEmail,
      { type: "message", sub, details: { message: `You say, "${message}"` } },
      { type: "message", sub, details: { message: `${sub.name} says, "${message}"` } }
    );
  }

  private shoutToZone(userEmail: string, message: string): void {
    const sub = this.getPlayerSub(userEmail);
    this.comms.broadcast(
      userEmail,
      { type: "message", sub, details: { message: `You shout, "${message}"` } },
      { type: "message", sub, details: { message: `${sub.name} shouts, "${message}"` } }
    );
  }

  private tellPlayer(userEmail: string, targetName: string, message: string): void {
    const target = this.comms.findPlayerByName(targetName);
    if (!target) {
      this.sendPlayerText(userEmail, `No one named ${targetName} is in this zone.`, "error");
      return;
    }

    const sub = this.getPlayerSub(userEmail);
    if (target.email === userEmail) {
      this.comms.sendToPlayer(userEmail, {
        type: "message",
        sub,
        details: { message: `You tell yourself, "${message}"` }
      });
      return;
    }

    this.comms.sendToPlayer(userEmail, {
      type: "message",
      sub,
      details: { message: `You tell ${target.name}, "${message}"` }
    });
    this.comms.sendToPlayer(target.email, {
      type: "message",
      sub,
      details: { message: `${sub.name} tells you, "${message}"` }
    });
  }

  private async teleportToRoom(userEmail: string, targetRoomText: string): Promise<void> {
    if (!/^\d+$/.test(targetRoomText)) {
      this.sendPlayerText(userEmail, "Usage: teleport <roomnum>.", "error");
      return;
    }

    const currentRoom = this.comms.getCurrentRoom(userEmail);
    const currentZoneId = this.comms.getCurrentZone(userEmail) ?? ACTIVE_ZONE_ID;
    if (currentRoom === null) {
      this.sendPlayerText(userEmail, "You are not in a room.", "error");
      return;
    }

    const targetRoom = Number(targetRoomText);
    const target = await this.env.MAP.prepare(
      `SELECT rooms.zone_id AS zoneId, zones.name AS zoneName
       FROM rooms
       LEFT JOIN zones ON zones.id = rooms.zone_id
       WHERE rooms.vnum = ?`
    )
      .bind(targetRoom)
      .first<RoomZoneRow>();

    if (!target) {
      this.sendPlayerText(userEmail, "You cannot teleport there.", "error");
      return;
    }

    if (this.comms.getCurrentRoom(userEmail) !== currentRoom) {
      this.sendPlayerText(userEmail, "You are already moving.");
      return;
    }

    if (target.zoneId !== currentZoneId) {
      this.transferZone(
        userEmail,
        null,
        currentRoom,
        currentZoneId,
        targetRoom,
        target.zoneId,
        target.zoneName,
        "teleport"
      );
      return;
    }

    const leaveMessage = this.makeLeaveRoomMessage(
      userEmail,
      null,
      currentRoom,
      targetRoom,
      "teleport"
    );
    this.comms.broadcastToRoom(currentRoom, userEmail, leaveMessage, leaveMessage);

    this.comms.setCurrentLocation(userEmail, target.zoneId, targetRoom);

    const enterMessage = this.makeEnterRoomMessage(
      userEmail,
      null,
      currentRoom,
      targetRoom,
      "teleport"
    );
    this.comms.broadcastToRoom(targetRoom, userEmail, enterMessage, enterMessage);
  }

  private transferZone(
    userEmail: string,
    direction: Direction | null,
    oldRoomId: number,
    oldZoneId: number,
    newRoomId: number,
    targetZoneId: number,
    zoneName: string | null,
    mode?: MovementMode
  ): void {
    const leaveMessage = this.makeLeaveRoomMessage(
      userEmail,
      direction,
      oldRoomId,
      newRoomId,
      mode
    );
    this.comms.broadcastToRoom(oldRoomId, userEmail, leaveMessage, leaveMessage);

    this.comms.markZoneTransfer(userEmail);
    this.comms.sendToPlayer(
      userEmail,
      this.makeZoneTransferMessage(
        userEmail,
        direction,
        oldRoomId,
        oldZoneId,
        newRoomId,
        targetZoneId,
        zoneName,
        mode
      )
    );
    this.comms.closeConnection(userEmail, ZONE_TRANSFER_CLOSE_CODE, "zone transfer");
  }

  private sendUnknownCommand(userEmail: string): void {
    const message =
      UNKNOWN_COMMAND_MESSAGES[this.unknownCommandIndex % UNKNOWN_COMMAND_MESSAGES.length];
    this.unknownCommandIndex++;
    this.sendPlayerText(userEmail, message, "error");
  }

  private makeLeaveRoomMessage(
    userEmail: string,
    direction: Direction | null,
    oldRoomId: number,
    newRoomId: number,
    mode?: MovementMode | null
  ): GameMessage {
    const sub = this.getPlayerSub(userEmail);
    return {
      type: "leave_room",
      sub,
      details: makeMovementDetails(sub.name, direction, oldRoomId, newRoomId, mode)
    };
  }

  private makeEnterRoomMessage(
    userEmail: string,
    direction: Direction | null,
    oldRoomId: number | null,
    newRoomId: number,
    mode?: MovementMode | null
  ): GameMessage {
    const sub = this.getPlayerSub(userEmail);
    return {
      type: "enter_room",
      sub,
      details: makeMovementDetails(sub.name, direction, oldRoomId, newRoomId, mode)
    };
  }

  private makeZoneTransferMessage(
    userEmail: string,
    direction: Direction | null,
    oldRoomId: number,
    oldZoneId: number,
    newRoomId: number,
    zoneId: number,
    zoneName: string | null,
    mode?: MovementMode
  ): GameMessage {
    const sub = this.getPlayerSub(userEmail);
    const details = makeMovementDetails(sub.name, direction, oldRoomId, newRoomId, mode);
    return {
      type: "zone_transfer",
      sub,
      details: {
        ...details,
        roomId: newRoomId,
        oldZoneId,
        zoneId,
        zoneName
      }
    };
  }

  private sendPlayerText(userEmail: string, message: string, type = "message"): void {
    this.comms.sendToPlayer(userEmail, {
      type,
      sub: this.getPlayerSub(userEmail),
      details: { message }
    });
  }

  private getPlayerSub(userEmail: string): { name: string; email: string } {
    /* istanbul ignore next -- @preserve registered game sockets always include characterName; fallback protects malformed attachments. */
    return { name: this.comms.getCharacterName(userEmail) ?? userEmail, email: userEmail };
  }

  private broadcastDisconnect(result: ConnectionLifecycleResult): void {
    const attachment = result.attachment;
    if (
      !result.removed
      || !attachment
      || attachment.transferring
      || attachment.currentRoom === null
    ) {
      return;
    }

    const message: GameMessage = {
      type: "message",
      sub: { name: attachment.characterName, email: attachment.email },
      details: { message: `${attachment.characterName} disappears in a puff of smoke.` }
    };
    this.comms.broadcastToRoom(attachment.currentRoom, attachment.email, message, message);
  }

  /** Log unexpected client messages (input should arrive via POST). */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.comms.handleMessage(ws, message);
  }

  /** Clean up on WebSocket close. */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    const result = this.comms.handleClose(ws, code, reason, wasClean);
    this.broadcastDisconnect(result);
  }

  /** Log WebSocket errors. */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const result = this.comms.handleError(ws, error);
    this.broadcastDisconnect(result);
  }
}

function parsePositiveHeader(value: string | null, fallback: number): number {
  if (value === null) return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNullablePositiveHeader(value: string | null): number | null {
  if (value === null) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDirectionHeader(value: string | null): Direction | null {
  if (value === null) return null;

  const normalized = value.toUpperCase() as Direction;
  return DIRECTIONS.includes(normalized) ? normalized : null;
}

function parseTransferModeHeader(value: string | null): MovementMode | null {
  return value === "teleport" ? "teleport" : null;
}

function makeMovementDetails(
  player: string,
  direction: Direction | null,
  oldRoomId: number | null,
  newRoomId: number,
  mode?: MovementMode | null
): Record<string, unknown> {
  return {
    player,
    direction,
    oldRoomId,
    newRoomId,
    ...(mode ? { mode } : {})
  };
}
