# Payment System Implementation Plan

**Status:** Decisions finalized, research complete, awaiting Plan Mode approval to begin implementation.
**Last updated:** 2026-05-02
**Provider:** Flitt (Georgia/CIS PCI-DSS Level 1 gateway) — exclusive, no fallback providers.

---

## 1. Goals

Build a complete payment, subscription, and licensing system for the Web2Wireframe Figma plugin:
- 3 plan tiers (Free, Plus, Pro) with monthly billing
- Auto-renewal via Flitt native subscriptions
- Credit Pack one-time purchases for Pro users
- Limit enforcement on imports + AI generations
- No user registration — Figma user ID is the identity
- 100% PCI compliance — card data never touches our servers

---

## 2. Final Decisions (User-Approved)

### 2.1 Plans

| Plan | Imports/თვე | AI Generations/თვე | Price (USD) |
|------|-------------|---------------------|-------------|
| Free | 10 | 10 | $0 |
| Plus | unlimited | 30 | $12.00 / month |
| Pro | unlimited | 200 + Credit Packs | $20.00 / month |

### 2.2 Counter Semantics

- **Imports counter** increments on: URL import, Screenshot import, HTML import, Browser Extension capture
- **AI Generations counter** increments on: AI page generation, AI block generation
- **Screenshot import does NOT count toward AI generations** (explicit user requirement)
- Counters reset monthly via `cycleEndsAt` field

### 2.3 Credit Packs (Pro Only)

| Pack | Price | Generations | Per-gen |
|------|-------|-------------|---------|
| Small | $5 | 25 | $0.20 |
| Medium | $10 | 60 | $0.17 |
| Large | $20 | 150 | $0.13 |

- One-time Flitt payments
- DB field `creditsBalance: number`
- Consumed AFTER monthly AI limit hit
- No expiration (carry over month-to-month)

### 2.4 User Identity

- **NO registration, NO login**
- `figmaUserId` = `figma.currentUser.id` (Figma SDK)
- Email collected at Flitt checkout (receipt/recovery only)

### 2.5 Recurring Strategy

- Flitt native subscriptions (`subscription: "Y"` + `recurring_data`)
- Flitt charges automatically — no custom cron job for charging
- We listen to webhook events
- Cancel via Flitt API: `SubscriptionActions({ order_id, action: "stop" })`

### 2.6 Currency

- Charge in USD (global plugin audience)

---

## 3. Architecture

### 3.1 Data Flow — Subscription Purchase

```
┌─────────────────┐                                               
│ Figma Plugin    │ User clicks "Upgrade to Plus"                 
│ (Preact UI)     │                                               
└────────┬────────┘                                               
         │ figma.currentUser.id = "123"                           
         │ window.open("https://web2wireframe.design/             
         │           checkout?plan=plus&fid=123")                 
         ▼                                                        
┌─────────────────┐                                               
│ Web (React)     │ /checkout?plan=plus&fid=123                   
│ Checkout.tsx    │ Display: "Plus $12/month"                     
└────────┬────────┘                                               
         │ POST /api/checkout/create                              
         │ { plan: "plus", figmaUserId: "123" }                   
         ▼                                                        
┌─────────────────┐                                               
│ API (Express)   │ flittService.createSubscription(...)          
│ /checkout/create│ → POST pay.flitt.com/api/checkout/url         
│                 │   { merchant_id, order_id, amount: 1200,      
│                 │     subscription: "Y", recurring_data,        
│                 │     server_callback_url, signature }          
└────────┬────────┘                                               
         │ Returns { checkoutUrl: "pay.flitt.com/..." }           
         ▼                                                        
┌─────────────────┐                                               
│ Web Checkout    │ window.location = checkoutUrl                 
└────────┬────────┘                                               
         ▼                                                        
┌─────────────────┐                                               
│ Flitt Hosted    │ User enters card → 3DS → approved             
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
│                 │   License.upsert({ figmaUserId,               
│                 │     plan, status: "active",                   
│                 │     subscription: { flittOrderId,             
│                 │     activatedAt, nextBillingAt: now+30d } })  
│                 │ Return HTTP 200                               
└─────────────────┘                                               

┌─────────────────┐                                               
│ Plugin polls    │ GET /api/license/me?figmaUserId=123           
│ every 5s after  │ → { plan: "plus", ... }                       
│ checkout opens  │ Update UI, close Purchase modal               
└─────────────────┘                                               
```

### 3.2 Data Flow — Recurring Charge (Flitt-initiated)

```
Day 30 (or whatever cycle):                                       
                                                                  
┌─────────────┐                                                   
│   Flitt     │ Auto-charges saved card                           
└──────┬──────┘                                                   
       │ POST /api/webhooks/flitt                                 
       │ { order_id: "w2w_plus_123_xxx",                          
       │   parent_order_id: <original>,                           
       │   order_status: "approved",                              
       │   merchant_data: '{"figmaUserId":"123","plan":"plus"}'   
       │ }                                                        
       ▼                                                          
┌─────────────┐                                                   
│ API Webhook │ Find license by figmaUserId                       
│             │ subscription.nextBillingAt += 30 days             
│             │ Reset usage counters (new cycle)                  
│             │ HTTP 200                                          
└─────────────┘                                                   
```

### 3.3 Data Flow — Cancel

```
┌─────────────────┐                                               
│ Plugin Settings │ User clicks "Manage Subscription"             
└────────┬────────┘                                               
         │ signedToken = HMAC-SHA256({figmaUserId, exp},          
         │                            AUTH_SECRET)                
         │ window.open("/account?fid=123&t=<signedToken>")        
         ▼                                                        
┌─────────────────┐                                               
│ Web Account     │ Verify signed token                           
│ (Account.tsx)   │ Display plan, next billing date, Cancel btn   
└────────┬────────┘                                               
         │ User clicks Cancel                                     
         │ POST /api/subscription/cancel                          
         │ { figmaUserId: "123", token: <signedToken> }           
         ▼                                                        
┌─────────────────┐                                               
│ API             │ Verify token                                  
│ /sub/cancel     │ flittService.cancelSubscription(orderId)      
│                 │ → POST pay.flitt.com/api/recurring/           
│                 │   { order_id, action: "stop", signature }     
│                 │ License.subscription.canceledAt = now         
│                 │ status remains "active" until cycleEndsAt     
└─────────────────┘                                               
```

---

## 4. Database Schema (Mongoose)

```typescript
// packages/api/src/models/License.ts

import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema({
  flittOrderId: { type: String, required: true },     // original subscription order_id
  activatedAt: { type: Date, required: true },
  nextBillingAt: { type: Date, required: true },
  canceledAt: { type: Date, default: null },           // soft-cancel — active until cycleEndsAt
  lastChargeAt: { type: Date, default: null },
  lastFailedAt: { type: Date, default: null },
  failureCount: { type: Number, default: 0 },
}, { _id: false });

const UsageSchema = new mongoose.Schema({
  imports: { type: Number, default: 0 },
  aiGenerations: { type: Number, default: 0 },
  periodStartedAt: { type: Date, required: true },
}, { _id: false });

const LicenseSchema = new mongoose.Schema({
  figmaUserId: { type: String, required: true, unique: true, index: true },
  email: { type: String, default: null },              // from Flitt checkout
  
  plan: { type: String, enum: ["free", "plus", "pro"], default: "free" },
  status: { type: String, enum: ["active", "canceled", "expired"], default: "active" },
  
  cycleStartedAt: { type: Date, required: true, default: Date.now },
  cycleEndsAt: { type: Date, required: true, index: true },  // for monthly reset cron
  
  usage: { type: UsageSchema, required: true },
  creditsBalance: { type: Number, default: 0 },
  
  subscription: { type: SubscriptionSchema, default: null },  // null for Free plan
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

LicenseSchema.pre("save", function () { this.updatedAt = new Date(); });
LicenseSchema.index({ "subscription.nextBillingAt": 1 });
LicenseSchema.index({ cycleEndsAt: 1 });
```

### 4.1 Plan Limits (constants, not in DB)

```typescript
// packages/api/src/services/licenseService.ts

export const PLAN_LIMITS = {
  free: { imports: 10, aiGenerations: 10 },
  plus: { imports: Infinity, aiGenerations: 30 },
  pro: { imports: Infinity, aiGenerations: 200 },
} as const;

export const CREDIT_PACKS = {
  small: { credits: 25, priceCents: 500 },
  medium: { credits: 60, priceCents: 1000 },
  large: { credits: 150, priceCents: 2000 },
} as const;

export const PLAN_PRICES = {
  plus: { priceCents: 1200, period: "month" },
  pro: { priceCents: 2000, period: "month" },
} as const;
```

---

## 5. API Endpoints

### 5.1 License

```
GET /api/license/me?figmaUserId=<ID>
  Response: { plan, status, limits, usage, creditsBalance, cycleEndsAt, 
              subscription: { nextBillingAt, canceledAt } | null }

POST /api/license/use-import
  Body: { figmaUserId }
  Behavior: increment usage.imports if < limits.imports, else 403
  Response: { ok: true, remaining: number } | { error: "limit_exceeded" }

POST /api/license/use-ai
  Body: { figmaUserId }
  Behavior: 
    - if usage.aiGenerations < limits.aiGenerations: increment usage
    - else if creditsBalance > 0: decrement creditsBalance
    - else: 403
  Response: { ok: true, remaining: { aiGenerations, credits } }

POST /api/license/admin/set
  Auth: ADMIN_TOKEN
  Body: { figmaUserId, plan, addCredits?: number }
  Use: dev/support overrides
```

### 5.2 Checkout

```
POST /api/checkout/create
  Body: { plan: "plus" | "pro", figmaUserId, returnUrl?: string }
  Response: { checkoutUrl: string, orderId: string }

POST /api/checkout/credits
  Body: { figmaUserId, pack: "small" | "medium" | "large" }
  Response: { checkoutUrl, orderId }

POST /api/webhooks/flitt
  Auth: SHA1 signature in body
  Body: full Flitt callback payload
  Behavior: parse merchant_data → figmaUserId + (plan | type)
            order_status === "approved":
              if subscription: License.upsert active
              if credit_pack: License.creditsBalance += credits
            order_status === "declined" / "expired":
              log + email + handle subscription failure
  Response: HTTP 200 always (return early on invalid sig — don't 4xx)

POST /api/subscription/cancel
  Body: { figmaUserId, token: signedToken }
  Auth: HMAC-verified signedToken (from plugin)
  Behavior: call Flitt SubscriptionActions stop
            License.subscription.canceledAt = now
  Response: { ok: true, accessUntil: cycleEndsAt }
```

---

## 6. Implementation Phases (TDD-First)

### Phase 0 — `figma.currentUser.id` plumbing ⚠️ PRIMARY BLOCKER

**Goal:** Make figmaUserId available throughout plugin code.

**Files:**
- `packages/figma-plugin/src/main.ts` — read `figma.currentUser.id`, post to UI
- `packages/figma-plugin/src/ui/shared/ConfigContext.tsx` — store figmaUserId in context
- `packages/figma-plugin/src/ui/shared/licenseClient.ts` — pass figmaUserId in queries
- All API callers (Web.tsx, Screenshot.tsx, HTML.tsx, BrowserExtension.tsx, PageGeneration.tsx, BlockGeneration.tsx)

**Tests:**
- `figmaUserId.test.ts` — sandbox→UI message handling
- Mock `figma.currentUser` in setup

### Phase 1 — License model schema migration

**Files:**
- `packages/api/src/models/License.ts` — new schema (above)
- `packages/api/src/__tests__/license-model.test.ts` — schema validation, defaults, indexes

**Migration:** existing test/dev licenses can be dropped (no production data yet).

### Phase 2 — License service

**Files:**
- `packages/api/src/services/licenseService.ts` (new) — `getOrCreate`, `useImport`, `useAI`, `consumeCredit`, `resetCycle`, `applySubscriptionActivation`, `applySubscriptionCancel`, `applyCreditPack`
- `packages/api/src/__tests__/license-service.test.ts` — full unit coverage

**Key invariant:** `useAI` first checks monthly limit, only falls back to credits when limit hit.

### Phase 3 — License routes refactor

**Files:**
- `packages/api/src/routes/license/index.ts` — refactor with figmaUserId param, delegate to service
- `packages/api/src/__tests__/license-routes.test.ts` — supertest integration

### Phase 4 — Flitt service

**Files:**
- `packages/api/src/services/flittService.ts` (new):
  - `flittSign(params, secretKey)` — SHA1 helper
  - `verifyCallback(payload, secretKey)` — webhook signature verification
  - `createSubscriptionCheckout(plan, figmaUserId)` → `{ checkoutUrl, orderId }`
  - `createCreditPackCheckout(pack, figmaUserId)` → `{ checkoutUrl, orderId }`
  - `cancelSubscription(orderId)` → success/failure
- `packages/api/src/__tests__/flitt-service.test.ts`:
  - Signature algorithm correctness (test vectors from Flitt docs)
  - Webhook signature verification (positive + negative)
  - Mock fetch for Flitt API calls
  - merchant_data JSON serialization
  - order_id format validation

### Phase 5 — Checkout & webhook routes

**Files:**
- `packages/api/src/routes/checkout/index.ts` (new):
  - `POST /api/checkout/create`
  - `POST /api/checkout/credits`
  - `POST /api/webhooks/flitt`
  - `POST /api/subscription/cancel`
- `packages/api/src/__tests__/checkout-routes.test.ts`
- `packages/api/src/__tests__/flitt-webhook.test.ts`:
  - Valid signature → license updated
  - Invalid signature → HTTP 200 + log, no DB change (don't trigger retries)
  - Replay protection: same order_id + same status = idempotent
  - Subscription approved → activate
  - Recurring charge approved → reset usage counters, extend nextBillingAt
  - Charge declined → mark subscription.lastFailedAt, increment failureCount

### Phase 6 — Monthly counter reset cron

**Files:**
- `packages/api/src/jobs/monthlyReset.ts` (new) — cron-style worker
- Run hourly: find licenses where `cycleEndsAt <= now AND status === "active"` → reset `usage.{imports, aiGenerations}` to 0, advance `cycleStartedAt` and `cycleEndsAt` by 30 days
- Tests: time-based with `vi.useFakeTimers()`

### Phase 7 — AI route gating

**Files:**
- `packages/api/src/routes/plugin/ai.ts` — call `licenseService.useAI(figmaUserId)` before Claude API call
- Same for any import-related routes that should be gated
- Tests: gate works, 403 on limit exceeded, credit consumption

### Phase 8 — Plugin Purchase modal

**Files:**
- `packages/figma-plugin/src/ui/components/modalPopup/Purchase.tsx` — replace stub with real UI:
  - Plan cards with prices
  - On click: open `https://web2wireframe.design/checkout?plan=<plan>&fid=<figmaUserId>` in browser
  - Poll `/api/license/me` every 5s for plan update (cancel after 5 minutes)
- Tests: button rendering, click → window.open with correct URL

### Phase 9 — Plugin "Manage Subscription" button

**Files:**
- `packages/figma-plugin/src/ui/components/footer/Footer.tsx` (or Settings) — add button
- Generate signed token: HMAC-SHA256 of `{figmaUserId, exp: now+5min}` with AUTH_SECRET (sandbox-side)
- Open `https://web2wireframe.design/account?fid=<ID>&t=<token>`

### Phase 10 — Web pages (Checkout, Account, Credits)

**Files:**
- `packages/web/src/pages/Checkout/Checkout.tsx` — accept query params, fetch checkout URL, redirect
- `packages/web/src/pages/Checkout/CheckoutSuccess.tsx` — "Payment successful, return to Figma"
- `packages/web/src/pages/Checkout/CheckoutCancel.tsx` — "Canceled, you can try again"
- `packages/web/src/pages/Account/Account.tsx` — verify signed token, show plan/billing, Cancel button
- `packages/web/src/pages/Credits/Credits.tsx` — pack selection (Pro plan only)
- Update `packages/web/src/AppRoutes.tsx` — register new routes
- Update `packages/web/src/data/links.ts` — replace `"#"` with real route paths
- Update `packages/web/src/pages/Pricing/Pricing.tsx` — Buttons link to `/checkout?plan=...&fid=<figmaUserId>` (Pricing page also needs `fid` from query string ან via link from plugin)

### Phase 11 — `.env.example`

**Files:**
- `.env.example` — add:
  ```
  FLITT_MERCHANT_ID=your_merchant_id
  FLITT_SECRET_KEY=your_secret_key
  FLITT_BASE_URL=https://pay.flitt.com
  ```

### Phase 12 — Privacy/T&C copy update

**Files:**
- `packages/web/src/pages/Privacy/Privacy.tsx` — add Payment Data section: "We use Flitt as our payment processor. Card data is processed by Flitt under PCI-DSS Level 1; we never receive or store card details. We retain payment metadata (order ID, amount, status) for tax/legal compliance for 1 year after subscription ends."
- `packages/web/src/pages/Terms&conditions/Terms.tsx` — already has §8-9, verify accuracy with new flow (mention Flitt explicitly is optional)
- `packages/web/src/pages/Docs/pages/PricingPurchase.tsx` — replace placeholders with actual flow description

---

## 7. Test Strategy

### 7.1 Unit Tests (Vitest)

- `flitt-service.test.ts` — signature, verifyCallback, mocked Flitt API
- `license-service.test.ts` — full state-machine coverage
- `webhook-handlers.test.ts` — every order_status path

### 7.2 Integration Tests (supertest)

- Full subscription flow: create checkout → mock Flitt webhook → verify license updated
- Credit pack flow: same
- Limit gate: useAI returns 403 when exceeded, credit fallback works
- Cancel flow: subscription.canceledAt set, status remains active until cycleEndsAt

### 7.3 Manual Verification (Flitt sandbox)

- Use Flitt test merchant credentials
- Real checkout in browser → real webhook to dev tunnel → real license update
- Cancel from plugin → real Flitt API call → confirm via Flitt dashboard

### 7.4 Security Tests

- Webhook signature verification (positive, negative, malformed)
- Signed token verification (positive, negative, expired)
- Replay protection on order_ids
- No card data in DB or logs

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
4. **Sandbox/test credentials** for local development

Implementation can proceed up to Phase 5 with mock Flitt SDK; Phase 5+ requires real credentials for end-to-end testing.

---

## 9. Rollout Plan

1. Develop all phases on feature branch (e.g., `payment-system`)
2. Run full test suite — `pnpm build && pnpm test`
3. Deploy backend to staging with Flitt test credentials
4. Manual end-to-end test: subscription purchase, recurring charge (use Flitt's test "fast forward"), cancel, credit pack
5. Verify webhook signature handling on real Flitt
6. Switch to live Flitt credentials in production .env
7. Monitor first real subscription closely
8. Roll out to plugin users after 48h of stable operation

---

## 10. Out of Scope (For Now)

- Yearly billing (only monthly initially)
- Multi-seat / team plans
- Coupon codes / promo discounts
- Refund automation (manual via Flitt dashboard for first 6 months)
- Stripe / Paddle / other providers (Flitt only)
- Custom invoice generation (Flitt receipts suffice)
- Plan downgrade prorating (downgrade takes effect at cycleEndsAt)

---

## 11. References

- Flitt API memory: `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/reference_flitt-api.md`
- Project memory: `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/project_payment-system.md`
- Flitt docs: https://docs.flitt.com/
- Old Flitt code (pre-migration, for reference): `git show 4b42cfb`
