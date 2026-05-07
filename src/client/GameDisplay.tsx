import { useEffect, useState } from "react";
import type { PlayerCharacter } from "../shared/player-character";
import AppBanner from "./AppBanner";
import GameInput from "./GameInput";
import GameOutput from "./GameOutput";

interface GameDisplayProps {
  info: { name: string; version: string } | null;
  user: { email: string; id: string } | null;
  character: PlayerCharacter;
  onExitGame: () => void;
}

/** Game terminal with WebSocket connection and command input. */
function GameDisplay({ info, user, character, onExitGame }: GameDisplayProps) {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const characterName = encodeURIComponent(character.name);
    const url = `${protocol}//${location.host}/api/game/connect?characterName=${characterName}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event: MessageEvent) => {
      setMessages((prev) => [...prev, event.data as string]);
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [character.name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setInput("");

    try {
      const res = await fetch("/api/game/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed })
      });
      if (!res.ok) {
        setMessages((prev) => [...prev, `[error] Server responded with ${res.status}`]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [...prev, `[error] ${msg}`]);
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

export default GameDisplay;
