/**
 * Generates INSERT statements for the `rooms` table.
 *
 * @module
 */

import type { Room } from "../../lib/types.js";
import { esc, type GeneratorResult } from "./sql-utils.js";

/** Generate SQL for a single room row. */
export function generateRoomSql(room: Room, zoneId: number): GeneratorResult {
  const lines: string[] = [];

  lines.push(
    `INSERT INTO rooms (vnum, zone_id, name, description, flags, sector_type)`
      + ` VALUES (${room.vnum}, ${zoneId}, '${esc(room.name)}', '${esc(room.description)}', ${room.flags_value}, ${room.sector_type_value});`
  );

  return { lines, count: 1, warnings: 0 };
}
