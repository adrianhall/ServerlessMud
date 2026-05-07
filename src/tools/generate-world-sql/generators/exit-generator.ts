/**
 * Generates INSERT statements for the `exits` table.
 *
 * @module
 */

import type { Exit } from "../../lib/types.js";
import { esc, type GeneratorResult } from "./sql-utils.js";

/** Generate SQL for a single exit row. */
export function generateExitSql(roomVnum: number, exit: Exit): GeneratorResult {
  const kw = JSON.stringify(exit.keywords);
  const lines: string[] = [];

  lines.push(
    `INSERT INTO exits (room_vnum, direction, description, keywords, door_type, key_vnum, target_room)`
      + ` VALUES (${roomVnum}, '${esc(exit.direction)}', '${esc(exit.description)}', '${esc(kw)}', ${exit.door_type_value}, ${exit.key_vnum}, ${exit.target_room});`
  );

  return { lines, count: 1, warnings: 0 };
}
