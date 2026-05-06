import { describe, it, expect, vi } from "vitest";
import { TextReader, asciiFlagConv } from "../../../src/tools/generate-world/parsers/text-reader.js";
import type { Logger } from "../../../src/tools/generate-world/logger.js";

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

describe("TextReader", () => {
  it("reads lines sequentially", () => {
    const reader = new TextReader("line1\nline2\nline3", "test.txt", makeLog());
    expect(reader.nextLine()).toBe("line1");
    expect(reader.nextLine()).toBe("line2");
    expect(reader.nextLine()).toBe("line3");
    expect(reader.nextLine()).toBeUndefined();
    expect(reader.done).toBe(true);
  });

  it("tracks line numbers starting at 1", () => {
    const reader = new TextReader("a\nb", "test.txt", makeLog());
    expect(reader.lineNumber).toBe(1);
    reader.nextLine();
    expect(reader.lineNumber).toBe(2);
  });

  it("peeks without advancing", () => {
    const reader = new TextReader("first\nsecond", "test.txt", makeLog());
    expect(reader.peekLine()).toBe("first");
    expect(reader.peekLine()).toBe("first");
    reader.nextLine();
    expect(reader.peekLine()).toBe("second");
  });

  it("reports remaining line count", () => {
    const reader = new TextReader("a\nb\nc", "test.txt", makeLog());
    expect(reader.remaining).toBe(3);
    reader.nextLine();
    expect(reader.remaining).toBe(2);
  });

  describe("readTildeString", () => {
    it("reads a single-line tilde-terminated string", () => {
      const reader = new TextReader("hello world~\nnext", "test.txt", makeLog());
      expect(reader.readTildeString()).toBe("hello world");
      expect(reader.peekLine()).toBe("next");
    });

    it("reads a multi-line tilde-terminated string", () => {
      const reader = new TextReader("line one\nline two\nline three~", "test.txt", makeLog());
      expect(reader.readTildeString()).toBe("line one\nline two\nline three");
    });

    it("handles tilde on its own line", () => {
      const reader = new TextReader("hello\n~", "test.txt", makeLog());
      expect(reader.readTildeString()).toBe("hello");
    });

    it("handles empty string (tilde immediately)", () => {
      const reader = new TextReader("~", "test.txt", makeLog());
      expect(reader.readTildeString()).toBe("");
    });

    it("strips only a single trailing newline from the result", () => {
      // Input: "hello\n\n~" → lines ["hello", "", "~"]
      // The blank line between "hello" and "~" is content — only the final
      // newline added by the join is stripped, leaving "hello\n".
      const reader = new TextReader("hello\n\n~", "test.txt", makeLog());
      expect(reader.readTildeString()).toBe("hello\n");
    });

    it("strips a trailing newline from a normal multi-line string", () => {
      const reader = new TextReader("line one\nline two\n~", "test.txt", makeLog());
      expect(reader.readTildeString()).toBe("line one\nline two");
    });

    it("preserves internal whitespace and indentation", () => {
      const reader = new TextReader("   indented\n   also indented~", "test.txt", makeLog());
      expect(reader.readTildeString()).toBe("   indented\n   also indented");
    });
  });

  describe("skipUntil", () => {
    it("skips lines until predicate matches", () => {
      const reader = new TextReader("skip\nskip\n#30", "test.txt", makeLog());
      const result = reader.skipUntil((line) => line.startsWith("#"));
      expect(result).toBe("#30");
    });

    it("returns undefined if no match found", () => {
      const reader = new TextReader("nope\nnada", "test.txt", makeLog());
      const result = reader.skipUntil((line) => line.startsWith("#"));
      expect(result).toBeUndefined();
      expect(reader.done).toBe(true);
    });
  });

  describe("location", () => {
    it("formats filename and line number", () => {
      const reader = new TextReader("a\nb", "myfile.wld", makeLog());
      expect(reader.location()).toBe("myfile.wld:1");
      reader.nextLine();
      expect(reader.location()).toBe("myfile.wld:2");
    });
  });
});

describe("asciiFlagConv", () => {
  it("parses pure numeric strings", () => {
    expect(asciiFlagConv("0")).toBe(0);
    expect(asciiFlagConv("156")).toBe(156);
    expect(asciiFlagConv("1024")).toBe(1024);
  });

  it("parses negative numbers", () => {
    expect(asciiFlagConv("-1")).toBe(-1);
  });

  it("decodes lowercase ASCII letters as bit positions", () => {
    // a = bit 0 = 1
    expect(asciiFlagConv("a")).toBe(1);
    // b = bit 1 = 2
    expect(asciiFlagConv("b")).toBe(2);
    // c = bit 2 = 4
    expect(asciiFlagConv("c")).toBe(4);
    // d = bit 3 = 8
    expect(asciiFlagConv("d")).toBe(8);
    // z = bit 25
    expect(asciiFlagConv("z")).toBe(1 << 25);
  });

  it("decodes uppercase ASCII letters starting at bit 26", () => {
    // A = bit 26
    expect(asciiFlagConv("A")).toBe(1 << 26);
    // B = bit 27
    expect(asciiFlagConv("B")).toBe(1 << 27);
  });

  it("combines multiple letters", () => {
    // ab = bit 0 + bit 1 = 3
    expect(asciiFlagConv("ab")).toBe(3);
    // ace = bit 0 + bit 2 + bit 4 = 1 + 4 + 16 = 21
    expect(asciiFlagConv("ace")).toBe(21);
  });

  it("handles the zone flags example: d = GRID (bit 3) = 8", () => {
    expect(asciiFlagConv("d")).toBe(8);
  });
});
