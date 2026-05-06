import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseZoneFile } from "../../../src/tools/generate-world/parsers/zone-parser.js";
import { parseWorldFile } from "../../../src/tools/generate-world/parsers/world-parser.js";
import { parseIndexFile } from "../../../src/tools/generate-world/parsers/index-parser.js";
import type { Logger } from "../../../src/tools/generate-world/logger.js";
import type { ZoneFile } from "../../../src/tools/generate-world/types.js";
import path from "node:path";

function makeLog(): Logger {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    forZone: vi.fn()
  } as unknown as Logger;
}

const WORLD_DIR = path.resolve("data/tbamud/lib/world");

async function processZone(zoneId: string, log: Logger): Promise<ZoneFile> {
  const zonPath = path.join(WORLD_DIR, "zon", `${zoneId}.zon`);
  const wldPath = path.join(WORLD_DIR, "wld", `${zoneId}.wld`);
  const zone = await parseZoneFile(zonPath, log);
  const world = await parseWorldFile(wldPath, log);
  return { id: zoneId, zone, world };
}

describe("integration: full zone processing", () => {
  let log: Logger;

  beforeEach(() => {
    log = makeLog();
  });

  it("processes zone 30 (Northern Midgaard) end-to-end", async () => {
    const result = await processZone("30", log);

    // Top-level structure
    expect(result.id).toBe("30");
    expect(result.zone).toBeDefined();
    expect(result.world).toBeDefined();
    expect(Array.isArray(result.world)).toBe(true);

    // Zone metadata
    expect(result.zone.name).toBe("Northern Midgaard");
    expect(result.zone.builder).toBe("DikuMUD");
    expect(result.zone.min_vnum).toBe(3000);
    expect(result.zone.max_vnum).toBe(3099);
    expect(result.zone.lifespan).toBe(15);
    expect(result.zone.reset_mode).toBe("ALWAYS");
    expect(result.zone.flags).toContain("GRID");

    // Zone commands
    expect(result.zone.commands.length).toBeGreaterThan(100);
    const mobCommands = result.zone.commands.filter((c) => c.command === "M");
    expect(mobCommands.length).toBeGreaterThan(20);

    // World rooms
    expect(result.world.length).toBeGreaterThan(40);

    // All room vnums should be within zone range or reference external zones
    // (rooms in zone 30 have vnums 3000-3099)
    for (const room of result.world) {
      expect(room.vnum).toBeGreaterThanOrEqual(3000);
      expect(room.vnum).toBeLessThanOrEqual(3099);
    }
  });

  it("processes zone 0 (Builder Academy) end-to-end", async () => {
    const result = await processZone("0", log);

    expect(result.id).toBe("0");
    expect(result.zone.name).toBe("The Builder Academy Zone");
    expect(result.world.length).toBeGreaterThan(10);

    // Verify room 0 (The Void) exists
    const theVoid = result.world.find((r) => r.vnum === 0);
    expect(theVoid).toBeDefined();
    expect(theVoid!.name).toBe("The Void");
  });

  it("produces valid JSON for all index.mini zones", async () => {
    const indexPath = path.join(WORLD_DIR, "zon", "index.mini");
    const zoneIds = await parseIndexFile(indexPath, log);

    expect(zoneIds).toEqual(["0", "12", "30"]);

    for (const zoneId of zoneIds) {
      const result = await processZone(zoneId, log);

      // Verify JSON serialization round-trips
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as ZoneFile;
      expect(parsed.id).toBe(zoneId);
      expect(parsed.zone.name).toBeTruthy();
      expect(parsed.world.length).toBeGreaterThan(0);

      // Every room should have required fields
      for (const room of parsed.world) {
        expect(typeof room.vnum).toBe("number");
        expect(typeof room.name).toBe("string");
        expect(room.name.length).toBeGreaterThan(0);
        expect(typeof room.description).toBe("string");
        expect(Array.isArray(room.flags)).toBe(true);
        expect(typeof room.sector_type).toBe("string");
        expect(Array.isArray(room.exits)).toBe(true);
        expect(Array.isArray(room.extra_descriptions)).toBe(true);
        expect(Array.isArray(room.triggers)).toBe(true);
      }

      // Every exit should have required fields
      for (const room of parsed.world) {
        for (const exit of room.exits) {
          expect(typeof exit.direction).toBe("string");
          expect(typeof exit.exit_type).toBe("string");
          expect(typeof exit.target_room).toBe("number");
        }
      }
    }
  });

  it("generates no warnings or errors for zone 30", async () => {
    await processZone("30", log);

    // Should complete without errors
    expect(log.error).not.toHaveBeenCalled();
    // Warnings may occur for edge cases, but zone 30 should be clean
    expect(log.warn).not.toHaveBeenCalled();
  });
});
