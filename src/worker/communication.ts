/**
 * WebSocket communication handler for Durable Objects.
 *
 * Manages an in-memory map of connected WebSockets keyed by user email.
 * Only one connection per user is allowed — a new connection evicts the
 * old one.  Hydrates from platform state on construction (hibernation
 * wake-up), then maintained via explicit register/handle calls from
 * the DO.
 *
 * @module
 */

import type { Logger } from "@lib/cloudflare-logging";
import type { GameMessage, WebSocketAttachment } from "./types";

export interface ConnectionLifecycleResult {
  attachment: WebSocketAttachment | null;
  removed: boolean;
}

export class CommunicationHandler {
  private connections: Map<string, WebSocket>;
  private log: Logger;

  constructor(ctx: DurableObjectState, log: Logger) {
    this.connections = new Map();
    this.log = log;

    // Hydrate from existing websockets (handles hibernation wake-up).
    // After hibernation the DO constructor re-runs.  getWebSockets()
    // returns all still-connected sockets; we rebuild the map from
    // their serialized attachments.  If multiple sockets exist for
    // the same email (shouldn't happen, but defensive), last one wins.
    for (const ws of ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (attachment) {
        this.connections.set(attachment.email, ws);
      }
    }

    // Automated ping/pong keep-alive.  The runtime responds to "ping"
    // with "pong" without waking the DO from hibernation.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    this.log.debug("communication handler initialized", {
      connections: this.connectionCount()
    });
  }

  // -------------------------------------------------------------------
  // Connection lifecycle (called by ZoneProcessor)
  // -------------------------------------------------------------------

  /**
   * Register a newly accepted WebSocket.  If the user already has
   * a connection, the old socket is closed (code 1008) and replaced.
   * Called from the DO's fetch() after acceptWebSocket() and
   * serializeAttachment().
   */
  registerConnection(email: string, ws: WebSocket): void {
    const existing = this.connections.get(email);
    if (existing) {
      this.log.debug("evicting previous connection", { email });
      existing.close(1008, "replaced by new connection");
    }
    this.connections.set(email, ws);
    this.log.debug("connection registered", {
      email,
      total: this.connectionCount()
    });
  }

  /**
   * Handle WebSocket close.  Removes from map (only if the stored
   * socket is the one being closed — avoids removing a newer
   * replacement).  Completes the close handshake.
   * Called from DO's webSocketClose handler.
   */
  handleClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): ConnectionLifecycleResult {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    const email = attachment?.email ?? "unknown";
    const removed = this.connections.get(email) === ws;
    if (removed) {
      this.connections.delete(email);
    }
    try {
      ws.close(code, reason);
    } catch {
      // Code may be invalid for sending (e.g., 1006 abnormal closure).
      // The platform handles the close handshake automatically via
      // web_socket_auto_reply_to_close.
    }
    this.log.debug("websocket closed", { email, code, reason, wasClean });
    return { attachment, removed };
  }

  /**
   * Handle unexpected client-sent message.  Input should arrive via
   * POST /api/game/input, not over the WebSocket.
   * Called from DO's webSocketMessage handler.
   */
  handleMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    this.log.debug("unexpected client message", {
      email: attachment?.email ?? "unknown",
      message: typeof message === "string" ? message : "(binary)"
    });
  }

  /**
   * Handle WebSocket error.  Removes from map (only if stored socket
   * matches).  Called from DO's webSocketError handler.
   */
  handleError(ws: WebSocket, error: unknown): ConnectionLifecycleResult {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    const email = attachment?.email ?? "unknown";
    const removed = this.connections.get(email) === ws;
    if (removed) {
      this.connections.delete(email);
    }
    this.log.error("websocket error", { email, error: String(error) });
    return { attachment, removed };
  }

  /**
   * Look up the character name for a connected user by reading the
   * WebSocket attachment.  Returns null if the user has no active
   * connection.
   */
  getCharacterName(email: string): string | null {
    const ws = this.connections.get(email);
    if (!ws) return null;
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    return attachment?.characterName ?? null;
  }

  /** Look up the current room for a connected user. */
  getCurrentRoom(email: string): number | null {
    const ws = this.connections.get(email);
    if (!ws) return null;
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    return attachment?.currentRoom ?? null;
  }

  /** Look up the current zone for a connected user. */
  getCurrentZone(email: string): number | null {
    const ws = this.connections.get(email);
    if (!ws) return null;
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    return typeof attachment?.currentZoneId === "number" ? attachment.currentZoneId : null;
  }

  /** Update the room stored on a user's WebSocket attachment. */
  setCurrentRoom(email: string, roomVnum: number): boolean {
    const ws = this.connections.get(email);
    if (!ws) return false;

    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (!attachment) return false;

    ws.serializeAttachment({ ...attachment, currentRoom: roomVnum } satisfies WebSocketAttachment);
    return true;
  }

  /** Update the zone and room stored on a user's WebSocket attachment. */
  setCurrentLocation(email: string, zoneId: number, roomVnum: number): boolean {
    const ws = this.connections.get(email);
    if (!ws) return false;

    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (!attachment) return false;

    ws.serializeAttachment({
      ...attachment,
      currentZoneId: zoneId,
      currentRoom: roomVnum,
      transferring: false
    } satisfies WebSocketAttachment);
    return true;
  }

  /** Mark a connection as intentionally closing for a zone transfer. */
  markZoneTransfer(email: string): boolean {
    const ws = this.connections.get(email);
    if (!ws) return false;

    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (!attachment) return false;

    ws.serializeAttachment({ ...attachment, transferring: true } satisfies WebSocketAttachment);
    return true;
  }

  /** Close a tracked connection, if it is still present. */
  closeConnection(email: string, code: number, reason: string): boolean {
    const ws = this.connections.get(email);
    if (!ws) return false;

    ws.close(code, reason);
    return true;
  }

  /** Names of connected players in a room, excluding one user when requested. */
  getPlayersInRoom(roomVnum: number, excludeEmail?: string): string[] {
    const players: string[] = [];

    for (const [email, ws] of this.connections) {
      if (excludeEmail && email === excludeEmail) continue;
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (attachment?.currentRoom === roomVnum) {
        players.push(attachment.characterName);
      }
    }

    return players;
  }

  /** Find a connected player by character name, regardless of current room. */
  findPlayerByName(characterName: string): { email: string; name: string } | null {
    const normalizedName = characterName.trim().toLowerCase();

    for (const [email, ws] of this.connections) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (attachment?.characterName.toLowerCase() === normalizedName) {
        return { email, name: attachment.characterName };
      }
    }

    return null;
  }

  // -------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------

  /**
   * Broadcast to all connected users.
   * Sender receives `senderMessage`, everyone else receives
   * `othersMessage`.
   */
  broadcast(senderEmail: string, senderMessage: GameMessage, othersMessage: GameMessage): void {
    let sent = 0;
    for (const [email, ws] of this.connections) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const payload = JSON.stringify(email === senderEmail ? senderMessage : othersMessage);
      ws.send(payload);
      sent++;
    }
    this.log.debug("broadcast complete", { senderEmail, sent });
  }

  /** Send a message to one connected user, if the socket is open. */
  sendToPlayer(email: string, message: GameMessage): boolean {
    const ws = this.connections.get(email);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    ws.send(JSON.stringify(message));
    return true;
  }

  /** Broadcast to players currently in one room only. */
  broadcastToRoom(
    roomVnum: number,
    senderEmail: string,
    senderMessage: GameMessage,
    othersMessage: GameMessage
  ): void {
    let sent = 0;

    for (const [email, ws] of this.connections) {
      if (ws.readyState !== WebSocket.OPEN) continue;

      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (attachment?.currentRoom !== roomVnum) continue;

      const payload = JSON.stringify(email === senderEmail ? senderMessage : othersMessage);
      ws.send(payload);
      sent++;
    }

    this.log.debug("room broadcast complete", { roomVnum, senderEmail, sent });
  }

  // -------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------

  /** Number of tracked connections (one per user). */
  connectionCount(): number {
    return this.connections.size;
  }
}
