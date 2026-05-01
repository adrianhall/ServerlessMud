/**
 * Logger factory.
 *
 * Creates a {@link Logger} instance bound to a named module with
 * configurable minimum log level and output format.
 *
 * @module
 */

import type { Logger, LogLevel, CreateLoggerOptions } from "./types";
import { shouldLog, parseLogLevel, parseLogFormat } from "./levels";
import { prettyFormatter, structuredFormatter } from "./formatters";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * Read an environment variable via `process.env` when available.
 *
 * Returns `undefined` in runtimes where `process` is not defined
 * (e.g. a deployed Worker without `nodejs_compat`).
 */
export function readEnv(name: string): string | undefined {
  try {
    return typeof process !== "undefined" ? process.env[name] : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a {@link Logger} for the given module name.
 *
 * The returned logger filters messages below the resolved minimum level
 * and delegates to either the {@link prettyFormatter} or the
 * {@link structuredFormatter} depending on configuration.
 *
 * **Option resolution order** (first defined value wins):
 *
 * | Option         | 1. Constructor         | 2. Env var         | 3. Default   |
 * |----------------|------------------------|--------------------|--------------|
 * | `minLogLevel`  | `options.minLogLevel`  | `LOG_LEVEL`        | `"info"`     |
 * | `format`       | `options.format`       | `LOG_FORMAT`       | `"pretty"`   |
 *
 * @param module  Short identifier included in every log line
 *                (e.g. `"cf-auth"`, `"zone-processor"`).
 * @param options Optional overrides for level and format.
 */
export function createLogger(module: string, options?: CreateLoggerOptions): Logger {
  const minLevel: LogLevel = options?.minLogLevel ?? parseLogLevel(readEnv("LOG_LEVEL")) ?? "info";

  const format = options?.format ?? parseLogFormat(readEnv("LOG_FORMAT")) ?? "pretty";

  const formatter = format === "structured" ? structuredFormatter : prettyFormatter;

  return {
    debug(message, data) {
      if (shouldLog("debug", minLevel)) formatter("debug", module, message, data);
    },
    info(message, data) {
      if (shouldLog("info", minLevel)) formatter("info", module, message, data);
    },
    warn(message, data) {
      if (shouldLog("warn", minLevel)) formatter("warn", module, message, data);
    },
    error(message, data) {
      if (shouldLog("error", minLevel)) formatter("error", module, message, data);
    }
  };
}
