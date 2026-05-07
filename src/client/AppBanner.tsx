import type { PlayerCharacter } from "../shared/player-character";

interface ApiInfo {
  name: string;
  version: string;
}

interface UserInfo {
  email: string;
  id: string;
}

interface AppBannerProps {
  info: ApiInfo | null;
  user: UserInfo | null;
  character?: PlayerCharacter | null;
  onExitGame?: () => void;
}

function AppBanner({ info, user, character = null, onExitGame }: AppBannerProps) {
  return (
    <header className="app-banner">
      <div className="banner-version" aria-label="Game version">
        <span className="banner-title">ServerlessMud</span>
        <span className="banner-version-number">v{info?.version ?? "..."}</span>
      </div>

      <div className="banner-profile" aria-label="User profile">
        <div className="banner-profile-info">
          {user ?
            <>
              <span className="user-email">{user.email}</span>
              <span className="user-id">{user.id}</span>
            </>
          : <span className="user-email">Signing in...</span>}
          {character && <span className="character-name">Playing {character.name}</span>}
        </div>
        {onExitGame && (
          <button className="exit-game-btn" type="button" onClick={onExitGame}>
            Exit Game
          </button>
        )}
      </div>
    </header>
  );
}

export default AppBanner;
