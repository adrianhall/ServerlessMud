import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "@lib/cloudflare-logging";
import { readEnv } from "@lib/cloudflare-logging/create-logger";

// ---------------------------------------------------------------------------
// readEnv
// ---------------------------------------------------------------------------

describe("readEnv", () => {
  afterEach(() => {
    delete process.env.TEST_READ_ENV;
    vi.restoreAllMocks();
  });

  it("returns the value of an existing env var", () => {
    process.env.TEST_READ_ENV = "hello";
    expect(readEnv("TEST_READ_ENV")).toBe("hello");
  });

  it("returns undefined for a missing env var", () => {
    expect(readEnv("DEFINITELY_NOT_SET_12345")).toBeUndefined();
  });

  it("returns undefined when process.env access throws", () => {
    // Simulate an environment where accessing process.env throws
    // (e.g. a locked-down runtime).
    vi.stubGlobal(
      "process",
      new Proxy(process, {
        get(_target, prop) {
          if (prop === "env") throw new Error("no env access");
          return undefined;
        }
      })
    );

    expect(readEnv("ANY_KEY")).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("returns undefined when process is not defined", () => {
    // Simulate an environment where `process` does not exist at all
    // (e.g. a vanilla browser or a Worker without nodejs_compat).
    vi.stubGlobal("process", undefined);

    expect(readEnv("ANY_KEY")).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// createLogger
// ---------------------------------------------------------------------------

describe("createLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Clean up any env vars we set during tests.
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
  });

  // -----------------------------------------------------------------------
  // Basic functionality
  // -----------------------------------------------------------------------

  it("returns an object with debug, info, warn, and error methods", () => {
    const log = createLogger("test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("emits info-level messages by default", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("mod");
    log.info("hello");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("emits warn-level messages by default", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger("mod");
    log.warn("careful");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("emits error-level messages by default", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("mod");
    log.error("boom");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("suppresses debug-level messages at the default info threshold", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("mod");
    log.debug("verbose");
    expect(spy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Explicit minLogLevel option
  // -----------------------------------------------------------------------

  it("emits debug when minLogLevel is 'debug'", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("mod", { minLogLevel: "debug" });
    log.debug("verbose");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("suppresses info and debug when minLogLevel is 'warn'", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const log = createLogger("mod", { minLogLevel: "warn" });
    log.debug("hidden");
    log.info("hidden");
    log.warn("visible");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("only emits error when minLogLevel is 'error'", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const log = createLogger("mod", { minLogLevel: "error" });
    log.debug("hidden");
    log.info("hidden");
    log.warn("hidden");
    log.error("visible");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("suppresses all output when minLogLevel is 'silent'", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const log = createLogger("mod", { minLogLevel: "silent" });
    log.debug("hidden");
    log.info("hidden");
    log.warn("hidden");
    log.error("hidden");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Env var fallback for LOG_LEVEL
  // -----------------------------------------------------------------------

  it("reads LOG_LEVEL from env when no constructor option is set", () => {
    process.env.LOG_LEVEL = "debug";
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("mod");
    log.debug("now visible");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("constructor option takes precedence over LOG_LEVEL env var", () => {
    process.env.LOG_LEVEL = "debug";
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("mod", { minLogLevel: "warn" });
    log.debug("suppressed");
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores an invalid LOG_LEVEL env var", () => {
    process.env.LOG_LEVEL = "verbose";
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    // Falls back to default "info", so debug is suppressed.
    const log = createLogger("mod");
    log.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Format option
  // -----------------------------------------------------------------------

  it("uses pretty format by default", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("mod");
    log.info("hello");
    // Pretty format has a prefix string containing the module name and
    // an ISO timestamp, passed as the first argument.
    const prefix = spy.mock.calls[0][0] as string;
    expect(prefix).toContain("[mod]");
    expect(prefix).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("uses structured format when explicitly requested", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("mod", { format: "structured" });
    log.info("hello", { key: "val" });
    // Structured format: first arg is the message, second is an object.
    expect(spy.mock.calls[0][0]).toBe("hello");
    expect(spy.mock.calls[0][1]).toEqual({ module: "mod", key: "val" });
  });

  // -----------------------------------------------------------------------
  // Env var fallback for LOG_FORMAT
  // -----------------------------------------------------------------------

  it("reads LOG_FORMAT from env when no constructor option is set", () => {
    process.env.LOG_FORMAT = "structured";
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("mod");
    log.info("hello");
    // Structured: first arg is the message string.
    expect(spy.mock.calls[0][0]).toBe("hello");
  });

  it("constructor format option takes precedence over LOG_FORMAT env var", () => {
    process.env.LOG_FORMAT = "structured";
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("mod", { format: "pretty" });
    log.info("hello");
    // Pretty: first arg is a prefix containing module and timestamp.
    const prefix = spy.mock.calls[0][0] as string;
    expect(prefix).toContain("[mod]");
  });

  it("ignores an invalid LOG_FORMAT env var", () => {
    process.env.LOG_FORMAT = "json";
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    // Falls back to default "pretty".
    const log = createLogger("mod");
    log.info("hello");
    const prefix = spy.mock.calls[0][0] as string;
    expect(prefix).toContain("[mod]");
  });

  // -----------------------------------------------------------------------
  // Data parameter
  // -----------------------------------------------------------------------

  it("passes structured data through in structured format", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger("mod", { format: "structured" });
    log.warn("alert", { remaining: 5 });
    expect(spy.mock.calls[0][1]).toEqual({ module: "mod", remaining: 5 });
  });

  it("passes structured data through in pretty format", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger("mod", { format: "pretty" });
    log.warn("alert", { remaining: 5 });
    // Pretty format: prefix, message, data.
    expect(spy.mock.calls[0][2]).toEqual({ remaining: 5 });
  });
});
