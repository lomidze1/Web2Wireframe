import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mock the env config BEFORE importing flittService
// ============================================================================

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

const {
  flittSign,
  verifyCallback,
  buildSubscriptionOrderId,
  createSubscriptionCheckout,
  cancelSubscription,
} = await import("../src/services/flittService.js");

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// flittSign — verified test vector from reference_flitt-api.md
// ============================================================================

describe("flittSign", () => {
  it("matches the canonical Flitt example concat string + SHA1", () => {
    // Canonical test vector from docs.flitt.com — input + intended concat.
    // (The docs example shows a hash string that doesn't actually match
    //  SHA1 of the documented concat — likely a docs typo. We assert on
    //  the actual SHA1 of the verified concat string instead.)
    const params = {
      merchant_id: 1549901,
      order_id: "TestOrder2",
      amount: 1000,
      currency: "GEL",
      order_desc: "Test payment",
      server_callback_url: "http://myshop/callback/",
    };
    // Concat = "test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/"
    const sig = flittSign(params, "test");
    expect(sig).toBe("cd0edb710cbbdb6c2a4d965cdb91fdfabc343215");
  });

  it("sorts keys alphabetically before concatenation", () => {
    const a = flittSign({ b: 1, a: 2 }, "key");
    const b = flittSign({ a: 2, b: 1 }, "key");
    expect(a).toBe(b);
  });

  it("excludes empty / null / undefined values", () => {
    const withNoise = flittSign(
      { a: 1, b: "", c: null, d: undefined, e: 2 },
      "key",
    );
    const clean = flittSign({ a: 1, e: 2 }, "key");
    expect(withNoise).toBe(clean);
  });

  it("excludes the signature key itself (so re-signing is idempotent)", () => {
    const sig = flittSign({ a: 1 }, "key");
    const reSig = flittSign({ a: 1, signature: sig }, "key");
    expect(reSig).toBe(sig);
  });

  it("excludes response_signature_string (Flitt's debug echo)", () => {
    const sig = flittSign({ a: 1 }, "key");
    const reSig = flittSign(
      { a: 1, response_signature_string: "key|1" },
      "key",
    );
    expect(reSig).toBe(sig);
  });

  it("returns 40-char lowercase hex (SHA1)", () => {
    const sig = flittSign({ a: "anything" }, "k");
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
  });

  it("differs across secret keys", () => {
    expect(flittSign({ a: 1 }, "k1")).not.toBe(flittSign({ a: 1 }, "k2"));
  });
});

// ============================================================================
// verifyCallback
// ============================================================================

describe("verifyCallback", () => {
  it("returns true when signature is valid", () => {
    const params = { order_id: "x", order_status: "approved", amount: 1600 };
    const signature = flittSign(params, "test");
    expect(verifyCallback({ ...params, signature }, "test")).toBe(true);
  });

  it("returns false when signature is tampered", () => {
    const params = { order_id: "x", amount: 1600 };
    const signature = flittSign(params, "test");
    const tampered = signature.slice(0, -1) + (signature.slice(-1) === "0" ? "1" : "0");
    expect(verifyCallback({ ...params, signature: tampered }, "test")).toBe(false);
  });

  it("returns false when signature is missing", () => {
    expect(verifyCallback({ order_id: "x" }, "test")).toBe(false);
  });

  it("returns false when signature is wrong type", () => {
    expect(verifyCallback({ order_id: "x", signature: 123 }, "test")).toBe(false);
  });

  it("returns false when signed with a different secret", () => {
    const params = { order_id: "x" };
    const signature = flittSign(params, "wrong-key");
    expect(verifyCallback({ ...params, signature }, "test")).toBe(false);
  });

  it("ignores response_signature_string when verifying (per Flitt rules)", () => {
    const params = { order_id: "x", amount: 1600 };
    const signature = flittSign(params, "test");
    expect(
      verifyCallback(
        {
          ...params,
          signature,
          response_signature_string: "garbage that should be ignored",
        },
        "test",
      ),
    ).toBe(true);
  });
});

// ============================================================================
// buildSubscriptionOrderId
// ============================================================================

describe("buildSubscriptionOrderId", () => {
  it("uses w2w_pro_ prefix and includes timestamp", () => {
    const id = buildSubscriptionOrderId("user-123");
    expect(id.startsWith("w2w_pro_")).toBe(true);
    expect(id).toMatch(/^w2w_pro_user-123_\d+$/);
  });

  it("strips characters that are not URL-safe", () => {
    const id = buildSubscriptionOrderId("user 1+2/3@figma");
    expect(id).toMatch(/^w2w_pro_user123figma_\d+$/);
  });

  it("produces unique ids across calls (different timestamps)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T10:00:00Z"));
    const a = buildSubscriptionOrderId("u");
    vi.setSystemTime(new Date("2026-05-04T10:00:00.001Z"));
    const b = buildSubscriptionOrderId("u");
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// createSubscriptionCheckout
// ============================================================================

describe("createSubscriptionCheckout", () => {
  it("posts to Flitt with correct shape and returns checkoutUrl", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "success",
            checkout_url: "https://pay.flitt.test/checkout/abc",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createSubscriptionCheckout({ figmaUserId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checkoutUrl).toBe("https://pay.flitt.test/checkout/abc");
    expect(result.orderId.startsWith("w2w_pro_user-1_")).toBe(true);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://pay.flitt.test/api/checkout/url");
    expect(init?.method).toBe("POST");

    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.merchant_id).toBe("1549901");
    expect(payload.request.subscription).toBe("Y");
    expect(payload.request.amount).toBe(1600);
    expect(payload.request.currency).toBe("USD");
    expect(typeof payload.request.signature).toBe("string");
    expect(payload.request.signature).toMatch(/^[0-9a-f]{40}$/);

    // recurring_data is JSON-stringified before signing
    expect(typeof payload.request.recurring_data).toBe("string");
    const recurring = JSON.parse(payload.request.recurring_data);
    expect(recurring).toEqual({
      amount: 1600,
      period: "month",
      every: 1,
      quantity: 999,
      state: "shown_readonly",
    });

    // merchant_data is also a string we can parse
    const md = JSON.parse(payload.request.merchant_data);
    expect(md).toEqual({ figmaUserId: "user-1", plan: "pro" });
  });

  it("returns error when Flitt returns a non-success response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "failure",
            error_message: "merchant not allowed",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createSubscriptionCheckout({ figmaUserId: "user-1" });
    expect(result.ok).toBe(false);
  });

  it("returns error on HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const result = await createSubscriptionCheckout({ figmaUserId: "user-1" });
    expect(result.ok).toBe(false);
  });

  it("returns error when fetch itself rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await createSubscriptionCheckout({ figmaUserId: "user-1" });
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// cancelSubscription
// ============================================================================

describe("cancelSubscription", () => {
  it("posts action=stop with valid signature", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ response: { response_status: "success" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await cancelSubscription("w2w_pro_user-1_123");
    expect(result.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://pay.flitt.test/api/recurring/");
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.action).toBe("stop");
    expect(payload.request.order_id).toBe("w2w_pro_user-1_123");
    expect(payload.request.signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns error when Flitt response_status is not success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: { response_status: "failure", error_message: "no such order" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await cancelSubscription("w2w_pro_x_1");
    expect(result.ok).toBe(false);
  });
});
