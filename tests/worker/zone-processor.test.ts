import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

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
    const stub = env.ZONE_PROCESSOR.getByName("test-zone");
    const response = await stub.fetch("http://fake-host/", {
      headers: {
        Upgrade: "websocket",
        "X-User-Email": "test@example.com",
        "X-User-Sub": "sub-123",
      },
    });

    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
  });
});
