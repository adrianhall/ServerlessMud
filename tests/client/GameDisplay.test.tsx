import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GameDisplay from "@src/client/GameDisplay";
import type { PlayerCharacter } from "@src/shared/player-character";

// ---------------------------------------------------------------------------
// Minimal WebSocket mock for happy-dom
// ---------------------------------------------------------------------------

type WSListener = (event: { data?: string }) => void;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: WSListener | null = null;
  onmessage: WSListener | null = null;
  onerror: WSListener | null = null;
  onclose: WSListener | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate async open so the component's useEffect wires up handlers first.
    queueMicrotask(() => this.onopen?.({ data: undefined }));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ data: undefined });
  }

  /** Test helper: push a message from the "server". */
  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  /** Test helper: trigger an error event. */
  simulateError() {
    this.onerror?.({ data: undefined });
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

const TEST_CHARACTER: PlayerCharacter = {
  userEmail: "player@example.com",
  name: "Dorian",
  gender: "Neutral",
  lastUsed: "2026-01-01T00:00:00.000Z"
};

function renderGameDisplay() {
  return render(
    <GameDisplay
      info={{ name: "ServerlessMud", version: "0.0.1" }}
      user={{ email: "player@example.com", id: "user-123" }}
      character={TEST_CHARACTER}
      onExitGame={vi.fn()}
    />
  );
}

describe("GameDisplay", () => {
  it("renders the terminal UI elements", () => {
    renderGameDisplay();

    // Status indicator
    expect(screen.getByText(/Connected|Disconnected/)).toBeInTheDocument();

    // Prompt character
    expect(screen.getByText(">")).toBeInTheDocument();

    // Input field
    expect(screen.getByPlaceholderText("Enter command...")).toBeInTheDocument();
  });

  it("displays Connected status after WebSocket opens", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });
  });

  it("displays Disconnected status after WebSocket closes", async () => {
    renderGameDisplay();

    // Wait for connection, then close.
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.close();

    await waitFor(() => {
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });
  });

  it("renders received WebSocket messages", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage('{"type":"message","sub":{"name":"Dorian","email":"a@b.com"},"details":{"message":"Hello"}}');

    await waitFor(() => {
      expect(
        screen.getByText('{"type":"message","sub":{"name":"Dorian","email":"a@b.com"},"details":{"message":"Hello"}}')
      ).toBeInTheDocument();
    });
  });

  it("submits input on Enter via POST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter command...");
    fireEvent.change(input, { target: { value: "look" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/game/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "look" }),
      });
    });

    // Input should be cleared after submit.
    expect(input).toHaveValue("");
  });

  it("does not submit empty input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    renderGameDisplay();

    const input = screen.getByPlaceholderText("Enter command...");
    fireEvent.submit(input.closest("form")!);

    // fetch should not have been called (the stub for WebSocket has no fetch calls).
    // Wait a tick to ensure no async submit happened.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows error message in output when POST fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter command...");
    fireEvent.change(input, { target: { value: "bad-command" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("[error] Server responded with 500")).toBeInTheDocument();
    });
  });

  it("shows error message in output when POST throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter command...");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("[error] Network failure")).toBeInTheDocument();
    });
  });

  it("connects WebSocket with selected character name", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(MockWebSocket.instances[0]?.url).toContain(
        "/api/game/connect?characterName=Dorian"
      );
    });
  });

  it("renders banner profile, character, and exit action", () => {
    const onExitGame = vi.fn();

    render(
      <GameDisplay
        info={{ name: "ServerlessMud", version: "0.0.1" }}
        user={{ email: "player@example.com", id: "user-123" }}
        character={TEST_CHARACTER}
        onExitGame={onExitGame}
      />
    );

    expect(screen.getByText("player@example.com")).toBeInTheDocument();
    expect(screen.getByText("Playing Dorian")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Exit Game" }));
    expect(onExitGame).toHaveBeenCalledOnce();
  });
});
