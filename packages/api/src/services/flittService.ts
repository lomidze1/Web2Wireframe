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

interface FlittCheckoutResponse {
  response?: {
    response_status?: string;
    checkout_url?: string;
    order_id?: string;
    error_message?: string;
    error_code?: string | number;
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
  //
  // C-1: also reject object- and array-typed values. flittSign() coerces
  // every value via `String(v)`, so any object stringifies to
  // `"[object Object]"` and any array joins with commas — both let
  // structurally distinct payloads collide on the signing string. No
  // legitimate Flitt field arrives as a raw object (nested payloads like
  // `recurring_data` are JSON.stringified by the sender). Apply the `|`
  // check to the stringified form of remaining primitives as defense in
  // depth against future schema additions.
  for (const [key, value] of Object.entries(payload)) {
    if (key === "signature" || key === "response_signature_string") continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") return false;
    if (String(value).includes("|")) return false;
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
  /**
   * Pro tier duration — required. Embedded in `merchant_data` so the webhook
   * handler can validate `amount` against the correct cycle price. Omitting
   * it lets a tampered webhook silently slip a yearly payment through with a
   * monthly amount check (or vice versa).
   */
  duration: ProDuration;
  returnUrl?: string;
}): Promise<CheckoutResult | CheckoutError> {
  const { merchantId, secretKey, baseUrl } = config.flitt;
  if (!merchantId || !secretKey) {
    return { ok: false, error: "Flitt is not configured" };
  }

  const orderId = buildSubscriptionOrderId(params.figmaUserId);
  const amount = getProPriceCents(params.duration);
  const currency = PLAN_PRICES.pro.currency;
  const period = params.duration === "yearly" ? "year" : "month";

  const recurringData = {
    amount,
    period,
    every: 1,
    quantity: 999, // "forever" — user cancels via SubscriptionActions
    state: "shown_readonly",
  };

  // merchant_data round-trips back to us in the webhook so we can map the
  // payment to the correct figmaUserId and validate the amount matches the
  // signed duration. `duration` MUST be included — see H-1 in audit.
  const merchantData = JSON.stringify({
    figmaUserId: params.figmaUserId,
    plan: "pro",
    duration: params.duration,
  });

  // Flitt POSTs `response_url`, which collides with the website's static
  // /checkout/success route (GET-only → 405). Default through an API bridge
  // that 303-redirects to the website; a custom returnUrl still overrides
  // for callers that explicitly opt into a non-bridged destination.
  const apiPublicUrl =
    process.env.API_PUBLIC_URL ?? "https://api.web2wireframe.design";
  const responseUrl =
    sanitizeReturnUrl(params.returnUrl) ??
    `${apiPublicUrl}/api/checkout/success`;
  const callbackUrl = `${apiPublicUrl}/api/webhooks/flitt`;

  const requestParams: Record<string, unknown> = {
    merchant_id: merchantId,
    order_id: orderId,
    amount,
    currency,
    order_desc: getProOrderDescription(params.duration),
    lang: "en",
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
  /**
   * Customer email to prefill on Flitt's checkout and to populate the
   * portal's "Customer email" column. When provided, Flitt also fires
   * its own receipt email. Optional — when missing (anonymous plugin
   * checkout before website OAuth), the field is omitted and the request
   * behaves identically to the pre-email release. Empty string is treated
   * as absent to defend against accidental "" passthrough from upstream.
   */
  senderEmail?: string;
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

  // Flitt POSTs `response_url`, which collides with the website's static
  // /checkout/success route (GET-only → 405). Default through an API bridge
  // that 303-redirects to the website; a custom returnUrl still overrides
  // for callers that explicitly opt into a non-bridged destination.
  const apiPublicUrl =
    process.env.API_PUBLIC_URL ?? "https://api.web2wireframe.design";
  const responseUrl =
    sanitizeReturnUrl(params.returnUrl) ??
    `${apiPublicUrl}/api/checkout/success`;
  const callbackUrl = `${apiPublicUrl}/api/webhooks/flitt`;

  const requestParams: Record<string, unknown> = {
    merchant_id: merchantId,
    order_id: orderId,
    amount,
    currency,
    order_desc: getProOrderDescription(duration),
    lang: "en",
    server_callback_url: callbackUrl,
    response_url: responseUrl,
    merchant_data: merchantData,
  };

  // sender_email — only include when truthy. flittSign() already drops
  // empty/null values, but being explicit here keeps the signed payload
  // shape obvious to anyone reading the request body in network logs.
  if (params.senderEmail) {
    requestParams.sender_email = params.senderEmail;
  }

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

// `cancelSubscription` (Flitt SubscriptionActions stop) and `CancelResult` /
// `CancelError` types were removed (P2-#11). Web2Wireframe ships one-time
// payments only — no recurring subscriptions to stop. The
// `/api/subscription/cancel` route that consumed this helper was deleted in
// the same change; the website "Cancel" UI was already dropped in commit
// 11ff22f. If subscriptions are reintroduced later, restore from git
// history rather than re-deriving — Flitt's signing canonicalization is
// subtle enough that a fresh implementation would risk reintroducing the
// C-1 class of bug.
