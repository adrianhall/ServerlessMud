/**
 * Type definitions for the Cloudflare logging library.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------

/**
 * Supported log severity levels, ordered from least to most severe.
 *
 * - `"debug"`  -- Verbose diagnostic information.
 * - `"info"`   -- General operational messages.
 * - `"warn"`   -- Potentially harmful situations.
 * - `"error"`  -- Error events that may allow the application to continue.
 * - `"silent"` -- Suppress all log output.  Only meaningful as a
 *                  `minLogLevel` threshold; never used as a message level.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/**
 * The subset of {@link LogLevel} that represents an actual message
 * severity.  `"silent"` is excluded because it is only meaningful as
 * a minimum-level threshold, not as a level attached to a log call.
 */
export type MessageLevel = Exclude<LogLevel, "silent">;

// ---------------------------------------------------------------------------
// Log format
// ---------------------------------------------------------------------------

/**
 * Output format for log messages.
 *
 * - `"pretty"`     -- Human-readable with ISO timestamps, coloured level
 *                     tags, and module names.  Best for local development.
 * - `"structured"` -- Passes the message and a data object to `console.*`
 *                     so that the Cloudflare Workers runtime (with
 *                     observability enabled) wraps them into structured JSON.
 */
export type LogFormat = "pretty" | "structured";

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

/**
 * Minimal structured logger.
 *
 * This interface is intentionally kept small so that consumers such as
 * `cloudflare-auth` can define the same shape independently and remain
 * standalone.
 */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createLogger}.
 */
export interface CreateLoggerOptions {
  /**
   * Minimum severity level.  Messages below this threshold are
   * silently discarded.
   *
   * Resolution order:
   * 1. This option (per-module control).
   * 2. `process.env.LOG_LEVEL` (global env var).
   * 3. `"info"` (default).
   */
  minLogLevel?: LogLevel;

  /**
   * Output format.
   *
   * Resolution order:
   * 1. This option.
   * 2. `process.env.LOG_FORMAT` (env var).
   * 3. `"pretty"` (default).
   */
  format?: LogFormat;
}
