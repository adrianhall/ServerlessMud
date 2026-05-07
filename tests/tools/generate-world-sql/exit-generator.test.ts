import { describe, it, expect } from "vitest";
import { generateExitSql } from "@src/tools/generate-world-sql/generators/exit-generator.js";
import type { Exit } from "@src/tools/lib/types.js";

function makeExit(overrides?: Partial<Exit>): Exit {
  return {
    direction: "NORTH",
    direction_index: 0,
    description: "",
    keywords: [],
    door_type_value: 0,
    exit_type: "NORMAL",
    key_vnum: -1,
    target_room: 3054,
    ...overrides
  };
}

describe("generateExitSql", () => {
  it("generates an exit INSERT with correct values", () => {
    const exit = makeExit({ direction: "SOUTH", target_room: 3005 });
    const result = generateExitSql(3001, exit);

    expect(result.count).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain("INSERT INTO exits");
    expect(result.lines[0]).toContain("3001");
    expect(result.lines[0]).toContain("'SOUTH'");
    expect(result.lines[0]).toContain("3005");
  });

  it("serializes keywords as a JSON array", () => {
    const exit = makeExit({ keywords: ["gate", "diamond"] });
    const result = generateExitSql(2512, exit);

    expect(result.lines[0]).toContain('["gate","diamond"]');
  });

  it("serializes empty keywords as empty JSON array", () => {
    const exit = makeExit({ keywords: [] });
    const result = generateExitSql(3001, exit);

    expect(result.lines[0]).toContain("'[]'");
  });

  it("includes door_type and key_vnum for doors", () => {
    const exit = makeExit({
      door_type_value: 2,
      key_vnum: 5001
    });
    const result = generateExitSql(3001, exit);

    expect(result.lines[0]).toContain(", 2, 5001,");
  });

  it("escapes single quotes in exit description", () => {
    const exit = makeExit({ description: "You see a door's handle." });
    const result = generateExitSql(3001, exit);

    expect(result.lines[0]).toContain("'You see a door''s handle.'");
  });
});
