import { describe, it, expect } from "vitest";
import { generateRoomSql } from "@src/tools/generate-world-sql/generators/room-generator.js";
import type { Room } from "@src/tools/lib/types.js";

function makeRoom(overrides?: Partial<Room>): Room {
  return {
    vnum: 3001,
    name: "The Temple Of Midgaard",
    description: "A large temple.",
    zone_number: 30,
    flags_value: 8,
    flags: ["INDOORS"],
    sector_type_value: 0,
    sector_type: "INSIDE",
    exits: [],
    extra_descriptions: [],
    triggers: [],
    ...overrides
  };
}

describe("generateRoomSql", () => {
  it("generates a room INSERT with correct values", () => {
    const room = makeRoom();
    const result = generateRoomSql(room, 30);

    expect(result.count).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain("INSERT INTO rooms");
    expect(result.lines[0]).toContain("3001");
    expect(result.lines[0]).toContain("30");
    expect(result.lines[0]).toContain("'The Temple Of Midgaard'");
    expect(result.lines[0]).toContain("'A large temple.'");
    expect(result.lines[0]).toContain(", 8, 0)");
  });

  it("escapes single quotes in name and description", () => {
    const room = makeRoom({
      name: "Tester's Room",
      description: "It's a room with 'quotes'."
    });
    const result = generateRoomSql(room, 1);

    expect(result.lines[0]).toContain("'Tester''s Room'");
    expect(result.lines[0]).toContain("'It''s a room with ''quotes''.'");
  });

  it("handles empty description", () => {
    const room = makeRoom({ description: "" });
    const result = generateRoomSql(room, 1);

    expect(result.lines[0]).toContain("''");
  });
});
