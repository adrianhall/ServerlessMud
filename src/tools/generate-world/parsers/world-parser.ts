/**
 * Parser for TbaMUD .wld (world/room) files.
 *
 * World files contain room definitions, each delimited by `#<vnum>`.
 * Each room has a name, description, data line (zone/flags/sector),
 * optional direction blocks (D0-D9), extra descriptions (E),
 * trigger attachments (T), and ends with `S`.
 *
 * The file itself ends with `$~` or `$`.
 */

import { readFile } from "node:fs/promises";
import type { Logger } from "../logger.js";
import type { Exit, ExtraDescription, Room, TriggerAttachment } from "../types.js";
import {
  DIRECTIONS,
  EXIT_TYPES,
  ROOM_FLAGS,
  SECTOR_TYPES,
  decodeBitvector,
  lookupValue
} from "../constants.js";
import { TextReader, asciiFlagConv } from "./text-reader.js";

/**
 * Parse a .wld file and return an array of rooms.
 *
 * @param filePath - Path to the .wld file
 * @param log      - Logger instance for diagnostics
 * @returns Array of parsed Room objects
 */
export async function parseWorldFile(filePath: string, log: Logger): Promise<Room[]> {
  const content = await readFile(filePath, "utf-8");
  const reader = new TextReader(content, filePath, log);
  const rooms: Room[] = [];

  while (!reader.done) {
    const line = reader.peekLine();
    if (line === undefined) break;

    const trimmed = line.trim();

    // End of file marker
    if (trimmed === "$~" || trimmed === "$") {
      break;
    }

    // Each room starts with #<vnum>
    if (trimmed.startsWith("#")) {
      reader.nextLine(); // consume the # line
      const vnum = parseInt(trimmed.substring(1), 10);
      if (isNaN(vnum)) {
        log.warn(`${reader.location()} Invalid room vnum: "${trimmed}"`);
        continue;
      }
      const room = parseRoom(vnum, reader, log);
      if (room) {
        rooms.push(room);
      }
    } else {
      // Skip unexpected lines (shouldn't happen in well-formed files)
      log.debug(`${reader.location()} Skipping unexpected line: "${trimmed}"`);
      reader.nextLine();
    }
  }

  log.debug(`Parsed ${rooms.length} room(s) from ${filePath}`);
  return rooms;
}

/**
 * Parse a single room, starting after the `#<vnum>` line has been consumed.
 */
function parseRoom(vnum: number, reader: TextReader, log: Logger): Room | null {
  // --- Room name (tilde-terminated) ---
  const name = reader.readTildeString();
  log.debug(`Room ${vnum}: "${name}"`);

  // --- Room description (tilde-terminated, may be multi-line) ---
  const description = reader.readTildeString();

  // --- Room data line: zone_number room_flags extra1 extra2 extra3 sector_type ---
  const dataLine = reader.nextLine();
  if (!dataLine) {
    log.error(`Room ${vnum}: expected data line, got EOF`);
    return null;
  }

  const parts = dataLine.trim().split(/\s+/);
  if (parts.length < 4) {
    log.error(`Room ${vnum}: data line has too few fields: "${dataLine}"`);
    return null;
  }

  const zoneNumber = parseInt(parts[0], 10);
  const flagsValue = asciiFlagConv(parts[1]);
  // parts[2], parts[3], parts[4] are additional fields (largely unused in standard TbaMUD)
  const sectorTypeValue = parts.length > 5 ? parseInt(parts[5], 10) : parseInt(parts[2], 10);

  const exits: Exit[] = [];
  const extraDescriptions: ExtraDescription[] = [];
  const triggers: TriggerAttachment[] = [];

  // --- Parse optional sections until S (end of room) ---
  while (!reader.done) {
    const next = reader.peekLine();
    if (next === undefined) break;

    const trimmedNext = next.trim();

    // S marks end of the standard room sections (exits, extra descs).
    // TbaMUD allows trigger attachments (T lines) after the S marker,
    // so we continue reading T lines before declaring the room complete.
    if (trimmedNext === "S") {
      reader.nextLine(); // consume S
      parseTriggerAttachments(vnum, reader, log, triggers);
      break;
    }

    // Direction block: D<number>
    const dirMatch = trimmedNext.match(/^D(\d+)$/);
    if (dirMatch) {
      reader.nextLine(); // consume D line
      const dirIndex = parseInt(dirMatch[1], 10);
      const exit = parseExit(dirIndex, vnum, reader, log);
      if (exit) {
        exits.push(exit);
      }
      continue;
    }

    // Extra description: E
    if (trimmedNext === "E") {
      reader.nextLine(); // consume E line
      const extra = parseExtraDescription(vnum, reader, log);
      if (extra) {
        extraDescriptions.push(extra);
      }
      continue;
    }

    // Trigger attachment: T <vnum> (can also appear before S)
    if (trimmedNext.startsWith("T ")) {
      reader.nextLine(); // consume T line
      const trigVnum = parseInt(trimmedNext.substring(2).trim(), 10);
      if (!isNaN(trigVnum)) {
        triggers.push({ vnum: trigVnum });
        log.debug(`Room ${vnum}: trigger ${trigVnum}`);
      }
      continue;
    }

    // Unexpected line — skip it
    log.warn(`Room ${vnum} at ${reader.location()}: unexpected line "${trimmedNext}"`);
    reader.nextLine();
  }

  return {
    vnum,
    name,
    description,
    zone_number: zoneNumber,
    flags_value: flagsValue,
    flags: decodeBitvector(flagsValue, ROOM_FLAGS),
    sector_type_value: sectorTypeValue,
    sector_type: lookupValue(sectorTypeValue, SECTOR_TYPES),
    exits,
    extra_descriptions: extraDescriptions,
    triggers
  };
}

/**
 * Parse a direction/exit block.
 *
 * Format after the D<n> line:
 *   <description>~
 *   <keywords>~
 *   <door_type> <key_vnum> <target_room>
 */
function parseExit(
  dirIndex: number,
  roomVnum: number,
  reader: TextReader,
  log: Logger
): Exit | null {
  // Exit description (tilde-terminated)
  const description = reader.readTildeString();

  // Keywords (tilde-terminated, space-separated on one line)
  const keywordStr = reader.readTildeString();
  const keywords = keywordStr.length > 0 ? keywordStr.split(/\s+/) : [];

  // Data line: door_type key_vnum target_room
  const dataLine = reader.nextLine();
  if (!dataLine) {
    log.error(`Room ${roomVnum} exit ${dirIndex}: expected data line, got EOF`);
    return null;
  }

  const parts = dataLine.trim().split(/\s+/);
  if (parts.length < 3) {
    log.error(`Room ${roomVnum} exit ${dirIndex}: data line has too few fields: "${dataLine}"`);
    return null;
  }

  const doorTypeValue = parseInt(parts[0], 10);
  const keyVnum = parseInt(parts[1], 10);
  const targetRoom = parseInt(parts[2], 10);

  const direction = lookupValue(dirIndex, DIRECTIONS);
  const exitType = lookupValue(doorTypeValue, EXIT_TYPES);

  if (targetRoom === -1) {
    log.debug(`Room ${roomVnum}: exit ${direction} leads NOWHERE`);
  }

  return {
    direction,
    direction_index: dirIndex,
    description,
    keywords,
    door_type_value: doorTypeValue,
    exit_type: exitType,
    key_vnum: keyVnum,
    target_room: targetRoom
  };
}

/**
 * Parse an extra description block.
 *
 * Format after the E line:
 *   <keywords separated by spaces>~
 *   <description>~
 */
function parseExtraDescription(
  roomVnum: number,
  reader: TextReader,
  log: Logger
): ExtraDescription | null {
  // Keywords (tilde-terminated, space-separated)
  const keywordStr = reader.readTildeString();
  const keywords = keywordStr.length > 0 ? keywordStr.split(/\s+/) : [];

  // Description (tilde-terminated, may be multi-line)
  const description = reader.readTildeString();

  log.debug(`Room ${roomVnum}: extra desc [${keywords.join(", ")}]`);

  return { keywords, description };
}

/**
 * Parse trigger attachment lines that follow the S (end-of-room) marker.
 *
 * In TbaMUD, trigger attachments (T <vnum>) can appear after the S line.
 * We consume consecutive T lines and stop at the next room (#), file end ($),
 * or any non-T line.
 */
function parseTriggerAttachments(
  roomVnum: number,
  reader: TextReader,
  log: Logger,
  triggers: TriggerAttachment[]
): void {
  while (!reader.done) {
    const next = reader.peekLine();
    if (next === undefined) break;

    const trimmed = next.trim();

    if (trimmed.startsWith("T ")) {
      reader.nextLine(); // consume T line
      const trigVnum = parseInt(trimmed.substring(2).trim(), 10);
      if (!isNaN(trigVnum)) {
        triggers.push({ vnum: trigVnum });
        log.debug(`Room ${roomVnum}: trigger ${trigVnum} (post-S)`);
      }
    } else {
      // Not a T line — stop, let the outer loop handle it
      break;
    }
  }
}
