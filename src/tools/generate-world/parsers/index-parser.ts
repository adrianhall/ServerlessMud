/**
 * Parser for TbaMUD zone index files.
 *
 * Index files (e.g. `zon/index`, `zon/index.mini`) list zone filenames,
 * one per line, terminated by a line containing just `$`.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../logger.js";

/**
 * Parse a zone index file and return the list of zone number strings.
 *
 * @param indexPath - Absolute or relative path to the index file
 *                    (e.g. `data/tbamud/lib/world/zon/index.mini`)
 * @param log       - Logger instance for diagnostics
 * @returns Array of zone number strings (e.g. ["0", "12", "30"])
 */
export async function parseIndexFile(indexPath: string, log: Logger): Promise<string[]> {
  log.info(`Reading index file: ${indexPath}`);

  const content = await readFile(indexPath, "utf-8");
  const lines = content.split("\n");
  const zones: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    // $ terminates the index
    if (line === "$") {
      break;
    }

    // Skip blank lines
    if (line.length === 0) {
      continue;
    }

    // Each line is a filename like "30.zon" — extract the zone number
    const match = line.match(/^(\d+)\.zon$/);
    if (match) {
      zones.push(match[1]);
    } else {
      log.warn(`Unexpected index entry: "${line}" in ${path.basename(indexPath)}`);
    }
  }

  log.info(`Found ${zones.length} zone(s) in ${path.basename(indexPath)}`);
  return zones;
}
