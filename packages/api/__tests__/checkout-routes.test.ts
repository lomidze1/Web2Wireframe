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

describe("POST /api/checkout/create — disabled (Web2Wireframe is free)", () => {
  it("returns 410 and never opens a Flitt checkout", async () => {
    const res = await request(makeApp())
      .post("/api/checkout/create")
      .send({ figmaUserId: "u-1", plan: "monthly" });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("checkout_disabled");
    expect(res.body.checkoutUrl).toBeUndefined();
    expect(mockCreateOneTimeCheckout).not.toHaveBeenCalled();
    expect(mockGetOrCreate).not.toHaveBeenCalled();
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
