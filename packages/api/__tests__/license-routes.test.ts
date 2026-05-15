import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { CYCLE_DURATION_MS } from "../src/models/License.js";

// ============================================================================
// Mock licenseService BEFORE importing the route module
// ============================================================================

const mockGetOrCreate = vi.fn();
const mockUseImport = vi.fn();

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    getOrCreate: (...args: unknown[]) => mockGetOrCreate(...args),
    useImport: (...args: unknown[]) => mockUseImport(...args),
  },
}));

// Pretend Mongo is connected so requireMongo guard passes.
vi.mock("../src/state.js", () => ({
  mongoConnected: true,
  setMongoConnected: vi.fn(),
  pendingCDPImports: new Map(),
}));

const { default: licenseRouter } = await import(
  "../src/routes/license/index.js"
);

// ============================================================================
// Test app
// ============================================================================

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/license", licenseRouter);
  return app;
}

function fakeLicense(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-05-04T10:00:00Z");
  const cycleEnd = new Date(now.getTime() + CYCLE_DURATION_MS);
  return {
    figmaUserId: "u-1",
    email: null,
    plan: "free" as const,
    status: "active" as const,
    cycleStartedAt: now,
    cycleEndsAt: cycleEnd,
    usage: { imports: 0, periodStartedAt: now },
    subscription: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// GET /api/license/me
// ============================================================================

describe("GET /api/license/me", () => {
  it("returns 400 when figmaUserId query is missing", async () => {
    const res = await request(makeApp()).get("/api/license/me");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/figmaUserId/i);
  });

  it("returns serialized Free license with limits.imports = 10", async () => {
    mockGetOrCreate.mockResolvedValue(fakeLicense());
    const res = await request(makeApp()).get(
      "/api/license/me?figmaUserId=u-1",
    );
    expect(res.status).toBe(200);
    expect(res.body.figmaUserId).toBe("u-1");
    expect(res.body.plan).toBe("free");
    expect(res.body.status).toBe("active");
    expect(res.body.limits.imports).toBe(10);
    expect(res.body.subscription).toBe(null);
    expect(res.body.cycleStartedAt).toBe("2026-05-04T10:00:00.000Z");
  });

  it("serializes Pro plan limit as null (unlimited)", async () => {
    mockGetOrCreate.mockResolvedValue(
      fakeLicense({
        plan: "pro",
        subscription: {
          flittOrderId: "w2w_pro_u_1",
          activatedAt: new Date("2026-05-04T10:00:00Z"),
          nextBillingAt: new Date("2026-06-03T10:00:00Z"),
          canceledAt: null,
          lastChargeAt: null,
          lastFailedAt: null,
          failureCount: 0,
        },
      }),
    );
    const res = await request(makeApp()).get(
      "/api/license/me?figmaUserId=u-1",
    );
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe("pro");
    expect(res.body.limits.imports).toBe(null);
    expect(res.body.subscription.flittOrderId).toBe("w2w_pro_u_1");
  });

  it("exposes failureCount and lastFailedAt on subscription", async () => {
    const failedAt = new Date("2026-05-03T11:00:00Z");
    mockGetOrCreate.mockResolvedValue(
      fakeLicense({
        plan: "pro",
        subscription: {
          flittOrderId: "w2w_pro_u_2",
          activatedAt: new Date("2026-04-04T10:00:00Z"),
          nextBillingAt: new Date("2026-05-04T10:00:00Z"),
          canceledAt: null,
          lastChargeAt: new Date("2026-04-04T10:00:00Z"),
          lastFailedAt: failedAt,
          failureCount: 3,
        },
      }),
    );
    const res = await request(makeApp()).get(
      "/api/license/me?figmaUserId=u-1",
    );
    expect(res.status).toBe(200);
    expect(res.body.subscription.failureCount).toBe(3);
    expect(res.body.subscription.lastFailedAt).toBe(failedAt.toISOString());
  });

  it("defaults failureCount to 0 and lastFailedAt to null on fresh sub", async () => {
    mockGetOrCreate.mockResolvedValue(
      fakeLicense({
        plan: "pro",
        subscription: {
          flittOrderId: "w2w_pro_u_3",
          activatedAt: new Date("2026-05-04T10:00:00Z"),
          nextBillingAt: new Date("2026-06-03T10:00:00Z"),
          canceledAt: null,
          lastChargeAt: null,
          lastFailedAt: null,
          failureCount: 0,
        },
      }),
    );
    const res = await request(makeApp()).get(
      "/api/license/me?figmaUserId=u-1",
    );
    expect(res.status).toBe(200);
    expect(res.body.subscription.failureCount).toBe(0);
    expect(res.body.subscription.lastFailedAt).toBe(null);
  });

  it("returns 500 when service throws", async () => {
    mockGetOrCreate.mockRejectedValue(new Error("db down"));
    const res = await request(makeApp()).get(
      "/api/license/me?figmaUserId=u-1",
    );
    expect(res.status).toBe(500);
  });
});

// ============================================================================
// POST /api/license/use-import
// ============================================================================

describe("POST /api/license/use-import", () => {
  it("returns 400 when figmaUserId is missing", async () => {
    const res = await request(makeApp())
      .post("/api/license/use-import")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 200 with remaining count for Free under limit", async () => {
    mockUseImport.mockResolvedValue({ ok: true, remaining: 6 });
    const res = await request(makeApp())
      .post("/api/license/use-import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, remaining: 6 });
  });

  it("returns 200 with remaining: null for Pro (unlimited)", async () => {
    mockUseImport.mockResolvedValue({
      ok: true,
      remaining: Number.POSITIVE_INFINITY,
    });
    const res = await request(makeApp())
      .post("/api/license/use-import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(null);
  });

  it("returns 403 limit_exceeded when service refuses", async () => {
    mockUseImport.mockResolvedValue({ error: "limit_exceeded" });
    const res = await request(makeApp())
      .post("/api/license/use-import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("limit_exceeded");
    expect(res.body.upgradeUrl).toBeDefined();
  });

  it("returns 500 when service throws", async () => {
    mockUseImport.mockRejectedValue(new Error("db down"));
    const res = await request(makeApp())
      .post("/api/license/use-import")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(500);
  });
});
