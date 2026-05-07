/**
 * Shared type definitions for game communication.
 * @module
 */

/** JSON message pushed from the server to the client over WebSocket. */
export interface GameMessage {
  type: string;
  sub: { name: string; email: string };
  details: Record<string, unknown>;
}

export interface RoomInfo {
  vnum: number;
  name: string;
  description: string;
  exits: RoomExit[];
  players: string[];
}

export interface RoomExit {
  direction: string;
  description: string;
  targetRoom: number;
  hasDoor: boolean;
}

/** Body of `POST /api/game/input`. */
export interface GameInputPayload {
  text: string;
  zoneId?: number;
}

/** Metadata serialized onto each WebSocket via serializeAttachment. */
export interface WebSocketAttachment {
  email: string;
  sub: string;
  characterName: string;
  currentRoom: number | null;
  currentZoneId?: number;
  transferring?: boolean;
}
