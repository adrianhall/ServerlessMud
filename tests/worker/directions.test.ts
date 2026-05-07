import { describe, it, expect } from "vitest";
import { oppositeDirection, parseDirection, parseMovementCommand } from "@src/worker/directions";

describe("directions", () => {
  it("parses long direction names and abbreviations", () => {
    expect(parseDirection("north")).toBe("NORTH");
    expect(parseDirection("N")).toBe("NORTH");
    expect(parseDirection("southwest")).toBe("SOUTHWEST");
    expect(parseDirection("sw")).toBe("SOUTHWEST");
  });

  it("parses movement commands in supported forms", () => {
    expect(parseMovementCommand("go north")).toBe("NORTH");
    expect(parseMovementCommand("north")).toBe("NORTH");
    expect(parseMovementCommand("n")).toBe("NORTH");
    expect(parseMovementCommand("  GO   southwest  ")).toBe("SOUTHWEST");
  });

  it("rejects unsupported commands", () => {
    expect(parseMovementCommand("look north")).toBeNull();
    expect(parseMovementCommand("go north now")).toBeNull();
    expect(parseMovementCommand("go sideways")).toBeNull();
    expect(parseMovementCommand("")).toBeNull();
  });

  it("returns opposite directions", () => {
    expect(oppositeDirection("NORTH")).toBe("SOUTH");
    expect(oppositeDirection("EAST")).toBe("WEST");
    expect(oppositeDirection("UP")).toBe("DOWN");
    expect(oppositeDirection("NORTHEAST")).toBe("SOUTHWEST");
  });
});
