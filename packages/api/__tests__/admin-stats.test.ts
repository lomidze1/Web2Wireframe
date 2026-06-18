import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockLicenseCount = vi.fn();
const mockLicenseFind = vi.fn();
const mockWebhookCount = vi.fn();
const mockAuditCount = vi.fn();

vi.mock("../src/models/License.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/models/License.js")>();
  return {
    ...actual,
    License: {
      countDocuments: (...args: unknown[]) => mockLicenseCount(...args),
      find: (...args: unknown[]) => mockLicenseFind(...args),
    },
  };
});

vi.mock("../src/models/WebhookEvent.js", () => ({
  WebhookEvent: { countDocuments: (...args: unknown[]) => mockWebhookCount(...args) },
}));

vi.mock("../src/models/LicenseAudit.js", () => ({
  LicenseAudit: { countDocuments: (...args: unknown[]) => mockAuditCount(...args) },
}));

const { default: statsRouter } = await import(
  "../src/routes/admin/stats.js"
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin/stats", statsRouter);
  return app;
}

const ADMIN_TOKEN = "test-admin-token-32-bytes-or-more!";

beforeEach(() => {
  delete process.env.ADMIN_TOKEN;
  mockLicenseCount.mockReset();
  mockLicenseFind.mockReset();
  mockWebhookCount.mockReset();
  mockAuditCount.mockReset();
  // Default: the roster query (License.find(...).sort(...).lean()) resolves to
  // an empty list. Tests that care about the users table override this.
  primeUserList([]);
});

/**
 * Primes the roster query — License.find(projection).sort().lean() — with the
 * supplied rows. Mirrors the chainable Mongoose call in stats.ts.
 */
function primeUserList(rows: unknown[]): void {
  mockLicenseFind.mockReturnValue({
    sort: () => ({ lean: () => Promise.resolve(rows) }),
  });
}

/**
 * Helper — primes all 13 countDocuments calls with the supplied values.
 * Order matters; mirrors the Promise.all in stats.ts.
 *
 * License counts (7):  totalUsers, pro, free, canceled, new7d, new30d, active30d
 * WebhookEvent counts (4): approved30d, approved7d, declined7d, reversed30d
 * LicenseAudit counts (2): proActivations30d, refunds30d
 */
function primeCounts(opts: {
  totalUsers?: number;
  pro?: number;
  free?: number;
  canceled?: number;
  new7d?: number;
  new30d?: number;
  active30d?: number;
  approved30d?: number;
  approved7d?: number;
  declined7d?: number;
  reversed30d?: number;
  proActivations30d?: number;
  refunds30d?: number;
} = {}): void {
  mockLicenseCount
    .mockResolvedValueOnce(opts.totalUsers ?? 0)
    .mockResolvedValueOnce(opts.pro ?? 0)
    .mockResolvedValueOnce(opts.free ?? 0)
    .mockResolvedValueOnce(opts.canceled ?? 0)
    .mockResolvedValueOnce(opts.new7d ?? 0)
    .mockResolvedValueOnce(opts.new30d ?? 0)
    .mockResolvedValueOnce(opts.active30d ?? 0);
  mockWebhookCount
    .mockResolvedValueOnce(opts.approved30d ?? 0)
    .mockResolvedValueOnce(opts.approved7d ?? 0)
    .mockResolvedValueOnce(opts.declined7d ?? 0)
    .mockResolvedValueOnce(opts.reversed30d ?? 0);
  mockAuditCount
    .mockResolvedValueOnce(opts.proActivations30d ?? 0)
    .mockResolvedValueOnce(opts.refunds30d ?? 0);
}

describe("GET /api/admin/stats — auth", () => {
  it("returns 401 when ADMIN_TOKEN is set and credential is missing", async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    primeCounts();
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("accepts Authorization: Bearer", async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    primeCounts();
    const res = await request(makeApp())
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
  });

  it("accepts X-Admin-Token", async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    primeCounts();
    const res = await request(makeApp())
      .get("/api/admin/stats")
      .set("X-Admin-Token", ADMIN_TOKEN);
    expect(res.status).toBe(200);
  });

  it("open in dev (no ADMIN_TOKEN)", async () => {
    delete process.env.ADMIN_TOKEN;
    primeCounts();
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/stats — response shape", () => {
  it("returns the 4 top-level sections", async () => {
    primeCounts({ totalUsers: 5, pro: 1, free: 4 });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body).toHaveProperty("users");
    expect(res.body).toHaveProperty("revenue");
    expect(res.body).toHaveProperty("payments");
    expect(res.body).toHaveProperty("conversion");
    expect(res.body).toHaveProperty("generatedAt");
  });

  it("computes net revenue = gross - refunded (30 days)", async () => {
    primeCounts({
      approved30d: 10, // 10 × $16 = $160 gross
      reversed30d: 2, // 2 × $16 = $32 refunded
    });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.revenue.gross30dCents).toBe(16000);
    expect(res.body.revenue.refunded30dCents).toBe(3200);
    expect(res.body.revenue.net30dCents).toBe(12800);
  });

  it("computes conversion rate as proActivations30d / new30d (rounded 2dp)", async () => {
    primeCounts({
      new30d: 100,
      proActivations30d: 7, // 7%
    });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.conversion.rate30dPercent).toBe(7);
  });

  it("returns 0% conversion when there are no new users (avoid divide-by-zero)", async () => {
    primeCounts({ new30d: 0, proActivations30d: 0 });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.conversion.rate30dPercent).toBe(0);
  });

  it("currency is USD (matches PLAN_PRICES)", async () => {
    primeCounts();
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.revenue.currency).toBe("USD");
  });

  it("returns 500 when an aggregation throws", async () => {
    mockLicenseCount.mockRejectedValue(new Error("mongo down"));
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.status).toBe(500);
  });

  it("returns users.list projecting only id/email/plan/status/imports/joined", async () => {
    primeCounts({ totalUsers: 2 });
    primeUserList([
      {
        figmaUserId: "u-1",
        email: "a@example.com",
        plan: "pro",
        status: "active",
        usage: { imports: 42 },
        createdAt: new Date("2026-06-01T00:00:00Z"),
      },
      {
        figmaUserId: "u-2",
        email: null,
        plan: "free",
        status: "active",
        usage: { imports: 0 },
        createdAt: new Date("2026-06-10T00:00:00Z"),
      },
    ]);
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.users.list).toHaveLength(2);
    expect(res.body.users.list[0]).toEqual({
      figmaUserId: "u-1",
      email: "a@example.com",
      plan: "pro",
      status: "active",
      imports: 42,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    // null email is preserved (rendered as "—" client-side)
    expect(res.body.users.list[1].email).toBeNull();
    expect(res.body.users.list[1].imports).toBe(0);
  });
});

describe("GET /api/admin/stats/.html — dashboard", () => {
  it("returns the HTML dashboard at /.html", async () => {
    const res = await request(makeApp()).get("/api/admin/stats/.html");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Web2Wireframe — admin stats");
    expect(res.text).toContain("/api/admin/stats");
    // Token-from-URL-fragment pattern (#token=...) — must not leak to
    // server-side access logs.
    expect(res.text).toContain("location.hash.match");
  });

  it("HTML dashboard is open (no admin gate on the HTML shell)", async () => {
    // The HTML itself contains no secrets — it's a fetch shell. Auth
    // happens client-side when it calls the JSON endpoint. Serving the
    // shell publicly is intentional and keeps the URL bookmarkable.
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    const res = await request(makeApp()).get("/api/admin/stats/.html");
    expect(res.status).toBe(200);
  });
});
