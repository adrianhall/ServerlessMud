/**
 * Low-level text parsing primitives for TbaMUD data files.
 *
 * TbaMUD files use a line-oriented format with tilde (~) terminated strings
 * and ASCII-encoded bitvectors. This module provides a stateful line reader
 * that tracks position for diagnostic messages.
 */

import type { Logger } from "../logger.js";

/**
 * A stateful line reader over a text file.
 *
 * Tracks the current line number and provides primitives for the various
 * field formats used in TbaMUD data files.
 */
export class TextReader {
  private readonly lines: string[];
  private pos: number;
  readonly filename: string;
  private readonly log: Logger;

  constructor(content: string, filename: string, log: Logger) {
    this.lines = content.split("\n");
    this.pos = 0;
    this.filename = filename;
    this.log = log;
  }

  /** Current 1-based line number. */
  get lineNumber(): number {
    return this.pos + 1;
  }

  /** True when all lines have been consumed. */
  get done(): boolean {
    return this.pos >= this.lines.length;
  }

  /** Number of lines remaining. */
  get remaining(): number {
    return this.lines.length - this.pos;
  }

  /**
   * Read the current line and advance.
   * Returns undefined if at end of input.
   */
  nextLine(): string | undefined {
    if (this.done) return undefined;
    const line = this.lines[this.pos];
    this.pos++;
    return line;
  }

  /**
   * Peek at the current line without advancing.
   */
  peekLine(): string | undefined {
    if (this.done) return undefined;
    return this.lines[this.pos];
  }

  /**
   * Read a tilde-terminated string, which may span multiple lines.
   *
   * TbaMUD strings end when a line contains a `~` character. The tilde
   * and everything after it on that line is stripped. Lines before the
   * terminator are joined with newlines.
   *
   * Leading/trailing whitespace on the assembled string is preserved
   * (room descriptions have intentional indentation) but a single
   * trailing newline is stripped if present.
   */
  readTildeString(): string {
    const parts: string[] = [];

    while (!this.done) {
      const line = this.nextLine()!;
      const tildeIdx = line.indexOf("~");

      if (tildeIdx !== -1) {
        // Include text before the tilde (may be empty)
        const before = line.substring(0, tildeIdx);
        if (before.length > 0 || parts.length > 0) {
          parts.push(before);
        }
        break;
      }

      parts.push(line);
    }

    // Join and strip a single trailing newline
    let result = parts.join("\n");
    if (result.endsWith("\n")) {
      result = result.slice(0, -1);
    }
    return result;
  }

  /**
   * Skip lines until we find one matching the predicate.
   * Returns the matching line (consumed) or undefined if EOF.
   */
  skipUntil(predicate: (line: string) => boolean): string | undefined {
    while (!this.done) {
      const line = this.peekLine()!;
      if (predicate(line)) {
        return this.nextLine();
      }
      this.log.debug(`${this.filename}:${this.lineNumber} skipping: ${line}`);
      this.nextLine();
    }
    return undefined;
  }

  /**
   * Format a diagnostic location string for log messages.
   */
  location(): string {
    return `${this.filename}:${this.lineNumber}`;
  }
}

// ---------------------------------------------------------------------------
// ASCII bitvector conversion
// ---------------------------------------------------------------------------

/**
 * Convert a TbaMUD ASCII-encoded bitvector string to a number.
 *
 * TbaMUD supports two formats:
 * - Pure numeric: "156" → 156
 * - ASCII letters: each letter represents a bit position.
 *   'a'=bit0, 'b'=bit1, ..., 'z'=bit25, 'A'=bit26, 'B'=bit27, ...
 *
 * The function mirrors the C `asciiflag_conv()` in utils.c.
 */
export function asciiFlagConv(flag: string): number {
  // If it looks numeric (starts with a digit or is negative), parse directly
  if (/^-?\d/.test(flag)) {
    return parseInt(flag, 10);
  }

  let result = 0;
  for (const ch of flag) {
    if (ch >= "a" && ch <= "z") {
      result |= 1 << (ch.charCodeAt(0) - "a".charCodeAt(0));
    } else if (ch >= "A" && ch <= "Z") {
      result |= 1 << (ch.charCodeAt(0) - "A".charCodeAt(0) + 26);
    }
    // Other characters are silently ignored (matches C behavior)
  }
  return result;
}
