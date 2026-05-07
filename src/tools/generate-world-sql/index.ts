/**
 * CLI tool that generates an idempotent D1 migration SQL file from the
 * parsed TbaMUD world JSON files.
 *
 * Reads every zone JSON file produced by `generate-world`, emits a single
 * SQL migration that seeds the MAP database with zones, rooms, exits,
 * extra descriptions, zone commands, and room triggers.
 *
 * Usage:
 *   pnpm run generate:world-sql
 *   pnpm run generate:world-sql -- --input data/json --output migrations/map/0002_seed_data.sql
 *   pnpm run generate:world-sql -- --verbose
 *
 * @module
 */

import { Command } from "commander";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "../lib/logger.js";
import { generateSql } from "./sql-generator.js";
import { readZoneFiles } from "./zone-loader.js";

interface CliOptions {
  input: string;
  output: string;
  verbose: boolean;
}

const program = new Command()
  .name("generate-world-sql")
  .description("Generate a D1 seed migration SQL file from parsed world JSON")
  .option("--input <path>", "Directory containing zone JSON files", "data/json")
  .option("--output <path>", "Output SQL migration file path", "migrations/map/0002_seed_data.sql")
  .option("--verbose", "Enable debug-level logging", false)
  .action(run);

async function run(opts: CliOptions): Promise<void> {
  const log = createLogger({ verbose: opts.verbose });

  const inputDir = path.resolve(opts.input);
  const outputFile = path.resolve(opts.output);

  log.info(`Input directory:  ${inputDir}`);
  log.info(`Output SQL file:  ${outputFile}`);

  // Discover and sort zone files numerically
  const files = (await readdir(inputDir))
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => Number(a.replace(".json", "")) - Number(b.replace(".json", "")));

  if (files.length === 0) {
    log.error(`No JSON files found in ${inputDir}`);
    process.exit(1);
  }

  log.info(`Found ${files.length} zone file(s)`);
  const zones = await readZoneFiles(files, inputDir, log);

  // Generate SQL with duplicate detection
  const { sql, stats, warnings } = generateSql(zones, log);

  // Write output
  await writeFile(outputFile, sql, "utf-8");

  // Summary
  log.info("");
  log.success(
    `Written ${outputFile} `
      + `(${stats.zones} zones, ${stats.rooms} rooms, ${stats.exits} exits, `
      + `${stats.extraDescs} extra descs, ${stats.zoneCommands} zone cmds, ${stats.triggers} triggers)`
  );

  if (warnings > 0) {
    log.warn(`${warnings} duplicate(s) detected — review warnings above`);
  }
}

// Strip standalone "--" injected by pnpm when forwarding script args.
const argv = process.argv.filter((arg, i) => !(arg === "--" && i >= 2));
program.parse(argv);
