/**
 * Console-based fallback logger.
 *
 * Used by the authentication middleware when no external logger is
 * provided in settings.  Each method prefixes its output with the
 * module name so that log lines remain identifiable.
 *
 * @module
 */

import type { Logger } from "./types";

/**
 * Create a console-based {@link Logger} that prefixes every message
 * with `[module]`.
 *
 * This is the default used by {@link developerAuthentication} and
 * {@link cloudflareAccess} when the caller does not supply a logger.
 */
export function createDefaultLogger(module: string, providedLogger?: Logger): Logger {
  if (providedLogger) {
    return providedLogger;
  }

  return {
    debug: (msg, data) => console.debug(`[${module}]`, msg, ...(data ? [data] : [])),
    info: (msg, data) => console.info(`[${module}]`, msg, ...(data ? [data] : [])),
    warn: (msg, data) => console.warn(`[${module}]`, msg, ...(data ? [data] : [])),
    error: (msg, data) => console.error(`[${module}]`, msg, ...(data ? [data] : []))
  };
}
