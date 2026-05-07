import { useEffect, useState } from "react";
import {
  PLAYER_CHARACTER_GENDERS,
  isValidCharacterName,
  type PlayerCharacter,
  type PlayerCharacterGender
} from "../shared/player-character";

const MAX_CHARACTERS_PER_USER = 8;

interface CharacterEntryModalProps {
  open: boolean;
  onClose: () => void;
  onEnterGame: (character: PlayerCharacter) => void;
}

interface CharactersResponse {
  characters: PlayerCharacter[];
}

interface AvailabilityResponse {
  available: boolean;
  valid: boolean;
  normalizedName: string | null;
  reason: string | null;
}

interface CreateCharacterResponse {
  character: PlayerCharacter;
}

type ModalMode = "select" | "create";

function CharacterEntryModal({ open, onClose, onEnterGame }: CharacterEntryModalProps) {
  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [mode, setMode] = useState<ModalMode>("select");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<PlayerCharacterGender | "">("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const characterLimitReached = characters.length >= MAX_CHARACTERS_PER_USER;
  const trimmedName = name.trim();
  const hasValidFormat = isValidCharacterName(trimmedName);
  const canCreate = Boolean(
    hasValidFormat && availability?.available && gender && !checkingAvailability && !creating
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setName("");
      setGender("");
      setAvailability(null);

      try {
        const res = await fetch("/api/player-characters");
        if (!res.ok) throw new Error(`Character API responded with ${res.status}`);
        const data = (await res.json()) as CharactersResponse;
        if (cancelled) return;
        setCharacters(data.characters);
        setMode(data.characters.length > 0 ? "select" : "create");
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "create") return;

    const controller = new AbortController();
    void (async () => {
      setAvailability(null);
      setError(null);

      if (!hasValidFormat) {
        setCheckingAvailability(false);
        return;
      }

      setCheckingAvailability(true);
      try {
        const res = await fetch(
          `/api/player-characters/availability?name=${encodeURIComponent(trimmedName)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Availability API responded with ${res.status}`);
        const data = (await res.json()) as AvailabilityResponse;
        setAvailability(data);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!controller.signal.aborted) setCheckingAvailability(false);
      }
    })();

    return () => controller.abort();
  }, [hasValidFormat, mode, open, trimmedName]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate || !gender) return;

    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/player-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, gender })
      });

      if (!response.ok) {
        throw new Error(`Create character responded with ${response.status}`);
      }

      const data = (await response.json()) as CreateCharacterResponse;
      onEnterGame(data.character);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="character-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-modal-title"
      >
        <div className="modal-header">
          <h2 id="character-modal-title">
            {mode === "create" ? "Create a character" : "Select a character"}
          </h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        {loading && <p className="modal-status">Loading characters...</p>}
        {error && <p className="modal-error">{error}</p>}

        {!loading && mode === "select" && (
          <>
            <div className="character-list" aria-label="Available characters">
              {characters.map((character) => (
                <button
                  className="character-card"
                  key={character.name}
                  type="button"
                  onClick={() => onEnterGame(character)}
                >
                  <span className="character-card-name">{character.name}</span>
                  <span className="character-card-meta">
                    {character.gender} - Last used {new Date(character.lastUsed).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            <button
              className="create-character-link"
              type="button"
              onClick={() => setMode("create")}
              disabled={characterLimitReached}
            >
              + Create a new character
            </button>
          </>
        )}

        {!loading && mode === "create" && (
          <form className="character-form" onSubmit={handleCreate}>
            <label className="form-field">
              <span>What is the characters name?</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dorian"
                autoFocus
              />
            </label>
            <p className="field-hint">5-32 letters or numbers, one word, starting with a letter.</p>
            {trimmedName && !hasValidFormat && (
              <p className="field-error">Use ASCII letters and numbers only.</p>
            )}
            {checkingAvailability && <p className="field-hint">Checking name availability...</p>}
            {availability?.available && availability.normalizedName && (
              <p className="field-success">Name available: {availability.normalizedName}</p>
            )}
            {availability?.reason === "duplicate" && (
              <p className="field-error">That character name is already taken.</p>
            )}

            <fieldset className="gender-options">
              <legend>What is the characters gender?</legend>
              {PLAYER_CHARACTER_GENDERS.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="gender"
                    value={option}
                    checked={gender === option}
                    onChange={() => setGender(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>

            <div className="modal-actions">
              {characters.length > 0 && (
                <button className="secondary-btn" type="button" onClick={() => setMode("select")}>
                  Back
                </button>
              )}
              <button className="primary-btn" type="submit" disabled={!canCreate}>
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default CharacterEntryModal;
