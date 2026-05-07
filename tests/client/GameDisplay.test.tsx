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
  vi.restoreAllMocks();
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
    ws.simulateMessage(
      '{"type":"message","sub":{"name":"Dorian","email":"a@b.com"},"details":{"message":"Hello"}}'
    );

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });

  it("renders message payloads without a string message field", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "message",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { value: 1 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText('{"value":1}')).toBeInTheDocument();
    });
  });

  it("renders server error messages in red", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "error",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { message: "Huh?" }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Huh?")).toHaveClass("error");
    });
  });

  it("renders non-JSON WebSocket messages as raw text", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage("not json");

    await waitFor(() => {
      expect(screen.getByText("not json")).toBeInTheDocument();
    });
  });

  it("renders unknown structured WebSocket messages", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const raw = JSON.stringify({
      type: "unknown",
      sub: { name: "Dorian", email: "player@example.com" },
      details: { value: 1 }
    });
    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(raw);

    await waitFor(() => {
      expect(screen.getByText(raw)).toBeInTheDocument();
    });
  });

  it("renders malformed structured WebSocket messages as raw text", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const invalidMessages = [
      JSON.stringify({
        type: 1,
        sub: { name: "Dorian", email: "player@example.com" },
        details: {}
      }),
      JSON.stringify({ type: "message", sub: null, details: {} }),
      JSON.stringify({
        type: "message",
        sub: { name: 1, email: "player@example.com" },
        details: {}
      }),
      JSON.stringify({
        type: "message",
        sub: { name: "Dorian", email: "player@example.com" },
        details: null
      })
    ];

    const ws = MockWebSocket.instances[0]!;
    for (const message of invalidMessages) {
      ws.simulateMessage(message);
    }

    await waitFor(() => {
      for (const message of invalidMessages) {
        expect(screen.getByText(message)).toBeInTheDocument();
      }
    });
  });

  it("shows WebSocket connection errors", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateError();

    await waitFor(() => {
      expect(screen.getByText("WebSocket connection error")).toBeInTheDocument();
    });
  });

  it("fetches and renders room details when the player enters a room", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          vnum: 3001,
          name: "The Temple Of Midgaard",
          description: "A quiet temple room.",
          exits: [{ direction: "NORTH" }, { direction: "SOUTH" }],
          players: ["Bob"]
        }),
        { status: 200 }
      )
    );

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: null, oldRoomId: null, newRoomId: 3001 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("You enter the game.")).toBeInTheDocument();
      expect(screen.getByText(/\[3001\] The Temple Of Midgaard/)).toBeInTheDocument();
      expect(screen.getByText(/Exits: NORTH, SOUTH/)).toBeInTheDocument();
      expect(screen.getByText(/Also here: Bob/)).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/game/rooms/3001");
  });

  it("uses the selected character email when the user profile is unavailable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          vnum: 3001,
          name: "The Temple Of Midgaard",
          description: "A quiet temple room.",
          exits: [],
          players: []
        }),
        { status: 200 }
      )
    );

    render(
      <GameDisplay
        info={{ name: "ServerlessMud", version: "0.0.1" }}
        user={null}
        character={TEST_CHARACTER}
        onExitGame={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: null, oldRoomId: null, newRoomId: 3001 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("You enter the game.")).toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalledWith("/api/game/rooms/3001");
    });
  });

  it("does not load room details when self enter_room has no numeric room id", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: null, oldRoomId: null, newRoomId: "3001" }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("You enter the game.")).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders rooms with no visible exits or other players", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          vnum: 3054,
          name: "The Altar",
          description: "A quiet altar room.",
          exits: [],
          players: []
        }),
        { status: 200 }
      )
    );

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: "SOUTH", oldRoomId: 3001, newRoomId: 3054 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/\[3054\] The Altar/)).toBeInTheDocument();
      expect(screen.getByText(/Exits: none/)).toBeInTheDocument();
    });
  });

  it("shows room lookup errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: "SOUTH", oldRoomId: 3001, newRoomId: 3054 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("You enter from the SOUTH")).toBeInTheDocument();
      expect(screen.getByText("[error] Room lookup failed with 404")).toBeInTheDocument();
    });
  });

  it("shows room lookup exceptions", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Room fetch failed"));

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: "SOUTH", oldRoomId: 3001, newRoomId: 3054 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("[error] Room fetch failed")).toBeInTheDocument();
    });
  });

  it("shows Unknown error when room lookup rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("Room fetch failed");

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: "SOUTH", oldRoomId: 3001, newRoomId: 3054 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("[error] Unknown error")).toBeInTheDocument();
    });
  });

  it("renders movement notifications for other players", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "leave_room",
        sub: { name: "Bob", email: "bob@example.com" },
        details: { player: "Bob", direction: "NORTH", oldRoomId: 3001, newRoomId: 3054 }
      })
    );
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Bob", email: "bob@example.com" },
        details: { player: "Bob", direction: "SOUTH", oldRoomId: 3001, newRoomId: 3054 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Bob departs NORTH")).toBeInTheDocument();
      expect(screen.getByText("Bob enters from the SOUTH")).toBeInTheDocument();
    });
  });

  it("renders movement notifications for the current player and direction fallbacks", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const ws = MockWebSocket.instances[0]!;
    ws.simulateMessage(
      JSON.stringify({
        type: "leave_room",
        sub: { name: "Dorian", email: "player@example.com" },
        details: { player: "Dorian", direction: "NORTH", oldRoomId: 3001, newRoomId: 3054 }
      })
    );
    ws.simulateMessage(
      JSON.stringify({
        type: "leave_room",
        sub: { name: "Bob", email: "bob@example.com" },
        details: { player: "Bob", oldRoomId: 3001, newRoomId: 3054 }
      })
    );
    ws.simulateMessage(
      JSON.stringify({
        type: "enter_room",
        sub: { name: "Bob", email: "bob@example.com" },
        details: { player: "Bob", direction: null, oldRoomId: null, newRoomId: 3001 }
      })
    );

    await waitFor(() => {
      expect(screen.getByText("You depart NORTH")).toBeInTheDocument();
      expect(screen.getByText("Bob departs somewhere")).toBeInTheDocument();
      expect(screen.getByText("Bob enters the game.")).toBeInTheDocument();
    });
  });

  it("submits input on Enter via POST", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

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
        body: JSON.stringify({ text: "look" })
      });
    });

    // Input should be cleared after submit.
    expect(input).toHaveValue("");
  });

  it("intercepts help locally and does not POST", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter command...");
    fireEvent.change(input, { target: { value: "help" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/Commands:/)).toHaveClass("help");
      expect(screen.getByText(/say <message>/)).toBeInTheDocument();
      expect(screen.getByText(/tell <player> <message>/)).toBeInTheDocument();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("does not submit empty input", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

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

  it("shows Unknown error when POST rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("Network failure");

    renderGameDisplay();

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter command...");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("[error] Unknown error")).toBeInTheDocument();
    });
  });

  it("connects WebSocket with selected character name", async () => {
    renderGameDisplay();

    await waitFor(() => {
      expect(MockWebSocket.instances[0]?.url).toContain("/api/game/connect?characterName=Dorian");
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
