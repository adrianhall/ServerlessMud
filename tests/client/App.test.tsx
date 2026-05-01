import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "../../src/client/App";

/** Build a successful JSON response. */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

const VERSION_RESPONSE = { name: "ServerlessMud", version: "0.0.1" };
const HEALTH_RESPONSE = { status: "ok", timestamp: "2026-01-01T00:00:00.000Z" };
const USER_RESPONSE = { email: "player@example.com", id: "user-123" };

beforeEach(() => {
  // Default: both fetches succeed. Individual tests override as needed.
  vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/health")) return Promise.resolve(jsonResponse(HEALTH_RESPONSE));
    if (url.includes("/api/me")) return Promise.resolve(jsonResponse(USER_RESPONSE));
    return Promise.resolve(jsonResponse(VERSION_RESPONSE));
  });
});

describe("App", () => {
  it("renders the loading state initially", () => {
    render(<App />);
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("renders the page heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ServerlessMud");
  });

  it("shows connected state after successful fetch", async () => {
    render(<App />);
    expect(await screen.findByText(/Connected to ServerlessMud v0\.0\.1/)).toBeInTheDocument();
  });

  it("shows health status after successful fetch", async () => {
    render(<App />);
    expect(await screen.findByText(/Health: ok/)).toBeInTheDocument();
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
  });

  it("shows error message when version fetch rejects with an Error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));

    render(<App />);
    expect(await screen.findByText("API error: Network failure")).toBeInTheDocument();
  });

  it("shows 'Unknown error' when fetch rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("something went wrong");

    render(<App />);
    expect(await screen.findByText("API error: Unknown error")).toBeInTheDocument();
  });

  it("shows error when version API responds with non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/health")) return Promise.resolve(jsonResponse(HEALTH_RESPONSE));
      if (url.includes("/api/me")) return Promise.resolve(jsonResponse(USER_RESPONSE));
      return Promise.resolve(new Response(null, { status: 500 }));
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/API error:/)).toBeInTheDocument();
    });
    expect(screen.getByText("API error: API responded with 500")).toBeInTheDocument();
  });

  it("displays the user email and ID", async () => {
    render(<App />);
    expect(await screen.findByText("player@example.com")).toBeInTheDocument();
    expect(screen.getByText("user-123")).toBeInTheDocument();
  });

  it("shows error when user API responds with non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/health")) return Promise.resolve(jsonResponse(HEALTH_RESPONSE));
      if (url.includes("/api/me")) return Promise.resolve(new Response(null, { status: 403 }));
      return Promise.resolve(jsonResponse(VERSION_RESPONSE));
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/API error:/)).toBeInTheDocument();
    });
    expect(screen.getByText("API error: User API responded with 403")).toBeInTheDocument();
  });

  it("shows error when health API responds with non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/health")) return Promise.resolve(new Response(null, { status: 401 }));
      if (url.includes("/api/me")) return Promise.resolve(jsonResponse(USER_RESPONSE));
      return Promise.resolve(jsonResponse(VERSION_RESPONSE));
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/API error:/)).toBeInTheDocument();
    });
    expect(screen.getByText("API error: Health API responded with 401")).toBeInTheDocument();
  });

  it("renders Start Game button when user is loaded", async () => {
    render(<App />);
    expect(await screen.findByText("Start Game")).toBeInTheDocument();
  });

  it("switches to GameDisplay when Start Game is clicked", async () => {
    // Stub WebSocket so GameDisplay doesn't fail in happy-dom.
    class MockWS {
      onopen: (() => void) | null = null;
      onmessage: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onopen?.());
      }
      close() {
        this.onclose?.();
      }
    }
    vi.stubGlobal("WebSocket", MockWS);

    render(<App />);

    const btn = await screen.findByText("Start Game");
    fireEvent.click(btn);

    // GameDisplay should be rendered -- look for the command input.
    expect(screen.getByPlaceholderText("Enter command...")).toBeInTheDocument();

    // Landing content should be gone.
    expect(screen.queryByText("A MUD game built on Cloudflare Workers")).not.toBeInTheDocument();
  });
});
