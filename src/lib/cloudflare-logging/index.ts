/**
 * Cloudflare logging library.
 *
 * Provides a lightweight, structured logger designed for Cloudflare
 * Workers.  In production the logger passes clean data to `console.*`
 * so that the Workers runtime (with observability enabled) can wrap it
 * into structured JSON.  In development it produces coloured,
 * human-readable output with timestamps and module names.
 *
 * @example
 * ```ts
 * import { createLogger } from "@lib/cloudflare-logging";
 *
 * const log = createLogger("my-module");
 * log.info("Server started", { port: 8787 });
 * ```
 *
 * @module
 */

// Factory
export { createLogger } from "./create-logger";

// Types
export type { Logger, LogLevel, LogFormat, MessageLevel, CreateLoggerOptions } from "./types";

// Utilities (exported for advanced use-cases and testing)
export { shouldLog, parseLogLevel, parseLogFormat } from "./levels";
export { structuredFormatter, prettyFormatter } from "./formatters";
export type { Formatter } from "./formatters";
