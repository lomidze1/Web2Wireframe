/**
 * Tests for the dev-only log bridge (devLogger.ts + logger.ts).
 *
 * The bridge forwards plugin console/logger output to a local receiver so it
 * can be read during development. It must be a strict no-op in production
 * (gated by DEV_LOGGER_ENABLED = !USE_PRODUCTION). Here USE_PRODUCTION is
 * false in source, so DEV_LOGGER_ENABLED is true and the dev path is active.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  installDevLogger,
  __resetDevLoggerForTests,
  DEVLOG_ENDPOINT,
  DEVLOG_MESSAGE_TYPE,
} from "../utils/devLogger";

describe("devLogger", () => {
  afterEach(() => {
    __resetDevLoggerForTests();
    delete (globalThis as { figma?: unknown }).figma;
    delete (globalThis as { fetch?: unknown }).fetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("UI context: forwards console.log to the receiver via batched fetch and preserves the original", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    const originalLog = vi.fn();
    console.log = originalLog; // captured as "original" by the installer

    installDevLogger();

    console.log("hello", 42);

    // original console still called
    expect(originalLog).toHaveBeenCalledWith("hello", 42);

    // batched — nothing sent yet until flush window elapses
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(DEVLOG_ENDPOINT);
    const body = JSON.parse(opts.body as string);
    expect(body[0]).toMatchObject({ level: "log", msg: "hello 42", ctx: "ui" });
  });

  it("sandbox context: forwards console.warn via figma.ui.postMessage", () => {
    const postMessage = vi.fn();
    (globalThis as { figma?: unknown }).figma = { ui: { postMessage } };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    installDevLogger();

    console.warn("oops");

    expect(postMessage).toHaveBeenCalledWith({
      type: DEVLOG_MESSAGE_TYPE,
      data: { level: "warn", msg: "oops", ctx: "main" },
    });
  });

  it("UI context: relays __W2W_DEVLOG messages from the sandbox into the fetch batch", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    installDevLogger();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          pluginMessage: {
            type: DEVLOG_MESSAGE_TYPE,
            data: { level: "error", msg: "from main", ctx: "main" },
          },
        },
      }),
    );

    vi.advanceTimersByTime(300);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body[0]).toMatchObject({ level: "error", msg: "from main", ctx: "main" });
  });

  it("UI context: swallows fetch failure when the receiver is offline", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    installDevLogger();

    console.log("x");
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("logger dev forwarding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("logger.warn forwards to console.warn when DEV_LOGGER_ENABLED is true", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logger } = await import("../utils/logger");

    logger.warn("hi there", { a: 1 });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0][0] as string;
    expect(line).toContain("hi there");
    expect(line).toContain("WARN");
  });
});
