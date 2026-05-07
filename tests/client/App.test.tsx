import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "@src/client/App";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const VERSION_RESPONSE = { name: "ServerlessMud", version: "0.0.1" };
const USER_RESPONSE = { email: "player@example.com", id: "user-123" };
const CHARACTER_RESPONSE = {
  userEmail: "player@example.com",
  name: "Dorian",
  gender: "Neutral",
  lastUsed: "2026-01-01T00:00:00.000Z"
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/me")) return Promise.resolve(jsonResponse(USER_RESPONSE));
    if (url.includes("/api/player-characters")) {
      return Promise.resolve(jsonResponse({ characters: [CHARACTER_RESPONSE] }));
    }
    return Promise.resolve(jsonResponse(VERSION_RESPONSE));
  });
});

describe("App", () => {
  it("renders the home page banner, enter button, and copyright", async () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Enter the game" })).toBeDisabled();
    expect(await screen.findByText("player@example.com")).toBeInTheDocument();
    expect(screen.getByText("user-123")).toBeInTheDocument();
    expect(screen.getByText("v0.0.1")).toBeInTheDocument();
    expect(screen.getByText("\u00a9 2026 Adrian Hall")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter the game" })).toBeEnabled();
  });

  it("shows error message when version fetch rejects with an Error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));

    render(<App />);
    expect(await screen.findByText("API error: Network failure")).toBeInTheDocument();
  });

  it("shows Unknown error when fetch rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("something went wrong");

    render(<App />);
    expect(await screen.findByText("API error: Unknown error")).toBeInTheDocument();
  });

  it("shows error when version API responds with non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/me")) return Promise.resolve(jsonResponse(USER_RESPONSE));
      return Promise.resolve(new Response(null, { status: 500 }));
    });

    render(<App />);
    expect(await screen.findByText("API error: API responded with 500")).toBeInTheDocument();
  });

  it("shows error when user API responds with non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/me")) return Promise.resolve(new Response(null, { status: 403 }));
      return Promise.resolve(jsonResponse(VERSION_RESPONSE));
    });

    render(<App />);
    expect(await screen.findByText("API error: User API responded with 403")).toBeInTheDocument();
  });

  it("opens character selection and enters the game with a selected character", async () => {
    class MockWS {
      onopen: (() => void) | null = null;
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

    fireEvent.click(await screen.findByRole("button", { name: "Enter the game" }));
    fireEvent.click(await screen.findByRole("button", { name: /Dorian/ }));

    expect(await screen.findByPlaceholderText("Enter command...")).toBeInTheDocument();
    expect(screen.getByText("Playing Dorian")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Exit Game" }));
    expect(await screen.findByRole("button", { name: "Enter the game" })).toBeInTheDocument();
  });

  it("opens create-character mode automatically for a new user", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/me")) return Promise.resolve(jsonResponse(USER_RESPONSE));
      if (url.includes("/api/player-characters")) {
        return Promise.resolve(jsonResponse({ characters: [] }));
      }
      return Promise.resolve(jsonResponse(VERSION_RESPONSE));
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Enter the game" }));
    expect(await screen.findByRole("heading", { name: "Create a character" })).toBeInTheDocument();
  });
});
