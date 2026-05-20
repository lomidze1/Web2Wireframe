import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mock config + state BEFORE importing the route module
// ============================================================================

const mockConfig = {
  flitt: {
    merchantId: "1549901",
    secretKey: "test-secret",
    baseUrl: "https://pay.flitt.test",
  },
  features: { flittEnabled: true },
};

const mockState = { mongoConnected: true };

const mockCountDocuments = vi.fn();
const mockFindOne = vi.fn();

vi.mock("../src/config/env.js", () => ({
  config: mockConfig,
}));

vi.mock("../src/state.js", () => ({
  get mongoConnected() {
    return mockState.mongoConnected;
  },
  setMongoConnected: vi.fn(),
  pendingCDPImports: new Map(),
}));

vi.mock("../src/models/WebhookEvent.js", () => ({
  WebhookEvent: {
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

const { default: healthRouter } = await import(
  "../src/routes/plugin/defaults.js"
);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", healthRouter);
  return app;
}

beforeEach(() => {
  delete process.env.ADMIN_TOKEN;
  mockConfig.flitt.merchantId = "1549901";
  mockConfig.flitt.secretKey = "test-secret";
  mockConfig.flitt.baseUrl = "https://pay.flitt.test";
  mockConfig.features.flittEnabled = true;
  mockState.mongoConnected = true;
  mockCountDocuments.mockReset();
  mockFindOne.mockReset();
});

describe("GET /api/health/flitt", () => {
  it("returns 401 when ADMIN_TOKEN is set and header is missing", async () => {
    process.env.ADMIN_TOKEN = "secret-admin-token";
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.status).toBe(401);
  });

  it("returns 401 when ADMIN_TOKEN is set and header value is wrong", async () => {
    process.env.ADMIN_TOKEN = "secret-admin-token";
    const res = await request(makeApp())
      .get("/api/health/flitt")
      .set("X-Admin-Token", "wrong");
    expect(res.status).toBe(401);
  });

  it("returns 200 when ADMIN_TOKEN matches header", async () => {
    process.env.ADMIN_TOKEN = "secret-admin-token";
    const res = await request(makeApp())
      .get("/api/health/flitt")
      .set("X-Admin-Token", "secret-admin-token");
    expect(res.status).toBe(200);
  });

  it("returns 200 in dev (ADMIN_TOKEN unset) without header", async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.status).toBe(200);
  });

  it("reports flittEnabled + merchantIdSet + secretKeySet booleans", async () => {
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.flittEnabled).toBe(true);
    expect(res.body.merchantIdSet).toBe(true);
    expect(res.body.secretKeySet).toBe(true);
  });

  it("reports baseUrl (safe to expose — public Flitt URL)", async () => {
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.baseUrl).toBe("https://pay.flitt.test");
  });

  it("reports webhookCallbackUrl built from API_PUBLIC_URL or default", async () => {
    process.env.API_PUBLIC_URL = "https://api.example.test";
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.webhookCallbackUrl).toBe(
      "https://api.example.test/api/webhooks/flitt",
    );
    delete process.env.API_PUBLIC_URL;
  });

  it("reports mongoConnected (webhook persistence dependency)", async () => {
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.mongoConnected).toBe(true);
  });

  it("NEVER returns the actual merchantId or secretKey value", async () => {
    const res = await request(makeApp()).get("/api/health/flitt");
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("1549901");
    expect(json).not.toContain("test-secret");
  });

  it("reports secretKeySet=false when secretKey is empty", async () => {
    mockConfig.flitt.secretKey = "";
    mockConfig.features.flittEnabled = false;
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.secretKeySet).toBe(false);
    expect(res.body.flittEnabled).toBe(false);
  });

  it("reports 24h webhook counts + last processed timestamp", async () => {
    const lastTs = new Date("2026-05-20T12:00:00Z");
    mockCountDocuments
      .mockResolvedValueOnce(5) // approved
      .mockResolvedValueOnce(2) // declined+expired
      .mockResolvedValueOnce(1); // reversed
    mockFindOne.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ processedAt: lastTs }),
    });

    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.recent24h).toEqual({
      approved: 5,
      failed: 2,
      reversed: 1,
    });
    expect(res.body.lastWebhookProcessedAt).toBe(lastTs.toISOString());
  });

  it("reports null webhook counts when MongoDB is disconnected", async () => {
    mockState.mongoConnected = false;
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.recent24h).toBeNull();
    expect(res.body.lastWebhookProcessedAt).toBeNull();
    expect(mockCountDocuments).not.toHaveBeenCalled();
  });

  it("returns null counts when WebhookEvent query throws (defensive)", async () => {
    mockCountDocuments.mockRejectedValue(new Error("db blip"));
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.recent24h).toBeNull();
    expect(res.body.lastWebhookProcessedAt).toBeNull();
    // Endpoint must still return 200 — operator visibility matters more than
    // strict correctness here.
    expect(res.status).toBe(200);
  });

  it("reports lastWebhookProcessedAt=null when collection is empty", async () => {
    mockCountDocuments
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockFindOne.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await request(makeApp()).get("/api/health/flitt");
    expect(res.body.lastWebhookProcessedAt).toBeNull();
    expect(res.body.recent24h).toEqual({
      approved: 0,
      failed: 0,
      reversed: 0,
    });
  });
});
