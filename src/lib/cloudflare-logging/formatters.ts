/**
 * Log output formatters.
 *
 * Each formatter translates a log call into one or more `console.*`
 * invocations.  The Cloudflare Workers runtime (with observability
 * enabled) automatically wraps `console.*` output into structured JSON,
 * so both formatters ultimately delegate to the console.
 *
 * @module
 */

import type { MessageLevel } from "./types";

// ---------------------------------------------------------------------------
// Formatter type
// ---------------------------------------------------------------------------

/**
 * A formatter receives the resolved log metadata and is responsible for
 * writing it to the console.
 */
export type Formatter = (
  level: MessageLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>
) => void;

// ---------------------------------------------------------------------------
// Console method mapping
// ---------------------------------------------------------------------------

/** Maps each message level to the corresponding `console` method. */
const CONSOLE_METHOD: Record<MessageLevel, "debug" | "info" | "warn" | "error"> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error"
};

// ---------------------------------------------------------------------------
// Structured formatter
// ---------------------------------------------------------------------------

/**
 * Passes the message and a data object straight to `console.*`.
 *
 * In a deployed Cloudflare Worker with observability enabled the runtime
 * wraps the arguments into structured JSON:
 *
 * ```json
 * { "message": ["Verified token", { "module": "cf-auth", "email": "a@b.com" }], "level": "info" }
 * ```
 *
 * This format is ideal for machine consumption and log-search tools.
 */
export const structuredFormatter: Formatter = (level, module, message, data) => {
  const method = CONSOLE_METHOD[level];
  const payload: Record<string, unknown> = { module, ...data };
  console[method](message, payload);
};

// ---------------------------------------------------------------------------
// Pretty formatter
// ---------------------------------------------------------------------------

/** ANSI colour codes for each level. */
const LEVEL_COLOURS: Record<MessageLevel, string> = {
  debug: "\x1b[90m", // grey
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m" // red
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

/** Upper-case, fixed-width level tags for alignment. */
const LEVEL_TAG: Record<MessageLevel, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR"
};

/**
 * Human-readable formatter for local development.
 *
 * Produces coloured output like:
 *
 * ```
 * 2026-05-01T12:00:00.000Z [INFO ] [cf-auth] Verified token { email: "a@b.com" }
 * ```
 */
export const prettyFormatter: Formatter = (level, module, message, data) => {
  const method = CONSOLE_METHOD[level];
  const colour = LEVEL_COLOURS[level];
  const tag = LEVEL_TAG[level];
  const timestamp = new Date().toISOString();

  const prefix = `${DIM}${timestamp}${RESET} ${colour}[${tag}]${RESET} ${colour}[${module}]${RESET}`;

  if (data && Object.keys(data).length > 0) {
    console[method](prefix, message, data);
  } else {
    console[method](prefix, message);
  }
};
