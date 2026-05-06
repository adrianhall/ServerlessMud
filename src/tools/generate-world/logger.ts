/**
 * Chalk-based diagnostic logger for the world parser.
 *
 * Provides colorized, context-aware logging with verbosity control.
 */

import chalk from "chalk";

export interface LoggerOptions {
  /** Enable debug-level output */
  verbose: boolean;
}

export interface Logger {
  /** Red — parse failures, missing files */
  error(message: string): void;
  /** Yellow — unexpected data, fallback values */
  warn(message: string): void;
  /** Cyan label — progress, file names */
  info(message: string): void;
  /** Dim — raw line data (only shown with --verbose) */
  debug(message: string): void;
  /** Green — zone completed, summary stats */
  success(message: string): void;
  /** Create a child logger with a zone context prefix */
  forZone(zoneId: string): Logger;
}

export function createLogger(options: LoggerOptions): Logger {
  return buildLogger(options, undefined);
}

function buildLogger(options: LoggerOptions, prefix: string | undefined): Logger {
  const tag = prefix ? chalk.bold(`[zone ${prefix}]`) + " " : "";

  return {
    error(message: string) {
      console.error(`${tag}${chalk.red("error")} ${message}`);
    },

    warn(message: string) {
      console.warn(`${tag}${chalk.yellow("warn")}  ${message}`);
    },

    info(message: string) {
      console.log(`${tag}${chalk.cyan("info")}  ${message}`);
    },

    debug(message: string) {
      if (options.verbose) {
        console.log(`${tag}${chalk.dim("debug")} ${chalk.dim(message)}`);
      }
    },

    success(message: string) {
      console.log(`${tag}${chalk.green("ok")}    ${message}`);
    },

    forZone(zoneId: string): Logger {
      return buildLogger(options, zoneId);
    }
  };
}
