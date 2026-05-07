interface GameInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

function GameInput({ input, onInputChange, onSubmit }: GameInputProps) {
  return (
    <form className="game-input-form" onSubmit={onSubmit}>
      <span className="game-prompt">&gt;</span>
      <input
        className="game-input"
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        autoFocus
        placeholder="Enter command..."
      />
    </form>
  );
}

export default GameInput;
