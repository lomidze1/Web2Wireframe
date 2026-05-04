import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mock licenseService BEFORE importing the middleware
// ============================================================================

const mockUseImport = vi.fn();

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    useImport: (...args: unknown[]) => mockUseImport(...args),
  },
}));

const { requireImportAllowance } = await import(
  "../src/middleware/licenseGate.js"
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post("/test/import", requireImportAllowance, (req, res) => {
    res.json({ success: true, remaining: req.importRemaining });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Validation
// ============================================================================

describe("requireImportAllowance — input validation", () => {
  it("returns 400 when figmaUserId is missing from body and query", async () => {
    const res = await request(makeApp()).post("/test/import").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/figmaUserId/i);
  });

  it("accepts figmaUserId from body", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 7 });
    const res = await request(makeApp())
      .post("/test/import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    expect(mockUseImport).toHaveBeenCalledWith("u-1");
  });

  it("accepts figmaUserId from query string", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 7 });
    const res = await request(makeApp())
      .post("/test/import?figmaUserId=u-q")
      .send({});
    expect(res.status).toBe(200);
    expect(mockUseImport).toHaveBeenCalledWith("u-q");
  });
});

// ============================================================================
// Gate behavior
// ============================================================================

describe("requireImportAllowance — gate behavior", () => {
  it("returns 403 limit_exceeded when service refuses", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });
    const res = await request(makeApp())
      .post("/test/import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("limit_exceeded");
    expect(res.body.upgradeUrl).toBeDefined();
  });

  it("passes through with importRemaining set on req when ok", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    const res = await request(makeApp())
      .post("/test/import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(4);
  });

  it("sets importRemaining = null when remaining is Infinity (Pro plan)", async () => {
    mockUseImport.mockResolvedValue({
      ok: true,
      remaining: Number.POSITIVE_INFINITY,
    });
    const res = await request(makeApp())
      .post("/test/import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(null);
  });
});

// ============================================================================
// Failure modes
// ============================================================================

describe("requireImportAllowance — failure handling", () => {
  it("fail-OPEN in dev when service throws (so local devs can test offline)", async () => {
    process.env.NODE_ENV = "development";
    mockUseImport.mockRejectedValue(new Error("DB unreachable"));
    const res = await request(makeApp())
      .post("/test/import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
  });

  it("fail-CLOSED in prod when service throws (returns 503)", async () => {
    process.env.NODE_ENV = "production";
    mockUseImport.mockRejectedValue(new Error("DB unreachable"));
    const res = await request(makeApp())
      .post("/test/import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(503);
    process.env.NODE_ENV = "development";
  });
});
