# cloudflare-logging

Lightweight structured logger designed for Cloudflare Workers.

In **production** (`format: "structured"`) the logger passes clean data to
`console.*` so that the Workers runtime (with
[observability](https://developers.cloudflare.com/workers/observability/)
enabled) wraps the output into structured JSON automatically.

In **development** (`format: "pretty"`, the default) it produces coloured,
human-readable output with ISO timestamps and module names:

```
2026-05-01T12:00:00.000Z [INFO ] [cf-auth] Verified token { email: "alice@example.com" }
```

## Quick start

```ts
import { createLogger } from "@lib/cloudflare-logging";

const log = createLogger("my-module");

log.debug("verbose detail"); // suppressed at default "info" level
log.info("request received", { path: "/api/health" });
log.warn("rate limit approaching", { remaining: 5 });
log.error("unhandled exception", { err: String(err) });
```

## API

### `createLogger(module, options?)`

Returns a `Logger` bound to the given module name.

| Parameter             | Type        | Description                                                     |
| --------------------- | ----------- | --------------------------------------------------------------- |
| `module`              | `string`    | Short identifier included in every log line (e.g. `"cf-auth"`). |
| `options.minLogLevel` | `LogLevel`  | Minimum severity. Messages below this are silently discarded.   |
| `options.format`      | `LogFormat` | `"pretty"` (default) or `"structured"`.                         |

#### Option resolution order

Each option is resolved from the first defined value:

| Option        | 1. Constructor        | 2. Env var   | 3. Default |
| ------------- | --------------------- | ------------ | ---------- |
| `minLogLevel` | `options.minLogLevel` | `LOG_LEVEL`  | `"info"`   |
| `format`      | `options.format`      | `LOG_FORMAT` | `"pretty"` |

### `Logger` interface

```ts
interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
```

The same interface is independently defined in `cloudflare-auth` so
that the auth library can accept a logger without depending on this
package. TypeScript structural typing ensures compatibility.

### Log levels

| Level      | Numeric | Typical use                                                       |
| ---------- | ------- | ----------------------------------------------------------------- |
| `"debug"`  | 0       | Verbose diagnostic detail; suppressed by default.                 |
| `"info"`   | 1       | Normal operational messages (default threshold).                  |
| `"warn"`   | 2       | Potentially problematic situations.                               |
| `"error"`  | 3       | Error events.                                                     |
| `"silent"` | 4       | Suppress all output. Only valid as a `minLogLevel`, not on calls. |

### Formats

#### `"pretty"` (default)

Coloured, human-readable output intended for terminal use during
local development:

```
2026-05-01T12:00:00.000Z [WARN ] [dev-auth] Malformed JWT in cookie
```

Timestamps are ISO 8601, level tags are fixed-width for alignment,
and ANSI colour codes highlight severity.

#### `"structured"`

Passes the message string and a `{ module, ...data }` payload to the
matching `console.*` method. When the Worker has observability enabled
the runtime produces JSON like:

```json
{
  "message": ["Malformed JWT in cookie", { "module": "dev-auth" }],
  "level": "warn"
}
```

## Integration with cloudflare-auth

The `cloudflare-auth` library accepts an optional `logger` on its
settings objects. When omitted it falls back to a simple
`console.*`-based default.

```ts
import { createLogger } from "@lib/cloudflare-logging";
import {
  developerAuthentication,
  cloudflareAccess,
  type AuthVariables
} from "@lib/cloudflare-auth";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Suppress noisy dev-auth logs during development.
const devAuthLogger = createLogger("dev-auth", { minLogLevel: "warn" });
app.use(developerAuthentication({ logger: devAuthLogger }));

// Uses the default level ("info") resolved from LOG_LEVEL or fallback.
const accessLogger = createLogger("cf-auth");
app.use(cloudflareAccess({ logger: accessLogger }));
```

## Environment variables

| Variable     | Values                                     | Default  |
| ------------ | ------------------------------------------ | -------- |
| `LOG_LEVEL`  | `debug`, `info`, `warn`, `error`, `silent` | `info`   |
| `LOG_FORMAT` | `pretty`, `structured`                     | `pretty` |

Set these in `.env` for local development or in `wrangler.jsonc`
`vars` for deployed Workers.

## Exported utilities

For advanced use-cases the package also exports:

- `shouldLog(messageLevel, minLevel)` -- level comparison predicate.
- `parseLogLevel(string)` / `parseLogFormat(string)` -- safe parsers.
- `structuredFormatter` / `prettyFormatter` -- formatter functions.
