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
import mongoose from "mongoose";
import { flittSign } from "../src/services/flittService.js";
import { signToken } from "../src/middleware/auth.js";
import { License, PLAN_PRICES } from "../src/models/License.js";

const API = process.env.E2E_API_URL ?? "http://localhost:3002";
const SECRET = process.env.FLITT_SECRET_KEY;
const AUTH = process.env.AUTH_SECRET;
const SHOULD_RESET = process.env.E2E_RESET === "true";
// When running from host (not inside docker), MONGODB_URI's "mongo" hostname
// is unreachable; rewrite to localhost. The test container path is unused
// today but kept reachable for future-proofing.
const RAW_MONGO_URI =
  process.env.E2E_MONGODB_URI ??
  process.env.MONGODB_URI ??
  "mongodb://localhost:27017/web2wireframe";
const MONGO_URI = RAW_MONGO_URI.replace("@mongo:", "@localhost:").replace(
  "//mongo:",
  "//localhost:",
);

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

async function s8_yearlyFirstPurchase(): Promise<void> {
  const figmaUserId = uniqueUserId("s8");
  const orderId = buildOrderId(figmaUserId);
  console.log(`\n[s8] Yearly first purchase → Pro 365 days (user=${figmaUserId})`);

  const res = await postWebhook({
    order_id: orderId,
    order_status: "approved",
    amount: PLAN_PRICES.pro.yearlyPriceCents,
    payment_id: `pay_s8_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({
      figmaUserId,
      plan: "pro",
      recurring: false,
      duration: "yearly",
    }),
  });
  check("webhook returns 200", res.status === 200, `got ${res.status}`);

  const lic = await readLicense(figmaUserId);
  check("plan is pro", lic.plan === "pro", `got ${lic.plan}`);
  check(
    "cycleEndsAt is ~365 days out",
    daysFromNow(lic.cycleEndsAt) >= 364 && daysFromNow(lic.cycleEndsAt) <= 366,
    `actual=${daysFromNow(lic.cycleEndsAt)}d`,
  );
}

async function s9_yearlyEarlyRenew(): Promise<void> {
  const figmaUserId = uniqueUserId("s9");
  console.log(`\n[s9] Yearly early renew stacks ~365 days (user=${figmaUserId})`);

  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.yearlyPriceCents,
    payment_id: `pay_s9a_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({
      figmaUserId,
      plan: "pro",
      recurring: false,
      duration: "yearly",
    }),
  });
  const first = await readLicense(figmaUserId);
  const firstEnd = new Date(first.cycleEndsAt).getTime();

  await new Promise((r) => setTimeout(r, 1100));
  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.yearlyPriceCents,
    payment_id: `pay_s9b_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({
      figmaUserId,
      plan: "pro",
      recurring: false,
      duration: "yearly",
    }),
  });
  const second = await readLicense(figmaUserId);
  const secondEnd = new Date(second.cycleEndsAt).getTime();

  const addedDays = Math.round((secondEnd - firstEnd) / (24 * 3600 * 1000));
  check(
    "yearly renew added ~365 days on top of remaining",
    addedDays >= 364 && addedDays <= 366,
    `added=${addedDays}d`,
  );
}

async function s10_yearlyPayloadMonthlyAmount(): Promise<void> {
  const figmaUserId = uniqueUserId("s10");
  console.log(`\n[s10] Tier mismatch — yearly merchant_data + monthly $16 → reject (user=${figmaUserId})`);

  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents, // $16 — monthly amount
    payment_id: `pay_s10_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({
      figmaUserId,
      plan: "pro",
      recurring: false,
      duration: "yearly", // but claims yearly
    }),
  });
  const lic = await readLicense(figmaUserId);
  check(
    "plan stays free (yearly payload paying monthly is rejected)",
    lic.plan === "free",
    `got ${lic.plan}`,
  );
}

async function expireLicense(figmaUserId: string): Promise<void> {
  // Direct DB mutation: shift cycleEndsAt to 2 days ago so lazy-downgrade
  // fires on the next read. No public API exposes this — tests own it.
  const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await License.updateOne(
    { figmaUserId },
    { $set: { cycleEndsAt: past } },
  );
}

async function s12_lazyDowngradeExpiredPro(): Promise<void> {
  const figmaUserId = uniqueUserId("s12");
  console.log(`\n[s12] Expired one-time Pro lazy-downgrades on read (user=${figmaUserId})`);

  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s12_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const beforeExpiry = await readLicense(figmaUserId);
  check("Pro before expiry", beforeExpiry.plan === "pro");

  await expireLicense(figmaUserId);

  const afterExpiry = await readLicense(figmaUserId);
  check(
    "plan auto-downgrades to free on read",
    afterExpiry.plan === "free",
    `got ${afterExpiry.plan}`,
  );
  check(
    "fresh free cycle started (~30 days out)",
    daysFromNow(afterExpiry.cycleEndsAt) >= 29 && daysFromNow(afterExpiry.cycleEndsAt) <= 31,
    `actual=${daysFromNow(afterExpiry.cycleEndsAt)}d`,
  );
}

async function s13_expiredRenewStartsFresh(): Promise<void> {
  const figmaUserId = uniqueUserId("s13");
  console.log(`\n[s13] Renew after expiry starts fresh (no stacked days) (user=${figmaUserId})`);

  // First purchase
  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s13a_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });

  // Expire it directly
  await expireLicense(figmaUserId);

  // Reading triggers lazy-downgrade — but that's OK, the next webhook
  // should grant a fresh Pro cycle from now.
  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.priceCents,
    payment_id: `pay_s13b_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({ figmaUserId, plan: "pro", recurring: false }),
  });
  const renewed = await readLicense(figmaUserId);
  check("plan back to pro after renew", renewed.plan === "pro", `got ${renewed.plan}`);
  check(
    "cycleEndsAt is ~30 days from now (not stacked)",
    daysFromNow(renewed.cycleEndsAt) >= 29 && daysFromNow(renewed.cycleEndsAt) <= 31,
    `actual=${daysFromNow(renewed.cycleEndsAt)}d`,
  );
}

async function s11_monthlyPayloadYearlyAmount(): Promise<void> {
  const figmaUserId = uniqueUserId("s11");
  console.log(`\n[s11] Tier mismatch — monthly merchant_data + yearly $144 → reject (user=${figmaUserId})`);

  await postWebhook({
    order_id: buildOrderId(figmaUserId),
    order_status: "approved",
    amount: PLAN_PRICES.pro.yearlyPriceCents, // $144 — yearly amount
    payment_id: `pay_s11_${Date.now()}`,
    sender_email: "e2e@example.com",
    merchant_data: JSON.stringify({
      figmaUserId,
      plan: "pro",
      recurring: false,
      duration: "monthly", // but paying yearly
    }),
  });
  const lic = await readLicense(figmaUserId);
  check(
    "plan stays free (monthly payload overpaying is rejected)",
    lic.plan === "free",
    `got ${lic.plan}`,
  );
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
  await s8_yearlyFirstPurchase();
  await s9_yearlyEarlyRenew();
  await s10_yearlyPayloadMonthlyAmount();
  await s11_monthlyPayloadYearlyAmount();

  // s12/s13 mutate License rows directly — need a mongoose connection
  console.log(`\n[setup] Connecting to MongoDB at ${MONGO_URI.replace(/:\/\/[^@]+@/, "://***@")}`);
  await mongoose.connect(MONGO_URI);

  try {
    await s12_lazyDowngradeExpiredPro();
    await s13_expiredRenewStartsFresh();
  } finally {
    await mongoose.disconnect();
  }

  console.log(`\n${"─".repeat(60)}`);
  if (failures === 0) {
    console.log(`${PASS} All 13 scenarios passed`);
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
