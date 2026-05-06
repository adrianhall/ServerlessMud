import { describe, it, expect } from "vitest";
import {
  DIRECTIONS,
  ROOM_FLAGS,
  SECTOR_TYPES,
  EXIT_TYPES,
  RESET_MODES,
  ZONE_FLAGS,
  WEAR_POSITIONS,
  TRIGGER_TYPES,
  decodeBitvector,
  lookupValue
} from "../../../src/tools/generate-world/constants.js";

describe("constant tables", () => {
  it("has 10 directions", () => {
    expect(DIRECTIONS).toHaveLength(10);
    expect(DIRECTIONS[0]).toBe("NORTH");
    expect(DIRECTIONS[5]).toBe("DOWN");
    expect(DIRECTIONS[9]).toBe("SOUTHWEST");
  });

  it("has 17 room flags", () => {
    expect(ROOM_FLAGS).toHaveLength(17);
    expect(ROOM_FLAGS[0]).toBe("DARK");
    expect(ROOM_FLAGS[2]).toBe("NO_MOB");
    expect(ROOM_FLAGS[7]).toBe("NO_MAGIC");
    expect(ROOM_FLAGS[16]).toBe("WORLDMAP");
  });

  it("has 10 sector types", () => {
    expect(SECTOR_TYPES).toHaveLength(10);
    expect(SECTOR_TYPES[0]).toBe("INSIDE");
    expect(SECTOR_TYPES[1]).toBe("CITY");
    expect(SECTOR_TYPES[9]).toBe("UNDERWATER");
  });

  it("has 5 exit types", () => {
    expect(EXIT_TYPES).toHaveLength(5);
    expect(EXIT_TYPES[0]).toBe("NORMAL");
    expect(EXIT_TYPES[2]).toBe("DOOR_PICKPROOF");
    expect(EXIT_TYPES[4]).toBe("DOOR_HIDDEN_PICKPROOF");
  });

  it("has 3 reset modes", () => {
    expect(RESET_MODES).toHaveLength(3);
    expect(RESET_MODES[0]).toBe("NEVER");
    expect(RESET_MODES[2]).toBe("ALWAYS");
  });

  it("has 7 zone flags", () => {
    expect(ZONE_FLAGS).toHaveLength(7);
    expect(ZONE_FLAGS[3]).toBe("GRID");
  });

  it("has 18 wear positions", () => {
    expect(WEAR_POSITIONS).toHaveLength(18);
    expect(WEAR_POSITIONS[0]).toBe("LIGHT");
    expect(WEAR_POSITIONS[16]).toBe("WIELD");
  });

  it("has 3 trigger types", () => {
    expect(TRIGGER_TYPES).toHaveLength(3);
    expect(TRIGGER_TYPES[0]).toBe("MOB_TRIGGER");
  });
});

describe("decodeBitvector", () => {
  it("returns empty array for value 0", () => {
    expect(decodeBitvector(0, ROOM_FLAGS)).toEqual([]);
  });

  it("decodes single bit", () => {
    // bit 0 = DARK
    expect(decodeBitvector(1, ROOM_FLAGS)).toEqual(["DARK"]);
  });

  it("decodes multiple bits", () => {
    // 156 = 128 + 16 + 8 + 4 = bits 7,4,3,2 = NO_MAGIC, PEACEFUL, INDOORS, NO_MOB
    expect(decodeBitvector(156, ROOM_FLAGS)).toEqual([
      "NO_MOB",
      "INDOORS",
      "PEACEFUL",
      "NO_MAGIC"
    ]);
  });

  it("decodes zone flags", () => {
    // 8 = bit 3 = GRID
    expect(decodeBitvector(8, ZONE_FLAGS)).toEqual(["GRID"]);
  });

  it("ignores bits beyond the flags array length", () => {
    // Bit 20 is beyond ROOM_FLAGS (length 17)
    expect(decodeBitvector(1 << 20, ROOM_FLAGS)).toEqual([]);
  });
});

describe("lookupValue", () => {
  it("returns the string at the given index", () => {
    expect(lookupValue(0, SECTOR_TYPES)).toBe("INSIDE");
    expect(lookupValue(1, SECTOR_TYPES)).toBe("CITY");
  });

  it("returns UNKNOWN(n) for out-of-range indices", () => {
    expect(lookupValue(99, SECTOR_TYPES)).toBe("UNKNOWN(99)");
    expect(lookupValue(-1, SECTOR_TYPES)).toBe("UNKNOWN(-1)");
  });
});
