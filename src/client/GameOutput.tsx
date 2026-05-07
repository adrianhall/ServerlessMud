import { useEffect, useRef } from "react";

interface GameOutputProps {
  connected: boolean;
  error: string | null;
  messages: string[];
}

function GameOutput({ connected, error, messages }: GameOutputProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outputRef.current;
    /* istanbul ignore else -- @preserve React supplies this ref after render; the null branch is only lifecycle defensiveness. */
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <section className="game-output-panel" aria-label="Game output">
      <div className="game-status-row">
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
    </section>
  );
}

export default GameOutput;
