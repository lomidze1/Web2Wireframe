import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ============================================================================
// Mocks BEFORE importing the route module
// ============================================================================

const mockCreateOneTimeCheckout = vi.fn();
const mockVerifyCallback = vi.fn();
const mockGetOrCreate = vi.fn();

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
    website: {
      baseUrl: "https://web2wireframe.test",
    },
  },
}));

const { signToken } = await import("../src/middleware/auth.js");
const checkoutModule = await import("../src/routes/checkout/index.js");
const checkoutRoutes = checkoutModule.default;

// ============================================================================
// Test app
// ============================================================================

function makeApp() {
  const app = express();
  app.use(express.json());
  // Match production middleware chain — Flitt's response_url POSTs as
  // application/x-www-form-urlencoded, so the bridge route needs this
  // parser to read order_id / order_status off the body for logging.
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/checkout", checkoutRoutes);
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
    mockCreateOneTimeCheckout.mockResolvedValue({
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
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: false,
      error: "Flitt down",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Flitt down");
  });

  it("defaults to monthly tier when plan is omitted", async () => {
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/m",
      orderId: "w2w_pro_u_m",
    });
    await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1" });
    expect(mockCreateOneTimeCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ figmaUserId: "u-1", duration: "monthly" }),
    );
  });

  it("passes duration:'yearly' through when plan is 'yearly'", async () => {
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/y",
      orderId: "w2w_pro_u_y",
    });
    await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "yearly" });
    expect(mockCreateOneTimeCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ figmaUserId: "u-1", duration: "yearly" }),
    );
  });

  it("returns 400 for an unknown plan value", async () => {
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "lifetime" });
    expect(res.status).toBe(400);
    expect(mockCreateOneTimeCheckout).not.toHaveBeenCalled();
  });

  it("rejects figmaUserId longer than 64 chars (H-4 storage amplification)", async () => {
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "a".repeat(65) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max 64 chars/);
    expect(mockCreateOneTimeCheckout).not.toHaveBeenCalled();
  });

  it("rejects empty-string figmaUserId (H-4)", async () => {
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "" });
    expect(res.status).toBe(400);
    expect(mockCreateOneTimeCheckout).not.toHaveBeenCalled();
  });

  it("rejects object figmaUserId — NoSQL injection vector (H-4)", async () => {
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: { $ne: null } });
    expect(res.status).toBe(400);
    expect(mockCreateOneTimeCheckout).not.toHaveBeenCalled();
  });

  it("accepts a 64-char figmaUserId (boundary)", async () => {
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/x",
      orderId: "w2w_pro_x",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "a".repeat(64) });
    expect(res.status).toBe(200);
  });

  // --------------------------------------------------------------------------
  // sender_email forwarding — License.email round-trips to Flitt so the
  // portal's "Customer email" column populates and Flitt's own receipt email
  // fires. License lookup is already happening for the active-Pro pre-block;
  // we just read one more field off the same document.
  // --------------------------------------------------------------------------

  it("forwards license.email as senderEmail when the caller's token owns figmaUserId", async () => {
    mockGetOrCreate.mockResolvedValue({
      figmaUserId: "u-1",
      email: "buyer@example.com",
      plan: "free",
      cycleEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/e",
      orderId: "w2w_pro_e",
    });
    await request(makeApp())
      .post("/api/checkout/create")
      .set("Authorization", `Bearer ${signToken("u-1", process.env.AUTH_SECRET!)}`)
      .send({ figmaUserId: "u-1" });
    expect(mockCreateOneTimeCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        figmaUserId: "u-1",
        senderEmail: "buyer@example.com",
      }),
    );
  });

  // Security audit 2026-09-19 (#3): figmaUserId in the body is not proof of
  // identity. Without a matching token the stored email must not be bound
  // to a checkout URL that goes back to an arbitrary caller.
  it("omits senderEmail when the request has no token", async () => {
    mockGetOrCreate.mockResolvedValue({
      figmaUserId: "u-1",
      email: "buyer@example.com",
      plan: "free",
      cycleEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/a",
      orderId: "w2w_pro_a",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    const callArg = mockCreateOneTimeCheckout.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArg.senderEmail).toBeUndefined();
  });

  it("omits senderEmail when the token belongs to a different user", async () => {
    mockGetOrCreate.mockResolvedValue({
      figmaUserId: "u-1",
      email: "buyer@example.com",
      plan: "free",
      cycleEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/o",
      orderId: "w2w_pro_o",
    });
    await request(makeApp())
      .post("/api/checkout/create")
      .set("Authorization", `Bearer ${signToken("attacker", process.env.AUTH_SECRET!)}`)
      .send({ figmaUserId: "u-1" });
    const callArg = mockCreateOneTimeCheckout.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArg.senderEmail).toBeUndefined();
  });

  it("calls createOneTimeCheckout without senderEmail when license.email is null", async () => {
    mockGetOrCreate.mockResolvedValue({
      figmaUserId: "u-1",
      email: null,
      plan: "free",
      cycleEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/n",
      orderId: "w2w_pro_n",
    });
    await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1" });
    // senderEmail must not be present in the call object so flittService
    // sees it as undefined and skips the field in the signed request.
    const callArg = mockCreateOneTimeCheckout.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArg.senderEmail).toBeUndefined();
  });

  it("still creates checkout when license read fails (graceful no-email path)", async () => {
    // Mongo blip mid-checkout: existing behavior already swallows the error
    // and falls through. The new email-forwarding code must not regress
    // that — confirm createOneTimeCheckout is still called, just without
    // senderEmail.
    mockGetOrCreate.mockRejectedValue(new Error("mongo down"));
    mockCreateOneTimeCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: "https://pay.flitt.test/g",
      orderId: "w2w_pro_g",
    });
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1" });
    expect(res.status).toBe(200);
    const callArg = mockCreateOneTimeCheckout.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArg.senderEmail).toBeUndefined();
  });
});

// ============================================================================
// /api/checkout/success — Flitt response_url bridge (POST/GET → 303 to website)
// ----------------------------------------------------------------------------
// User reports intermittent "Internal server error" landing after a real
// Flitt payment. curl reproduces 303 every time, so the bug is browser- or
// payload-specific. We instrument with structured logging so the next failure
// is diagnosable from Render logs; the redirect contract itself stays
// identical (same 303 status, same Location header).
// ============================================================================

describe("ALL /api/checkout/success — bridge", () => {
  it("returns 303 with Location pointing at the website success page (GET)", async () => {
    const res = await request(makeApp())
      .get("/api/checkout/success");
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(
      "https://web2wireframe.test/checkout/success",
    );
  });

  it("returns 303 with Location header on POST form body (Flitt's real path)", async () => {
    const res = await request(makeApp())
      .post("/api/checkout/success")
      .type("form")
      .send(
        "order_id=w2w_pro_test_1&order_status=approved&amount=14400&currency=USD&signature=deadbeef",
      );
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(
      "https://web2wireframe.test/checkout/success",
    );
  });

  it("logs request metadata (method, content-type, body keys) on POST", async () => {
    // Spy stdout for the structured NDJSON line. The handler emits
    // one info-level log per request via createLogger("checkout-success-bridge").
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await request(makeApp())
      .post("/api/checkout/success")
      .type("form")
      .send("order_id=w2w_pro_log_1&order_status=approved&signature=abc");
    // At least one stdout line for our component
    const matched = logSpy.mock.calls
      .map((c) => String(c[0] ?? ""))
      .filter((s) => s.includes('"component":"checkout-success-bridge"'));
    expect(matched.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(matched[0]);
    expect(parsed.method).toBe("POST");
    expect(parsed.contentType).toMatch(/x-www-form-urlencoded/);
    // Body field KEYS are safe to log; values may contain signature/PAN-ish data
    expect(parsed.bodyKeys).toEqual(
      expect.arrayContaining(["order_id", "order_status", "signature"]),
    );
    // order_id + order_status are safe to log as-is (no PII / no signature)
    expect(parsed.orderId).toBe("w2w_pro_log_1");
    expect(parsed.orderStatus).toBe("approved");
    // Signature must never be in the log line — sanitizer drops it
    expect(JSON.stringify(parsed)).not.toContain("abc");
    logSpy.mockRestore();
  });
});

// ============================================================================
// POST /api/subscription/cancel
// ============================================================================

// P2-#11: `describe("POST /api/subscription/cancel", ...)` removed alongside
// the route. One-time payment model has no subscription to cancel; the
// website Cancel UI was already dropped in commit 11ff22f.
