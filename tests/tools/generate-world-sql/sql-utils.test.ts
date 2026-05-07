import { describe, it, expect } from "vitest";
import { esc } from "@src/tools/generate-world-sql/generators/sql-utils.js";

describe("esc", () => {
  it("returns plain strings unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });

  it("escapes single quotes by doubling them", () => {
    expect(esc("it's a test")).toBe("it''s a test");
  });

  it("escapes multiple single quotes", () => {
    expect(esc("don't say 'hello'")).toBe("don''t say ''hello''");
  });

  it("handles empty strings", () => {
    expect(esc("")).toBe("");
  });

  it("handles strings with no special characters", () => {
    expect(esc("The Temple Of Midgaard")).toBe("The Temple Of Midgaard");
  });
});
