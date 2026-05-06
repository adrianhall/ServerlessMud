/**
 * TypeScript interfaces for the TbaMUD world parser JSON output.
 *
 * These types define the shape of the per-zone JSON files produced by
 * `pnpm run generate:world`. Numeric values that carry semantic meaning
 * (room flags, sector types, directions, etc.) are decoded into human-readable
 * strings alongside their raw numeric values.
 */

// ---------------------------------------------------------------------------
// Zone
// ---------------------------------------------------------------------------

/** A single zone reset command (M, O, G, E, P, D, R, T, V). */
export interface ZoneCommand {
  /** The command character: M, O, G, E, P, D, R, T, V */
  command: string;
  /** If true, only execute when the preceding command succeeded */
  if_flag: boolean;
  /** First integer argument (meaning depends on command type) */
  arg1: number;
  /** Second integer argument */
  arg2: number;
  /** Third integer argument */
  arg3: number;
  /** Optional fourth integer argument (for MOGEPDTV commands) */
  arg4?: number;
  /** String argument 1 (V commands only — variable name) */
  sarg1?: string;
  /** String argument 2 (V commands only — variable value) */
  sarg2?: string;
  /** Inline comment from the zone file, if present */
  comment?: string;
  /** Source line number in the .zon file */
  line: number;
}

/** Parsed zone metadata from a .zon file. */
export interface Zone {
  /** Zone name (from the tilde-terminated name line) */
  name: string;
  /** Builder name / credit */
  builder: string;
  /** Lowest room vnum in this zone */
  min_vnum: number;
  /** Highest room vnum in this zone */
  max_vnum: number;
  /** Zone lifespan in minutes before reset */
  lifespan: number;
  /** Raw reset_mode integer */
  reset_mode_value: number;
  /** Human-readable reset mode: "NEVER", "EMPTY", or "ALWAYS" */
  reset_mode: string;
  /** Raw zone flags bitvector */
  flags_value: number;
  /** Decoded zone flag names */
  flags: string[];
  /** Zone reset commands */
  commands: ZoneCommand[];
}

// ---------------------------------------------------------------------------
// World (rooms)
// ---------------------------------------------------------------------------

/** A single exit / direction from a room. */
export interface Exit {
  /** Direction name: "NORTH", "EAST", etc. */
  direction: string;
  /** Direction index (0=N, 1=E, 2=S, 3=W, 4=U, 5=D, 6=NW, 7=NE, 8=SE, 9=SW) */
  direction_index: number;
  /** Description shown when looking in this direction */
  description: string;
  /** Keywords for interacting with the door (open/close) */
  keywords: string[];
  /** Raw door type value from the file (0-4) */
  door_type_value: number;
  /** Human-readable exit type */
  exit_type: string;
  /** Key vnum required to unlock (-1 for none) */
  key_vnum: number;
  /** Target room vnum (-1 for NOWHERE) */
  target_room: number;
}

/** An extra description attached to a room. */
export interface ExtraDescription {
  /** Keywords that trigger this description */
  keywords: string[];
  /** The description text */
  description: string;
}

/** A trigger attachment on a room. */
export interface TriggerAttachment {
  /** Trigger vnum */
  vnum: number;
}

/** A parsed room from a .wld file. */
export interface Room {
  /** Room vnum */
  vnum: number;
  /** Room name / title */
  name: string;
  /** Long description of the room */
  description: string;
  /** Zone number this room belongs to (from the room data line) */
  zone_number: number;
  /** Raw room flags bitvector */
  flags_value: number;
  /** Decoded room flag names */
  flags: string[];
  /** Raw sector type integer */
  sector_type_value: number;
  /** Human-readable sector type */
  sector_type: string;
  /** Exits leading out of this room */
  exits: Exit[];
  /** Extra descriptions for objects/features in the room */
  extra_descriptions: ExtraDescription[];
  /** Trigger attachments */
  triggers: TriggerAttachment[];
}

// ---------------------------------------------------------------------------
// Top-level zone file
// ---------------------------------------------------------------------------

/** The complete JSON output for a single zone. */
export interface ZoneFile {
  /** Zone number as a string */
  id: string;
  /** Parsed zone metadata */
  zone: Zone;
  /** All rooms from the corresponding .wld file */
  world: Room[];
}
