import { describe, it, expect, vi } from "vitest";
import { readZoneFiles } from "@src/tools/generate-world-sql/zone-loader.js";
import type { Logger } from "@src/tools/lib/logger.js";
import path from "node:path";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures");

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

describe("readZoneFiles", () => {
  it("loads and parses zone JSON files from a directory", async () => {
    const log = makeLog();
    const zones = await readZoneFiles(["zone-268.json"], FIXTURES_DIR, log);

    expect(zones).toHaveLength(1);
    expect(zones[0].id).toBe("268");
    expect(zones[0].zone.name).toBe("Vice Island II");
    expect(zones[0].world).toHaveLength(3);
  });

  it("logs a debug message for each file loaded", async () => {
    const log = makeLog();
    await readZoneFiles(["zone-268.json"], FIXTURES_DIR, log);

    expect(log.debug).toHaveBeenCalledOnce();
    expect(log.debug).toHaveBeenCalledWith("Loaded zone-268.json");
  });

  it("returns an empty array when given no files", async () => {
    const zones = await readZoneFiles([], FIXTURES_DIR, makeLog());

    expect(zones).toHaveLength(0);
  });

  it("preserves zone data structure", async () => {
    const zones = await readZoneFiles(["zone-268.json"], FIXTURES_DIR, makeLog());
    const zone = zones[0];

    // Zone metadata
    expect(zone.zone.builder).toBe("Questor");
    expect(zone.zone.min_vnum).toBe(26800);
    expect(zone.zone.max_vnum).toBe(26899);
    expect(zone.zone.commands).toHaveLength(2);

    // Room data
    const room = zone.world[0];
    expect(room.vnum).toBe(26800);
    expect(room.exits).toHaveLength(2);
    expect(room.extra_descriptions).toHaveLength(1);
    expect(room.extra_descriptions[0].keywords).toContain("credits");

    // Trigger data
    const trapRoom = zone.world[1];
    expect(trapRoom.triggers).toHaveLength(1);
    expect(trapRoom.triggers[0].vnum).toBe(26800);
  });

  it("throws on non-existent file", async () => {
    await expect(
      readZoneFiles(["nonexistent.json"], FIXTURES_DIR, makeLog())
    ).rejects.toThrow();
  });
});
