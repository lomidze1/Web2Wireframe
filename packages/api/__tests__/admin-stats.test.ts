import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockLicenseCount = vi.fn();
const mockLicenseFind = vi.fn();
const mockWebhookCount = vi.fn();
const mockWebhookAggregate = vi.fn();
const mockAuditCount = vi.fn();
const mockImportEventFind = vi.fn();
const mockImportEventDistinct = vi.fn();

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
  WebhookEvent: {
    countDocuments: (...args: unknown[]) => mockWebhookCount(...args),
    aggregate: (...args: unknown[]) => mockWebhookAggregate(...args),
  },
}));

vi.mock("../src/models/LicenseAudit.js", () => ({
  LicenseAudit: { countDocuments: (...args: unknown[]) => mockAuditCount(...args) },
}));

vi.mock("../src/models/ImportEvent.js", () => ({
  ImportEvent: {
    find: (...args: unknown[]) => mockImportEventFind(...args),
    distinct: (...args: unknown[]) => mockImportEventDistinct(...args),
  },
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
  mockWebhookAggregate.mockReset();
  // Default: no revenue rows → every amount sum resolves to 0. Tests that
  // assert revenue override this via primeCounts' *Cents fields.
  mockWebhookAggregate.mockResolvedValue([]);
  mockAuditCount.mockReset();
  mockImportEventFind.mockReset();
  mockImportEventDistinct.mockReset();
  // Default: the roster query (License.find(...).sort(...).lean()) resolves to
  // an empty list. Tests that care about the users table override this.
  primeUserList([]);
  // Default: the recent-imports feed resolves empty too.
  primeRecentImports([]);
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
 * Primes the recent-imports feed — ImportEvent.find(projection).sort().limit().lean()
 * — with the supplied rows. Mirrors the chainable Mongoose call in stats.ts.
 */
function primeRecentImports(rows: unknown[]): void {
  mockImportEventFind.mockReturnValue({
    sort: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }),
  });
}

/**
 * Helper — primes all the aggregate queries with the supplied values.
 * Order matters; mirrors the Promise.all in stats.ts.
 *
 * License counts (6):  totalUsers, pro, free, canceled, new7d, new30d
 * ImportEvent.distinct (1): active30d — distinct importers in last 30d
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
  // Summed real charge cents (from WebhookEvent.amountCents). Distinct from the
  // *count* fields above: gross revenue is a sum of dollars, not charges×$16.
  grossCents30d?: number;
  refundedCents30d?: number;
  grossCents7d?: number;
} = {}): void {
  mockLicenseCount
    .mockResolvedValueOnce(opts.totalUsers ?? 0)
    .mockResolvedValueOnce(opts.pro ?? 0)
    .mockResolvedValueOnce(opts.free ?? 0)
    .mockResolvedValueOnce(opts.canceled ?? 0)
    .mockResolvedValueOnce(opts.new7d ?? 0)
    .mockResolvedValueOnce(opts.new30d ?? 0);
  // active30d comes from ImportEvent.distinct — an array of user ids whose
  // length is the metric.
  mockImportEventDistinct.mockResolvedValueOnce(
    Array.from({ length: opts.active30d ?? 0 }, (_, i) => `user-${i}`),
  );
  mockWebhookCount
    .mockResolvedValueOnce(opts.approved30d ?? 0)
    .mockResolvedValueOnce(opts.approved7d ?? 0)
    .mockResolvedValueOnce(opts.declined7d ?? 0)
    .mockResolvedValueOnce(opts.reversed30d ?? 0);
  // Aggregate order mirrors the Promise.all in stats.ts: approved-30d,
  // reversed-30d, approved-7d. Each resolves to the [{ cents }] shape.
  mockWebhookAggregate
    .mockResolvedValueOnce([{ cents: opts.grossCents30d ?? 0 }])
    .mockResolvedValueOnce([{ cents: opts.refundedCents30d ?? 0 }])
    .mockResolvedValueOnce([{ cents: opts.grossCents7d ?? 0 }]);
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

  it("computes net revenue = gross - refunded from summed charge amounts", async () => {
    primeCounts({
      grossCents30d: 16000, // real summed approved cents
      refundedCents30d: 3200, // real summed reversed cents
    });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.revenue.gross30dCents).toBe(16000);
    expect(res.body.revenue.refunded30dCents).toBe(3200);
    expect(res.body.revenue.net30dCents).toBe(12800);
  });

  it("counts a yearly charge at its real price, not as monthly ($16)", async () => {
    // The whole point of the fix: one yearly + one monthly charge is
    // $144 + $16 = $160 gross — the old count×$16 math booked it as $32.
    primeCounts({
      approved30d: 2, // two charges (count, for the label)
      grossCents30d: 16000, // 14400 + 1600 summed real cents
    });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.revenue.gross30dCents).toBe(16000);
    expect(res.body.revenue.approved30d).toBe(2);
  });

  it("exposes gross7dCents so the 'Last 7 days' card sums real amounts", async () => {
    primeCounts({ approved7d: 1, grossCents7d: 14400 });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.revenue.gross7dCents).toBe(14400);
  });

  it("computes active30d as distinct users with an ImportEvent in the window", async () => {
    // Regression: this used to count `usage.periodStartedAt >= last30d`, which
    // only moves on billing-cycle resets — a user importing daily but whose
    // cycle started 40 days ago read as "inactive". Real signal = ImportEvent.
    primeCounts({ active30d: 3 });
    const res = await request(makeApp()).get("/api/admin/stats");
    expect(res.body.users.active30d).toBe(3);
    expect(mockImportEventDistinct).toHaveBeenCalledWith(
      "figmaUserId",
      expect.objectContaining({
        createdAt: expect.objectContaining({ $gte: expect.any(Date) }),
      }),
    );
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

describe("GET /api/admin/stats — recent imports", () => {
  it("returns recentImports with email joined from the roster", async () => {
    primeCounts({ totalUsers: 1 });
    primeUserList([
      {
        figmaUserId: "u-1",
        email: "a@example.com",
        plan: "free",
        status: "active",
        usage: { imports: 1 },
        createdAt: new Date("2026-06-01T00:00:00Z"),
      },
    ]);
    primeRecentImports([
      {
        figmaUserId: "u-1",
        sourceUrl: "https://acme.test/pricing",
        title: "Acme",
        type: "extension",
        viewports: [1440],
        success: true,
        createdAt: new Date("2026-06-20T00:00:00Z"),
      },
      {
        figmaUserId: "u-unknown",
        sourceUrl: "https://broken.test",
        type: "url",
        viewports: [1440],
        success: false,
        errorCode: "TIMEOUT",
        createdAt: new Date("2026-06-19T00:00:00Z"),
      },
    ]);

    const res = await request(makeApp()).get("/api/admin/stats");

    expect(res.body.recentImports).toHaveLength(2);
    expect(res.body.recentImports[0]).toMatchObject({
      figmaUserId: "u-1",
      email: "a@example.com",
      sourceUrl: "https://acme.test/pricing",
      type: "extension",
      success: true,
    });
    // Unknown user (no roster row) → email null, failure fields preserved.
    expect(res.body.recentImports[1]).toMatchObject({
      figmaUserId: "u-unknown",
      email: null,
      success: false,
      errorCode: "TIMEOUT",
    });
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
