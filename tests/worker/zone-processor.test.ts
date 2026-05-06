import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

/** Helper: connect a WebSocket to a ZoneProcessor stub and return the client socket. */
function connectWebSocket(
  stub: DurableObjectStub,
  email: string,
  sub = "sub-123",
) {
  return stub.fetch("http://fake-host/", {
    headers: {
      Upgrade: "websocket",
      "X-User-Email": email,
      "X-User-Sub": sub,
    },
  });
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
      headers: { Upgrade: "websocket" },
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

  it("processInput does not throw when no sockets are connected", async () => {
    const stub = env.ZONE_PROCESSOR.getByName("test-zone-empty");
    await expect(
      stub.processInput("nobody@example.com", "hello"),
    ).resolves.toBeUndefined();
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

    await stub.processInput("alice@example.com", "look");

    // Give the event loop a tick for the message to arrive.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed).toEqual({
      type: "message",
      sub: "alice@example.com",
      details: { message: "You said 'look'" },
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

    await stub.processInput("alice@example.com", "wave");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(aliceMessages).toHaveLength(1);
    expect(JSON.parse(aliceMessages[0]).details.message).toBe("You said 'wave'");

    expect(bobMessages).toHaveLength(1);
    expect(JSON.parse(bobMessages[0]).details.message).toBe(
      "alice@example.com said 'wave'",
    );

    ws1.close(1000, "done");
    ws2.close(1000, "done");
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(ws1Closed).toBe(true);

    // New socket should still receive broadcasts.
    const messages: string[] = [];
    ws2.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    await stub.processInput("alice@example.com", "hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

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
    await new Promise((resolve) => setTimeout(resolve, 50));

    ws.close(1000, "done");
  });
});
