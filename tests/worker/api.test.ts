import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { signDevJwt, JWT_HEADER } from "@lib/cloudflare-auth";

describe("API routes", () => {
  it("GET /api/version returns name and version (public)", async () => {
    const response = await SELF.fetch("https://example.com/api/version");
    expect(response.status).toBe(200);

    const data = (await response.json()) as { name: string; version: string };
    expect(data).toEqual({ name: "ServerlessMud", version: "0.0.1" });
  });

  it("GET /api/health is rejected without authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/health", { redirect: "manual" });
    // Dev middleware redirects unauthenticated requests to login.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/_auth/login");
  });

  it("GET /api/me returns user email and id when authenticated", async () => {
    const token = await signDevJwt("test@example.com");
    const response = await SELF.fetch("https://example.com/api/me", {
      headers: { [JWT_HEADER]: token }
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { email: string; id: string };
    expect(data.email).toBe("test@example.com");
    expect(data.id).toBe("dev-test@example.com");
  });

  it("GET /api/health returns health status when authenticated", async () => {
    const token = await signDevJwt("test@example.com");
    const response = await SELF.fetch("https://example.com/api/health", {
      headers: { [JWT_HEADER]: token }
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { status: string; timestamp: string };
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeTruthy();
  });

  it("POST /api/game/input returns 200 with valid input", async () => {
    const token = await signDevJwt("test@example.com");
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        [JWT_HEADER]: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { ok: boolean };
    expect(data).toEqual({ ok: true });
  });

  it("POST /api/game/input returns 400 with missing text", async () => {
    const token = await signDevJwt("test@example.com");
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        [JWT_HEADER]: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  it("POST /api/game/input returns 400 with empty text", async () => {
    const token = await signDevJwt("test@example.com");
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        [JWT_HEADER]: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("GET /api/game/connect returns 400 without upgrade header", async () => {
    const token = await signDevJwt("test@example.com");
    const response = await SELF.fetch("https://example.com/api/game/connect", {
      headers: { [JWT_HEADER]: token },
    });
    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Expected WebSocket upgrade");
  });
});
