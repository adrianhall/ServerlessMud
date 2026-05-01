import { describe, it, expect, vi, beforeEach } from "vitest";
import { structuredFormatter, prettyFormatter } from "@lib/cloudflare-logging";

describe("structuredFormatter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls console.debug for debug level", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    structuredFormatter("debug", "test-mod", "hello");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("hello", { module: "test-mod" });
  });

  it("calls console.info for info level", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    structuredFormatter("info", "test-mod", "hello");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("hello", { module: "test-mod" });
  });

  it("calls console.warn for warn level", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    structuredFormatter("warn", "test-mod", "careful");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("careful", { module: "test-mod" });
  });

  it("calls console.error for error level", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    structuredFormatter("error", "test-mod", "boom");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("boom", { module: "test-mod" });
  });

  it("merges additional data into the payload", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    structuredFormatter("info", "auth", "verified", { email: "a@b.com", path: "/api" });
    expect(spy).toHaveBeenCalledWith("verified", {
      module: "auth",
      email: "a@b.com",
      path: "/api"
    });
  });

  it("handles undefined data", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    structuredFormatter("info", "mod", "msg", undefined);
    expect(spy).toHaveBeenCalledWith("msg", { module: "mod" });
  });
});

describe("prettyFormatter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls console.debug for debug level", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    prettyFormatter("debug", "test-mod", "detail");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("calls console.info for info level", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    prettyFormatter("info", "test-mod", "hello");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("calls console.warn for warn level", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    prettyFormatter("warn", "test-mod", "careful");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("calls console.error for error level", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    prettyFormatter("error", "test-mod", "boom");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("includes the module name in the prefix", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    prettyFormatter("info", "my-mod", "hello");
    const prefix = spy.mock.calls[0][0] as string;
    expect(prefix).toContain("[my-mod]");
  });

  it("includes the level tag in the prefix", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    prettyFormatter("warn", "mod", "msg");
    const prefix = spy.mock.calls[0][0] as string;
    expect(prefix).toContain("WARN");
  });

  it("includes an ISO timestamp in the prefix", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    prettyFormatter("info", "mod", "msg");
    const prefix = spy.mock.calls[0][0] as string;
    // ISO 8601 pattern: YYYY-MM-DDTHH:MM:SS
    expect(prefix).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("passes the message as the second argument", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    prettyFormatter("info", "mod", "my message");
    expect(spy.mock.calls[0][1]).toBe("my message");
  });

  it("passes data as the third argument when provided", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    prettyFormatter("info", "mod", "msg", { key: "val" });
    expect(spy).toHaveBeenCalledWith(expect.any(String), "msg", { key: "val" });
  });

  it("omits data argument when data is empty", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    prettyFormatter("info", "mod", "msg", {});
    expect(spy).toHaveBeenCalledWith(expect.any(String), "msg");
  });

  it("omits data argument when data is undefined", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    prettyFormatter("info", "mod", "msg", undefined);
    expect(spy).toHaveBeenCalledWith(expect.any(String), "msg");
  });
});
