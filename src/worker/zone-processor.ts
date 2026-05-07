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
import type { Direction } from "./directions";
import { oppositeDirection } from "./directions";
import type { GameMessage, RoomInfo, WebSocketAttachment } from "./types";
import { CommunicationHandler } from "./communication";

interface ExitTargetRow {
  targetRoom: number;
}

interface RoomZoneRow {
  zoneId: number;
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

    if (!email || !sub || !characterName) {
      return new Response("Missing user identity headers", { status: 401 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [email]);
    server.serializeAttachment({
      email,
      sub,
      characterName,
      currentRoom: null
    } satisfies WebSocketAttachment);
    this.comms.registerConnection(email, server);
    await this.enterGame(email);

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Place a connected player into the starting room for this zone. */
  async enterGame(userEmail: string): Promise<void> {
    if (!this.comms.setCurrentRoom(userEmail, START_ROOM_VNUM)) return;

    const message = this.makeEnterRoomMessage(userEmail, null, null, START_ROOM_VNUM);
    this.comms.broadcastToRoom(START_ROOM_VNUM, userEmail, message, message);
  }

  /** Move a connected player through a visible exit in the current room. */
  async moveRoom(userEmail: string, direction: Direction): Promise<void> {
    const currentRoom = this.comms.getCurrentRoom(userEmail);
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
      `SELECT zone_id AS zoneId
       FROM rooms
       WHERE vnum = ?`
    )
      .bind(targetRoom)
      .first<RoomZoneRow>();

    if (!target || target.zoneId !== ACTIVE_ZONE_ID) {
      this.sendPlayerText(userEmail, "You cannot go that way yet.");
      return;
    }

    if (this.comms.getCurrentRoom(userEmail) !== currentRoom) {
      this.sendPlayerText(userEmail, "You are already moving.");
      return;
    }

    const leaveMessage = this.makeLeaveRoomMessage(userEmail, direction, currentRoom, targetRoom);
    this.comms.broadcastToRoom(currentRoom, userEmail, leaveMessage, leaveMessage);

    this.comms.setCurrentRoom(userEmail, targetRoom);

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

    const room = await this.env.MAP.prepare(
      `SELECT vnum, zone_id AS zoneId, name, description
       FROM rooms
       WHERE vnum = ?`
    )
      .bind(roomVnum)
      .first<RoomRow>();

    /* istanbul ignore if -- @preserve currentRoom is controlled by valid room transitions; this guards corrupted socket state. */
    if (!room || room.zoneId !== ACTIVE_ZONE_ID) return null;

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

  private sendUnknownCommand(userEmail: string): void {
    const message =
      UNKNOWN_COMMAND_MESSAGES[this.unknownCommandIndex % UNKNOWN_COMMAND_MESSAGES.length];
    this.unknownCommandIndex++;
    this.sendPlayerText(userEmail, message, "error");
  }

  private makeLeaveRoomMessage(
    userEmail: string,
    direction: Direction,
    oldRoomId: number,
    newRoomId: number
  ): GameMessage {
    const sub = this.getPlayerSub(userEmail);
    return {
      type: "leave_room",
      sub,
      details: { player: sub.name, direction, oldRoomId, newRoomId }
    };
  }

  private makeEnterRoomMessage(
    userEmail: string,
    direction: Direction | null,
    oldRoomId: number | null,
    newRoomId: number
  ): GameMessage {
    const sub = this.getPlayerSub(userEmail);
    return {
      type: "enter_room",
      sub,
      details: { player: sub.name, direction, oldRoomId, newRoomId }
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
    this.comms.handleClose(ws, code, reason, wasClean);
  }

  /** Log WebSocket errors. */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.comms.handleError(ws, error);
  }
}
