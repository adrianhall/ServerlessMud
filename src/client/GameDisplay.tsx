/**
 * VT220-style game terminal component.
 *
 * Connects to the game server via WebSocket for real-time messages
 * and sends player commands via POST /api/game/input.
 *
 * @module
 */

import { useEffect, useRef, useState } from "react";

interface GameDisplayProps {
  userEmail: string;
}

/** Game terminal with WebSocket connection and command input. */
function GameDisplay({ userEmail: _userEmail }: GameDisplayProps) {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/game/connect`;
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

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  // Auto-scroll output to bottom when new messages arrive.
  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

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
    <div className="game-display">
      <div className="game-header">
        <span className={`game-status${connected ? "" : " disconnected"}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      {error && <div className="game-error">{error}</div>}
      <div className="game-output" ref={outputRef}>
        {messages.map((msg, i) => (
          <div key={i} className="game-message">
            {msg}
          </div>
        ))}
      </div>
      <form className="game-input-form" onSubmit={handleSubmit}>
        <span className="game-prompt">&gt;</span>
        <input
          className="game-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          placeholder="Enter command..."
        />
      </form>
    </div>
  );
}

export default GameDisplay;
