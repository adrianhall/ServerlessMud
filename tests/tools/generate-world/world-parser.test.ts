import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseWorldFile } from "../../../src/tools/generate-world/parsers/world-parser.js";
import type { Logger } from "../../../src/tools/generate-world/logger.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

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

describe("parseWorldFile", () => {
  let tmpDir: string;
  let log: Logger;

  async function writeWorld(content: string): Promise<string> {
    const filePath = path.join(tmpDir, "test.wld");
    await writeFile(filePath, content);
    return filePath;
  }

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tbamud-wld-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    log = makeLog();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("parses a minimal room", async () => {
    const content = [
      "#100",
      "A Simple Room~",
      "This is a test room.~",
      "10 0 0 0 0 1",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(1);

    const room = rooms[0];
    expect(room.vnum).toBe(100);
    expect(room.name).toBe("A Simple Room");
    expect(room.description).toBe("This is a test room.");
    expect(room.zone_number).toBe(10);
    expect(room.flags_value).toBe(0);
    expect(room.flags).toEqual([]);
    expect(room.sector_type_value).toBe(1);
    expect(room.sector_type).toBe("CITY");
    expect(room.exits).toEqual([]);
    expect(room.extra_descriptions).toEqual([]);
    expect(room.triggers).toEqual([]);
  });

  it("parses room flags correctly", async () => {
    // 156 = NO_MOB(4) + INDOORS(8) + PEACEFUL(16) + NO_MAGIC(128)
    const content = ["#200", "Flagged Room~", "A room.~", "10 156 0 0 0 0", "S", "$~"].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms[0].flags_value).toBe(156);
    expect(rooms[0].flags).toEqual(["NO_MOB", "INDOORS", "PEACEFUL", "NO_MAGIC"]);
    expect(rooms[0].sector_type).toBe("INSIDE");
  });

  it("parses a room with exits", async () => {
    const content = [
      "#300",
      "Room With Exits~",
      "A room.~",
      "10 0 0 0 0 1",
      "D0",
      "You see a hallway.~",
      "~",
      "0 -1 301",
      "D2",
      "A door to the south.~",
      "door~",
      "1 500 302",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    const room = rooms[0];
    expect(room.exits).toHaveLength(2);

    const north = room.exits[0];
    expect(north.direction).toBe("NORTH");
    expect(north.direction_index).toBe(0);
    expect(north.description).toBe("You see a hallway.");
    expect(north.keywords).toEqual([]);
    expect(north.door_type_value).toBe(0);
    expect(north.exit_type).toBe("NORMAL");
    expect(north.key_vnum).toBe(-1);
    expect(north.target_room).toBe(301);

    const south = room.exits[1];
    expect(south.direction).toBe("SOUTH");
    expect(south.keywords).toEqual(["door"]);
    expect(south.exit_type).toBe("DOOR");
    expect(south.key_vnum).toBe(500);
    expect(south.target_room).toBe(302);
  });

  it("parses all door types", async () => {
    const makeExit = (dir: number, type: number) =>
      [`D${dir}`, "Desc~", "~", `${type} -1 999`].join("\n");

    const content = [
      "#400",
      "Door Test~",
      "Room.~",
      "10 0 0 0 0 0",
      makeExit(0, 0), // NORMAL
      makeExit(1, 1), // DOOR
      makeExit(2, 2), // DOOR_PICKPROOF
      makeExit(3, 3), // DOOR_HIDDEN
      makeExit(4, 4), // DOOR_HIDDEN_PICKPROOF
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    const exits = rooms[0].exits;
    expect(exits[0].exit_type).toBe("NORMAL");
    expect(exits[1].exit_type).toBe("DOOR");
    expect(exits[2].exit_type).toBe("DOOR_PICKPROOF");
    expect(exits[3].exit_type).toBe("DOOR_HIDDEN");
    expect(exits[4].exit_type).toBe("DOOR_HIDDEN_PICKPROOF");
  });

  it("parses extra descriptions", async () => {
    const content = [
      "#500",
      "Room With Extras~",
      "A room.~",
      "10 0 0 0 0 0",
      "E",
      "sign board~",
      "The sign reads: Welcome!~",
      "E",
      "painting art~",
      "A beautiful painting\nof a sunset.~",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    const extras = rooms[0].extra_descriptions;
    expect(extras).toHaveLength(2);

    expect(extras[0].keywords).toEqual(["sign", "board"]);
    expect(extras[0].description).toBe("The sign reads: Welcome!");

    expect(extras[1].keywords).toEqual(["painting", "art"]);
    expect(extras[1].description).toBe("A beautiful painting\nof a sunset.");
  });

  it("parses trigger attachments after S marker", async () => {
    const content = [
      "#600",
      "Triggered Room~",
      "A room.~",
      "10 0 0 0 0 0",
      "S",
      "T 3017",
      "T 3004",
      "#601",
      "Next Room~",
      "Next.~",
      "10 0 0 0 0 0",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(2);

    expect(rooms[0].triggers).toHaveLength(2);
    expect(rooms[0].triggers[0].vnum).toBe(3017);
    expect(rooms[0].triggers[1].vnum).toBe(3004);

    expect(rooms[1].triggers).toHaveLength(0);
  });

  it("parses multiple rooms", async () => {
    const content = [
      "#100",
      "Room One~",
      "First room.~",
      "10 0 0 0 0 1",
      "S",
      "#101",
      "Room Two~",
      "Second room.~",
      "10 8 0 0 0 0",
      "D1",
      "East exit.~",
      "~",
      "0 -1 100",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].vnum).toBe(100);
    expect(rooms[1].vnum).toBe(101);
    expect(rooms[1].flags).toContain("INDOORS");
    expect(rooms[1].exits).toHaveLength(1);
  });

  it("handles multi-line descriptions", async () => {
    const content = [
      "#700",
      "Grand Hall~",
      "   You stand in a grand hall. The ceiling arches",
      "high above, supported by marble columns. Tapestries",
      "hang on every wall.~",
      "10 0 0 0 0 0",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms[0].description).toContain("grand hall");
    expect(rooms[0].description).toContain("Tapestries");
    expect(rooms[0].description.split("\n")).toHaveLength(3);
  });

  it("handles room with missing data line (EOF)", async () => {
    const content = ["#100", "Orphan Room~", "A room.~"].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(0);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("expected data line"));
  });

  it("handles room with too few data fields", async () => {
    const content = ["#100", "Bad Room~", "A room.~", "10 0", "S", "$~"].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(0);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("too few fields"));
  });

  it("handles exit with missing data line (EOF)", async () => {
    const content = [
      "#100",
      "Room~",
      "Desc.~",
      "10 0 0 0 0 0",
      "D0",
      "North.~",
      "~"
      // Missing data line for exit — EOF
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    // Room should still be parsed, exit will be null
    expect(rooms).toHaveLength(1);
    expect(rooms[0].exits).toHaveLength(0);
    expect(log.error).toHaveBeenCalled();
  });

  it("handles exit with too few data fields", async () => {
    const content = [
      "#100",
      "Room~",
      "Desc.~",
      "10 0 0 0 0 0",
      "D0",
      "North.~",
      "~",
      "0 -1",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].exits).toHaveLength(0);
    expect(log.error).toHaveBeenCalled();
  });

  it("warns on unexpected lines within a room", async () => {
    const content = [
      "#100",
      "Room~",
      "Desc.~",
      "10 0 0 0 0 0",
      "X unexpected",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("unexpected line"));
  });

  it("handles triggers before S marker", async () => {
    const content = [
      "#100",
      "Triggered Room~",
      "Desc.~",
      "10 0 0 0 0 0",
      "T 5000",
      "S",
      "$~"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms[0].triggers).toHaveLength(1);
    expect(rooms[0].triggers[0].vnum).toBe(5000);
  });

  it("handles file ending with just $", async () => {
    const content = [
      "#100",
      "Room~",
      "Desc.~",
      "10 0 0 0 0 0",
      "S",
      "$"
    ].join("\n");

    const rooms = await parseWorldFile(await writeWorld(content), log);
    expect(rooms).toHaveLength(1);
  });

  it("parses the real 30.wld file", async () => {
    const realPath = path.resolve("data/tbamud/lib/world/wld/30.wld");
    const rooms = await parseWorldFile(realPath, log);

    // Zone 30 should have many rooms
    expect(rooms.length).toBeGreaterThan(40);

    // Check The Reading Room (vnum 3000)
    const readingRoom = rooms.find((r) => r.vnum === 3000);
    expect(readingRoom).toBeDefined();
    expect(readingRoom!.name).toBe("The Reading Room");
    expect(readingRoom!.flags).toContain("NO_MOB");
    expect(readingRoom!.flags).toContain("PEACEFUL");
    expect(readingRoom!.flags).toContain("INDOORS");
    expect(readingRoom!.flags).toContain("NO_MAGIC");
    expect(readingRoom!.sector_type).toBe("INSIDE");
    expect(readingRoom!.exits).toHaveLength(1);
    expect(readingRoom!.exits[0].direction).toBe("EAST");
    expect(readingRoom!.exits[0].target_room).toBe(3001);
    expect(readingRoom!.extra_descriptions).toHaveLength(1);
    expect(readingRoom!.extra_descriptions[0].keywords).toContain("credits");

    // Check room with triggers (3001 — Temple of Midgaard)
    const temple = rooms.find((r) => r.vnum === 3001);
    expect(temple).toBeDefined();
    expect(temple!.triggers).toHaveLength(1);
    expect(temple!.triggers[0].vnum).toBe(3017);

    // Check room with a door (3040 — West Gate)
    const westGate = rooms.find((r) => r.vnum === 3040);
    expect(westGate).toBeDefined();
    const gateDoor = westGate!.exits.find((e) => e.direction === "WEST");
    expect(gateDoor).toBeDefined();
    expect(gateDoor!.exit_type).toBe("DOOR");
    expect(gateDoor!.key_vnum).toBe(3112);

    // Check room with pickproof door (3030 — The Dump)
    const dump = rooms.find((r) => r.vnum === 3030);
    expect(dump).toBeDefined();
    const sewer = dump!.exits.find((e) => e.direction === "DOWN");
    expect(sewer).toBeDefined();
    expect(sewer!.exit_type).toBe("DOOR_PICKPROOF");
    expect(sewer!.key_vnum).toBe(3005);
  });
});
