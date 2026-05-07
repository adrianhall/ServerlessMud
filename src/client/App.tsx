import { useEffect, useState } from "react";
import packageInfo from "../../package.json";
import type { PlayerCharacter } from "../shared/player-character";
import CharacterEntryModal from "./CharacterEntryModal";
import GameDisplay from "./GameDisplay";
import HomePage from "./HomePage";

/** Shape returned by `GET /api/version`. */
interface ApiInfo {
  name: string;
  version: string;
}

/** Shape returned by `GET /api/me`. */
interface UserInfo {
  email: string;
  id: string;
}

function renderCopyright(value: string): string {
  return value.replace(/&copy;/gi, "\u00a9");
}

/** Root application component. */
function App() {
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [activeCharacter, setActiveCharacter] = useState<PlayerCharacter | null>(null);

  useEffect(() => {
    fetch("/api/version")
      .then((res) => {
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        return res.json() as Promise<ApiInfo>;
      })
      .then(setInfo)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      });

    fetch("/api/me")
      .then((res) => {
        if (!res.ok) throw new Error(`User API responded with ${res.status}`);
        return res.json() as Promise<UserInfo>;
      })
      .then(setUser)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      });
  }, []);

  if (activeCharacter) {
    return (
      <GameDisplay
        info={info}
        user={user}
        character={activeCharacter}
        onExitGame={() => setActiveCharacter(null)}
      />
    );
  }

  return (
    <>
      <HomePage
        info={info}
        user={user}
        error={error}
        copyright={renderCopyright(packageInfo.copyright)}
        onEnterGame={() => setCharacterModalOpen(true)}
      />
      <CharacterEntryModal
        open={characterModalOpen}
        onClose={() => setCharacterModalOpen(false)}
        onEnterGame={(character) => {
          setCharacterModalOpen(false);
          setActiveCharacter(character);
        }}
      />
    </>
  );
}

export default App;
