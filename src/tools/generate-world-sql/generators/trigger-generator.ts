/**
 * Generates INSERT statements for the `room_triggers` table.
 *
 * Detects and warns about duplicate trigger attachments within the same room.
 * Duplicates are skipped (first occurrence wins).
 *
 * @module
 */

import type { Logger } from "../../lib/logger.js";
import type { TriggerAttachment } from "../../lib/types.js";
import type { GeneratorResult } from "./sql-utils.js";

/**
 * Generate SQL for all trigger attachments in a single room.
 *
 * @param roomVnum  - The room these triggers belong to
 * @param triggers  - The trigger attachments from the room
 * @param log       - Logger for duplicate warnings
 */
export function generateTriggerSql(
  roomVnum: number,
  triggers: TriggerAttachment[],
  log: Logger
): GeneratorResult {
  const lines: string[] = [];
  let count = 0;
  let warnings = 0;
  const seen = new Set<number>();

  for (const trig of triggers) {
    if (seen.has(trig.vnum)) {
      log.warn(`Duplicate trigger ${trig.vnum} in room ${roomVnum} — skipping`);
      warnings++;
      continue;
    }
    seen.add(trig.vnum);
    lines.push(
      `INSERT OR IGNORE INTO room_triggers (room_vnum, trigger_vnum)`
        + ` VALUES (${roomVnum}, ${trig.vnum});`
    );
    count++;
  }

  return { lines, count, warnings };
}
