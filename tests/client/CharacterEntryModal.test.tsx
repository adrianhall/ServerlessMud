import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CharacterEntryModal from "@src/client/CharacterEntryModal";
import type { PlayerCharacter } from "@src/shared/player-character";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function character(name: string, lastUsed = "2026-01-01T00:00:00.000Z"): PlayerCharacter {
  return {
    userEmail: "player@example.com",
    name,
    gender: "Neutral",
    lastUsed
  };
}

function mockFetchForCharacters(characters: PlayerCharacter[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request, init) => {
    const url =
      typeof input === "string" ? input
      : input instanceof URL ? input.href
      : input.url;
    if (url.includes("/availability")) {
      const query = new URL(url, "https://example.com").searchParams.get("name") ?? "";
      if (query.toLowerCase() === "taken1") {
        return Promise.resolve(
          jsonResponse({
            available: false,
            valid: true,
            normalizedName: query,
            reason: "duplicate"
          })
        );
      }
      return Promise.resolve(
        jsonResponse({ available: true, valid: true, normalizedName: "Dorian", reason: null })
      );
    }

    if (init?.method === "POST") {
      return Promise.resolve(jsonResponse({ character: character("Dorian") }, 201));
    }

    return Promise.resolve(jsonResponse({ characters }));
  });
}

beforeEach(() => {
  mockFetchForCharacters();
});

describe("CharacterEntryModal", () => {
  it("renders nothing when closed", () => {
    render(<CharacterEntryModal open={false} onClose={vi.fn()} onEnterGame={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("loads existing characters and allows selecting one", async () => {
    mockFetchForCharacters([character("Dorian")]);
    const onEnterGame = vi.fn();

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={onEnterGame} />);

    fireEvent.click(await screen.findByRole("button", { name: /Dorian/ }));
    expect(onEnterGame).toHaveBeenCalledWith(expect.objectContaining({ name: "Dorian" }));
  });

  it("shows create mode automatically when no characters exist", async () => {
    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Create a character" })).toBeInTheDocument();
  });

  it("closes when the close button is clicked", async () => {
    const onClose = vi.fn();

    render(<CharacterEntryModal open onClose={onClose} onEnterGame={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps Create disabled until name is available and gender is selected", async () => {
    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    const createButton = await screen.findByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Dorian"), { target: { value: "dorian" } });
    expect(await screen.findByText("Name available: Dorian")).toBeInTheDocument();
    expect(createButton).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Neutral" }));
    expect(createButton).toBeEnabled();
  });

  it("shows validation and duplicate-name errors", async () => {
    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("Dorian"), { target: { value: "ab" } });
    expect(screen.getByText("Use ASCII letters and numbers only.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Dorian"), { target: { value: "taken1" } });
    expect(await screen.findByText("That character name is already taken.")).toBeInTheDocument();
  });

  it("creates a character and enters the game", async () => {
    const onEnterGame = vi.fn();

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={onEnterGame} />);

    fireEvent.change(await screen.findByPlaceholderText("Dorian"), { target: { value: "dorian" } });
    await screen.findByText("Name available: Dorian");
    fireEvent.click(screen.getByRole("radio", { name: "Neutral" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onEnterGame).toHaveBeenCalledWith(expect.objectContaining({ name: "Dorian" }));
    });
  });

  it("shows create API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request, init) => {
      const url =
        typeof input === "string" ? input
        : input instanceof URL ? input.href
        : input.url;
      if (url.includes("/availability")) {
        return Promise.resolve(
          jsonResponse({ available: true, valid: true, normalizedName: "Dorian", reason: null })
        );
      }
      if (init?.method === "POST") return Promise.resolve(new Response(null, { status: 500 }));
      return Promise.resolve(jsonResponse({ characters: [] }));
    });

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("Dorian"), { target: { value: "dorian" } });
    await screen.findByText("Name available: Dorian");
    fireEvent.click(screen.getByRole("radio", { name: "Neutral" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Create character responded with 500")).toBeInTheDocument();
  });

  it("disables creating a new character when the limit is reached", async () => {
    mockFetchForCharacters(Array.from({ length: 8 }, (_, i) => character(`Hero${i}`)));

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    const createLink = await screen.findByRole("button", { name: "+ Create a new character" });
    expect(createLink).toBeDisabled();
  });

  it("can return from create mode to character selection", async () => {
    mockFetchForCharacters([character("Dorian")]);

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "+ Create a new character" }));
    expect(await screen.findByRole("heading", { name: "Create a character" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Select a character" })).toBeInTheDocument();
  });

  it("shows load and availability API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    expect(await screen.findByText("Character API responded with 500")).toBeInTheDocument();
  });

  it("shows Unknown error when character loading rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("load failed");

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    expect(await screen.findByText("Unknown error")).toBeInTheDocument();
  });

  it("shows availability API non-ok errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input
        : input instanceof URL ? input.href
        : input.url;
      if (url.includes("/availability"))
        return Promise.resolve(new Response(null, { status: 503 }));
      return Promise.resolve(jsonResponse({ characters: [] }));
    });

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("Dorian"), { target: { value: "dorian" } });

    expect(await screen.findByText("Availability API responded with 503")).toBeInTheDocument();
  });

  it("shows Unknown error when availability rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input
        : input instanceof URL ? input.href
        : input.url;
      if (url.includes("/availability")) return Promise.reject("availability failed");
      return Promise.resolve(jsonResponse({ characters: [] }));
    });

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("Dorian"), { target: { value: "dorian" } });

    expect(await screen.findByText("Unknown error")).toBeInTheDocument();
  });

  it("ignores create submit while the form is incomplete", async () => {
    const fetchSpy = mockFetchForCharacters();

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    const form = (await screen.findByPlaceholderText("Dorian")).closest("form")!;
    fireEvent.submit(form);

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shows Unknown error when create rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request, init) => {
      const url =
        typeof input === "string" ? input
        : input instanceof URL ? input.href
        : input.url;
      if (url.includes("/availability")) {
        return Promise.resolve(
          jsonResponse({ available: true, valid: true, normalizedName: "Dorian", reason: null })
        );
      }
      if (init?.method === "POST") return Promise.reject("create failed");
      return Promise.resolve(jsonResponse({ characters: [] }));
    });

    render(<CharacterEntryModal open onClose={vi.fn()} onEnterGame={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("Dorian"), { target: { value: "dorian" } });
    await screen.findByText("Name available: Dorian");
    fireEvent.click(screen.getByRole("radio", { name: "Neutral" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Unknown error")).toBeInTheDocument();
  });
});
