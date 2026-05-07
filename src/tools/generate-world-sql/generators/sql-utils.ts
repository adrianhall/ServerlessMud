/**
 * Shared utilities and types for SQL generators.
 *
 * @module
 */

/** Result returned by each individual generator function. */
export interface GeneratorResult {
  /** SQL statement lines */
  lines: string[];
  /** Number of rows generated */
  count: number;
  /** Number of duplicate warnings emitted */
  warnings: number;
}

/** Escape a string for use inside a SQL single-quoted literal. */
export function esc(value: string): string {
  return value.replace(/'/g, "''");
}
