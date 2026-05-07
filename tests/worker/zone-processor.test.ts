import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { GameMessage } from "@src/worker/types";

const WAIT_FOR_WS_MS = 50;

/** Helper: connect a WebSocket to a ZoneProcessor stub and return the client socket. */
function connectWebSocket(
  stub: DurableObjectStub,
  email: string,
  sub = "sub-123",
  characterName = "Dorian"
) {
  return stub.fetch("http://fake-host/", {
    headers: {
      "Upgrade": "websocket",
      "X-User-Email": email,
      "X-User-Sub": sub,
      "X-Character-Name": characterName
    }
  });
}

async function waitForWebSocketDelivery() {
  await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_WS_MS));
}

function parseMessages(messages: string[]): GameMessage[] {
  return messages.map((message) => JSON.parse(message) as GameMessage);
}

async function ensureZone30WorldData() {
  await env.MAP.batch([
    env.MAP.prepare(
      `CREATE TABLE IF NOT EXISTS zones (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        builder TEXT NOT NULL DEFAULT '',
        min_vnum INTEGER NOT NULL,
        max_vnum INTEGER NOT NULL,
        lifespan INTEGER NOT NULL,
        reset_mode INTEGER NOT NULL,
        flags INTEGER NOT NULL DEFAULT 0
      )`
    ),
    env.MAP.prepare(
      `CREATE TABLE IF NOT EXISTS rooms (
        vnum INTEGER PRIMARY KEY,
        zone_id INTEGER NOT NULL REFERENCES zones(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        flags INTEGER NOT NULL DEFAULT 0,
        sector_type INTEGER NOT NULL DEFAULT 0
      )`
    ),
    env.MAP.prepare(
      `CREATE TABLE IF NOT EXISTS exits (
        room_vnum INTEGER NOT NULL REFERENCES rooms(vnum),
        direction TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '[]',
        door_type INTEGER NOT NULL DEFAULT 0,
        key_vnum INTEGER NOT NULL DEFAULT -1,
        target_room INTEGER NOT NULL DEFAULT -1,
        PRIMARY KEY (room_vnum, direction)
      )`
    )
  ]);

  await env.MAP.batch([
    env.MAP.prepare(
      `INSERT OR IGNORE INTO zones (id, name, builder, min_vnum, max_vnum, lifespan, reset_mode, flags)
       VALUES (30, 'Northern Midgaard', 'Test', 3000, 3099, 15, 2, 8)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO zones (id, name, builder, min_vnum, max_vnum, lifespan, reset_mode, flags)
       VALUES (31, 'Southern Midgaard', 'Test', 3100, 3199, 30, 2, 8)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO rooms (vnum, zone_id, name, description, flags, sector_type)
       VALUES (3001, 30, 'The Temple Of Midgaard', 'The starting room.', 0, 0)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO rooms (vnum, zone_id, name, description, flags, sector_type)
       VALUES (3054, 30, 'The Altar', 'The northern room.', 0, 0)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO rooms (vnum, zone_id, name, description, flags, sector_type)
       VALUES (3100, 31, 'The Other Zone', 'A different zone.', 0, 0)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO exits (room_vnum, direction, description, keywords, door_type, key_vnum, target_room)
       VALUES (3001, 'NORTH', 'A northern exit.', '[]', 0, -1, 3054)`
    ),
    env.MAP.prepare(
      `INSERT OR REPLACE INTO exits (room_vnum, direction, description, keywords, door_type, key_vnum, target_room)
       VALUES (3001, 'UP', 'A cross-zone exit.', '[]', 0, -1, 3100)`
    )
  ]);
}

describe("ZoneProcessor", () => {
  it("returns health status via RPC", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("test-zone");
    const health = await stub.getHealth();

    expect(health).toHaveProperty("status", "ok");
    expect(health).toHaveProperty("timestamp");
    expect(new Date(health.timestamp).getTime()).not.toBeNaN();
  });

  it("fetch returns 400 without upgrade header", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("test-zone");
    const response = await stub.fetch("http://fake-host/");

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Expected WebSocket upgrade");
  });

  it("fetch returns 401 without user headers", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("test-zone");
    const response = await stub.fetch("http://fake-host/", {
      headers: { Upgrade: "websocket" }
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Missing user identity headers");
  });

  it("fetch returns 101 with valid upgrade and user headers", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("ws-101");
    const response = await connectWebSocket(stub, "test@example.com");

    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();

    // Clean up
    response.webSocket!.accept();
    response.webSocket!.close(1000, "test done");
  });

  it("places a player in room 3001 when they connect", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("ws-enter-game");
    const response = await connectWebSocket(stub, "alice@example.com", "sub-a", "Alice");
    const ws = response.webSocket!;
    ws.accept();

    const messages: string[] = [];
    ws.addEventListener("message", (event) => {
      messages.push(event.data as string);
    });

    await waitForWebSocketDelivery();

    const parsed = parseMessages(messages);
    expect(parsed).toContainEqual({
      type: "enter_room",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { player: "Alice", direction: null, oldRoomId: null, newRoomId: 3001 }
    });

    ws.close(1000, "test done");
  });

  it("processInput does not throw when no sockets are connected", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("test-zone-empty");
    await expect(stub.processInput("nobody@example.com", "hello")).resolves.toBeUndefined();
  });

  it("processInput broadcasts to connected WebSocket", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("ws-broadcast");
    const response = await connectWebSocket(stub, "alice@example.com");
    const ws = response.webSocket!;
    ws.accept();

    const messages: string[] = [];
    ws.addEventListener("message", (event) => {
      messages.push(event.data as string);
    });

    await waitForWebSocketDelivery();
    messages.length = 0;

    await stub.processInput("alice@example.com", "look");

    // Give the event loop a tick for the message to arrive.
    await waitForWebSocketDelivery();

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed).toEqual({
      type: "message",
      sub: { name: "Dorian", email: "alice@example.com" },
      details: { message: "You said 'look'" }
    });

    ws.close(1000, "test done");
  });

  it("broadcast sends different messages to sender vs others", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("ws-broadcast-multi");

    const res1 = await connectWebSocket(stub, "alice@example.com");
    const ws1 = res1.webSocket!;
    ws1.accept();

    const res2 = await connectWebSocket(stub, "bob@example.com");
    const ws2 = res2.webSocket!;
    ws2.accept();

    const aliceMessages: string[] = [];
    const bobMessages: string[] = [];
    ws1.addEventListener("message", (e) => {
      aliceMessages.push(e.data as string);
    });
    ws2.addEventListener("message", (e) => {
      bobMessages.push(e.data as string);
    });

    await waitForWebSocketDelivery();
    aliceMessages.length = 0;
    bobMessages.length = 0;

    await stub.processInput("alice@example.com", "wave");
    await waitForWebSocketDelivery();

    expect(aliceMessages).toHaveLength(1);
    expect(JSON.parse(aliceMessages[0]).details.message).toBe("You said 'wave'");

    expect(bobMessages).toHaveLength(1);
    const bobParsed = JSON.parse(bobMessages[0]);
    expect(bobParsed.details.message).toBe("Dorian said 'wave'");
    expect(bobParsed.sub).toEqual({ name: "Dorian", email: "alice@example.com" });

    ws1.close(1000, "done");
    ws2.close(1000, "done");
  });

  it("processInput broadcasts only within the sender's current room", async () => {
    await ensureZone30WorldData();
    const stub = env.ZONE_PROCESSOR.getByName("ws-room-chat");

    const aliceResponse = await connectWebSocket(stub, "alice@example.com", "sub-a", "Alice");
    const aliceWs = aliceResponse.webSocket!;
    aliceWs.accept();

    const bobResponse = await connectWebSocket(stub, "bob@example.com", "sub-b", "Bob");
    const bobWs = bobResponse.webSocket!;
    bobWs.accept();

    const aliceMessages: string[] = [];
    const bobMessages: string[] = [];
    aliceWs.addEventListener("message", (event) => {
      aliceMessages.push(event.data as string);
    });
    bobWs.addEventListener("message", (event) => {
      bobMessages.push(event.data as string);
    });

    await waitForWebSocketDelivery();
    aliceMessages.length = 0;
    bobMessages.length = 0;

    await stub.moveRoom("alice@example.com", "NORTH");
    await waitForWebSocketDelivery();
    aliceMessages.length = 0;
    bobMessages.length = 0;

    await stub.processInput("alice@example.com", "hello");
    await waitForWebSocketDelivery();

    expect(parseMessages(aliceMessages)).toContainEqual({
      type: "message",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { message: "You said 'hello'" }
    });
    expect(bobMessages).toEqual([]);

    aliceWs.close(1000, "done");
    bobWs.close(1000, "done");
  });

  it("second connection from same user evicts the first", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("ws-evict");

    const res1 = await connectWebSocket(stub, "alice@example.com");
    const ws1 = res1.webSocket!;
    ws1.accept();

    let ws1Closed = false;
    ws1.addEventListener("close", () => {
      ws1Closed = true;
    });

    // Open a second connection for the same user.
    const res2 = await connectWebSocket(stub, "alice@example.com");
    const ws2 = res2.webSocket!;
    ws2.accept();

    await waitForWebSocketDelivery();

    expect(ws1Closed).toBe(true);

    // New socket should still receive broadcasts.
    const messages: string[] = [];
    ws2.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    await waitForWebSocketDelivery();
    messages.length = 0;

    await stub.processInput("alice@example.com", "hello");
    await waitForWebSocketDelivery();

    expect(messages).toHaveLength(1);

    ws2.close(1000, "done");
  });

  it("client messages on WebSocket do not cause errors", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("ws-msg");
    const response = await connectWebSocket(stub, "test@example.com");
    const ws = response.webSocket!;
    ws.accept();

    // Sending a message on the WebSocket should be handled gracefully
    // (logged, but no error).
    ws.send("unexpected message");
    await waitForWebSocketDelivery();

    ws.close(1000, "done");
  });

  it("moveRoom broadcasts leave and enter messages for a valid exit", async () => {
    await ensureZone30WorldData();
    const stub = env.ZONE_PROCESSOR.getByName("ws-move-valid");

    const aliceResponse = await connectWebSocket(stub, "alice@example.com", "sub-a", "Alice");
    const aliceWs = aliceResponse.webSocket!;
    aliceWs.accept();

    const bobResponse = await connectWebSocket(stub, "bob@example.com", "sub-b", "Bob");
    const bobWs = bobResponse.webSocket!;
    bobWs.accept();

    const aliceMessages: string[] = [];
    const bobMessages: string[] = [];
    aliceWs.addEventListener("message", (event) => {
      aliceMessages.push(event.data as string);
    });
    bobWs.addEventListener("message", (event) => {
      bobMessages.push(event.data as string);
    });

    await waitForWebSocketDelivery();
    aliceMessages.length = 0;
    bobMessages.length = 0;

    await stub.moveRoom("alice@example.com", "NORTH");
    await waitForWebSocketDelivery();

    const aliceParsed = parseMessages(aliceMessages);
    const bobParsed = parseMessages(bobMessages);

    expect(aliceParsed).toContainEqual({
      type: "leave_room",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { player: "Alice", direction: "NORTH", oldRoomId: 3001, newRoomId: 3054 }
    });
    expect(aliceParsed).toContainEqual({
      type: "enter_room",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { player: "Alice", direction: "SOUTH", oldRoomId: 3001, newRoomId: 3054 }
    });
    expect(bobParsed).toContainEqual({
      type: "leave_room",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { player: "Alice", direction: "NORTH", oldRoomId: 3001, newRoomId: 3054 }
    });
    expect(bobParsed.some((message) => message.type === "enter_room")).toBe(false);

    aliceWs.close(1000, "done");
    bobWs.close(1000, "done");
  });

  it("moveRoom sends a message when there is no exit", async () => {
    await ensureZone30WorldData();
    const stub = env.ZONE_PROCESSOR.getByName("ws-move-invalid");
    const response = await connectWebSocket(stub, "alice@example.com", "sub-a", "Alice");
    const ws = response.webSocket!;
    ws.accept();

    const messages: string[] = [];
    ws.addEventListener("message", (event) => {
      messages.push(event.data as string);
    });

    await waitForWebSocketDelivery();
    messages.length = 0;

    await stub.moveRoom("alice@example.com", "SOUTHWEST");
    await waitForWebSocketDelivery();

    expect(parseMessages(messages)).toContainEqual({
      type: "message",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { message: "You cannot go that way." }
    });

    ws.close(1000, "done");
  });

  it("moveRoom blocks exits that leave zone 30 for now", async () => {
    await ensureZone30WorldData();
    const stub = env.ZONE_PROCESSOR.getByName("ws-move-cross-zone");
    const response = await connectWebSocket(stub, "alice@example.com", "sub-a", "Alice");
    const ws = response.webSocket!;
    ws.accept();

    const messages: string[] = [];
    ws.addEventListener("message", (event) => {
      messages.push(event.data as string);
    });

    await waitForWebSocketDelivery();
    messages.length = 0;

    await stub.moveRoom("alice@example.com", "UP");
    await waitForWebSocketDelivery();

    expect(parseMessages(messages)).toContainEqual({
      type: "message",
      sub: { name: "Alice", email: "alice@example.com" },
      details: { message: "You cannot go that way yet." }
    });

    ws.close(1000, "done");
  });

  it("getRoomInfo returns room details and other connected players", async () => {
    await ensureZone30WorldData();
    const stub = env.ZONE_PROCESSOR.getByName("room-info");

    const aliceResponse = await connectWebSocket(stub, "alice@example.com", "sub-a", "Alice");
    const aliceWs = aliceResponse.webSocket!;
    aliceWs.accept();

    const bobResponse = await connectWebSocket(stub, "bob@example.com", "sub-b", "Bob");
    const bobWs = bobResponse.webSocket!;
    bobWs.accept();

    await waitForWebSocketDelivery();

    const room = await stub.getRoomInfo("alice@example.com", 3001);

    expect(room).toMatchObject({
      vnum: 3001,
      name: expect.any(String),
      description: expect.any(String),
      players: ["Bob"]
    });
    expect(room?.exits.some((exit) => exit.direction === "NORTH" && exit.targetRoom === 3054)).toBe(
      true
    );

    aliceWs.close(1000, "done");
    bobWs.close(1000, "done");
  });

  it("getRoomInfo returns null when the requester is not in that room", async () => {
    await ensureZone30WorldData();
    const stub = env.ZONE_PROCESSOR.getByName("room-info-denied");
    const response = await connectWebSocket(stub, "alice@example.com", "sub-a", "Alice");
    const ws = response.webSocket!;
    ws.accept();

    await waitForWebSocketDelivery();

    await expect(stub.getRoomInfo("alice@example.com", 3054)).resolves.toBeNull();

    ws.close(1000, "done");
  });
});
