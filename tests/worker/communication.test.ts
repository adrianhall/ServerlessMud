/**
 * Unit tests for {@link CommunicationHandler}.
 *
 * The Cloudflare runtime paths exercised here (constructor hydration on
 * hibernation wake-up, the `webSocketError` lifecycle hook) cannot be
 * triggered reliably from integration tests against a real
 * `ZoneProcessor`.  Instead we construct `CommunicationHandler`
 * directly with a mocked `DurableObjectState` and call its methods
 * with mocked `WebSocket` objects.  The Cloudflare workers test pool
 * still provides the runtime globals (`WebSocketRequestResponsePair`,
 * `WebSocket.OPEN`) used by the implementation under test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommunicationHandler } from "@src/worker/communication";
import type { Logger } from "@lib/cloudflare-logging";
import type { GameMessage, WebSocketAttachment } from "@src/worker/types";

const silentLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockWebSocketOptions {
  attachment?:
    | (Pick<WebSocketAttachment, "email" | "sub"> & {
        characterName?: string;
        currentRoom?: number | null;
        currentZoneId?: number;
        transferring?: boolean;
      })
    | null;
  readyState?: number;
  closeThrows?: boolean;
}

interface MockWebSocket {
  deserializeAttachment: () => WebSocketAttachment | null;
  serializeAttachment: ReturnType<typeof vi.fn>;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  /** Record of every message passed to `send`. */
  sentMessages: string[];
}

/**
 * Construct a minimal stand-in for a Cloudflare-runtime WebSocket
 * exposing only the surface used by `CommunicationHandler`.
 */
function makeMockWebSocket(opts: MockWebSocketOptions = {}): MockWebSocket {
  let attachment =
    opts.attachment ?
      ({
        characterName: "Dorian",
        currentRoom: null,
        ...opts.attachment
      } satisfies WebSocketAttachment)
    : null;
  const readyState = opts.readyState ?? WebSocket.OPEN;
  const sentMessages: string[] = [];

  const serializeAttachment = vi.fn((nextAttachment: WebSocketAttachment) => {
    attachment = nextAttachment;
  });

  const send = vi.fn((data: string) => {
    sentMessages.push(data);
  });

  const close = vi.fn(() => {
    if (opts.closeThrows) {
      throw new Error("invalid close code");
    }
  });

  return {
    deserializeAttachment: () => attachment,
    serializeAttachment,
    readyState,
    send,
    close,
    sentMessages
  };
}

/**
 * Construct a minimal stand-in for `DurableObjectState` exposing only
 * the methods used by the `CommunicationHandler` constructor.
 */
function makeMockState(websockets: MockWebSocket[] = []) {
  const setWebSocketAutoResponse = vi.fn();

  const ctx = {
    getWebSockets: () => websockets as unknown as WebSocket[],
    setWebSocketAutoResponse
  } as unknown as DurableObjectState;

  return { ctx, setWebSocketAutoResponse };
}

/**
 * Convenience: construct a handler over a mocked state with no
 * pre-existing connections.  Used by all tests that don't need to
 * exercise hydration.
 */
function makeHandler() {
  const { ctx, setWebSocketAutoResponse } = makeMockState();
  const handler = new CommunicationHandler(ctx, silentLogger);
  return { handler, setWebSocketAutoResponse };
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("CommunicationHandler constructor", () => {
  it("starts with zero connections when the state has no sockets", () => {
    const { handler } = makeHandler();
    expect(handler.connectionCount()).toBe(0);
  });

  it("hydrates connections from existing WebSockets with valid attachments", () => {
    const ws1 = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const ws2 = makeMockWebSocket({
      attachment: { email: "bob@example.com", sub: "sub-b" }
    });
    const { ctx } = makeMockState([ws1, ws2]);

    const handler = new CommunicationHandler(ctx, silentLogger);

    expect(handler.connectionCount()).toBe(2);
  });

  it("skips WebSockets whose deserialized attachment is null", () => {
    const validWs = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const orphanWs = makeMockWebSocket({ attachment: null });
    const { ctx } = makeMockState([orphanWs, validWs]);

    const handler = new CommunicationHandler(ctx, silentLogger);

    // Only the valid attachment is hydrated.
    expect(handler.connectionCount()).toBe(1);
  });

  it("uses last-wins semantics when two sockets have the same email", () => {
    const first = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const second = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a-newer" }
    });
    const { ctx } = makeMockState([first, second]);

    const handler = new CommunicationHandler(ctx, silentLogger);

    // Both rows collapse onto a single email, so count stays at 1.
    expect(handler.connectionCount()).toBe(1);

    // The last-registered socket should be the one that receives broadcasts.
    handler.broadcast(
      "alice@example.com",
      {
        type: "message",
        sub: { name: "Alice", email: "alice@example.com" },
        details: { message: "self" }
      },
      {
        type: "message",
        sub: { name: "Alice", email: "alice@example.com" },
        details: { message: "other" }
      }
    );
    expect(second.send).toHaveBeenCalledTimes(1);
    expect(first.send).not.toHaveBeenCalled();
  });

  it("registers a ping/pong WebSocket auto-response on the state", () => {
    const { setWebSocketAutoResponse } = makeHandler();
    expect(setWebSocketAutoResponse).toHaveBeenCalledTimes(1);
    const arg = setWebSocketAutoResponse.mock.calls[0][0];
    // The argument is a WebSocketRequestResponsePair instance.
    expect(arg).toBeInstanceOf(WebSocketRequestResponsePair);
  });
});

// ---------------------------------------------------------------------------
// registerConnection
// ---------------------------------------------------------------------------

describe("CommunicationHandler.registerConnection", () => {
  it("adds a new connection to the map", () => {
    const { handler } = makeHandler();
    const ws = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });

    handler.registerConnection("alice@example.com", ws as unknown as WebSocket);

    expect(handler.connectionCount()).toBe(1);
  });

  it("evicts the existing connection when a new one is registered for the same email", () => {
    const { handler } = makeHandler();
    const oldWs = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const newWs = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });

    handler.registerConnection("alice@example.com", oldWs as unknown as WebSocket);
    handler.registerConnection("alice@example.com", newWs as unknown as WebSocket);

    expect(handler.connectionCount()).toBe(1);
    expect(oldWs.close).toHaveBeenCalledWith(1008, "replaced by new connection");
    expect(newWs.close).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleClose
// ---------------------------------------------------------------------------

describe("CommunicationHandler.handleClose", () => {
  it("removes the connection when the stored socket matches", () => {
    const { handler } = makeHandler();
    const ws = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", ws as unknown as WebSocket);

    handler.handleClose(ws as unknown as WebSocket, 1000, "bye", true);

    expect(handler.connectionCount()).toBe(0);
    expect(ws.close).toHaveBeenCalledWith(1000, "bye");
  });

  it("does not remove the connection when the socket does not match", () => {
    const { handler } = makeHandler();
    const stored = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const stranger = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", stored as unknown as WebSocket);

    handler.handleClose(stranger as unknown as WebSocket, 1000, "bye", true);

    // Stored connection still in the map.
    expect(handler.connectionCount()).toBe(1);
  });

  it("falls back to 'unknown' email when the attachment is null", () => {
    const { handler } = makeHandler();
    const orphan = makeMockWebSocket({ attachment: null });

    // Should not throw and should not remove anything from an empty map.
    expect(() =>
      handler.handleClose(orphan as unknown as WebSocket, 1000, "bye", true)
    ).not.toThrow();

    expect(handler.connectionCount()).toBe(0);
    expect(orphan.close).toHaveBeenCalledWith(1000, "bye");
  });

  it("swallows errors raised by ws.close (e.g. invalid close codes)", () => {
    const { handler } = makeHandler();
    const ws = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" },
      closeThrows: true
    });
    handler.registerConnection("alice@example.com", ws as unknown as WebSocket);

    // Code 1006 is reserved and would normally cause close() to throw.
    expect(() =>
      handler.handleClose(ws as unknown as WebSocket, 1006, "abnormal", false)
    ).not.toThrow();

    // The connection is still removed from the map even if close() throws.
    expect(handler.connectionCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleMessage
// ---------------------------------------------------------------------------

describe("CommunicationHandler.handleMessage", () => {
  it("logs string messages without throwing", () => {
    const { handler } = makeHandler();
    const ws = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });

    expect(() => handler.handleMessage(ws as unknown as WebSocket, "hello")).not.toThrow();
  });

  it("logs ArrayBuffer (binary) messages without throwing", () => {
    const { handler } = makeHandler();
    const ws = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const binary = new ArrayBuffer(8);

    expect(() => handler.handleMessage(ws as unknown as WebSocket, binary)).not.toThrow();
  });

  it("falls back to 'unknown' email when the attachment is null", () => {
    const { handler } = makeHandler();
    const orphan = makeMockWebSocket({ attachment: null });

    expect(() => handler.handleMessage(orphan as unknown as WebSocket, "hi")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleError
// ---------------------------------------------------------------------------

describe("CommunicationHandler.handleError", () => {
  it("removes the connection when the stored socket matches", () => {
    const { handler } = makeHandler();
    const ws = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", ws as unknown as WebSocket);
    expect(handler.connectionCount()).toBe(1);

    handler.handleError(ws as unknown as WebSocket, new Error("boom"));

    expect(handler.connectionCount()).toBe(0);
  });

  it("does not remove the connection when the errored socket does not match", () => {
    const { handler } = makeHandler();
    const stored = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const stranger = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", stored as unknown as WebSocket);

    handler.handleError(stranger as unknown as WebSocket, new Error("boom"));

    expect(handler.connectionCount()).toBe(1);
  });

  it("falls back to 'unknown' email when the attachment is null", () => {
    const { handler } = makeHandler();
    const orphan = makeMockWebSocket({ attachment: null });

    // Should not throw and should not remove anything from an empty map.
    expect(() =>
      handler.handleError(orphan as unknown as WebSocket, new Error("boom"))
    ).not.toThrow();

    expect(handler.connectionCount()).toBe(0);
  });

  it("stringifies arbitrary error values without throwing", () => {
    const { handler } = makeHandler();
    const ws = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", ws as unknown as WebSocket);

    // Pass a non-Error value to exercise String(error) path.
    expect(() => handler.handleError(ws as unknown as WebSocket, "string error")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// broadcast
// ---------------------------------------------------------------------------

describe("CommunicationHandler.broadcast", () => {
  let senderMessage: GameMessage;
  let othersMessage: GameMessage;

  beforeEach(() => {
    senderMessage = {
      type: "message",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { message: "You said 'hi'" }
    };
    othersMessage = {
      type: "message",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { message: "Alice said 'hi'" }
    };
  });

  it("sends the sender message to the sender and the others message to everyone else", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const bob = makeMockWebSocket({
      attachment: { email: "bob@example.com", sub: "sub-b" }
    });
    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);
    handler.registerConnection("bob@example.com", bob as unknown as WebSocket);

    handler.broadcast("alice@example.com", senderMessage, othersMessage);

    expect(alice.sentMessages).toEqual([JSON.stringify(senderMessage)]);
    expect(bob.sentMessages).toEqual([JSON.stringify(othersMessage)]);
  });

  it("skips sockets whose readyState is not OPEN", () => {
    const { handler } = makeHandler();
    const open = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" },
      readyState: WebSocket.OPEN
    });
    const closing = makeMockWebSocket({
      attachment: { email: "bob@example.com", sub: "sub-b" },
      readyState: WebSocket.CLOSING
    });
    handler.registerConnection("alice@example.com", open as unknown as WebSocket);
    handler.registerConnection("bob@example.com", closing as unknown as WebSocket);

    handler.broadcast("alice@example.com", senderMessage, othersMessage);

    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closing.send).not.toHaveBeenCalled();
  });

  it("is a no-op when no connections are registered", () => {
    const { handler } = makeHandler();
    expect(() =>
      handler.broadcast("nobody@example.com", senderMessage, othersMessage)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Room state and room-scoped messaging
// ---------------------------------------------------------------------------

describe("CommunicationHandler room helpers", () => {
  it("returns null for missing character names and rooms", () => {
    const { handler } = makeHandler();
    expect(handler.getCharacterName("missing@example.com")).toBeNull();
    expect(handler.getCurrentRoom("missing@example.com")).toBeNull();
    expect(handler.getCurrentZone("missing@example.com")).toBeNull();
  });

  it("returns null when a connected socket has no attachment", () => {
    const { handler } = makeHandler();
    const orphan = makeMockWebSocket({ attachment: null });
    handler.registerConnection("orphan@example.com", orphan as unknown as WebSocket);

    expect(handler.getCharacterName("orphan@example.com")).toBeNull();
    expect(handler.getCurrentRoom("orphan@example.com")).toBeNull();
    expect(handler.getCurrentZone("orphan@example.com")).toBeNull();
  });

  it("updates and reads the current room from the WebSocket attachment", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);

    expect(handler.getCurrentRoom("alice@example.com")).toBeNull();
    expect(handler.setCurrentRoom("alice@example.com", 3001)).toBe(true);

    expect(alice.serializeAttachment).toHaveBeenCalledWith({
      email: "alice@example.com",
      sub: "sub-a",
      characterName: "Dorian",
      currentRoom: 3001
    });
    expect(handler.getCurrentRoom("alice@example.com")).toBe(3001);
  });

  it("updates the current zone and room together", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: {
        email: "alice@example.com",
        sub: "sub-a",
        characterName: "Alice",
        currentRoom: 3001,
        currentZoneId: 30,
        transferring: true
      }
    });
    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);

    expect(handler.setCurrentLocation("alice@example.com", 31, 3100)).toBe(true);
    expect(alice.serializeAttachment).toHaveBeenCalledWith({
      email: "alice@example.com",
      sub: "sub-a",
      characterName: "Alice",
      currentRoom: 3100,
      currentZoneId: 31,
      transferring: false
    });
    expect(handler.getCurrentRoom("alice@example.com")).toBe(3100);
    expect(handler.getCurrentZone("alice@example.com")).toBe(31);
  });

  it("returns false when updating location for missing or unattached sockets", () => {
    const { handler } = makeHandler();
    const orphan = makeMockWebSocket({ attachment: null });
    handler.registerConnection("orphan@example.com", orphan as unknown as WebSocket);

    expect(handler.setCurrentLocation("missing@example.com", 31, 3100)).toBe(false);
    expect(handler.setCurrentLocation("orphan@example.com", 31, 3100)).toBe(false);
  });

  it("returns false when setting the room for a missing connection", () => {
    const { handler } = makeHandler();
    expect(handler.setCurrentRoom("missing@example.com", 3001)).toBe(false);
  });

  it("returns false when setting the room on a socket without an attachment", () => {
    const { handler } = makeHandler();
    const orphan = makeMockWebSocket({ attachment: null });
    handler.registerConnection("orphan@example.com", orphan as unknown as WebSocket);

    expect(handler.setCurrentRoom("orphan@example.com", 3001)).toBe(false);
  });

  it("marks zone transfers and closes tracked connections", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);

    expect(handler.markZoneTransfer("alice@example.com")).toBe(true);
    expect(alice.serializeAttachment).toHaveBeenCalledWith({
      email: "alice@example.com",
      sub: "sub-a",
      characterName: "Dorian",
      currentRoom: null,
      transferring: true
    });

    expect(handler.closeConnection("alice@example.com", 4000, "zone transfer")).toBe(true);
    expect(alice.close).toHaveBeenCalledWith(4000, "zone transfer");
  });

  it("does not mark or close missing transfer connections", () => {
    const { handler } = makeHandler();
    const orphan = makeMockWebSocket({ attachment: null });
    handler.registerConnection("orphan@example.com", orphan as unknown as WebSocket);

    expect(handler.markZoneTransfer("missing@example.com")).toBe(false);
    expect(handler.markZoneTransfer("orphan@example.com")).toBe(false);
    expect(handler.closeConnection("missing@example.com", 4000, "zone transfer")).toBe(false);
  });

  it("lists player names in a room and can exclude one email", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: {
        email: "alice@example.com",
        sub: "sub-a",
        characterName: "Alice",
        currentRoom: 3001
      }
    });
    const bob = makeMockWebSocket({
      attachment: {
        email: "bob@example.com",
        sub: "sub-b",
        characterName: "Bob",
        currentRoom: 3001
      }
    });
    const cara = makeMockWebSocket({
      attachment: {
        email: "cara@example.com",
        sub: "sub-c",
        characterName: "Cara",
        currentRoom: 3054
      }
    });

    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);
    handler.registerConnection("bob@example.com", bob as unknown as WebSocket);
    handler.registerConnection("cara@example.com", cara as unknown as WebSocket);

    expect(handler.getPlayersInRoom(3001)).toEqual(["Alice", "Bob"]);
    expect(handler.getPlayersInRoom(3001, "alice@example.com")).toEqual(["Bob"]);
  });

  it("finds open connected players by case-insensitive character name", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: {
        email: "alice@example.com",
        sub: "sub-a",
        characterName: "Alice",
        currentRoom: 3001
      }
    });
    const closed = makeMockWebSocket({
      attachment: {
        email: "closed@example.com",
        sub: "sub-c",
        characterName: "Closed",
        currentRoom: 3001
      },
      readyState: WebSocket.CLOSED
    });

    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);
    handler.registerConnection("closed@example.com", closed as unknown as WebSocket);

    expect(handler.findPlayerByName("alice")).toEqual({ email: "alice@example.com", name: "Alice" });
    expect(handler.findPlayerByName("Closed")).toBeNull();
    expect(handler.findPlayerByName("Missing")).toBeNull();
  });

  it("sends a message to one open socket", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    const message: GameMessage = {
      type: "message",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { message: "hello" }
    };
    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);

    expect(handler.sendToPlayer("alice@example.com", message)).toBe(true);
    expect(alice.sentMessages).toEqual([JSON.stringify(message)]);
  });

  it("does not send direct messages to missing or closed sockets", () => {
    const { handler } = makeHandler();
    const closed = makeMockWebSocket({
      attachment: { email: "closed@example.com", sub: "sub-c" },
      readyState: WebSocket.CLOSED
    });
    const message: GameMessage = {
      type: "message",
      sub: { name: "Closed", email: "closed@example.com" },
      details: { message: "hello" }
    };
    handler.registerConnection("closed@example.com", closed as unknown as WebSocket);

    expect(handler.sendToPlayer("missing@example.com", message)).toBe(false);
    expect(handler.sendToPlayer("closed@example.com", message)).toBe(false);
    expect(closed.sentMessages).toEqual([]);
  });

  it("broadcastToRoom sends only to players in the target room", () => {
    const { handler } = makeHandler();
    const alice = makeMockWebSocket({
      attachment: {
        email: "alice@example.com",
        sub: "sub-a",
        characterName: "Alice",
        currentRoom: 3001
      }
    });
    const bob = makeMockWebSocket({
      attachment: {
        email: "bob@example.com",
        sub: "sub-b",
        characterName: "Bob",
        currentRoom: 3001
      }
    });
    const cara = makeMockWebSocket({
      attachment: {
        email: "cara@example.com",
        sub: "sub-c",
        characterName: "Cara",
        currentRoom: 3054
      }
    });
    const senderMessage: GameMessage = {
      type: "leave_room",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { direction: "NORTH" }
    };
    const othersMessage: GameMessage = {
      type: "leave_room",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { direction: "NORTH" }
    };

    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);
    handler.registerConnection("bob@example.com", bob as unknown as WebSocket);
    handler.registerConnection("cara@example.com", cara as unknown as WebSocket);

    handler.broadcastToRoom(3001, "alice@example.com", senderMessage, othersMessage);

    expect(alice.sentMessages).toEqual([JSON.stringify(senderMessage)]);
    expect(bob.sentMessages).toEqual([JSON.stringify(othersMessage)]);
    expect(cara.sentMessages).toEqual([]);
  });

  it("broadcastToRoom skips closed sockets and sockets without attachments", () => {
    const { handler } = makeHandler();
    const open = makeMockWebSocket({
      attachment: {
        email: "open@example.com",
        sub: "sub-o",
        characterName: "Open",
        currentRoom: 3001
      }
    });
    const closed = makeMockWebSocket({
      attachment: {
        email: "closed@example.com",
        sub: "sub-c",
        characterName: "Closed",
        currentRoom: 3001
      },
      readyState: WebSocket.CLOSED
    });
    const orphan = makeMockWebSocket({ attachment: null });
    const message: GameMessage = {
      type: "enter_room",
      sub: { name: "Open", email: "open@example.com" },
      details: { direction: null }
    };

    handler.registerConnection("open@example.com", open as unknown as WebSocket);
    handler.registerConnection("closed@example.com", closed as unknown as WebSocket);
    handler.registerConnection("orphan@example.com", orphan as unknown as WebSocket);

    handler.broadcastToRoom(3001, "open@example.com", message, message);

    expect(open.sentMessages).toEqual([JSON.stringify(message)]);
    expect(closed.sentMessages).toEqual([]);
    expect(orphan.sentMessages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// connectionCount
// ---------------------------------------------------------------------------

describe("CommunicationHandler.connectionCount", () => {
  it("reflects the current size of the map", () => {
    const { handler } = makeHandler();
    expect(handler.connectionCount()).toBe(0);

    const alice = makeMockWebSocket({
      attachment: { email: "alice@example.com", sub: "sub-a" }
    });
    handler.registerConnection("alice@example.com", alice as unknown as WebSocket);
    expect(handler.connectionCount()).toBe(1);

    const bob = makeMockWebSocket({
      attachment: { email: "bob@example.com", sub: "sub-b" }
    });
    handler.registerConnection("bob@example.com", bob as unknown as WebSocket);
    expect(handler.connectionCount()).toBe(2);

    handler.handleClose(alice as unknown as WebSocket, 1000, "bye", true);
    expect(handler.connectionCount()).toBe(1);
  });
});
