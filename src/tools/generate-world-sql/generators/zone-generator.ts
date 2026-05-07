/**
 * Generates INSERT statements for the `zones` and `zone_commands` tables.
 *
 * @module
 */

import type { Zone } from "../../lib/types.js";
import { esc, type GeneratorResult } from "./sql-utils.js";

/** Generate SQL for a single zone row and all its reset commands. */
export function generateZoneSql(zoneId: number, zone: Zone): GeneratorResult {
  const lines: string[] = [];
  let count = 0;

  // Zone row
  lines.push(
    `INSERT INTO zones (id, name, builder, min_vnum, max_vnum, lifespan, reset_mode, flags)`
      + ` VALUES (${zoneId}, '${esc(zone.name)}', '${esc(zone.builder)}', ${zone.min_vnum}, ${zone.max_vnum}, ${zone.lifespan}, ${zone.reset_mode_value}, ${zone.flags_value});`
  );
  count++;

  // Zone commands
  for (let i = 0; i < zone.commands.length; i++) {
    const cmd = zone.commands[i];
    const arg4 = cmd.arg4 !== undefined ? String(cmd.arg4) : "NULL";
    const sarg1 = cmd.sarg1 !== undefined ? `'${esc(cmd.sarg1)}'` : "NULL";
    const sarg2 = cmd.sarg2 !== undefined ? `'${esc(cmd.sarg2)}'` : "NULL";
    const comment = cmd.comment !== undefined ? `'${esc(cmd.comment)}'` : "NULL";
    lines.push(
      `INSERT INTO zone_commands (zone_id, sort_order, command, if_flag, arg1, arg2, arg3, arg4, sarg1, sarg2, comment)`
        + ` VALUES (${zoneId}, ${i}, '${esc(cmd.command)}', ${cmd.if_flag ? 1 : 0}, ${cmd.arg1}, ${cmd.arg2}, ${cmd.arg3}, ${arg4}, ${sarg1}, ${sarg2}, ${comment});`
    );
  }

  return { lines, count, warnings: 0 };
}
