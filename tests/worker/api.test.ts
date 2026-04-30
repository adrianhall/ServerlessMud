import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("API routes", () => {
  it("GET /api/version returns name and version", async () => {
    const response = await SELF.fetch("https://example.com/api/version");
    expect(response.status).toBe(200);

    const data = (await response.json()) as { name: string; version: string };
    expect(data).toEqual({ name: "ServerlessMud", version: "0.0.1" });
  });

  it("GET /api/health returns health status from ZoneProcessor", async () => {
    const response = await SELF.fetch("https://example.com/api/health");
    expect(response.status).toBe(200);

    const data = (await response.json()) as { status: string; timestamp: string };
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeTruthy();
  });
});
