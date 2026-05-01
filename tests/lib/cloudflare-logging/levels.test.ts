import { describe, it, expect } from "vitest";
import { shouldLog, parseLogLevel, parseLogFormat } from "@lib/cloudflare-logging";

describe("shouldLog", () => {
  // -----------------------------------------------------------------------
  // Messages at or above the threshold should be emitted.
  // -----------------------------------------------------------------------

  it("emits debug when minLevel is debug", () => {
    expect(shouldLog("debug", "debug")).toBe(true);
  });

  it("emits info when minLevel is debug", () => {
    expect(shouldLog("info", "debug")).toBe(true);
  });

  it("emits warn when minLevel is debug", () => {
    expect(shouldLog("warn", "debug")).toBe(true);
  });

  it("emits error when minLevel is debug", () => {
    expect(shouldLog("error", "debug")).toBe(true);
  });

  it("emits info when minLevel is info", () => {
    expect(shouldLog("info", "info")).toBe(true);
  });

  it("emits warn when minLevel is warn", () => {
    expect(shouldLog("warn", "warn")).toBe(true);
  });

  it("emits error when minLevel is error", () => {
    expect(shouldLog("error", "error")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Messages below the threshold should be suppressed.
  // -----------------------------------------------------------------------

  it("suppresses debug when minLevel is info", () => {
    expect(shouldLog("debug", "info")).toBe(false);
  });

  it("suppresses debug when minLevel is warn", () => {
    expect(shouldLog("debug", "warn")).toBe(false);
  });

  it("suppresses debug when minLevel is error", () => {
    expect(shouldLog("debug", "error")).toBe(false);
  });

  it("suppresses info when minLevel is warn", () => {
    expect(shouldLog("info", "warn")).toBe(false);
  });

  it("suppresses info when minLevel is error", () => {
    expect(shouldLog("info", "error")).toBe(false);
  });

  it("suppresses warn when minLevel is error", () => {
    expect(shouldLog("warn", "error")).toBe(false);
  });

  // -----------------------------------------------------------------------
  // silent level
  // -----------------------------------------------------------------------

  it("suppresses debug when minLevel is silent", () => {
    expect(shouldLog("debug", "silent")).toBe(false);
  });

  it("suppresses info when minLevel is silent", () => {
    expect(shouldLog("info", "silent")).toBe(false);
  });

  it("suppresses warn when minLevel is silent", () => {
    expect(shouldLog("warn", "silent")).toBe(false);
  });

  it("suppresses error when minLevel is silent", () => {
    expect(shouldLog("error", "silent")).toBe(false);
  });
});

describe("parseLogLevel", () => {
  it("parses 'debug'", () => {
    expect(parseLogLevel("debug")).toBe("debug");
  });

  it("parses 'info'", () => {
    expect(parseLogLevel("info")).toBe("info");
  });

  it("parses 'warn'", () => {
    expect(parseLogLevel("warn")).toBe("warn");
  });

  it("parses 'error'", () => {
    expect(parseLogLevel("error")).toBe("error");
  });

  it("parses 'silent'", () => {
    expect(parseLogLevel("silent")).toBe("silent");
  });

  it("is case-insensitive", () => {
    expect(parseLogLevel("DEBUG")).toBe("debug");
    expect(parseLogLevel("Info")).toBe("info");
    expect(parseLogLevel("WARN")).toBe("warn");
    expect(parseLogLevel("Error")).toBe("error");
    expect(parseLogLevel("SILENT")).toBe("silent");
  });

  it("returns undefined for an unrecognised value", () => {
    expect(parseLogLevel("verbose")).toBeUndefined();
    expect(parseLogLevel("trace")).toBeUndefined();
    expect(parseLogLevel("")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(parseLogLevel(undefined)).toBeUndefined();
  });
});

describe("parseLogFormat", () => {
  it("parses 'pretty'", () => {
    expect(parseLogFormat("pretty")).toBe("pretty");
  });

  it("parses 'structured'", () => {
    expect(parseLogFormat("structured")).toBe("structured");
  });

  it("is case-insensitive", () => {
    expect(parseLogFormat("PRETTY")).toBe("pretty");
    expect(parseLogFormat("Structured")).toBe("structured");
  });

  it("returns undefined for an unrecognised value", () => {
    expect(parseLogFormat("json")).toBeUndefined();
    expect(parseLogFormat("text")).toBeUndefined();
    expect(parseLogFormat("")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(parseLogFormat(undefined)).toBeUndefined();
  });
});
