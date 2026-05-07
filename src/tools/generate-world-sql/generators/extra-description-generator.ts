/**
 * Generates INSERT statements for the `room_extra_descriptions` table.
 *
 * Detects and warns about duplicate keywords within the same room.
 * Duplicates are skipped (first occurrence wins).
 *
 * @module
 */

import type { Logger } from "../../lib/logger.js";
import type { ExtraDescription } from "../../lib/types.js";
import { esc, type GeneratorResult } from "./sql-utils.js";

/**
 * Generate SQL for all extra descriptions in a single room.
 *
 * @param roomVnum         - The room these descriptions belong to
 * @param extraDescriptions - The extra description entries from the room
 * @param log              - Logger for duplicate warnings
 */
export function generateExtraDescriptionSql(
  roomVnum: number,
  extraDescriptions: ExtraDescription[],
  log: Logger
): GeneratorResult {
  const lines: string[] = [];
  let count = 0;
  let warnings = 0;
  const seen = new Set<string>();

  for (const ed of extraDescriptions) {
    for (const keyword of ed.keywords) {
      if (seen.has(keyword)) {
        log.warn(`Duplicate extra description keyword '${keyword}' in room ${roomVnum} — skipping`);
        warnings++;
        continue;
      }
      seen.add(keyword);
      lines.push(
        `INSERT OR IGNORE INTO room_extra_descriptions (room_vnum, keyword, description)`
          + ` VALUES (${roomVnum}, '${esc(keyword)}', '${esc(ed.description)}');`
      );
      count++;
    }
  }

  return { lines, count, warnings };
}
