/**
 * E2E Webhook Pipeline Test
 *
 * What it does:
 *   - POSTs synthetic, properly-signed Flitt webhooks to a running API
 *   - Verifies license state in MongoDB via /api/license/by-token
 *   - Covers the 7 PRE-LAUNCH §6 scenarios end-to-end
 *
 * What it does NOT do:
 *   - Talk to Flitt's real sandbox (we'd need a public callback URL)
 *   - Touch real card data
 *
 * Required env:
 *   FLITT_SECRET_KEY   — same key the running API uses (signature must match)
 *   AUTH_SECRET        — used to mint cancel tokens for /api/license/by-token
 *   E2E_API_URL        — default: http://localhost:3002
 *   E2E_RESET          — when "true", deletes the test user's license before each scenario
 *
 * Usage:
 *   pnpm --filter @w2w/api test:e2e:flitt
 *
 * Exit code:
 *   0 = all scenarios passed
 *   1 = any scenario failed (details printed to stderr)
 */
import { flittSign } from "../src/services/flittService.js";
import { signToken } from "../src/middleware/auth.js";
import { PLAN_PRICES } from "../src/models/License.js";

const API = process.env.E2E_API_URL ?? "http://localhost:3002";
const SECRET = process.env.FLITT_SECRET_KEY;
const AUTH = process.env.AUTH_SECRET;
const SHOULD_RESET = process.env.E2E_RESET === "true";

if (!SECRET) {
  console.error(
    "[e2e] FLITT_SECRET_KEY is required. Set it to the same value the running API uses.",
  );
  process.exit(2);
}
if (!AUTH) {
  console.error(
    "[e2e] AUTH_SECRET is required. Set it to the same value the running API uses (for license reads).",
  );
  process.exit(2);
}

const PASS = "✓";
const FAIL = "✗";
let failures = 0;

function uniqueUserId(scenario: string): string {
  // Per-scenario user so retries don't interfere; timestamp keeps it unique
  // across runs of this script.
  return `e2e_${scenario}_${Date.now()}`;
}

function buildOrderId(figmaUserId: string): string {
  const safe = figmaUserId.replace(/[^A-Za-z0-9_-]/g, "");
  return `w2w_pro_${safe}_${Date.now()}`;
}

interface WebhookFields {
  order_id: string;
  order_status: string;
  amount: number;
  currency?: string;
  payment_id?: string;
  sender_email?: string;
  merchant_data: string;
  parent_order_id?: string;
}

async function postWebhook(fields: WebhookFields): Promise<Response> {
  const params: Record<string, unknown> = {
    order_id: fields.order_id,
    order_status: fields.order_status,
    amount: fields.amount,
    currency: fields.currency ?? "USD",
    merchant_data: fields.merchant_data,
    ...(fields.payment_id ? { payment_id: fields.payment_id } : {}),
    ...(fields.sender_email ? { sender_email: fields.sender_email } : {}),
    ...(fields.parent_order_id
      ? { parent_order_id: fields.parent_order_id }
      : {}),
  };
  const signature = flittSign(params, SECRET!);
  return fetch(`${API}/api/webhooks/flitt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, signature }),
  });
}

interface License {
  plan: "free" | "pro";
  status: "active" | "canceled" | "expired";
  cycleEndsAt: string;
  subscription: {
    flittOrderId: string;
    autoRenew: boolean;
    failureCount: number;
  } | null;
}

async function readLicense(figmaUserId: string): Promise<License> {
  const token = signToken(figmaUserId, AUTH!, 5 * 60);
  const res = await fetch(`${API}/api/license/by-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ figmaUserId, token }),
  });
  if (!res.ok) {
    throw new Error(`/by-token failed: HTTP ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as License;
}

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
  } else {
    failures += 1;
    console.error(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ============================================================================
// Scenarios
// ============================================================================

async function s1_firstPurchase(): Promise<void> {
  const figmaUserId = uniqueUserId("s1");
  const orderId = buildOrderId(figmaUserId);
  console.log(`\n[s1] First one-time purchase → Pro 30 days (user=${figmaUserId})`);

  const res = await postWebhook({
    order_id: orderId,
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });

  check("webhook returns 200", res.status === 200, `got ${res.status}`);

  const lic = await readLicense(figmaUserId);
  check("plan is pro", lic.plan === "pro", `got ${lic.plan}`);
  check("status is active", lic.status === "active");
  check("subscription.autoRenew is false (one-time)", lic.subscription?.autoRenew === false);
  check(
    "cycleEndsAt is ~30 days out",
    daysFromNow(lic.cycleEndsAt) >= 29 && daysFromNow(lic.cycleEndsAt) <= 31,
    `actual=${daysFromNow(lic.cycleEndsAt)}d`,
  );
}

async function s2_earlyRenew(): Promise<void> {
  const figmaUserId = uniqueUserId("s2");
  console.log(`\n[s2] Early renew stacks days (user=${figmaUserId})`);

  // First purchase
  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s2a_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const first = await readLicense(figmaUserId);
  const firstEnd = new Date(first.cycleEndsAt).getTime();

  // Early renew (still Pro)
  await new Promise((r) => setTimeout(r, 1100));
  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s2b_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const second = await readLicense(figmaUserId);
  const secondEnd = new Date(second.cycleEndsAt).getTime();

  const addedDays = Math.round((secondEnd - firstEnd) / (24 * 3600 * 1000));
  check("renew added ~30 days on top of remaining", addedDays >= 29 && addedDays <= 31, `added=${addedDays}d`);
}

async function s3_declinedNoPro(): Promise<void> {
  const figmaUserId = uniqueUserId("s3");
  console.log(`\n[s3] Declined webhook does NOT grant Pro (user=${figmaUserId})`);

  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "declined",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s3_${Date.now()}`,
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const lic = await readLicense(figmaUserId);
  check("plan stays free", lic.plan === "free", `got ${lic.plan}`);
}

async function s4_duplicateDeduped(): Promise<void> {
  const figmaUserId = uniqueUserId("s4");
  const orderId = buildOrderId(figmaUserId);
  const paymentId = `pay_s4_${Date.now()}`;
  console.log(`\n[s4] Duplicate webhook (same payment_id) is deduped (user=${figmaUserId})`);

  const first = await postWebhook({
    order_id: orderId,
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: paymentId,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  check("first webhook 200", first.status === 200);

  const second = await postWebhook({
    order_id: orderId,
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: paymentId,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const secondBody = (await second.json()) as { deduped?: boolean };
  check("second webhook deduped", secondBody.deduped === true);
}

async function s5_amountTamperRejected(): Promise<void> {
  const figmaUserId = uniqueUserId("s5");
  console.log(`\n[s5] Tampered amount → no Pro granted (user=${figmaUserId})`);

  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: 1, // 1 cent instead of 1600 — must be rejected
    payment_id: `pay_s5_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const lic = await readLicense(figmaUserId);
  check("plan stays free (amount tamper rejected)", lic.plan === "free", `got ${lic.plan}`);
}

async function s6_reversedRevokesPro(): Promise<void> {
  const figmaUserId = uniqueUserId("s6");
  const orderId = buildOrderId(figmaUserId);
  console.log(`\n[s6] Reversed (refund) revokes Pro (user=${figmaUserId})`);

  await postWebhook({
    order_id: orderId,
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s6a_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const beforeReversal = await readLicense(figmaUserId);
  check("Pro before reversal", beforeReversal.plan === "pro");

  await postWebhook({
    order_id: orderId,
    order_status: "reversed",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s6b_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const afterReversal = await readLicense(figmaUserId);
  check("Free after reversal", afterReversal.plan === "free", `got ${afterReversal.plan}`);
}

async function s7_signatureFailureNoTouch(): Promise<void> {
  const figmaUserId = uniqueUserId("s7");
  const orderId = buildOrderId(figmaUserId);
  console.log(`\n[s7] Bad signature → no state change, still 200 (user=${figmaUserId})`);

  const params = {
    order_id: orderId,
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s7_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  };
  // Sign with WRONG secret
  const wrongSignature = flittSign(params, "wrong-secret-key");
  const res = await fetch(`${API}/api/webhooks/flitt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, signature: wrongSignature }),
  });
  check("returns 200 even on bad sig (no Flitt retry storm)", res.status === 200);

  const lic = await readLicense(figmaUserId);
  check("plan stays free (bad sig rejected)", lic.plan === "free");
}

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log(`E2E Flitt Webhook Suite — API=${API}`);
  console.log(`SHOULD_RESET=${SHOULD_RESET}`);

  // Smoke test: API is reachable
  try {
    const ping = await fetch(`${API}/api/health`);
    if (!ping.ok) {
      console.error(`[e2e] /api/health failed: ${ping.status}`);
      process.exit(2);
    }
  } catch (err) {
    console.error(`[e2e] Cannot reach ${API} — is the API running?`, err);
    process.exit(2);
  }

  await s1_firstPurchase();
  await s2_earlyRenew();
  await s3_declinedNoPro();
  await s4_duplicateDeduped();
  await s5_amountTamperRejected();
  await s6_reversedRevokesPro();
  await s7_signatureFailureNoTouch();

  console.log(`\n${"─".repeat(60)}`);
  if (failures === 0) {
    console.log(`${PASS} All 7 scenarios passed`);
    process.exit(0);
  } else {
    console.error(`${FAIL} ${failures} assertion(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[e2e] fatal:", err);
  process.exit(2);
});
