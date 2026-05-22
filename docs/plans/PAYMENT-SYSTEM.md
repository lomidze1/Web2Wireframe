# Payment System Implementation Plan

**Status:** ✅ Implemented — launch ships the one-time $16 / 30-day model. Native recurring subscription code is complete but parked at the route level until Flitt grants subscription access.
**Last updated:** 2026-05-18
**Provider:** Flitt (Georgia/CIS PCI-DSS Level 1 gateway) — exclusive, no fallback providers.

---

## 1. Goals

Build a complete payment, subscription, and licensing system for the Web2Wireframe Figma plugin:
- 2 plan tiers (Free, Pro) with monthly billing
- Auto-renewal via Flitt native subscriptions
- Limit enforcement on imports (URL + Screenshot + HTML + Browser Extension)
- No user registration — Figma user ID is the identity
- 100% PCI compliance — card data never touches our servers

> **Launch model (2026-05-18):** the checkout route ships **one-time $16 / 30-day**
> purchases (`createOneTimeCheckout`). The native-subscription path described below
> (`createSubscriptionCheckout`, `subscription: "Y"`) is fully implemented and tested
> but disabled at the route level — re-enabled when Flitt grants subscription access.
> The webhook handler and License model already support both paths.

---

## 2. Final Decisions (User-Approved 2026-05-04)

### 2.1 Plans

| Plan | Imports/month | Price (USD) | Cycle |
|------|---------------|-------------|-------|
| Free | 10            | $0          | —     |
| Pro Monthly | unlimited | $16     | 30 days |
| Pro Yearly  | unlimited | $144    | 365 days (25% off vs monthly) |

**Pricing rationale:** $16 monthly covers Flitt's 4% commission (net ≈ $15.36) — round whole-dollar pricing for simplicity. $144 yearly = 25% discount vs 12×$16 ($192), matches h2d's annual discount, encourages commitment. Both tiers are **one-time payments** (no subscription) — renewal stacks days. Indie SaaS launch posture: no VAT collection at launch (see §2.7).

### 2.2 Counter Semantics

- **Imports counter** increments on: URL import, Screenshot import, HTML import, Browser Extension capture
- Screenshot uses Anthropic AI internally but **counts as 1 regular import** (single billing rule)
- AI Generation feature is **NOT in launch scope** (code is on `ai-generation-backup` branch)
- **Counters reset monthly** via lazy reset: when API is hit and `now >= cycleEndsAt`, advance `cycleStartedAt = now` and `cycleEndsAt = now + 30d`, reset `usage.imports = 0`. No cron job required.

### 2.3 User Identity

- **NO registration, NO login**
- `figmaUserId` = `figma.currentUser.id` (Figma SDK)
- Email collected **only at Flitt checkout** (receipt/recovery only) — written to License via webhook
- `figmaUserId` is the primary key; email is metadata only

### 2.4 Recurring Strategy — ⚠️ parked at launch

> Launch ships one-time purchases (see §1 launch-model note). The points below
> describe the parked recurring path, kept for when Flitt subscriptions are enabled.

- Flitt native subscriptions (`subscription: "Y"` + `recurring_data`)
- Flitt charges automatically — no custom cron job for charging
- We listen to webhook events
- Cancel via Flitt API: `SubscriptionActions({ order_id, action: "stop" })`

### 2.5 Cancel Behavior

- **End-of-period cancel** (Spotify/Netflix model)
- User cancels → `subscription.canceledAt = now`, but `plan` remains `"pro"` and `status` becomes `"canceled"` until `cycleEndsAt`
- After `cycleEndsAt`: nightly check downgrades to `plan: "free"`, `status: "active"`, `subscription: null`

### 2.6 Refund Policy

- **No refunds.** Cancel-anytime — billing stops at next cycle.
- Documented in Terms & Conditions before checkout.
- Edge cases (chargebacks, fraud) handled manually via Flitt dashboard.

### 2.7 Tax / VAT

- **Flat $16 globally**, no VAT collection at launch.
- Terms disclaimer: *"Prices are exclusive of any local taxes (e.g. VAT) for which you may be responsible in your jurisdiction."*
- Privacy page: note non-EU based seller, customer is responsible for own jurisdiction taxes.
- **Re-evaluate:** if EU revenue exceeds ~$30K/year, register for EU VAT MOSS or move to Merchant-of-Record (revisit decision; Flitt is NOT MoR).

### 2.8 Currency

- Charge in USD only (global plugin audience).

### 2.9 Trial Period

- **No trial.** Free tier IS the trial: 10 imports/month forever.
- Plan transitions: `free` → `pro` (after Flitt checkout webhook approves).

### 2.10 Quota-Exceeded UX

- **Hard block** when Free user hits 10/10.
- Modal: *"You've used 10/10 free imports this month. Upgrade to Pro for unlimited imports."*
- Two CTAs: `Get Pro` (→ Flitt checkout) and `Maybe later` (closes modal).

### 2.11 Admin Tooling

- **Minimal API only** for launch (no admin UI).
- Protected with `ADMIN_TOKEN` Bearer:
  - `GET  /api/admin/license/:figmaUserId` — lookup
  - `POST /api/admin/license/override` — set plan/status manually
  - `GET  /api/admin/license/lookup-by-email` — find license by email
- Invoked via `curl` from operator machine.

---

## 3. Architecture

### 3.1 Data Flow — Subscription Purchase

```
┌─────────────────┐
│ Figma Plugin    │ User hits 11th import OR clicks "Upgrade" in Plan modal
│ (Preact UI)     │
└────────┬────────┘
         │ figmaUserId = figma.currentUser.id (already in context)
         │ POST /api/checkout/create
         │ { plan: "pro", figmaUserId }
         ▼
┌─────────────────┐
│ API (Express)   │ flittService.createSubscriptionCheckout(...)
│ /checkout/create│ → POST pay.flitt.com/api/checkout/url
│                 │   { merchant_id, order_id, amount: 1600,
│                 │     currency: "USD", subscription: "Y",
│                 │     recurring_data, server_callback_url,
│                 │     response_url, signature }
└────────┬────────┘
         │ Returns { checkoutUrl: "pay.flitt.com/...", orderId }
         ▼
┌─────────────────┐
│ Plugin opens    │ window.open(checkoutUrl) in browser tab
│ checkoutUrl     │ + plugin starts polling /api/license/me every 5s
└────────┬────────┘
         ▼
┌─────────────────┐
│ Flitt Hosted    │ User enters email + card → 3DS → approved
│ Checkout Page   │
└────────┬────────┘
         │
         ├─────► response_url (browser redirect)
         │       https://web2wireframe.design/checkout/success
         │
         └─────► server_callback_url (server-to-server)
                 https://api.web2wireframe.design/api/webhooks/flitt
                 ▼
┌─────────────────┐
│ API Webhook     │ verifySignature(payload)
│ /webhooks/flitt │ if order_status === "approved":
│                 │   parse merchant_data → { figmaUserId, plan }
│                 │   License.upsert({
│                 │     figmaUserId, email,
│                 │     plan: "pro", status: "active",
│                 │     cycleStartedAt: now, cycleEndsAt: now+30d,
│                 │     subscription: { flittOrderId, activatedAt,
│                 │                     nextBillingAt: now+30d } })
│                 │ Return HTTP 200
└─────────────────┘

┌─────────────────┐
│ Plugin polls    │ GET /api/license/me?figmaUserId=<ID>
│ every 5s after  │ → { plan: "pro", ... }
│ checkout opens  │ Stop polling, refresh UI, show success toast
│ (max 5 minutes) │
└─────────────────┘
```

### 3.2 Data Flow — Recurring Charge (Flitt-initiated)

```
Day 30:
┌─────────────┐
│   Flitt     │ Auto-charges saved card (handled by Flitt, not us)
└──────┬──────┘
       │ POST /api/webhooks/flitt
       │ { order_id: "w2w_pro_<fid>_<ts>",
       │   parent_order_id: <original>,
       │   order_status: "approved",
       │   merchant_data: '{"figmaUserId":"123","plan":"pro"}',
       │   actual_amount: 1600, currency: "USD" }
       ▼
┌─────────────┐
│ API Webhook │ Find license by figmaUserId
│             │ subscription.nextBillingAt += 30 days
│             │ subscription.lastChargeAt = now
│             │ cycleStartedAt = now, cycleEndsAt = now + 30d
│             │ usage.imports = 0  (new cycle)
│             │ HTTP 200
└─────────────┘
```

### 3.3 Data Flow — Cancel

```
┌─────────────────┐
│ Plugin Settings │ User clicks "Manage Subscription"
└────────┬────────┘
         │ Plugin sandbox generates signedToken =
         │   HMAC-SHA256({figmaUserId, exp: now+5min}, AUTH_SECRET)
         │ window.open("https://web2wireframe.design/account?fid=<ID>&t=<token>")
         ▼
┌─────────────────┐
│ Web Account     │ Verify signed token (call API to validate)
│ (Account.tsx)   │ Display: plan, next billing date, "Cancel" button
└────────┬────────┘
         │ User clicks Cancel
         │ POST /api/subscription/cancel
         │ { figmaUserId, token }
         ▼
┌─────────────────┐
│ API             │ Verify token (HMAC + expiry)
│ /sub/cancel     │ flittService.cancelSubscription(orderId)
│                 │ → POST pay.flitt.com/api/recurring/
│                 │   { request: { merchant_id, order_id,
│                 │     action: "stop", signature } }
│                 │ License.subscription.canceledAt = now
│                 │ License.status = "canceled"
│                 │ (plan stays "pro" until cycleEndsAt)
└─────────────────┘
```

### 3.4 Data Flow — Cancel Cleanup (lazy)

```
On every License read:
  if status === "canceled" AND now >= cycleEndsAt:
    plan = "free"
    status = "active"
    subscription = null
    cycleStartedAt = now
    cycleEndsAt = now + 30d
    usage.imports = 0
    save()
```

No cron required — runs whenever the user (or webhook) touches their license.

---

## 4. Database Schema (Mongoose)

```typescript
// packages/api/src/models/License.ts

import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema({
  flittOrderId:     { type: String, required: true },     // original subscription order_id
  activatedAt:      { type: Date, required: true },
  nextBillingAt:    { type: Date, required: true },
  canceledAt:       { type: Date, default: null },        // soft-cancel — active until cycleEndsAt
  lastChargeAt:     { type: Date, default: null },
  lastFailedAt:     { type: Date, default: null },
  failureCount:     { type: Number, default: 0 },
}, { _id: false });

const UsageSchema = new mongoose.Schema({
  imports:          { type: Number, default: 0 },
  periodStartedAt:  { type: Date, required: true },
}, { _id: false });

const LicenseSchema = new mongoose.Schema({
  figmaUserId:      { type: String, required: true, unique: true, index: true },
  email:            { type: String, default: null, index: true },  // from Flitt checkout

  plan:             { type: String, enum: ["free", "pro"], default: "free" },
  status:           { type: String, enum: ["active", "canceled", "expired"], default: "active" },

  cycleStartedAt:   { type: Date, required: true, default: Date.now },
  cycleEndsAt:      { type: Date, required: true },

  usage:            { type: UsageSchema, required: true },
  subscription:     { type: SubscriptionSchema, default: null },  // null for Free plan

  createdAt:        { type: Date, default: Date.now },
  updatedAt:        { type: Date, default: Date.now },
});

LicenseSchema.pre("save", function () { this.updatedAt = new Date(); });
LicenseSchema.index({ "subscription.nextBillingAt": 1 });
LicenseSchema.index({ cycleEndsAt: 1 });
```

### 4.1 Plan Limits (constants)

```typescript
// packages/api/src/services/licenseService.ts

export const PLAN_LIMITS = {
  free: { imports: 10 },
  pro:  { imports: Infinity },
} as const;

export const PLAN_PRICES = {
  pro: { priceCents: 1600, period: "month", currency: "USD" },
} as const;
// NOTE (2026-05-22): superseded by tier-aware helpers in
// packages/api/src/models/License.ts — see getProPriceCents() /
// getProDurationMs() / getProOrderDescription(). Monthly = 1600c / 30d,
// yearly = 14400c / 365d. The flat fields above remain for legacy
// callers but new code should use the tier-aware helpers.
```

### 4.2 Webhook Idempotency

- **Idempotency key:** Flitt's `transaction_id` (or `order_id` + `order_status` if no tx_id).
- New collection `WebhookEvent`:
  ```typescript
  { transactionId: string (unique), orderId, processedAt, payloadHash }
  ```
- On webhook receipt: insert; if duplicate key error → no-op return 200.

---

## 5. API Endpoints

### 5.1 License

```
GET /api/license/me?figmaUserId=<ID>
  Public (figmaUserId itself is the proof — adequate for read-only license info)
  Response: {
    plan, status,
    limits: { imports },
    usage: { imports, remaining },
    cycleStartedAt, cycleEndsAt,
    subscription: { nextBillingAt, canceledAt } | null
  }

POST /api/license/use-import
  Auth: HMAC-signed token (plugin Bearer)
  Body: { figmaUserId }
  Behavior:
    - resetCycleIfElapsed()
    - if usage.imports < limits.imports: increment, save, return { ok: true, remaining }
    - else: return 403 { error: "limit_exceeded", upgradeUrl }
  Response: { ok: true, remaining: number } | 403 { error: "limit_exceeded" }

POST /api/admin/license/override
  Auth: ADMIN_TOKEN Bearer
  Body: { figmaUserId, plan?, status?, cycleEndsAt?, email? }
  Use: dev/support overrides (no UI, curl-driven)

GET /api/admin/license/:figmaUserId
  Auth: ADMIN_TOKEN

GET /api/admin/license/lookup-by-email?email=<...>
  Auth: ADMIN_TOKEN
```

### 5.2 Checkout

```
POST /api/checkout/create
  Public (figmaUserId in body validates ownership — Flitt redirects to user's browser)
  Body: { figmaUserId, returnUrl?: string }
  Response: { checkoutUrl: string, orderId: string }

POST /api/webhooks/flitt
  Auth: SHA1 signature verified from body.signature
  Body: full Flitt callback payload
  Behavior:
    - verifySignature → if invalid: log + return 200 (don't trigger Flitt retries)
    - check WebhookEvent dedup → if duplicate: return 200
    - parse merchant_data → { figmaUserId, plan }
    - if order_status === "approved":
        if parent_order_id: recurring renewal — extend cycle, reset usage
        else: initial activation — License.upsert plan=pro, active
    - if order_status === "declined" / "expired":
        increment subscription.failureCount, set lastFailedAt
        (Flitt handles retry schedule: 2s/60s/5min/10min/1h/24h)
    - if order_status === "reversed" / "refund":
        log, future: trigger downgrade
  Response: HTTP 200 always (return early on invalid sig)

POST /api/subscription/cancel
  Auth: HMAC-verified signedToken (plugin-generated, 5min TTL)
  Body: { figmaUserId, token }
  Behavior:
    - Verify token (HMAC + expiry)
    - flittService.cancelSubscription(license.subscription.flittOrderId)
    - License.subscription.canceledAt = now
    - License.status = "canceled"
  Response: { ok: true, accessUntil: cycleEndsAt }
```

---

## 6. Implementation Phases (TDD-First)

> **Status (2026-05-18): all phases 0–12 implemented.** The Phase 0 blocker is
> resolved — plugin identity is Figma OAuth-verified. The breakdown below is
> retained as a build record.

### Phase 0 — `figma.currentUser.id` plumbing ⚠️ PRIMARY BLOCKER

**Goal:** Make figmaUserId available throughout plugin code.

**Files:**
- `packages/figma-plugin/src/main.ts` — read `figma.currentUser.id`, `emit('FIGMA_USER_ID', id)` to UI
- `packages/figma-plugin/src/ui/App.tsx` — listen for event, store in context
- `packages/figma-plugin/src/ui/shared/ConfigContext.tsx` — add `figmaUserId` field
- `packages/figma-plugin/src/ui/shared/licenseClient.ts` — pass figmaUserId in queries
- All API callers that need licensing (Web.tsx, Screenshot.tsx, HTML.tsx, BrowserExtension.tsx)

**Tests:**
- `figmaUserId.test.ts` — sandbox→UI message handling
- Mock `figma.currentUser` in setup

### Phase 1 — License model schema migration

**Files:**
- `packages/api/src/models/License.ts` — new schema (above)
- `packages/api/__tests__/license-model.test.ts` — schema validation, defaults, indexes

**Migration:** existing test/dev licenses can be dropped (no production data yet).

**Cleanup:** remove `LicensePlan = "free" | "plus" | "pro"` from `packages/shared/src/types.ts` → `["free", "pro"]`. Remove `["Free", "Plus", "Pro"]` enums from `packages/api/src/middleware/validation.ts`, `packages/api/src/config/website-types.ts`, `packages/api/src/services/planService.ts`. Update `packages/web/src/pages/Terms&conditions/Terms.tsx` "Free, Plus, or Pro" → "Free or Pro".

### Phase 2 — License service

**Files:**
- `packages/api/src/services/licenseService.ts` (new):
  - `getOrCreate(figmaUserId)` — auto-create Free license on first read
  - `useImport(figmaUserId)` — increment + enforce monthly limit
  - `resetCycleIfElapsed(license)` — lazy reset
  - `applySubscriptionActivation({figmaUserId, email, flittOrderId})`
  - `applyRecurringCharge({figmaUserId, parentOrderId})`
  - `applySubscriptionCancel({figmaUserId})`
  - `cleanupExpiredCancellations(license)` — lazy downgrade on read
- `packages/api/__tests__/license-service.test.ts` — full unit coverage with `vi.useFakeTimers()`

### Phase 3 — License routes refactor

**Files:**
- `packages/api/src/routes/license/index.ts` — refactor with figmaUserId param, delegate to service
- `packages/api/__tests__/license-routes.test.ts` — supertest integration

**Remove:** AI-related routes (`use-ai`), credit pack routes if any.

### Phase 4 — Flitt service

**Files:**
- `packages/api/src/services/flittService.ts` (new):
  - `flittSign(params, secretKey)` — SHA1, alphabetically sorted, joined with `|`, prefixed with secret
  - `verifyCallback(payload, secretKey)` — webhook signature verification
  - `createSubscriptionCheckout({figmaUserId, returnUrl})` → `{ checkoutUrl, orderId }`
  - `cancelSubscription(orderId)` → success/failure
- `packages/api/__tests__/flitt-service.test.ts`:
  - Signature algorithm correctness (test vectors from Flitt docs in memory)
  - Webhook signature verification (positive + negative + tampered)
  - Mock fetch for Flitt API calls
  - merchant_data JSON serialization
  - order_id format: `w2w_pro_<figmaUserId>_<ts>` (must be unique)

### Phase 5 — Checkout & webhook routes

**Files:**
- `packages/api/src/routes/checkout/index.ts` (new):
  - `POST /api/checkout/create`
  - `POST /api/webhooks/flitt`
  - `POST /api/subscription/cancel`
- `packages/api/src/models/WebhookEvent.ts` (new) — idempotency dedup
- `packages/api/__tests__/checkout-routes.test.ts`
- `packages/api/__tests__/flitt-webhook.test.ts`:
  - Valid signature → license updated
  - Invalid signature → HTTP 200 + log, no DB change (don't trigger retries)
  - Duplicate `transaction_id` → idempotent no-op
  - Subscription approved → License.upsert plan=pro
  - Recurring charge approved → reset usage, extend nextBillingAt
  - Charge declined → mark subscription.lastFailedAt, increment failureCount

### Phase 6 — Import enforcement

**Files:**
- `packages/api/src/routes/plugin/import.ts` (or wherever URL/HTML import lives) — call `licenseService.useImport(figmaUserId)` BEFORE Puppeteer / processing
- `packages/api/src/routes/plugin/wireframe.ts` — same gating before render endpoint
- Browser extension capture path → `/api/import-w2w` route → also gated
- Screenshot path → also gated
- Tests: gate works, 403 on limit exceeded, plan modal triggers

### Phase 7 — Plugin UI: Plan popup + checkout flow

**Files:**
- `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx`:
  - Replace hardcoded pricing URL with in-plugin checkout trigger
  - `Get Pro` button → `POST /api/checkout/create` → open returned URL in browser tab
  - Start polling `/api/license/me` every 5s for 5 minutes
  - On detect plan=pro → show success toast, refresh UI
- `packages/figma-plugin/src/ui/shared/licenseClient.ts`:
  - Replace hardcoded localhost / DEV_TOKEN with env-driven config
  - Add `createCheckout()`, `cancelSubscription()`
- New: `packages/figma-plugin/src/ui/components/modalPopup/QuotaExceededModal.tsx` — hard block on 11th import
- Tests: button click flow, polling logic, modal rendering

### Phase 8 — Plugin UI: Manage Subscription button

**Files:**
- `packages/figma-plugin/src/ui/components/modalPopup/Settings.tsx` — add Billing section (Pro users only):
  - Plan badge, next billing date, "Manage Subscription" button
- Generate signed token in sandbox: HMAC-SHA256(`{figmaUserId, exp: now+5min}`, AUTH_SECRET)
- `figma.openExternal("https://web2wireframe.design/account?fid=<ID>&t=<token>")` (or use plugin's external-URL helper)

### Phase 9 — Web pages (Checkout, Account, Success/Cancel)

**Files:**
- `packages/web/src/pages/Checkout/CheckoutSuccess.tsx` (new) — "Payment successful, return to Figma" + auto-close button
- `packages/web/src/pages/Checkout/CheckoutCancel.tsx` (new) — "Canceled, you can try again"
- `packages/web/src/pages/Account/Account.tsx` (new) — verify signed token, show plan/billing, Cancel button
- Update `packages/web/src/AppRoutes.tsx` — register new routes
- Update `packages/web/src/data/links.ts` — replace `"#"` with real route paths (Pricing CTA opens checkout in plugin context, not direct link)
- Update `packages/web/src/pages/Pricing/Pricing.tsx` — Free $0 + Pro $16 (already correct, verify)

### Phase 10 — `.env.example` + config

**Files:**
- `.env.example` — add:
  ```
  FLITT_MERCHANT_ID=your_merchant_id
  FLITT_SECRET_KEY=your_secret_key
  FLITT_BASE_URL=https://pay.flitt.com
  WEBSITE_BASE_URL=https://web2wireframe.design
  ```
- `packages/api/src/config/env.ts` — add Flitt vars to env schema (Zod)

### Phase 11 — Privacy/Terms copy update

**Files:**
- `packages/web/src/pages/Privacy/Privacy.tsx`:
  - Add Payment Data section: *"We use Flitt as our payment processor. Card data is processed by Flitt under PCI-DSS Level 1; we never receive or store card details. We retain payment metadata (order ID, amount, status, email) for tax/legal compliance for 7 years per accounting law."*
  - Add Tax Notice: *"Web2Wireframe is operated from outside the EU. Customers are responsible for any local taxes (e.g. VAT) applicable in their jurisdiction. Prices shown are exclusive of such taxes."*
- `packages/web/src/pages/Terms&conditions/Terms.tsx`:
  - Update §8-9 with Flitt-specific language
  - Update §X (refunds): *"All purchases are non-refundable. You may cancel your subscription at any time; cancellation takes effect at the end of the current billing cycle."*
  - Replace "Free, Plus, or Pro" → "Free or Pro"
- `packages/web/src/pages/Docs/pages/PricingPurchase.tsx` — replace placeholders with actual flow description

### Phase 12 — Admin endpoints

**Files:**
- `packages/api/src/routes/admin/license.ts` (new):
  - `GET /api/admin/license/:figmaUserId`
  - `POST /api/admin/license/override`
  - `GET /api/admin/license/lookup-by-email`
- `packages/api/__tests__/admin-routes.test.ts`

---

## 7. Test Strategy

### 7.1 Unit Tests (Vitest)

- `flitt-service.test.ts` — signature, verifyCallback, mocked Flitt API
- `license-service.test.ts` — full state-machine coverage with fake timers
- `webhook-handlers.test.ts` — every order_status path

### 7.2 Integration Tests (supertest)

- Full subscription flow: create checkout → mock Flitt webhook → verify license updated → poll license → confirm plan=pro
- Limit gate: useImport returns 403 when 10/10 reached
- Cancel flow: subscription.canceledAt set, plan stays pro until cycleEndsAt, then auto-downgrades to free
- Recurring renewal: parent_order_id webhook → cycle reset

### 7.3 Manual Verification (Flitt sandbox)

- Use Flitt test merchant credentials
- Real checkout in browser → real webhook to dev tunnel (ngrok) → real license update
- Cancel from plugin → real Flitt API call → confirm via Flitt dashboard
- Wait for renewal (or use Flitt's "fast forward" if available) → verify webhook handles renewal correctly

### 7.4 Security Tests

- Webhook signature verification (positive, negative, tampered, missing)
- Signed token verification (positive, negative, expired)
- Idempotency: duplicate transaction_id is no-op
- No card data in DB or logs (grep for PAN-like patterns)
- Admin endpoints reject without ADMIN_TOKEN

---

## 8. Pre-Implementation Requirements (USER ACTION)

Before code can be tested with real Flitt:

1. **Register Flitt merchant account** at https://flitt.com/
2. **Provide credentials** to add to `.env`:
   - `FLITT_MERCHANT_ID` (numeric)
   - `FLITT_SECRET_KEY` (alphanumeric)
3. **Configure Flitt dashboard:**
   - Whitelist callback URL: `https://api.web2wireframe.design/api/webhooks/flitt`
   - Allowed redirect URLs: `https://web2wireframe.design/checkout/success`, `https://web2wireframe.design/checkout/cancel`
4. **Sandbox/test credentials** for local development (ngrok tunnel for webhooks)

Implementation can proceed up to Phase 5 with mock Flitt SDK; Phase 5+ requires real credentials for end-to-end testing.

---

## 9. Rollout Plan

1. Develop all phases on feature branch (e.g., `payment-system`)
2. Run full test suite — `pnpm build && pnpm test && pnpm type-check`
3. Deploy backend to staging with Flitt test credentials + ngrok webhook tunnel
4. Manual end-to-end test: subscription purchase, recurring charge (use Flitt's test "fast forward"), cancel
5. Verify webhook signature handling on real Flitt sandbox
6. Switch to live Flitt credentials in production `.env`
7. Monitor first real subscription closely (alerts on webhook failures)
8. Roll out to plugin users after 48h of stable operation

---

## 10. Out of Scope (For Now)

- Multi-seat / team plans
- Coupon codes / promo discounts
- Refund automation (no refunds policy)
- AI Generation feature (on `ai-generation-backup` branch, deferred 3-4 months post-launch)
- Credit Packs (removed entirely from launch scope)
- Stripe / Paddle / other providers (Flitt only)
- Custom invoice generation (Flitt receipts suffice)
- Plan downgrade prorating (downgrade takes effect at cycleEndsAt)
- EU VAT collection (re-evaluate at $30K+ EU revenue)
- Admin web UI (CLI/curl only at launch)

---

## 11. References

- Flitt API memory: `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/reference_flitt-api.md`
- Project memory: `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/project_payment-system.md`
- Launch strategy: `docs/decisions/LAUNCH-STRATEGY-2026.md`
- Flitt docs: https://docs.flitt.com/
