import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GameDisplay from "../../src/client/GameDisplay";

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

describe("GameDisplay", () => {
  it("renders the terminal UI elements", () => {
    render(<GameDisplay userEmail="player@example.com" />);

    // Status indicator
    expect(screen.getByText(/Connected|Disconnected/)).toBeInTheDocument();

    // Prompt character
    expect(screen.getByText(">")).toBeInTheDocument();

    // Input field
    expect(screen.getByPlaceholderText("Enter command...")).toBeInTheDocument();
  });

  it("displays Connected status after WebSocket opens", async () => {
    render(<GameDisplay userEmail="player@example.com" />);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });
  });

  it("displays Disconnected status after WebSocket closes", async () => {
    render(<GameDisplay userEmail="player@example.com" />);

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
    render(<GameDisplay userEmail="player@example.com" />);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage('{"type":"message","sub":"a@b.com","details":{"message":"Hello"}}');

    await waitFor(() => {
      expect(
        screen.getByText('{"type":"message","sub":"a@b.com","details":{"message":"Hello"}}')
      ).toBeInTheDocument();
    });
  });

  it("submits input on Enter via POST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    render(<GameDisplay userEmail="player@example.com" />);

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

    render(<GameDisplay userEmail="player@example.com" />);

    const input = screen.getByPlaceholderText("Enter command...");
    fireEvent.submit(input.closest("form")!);

    // fetch should not have been called (the stub for WebSocket has no fetch calls).
    // Wait a tick to ensure no async submit happened.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows error message in output when POST fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    );

    render(<GameDisplay userEmail="player@example.com" />);

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

    render(<GameDisplay userEmail="player@example.com" />);

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
});
