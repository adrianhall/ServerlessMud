import { useEffect, useRef, useState } from "react";
import type { PlayerCharacter } from "../shared/player-character";
import AppBanner from "./AppBanner";
import GameInput from "./GameInput";
import GameOutput from "./GameOutput";

interface GameMessage {
  type: string;
  sub: { name: string; email: string };
  details: Record<string, unknown>;
}

interface OutputMessage {
  text: string;
  tone?: "error" | "help";
}

interface RoomInfo {
  vnum: number;
  name: string;
  description: string;
  exits: Array<{ direction: string }>;
  players: string[];
}

interface GameDisplayProps {
  info: { name: string; version: string } | null;
  user: { email: string; id: string } | null;
  character: PlayerCharacter;
  onExitGame: () => void;
}

const HELP_TEXT = [
  "Commands:",
  "  Movement: north, south, east, west, up, down, northwest, northeast, southeast, southwest",
  "  Movement aliases: n, s, e, w, u, d, nw, ne, se, sw",
  "  go <direction> - move in a direction",
  "  say <message> - speak to everyone in your room",
  "  shout <message> - broadcast to everyone in the zone",
  "  tell <player> <message> - send a private message to a player in the zone",
  "  help - show this command list"
].join("\n");

/** Game terminal with WebSocket connection and command input. */
function GameDisplay({ info, user, character, onExitGame }: GameDisplayProps) {
  const [messages, setMessages] = useState<OutputMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomLoadSequence = useRef(0);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const characterName = encodeURIComponent(character.name);
    const url = `${protocol}//${location.host}/api/game/connect?characterName=${characterName}`;
    const ws = new WebSocket(url);
    const currentUserEmail = user?.email ?? character.userEmail;
    let active = true;

    const appendMessage = (message: OutputMessage) => {
      if (active) {
        setMessages((prev) => [...prev, message]);
      }
    };

    const loadRoom = async (roomId: number) => {
      const sequence = ++roomLoadSequence.current;

      try {
        const res = await fetch(`/api/game/rooms/${roomId}`);
        if (sequence !== roomLoadSequence.current) return;

        if (!res.ok) {
          appendMessage({ text: `[error] Room lookup failed with ${res.status}`, tone: "error" });
          return;
        }

        const room = (await res.json()) as RoomInfo;
        if (sequence !== roomLoadSequence.current) return;
        appendMessage({ text: formatRoomInfo(room) });
      } catch (err: unknown) {
        if (sequence !== roomLoadSequence.current) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        appendMessage({ text: `[error] ${msg}`, tone: "error" });
      }
    };

    const handleServerMessage = async (raw: string) => {
      const message = parseGameMessage(raw);
      if (!message) {
        appendMessage({ text: raw });
        return;
      }

      appendMessage(formatGameMessage(message, currentUserEmail));

      if (message.type === "enter_room" && message.sub.email === currentUserEmail) {
        const roomId = getNumberDetail(message.details, "newRoomId");
        if (roomId !== null) {
          await loadRoom(roomId);
        }
      }
    };

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event: MessageEvent) => {
      void handleServerMessage(event.data as string);
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      active = false;
      ws.close();
    };
  }, [character.name, character.userEmail, user?.email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setInput("");

    if (trimmed.toLowerCase() === "help") {
      setMessages((prev) => [...prev, { text: HELP_TEXT, tone: "help" }]);
      return;
    }

    try {
      const res = await fetch("/api/game/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed })
      });
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { text: `[error] Server responded with ${res.status}`, tone: "error" }
        ]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [...prev, { text: `[error] ${msg}`, tone: "error" }]);
    }
  }

  return (
    <div className="game-page">
      <AppBanner info={info} user={user} character={character} onExitGame={onExitGame} />
      <div className="game-display">
        <GameOutput connected={connected} error={error} messages={messages} />
        <GameInput input={input} onInputChange={setInput} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}

function parseGameMessage(raw: string): GameMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
    if (!isRecord(parsed.sub)) return null;
    if (typeof parsed.sub.name !== "string" || typeof parsed.sub.email !== "string") return null;
    if (!isRecord(parsed.details)) return null;

    return {
      type: parsed.type,
      sub: { name: parsed.sub.name, email: parsed.sub.email },
      details: parsed.details
    };
  } catch {
    return null;
  }
}

function formatGameMessage(message: GameMessage, currentUserEmail: string): OutputMessage {
  const isSelf = message.sub.email === currentUserEmail;

  if (message.type === "message") {
    const text = message.details.message;
    return { text: typeof text === "string" ? text : JSON.stringify(message.details) };
  }

  if (message.type === "error") {
    const text = message.details.message;
    return {
      text: typeof text === "string" ? text : JSON.stringify(message.details),
      tone: "error"
    };
  }

  if (message.type === "leave_room") {
    const direction = getStringDetail(message.details, "direction") ?? "somewhere";
    return {
      text: isSelf ? `You depart ${direction}` : `${message.sub.name} departs ${direction}`
    };
  }

  if (message.type === "enter_room") {
    const direction = getStringDetail(message.details, "direction");
    if (!direction) {
      return { text: isSelf ? "You enter the game." : `${message.sub.name} enters the game.` };
    }

    return {
      text:
        isSelf ?
          `You enter from the ${direction}`
        : `${message.sub.name} enters from the ${direction}`
    };
  }

  return { text: JSON.stringify(message) };
}

function formatRoomInfo(room: RoomInfo): string {
  const exits = room.exits.map((exit) => exit.direction).join(", ") || "none";
  const lines = [`[${room.vnum}] ${room.name}`, room.description.trim(), "", `Exits: ${exits}`];

  if (room.players.length > 0) {
    lines.push(`Also here: ${room.players.join(", ")}`);
  }

  return lines.join("\n");
}

function getStringDetail(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === "string" ? value : null;
}

function getNumberDetail(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default GameDisplay;
