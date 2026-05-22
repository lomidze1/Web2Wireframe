import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";
import {
  PLAN_PRICES,
  getProPriceCents,
  getProOrderDescription,
  type ProDuration,
} from "../models/License.js";

// ----------------------------------------------------------------------------
// returnUrl trust boundary
//
// `returnUrl` arrives from the public `/api/checkout/create` body — attacker
// fully controls it. Flitt 302-redirects the browser to whatever we sign into
// `response_url` after a successful charge, so an unconstrained pass-through
// is an open-redirect / phishing primitive: a phisher pays $16, lands the
// victim on `evil.com/login`, and harvests credentials there.
//
// Rule: only same-property hosts pass through. Anything else → `undefined`,
// and the caller falls back to `${config.website.baseUrl}/checkout/success`.
// Silent fallback (no 400) keeps a typo from killing a real user's payment.
// ----------------------------------------------------------------------------

const RETURN_URL_ALLOWED_HOSTS = new Set([
  "web2wireframe.design",
  "www.web2wireframe.design",
  "localhost",
  "127.0.0.1",
]);

function sanitizeReturnUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return undefined;
  }
  return RETURN_URL_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())
    ? parsed.toString()
    : undefined;
}

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

  // Reject canonicalization injection: Flitt joins signed values with a
  // literal `|`. A field value containing `|` could make two distinct
  // payloads produce the same signing string. Flitt's own webhook fields
  // never contain `|`, so any value that does is a tampering attempt.
  // (`response_signature_string` is Flitt's debug echo of the concat string
  // itself and is excluded from signing — skip it.)
  for (const [key, value] of Object.entries(payload)) {
    if (key === "signature" || key === "response_signature_string") continue;
    if (typeof value === "string" && value.includes("|")) return false;
  }

  const expected = flittSign(payload, secretKey);

  // Constant-time comparison. timingSafeEqual requires equal-length buffers,
  // which the length check below guarantees.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
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
    sanitizeReturnUrl(params.returnUrl) ??
    `${config.website.baseUrl}/checkout/success`;
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
  /**
   * Pro tier duration. Defaults to `"monthly"` so legacy callers (and the
   * old "Get Pro" button before the yearly UI lands) keep getting the
   * 30-day / $16 checkout they used to get.
   */
  duration?: ProDuration;
}): Promise<CheckoutResult | CheckoutError> {
  const { merchantId, secretKey, baseUrl } = config.flitt;
  if (!merchantId || !secretKey) {
    return { ok: false, error: "Flitt is not configured" };
  }

  const duration: ProDuration = params.duration ?? "monthly";
  const orderId = buildSubscriptionOrderId(params.figmaUserId);
  const amount = getProPriceCents(duration);
  const currency = PLAN_PRICES.pro.currency;

  // merchant_data round-trips back to us in the webhook so we can map the
  // payment to the correct figmaUserId, route it as a one-time purchase,
  // and pick the right cycle length on activation.
  const merchantData = JSON.stringify({
    figmaUserId: params.figmaUserId,
    plan: "pro",
    recurring: false,
    duration,
  });

  const responseUrl =
    sanitizeReturnUrl(params.returnUrl) ??
    `${config.website.baseUrl}/checkout/success`;
  const callbackUrl = `${
    process.env.API_PUBLIC_URL ?? "https://api.web2wireframe.design"
  }/api/webhooks/flitt`;

  const requestParams: Record<string, unknown> = {
    merchant_id: merchantId,
    order_id: orderId,
    amount,
    currency,
    order_desc: getProOrderDescription(duration),
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
 *
 * Retry policy: Flitt sometimes returns 5xx during regional incidents; a
 * single transient blip should not surface as a 502 to a user clicking
 * "Cancel". We retry server-error (5xx) and network failures with bounded
 * backoff (~200ms + 800ms ≈ 1s total worst case — well under the cancel
 * endpoint's overall budget).
 *
 * 4xx responses are NOT retried — they're decisive (no such order, wrong
 * merchant, etc.) and retrying just delays the user's error message.
 */
const CANCEL_RETRY_DELAYS_MS = [200, 800];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

  const attempts = CANCEL_RETRY_DELAYS_MS.length + 1;
  let lastError: CancelError = { ok: false, error: "Flitt unreachable" };

  for (let i = 0; i < attempts; i += 1) {
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/api/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error(`[Flitt] cancel fetch failed (attempt ${i + 1}):`, err);
      lastError = { ok: false, error: "Flitt unreachable" };
      if (i < CANCEL_RETRY_DELAYS_MS.length) {
        await sleep(CANCEL_RETRY_DELAYS_MS[i]);
        continue;
      }
      return lastError;
    }

    // 5xx — transient Flitt-side issue, retry. 4xx — terminal (don't retry).
    if (resp.status >= 500) {
      console.error(
        `[Flitt] cancel HTTP ${resp.status} on attempt ${i + 1}:`,
        await resp.text().catch(() => "<no body>"),
      );
      lastError = { ok: false, error: `Flitt HTTP ${resp.status}` };
      if (i < CANCEL_RETRY_DELAYS_MS.length) {
        await sleep(CANCEL_RETRY_DELAYS_MS[i]);
        continue;
      }
      return lastError;
    }

    if (!resp.ok) {
      console.error(
        `[Flitt] cancel HTTP ${resp.status}:`,
        await resp.text().catch(() => "<no body>"),
      );
      // Terminal — surface to the caller; user-visible error like "no
      // such order" is more actionable than a retry storm.
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

    if (i > 0) {
      console.info(`[Flitt] cancel succeeded on attempt ${i + 1}`);
    }
    return { ok: true };
  }

  return lastError;
}
