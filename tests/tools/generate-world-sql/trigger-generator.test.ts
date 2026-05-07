import { describe, it, expect, vi } from "vitest";
import { generateTriggerSql } from "@src/tools/generate-world-sql/generators/trigger-generator.js";
import type { Logger } from "@src/tools/lib/logger.js";
import type { TriggerAttachment } from "@src/tools/lib/types.js";

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

describe("generateTriggerSql", () => {
  it("generates one INSERT per trigger", () => {
    const triggers: TriggerAttachment[] = [{ vnum: 100 }, { vnum: 200 }];
    const result = generateTriggerSql(3001, triggers, makeLog());

    expect(result.count).toBe(2);
    expect(result.warnings).toBe(0);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toContain("3001, 100");
    expect(result.lines[1]).toContain("3001, 200");
  });

  it("uses INSERT OR IGNORE", () => {
    const triggers: TriggerAttachment[] = [{ vnum: 100 }];
    const result = generateTriggerSql(3001, triggers, makeLog());

    expect(result.lines[0]).toMatch(/^INSERT OR IGNORE/);
  });

  it("detects duplicate triggers and warns", () => {
    const triggers: TriggerAttachment[] = [
      { vnum: 65302 },
      { vnum: 65302 },
      { vnum: 65302 }
    ];
    const log = makeLog();
    const result = generateTriggerSql(65306, triggers, log);

    expect(result.count).toBe(1);
    expect(result.warnings).toBe(2);
    expect(result.lines).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(
      "Duplicate trigger 65302 in room 65306 — skipping"
    );
  });

  it("returns empty result for no triggers", () => {
    const result = generateTriggerSql(3001, [], makeLog());

    expect(result.count).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.lines).toHaveLength(0);
  });
});
