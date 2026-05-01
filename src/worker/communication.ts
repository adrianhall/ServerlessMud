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

import { createLogger } from "@lib/cloudflare-logging";
import type { GameMessage, WebSocketAttachment } from "./types";

const log = createLogger("game_log", { minLogLevel: "debug" });

export class CommunicationHandler {
  private connections: Map<string, WebSocket>;

  constructor(ctx: DurableObjectState) {
    this.connections = new Map();

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

    log.debug("communication handler initialized", {
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
      log.debug("evicting previous connection", { email });
      existing.close(1008, "replaced by new connection");
    }
    this.connections.set(email, ws);
    log.debug("connection registered", {
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
  handleClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    const email = attachment?.email ?? "unknown";
    if (this.connections.get(email) === ws) {
      this.connections.delete(email);
    }
    try {
      ws.close(code, reason);
    } catch {
      // Code may be invalid for sending (e.g., 1006 abnormal closure).
      // The platform handles the close handshake automatically via
      // web_socket_auto_reply_to_close.
    }
    log.debug("websocket closed", { email, code, reason, wasClean });
  }

  /**
   * Handle unexpected client-sent message.  Input should arrive via
   * POST /api/game/input, not over the WebSocket.
   * Called from DO's webSocketMessage handler.
   */
  handleMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    log.debug("unexpected client message", {
      email: attachment?.email ?? "unknown",
      message: typeof message === "string" ? message : "(binary)"
    });
  }

  /**
   * Handle WebSocket error.  Removes from map (only if stored socket
   * matches).  Called from DO's webSocketError handler.
   */
  handleError(ws: WebSocket, error: unknown): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    const email = attachment?.email ?? "unknown";
    if (this.connections.get(email) === ws) {
      this.connections.delete(email);
    }
    log.error("websocket error", { email, error: String(error) });
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
    log.debug("broadcast complete", { senderEmail, sent });
  }

  // -------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------

  /** Number of tracked connections (one per user). */
  connectionCount(): number {
    return this.connections.size;
  }
}
