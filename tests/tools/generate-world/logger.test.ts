import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../../src/tools/generate-world/logger.js";

describe("createLogger", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs error messages to stderr", () => {
    const log = createLogger({ verbose: false });
    log.error("something failed");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toContain("something failed");
  });

  it("logs warning messages", () => {
    const log = createLogger({ verbose: false });
    log.warn("something suspicious");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("something suspicious");
  });

  it("logs info messages", () => {
    const log = createLogger({ verbose: false });
    log.info("processing zone 30");
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0][0]).toContain("processing zone 30");
  });

  it("logs success messages", () => {
    const log = createLogger({ verbose: false });
    log.success("all done");
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0][0]).toContain("all done");
  });

  it("suppresses debug messages when verbose is false", () => {
    const log = createLogger({ verbose: false });
    log.debug("raw data");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("shows debug messages when verbose is true", () => {
    const log = createLogger({ verbose: true });
    log.debug("raw data");
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0][0]).toContain("raw data");
  });

  it("creates zone-scoped child loggers with prefix", () => {
    const log = createLogger({ verbose: false });
    const zoneLog = log.forZone("30");

    zoneLog.info("parsing rooms");
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0][0]).toContain("[zone 30]");
    expect(logSpy.mock.calls[0][0]).toContain("parsing rooms");
  });

  it("zone child logger inherits verbose setting", () => {
    const log = createLogger({ verbose: true });
    const zoneLog = log.forZone("42");

    zoneLog.debug("detailed info");
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0][0]).toContain("[zone 42]");
    expect(logSpy.mock.calls[0][0]).toContain("detailed info");
  });

  it("zone child logger suppresses debug when not verbose", () => {
    const log = createLogger({ verbose: false });
    const zoneLog = log.forZone("42");

    zoneLog.debug("detailed info");
    expect(logSpy).not.toHaveBeenCalled();
  });
});
