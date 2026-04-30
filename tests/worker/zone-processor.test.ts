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
});
