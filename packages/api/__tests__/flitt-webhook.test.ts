import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mocks BEFORE importing the route module
// ============================================================================

const mockVerifyCallback = vi.fn();
const mockApplyActivation = vi.fn();
const mockApplyRecurring = vi.fn();
const mockApplyFailedCharge = vi.fn();
const mockApplyOneTime = vi.fn();
const mockApplyRefund = vi.fn();
const mockWebhookEventCreate = vi.fn();
const mockSendRefundEmail = vi.fn();

vi.mock("../src/services/flittService.js", () => ({
  createOneTimeCheckout: vi.fn(),
  cancelSubscription: vi.fn(),
  verifyCallback: (...args: unknown[]) => mockVerifyCallback(...args),
}));

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    getOrCreate: vi.fn(),
    applySubscriptionActivation: (...args: unknown[]) =>
      mockApplyActivation(...args),
    applyRecurringCharge: (...args: unknown[]) =>
      mockApplyRecurring(...args),
    applyFailedCharge: (...args: unknown[]) =>
      mockApplyFailedCharge(...args),
    applyOneTimePurchase: (...args: unknown[]) =>
      mockApplyOneTime(...args),
    applyRefund: (...args: unknown[]) => mockApplyRefund(...args),
    applySubscriptionCancel: vi.fn(),
  },
}));

const mockSendPaymentFailed = vi.fn();
const mockSendReceipt = vi.fn();

vi.mock("../src/services/emailService.js", () => ({
  sendRefundNotification: (...args: unknown[]) => mockSendRefundEmail(...args),
  sendPaymentFailedNotification: (...args: unknown[]) =>
    mockSendPaymentFailed(...args),
  sendReceiptEmail: (...args: unknown[]) => mockSendReceipt(...args),
}));

vi.mock("../src/models/WebhookEvent.js", () => ({
  WebhookEvent: {
    create: (...args: unknown[]) => mockWebhookEventCreate(...args),
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

const { webhookRouter } = await import("../src/routes/checkout/index.js");

function makeApp() {
  const app = express();
  // Match production: webhook router gets a tiny body-size limit to defend
  // against DoS via huge payloads. Real Flitt webhooks are ~1-2 KB.
  app.use("/api/webhooks", express.json({ limit: "16kb" }));
  app.use(express.json());
  app.use("/api/webhooks", webhookRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWebhookEventCreate.mockResolvedValue({});
});

// ============================================================================
// Helpers
// ============================================================================

function approvedPayload(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "w2w_pro_u-1_123",
    order_status: "approved",
    amount: 1600,
    currency: "USD",
    payment_id: "pay_abc",
    sender_email: "user@example.com",
    merchant_data: JSON.stringify({ figmaUserId: "u-1", plan: "pro" }),
    signature: "sig",
    ...overrides,
  };
}

// ============================================================================
// Signature verification
// ============================================================================

describe("POST /api/webhooks/flitt — signature", () => {
  it("returns 200 + does NOT touch DB when signature is invalid", async () => {
    mockVerifyCallback.mockReturnValue(false);
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload());
    expect(res.status).toBe(200);
    expect(mockApplyActivation).not.toHaveBeenCalled();
    expect(mockWebhookEventCreate).not.toHaveBeenCalled();
  });

  it("returns 200 even with empty body (must not 4xx Flitt)", async () => {
    const res = await request(makeApp()).post("/api/webhooks/flitt").send({});
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// Idempotency
// ============================================================================

describe("POST /api/webhooks/flitt — idempotency", () => {
  it("dedupes a duplicate webhook (same payment_id) without invoking the service", async () => {
    mockVerifyCallback.mockReturnValue(true);
    // Simulate Mongo duplicate-key error on second insert.
    mockWebhookEventCreate.mockRejectedValueOnce(
      Object.assign(new Error("dup key"), { code: 11000 }),
    );
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload());
    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
    expect(mockApplyActivation).not.toHaveBeenCalled();
  });

  it("uses payment_id as the dedup key when present", async () => {
    mockVerifyCallback.mockReturnValue(true);
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ payment_id: "pay_xyz" }));
    expect(mockWebhookEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "pay_xyz" }),
    );
  });

  it("falls back to order_id+order_status when payment_id is absent", async () => {
    mockVerifyCallback.mockReturnValue(true);
    const payload = approvedPayload();
    delete (payload as Record<string, unknown>).payment_id;
    await request(makeApp()).post("/api/webhooks/flitt").send(payload);
    expect(mockWebhookEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "w2w_pro_u-1_123_approved" }),
    );
  });
});

// ============================================================================
// merchant_data parsing
// ============================================================================

describe("POST /api/webhooks/flitt — merchant_data", () => {
  it("returns 200 without service call when figmaUserId is missing", async () => {
    mockVerifyCallback.mockReturnValue(true);
    const payload = approvedPayload({
      merchant_data: JSON.stringify({ plan: "pro" }), // no figmaUserId
    });
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(payload);
    expect(res.status).toBe(200);
    expect(mockApplyActivation).not.toHaveBeenCalled();
  });

  it("tolerates malformed merchant_data without crashing", async () => {
    mockVerifyCallback.mockReturnValue(true);
    const payload = approvedPayload({ merchant_data: "{not json" });
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(payload);
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// order_status branching
// ============================================================================

describe("POST /api/webhooks/flitt — order_status branching", () => {
  beforeEach(() => {
    mockVerifyCallback.mockReturnValue(true);
  });

  it("approved without parent_order_id → applySubscriptionActivation", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload());
    expect(mockApplyActivation).toHaveBeenCalledWith({
      figmaUserId: "u-1",
      email: "user@example.com",
      flittOrderId: "w2w_pro_u-1_123",
    });
    expect(mockApplyRecurring).not.toHaveBeenCalled();
  });

  it("approved with parent_order_id → applyRecurringCharge", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(
        approvedPayload({ parent_order_id: "w2w_pro_u_1_orig", payment_id: "pay_renew" }),
      );
    expect(mockApplyRecurring).toHaveBeenCalledWith({ figmaUserId: "u-1" });
    expect(mockApplyActivation).not.toHaveBeenCalled();
  });

  it("declined → applyFailedCharge", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ order_status: "declined", payment_id: "pay_decl" }));
    expect(mockApplyFailedCharge).toHaveBeenCalledWith({ figmaUserId: "u-1" });
  });

  it("expired → applyFailedCharge", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ order_status: "expired", payment_id: "pay_exp" }));
    expect(mockApplyFailedCharge).toHaveBeenCalledWith({ figmaUserId: "u-1" });
  });

  it("declined + sender_email present → sends payment-failed email", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(
        approvedPayload({
          order_status: "declined",
          payment_id: "pay_decl_email",
          sender_email: "user@example.com",
        }),
      );
    expect(mockSendPaymentFailed).toHaveBeenCalledWith({
      email: "user@example.com",
      figmaUserId: "u-1",
    });
  });

  it("declined + sender_email missing → no email send", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(
        approvedPayload({
          order_status: "declined",
          payment_id: "pay_decl_noemail",
          sender_email: undefined,
        }),
      );
    expect(mockSendPaymentFailed).not.toHaveBeenCalled();
  });

  it("expired + sender_email present → sends payment-failed email", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(
        approvedPayload({
          order_status: "expired",
          payment_id: "pay_exp_email",
          sender_email: "user@example.com",
        }),
      );
    expect(mockSendPaymentFailed).toHaveBeenCalledOnce();
  });

  it("reversed → applyRefund (revoke Pro access)", async () => {
    mockApplyRefund.mockResolvedValue({ revoked: true, license: null });
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ order_status: "reversed", payment_id: "pay_rev" }));
    expect(mockApplyRefund).toHaveBeenCalledWith({
      figmaUserId: "u-1",
      flittOrderId: "w2w_pro_u-1_123",
    });
    expect(mockApplyActivation).not.toHaveBeenCalled();
    expect(mockApplyRecurring).not.toHaveBeenCalled();
    expect(mockApplyFailedCharge).not.toHaveBeenCalled();
  });

  it("reversed + revoked=true + email present → sends refund email", async () => {
    mockApplyRefund.mockResolvedValue({
      revoked: true,
      license: { email: "user@example.com" },
    });
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ order_status: "reversed", payment_id: "pay_rev2" }));
    expect(mockSendRefundEmail).toHaveBeenCalledWith({
      email: "user@example.com",
    });
  });

  it("reversed + revoked=false (stale order) → no email", async () => {
    // User has already renewed past this order; the refund is for an older
    // charge. We don't revoke their current Pro, and we don't email.
    mockApplyRefund.mockResolvedValue({
      revoked: false,
      license: { email: "user@example.com" },
    });
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ order_status: "reversed", payment_id: "pay_rev3" }));
    expect(mockSendRefundEmail).not.toHaveBeenCalled();
  });

  it("reversed + revoked=true + no email → no email send (still revokes)", async () => {
    mockApplyRefund.mockResolvedValue({
      revoked: true,
      license: { email: null },
    });
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ order_status: "reversed", payment_id: "pay_rev4" }));
    expect(mockApplyRefund).toHaveBeenCalled();
    expect(mockSendRefundEmail).not.toHaveBeenCalled();
  });
});

// ============================================================================
// One-time purchase branching (merchant_data.recurring === false)
// ============================================================================

describe("POST /api/webhooks/flitt — one-time purchase", () => {
  beforeEach(() => {
    mockVerifyCallback.mockReturnValue(true);
    // applyOneTimePurchase returns the updated license (used by receipt email)
    mockApplyOneTime.mockResolvedValue({
      cycleEndsAt: new Date("2026-06-19T00:00:00Z"),
    });
    mockApplyActivation.mockResolvedValue({
      cycleEndsAt: new Date("2026-06-19T00:00:00Z"),
    });
  });

  function oneTimePayload(overrides: Record<string, unknown> = {}) {
    return approvedPayload({
      merchant_data: JSON.stringify({
        figmaUserId: "u-1",
        plan: "pro",
        recurring: false,
      }),
      ...overrides,
    });
  }

  it("recurring:false approved → applyOneTimePurchase (not subscription activation)", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload());
    expect(mockApplyOneTime).toHaveBeenCalledWith({
      figmaUserId: "u-1",
      email: "user@example.com",
      flittOrderId: "w2w_pro_u-1_123",
    });
    expect(mockApplyActivation).not.toHaveBeenCalled();
    expect(mockApplyRecurring).not.toHaveBeenCalled();
  });

  it("recurring:false approved WITH parent_order_id still → applyOneTimePurchase", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload({ parent_order_id: "x", payment_id: "pay_p" }));
    expect(mockApplyOneTime).toHaveBeenCalledOnce();
    expect(mockApplyRecurring).not.toHaveBeenCalled();
  });

  it("recurring:false declined → no service call (logged only)", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload({ order_status: "declined", payment_id: "pay_d" }));
    expect(mockApplyOneTime).not.toHaveBeenCalled();
    expect(mockApplyFailedCharge).not.toHaveBeenCalled();
  });

  it("recurring:false expired → no service call (logged only)", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload({ order_status: "expired", payment_id: "pay_e" }));
    expect(mockApplyOneTime).not.toHaveBeenCalled();
    expect(mockApplyFailedCharge).not.toHaveBeenCalled();
  });

  it("two one-time purchases with different payment_id → applyOneTimePurchase twice", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload({ payment_id: "pay_1" }));
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload({ payment_id: "pay_2" }));
    expect(mockApplyOneTime).toHaveBeenCalledTimes(2);
  });

  it("recurring:false approved + sender_email → sends receipt email", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload({ payment_id: "pay_receipt_1" }));
    expect(mockSendReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        amountCents: 1600,
        currency: "USD",
        orderId: "w2w_pro_u-1_123",
      }),
    );
  });

  it("recurring:false approved + NO sender_email → no receipt", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(
        oneTimePayload({ payment_id: "pay_receipt_2", sender_email: undefined }),
      );
    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  it("duplicate one-time webhook (same payment_id) is deduped", async () => {
    mockWebhookEventCreate.mockRejectedValueOnce(
      Object.assign(new Error("dup key"), { code: 11000 }),
    );
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(oneTimePayload({ payment_id: "pay_dup" }));
    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
    expect(mockApplyOneTime).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Payload hardening (H-4)
// ============================================================================

describe("POST /api/webhooks/flitt — body size limit (DoS guard)", () => {
  it("rejects payloads above 16kb with HTTP 413", async () => {
    // Build a payload larger than 16kb. The actual webhook fields are tiny
    // — anything this large is either misconfigured or an attack.
    const huge = "x".repeat(20 * 1024);
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .set("Content-Type", "application/json")
      .send(approvedPayload({ merchant_data: huge }));
    expect(res.status).toBe(413);
  });

  it("accepts a normally-sized payload (well under the limit)", async () => {
    mockVerifyCallback.mockReturnValue(true);
    mockApplyOneTime.mockResolvedValue({});
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(
        approvedPayload({
          merchant_data: JSON.stringify({
            figmaUserId: "u-1",
            plan: "pro",
            recurring: false,
          }),
        }),
      );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/webhooks/flitt — payload hardening", () => {
  beforeEach(() => {
    mockVerifyCallback.mockReturnValue(true);
  });

  it("rejects a webhook missing the amount field — no Pro granted", async () => {
    const payload = approvedPayload();
    delete (payload as Record<string, unknown>).amount;
    const res = await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(payload);
    expect(res.status).toBe(200);
    expect(mockApplyActivation).not.toHaveBeenCalled();
    expect(mockWebhookEventCreate).not.toHaveBeenCalled();
  });

  it("rejects a webhook missing order_id — no Pro granted", async () => {
    const payload = approvedPayload();
    delete (payload as Record<string, unknown>).order_id;
    await request(makeApp()).post("/api/webhooks/flitt").send(payload);
    expect(mockApplyActivation).not.toHaveBeenCalled();
  });

  it("rejects an approved charge with an unexpected amount", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(approvedPayload({ amount: 1 }));
    expect(mockApplyActivation).not.toHaveBeenCalled();
  });

  it("rejects when order_id does not match the merchant_data figmaUserId", async () => {
    await request(makeApp())
      .post("/api/webhooks/flitt")
      .send(
        approvedPayload({
          order_id: "w2w_pro_attacker_999",
          merchant_data: JSON.stringify({ figmaUserId: "victim", plan: "pro" }),
        }),
      );
    expect(mockApplyActivation).not.toHaveBeenCalled();
    expect(mockApplyOneTime).not.toHaveBeenCalled();
  });
});
