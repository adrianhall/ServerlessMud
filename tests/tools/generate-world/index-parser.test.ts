import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseIndexFile } from "../../../src/tools/generate-world/parsers/index-parser.js";
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

describe("parseIndexFile", () => {
  let tmpDir: string;
  let log: Logger;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tbamud-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    log = makeLog();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("parses a standard index file", async () => {
    const content = "0.zon\n12.zon\n30.zon\n$\n";
    await writeFile(path.join(tmpDir, "index.mini"), content);

    const zones = await parseIndexFile(path.join(tmpDir, "index.mini"), log);
    expect(zones).toEqual(["0", "12", "30"]);
  });

  it("stops at the $ terminator", async () => {
    const content = "10.zon\n20.zon\n$\n999.zon\n";
    await writeFile(path.join(tmpDir, "index"), content);

    const zones = await parseIndexFile(path.join(tmpDir, "index"), log);
    expect(zones).toEqual(["10", "20"]);
  });

  it("skips blank lines", async () => {
    const content = "5.zon\n\n15.zon\n$\n";
    await writeFile(path.join(tmpDir, "index"), content);

    const zones = await parseIndexFile(path.join(tmpDir, "index"), log);
    expect(zones).toEqual(["5", "15"]);
  });

  it("warns on unexpected entries", async () => {
    const content = "10.zon\nbadentry\n$\n";
    await writeFile(path.join(tmpDir, "index"), content);

    const zones = await parseIndexFile(path.join(tmpDir, "index"), log);
    expect(zones).toEqual(["10"]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("badentry"));
  });

  it("handles file with no $ terminator", async () => {
    const content = "1.zon\n2.zon";
    await writeFile(path.join(tmpDir, "index"), content);

    const zones = await parseIndexFile(path.join(tmpDir, "index"), log);
    expect(zones).toEqual(["1", "2"]);
  });

  it("parses the real index.mini file", async () => {
    const realPath = path.resolve("data/tbamud/lib/world/zon/index.mini");
    const zones = await parseIndexFile(realPath, log);
    expect(zones).toEqual(["0", "12", "30"]);
  });
});
