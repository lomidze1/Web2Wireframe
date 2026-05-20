import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createWebhookLogger,
  sanitizeContext,
} from "../src/services/webhookLogger.js";

describe("sanitizeContext", () => {
  it("strips `signature` from context", () => {
    const out = sanitizeContext({
      order_id: "x",
      signature: "abc123",
    });
    expect(out).toEqual({ order_id: "x" });
  });

  it("strips `response_signature_string` (Flitt's debug echo)", () => {
    const out = sanitizeContext({
      order_id: "x",
      response_signature_string: "secret|stuff|here",
    });
    expect(out).toEqual({ order_id: "x" });
  });

  it("strips `secret_key` / `secretKey` aliases (paranoid)", () => {
    const out = sanitizeContext({
      order_id: "x",
      secret_key: "no",
      secretKey: "no",
    });
    expect(out).toEqual({ order_id: "x" });
  });

  it("returns undefined when given undefined", () => {
    expect(sanitizeContext(undefined)).toBeUndefined();
  });

  it("returns empty object when context only had sensitive keys", () => {
    expect(sanitizeContext({ signature: "x" })).toEqual({});
  });
});

describe("createWebhookLogger", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stderrSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("assigns a stable requestId per logger instance", () => {
    const a = createWebhookLogger();
    const b = createWebhookLogger();
    expect(a.requestId).toMatch(/^[0-9a-f]{12}$/);
    expect(b.requestId).toMatch(/^[0-9a-f]{12}$/);
    expect(a.requestId).not.toBe(b.requestId);
  });

  it("emits JSON line with ts, level, component, requestId, msg, context", () => {
    const log = createWebhookLogger();
    log.info("hello", { order_id: "abc" });
    expect(stdoutSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      level: "info",
      component: "flitt-webhook",
      requestId: log.requestId,
      msg: "hello",
      order_id: "abc",
    });
    expect(typeof line.ts).toBe("string");
    expect(new Date(line.ts).toString()).not.toBe("Invalid Date");
  });

  it("warn() goes to stderr stream", () => {
    const log = createWebhookLogger();
    log.warn("warning");
    expect(stderrSpy).toHaveBeenCalledOnce();
  });

  it("strips sensitive fields from log context", () => {
    const log = createWebhookLogger();
    log.info("event", { order_id: "x", signature: "leak" });
    const line = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(line.order_id).toBe("x");
    expect(line.signature).toBeUndefined();
  });

  it("same requestId across multiple calls on the same logger", () => {
    const log = createWebhookLogger();
    log.info("first");
    log.info("second");
    const a = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    const b = JSON.parse(stdoutSpy.mock.calls[1][0] as string);
    expect(a.requestId).toBe(b.requestId);
  });
});
