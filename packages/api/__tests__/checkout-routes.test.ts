import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { CYCLE_DURATION_MS } from "../src/models/License.js";

// ============================================================================
// Mocks BEFORE importing the route module
// ============================================================================

const mockCreateSubscriptionCheckout = vi.fn();
const mockCancelSubscription = vi.fn();
const mockVerifyCallback = vi.fn();
const mockGetOrCreate = vi.fn();
const mockApplyCancel = vi.fn();

vi.mock("../src/services/flittService.js", () => ({
  createSubscriptionCheckout: (...args: unknown[]) =>
    mockCreateSubscriptionCheckout(...args),
  cancelSubscription: (...args: unknown[]) => mockCancelSubscription(...args),
  verifyCallback: (...args: unknown[]) => mockVerifyCallback(...args),
}));

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    getOrCreate: (...args: unknown[]) => mockGetOrCreate(...args),
    applySubscriptionCancel: (...args: unknown[]) => mockApplyCancel(...args),
  },
}));

vi.mock("../src/config/env.js", () => ({
  config: {
    flitt: {
      merchantId: "1549901",
      secretKey: "test",
      baseUrl: "https://pay.flitt.test",
    },
    website: {
      baseUrl: "https://web2wireframe.test",
    },
  },
}));

const checkoutModule = await import("../src/routes/checkout/index.js");
const checkoutRoutes = checkoutModule.default;
const cancelRouter = checkoutModule.cancelRouter;

// We need the real signToken to verify the cancel flow auth.
const { signToken } = await import("../src/middleware/auth.js");

// ============================================================================
// Test app
// ============================================================================

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/checkout", checkoutRoutes);
  app.use("/api/subscription", cancelRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = "test-secret-32bytes-for-hmac-signing";
});

// ============================================================================
// POST /api/checkout/create
// ============================================================================

describe("POST /api/checkout/create", () => {
  it("returns 400 when figmaUserId is missing", async () => {
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 200 with checkoutUrl when Flitt accepts the order", async () => {
    mockCreateSubscriptionCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/checkout/abc",
      orderId: "w2w_pro_u_1",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      checkoutUrl: "https://pay.flitt.test/checkout/abc",
      orderId: "w2w_pro_u_1",
    });
  });

  it("returns 502 when Flitt rejects", async () => {
    mockCreateSubscriptionCheckout.mockResolvedValue({
      ok: false,
      error: "Flitt down",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Flitt down");
  });
});

// ============================================================================
// POST /api/subscription/cancel
// ============================================================================

describe("POST /api/subscription/cancel", () => {
  function fakeProLicense(figmaUserId = "u-1") {
    const now = new Date("2026-05-04T10:00:00Z");
    return {
      figmaUserId,
      plan: "pro",
      status: "active",
      cycleEndsAt: new Date(now.getTime() + CYCLE_DURATION_MS),
      subscription: {
        flittOrderId: "w2w_pro_u_1",
        canceledAt: null,
      },
    };
  }

  it("returns 400 when fields are missing", async () => {
    const res = await request(makeApp())
      .post("/api/subscription/cancel")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(400);
  });

  it("returns 401 when token is invalid", async () => {
    const res = await request(makeApp())
      .post("/api/subscription/cancel")
      .send({ figmaUserId: "u-1", token: "bad.token" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is signed for a different user", async () => {
    const token = signToken("other-user", process.env.AUTH_SECRET!, 300);
    const res = await request(makeApp())
      .post("/api/subscription/cancel")
      .send({ figmaUserId: "u-1", token });
    expect(res.status).toBe(401);
  });

  it("returns 404 when user has no Pro subscription", async () => {
    mockGetOrCreate.mockResolvedValue({
      figmaUserId: "u-1",
      plan: "free",
      subscription: null,
    });
    const token = signToken("u-1", process.env.AUTH_SECRET!, 300);
    const res = await request(makeApp())
      .post("/api/subscription/cancel")
      .send({ figmaUserId: "u-1", token });
    expect(res.status).toBe(404);
  });

  it("returns 502 when Flitt rejects the cancel", async () => {
    mockGetOrCreate.mockResolvedValue(fakeProLicense());
    mockCancelSubscription.mockResolvedValue({
      ok: false,
      error: "no such order",
    });
    const token = signToken("u-1", process.env.AUTH_SECRET!, 300);
    const res = await request(makeApp())
      .post("/api/subscription/cancel")
      .send({ figmaUserId: "u-1", token });
    expect(res.status).toBe(502);
  });

  it("succeeds: calls Flitt + applies cancel + returns accessUntil", async () => {
    const license = fakeProLicense();
    mockGetOrCreate.mockResolvedValue(license);
    mockCancelSubscription.mockResolvedValue({ ok: true });
    mockApplyCancel.mockResolvedValue({
      ...license,
      cycleEndsAt: license.cycleEndsAt,
    });
    const token = signToken("u-1", process.env.AUTH_SECRET!, 300);

    const res = await request(makeApp())
      .post("/api/subscription/cancel")
      .send({ figmaUserId: "u-1", token });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.accessUntil).toBe(license.cycleEndsAt.toISOString());
    expect(mockCancelSubscription).toHaveBeenCalledWith("w2w_pro_u_1");
    expect(mockApplyCancel).toHaveBeenCalledWith({ figmaUserId: "u-1" });
  });
});
