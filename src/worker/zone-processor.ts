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
import type { WebSocketAttachment } from "./types";

const log = createLogger("game_log", { minLogLevel: "debug" });

/**
 * A Durable Object that manages a single game zone, providing health status and (eventually)
 * zone-specific game logic such as NPC ticks, environment updates, etc.
 */
export class ZoneProcessor extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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

    if (!email || !sub) {
      return new Response("Missing user identity headers", { status: 401 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [email]);
    server.serializeAttachment({ email, sub } satisfies WebSocketAttachment);

    log.debug("websocket accepted", { email });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Log unexpected client messages (input should arrive via POST). */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    log.debug("unexpected client message", {
      email: attachment?.email ?? "unknown",
      message: typeof message === "string" ? message : "(binary)"
    });
  }

  /** Clean up on WebSocket close. */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    const email = attachment?.email ?? "unknown";
    log.debug("websocket closed", { email, code, reason, wasClean });
    ws.close(code, reason);
  }

  /** Log WebSocket errors. */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    log.error("websocket error", {
      email: attachment?.email ?? "unknown",
      error: String(error)
    });
  }
}
