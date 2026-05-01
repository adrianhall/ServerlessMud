/**
 * ZoneProcessor Durable Object.
 *
 * Manages a single game zone, providing health status and (eventually)
 * zone-specific game logic such as NPC ticks, environment updates, etc.
 *
 * @module
 */

import { DurableObject } from "cloudflare:workers";
import type { WebSocketAttachment } from "./types";
import { CommunicationHandler } from "./communication";

/**
 * A Durable Object that manages a single game zone, providing health status and (eventually)
 * zone-specific game logic such as NPC ticks, environment updates, etc.
 */
export class ZoneProcessor extends DurableObject<Env> {
  private comms: CommunicationHandler;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.comms = new CommunicationHandler(ctx);
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
    this.comms.registerConnection(email, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Process a game command from a user. Broadcasts the result to all
   * connected WebSockets: the sender sees "You said '...'" while
   * everyone else sees "<email> said '...'".
   *
   * Called via RPC from the Worker route (POST /api/game/input).
   */
  async processInput(userEmail: string, text: string): Promise<void> {
    this.comms.broadcast(
      userEmail,
      { type: "message", sub: userEmail, details: { message: `You said '${text}'` } },
      { type: "message", sub: userEmail, details: { message: `${userEmail} said '${text}'` } }
    );
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
