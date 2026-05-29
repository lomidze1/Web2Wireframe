import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// P2-#1 — Pro stacking strict block (backend)
//
// Two enforcement points:
//   1. POST /api/checkout/create  — refuses to open Flitt for an active Pro
//      user with more than `renewalWindow` time remaining.
//   2. licenseService.applyOneTimePurchase — defensive cap so the webhook
//      never grants more than `renewalWindow + durationMs` from now even
//      if a race lets one slip past #1.
// ============================================================================

const mockCreateOneTimeCheckout = vi.fn();
const mockGetOrCreate = vi.fn();
const mockVerifyCallback = vi.fn();

vi.mock("../src/services/flittService.js", () => ({
  createOneTimeCheckout: (...args: unknown[]) =>
    mockCreateOneTimeCheckout(...args),
  verifyCallback: (...args: unknown[]) => mockVerifyCallback(...args),
}));

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    getOrCreate: (...args: unknown[]) => mockGetOrCreate(...args),
  },
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    flitt: {
      merchantId: "1549901",
      secretKey: "test",
      baseUrl: "https://pay.flitt.test",
    },
    website: { baseUrl: "https://web2wireframe.test" },
  },
}));

const checkoutRoutes = (await import("../src/routes/checkout/index.js")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/checkout", checkoutRoutes);
  return app;
}

function fakeProLicense(opts: { daysRemaining: number }) {
  const now = Date.now();
  return {
    figmaUserId: "u-1",
    plan: "pro",
    status: "active",
    cycleEndsAt: new Date(now + opts.daysRemaining * 24 * 60 * 60 * 1000),
  };
}

function fakeFreeLicense() {
  const now = Date.now();
  return {
    figmaUserId: "u-1",
    plan: "free",
    status: "active",
    cycleEndsAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/checkout/create — P2-#1 stacking block", () => {
  it("returns 400 with error=already_pro when user has > 7 days monthly remaining", async () => {
    mockGetOrCreate.mockResolvedValue(fakeProLicense({ daysRemaining: 20 }));
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "monthly" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("already_pro");
    expect(res.body.remainingDays).toBeGreaterThan(7);
    expect(res.body.renewalOpensInDays).toBeGreaterThan(0);
    expect(res.body.renewalWindowDays).toBe(7);
    expect(mockCreateOneTimeCheckout).not.toHaveBeenCalled();
  });

  it("allows monthly renewal when user has ≤ 7 days remaining", async () => {
    mockGetOrCreate.mockResolvedValue(fakeProLicense({ daysRemaining: 5 }));
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/x",
      orderId: "w2w_pro_u-1_1",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "monthly" });
    expect(res.status).toBe(200);
    expect(mockCreateOneTimeCheckout).toHaveBeenCalled();
  });

  it("allows monthly renewal at exactly 7 days remaining (boundary)", async () => {
    mockGetOrCreate.mockResolvedValue(fakeProLicense({ daysRemaining: 7 }));
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/x",
      orderId: "w2w_pro_u-1_1",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "monthly" });
    expect(res.status).toBe(200);
  });

  it("yearly tier uses 10-day renewal window", async () => {
    mockGetOrCreate.mockResolvedValue(fakeProLicense({ daysRemaining: 15 }));
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "yearly" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("already_pro");
    expect(res.body.renewalWindowDays).toBe(10);
    expect(mockCreateOneTimeCheckout).not.toHaveBeenCalled();
  });

  it("yearly: allows renewal at ≤ 10 days remaining", async () => {
    mockGetOrCreate.mockResolvedValue(fakeProLicense({ daysRemaining: 8 }));
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/x",
      orderId: "w2w_pro_u-1_1",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "yearly" });
    expect(res.status).toBe(200);
  });

  it("Free users can always buy (no block applies)", async () => {
    mockGetOrCreate.mockResolvedValue(fakeFreeLicense());
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/x",
      orderId: "w2w_pro_u-1_1",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "monthly" });
    expect(res.status).toBe(200);
  });

  it("license read failure does NOT block checkout (fail-open with warn)", async () => {
    mockGetOrCreate.mockRejectedValue(new Error("mongo blip"));
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/x",
      orderId: "w2w_pro_u-1_1",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "monthly" });
    expect(res.status).toBe(200);
    expect(mockCreateOneTimeCheckout).toHaveBeenCalled();
  });
});
