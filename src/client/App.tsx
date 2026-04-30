/**
 * Root React component for ServerlessMud.
 *
 * Fetches basic metadata from the `/api` endpoint on mount and renders
 * a landing page showing the connection status.
 *
 * @module
 */

import { useEffect, useState } from "react";

/** Shape returned by `GET /api/`. */
interface ApiInfo {
  name: string;
  version: string;
}

/** Root application component. */
function App() {
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return (
    <div className="app">
      <h1>ServerlessMud</h1>
      <p>A MUD game built on Cloudflare Workers</p>

      {error && <p className="error">API error: {error}</p>}

      {info && (
        <p className="api-info">
          Connected to {info.name} v{info.version}
        </p>
      )}

      {!info && !error && <p className="loading">Connecting...</p>}
    </div>
  );
}

export default App;
