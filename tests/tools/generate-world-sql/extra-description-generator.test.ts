import { describe, it, expect, vi } from "vitest";
import { generateExtraDescriptionSql } from "@src/tools/generate-world-sql/generators/extra-description-generator.js";
import type { Logger } from "@src/tools/lib/logger.js";
import type { ExtraDescription } from "@src/tools/lib/types.js";

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

describe("generateExtraDescriptionSql", () => {
  it("generates one row per keyword", () => {
    const eds: ExtraDescription[] = [
      { keywords: ["wall", "paintings"], description: "Beautiful paintings." }
    ];
    const log = makeLog();
    const result = generateExtraDescriptionSql(3001, eds, log);

    expect(result.count).toBe(2);
    expect(result.warnings).toBe(0);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toContain("'wall'");
    expect(result.lines[0]).toContain("'Beautiful paintings.'");
    expect(result.lines[1]).toContain("'paintings'");
  });

  it("uses INSERT OR IGNORE", () => {
    const eds: ExtraDescription[] = [
      { keywords: ["sign"], description: "A wooden sign." }
    ];
    const result = generateExtraDescriptionSql(3001, eds, makeLog());

    expect(result.lines[0]).toMatch(/^INSERT OR IGNORE/);
  });

  it("escapes single quotes in keywords and descriptions", () => {
    const eds: ExtraDescription[] = [
      { keywords: ["knight's"], description: "It's a knight's shield." }
    ];
    const result = generateExtraDescriptionSql(3001, eds, makeLog());

    expect(result.lines[0]).toContain("'knight''s'");
    expect(result.lines[0]).toContain("'It''s a knight''s shield.'");
  });

  it("handles multiple extra descriptions in one room", () => {
    const eds: ExtraDescription[] = [
      { keywords: ["sign"], description: "A wooden sign." },
      { keywords: ["floor", "drain"], description: "Dirty floor with a drain." }
    ];
    const result = generateExtraDescriptionSql(3001, eds, makeLog());

    expect(result.count).toBe(3);
    expect(result.lines).toHaveLength(3);
  });

  it("detects duplicate keywords and warns", () => {
    const eds: ExtraDescription[] = [
      { keywords: ["wall"], description: "First description." },
      { keywords: ["wall"], description: "Second description." }
    ];
    const log = makeLog();
    const result = generateExtraDescriptionSql(3001, eds, log);

    expect(result.count).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain("'First description.'");
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledWith(
      "Duplicate extra description keyword 'wall' in room 3001 — skipping"
    );
  });

  it("detects duplicates within the same keyword list", () => {
    const eds: ExtraDescription[] = [
      { keywords: ["tapestry", "tapestry", "tapestry"], description: "A tapestry." }
    ];
    const log = makeLog();
    const result = generateExtraDescriptionSql(8653, eds, log);

    expect(result.count).toBe(1);
    expect(result.warnings).toBe(2);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it("returns empty result for no extra descriptions", () => {
    const result = generateExtraDescriptionSql(3001, [], makeLog());

    expect(result.count).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.lines).toHaveLength(0);
  });
});
