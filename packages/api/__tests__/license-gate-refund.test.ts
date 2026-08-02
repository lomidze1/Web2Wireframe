import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mock licenseService BEFORE importing the middleware
// ============================================================================

const mockUseImport = vi.fn();
const mockRefundImport = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    useImport: (...args: unknown[]) => mockUseImport(...args),
    refundImport: (...args: unknown[]) => mockRefundImport(...args),
  },
}));

// Telemetry is exercised by quota-block-logging.test.ts — silence it here.
vi.mock("../src/models/ImportEvent.js", () => ({
  logImportEvent: vi.fn().mockResolvedValue(undefined),
}));

const { requireImportAllowance } = await import(
  "../src/middleware/licenseGate.js"
);

/**
 * The gate refunds from a `res.on("finish")` hook, which the server emits
 * before the client sees the last byte — but yielding once removes any doubt
 * about ordering when supertest resolves.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Route that answers with whatever status the test needs. `undelivered`
 * emulates a handler that returns 200 but knows the user got nothing usable
 * (bot-protection block page).
 */
function makeApp(
  status: number,
  userId: string | null = "u-1",
  undelivered = false,
) {
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => {
      (req as { userId?: string }).userId = userId;
      next();
    });
  }
  app.post("/test/import", requireImportAllowance("url"), (req, res) => {
    if (undelivered) req.importUndelivered = true;
    res.status(status).json({ success: status < 400 });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRefundImport.mockResolvedValue(undefined);
  process.env.NODE_ENV = "development";
});

// ============================================================================
// The slot is consumed before the handler runs, so every failure response has
// to give it back — otherwise a Free user pays for imports never delivered.
// ============================================================================

describe("requireImportAllowance — compensating refund", () => {
  it("does NOT refund a delivered import (200)", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    await request(makeApp(200)).post("/test/import").send({});
    await flush();
    expect(mockRefundImport).not.toHaveBeenCalled();
  });

  it("refunds when the handler fails (500)", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    await request(makeApp(500)).post("/test/import").send({});
    await flush();
    expect(mockRefundImport).toHaveBeenCalledTimes(1);
    expect(mockRefundImport).toHaveBeenCalledWith("u-1");
  });

  it("refunds when the handler rejects the request (400)", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    await request(makeApp(400)).post("/test/import").send({});
    await flush();
    expect(mockRefundImport).toHaveBeenCalledTimes(1);
    expect(mockRefundImport).toHaveBeenCalledWith("u-1");
  });

  it("refunds a 200 the handler marked undelivered (bot-protection block page)", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    await request(makeApp(200, "u-1", true)).post("/test/import").send({});
    await flush();
    expect(mockRefundImport).toHaveBeenCalledTimes(1);
    expect(mockRefundImport).toHaveBeenCalledWith("u-1");
  });

  it("refunds only once when a marked import also fails (500)", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    await request(makeApp(500, "u-1", true)).post("/test/import").send({});
    await flush();
    expect(mockRefundImport).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Nothing was consumed in these paths — refunding would hand out free quota.
// ============================================================================

describe("requireImportAllowance — refund is skipped when nothing was consumed", () => {
  it("does not refund the 403 limit_exceeded response", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });
    const res = await request(makeApp(200)).post("/test/import").send({});
    await flush();
    expect(res.status).toBe(403);
    expect(mockRefundImport).not.toHaveBeenCalled();
  });

  it("does not refund the 401 unauthenticated response", async () => {
    const res = await request(makeApp(200, null)).post("/test/import").send({});
    await flush();
    expect(res.status).toBe(401);
    expect(mockUseImport).not.toHaveBeenCalled();
    expect(mockRefundImport).not.toHaveBeenCalled();
  });

  it("does not refund after the dev fail-open path (useImport threw)", async () => {
    mockUseImport.mockRejectedValue(new Error("DB unreachable"));
    const res = await request(makeApp(500)).post("/test/import").send({});
    await flush();
    expect(res.status).toBe(500);
    expect(mockRefundImport).not.toHaveBeenCalled();
  });
});

// ============================================================================
// A refund is bookkeeping — it must never turn into a second failure.
// ============================================================================

describe("requireImportAllowance — refund failure handling", () => {
  it("still delivers the response when refundImport rejects", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    mockRefundImport.mockRejectedValue(new Error("DB unreachable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await request(makeApp(500)).post("/test/import").send({});
    await flush();

    expect(res.status).toBe(500);
    expect(mockRefundImport).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
