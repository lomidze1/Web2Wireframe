import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mock the License model BEFORE importing the route
// ============================================================================

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockFind = vi.fn();

vi.mock("../src/models/License.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/models/License.js")>();
  return {
    ...actual,
    License: {
      findOne: (...args: unknown[]) => mockFindOne(...args),
      findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
      find: (...args: unknown[]) => ({
        limit: (_n: number) => mockFind(...args),
      }),
    },
  };
});

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
