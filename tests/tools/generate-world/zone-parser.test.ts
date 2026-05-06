import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseZoneFile } from "../../../src/tools/generate-world/parsers/zone-parser.js";
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

describe("parseZoneFile", () => {
  let tmpDir: string;
  let log: Logger;

  async function writeZone(content: string): Promise<string> {
    const filePath = path.join(tmpDir, "test.zon");
    await writeFile(filePath, content);
    return filePath;
  }

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tbamud-zone-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    log = makeLog();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("parses zone header metadata", async () => {
    const content = [
      "#42",
      "TestBuilder~",
      "Test Zone Name~",
      "4200 4299 20 1 d 0 0 0 1 33",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);

    expect(zone.name).toBe("Test Zone Name");
    expect(zone.builder).toBe("TestBuilder");
    expect(zone.min_vnum).toBe(4200);
    expect(zone.max_vnum).toBe(4299);
    expect(zone.lifespan).toBe(20);
    expect(zone.reset_mode_value).toBe(1);
    expect(zone.reset_mode).toBe("EMPTY");
    expect(zone.flags_value).toBe(8); // 'd' = bit 3
    expect(zone.flags).toEqual(["GRID"]);
  });

  it("parses M (mob) commands", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "M 0 3011 1 3000\t(the merchant)",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    expect(zone.commands).toHaveLength(1);

    const cmd = zone.commands[0];
    expect(cmd.command).toBe("M");
    expect(cmd.if_flag).toBe(false);
    expect(cmd.arg1).toBe(3011); // mob vnum
    expect(cmd.arg2).toBe(1); // max existing
    expect(cmd.arg3).toBe(3000); // room vnum
    expect(cmd.comment).toBe("(the merchant)");
  });

  it("parses G (give) commands with if_flag", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "G 1 3006 99 -1\t(a sword)",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    const cmd = zone.commands[0];
    expect(cmd.command).toBe("G");
    expect(cmd.if_flag).toBe(true);
    expect(cmd.arg1).toBe(3006);
    expect(cmd.arg2).toBe(99);
  });

  it("parses R (remove) commands with 3 args", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "R 0 3000 3006 -1\t(a table)",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    const cmd = zone.commands[0];
    expect(cmd.command).toBe("R");
    expect(cmd.arg1).toBe(3000);
    expect(cmd.arg2).toBe(3006);
  });

  it("parses D (door) commands", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "D 0 20 0 2\t(a locked door)",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    const cmd = zone.commands[0];
    expect(cmd.command).toBe("D");
    expect(cmd.arg1).toBe(20); // room vnum
    expect(cmd.arg2).toBe(0); // direction
    expect(cmd.arg3).toBe(2); // state: closed+locked
  });

  it("skips comment lines starting with *", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "* This is a comment",
      "M 0 100 1 100",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    expect(zone.commands).toHaveLength(1);
    expect(zone.commands[0].command).toBe("M");
  });

  it("handles zone with no flags field (old format)", async () => {
    const content = ["#1", "Builder~", "Zone~", "100 199 10 2", "S", "$"].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    expect(zone.flags_value).toBe(0);
    expect(zone.flags).toEqual([]);
  });

  it("parses the real 30.zon file", async () => {
    const realPath = path.resolve("data/tbamud/lib/world/zon/30.zon");
    const zone = await parseZoneFile(realPath, log);

    expect(zone.name).toBe("Northern Midgaard");
    expect(zone.builder).toBe("DikuMUD");
    expect(zone.min_vnum).toBe(3000);
    expect(zone.max_vnum).toBe(3099);
    expect(zone.lifespan).toBe(15);
    expect(zone.reset_mode).toBe("ALWAYS");
    expect(zone.flags).toContain("GRID");
    expect(zone.commands.length).toBeGreaterThan(100);
  });

  it("parses V (variable) commands", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "V 0 2 3000 3001 0 myvar hello world",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    const cmd = zone.commands[0];
    expect(cmd.command).toBe("V");
    expect(cmd.if_flag).toBe(false);
    expect(cmd.arg1).toBe(2);
    expect(cmd.arg2).toBe(3000);
    expect(cmd.arg3).toBe(3001);
    expect(cmd.arg4).toBe(0);
    expect(cmd.sarg1).toBe("myvar");
    expect(cmd.sarg2).toBe("hello world");
  });

  it("handles V command with too few tokens", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "V 0 2 3000",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    expect(zone.commands).toHaveLength(0);
    expect(log.warn).toHaveBeenCalled();
  });

  it("handles command lines with too few tokens", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 0",
      "M 0",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    expect(zone.commands).toHaveLength(0);
    expect(log.warn).toHaveBeenCalled();
  });

  it("throws on missing zone header", async () => {
    const content = "not a zone header\n";
    await expect(parseZoneFile(await writeZone(content), log)).rejects.toThrow("Expected zone header");
  });

  it("throws on missing data line", async () => {
    const content = "#1\nBuilder~\nZone~\n";
    await expect(parseZoneFile(await writeZone(content), log)).rejects.toThrow(
      "Expected zone data line"
    );
  });

  it("throws on data line with too few fields", async () => {
    const content = "#1\nBuilder~\nZone~\n100 199\n";
    await expect(parseZoneFile(await writeZone(content), log)).rejects.toThrow("too few fields");
  });

  it("handles numeric zone flags", async () => {
    const content = [
      "#1",
      "Builder~",
      "Zone~",
      "100 199 10 2 8 0 0 0 1 33",
      "S",
      "$"
    ].join("\n");

    const zone = await parseZoneFile(await writeZone(content), log);
    expect(zone.flags_value).toBe(8);
    expect(zone.flags).toEqual(["GRID"]);
  });

  it("parses the real 0.zon file", async () => {
    const realPath = path.resolve("data/tbamud/lib/world/zon/0.zon");
    const zone = await parseZoneFile(realPath, log);

    expect(zone.name).toBe("The Builder Academy Zone");
    expect(zone.min_vnum).toBe(0);
    expect(zone.max_vnum).toBe(99);
  });
});
