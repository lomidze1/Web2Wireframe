import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { signToken } from "../src/middleware/auth.js";

// ============================================================================
// The plugin's one-click "Report this to the developer".
//
// The report is an email to the owner's support inbox with Reply-To set to
// the user's Figma email — no database. What these tests pin: identity comes
// from the verified token (never the body), the email comes from the License
// the OAuth callback already filled, bad input never reaches the inbox, and a
// failed send is reported as a failure (a "Thanks!" for a lost report would
// be a lie).
// ============================================================================

const mockSendReport = vi.fn();
const mockSendFollowUp = vi.fn();
const mockFindOne = vi.fn();

vi.mock("../src/services/emailService.js", () => ({
  sendImportReportEmail: (...a: unknown[]) => mockSendReport(...a),
  sendImportReportFollowUp: (...a: unknown[]) => mockSendFollowUp(...a),
}));

vi.mock("../src/models/License.js", () => ({
  License: { findOne: (...a: unknown[]) => mockFindOne(...a) },
}));

vi.mock("../src/state.js", () => ({
  mongoConnected: true,
  setMongoConnected: vi.fn(),
  pendingCDPImports: new Map(),
  // authenticatePlugin reads this Map; without it every request 401s.
  revokedTokens: new Map(),
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    server: { nodeEnv: "test" },
    rateLimit: { windowMs: 60_000, maxRequests: 100 },
    email: {
      resendApiKey: "re_test",
      noreplyEmail: "noreply@test",
      supportToEmail: "support@test",
    },
  },
}));

const { default: importReportRouter } = await import(
  "../src/routes/plugin/importReport.js"
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", importReportRouter);
  return app;
}

const AUTH_SECRET = "test-auth-secret-for-import-report-tests";

function authHeader(userId: string): string {
  return `Bearer ${signToken(userId, AUTH_SECRET)}`;
}

// The limiter is per user and module-level, so every test gets its own user.
let userCounter = 0;
const newUser = () => `u-${++userCounter}`;

function report(overrides: Record<string, unknown> = {}) {
  return {
    sourceUrl: "https://stripe.com/",
    kind: "url",
    viewports: [1440],
    issues: [
      {
        category: "image",
        message: "Image couldn't be loaded — replaced with a placeholder",
        count: 7,
      },
    ],
    overflow: 0,
    ...overrides,
  };
}

/** License.findOne(...).lean() resolving to the given doc. */
const licenseDoc = (doc: Record<string, unknown> | null) => ({
  lean: () => Promise.resolve(doc),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = AUTH_SECRET;
  mockSendReport.mockResolvedValue({ ok: true });
  mockSendFollowUp.mockResolvedValue({ ok: true });
  mockFindOne.mockReturnValue(licenseDoc({ email: "user@figma.test" }));
});

// ============================================================================
// POST /api/import-report
// ============================================================================

describe("POST /api/import-report", () => {
  it("rejects a request without a token", async () => {
    const res = await request(makeApp()).post("/api/import-report").send(report());
    expect(res.status).toBe(401);
    expect(mockSendReport).not.toHaveBeenCalled();
  });

  it.each([
    ["an HTML-paste import", { kind: "html" }],
    ["a screenshot import", { kind: "screenshot" }],
    ["a javascript: URL", { sourceUrl: "javascript:alert(1)" }],
    ["a pseudo URL", { sourceUrl: "html-import" }],
    ["an empty issue list", { issues: [] }],
    ["an unknown category", { issues: [{ category: "bogus", message: "m", count: 1 }] }],
    ["an over-long message", { issues: [{ category: "other", message: "x".repeat(301), count: 1 }] }],
    ["a non-positive count", { issues: [{ category: "other", message: "m", count: 0 }] }],
  ])("rejects %s with 400", async (_label, overrides) => {
    const res = await request(makeApp())
      .post("/api/import-report")
      .set("Authorization", authHeader(newUser()))
      .send(report(overrides));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockSendReport).not.toHaveBeenCalled();
  });

  it("logs why a report was rejected — field paths and rule codes, never the values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await request(makeApp())
      .post("/api/import-report")
      .set("Authorization", authHeader(newUser()))
      .send(report({ kind: "html", viewports: [1439.5], sourceUrl: "https://secret.example/?token=abc123" }));

    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("[ImportReport]");
    expect(logged).toMatch(/kind/);
    expect(logged).toMatch(/viewports\.0/);
    expect(logged).not.toMatch(/secret\.example|token=abc123|html|1439/);
    warn.mockRestore();
  });

  it("emails the report with the caller's License email and returns a report id", async () => {
    const user = newUser();
    const res = await request(makeApp())
      .post("/api/import-report")
      .set("Authorization", authHeader(user))
      .send(report({ kind: "extension", viewports: [1440, 375] }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reportId).toMatch(/^REPORT-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(mockSendReport).toHaveBeenCalledTimes(1);
    expect(mockSendReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: res.body.reportId,
        figmaUserId: user,
        email: "user@figma.test",
        sourceUrl: "https://stripe.com/",
        kind: "extension",
        viewports: [1440, 375],
        overflow: 0,
        issues: [
          {
            category: "image",
            message: "Image couldn't be loaded — replaced with a placeholder",
            count: 7,
          },
        ],
      }),
    );
  });

  it("takes identity from the token, never from the body", async () => {
    const user = newUser();
    await request(makeApp())
      .post("/api/import-report")
      .set("Authorization", authHeader(user))
      .send({ ...report(), figmaUserId: "someone-else" });

    expect(mockFindOne).toHaveBeenCalledWith({ figmaUserId: user }, { email: 1 });
    expect(mockSendReport).toHaveBeenCalledWith(
      expect.objectContaining({ figmaUserId: user }),
    );
  });

  it.each([
    ["no License", null],
    ["a License with no email", { email: null }],
    ["a legacy empty-string email", { email: "" }],
  ])("still sends the report for %s — just without a reply address", async (_label, doc) => {
    mockFindOne.mockReturnValue(licenseDoc(doc));
    const res = await request(makeApp())
      .post("/api/import-report")
      .set("Authorization", authHeader(newUser()))
      .send(report());

    expect(res.status).toBe(200);
    expect(mockSendReport).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it("reports failure when the email could not be sent", async () => {
    mockSendReport.mockResolvedValue({ ok: false, error: "resend down" });
    const res = await request(makeApp())
      .post("/api/import-report")
      .set("Authorization", authHeader(newUser()))
      .send(report());

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it("limits one user to 20 reports an hour", async () => {
    const app = makeApp();
    const user = newUser();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await request(app)
        .post("/api/import-report")
        .set("Authorization", authHeader(user))
        .send(report());
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(mockSendReport).toHaveBeenCalledTimes(20);
  });
});

// ============================================================================
// POST /api/import-report/:reportId/message
// ============================================================================

describe("POST /api/import-report/:reportId/message", () => {
  const ID = "REPORT-MF0ABC12-X7Y8Z9";

  it("rejects a request without a token", async () => {
    const res = await request(makeApp())
      .post(`/api/import-report/${ID}/message`)
      .send({ message: "Logo is missing" });
    expect(res.status).toBe(401);
    expect(mockSendFollowUp).not.toHaveBeenCalled();
  });

  it("emails the follow-up note with the caller's reply address", async () => {
    const user = newUser();
    const res = await request(makeApp())
      .post(`/api/import-report/${ID}/message`)
      .set("Authorization", authHeader(user))
      .send({ message: "  Logo is missing  " });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendFollowUp).toHaveBeenCalledWith({
      reportId: ID,
      figmaUserId: user,
      email: "user@figma.test",
      message: "Logo is missing",
    });
  });

  it.each([
    ["an empty note", { message: "   " }],
    ["an over-long note", { message: "x".repeat(2001) }],
    ["a missing note", {}],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await request(makeApp())
      .post(`/api/import-report/${ID}/message`)
      .set("Authorization", authHeader(newUser()))
      .send(body);
    expect(res.status).toBe(400);
    expect(mockSendFollowUp).not.toHaveBeenCalled();
  });

  it("rejects a report id that isn't one we issue", async () => {
    const res = await request(makeApp())
      .post("/api/import-report/not-a-report/message")
      .set("Authorization", authHeader(newUser()))
      .send({ message: "hi" });
    expect(res.status).toBe(400);
    expect(mockSendFollowUp).not.toHaveBeenCalled();
  });

  it("reports failure when the note could not be sent", async () => {
    mockSendFollowUp.mockResolvedValue({ ok: false, error: "resend down" });
    const res = await request(makeApp())
      .post(`/api/import-report/${ID}/message`)
      .set("Authorization", authHeader(newUser()))
      .send({ message: "Logo is missing" });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
});
