import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultLogger } from "@lib/cloudflare-auth/default-logger";

describe("createDefaultLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Returns a valid Logger
  // -----------------------------------------------------------------------

  it("returns an object with debug, info, warn, and error methods", () => {
    const log = createDefaultLogger("test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  // -----------------------------------------------------------------------
  // Each method delegates to the correct console method
  // -----------------------------------------------------------------------

  it("debug delegates to console.debug with module prefix", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createDefaultLogger("my-mod");
    log.debug("test message");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("[my-mod]", "test message");
  });

  it("info delegates to console.info with module prefix", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createDefaultLogger("my-mod");
    log.info("test message");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("[my-mod]", "test message");
  });

  it("warn delegates to console.warn with module prefix", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createDefaultLogger("my-mod");
    log.warn("test message");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("[my-mod]", "test message");
  });

  it("error delegates to console.error with module prefix", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createDefaultLogger("my-mod");
    log.error("test message");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("[my-mod]", "test message");
  });

  // -----------------------------------------------------------------------
  // Data parameter handling – with data
  // -----------------------------------------------------------------------

  it("debug includes data object when provided", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.debug("detail", { key: "val" });
    expect(spy).toHaveBeenCalledWith("[mod]", "detail", { key: "val" });
  });

  it("info includes data object when provided", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.info("hello", { key: "val" });
    expect(spy).toHaveBeenCalledWith("[mod]", "hello", { key: "val" });
  });

  it("warn includes data object when provided", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.warn("careful", { remaining: 5 });
    expect(spy).toHaveBeenCalledWith("[mod]", "careful", { remaining: 5 });
  });

  it("error includes data object when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.error("boom", { code: 500 });
    expect(spy).toHaveBeenCalledWith("[mod]", "boom", { code: 500 });
  });

  // -----------------------------------------------------------------------
  // Data parameter handling – without data
  // -----------------------------------------------------------------------

  it("debug omits data argument when not passed", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.debug("detail");
    expect(spy).toHaveBeenCalledWith("[mod]", "detail");
  });

  it("info omits data argument when data is undefined", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.info("hello", undefined);
    expect(spy).toHaveBeenCalledWith("[mod]", "hello");
  });

  it("warn omits data argument when not passed", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.warn("careful");
    expect(spy).toHaveBeenCalledWith("[mod]", "careful");
  });

  it("error omits data argument when not passed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createDefaultLogger("mod");
    log.error("boom");
    expect(spy).toHaveBeenCalledWith("[mod]", "boom");
  });

  // -----------------------------------------------------------------------
  // providedLogger passthrough
  // -----------------------------------------------------------------------

  it("returns the provided logger when one is given", () => {
    const custom: Parameters<typeof createDefaultLogger>[1] = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    const log = createDefaultLogger("mod", custom);
    expect(log).toBe(custom);
  });

  it("creates a console logger when providedLogger is undefined", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createDefaultLogger("mod", undefined);
    log.info("test");
    expect(spy).toHaveBeenCalledWith("[mod]", "test");
  });

  // -----------------------------------------------------------------------
  // Module name isolation
  // -----------------------------------------------------------------------

  it("uses the module name passed at creation time", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logA = createDefaultLogger("alpha");
    const logB = createDefaultLogger("beta");

    logA.info("from a");
    logB.info("from b");

    expect(spy).toHaveBeenCalledWith("[alpha]", "from a");
    expect(spy).toHaveBeenCalledWith("[beta]", "from b");
  });
});
