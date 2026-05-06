/**
 * CLI entry point for the TbaMUD world parser.
 *
 * Usage:
 *   pnpm run generate:world -- --zone 30
 *   pnpm run generate:world -- --index index.mini
 *   pnpm run generate:world -- --dir data/tbamud/lib/world --out data/json --zone 30
 */

import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "./logger.js";
import { parseIndexFile } from "./parsers/index-parser.js";
import { parseZoneFile } from "./parsers/zone-parser.js";
import { parseWorldFile } from "./parsers/world-parser.js";
import type { ZoneFile } from "./types.js";

interface CliOptions {
  dir: string;
  out: string;
  zone?: string;
  index?: string;
  verbose: boolean;
}

const program = new Command()
  .name("generate-world")
  .description("Parse TbaMUD zone/world files into JSON")
  .option("--dir <path>", "Path to TbaMUD world data directory", "data/tbamud/lib/world")
  .option("--out <path>", "Output directory for JSON files", "data/json")
  .option("--zone <number>", "Parse a single zone by number")
  .option("--index <file>", "Parse all zones listed in an index file")
  .option("--verbose", "Enable debug-level logging", false)
  .action(run);

async function run(opts: CliOptions): Promise<void> {
  const log = createLogger({ verbose: opts.verbose });

  // Validate: exactly one of --zone or --index must be provided
  if (!opts.zone && !opts.index) {
    log.error("Either --zone <number> or --index <file> is required.");
    process.exit(1);
  }
  if (opts.zone && opts.index) {
    log.error("Cannot use both --zone and --index at the same time.");
    process.exit(1);
  }

  // Resolve paths
  const worldDir = path.resolve(opts.dir);
  const outDir = path.resolve(opts.out);

  log.info(`World data directory: ${worldDir}`);
  log.info(`Output directory:     ${outDir}`);

  // Determine zone list
  let zoneIds: string[];

  if (opts.zone) {
    zoneIds = [opts.zone];
  } else {
    const indexPath = path.join(worldDir, "zon", opts.index!);
    zoneIds = await parseIndexFile(indexPath, log);
  }

  // Ensure output directory exists
  await mkdir(outDir, { recursive: true });

  // Process each zone
  let successCount = 0;
  let failCount = 0;

  for (const zoneId of zoneIds) {
    const zoneLog = log.forZone(zoneId);

    try {
      const result = await processZone(zoneId, worldDir, zoneLog);

      // Write JSON output
      const outPath = path.join(outDir, `${zoneId}.json`);
      await writeFile(outPath, JSON.stringify(result, null, 2) + "\n", "utf-8");

      zoneLog.success(
        `Generated ${zoneId}.json (${result.world.length} room(s), `
          + `${result.world.reduce((n, r) => n + r.exits.length, 0)} exit(s), `
          + `${result.zone.commands.length} command(s))`
      );
      successCount++;
    } catch (err) {
      zoneLog.error(`Failed to process zone: ${err instanceof Error ? err.message : err}`);
      failCount++;
    }
  }

  // Summary
  log.info("");
  if (failCount === 0) {
    log.success(`All ${successCount} zone(s) generated successfully.`);
  } else {
    log.warn(`${successCount} succeeded, ${failCount} failed.`);
    process.exit(1);
  }
}

/**
 * Process a single zone: parse .zon and .wld files, return combined data.
 */
async function processZone(zoneId: string, worldDir: string, log: Logger): Promise<ZoneFile> {
  const zonPath = path.join(worldDir, "zon", `${zoneId}.zon`);
  const wldPath = path.join(worldDir, "wld", `${zoneId}.wld`);

  log.info(`Parsing ${zonPath}`);
  const zone = await parseZoneFile(zonPath, log);

  log.info(`Parsing ${wldPath}`);
  const world = await parseWorldFile(wldPath, log);

  return { id: zoneId, zone, world };
}

// Required for the Logger type used in processZone
import type { Logger } from "./logger.js";

// Strip any standalone "--" from argv that pnpm injects when forwarding
// script arguments (e.g. `pnpm run generate:world -- --zone 30`).
// Commander interprets "--" as "end of options" which causes all subsequent
// flags to be treated as positional arguments.
const argv = process.argv.filter((arg, i) => !(arg === "--" && i >= 2));
program.parse(argv);
