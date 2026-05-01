/**
 * Shared type definitions for game communication.
 * @module
 */

/** JSON message pushed from the server to the client over WebSocket. */
export interface GameMessage {
  type: string;
  sub: string;
  details: Record<string, unknown>;
}

/** Body of `POST /api/game/input`. */
export interface GameInputPayload {
  text: string;
}

/** Metadata serialized onto each WebSocket via serializeAttachment. */
export interface WebSocketAttachment {
  email: string;
  sub: string;
}
