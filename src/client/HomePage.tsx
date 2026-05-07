import AppBanner from "./AppBanner";
import homepageImage from "../../images/homepage.jpg";

interface ApiInfo {
  name: string;
  version: string;
}

interface UserInfo {
  email: string;
  id: string;
}

interface HomePageProps {
  info: ApiInfo | null;
  user: UserInfo | null;
  error: string | null;
  copyright: string;
  onEnterGame: () => void;
}

function HomePage({ info, user, error, copyright, onEnterGame }: HomePageProps) {
  return (
    <div className="home-page">
      <AppBanner info={info} user={user} />

      <main className="home-hero" aria-label="ServerlessMud home page">
        <img className="home-hero-image" src={homepageImage} alt="" />
        <div className="home-hero-overlay">
          <button className="enter-game-btn" type="button" onClick={onEnterGame} disabled={!user}>
            Enter the game
          </button>
          {error && <p className="home-error">API error: {error}</p>}
        </div>
      </main>

      <footer className="app-footer">{copyright}</footer>
    </div>
  );
}

export default HomePage;
