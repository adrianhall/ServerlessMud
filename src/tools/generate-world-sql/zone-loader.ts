/**
 * Loads a set of zone files from a directory.
 *
 * @module
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Logger } from "../lib/logger.js";
import { type ZoneFile } from "../lib/types.js";

/**
 * Loads a set of zone files from a directory.
 * @param files The list of files.
 * @param inputDir The input directory.
 * @param log The logger to use.
 * @returns A set of ZoneFile objects.
 */
export async function readZoneFiles(files: string[], inputDir: string, log: Logger) {
  // Load all zone data
  const zones: ZoneFile[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(inputDir, file), "utf-8");
    zones.push(JSON.parse(raw) as ZoneFile);
    log.debug(`Loaded ${file}`);
  }
  return zones;
}
