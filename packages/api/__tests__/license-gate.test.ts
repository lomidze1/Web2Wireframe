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

// Build an app whose route is reached with `req.userId` already set —
// emulating the authenticatePlugin middleware that now guards every import
// route. `userId === null` simulates an unauthenticated request.
function makeApp(userId: string | null = "u-1") {
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => {
      (req as { userId?: string }).userId = userId;
      next();
    });
  }
  app.post("/test/import", requireImportAllowance("url"), (req, res) => {
    res.json({ success: true, remaining: req.importRemaining });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Identity
// ============================================================================

describe("requireImportAllowance — identity", () => {
  it("returns 401 when no authenticated user is present", async () => {
    const res = await request(makeApp(null)).post("/test/import").send({});
    expect(res.status).toBe(401);
  });

  it("uses the verified req.userId, ignoring any body figmaUserId", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 7 });
    const res = await request(makeApp("verified-user"))
      .post("/test/import")
      .send({ figmaUserId: "attacker-supplied" });
    expect(res.status).toBe(200);
    expect(mockUseImport).toHaveBeenCalledWith("verified-user");
  });
});

// ============================================================================
// Gate behavior
// ============================================================================

describe("requireImportAllowance — gate behavior", () => {
  it("returns 403 limit_exceeded when service refuses", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });
    const res = await request(makeApp()).post("/test/import").send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("limit_exceeded");
    expect(res.body.upgradeUrl).toBeDefined();
  });

  it("passes through with importRemaining set on req when ok", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 4 });
    const res = await request(makeApp()).post("/test/import").send({});
    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(4);
  });

  it("sets importRemaining = null when remaining is Infinity (Pro plan)", async () => {
    mockUseImport.mockResolvedValue({
      ok: true,
      remaining: Number.POSITIVE_INFINITY,
    });
    const res = await request(makeApp()).post("/test/import").send({});
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
    const res = await request(makeApp()).post("/test/import").send({});
    expect(res.status).toBe(200);
  });

  it("fail-CLOSED in prod when service throws (returns 503)", async () => {
    process.env.NODE_ENV = "production";
    mockUseImport.mockRejectedValue(new Error("DB unreachable"));
    const res = await request(makeApp()).post("/test/import").send({});
    expect(res.status).toBe(503);
    process.env.NODE_ENV = "development";
  });
});
