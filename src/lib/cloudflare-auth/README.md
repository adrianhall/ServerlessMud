# @lib/cloudflare-auth

Hono middleware for authenticating requests behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) — with built-in local development support.

## Problem

When your application is deployed behind Cloudflare Access, every request arrives with signed JWT headers and cookies. During local development, however, Cloudflare Access is not involved and those headers are absent.

This library provides two middleware functions that work together so your Hono handlers always have access to the authenticated user, regardless of the environment.

## Installation

The library requires [`jose`](https://github.com/panva/jose) (v6+) as a peer dependency:

```bash
pnpm add jose@^6.2.3
```

If you are importing via a path alias (recommended), add the following to your project configuration:

**tsconfig.json**

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@lib/*": ["./src/lib/*"]
    }
  }
}
```

**vite.config.ts**

```ts
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "src/lib")
    }
  }
});
```

## Quick Start

```ts
import { Hono } from "hono";
import {
  developerAuthentication,
  cloudflareAccess,
  type AuthVariables,
  type PathPolicy
} from "@lib/cloudflare-auth";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Define path policies once, share between both middleware.
const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
];

// 1. Developer middleware runs first.  In production it detects existing
//    Cloudflare Access headers and does nothing.  In local dev it drives
//    an interactive login flow and injects the same headers.
app.use(developerAuthentication({ policies: authPolicies }));

// 2. Cloudflare Access middleware validates the JWT (real or dev-issued)
//    and populates context variables.  Uses the same policies so public
//    endpoints are not blocked.
app.use(cloudflareAccess({ policies: authPolicies }));

// 3. Handlers can now read the authenticated user.
app.get("/api/me", (c) => {
  return c.json({
    email: c.get("userEmail"),
    sub: c.get("userSub")
  });
});

export default app;
```

## Middleware Reference

### `developerAuthentication(settings?)`

Simulates Cloudflare Access one-time-PIN authentication for local development.

**Behaviour per request:**

| Condition                                | Action                                         |
| ---------------------------------------- | ---------------------------------------------- |
| `Cf-Access-Jwt-Assertion` header present | No-op (production)                             |
| Path matches a **public** policy         | Pass through                                   |
| `GET /_auth/login`                       | Serve HTML login form                          |
| `POST /_auth/callback`                   | Validate email, sign JWT, set cookie, redirect |
| `CF_Authorization` cookie present        | Decode JWT, inject CF Access headers, continue |
| None of the above                        | Redirect to login form                         |

**Settings — `DeveloperAuthSettings`**

| Property        | Type           | Default                              | Description                           |
| --------------- | -------------- | ------------------------------------ | ------------------------------------- |
| `policies`      | `PathPolicy[]` | `undefined` (all paths require auth) | Path matching rules; first match wins |
| `loginPath`     | `string`       | `"/_auth/login"`                     | Login form route                      |
| `callbackPath`  | `string`       | `"/_auth/callback"`                  | Login callback route                  |
| `devSecret`     | `string`       | Built-in dev key                     | HMAC secret for signing dev JWTs      |
| `tokenLifetime` | `number`       | `86400` (24 h)                       | JWT lifetime in seconds               |

### `cloudflareAccess(settings?)`

Validates the JWT from either Cloudflare Access or the developer middleware and sets Hono context variables.

**Behaviour per request:**

| Policy match                        | JWT present & valid | JWT missing / invalid | Action                     |
| ----------------------------------- | ------------------- | --------------------- | -------------------------- |
| `authenticate: false`               | -                   | -                     | Bypass (no JWT check)      |
| `authenticate: true`                | Yes                 | -                     | Set context vars, continue |
| `authenticate: true`                | -                   | Yes                   | **401**                    |
| No match, `defaultAction: "block"`  | Yes                 | -                     | Set context vars, continue |
| No match, `defaultAction: "block"`  | -                   | Yes                   | **401**                    |
| No match, `defaultAction: "bypass"` | Yes                 | -                     | Set context vars, continue |
| No match, `defaultAction: "bypass"` | -                   | Yes                   | Continue (no user set)     |

**Verification order** (when JWT validation is performed):

1. Try HMAC verification with the dev secret (fast, in-process).
2. If that fails, verify against the Cloudflare Access JWKS endpoint.

**Settings — `CloudflareAccessSettings`**

| Property        | Type                  | Default                        | Description                                                   |
| --------------- | --------------------- | ------------------------------ | ------------------------------------------------------------- |
| `policies`      | `PathPolicy[]`        | `undefined`                    | Path matching rules (same array as `developerAuthentication`) |
| `defaultAction` | `"block" \| "bypass"` | `"block"`                      | What to do when no policy matches (see table above)           |
| `teamDomain`    | `string`              | `c.env.CLOUDFLARE_TEAM_DOMAIN` | Cloudflare Access team domain                                 |
| `audience`      | `string`              | `undefined` (skip aud check)   | Application Audience Tag for `aud` claim validation           |
| `devSecret`     | `string`              | Built-in dev key               | HMAC secret for verifying dev JWTs                            |

## Path Policies

Use `policies` to control which paths require authentication. Define
the array **once** and pass it to **both** middleware so they agree on
which paths are public vs. protected.

Policies are evaluated in order — **first match wins**.

- `developerAuthentication` — when no policy matches, the default is to
  require authentication (secure by default).
- `cloudflareAccess` — when no policy matches, the behaviour is
  controlled by `defaultAction` (`"block"` by default).

```ts
import type { PathPolicy } from "@lib/cloudflare-auth";

const authPolicies: PathPolicy[] = [
  // Public endpoints
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\/health$/, authenticate: false },

  // Everything else under /api requires auth
  { pattern: /^\/api\//, authenticate: true }
];

app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));
```

**`PathPolicy` type:**

```ts
interface PathPolicy {
  pattern: RegExp; // Tested against the request pathname
  authenticate: boolean; // true = require auth, false = public
}
```

### `defaultAction`

Controls what `cloudflareAccess` does when no policy matches a request path:

- **`"block"`** _(default)_ — treat the path as protected; return 401
  if no valid JWT is present.
- **`"bypass"`** — allow the request through. If a valid JWT _is_
  present the context variables are still set; otherwise the request
  continues with no authenticated user (handlers can check by testing
  whether `c.get("userEmail")` is set).

## How It Works

### Production (behind Cloudflare Access)

```
Request ──► developerAuthentication
            │  Cf-Access-Jwt-Assertion header present?
            │  YES → no-op, call next()
            ▼
            cloudflareAccess
            │  Read JWT from header / cookie
            │  Verify against CF Access JWKS
            │  Set userEmail + userSub on context
            ▼
            Your handler
```

### Local Development

```
First request (no cookie):

Request ──► developerAuthentication
            │  No CF headers, no cookie
            │  302 Redirect → /_auth/login?redirect=/api/game
            ▼
GET /_auth/login
            │  Serve HTML login form
            ▼
POST /_auth/callback  (email=dev@example.com)
            │  Generate dev JWT, set CF_Authorization cookie
            │  302 Redirect → /api/game
            ▼
Subsequent requests (cookie present):

Request ──► developerAuthentication
            │  Read CF_Authorization cookie
            │  Inject Cf-Access-* headers
            ▼
            cloudflareAccess
            │  Read JWT from injected header
            │  Verify with dev secret (HMAC)
            │  Set userEmail + userSub on context
            ▼
            Your handler
```

## Hono Type Integration

The library exports an `AuthVariables` type that extends your Hono generic so that `c.get("userEmail")` and `c.get("userSub")` are fully typed:

```ts
import type { AuthVariables } from "@lib/cloudflare-auth";

// Wire into Hono
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Handlers get full type safety
app.get("/api/profile", (c) => {
  const email: string = c.get("userEmail");
  const sub: string = c.get("userSub");
  return c.json({ email, sub });
});
```

**`AuthVariables` shape:**

| Variable    | Type     | Description                                    |
| ----------- | -------- | ---------------------------------------------- |
| `userEmail` | `string` | Authenticated user's email (JWT `email` claim) |
| `userSub`   | `string` | Unique user identifier (JWT `sub` claim)       |

## Environment Variables

| Variable                 | Required         | Description                                                                                                         |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_TEAM_DOMAIN` | Yes (production) | Your Cloudflare Access team domain (e.g. `myteam.cloudflareaccess.com`). Used to fetch the JWKS for JWT validation. |

## Wrangler Configuration

If your app uses Workers static assets with `run_worker_first`, add the auth routes so the worker handles login requests:

```jsonc
{
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/_auth/*"]
  }
}
```

## Cookie & Header Reference

| Name                                 | Type   | Set by                             | Description                                     |
| ------------------------------------ | ------ | ---------------------------------- | ----------------------------------------------- |
| `CF_Authorization`                   | Cookie | Cloudflare Access / dev middleware | JWT token; `HttpOnly`, `Secure`, `SameSite=Lax` |
| `Cf-Access-Jwt-Assertion`            | Header | Cloudflare Access / dev middleware | Same JWT as the cookie                          |
| `Cf-Access-Authenticated-User-Email` | Header | Cloudflare Access / dev middleware | User's email address                            |
| `Cf-Access-User`                     | Header | Cloudflare Access / dev middleware | Unique user identifier                          |

## Exported Utilities

For advanced use-cases and testing, the library also exports lower-level helpers:

```ts
import {
  matchPolicy, // Evaluate a pathname against a policy array
  signDevJwt, // Create a dev-signed JWT
  verifyDevJwt, // Verify a dev-signed JWT
  verifyAccessJwt, // Verify against CF Access JWKS
  parseCookie, // Extract CF_Authorization from Cookie header
  buildCookieHeader, // Build a Set-Cookie header value
  DEFAULT_DEV_SECRET, // The well-known dev signing key
  COOKIE_NAME, // "CF_Authorization"
  JWT_HEADER, // "cf-access-jwt-assertion"
  EMAIL_HEADER, // "cf-access-authenticated-user-email"
  USER_HEADER // "cf-access-user"
} from "@lib/cloudflare-auth";
```

## License

MIT
