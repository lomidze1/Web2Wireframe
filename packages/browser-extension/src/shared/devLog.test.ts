import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * devLog is gated by the compile-time `__W2W_DEV_LOG__` define. Vitest has no
 * define, so the default import is the Web Store (disabled) build; the enabled
 * build is simulated by stubbing the global before a fresh module import.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe("serializeDevLogArgs", () => {
  it("drops %c directives and their style arguments", async () => {
    const { serializeDevLogArgs } = await import("./devLog");
    expect(serializeDevLogArgs(["%c[W2W] done", "color: red", 42])).toBe("[W2W] done 42");
  });

  it("keeps an Error's message instead of the empty JSON object", async () => {
    const { serializeDevLogArgs } = await import("./devLog");
    expect(serializeDevLogArgs(["failed:", new Error("boom")])).toBe("failed: Error: boom");
  });
});

describe("installSwDevLog — Web Store build (define absent)", () => {
  it("leaves console untouched and never fetches", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const warn = console.warn;
    const { installSwDevLog, DEV_LOG_ENABLED } = await import("./devLog");
    installSwDevLog();
    expect(DEV_LOG_ENABLED).toBe(false);
    expect(console.warn).toBe(warn);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("installSwDevLog — dev-log build", () => {
  it("mirrors console lines to the receiver with ctx 'sw'", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("__W2W_DEV_LOG__", true);
    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);
    const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    const { installSwDevLog, devWarn } = await import("./devLog");
    try {
      installSwDevLog();
      devWarn("[W2W-MISS] assets:", 3);
      await vi.advanceTimersByTimeAsync(300);
    } finally {
      Object.assign(console, original);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3999/log");
    expect(JSON.parse(init.body)).toEqual([
      { level: "warn", msg: "[W2W-MISS] assets: 3", ctx: "sw" },
    ]);
  });
});
