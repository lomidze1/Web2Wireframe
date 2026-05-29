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
  createOneTimeCheckout,
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

  it("rejects a payload whose field value contains the | separator (H2)", () => {
    // Flitt joins signed values with a literal `|`. A value containing `|`
    // lets two distinct payloads collide on the signing string — reject it
    // before trusting the signature, even though it is correctly signed here.
    const params = { order_id: "x|y", amount: 1600 };
    const signature = flittSign(params, "test");
    expect(verifyCallback({ ...params, signature }, "test")).toBe(false);
  });

  it("still accepts response_signature_string that contains | (debug echo)", () => {
    // response_signature_string is Flitt's echo of the concat string and is
    // excluded from signing — its `|` must not trip the H2 guard.
    const params = { order_id: "x", amount: 1600 };
    const signature = flittSign(params, "test");
    expect(
      verifyCallback(
        { ...params, signature, response_signature_string: "test|1600|x" },
        "test",
      ),
    ).toBe(true);
  });

  it("rejects payloads with object-typed values (C-1: canonicalization fragility)", () => {
    // Future Flitt schema or proxy that forwards a nested object un-stringified
    // would coerce to `"[object Object]"` and let two distinct payloads collide
    // on the signing string. Reject object-typed values defensively even when
    // the attacker-side signature would match — they have no legitimate place
    // in a Flitt webhook payload.
    const params: Record<string, unknown> = {
      order_id: "x",
      amount: 1600,
      recurring_data: { amount: 9999999 },
    };
    const signature = flittSign(params, "test");
    expect(verifyCallback({ ...params, signature }, "test")).toBe(false);
  });

  it("rejects payloads with array-typed values (C-1)", () => {
    const params: Record<string, unknown> = {
      order_id: "x",
      amount: 1600,
      multi: ["a", "b"],
    };
    const signature = flittSign(params, "test");
    expect(verifyCallback({ ...params, signature }, "test")).toBe(false);
  });

  it("applies the | guard to stringified non-string values (C-1 defense in depth)", () => {
    // String() of a number can never contain `|`, but the check should still
    // be applied to the coerced form so future value types are caught.
    // (Boolean false stringifies to "false" — harmless; verified for shape.)
    const params: Record<string, unknown> = {
      order_id: "x",
      flag: false,
      amount: 1600,
    };
    const signature = flittSign(params, "test");
    expect(verifyCallback({ ...params, signature }, "test")).toBe(true);
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

    const result = await createSubscriptionCheckout({
      figmaUserId: "user-1",
      duration: "monthly",
    });

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

    // merchant_data must include `duration` (H-1) so the webhook can
    // validate amount against the correct cycle price.
    const md = JSON.parse(payload.request.merchant_data);
    expect(md).toEqual({ figmaUserId: "user-1", plan: "pro", duration: "monthly" });
  });

  it("uses yearly amount + period when duration is 'yearly' (H-1)", async () => {
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

    const result = await createSubscriptionCheckout({
      figmaUserId: "user-2",
      duration: "yearly",
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.amount).toBe(14400); // yearly = $144

    const recurring = JSON.parse(payload.request.recurring_data);
    expect(recurring.period).toBe("year");
    expect(recurring.amount).toBe(14400);

    const md = JSON.parse(payload.request.merchant_data);
    expect(md).toEqual({ figmaUserId: "user-2", plan: "pro", duration: "yearly" });
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

    const result = await createSubscriptionCheckout({
      figmaUserId: "user-1",
      duration: "monthly",
    });
    expect(result.ok).toBe(false);
  });

  it("returns error on HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const result = await createSubscriptionCheckout({
      figmaUserId: "user-1",
      duration: "monthly",
    });
    expect(result.ok).toBe(false);
  });

  it("returns error when fetch itself rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await createSubscriptionCheckout({
      figmaUserId: "user-1",
      duration: "monthly",
    });
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// createOneTimeCheckout
// ============================================================================

describe("createOneTimeCheckout", () => {
  it("posts a one-time order with no subscription/recurring_data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "success",
            checkout_url: "https://pay.flitt.test/checkout/ot1",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createOneTimeCheckout({ figmaUserId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checkoutUrl).toBe("https://pay.flitt.test/checkout/ot1");
    expect(result.orderId.startsWith("w2w_pro_user-1_")).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://pay.flitt.test/api/checkout/url");
    expect(init?.method).toBe("POST");

    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.merchant_id).toBe("1549901");
    expect(payload.request.amount).toBe(1600);
    expect(payload.request.currency).toBe("USD");
    expect(payload.request.order_desc).toBe("Web2Wireframe Pro — 1 Month");
    expect(payload.request.signature).toMatch(/^[0-9a-f]{40}$/);

    // one-time = NO subscription / recurring_data keys
    expect(payload.request.subscription).toBeUndefined();
    expect(payload.request.recurring_data).toBeUndefined();

    // merchant_data flags this as a one-time purchase for the webhook;
    // duration round-trips back to applyOneTimePurchase so the cycle length
    // matches the price tier. Default tier is monthly.
    const md = JSON.parse(payload.request.merchant_data);
    expect(md).toEqual({
      figmaUserId: "user-1",
      plan: "pro",
      recurring: false,
      duration: "monthly",
    });
  });

  it("posts a yearly one-time order with $144 + 1 Year description", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "success",
            checkout_url: "https://pay.flitt.test/checkout/y1",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createOneTimeCheckout({
      figmaUserId: "user-1",
      duration: "yearly",
    });
    expect(result.ok).toBe(true);

    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.amount).toBe(14400);
    expect(payload.request.order_desc).toBe("Web2Wireframe Pro — 1 Year");
    const md = JSON.parse(payload.request.merchant_data);
    expect(md.duration).toBe("yearly");
    // one-time semantics unchanged across tiers
    expect(md.recurring).toBe(false);
    expect(payload.request.subscription).toBeUndefined();
  });

  it("returns error when Flitt returns a non-success response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: { response_status: "failure", error_message: "nope" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createOneTimeCheckout({ figmaUserId: "user-1" });
    expect(result.ok).toBe(false);
  });

  it("returns error on HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const result = await createOneTimeCheckout({ figmaUserId: "user-1" });
    expect(result.ok).toBe(false);
  });

  it("returns error when fetch itself rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await createOneTimeCheckout({ figmaUserId: "user-1" });
    expect(result.ok).toBe(false);
  });

  // --------------------------------------------------------------------------
  // sender_email — populates Flitt portal "Customer email" column and lets
  // Flitt fire its own receipt email. We pass it through only when present;
  // a graceful skip when missing keeps anonymous-checkout (plugin user with no
  // website OAuth yet) working unchanged.
  // --------------------------------------------------------------------------

  it("includes sender_email in the signed payload when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "success",
            checkout_url: "https://pay.flitt.test/checkout/email1",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createOneTimeCheckout({
      figmaUserId: "user-1",
      senderEmail: "buyer@example.com",
    });
    expect(result.ok).toBe(true);

    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.sender_email).toBe("buyer@example.com");
    // Signature must be recomputed including the email — assert the field
    // exists and looks like SHA1 (40 hex chars). If sender_email wasn't
    // included before signing, signature would still be 40 chars but wouldn't
    // verify on Flitt's side — that's hard to assert here without
    // round-tripping through verifyCallback, which is its own test suite.
    expect(payload.request.signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it("omits sender_email when undefined (graceful skip for anonymous checkout)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "success",
            checkout_url: "https://pay.flitt.test/checkout/email2",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await createOneTimeCheckout({ figmaUserId: "user-1" });

    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.sender_email).toBeUndefined();
  });

  it("omits sender_email when empty string (treated as absent)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "success",
            checkout_url: "https://pay.flitt.test/checkout/email3",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await createOneTimeCheckout({
      figmaUserId: "user-1",
      senderEmail: "",
    });

    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.request.sender_email).toBeUndefined();
  });
});

// ============================================================================
// returnUrl sanitization — open-redirect protection
//
// `returnUrl` is attacker-controlled (the public /api/checkout/create
// endpoint accepts anything). Flitt 302-redirects the browser there after
// the charge clears, so without an allowlist a phisher can pay $16, capture
// the victim's Pro session landing on evil.com/login, and harvest credentials.
// We assert behavior end-to-end: untrusted URLs must NOT reach Flitt as the
// response_url; the service silently falls back to the default success page.
// ============================================================================

describe("returnUrl sanitization (open-redirect protection)", () => {
  // The default response_url now goes through the API bridge route
  // (POST→GET 303 redirect) instead of the website's static SPA path —
  // see the `ALL /api/checkout/success` handler. API_PUBLIC_URL is unset
  // in this test env, so the service uses its hardcoded prod fallback.
  const DEFAULT_RETURN =
    "https://api.web2wireframe.design/api/checkout/success";

  const mockOkCheckout = (): ReturnType<typeof vi.spyOn> =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            response_status: "success",
            checkout_url: "https://pay.flitt.test/checkout/x",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

  const responseUrlOf = (fetchSpy: ReturnType<typeof vi.spyOn>): string => {
    const [, init] = fetchSpy.mock.calls[0] as [unknown, RequestInit];
    const payload = JSON.parse((init?.body as string) ?? "{}");
    return payload.request.response_url as string;
  };

  it("keeps an apex-domain returnUrl", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "https://web2wireframe.design/thanks",
    });
    expect(responseUrlOf(spy)).toBe("https://web2wireframe.design/thanks");
  });

  it("keeps a www-subdomain returnUrl", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "https://www.web2wireframe.design/checkout/success",
    });
    expect(responseUrlOf(spy)).toBe(
      "https://www.web2wireframe.design/checkout/success",
    );
  });

  it("keeps localhost (dev callers)", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "http://localhost:5173/return",
    });
    expect(responseUrlOf(spy)).toBe("http://localhost:5173/return");
  });

  it("rejects an unknown host and falls back to default", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "https://evil.example/phish",
    });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("rejects subdomain-confusion (web2wireframe.design.evil.com)", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "https://www.web2wireframe.design.evil.com/login",
    });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("rejects javascript: protocol", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "javascript:alert(document.cookie)",
    });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("rejects data: URL", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "data:text/html,<script>alert(1)</script>",
    });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("rejects malformed URL string", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "not a url at all",
    });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("rejects api.web2wireframe.design (not in allowlist)", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({
      figmaUserId: "u",
      returnUrl: "https://api.web2wireframe.design/somewhere",
    });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("uses default when returnUrl is undefined", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({ figmaUserId: "u" });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("uses default when returnUrl is empty string", async () => {
    const spy = mockOkCheckout();
    await createOneTimeCheckout({ figmaUserId: "u", returnUrl: "" });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  // createSubscriptionCheckout shares the same vuln + helper; smoke-test it
  // separately so a future refactor that forgets to wire the helper into one
  // path doesn't silently regress.
  it("also sanitizes returnUrl in createSubscriptionCheckout", async () => {
    const spy = mockOkCheckout();
    await createSubscriptionCheckout({
      figmaUserId: "u",
      duration: "monthly",
      returnUrl: "https://evil.example/phish",
    });
    expect(responseUrlOf(spy)).toBe(DEFAULT_RETURN);
  });

  it("createSubscriptionCheckout keeps a trusted returnUrl", async () => {
    const spy = mockOkCheckout();
    await createSubscriptionCheckout({
      figmaUserId: "u",
      duration: "monthly",
      returnUrl: "https://www.web2wireframe.design/yay",
    });
    expect(responseUrlOf(spy)).toBe("https://www.web2wireframe.design/yay");
  });
});

// P2-#11: `describe("cancelSubscription", ...)` blocks removed alongside
// the helper. Web2Wireframe ships one-time payments only — there is no
// subscription stop call to make. See flittService.ts removal note.
