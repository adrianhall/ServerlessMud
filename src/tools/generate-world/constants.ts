/**
 * TbaMUD constant lookup tables.
 *
 * All tables are derived from the TbaMUD C source (structs.h, constants.c, db.c).
 * They map numeric values to human-readable strings for the JSON output.
 */

// ---------------------------------------------------------------------------
// Directions (structs.h lines 55-69)
// ---------------------------------------------------------------------------

export const DIRECTIONS: readonly string[] = [
  "NORTH", // 0
  "EAST", // 1
  "SOUTH", // 2
  "WEST", // 3
  "UP", // 4
  "DOWN", // 5
  "NORTHWEST", // 6
  "NORTHEAST", // 7
  "SOUTHEAST", // 8
  "SOUTHWEST" // 9
] as const;

// ---------------------------------------------------------------------------
// Room flags — bit positions (structs.h lines 73-91, constants.c lines 68-87)
// ---------------------------------------------------------------------------

export const ROOM_FLAGS: readonly string[] = [
  "DARK", // 0
  "DEATH", // 1
  "NO_MOB", // 2
  "INDOORS", // 3
  "PEACEFUL", // 4
  "SOUNDPROOF", // 5
  "NO_TRACK", // 6
  "NO_MAGIC", // 7
  "TUNNEL", // 8
  "PRIVATE", // 9
  "GODROOM", // 10
  "HOUSE", // 11
  "HOUSE_CRASH", // 12
  "ATRIUM", // 13
  "OLC", // 14
  "BFS_MARK", // 15
  "WORLDMAP" // 16
] as const;

// ---------------------------------------------------------------------------
// Sector types (structs.h lines 112-123, constants.c lines 117-129)
// ---------------------------------------------------------------------------

export const SECTOR_TYPES: readonly string[] = [
  "INSIDE", // 0
  "CITY", // 1
  "FIELD", // 2
  "FOREST", // 3
  "HILLS", // 4
  "MOUNTAIN", // 5
  "WATER_SWIM", // 6
  "WATER_NOSWIM", // 7
  "FLYING", // 8
  "UNDERWATER" // 9
] as const;

// ---------------------------------------------------------------------------
// Exit / door types — as stored in world files (db.c setup_dir())
//
// The first integer on the exit data line maps to exit_info flags:
//   0 → no flags (normal passage)
//   1 → EX_ISDOOR
//   2 → EX_ISDOOR | EX_PICKPROOF
//   3 → EX_ISDOOR | EX_HIDDEN
//   4 → EX_ISDOOR | EX_PICKPROOF | EX_HIDDEN
// ---------------------------------------------------------------------------

export const EXIT_TYPES: readonly string[] = [
  "NORMAL", // 0
  "DOOR", // 1
  "DOOR_PICKPROOF", // 2
  "DOOR_HIDDEN", // 3
  "DOOR_HIDDEN_PICKPROOF" // 4
] as const;

// ---------------------------------------------------------------------------
// Zone reset modes (db.h zone_data struct)
// ---------------------------------------------------------------------------

export const RESET_MODES: readonly string[] = [
  "NEVER", // 0 — don't reset, don't update age
  "EMPTY", // 1 — reset only when no PCs in zone
  "ALWAYS" // 2 — always reset
] as const;

// ---------------------------------------------------------------------------
// Zone flags — bit positions (structs.h lines 94-102, constants.c lines 92-101)
// ---------------------------------------------------------------------------

export const ZONE_FLAGS: readonly string[] = [
  "CLOSED", // 0
  "NO_IMMORT", // 1
  "QUEST", // 2
  "GRID", // 3
  "NOBUILD", // 4
  "NO_ASTRAL", // 5
  "WORLDMAP" // 6
] as const;

// ---------------------------------------------------------------------------
// Equipment positions (structs.h lines 342-361)
// ---------------------------------------------------------------------------

export const WEAR_POSITIONS: readonly string[] = [
  "LIGHT", // 0
  "FINGER_R", // 1
  "FINGER_L", // 2
  "NECK_1", // 3
  "NECK_2", // 4
  "BODY", // 5
  "HEAD", // 6
  "LEGS", // 7
  "FEET", // 8
  "HANDS", // 9
  "ARMS", // 10
  "SHIELD", // 11
  "ABOUT", // 12
  "WAIST", // 13
  "WRIST_R", // 14
  "WRIST_L", // 15
  "WIELD", // 16
  "HOLD" // 17
] as const;

// ---------------------------------------------------------------------------
// Trigger types (dg_scripts.h lines 20-22)
// ---------------------------------------------------------------------------

export const TRIGGER_TYPES: readonly string[] = [
  "MOB_TRIGGER", // 0
  "OBJ_TRIGGER", // 1
  "WLD_TRIGGER" // 2
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Decode a bitvector into an array of flag name strings.
 * Each bit position maps to the corresponding entry in the flags array.
 */
export function decodeBitvector(value: number, flags: readonly string[]): string[] {
  const result: string[] = [];
  for (let bit = 0; bit < flags.length; bit++) {
    if (value & (1 << bit)) {
      result.push(flags[bit]);
    }
  }
  return result;
}

/**
 * Look up a value in an indexed array, returning a fallback string if out of range.
 */
export function lookupValue(index: number, table: readonly string[]): string {
  if (index >= 0 && index < table.length) {
    return table[index];
  }
  return `UNKNOWN(${index})`;
}
