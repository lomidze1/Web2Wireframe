import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mock the License model BEFORE importing the route
// ============================================================================

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockFind = vi.fn();
const mockRecentFind = vi.fn();

vi.mock("../src/models/License.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/models/License.js")>();
  return {
    ...actual,
    License: {
      findOne: (...args: unknown[]) => mockFindOne(...args),
      findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
      // Dual-shape: lookup-by-email uses .limit(n); /recent uses
      // .sort(...).limit(n). The mock returns a fluent chain that resolves
      // to whichever mock was primed.
      find: (...args: unknown[]) => ({
        limit: (_n: number) => mockFind(...args),
        sort: (_sort: unknown) => ({
          limit: (_n: number) => mockRecentFind(...args),
        }),
      }),
    },
  };
});

const mockAuditCreate = vi.fn();
const mockAuditFind = vi.fn();
vi.mock("../src/models/LicenseAudit.js", () => ({
  LicenseAudit: {
    create: (...args: unknown[]) => mockAuditCreate(...args),
    find: (...args: unknown[]) => ({
      sort: (_s: unknown) => ({
        limit: (_n: number) => mockAuditFind(...args),
      }),
    }),
  },
}));

const { default: adminLicenseRoutes } = await import(
  "../src/routes/admin/license.js"
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin/license", adminLicenseRoutes);
  return app;
}

const ADMIN_TOKEN = "test-admin-token-32-bytes-or-more";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
});

function fakeLicense(figmaUserId = "u-1", overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-05-04T10:00:00Z");
  return {
    figmaUserId,
    email: null,
    plan: "free" as const,
    status: "active" as const,
    cycleStartedAt: now,
    cycleEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    usage: { imports: 0, periodStartedAt: now },
    subscription: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ============================================================================
// Auth
// ============================================================================

describe("Admin auth", () => {
  it("returns 401 without Authorization header", async () => {
    const res = await request(makeApp()).get("/api/admin/license/u-1");
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong token", async () => {
    const res = await request(makeApp())
      .get("/api/admin/license/u-1")
      .set("Authorization", "Bearer wrong");
    expect(res.status).toBe(401);
  });

  it("returns 503 when ADMIN_TOKEN env is unset", async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await request(makeApp())
      .get("/api/admin/license/u-1")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(503);
  });
});

// ============================================================================
// GET /api/admin/license/:figmaUserId
// ============================================================================

describe("GET /api/admin/license/:figmaUserId", () => {
  it("returns the license when found", async () => {
    mockFindOne.mockResolvedValue(fakeLicense("u-1"));
    const res = await request(makeApp())
      .get("/api/admin/license/u-1")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.figmaUserId).toBe("u-1");
  });

  it("returns 404 when license is missing", async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await request(makeApp())
      .get("/api/admin/license/u-missing")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// GET /api/admin/license/lookup-by-email
// ============================================================================

describe("GET /api/admin/license/lookup-by-email", () => {
  it("returns 400 when email is missing", async () => {
    const res = await request(makeApp())
      .get("/api/admin/license/lookup-by-email")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(400);
  });

  it("returns array of matching licenses", async () => {
    mockFind.mockResolvedValue([
      fakeLicense("u-1", { email: "user@example.com" }),
    ]);
    const res = await request(makeApp())
      .get("/api/admin/license/lookup-by-email?email=user@example.com")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.licenses[0].figmaUserId).toBe("u-1");
  });
});

// ============================================================================
// GET /api/admin/license/recent
// ============================================================================

describe("GET /api/admin/license/recent", () => {
  it("returns 401 without admin token", async () => {
    const res = await request(makeApp()).get("/api/admin/license/recent");
    expect(res.status).toBe(401);
  });

  it("returns recent licenses sorted by updatedAt desc (default limit=20)", async () => {
    mockRecentFind.mockResolvedValue([
      fakeLicense("u-1"),
      fakeLicense("u-2"),
    ]);
    const res = await request(makeApp())
      .get("/api/admin/license/recent")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.licenses[0].figmaUserId).toBe("u-1");
  });

  it("accepts limit query param (capped at 100)", async () => {
    mockRecentFind.mockResolvedValue([]);
    await request(makeApp())
      .get("/api/admin/license/recent?limit=5")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(mockRecentFind).toHaveBeenCalledWith({});
  });

  it("accepts plan filter", async () => {
    mockRecentFind.mockResolvedValue([]);
    await request(makeApp())
      .get("/api/admin/license/recent?plan=pro")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(mockRecentFind).toHaveBeenCalledWith({ plan: "pro" });
  });

  it("rejects invalid plan filter", async () => {
    const res = await request(makeApp())
      .get("/api/admin/license/recent?plan=enterprise")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /api/admin/license/override
// ============================================================================

describe("POST /api/admin/license/override", () => {
  it("returns 400 without figmaUserId", async () => {
    const res = await request(makeApp())
      .post("/api/admin/license/override")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ plan: "pro" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-string figmaUserId (NoSQL operator injection)", async () => {
    const res = await request(makeApp())
      .post("/api/admin/license/override")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ figmaUserId: { $ne: null }, plan: "pro" });
    expect(res.status).toBe(400);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects invalid plan", async () => {
    const res = await request(makeApp())
      .post("/api/admin/license/override")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ figmaUserId: "u-1", plan: "plus" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid status", async () => {
    const res = await request(makeApp())
      .post("/api/admin/license/override")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ figmaUserId: "u-1", status: "trial" });
    expect(res.status).toBe(400);
  });

  it("upserts and applies the requested fields", async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      fakeLicense("u-1", { plan: "pro", status: "active" }),
    );
    const res = await request(makeApp())
      .post("/api/admin/license/override")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({
        figmaUserId: "u-1",
        plan: "pro",
        status: "active",
        email: "user@example.com",
      });
    expect(res.status).toBe(200);
    const [filter, update, options] = mockFindOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ figmaUserId: "u-1" });
    expect(update.$set.plan).toBe("pro");
    expect(update.$set.status).toBe("active");
    expect(update.$set.email).toBe("user@example.com");
    expect(options).toMatchObject({ new: true, upsert: true });
  });
});

// ============================================================================
// GET /api/admin/license/:figmaUserId/audit
// ============================================================================

describe("GET /api/admin/license/:figmaUserId/audit", () => {
  it("returns 401 without admin token", async () => {
    const res = await request(makeApp()).get("/api/admin/license/u-1/audit");
    expect(res.status).toBe(401);
  });

  it("returns audit entries for a user", async () => {
    mockAuditFind.mockResolvedValue([
      {
        action: "subscription_activation",
        changes: {},
        context: { flittOrderId: "w2w_pro_u-1_123" },
        at: new Date("2026-05-04T10:00:00Z"),
      },
      {
        action: "refund",
        changes: { plan: ["pro", "free"] },
        context: { flittOrderId: "w2w_pro_u-1_123", revoked: true },
        at: new Date("2026-05-10T10:00:00Z"),
      },
    ]);
    const res = await request(makeApp())
      .get("/api/admin/license/u-1/audit")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.entries[0].action).toBe("subscription_activation");
    expect(res.body.entries[1].action).toBe("refund");
    expect(res.body.entries[0].at).toBe("2026-05-04T10:00:00.000Z");
  });

  it("respects ?limit= query param", async () => {
    mockAuditFind.mockResolvedValue([]);
    await request(makeApp())
      .get("/api/admin/license/u-1/audit?limit=10")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(mockAuditFind).toHaveBeenCalledWith({ figmaUserId: "u-1" });
  });

  it("override endpoint writes an audit row with reason", async () => {
    mockFindOneAndUpdate.mockResolvedValue(
      fakeLicense("u-1", { plan: "pro", status: "active" }),
    );
    mockAuditCreate.mockResolvedValue({});
    await request(makeApp())
      .post("/api/admin/license/override")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({
        figmaUserId: "u-1",
        plan: "pro",
        reason: "manual goodwill for stuck webhook",
      });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        figmaUserId: "u-1",
        action: "admin_override",
        context: expect.objectContaining({
          reason: "manual goodwill for stuck webhook",
        }),
      }),
    );
  });
});
