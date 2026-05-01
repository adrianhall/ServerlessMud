/**
 * HTML template for the developer-mode login page.
 *
 * Renders a minimal one-time-PIN–style form that collects an email
 * address and posts it to the callback endpoint.
 *
 * @module
 */

/**
 * Return a self-contained HTML page with an email login form.
 *
 * @param callbackPath - The URL path the form submits to.
 * @param redirectTo   - The original URL the user will be sent back to
 *                        after a successful login.
 * @param error        - An optional error message to display.
 */
export function renderLoginPage(callbackPath: string, redirectTo: string, error?: string): string {
  const errorHtml = error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Developer Login</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{
      margin:0;font-family:system-ui,-apple-system,sans-serif;
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;background:#f4f4f5;color:#18181b;
    }
    .card{
      background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);
      padding:2.5rem;width:100%;max-width:400px;
    }
    h1{margin:0 0 .25rem;font-size:1.5rem}
    p.subtitle{margin:0 0 1.5rem;color:#71717a;font-size:.875rem}
    label{display:block;font-size:.875rem;font-weight:500;margin-bottom:.375rem}
    input[type="email"]{
      width:100%;padding:.625rem .75rem;border:1px solid #d4d4d8;
      border-radius:8px;font-size:1rem;outline:none;
      transition:border-color .15s;
    }
    input[type="email"]:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
    button{
      margin-top:1rem;width:100%;padding:.625rem;border:none;
      border-radius:8px;background:#3b82f6;color:#fff;
      font-size:1rem;font-weight:500;cursor:pointer;
      transition:background .15s;
    }
    button:hover{background:#2563eb}
    .error{
      background:#fef2f2;color:#991b1b;border:1px solid #fecaca;
      padding:.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.875rem;
    }
    .badge{
      display:inline-block;background:#fef3c7;color:#92400e;
      font-size:.75rem;font-weight:600;padding:.125rem .5rem;
      border-radius:9999px;margin-bottom:1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">LOCAL DEV</span>
    <h1>Developer Login</h1>
    <p class="subtitle">Simulates Cloudflare Access one-time PIN authentication.</p>
    ${errorHtml}
    <form method="POST" action="${escapeHtml(callbackPath)}">
      <input type="hidden" name="redirect" value="${escapeHtml(redirectTo)}" />
      <label for="email">Email address</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autocomplete="email"
        placeholder="you@example.com"
        autofocus
      />
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal HTML-entity escaping for untrusted values injected into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
