/**
 * Log-level ordering and comparison utilities.
 *
 * @module
 */

import type { LogLevel, LogFormat, MessageLevel } from "./types";

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------

/** Numeric weights for each severity level (lower = less severe). */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
};

/** The set of valid level strings, used for parsing. */
const VALID_LEVELS = new Set<string>(Object.keys(LEVEL_ORDER));

/** The set of valid format strings, used for parsing. */
const VALID_FORMATS = new Set<string>(["pretty", "structured"]);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a message at {@link messageLevel} should be
 * emitted given the configured {@link minLevel}.
 */
export function shouldLog(messageLevel: MessageLevel, minLevel: LogLevel): boolean {
  return LEVEL_ORDER[messageLevel] >= LEVEL_ORDER[minLevel];
}

/**
 * Safely parse an arbitrary string into a {@link LogLevel}.
 *
 * Returns the level when the value is a recognised level name
 * (case-insensitive), or `undefined` otherwise.
 */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) return undefined;
  const normalised = value.toLowerCase();
  return VALID_LEVELS.has(normalised) ? (normalised as LogLevel) : undefined;
}

/**
 * Safely parse an arbitrary string into a {@link LogFormat}.
 *
 * Returns the format when the value is recognised (case-insensitive),
 * or `undefined` otherwise.
 */
export function parseLogFormat(value: string | undefined): LogFormat | undefined {
  if (value === undefined) return undefined;
  const normalised = value.toLowerCase();
  return VALID_FORMATS.has(normalised) ? (normalised as LogFormat) : undefined;
}
