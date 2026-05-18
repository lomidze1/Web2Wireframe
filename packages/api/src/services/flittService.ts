import { createHash } from "node:crypto";
import { config } from "../config/env.js";
import { PLAN_PRICES } from "../models/License.js";

// ============================================================================
// Types
// ============================================================================

export interface CheckoutResult {
  ok: true;
  checkoutUrl: string;
  orderId: string;
}

export interface CheckoutError {
  ok: false;
  error: string;
}

export interface CancelResult {
  ok: true;
}

export interface CancelError {
  ok: false;
  error: string;
}

interface FlittCheckoutResponse {
  response?: {
    response_status?: string;
    checkout_url?: string;
    order_id?: string;
    error_message?: string;
    error_code?: string | number;
  };
}

interface FlittRecurringResponse {
  response?: {
    response_status?: string;
    error_message?: string;
  };
}

// ============================================================================
// Signature algorithm (verified per reference_flitt-api.md)
// ============================================================================

/**
 * Build the Flitt SHA1 signature for a request or webhook payload.
 *
 * Algorithm:
 *   1. Drop entries whose value is "" or null/undefined.
 *   2. Drop the keys `signature` and `response_signature_string` themselves
 *      (the latter is Flitt's own debug echo on webhooks).
 *   3. Sort remaining entries by key, alphabetically.
 *   4. Concatenate `secretKey | value1 | value2 | ...` with `|` separator.
 *   5. SHA1 hex (lowercase).
 *
 * Nested objects (e.g. `recurring_data`) are serialized via JSON.stringify
 * by the caller before being passed in — they're treated as a single string
 * value at signing time.
 */
export function flittSign(
  params: Record<string, unknown>,
  secretKey: string,
): string {
  const filtered = Object.entries(params)
    .filter(([key, value]) => {
      if (key === "signature" || key === "response_signature_string") return false;
      if (value === "" || value === null || value === undefined) return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  const concat = [secretKey, ...filtered.map(([, v]) => String(v))].join("|");
  return createHash("sha1").update(concat, "utf8").digest("hex");
}

/**
 * Verify the signature on a Flitt webhook payload. Returns true when the
 * signature matches; false on any mismatch (use this to reject spoofed
 * webhooks without falling back to 4xx — Flitt would otherwise retry).
 */
export function verifyCallback(
  payload: Record<string, unknown>,
  secretKey: string,
): boolean {
  const provided = payload.signature;
  if (typeof provided !== "string" || provided.length === 0) return false;

  const expected = flittSign(payload, secretKey);

  // Constant-time-ish compare: lengths must match and we walk the whole
  // string. Node's `crypto.timingSafeEqual` would be stricter but requires
  // equal-length Buffers; for our use case length-check + bitwise XOR is
  // sufficient (signatures are always 40 hex chars).
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// ============================================================================
// Order ID
// ============================================================================

/**
 * Build a unique order_id for a new Pro subscription. Format:
 *   `w2w_pro_<figmaUserId>_<timestamp-ms>`
 *
 * Notes:
 * - figmaUserId is sanitized (only [A-Za-z0-9_-]) so the id remains URL-safe.
 * - The trailing timestamp guarantees uniqueness even if the same user
 *   re-attempts checkout.
 */
export function buildSubscriptionOrderId(figmaUserId: string): string {
  const safe = figmaUserId.replace(/[^A-Za-z0-9_-]/g, "");
  return `w2w_pro_${safe}_${Date.now()}`;
}

// ============================================================================
// Subscription checkout
// ============================================================================

/**
 * Create a hosted checkout for Pro subscription. Returns the URL to open in
 * the user's browser. Flitt sends webhooks to our `server_callback_url` on
 * each charge attempt.
 */
export async function createSubscriptionCheckout(params: {
  figmaUserId: string;
  returnUrl?: string;
}): Promise<CheckoutResult | CheckoutError> {
  const { merchantId, secretKey, baseUrl } = config.flitt;
  if (!merchantId || !secretKey) {
    return { ok: false, error: "Flitt is not configured" };
  }

  const orderId = buildSubscriptionOrderId(params.figmaUserId);
  const amount = PLAN_PRICES.pro.priceCents;
  const currency = PLAN_PRICES.pro.currency;

  const recurringData = {
    amount,
    period: "month",
    every: 1,
    quantity: 999, // "forever" — user cancels via SubscriptionActions
    state: "shown_readonly",
  };

  // merchant_data round-trips back to us in the webhook so we can map the
  // payment to the correct figmaUserId without state on our side.
  const merchantData = JSON.stringify({
    figmaUserId: params.figmaUserId,
    plan: "pro",
  });

  const responseUrl =
    params.returnUrl ?? `${config.website.baseUrl}/checkout/success`;
  const callbackUrl = `${
    process.env.API_PUBLIC_URL ?? "https://api.web2wireframe.design"
  }/api/webhooks/flitt`;

  const requestParams: Record<string, unknown> = {
    merchant_id: merchantId,
    order_id: orderId,
    amount,
    currency,
    order_desc: "Web2Wireframe Pro — Monthly Subscription",
    subscription: "Y",
    recurring_data: JSON.stringify(recurringData),
    server_callback_url: callbackUrl,
    response_url: responseUrl,
    merchant_data: merchantData,
  };

  const signature = flittSign(requestParams, secretKey);
  const body = { request: { ...requestParams, signature } };

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/api/checkout/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[Flitt] checkout fetch failed:", err);
    return { ok: false, error: "Flitt unreachable" };
  }

  if (!resp.ok) {
    console.error(
      `[Flitt] checkout HTTP ${resp.status}:`,
      await resp.text().catch(() => "<no body>"),
    );
    return { ok: false, error: `Flitt HTTP ${resp.status}` };
  }

  const data = (await resp.json()) as FlittCheckoutResponse;
  const r = data.response;
  if (!r || r.response_status !== "success" || !r.checkout_url) {
    console.error("[Flitt] checkout response error:", r);
    return {
      ok: false,
      error: r?.error_message ?? "Flitt did not return a checkout URL",
    };
  }

  return { ok: true, checkoutUrl: r.checkout_url, orderId };
}

// ============================================================================
// One-time checkout
// ============================================================================

/**
 * Create a hosted checkout for a one-time Pro purchase ($16 → 30 days of Pro).
 * No `subscription`/`recurring_data` — Flitt processes a single charge and the
 * user renews manually. `merchant_data.recurring:false` tells our webhook to
 * route this payment to the one-time activation path.
 */
export async function createOneTimeCheckout(params: {
  figmaUserId: string;
  returnUrl?: string;
}): Promise<CheckoutResult | CheckoutError> {
  const { merchantId, secretKey, baseUrl } = config.flitt;
  if (!merchantId || !secretKey) {
    return { ok: false, error: "Flitt is not configured" };
  }

  const orderId = buildSubscriptionOrderId(params.figmaUserId);
  const amount = PLAN_PRICES.pro.priceCents;
  const currency = PLAN_PRICES.pro.currency;

  // merchant_data round-trips back to us in the webhook so we can map the
  // payment to the correct figmaUserId and route it as a one-time purchase.
  const merchantData = JSON.stringify({
    figmaUserId: params.figmaUserId,
    plan: "pro",
    recurring: false,
  });

  const responseUrl =
    params.returnUrl ?? `${config.website.baseUrl}/checkout/success`;
  const callbackUrl = `${
    process.env.API_PUBLIC_URL ?? "https://api.web2wireframe.design"
  }/api/webhooks/flitt`;

  const requestParams: Record<string, unknown> = {
    merchant_id: merchantId,
    order_id: orderId,
    amount,
    currency,
    order_desc: "Web2Wireframe Pro — 1 Month",
    server_callback_url: callbackUrl,
    response_url: responseUrl,
    merchant_data: merchantData,
  };

  const signature = flittSign(requestParams, secretKey);
  const body = { request: { ...requestParams, signature } };

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/api/checkout/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[Flitt] one-time checkout fetch failed:", err);
    return { ok: false, error: "Flitt unreachable" };
  }

  if (!resp.ok) {
    console.error(
      `[Flitt] one-time checkout HTTP ${resp.status}:`,
      await resp.text().catch(() => "<no body>"),
    );
    return { ok: false, error: `Flitt HTTP ${resp.status}` };
  }

  const data = (await resp.json()) as FlittCheckoutResponse;
  const r = data.response;
  if (!r || r.response_status !== "success" || !r.checkout_url) {
    console.error("[Flitt] one-time checkout response error:", r);
    return {
      ok: false,
      error: r?.error_message ?? "Flitt did not return a checkout URL",
    };
  }

  return { ok: true, checkoutUrl: r.checkout_url, orderId };
}

// ============================================================================
// Cancel subscription
// ============================================================================

/**
 * Stop the recurring charge schedule for a subscription. The user retains
 * Pro access until the current cycle ends (lazy downgrade in licenseService).
 */
export async function cancelSubscription(
  orderId: string,
): Promise<CancelResult | CancelError> {
  const { merchantId, secretKey, baseUrl } = config.flitt;
  if (!merchantId || !secretKey) {
    return { ok: false, error: "Flitt is not configured" };
  }

  const requestParams: Record<string, unknown> = {
    merchant_id: merchantId,
    order_id: orderId,
    action: "stop",
  };
  const signature = flittSign(requestParams, secretKey);
  const body = { request: { ...requestParams, signature } };

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/api/subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[Flitt] cancel fetch failed:", err);
    return { ok: false, error: "Flitt unreachable" };
  }

  if (!resp.ok) {
    console.error(
      `[Flitt] cancel HTTP ${resp.status}:`,
      await resp.text().catch(() => "<no body>"),
    );
    return { ok: false, error: `Flitt HTTP ${resp.status}` };
  }

  const data = (await resp.json()) as FlittRecurringResponse;
  if (data.response?.response_status !== "success") {
    console.error("[Flitt] cancel response error:", data.response);
    return {
      ok: false,
      error: data.response?.error_message ?? "Flitt cancel failed",
    };
  }

  return { ok: true };
}
