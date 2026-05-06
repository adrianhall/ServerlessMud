/**
 * Parser for TbaMUD .zon (zone) files.
 *
 * Zone files define zone metadata (name, bounds, lifespan, reset mode, flags)
 * and a list of reset commands that populate the zone on each reset cycle.
 *
 * File format:
 *   #<zone_number>
 *   <builder_name>~
 *   <zone_name>~
 *   <min_vnum> <max_vnum> <lifespan> <reset_mode> <zone_flags> [extra fields...]
 *   <commands...>
 *   S
 *   $
 */

import { readFile } from "node:fs/promises";
import type { Logger } from "../logger.js";
import type { Zone, ZoneCommand } from "../types.js";
import { RESET_MODES, ZONE_FLAGS, decodeBitvector, lookupValue } from "../constants.js";
import { TextReader, asciiFlagConv } from "./text-reader.js";

/** Commands that take 4 numeric arguments (the rest take 3). */
const FOUR_ARG_COMMANDS = new Set(["M", "O", "G", "E", "P", "D", "T"]);

/**
 * Parse a .zon file and return structured zone data.
 *
 * @param filePath - Path to the .zon file
 * @param log      - Logger instance for diagnostics
 * @returns Parsed Zone object
 */
export async function parseZoneFile(filePath: string, log: Logger): Promise<Zone> {
  const content = await readFile(filePath, "utf-8");
  const reader = new TextReader(content, filePath, log);

  // --- Line 1: #<zone_number> ---
  const headerLine = reader.nextLine();
  if (!headerLine || !headerLine.startsWith("#")) {
    throw new Error(`${reader.location()} Expected zone header (#<number>), got: "${headerLine}"`);
  }
  const zoneNumber = headerLine.substring(1).trim();
  log.debug(`Zone number: ${zoneNumber}`);

  // --- Line 2: builder name (tilde-terminated) ---
  const builder = reader.readTildeString();
  log.debug(`Builder: ${builder}`);

  // --- Line 3: zone name (tilde-terminated) ---
  const name = reader.readTildeString();
  log.debug(`Zone name: ${name}`);

  // --- Line 4: min_vnum max_vnum lifespan reset_mode zone_flags [extra...] ---
  const dataLine = reader.nextLine();
  if (!dataLine) {
    throw new Error(`${reader.location()} Expected zone data line, got EOF`);
  }

  const parts = dataLine.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error(`${reader.location()} Zone data line has too few fields: "${dataLine}"`);
  }

  const minVnum = parseInt(parts[0], 10);
  const maxVnum = parseInt(parts[1], 10);
  const lifespan = parseInt(parts[2], 10);
  const resetModeValue = parseInt(parts[3], 10);

  // Zone flags may be numeric or ASCII bitvector (field 5, index 4)
  const flagsValue = parts.length > 4 ? asciiFlagConv(parts[4]) : 0;

  log.debug(
    `Zone data: vnums=${minVnum}-${maxVnum} lifespan=${lifespan} `
      + `reset_mode=${resetModeValue} flags=${flagsValue}`
  );

  // --- Reset commands ---
  const commands = parseZoneCommands(reader, log);

  return {
    name,
    builder,
    min_vnum: minVnum,
    max_vnum: maxVnum,
    lifespan,
    reset_mode_value: resetModeValue,
    reset_mode: lookupValue(resetModeValue, RESET_MODES),
    flags_value: flagsValue,
    flags: decodeBitvector(flagsValue, ZONE_FLAGS),
    commands
  };
}

/**
 * Parse zone reset commands until S or $ is reached.
 */
function parseZoneCommands(reader: TextReader, log: Logger): ZoneCommand[] {
  const commands: ZoneCommand[] = [];

  while (!reader.done) {
    const rawLine = reader.nextLine();
    if (rawLine === undefined) break;

    const line = rawLine.trim();

    // End markers
    if (line === "S" || line === "$" || line === "$~") {
      break;
    }

    // Skip blank lines and comments
    if (line.length === 0 || line.startsWith("*")) {
      continue;
    }

    const cmd = parseCommandLine(line, reader.lineNumber - 1, log);
    if (cmd) {
      commands.push(cmd);
    }
  }

  log.debug(`Parsed ${commands.length} zone command(s)`);
  return commands;
}

/**
 * Parse a single zone reset command line.
 *
 * Format: <cmd> <if_flag> <arg1> <arg2> <arg3> [<arg4>] [TAB (comment)]
 *
 * V commands are special: <cmd> <if_flag> <arg1> <trigger_vnum> <room> <context> <varname> <value>
 */
function parseCommandLine(line: string, lineNum: number, log: Logger): ZoneCommand | null {
  // Split on tab to separate command from inline comment
  const [commandPart, ...commentParts] = line.split("\t");
  const comment = commentParts.join("\t").trim() || undefined;

  const tokens = commandPart.trim().split(/\s+/);
  if (tokens.length < 1) return null;

  const command = tokens[0];

  // V commands have a special format with string arguments
  if (command === "V") {
    return parseVCommand(tokens, comment, lineNum, log);
  }

  if (tokens.length < 4) {
    log.warn(`Line ${lineNum}: too few tokens for command "${command}": "${line}"`);
    return null;
  }

  const ifFlag = parseInt(tokens[1], 10) !== 0;
  const arg1 = parseInt(tokens[2], 10);
  const arg2 = parseInt(tokens[3], 10);

  // 4-arg commands (MOGEPDTV) have a 4th numeric argument
  if (FOUR_ARG_COMMANDS.has(command)) {
    const arg3 = tokens.length > 4 ? parseInt(tokens[4], 10) : -1;
    return { command, if_flag: ifFlag, arg1, arg2, arg3, line: lineNum, comment };
  }

  // 3-arg commands (R, etc.)
  return { command, if_flag: ifFlag, arg1, arg2, arg3: -1, line: lineNum, comment };
}

/**
 * Parse a V (variable) command, which has string arguments.
 *
 * Format: V <if_flag> <trigger_type> <trigger_vnum> <room_vnum> <context> <varname> <value>
 */
function parseVCommand(
  tokens: string[],
  comment: string | undefined,
  lineNum: number,
  log: Logger
): ZoneCommand | null {
  if (tokens.length < 7) {
    log.warn(`Line ${lineNum}: V command has too few tokens`);
    return null;
  }

  return {
    command: "V",
    if_flag: parseInt(tokens[1], 10) !== 0,
    arg1: parseInt(tokens[2], 10),
    arg2: parseInt(tokens[3], 10),
    arg3: parseInt(tokens[4], 10),
    arg4: parseInt(tokens[5], 10),
    sarg1: tokens[6],
    sarg2: tokens.slice(7).join(" ") || undefined,
    line: lineNum,
    comment
  };
}
