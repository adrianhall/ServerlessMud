import { describe, it, expect } from "vitest";
import { generateZoneSql } from "@src/tools/generate-world-sql/generators/zone-generator.js";
import type { Zone } from "@src/tools/lib/types.js";

function makeZone(overrides?: Partial<Zone>): Zone {
  return {
    name: "Test Zone",
    builder: "TestBuilder",
    min_vnum: 100,
    max_vnum: 199,
    lifespan: 15,
    reset_mode_value: 2,
    reset_mode: "ALWAYS",
    flags_value: 0,
    flags: [],
    commands: [],
    ...overrides
  };
}

describe("generateZoneSql", () => {
  it("generates a zone INSERT with correct values", () => {
    const zone = makeZone({ name: "Northern Midgaard", builder: "DikuMUD" });
    const result = generateZoneSql(30, zone);

    expect(result.count).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain("INSERT INTO zones");
    expect(result.lines[0]).toContain("30");
    expect(result.lines[0]).toContain("'Northern Midgaard'");
    expect(result.lines[0]).toContain("'DikuMUD'");
  });

  it("escapes single quotes in zone name", () => {
    const zone = makeZone({ name: "Tester's Zone" });
    const result = generateZoneSql(1, zone);

    expect(result.lines[0]).toContain("'Tester''s Zone'");
  });

  it("generates zone command INSERTs with sort_order", () => {
    const zone = makeZone({
      commands: [
        {
          command: "M",
          if_flag: false,
          arg1: 3011,
          arg2: 1,
          arg3: 3000,
          line: 7,
          comment: "(the merchant)"
        },
        {
          command: "G",
          if_flag: true,
          arg1: 3006,
          arg2: 99,
          arg3: -1,
          line: 8
        }
      ]
    });

    const result = generateZoneSql(30, zone);

    // 1 zone row + 2 command rows
    expect(result.lines).toHaveLength(3);
    expect(result.lines[1]).toContain("zone_commands");
    expect(result.lines[1]).toContain("30, 0, 'M', 0");
    expect(result.lines[1]).toContain("'(the merchant)'");
    expect(result.lines[2]).toContain("30, 1, 'G', 1");
    expect(result.lines[2]).toContain("NULL"); // no comment
  });

  it("handles optional arg4 and sarg fields", () => {
    const zone = makeZone({
      commands: [
        {
          command: "M",
          if_flag: false,
          arg1: 10,
          arg2: 1,
          arg3: 100,
          arg4: 5,
          line: 1
        },
        {
          command: "V",
          if_flag: false,
          arg1: 0,
          arg2: 0,
          arg3: 0,
          sarg1: "varname",
          sarg2: "value",
          line: 2
        }
      ]
    });

    const result = generateZoneSql(1, zone);

    expect(result.lines[1]).toContain(", 5, ");
    expect(result.lines[2]).toContain("'varname'");
    expect(result.lines[2]).toContain("'value'");
  });
});
