# Phase 3 — Revenue Features (Annual Plan + Billing History)

**Status:** Planning complete, awaiting implementation.
**Last updated:** 2026-05-04
**Estimated effort:** ~10 hours total
**Prerequisites:** Phase 0–10 of payment system complete. Phase 1 (production trust) and Phase 2 (admin panel) ideally complete. Phase 11 (Flitt sandbox testing) **must** be done first — annual subscription requires verified Flitt API behavior.
**Branch strategy:** direct commits to `dev`, one commit per sub-phase.

---

## How to resume work from this file

Open a fresh Claude Code session, then:

> წაიკითხე `docs/plans/PHASE-3-REVENUE-FEATURES.md` და დაიწყე Phase 3.1-დან. ჯერ ტესტი, მერე იმპლემენტაცია. ყოველი ფაზის შემდეგ commit-ი.

Implement in order: **3.1 (annual backend) → 3.2 (annual UI) → 3.3 (Payment model) → 3.4 (billing history UI)**. 3.1+3.2 ship together (annual plan); 3.3+3.4 ship together (history).

---

## 1. Context

Two features that increase Pro plan revenue and trust:

### 1.1 Annual plan ($144/year)
- **Why:** SaaS standard pattern — annual discount locks in users, reduces churn, smooths revenue.
- **Pricing:** $144/year vs $192/year (12 × $16). 25% discount, $4/month effective savings.
- **Competitive context:** h2d.to.design charges $12/mo with no annual option. Our $144/yr matches their monthly rate while delivering Pro features. Strong undercut signal.
- **Risk:** annual users churn less but cohorts harder to read; revenue front-loaded.

### 1.2 Billing history (receipts)
- **Why:** Users currently have no record of past payments inside the app. Receipts go to email at Flitt checkout, but if user deletes them they have no recourse.
- **Trust:** "Did I get charged?" is one of the most common SaaS support tickets. Self-service billing history reduces support load + increases user confidence.
- **Foundation for refund flow:** Future refund implementation needs Payment records to operate on.

---

## 2. Decisions locked (2026-05-04)

### 2.1 Annual plan
- **Price:** **$144/year** (one charge of $144 per year, not $12/mo billed annually).
- **Code:** `priceCents: 14400` in PLAN_PRICES.pro.annual.
- **Pricing rationale:** Matches h2d's $12/mo rate (their annual = $144), giving us same effective price with our better product.
- **Cycle length:** 365 days (Flitt `period: "year", every: 1`).
- **Mid-cycle switching:** NOT supported at launch. Cannot upgrade Pro Monthly → Pro Annual mid-cycle. User must cancel monthly at end of cycle, then subscribe annual. Defer prorating to post-launch.
- **UI:** Single Pro card with toggle (Monthly / Annual). Annual shows "Save 25%" badge.
- **Webhook:** `merchant_data` includes `variant: "monthly" | "annual"`. License records `subscription.variant`.
- **Cancel/reactivate:** Same flows for both variants. Annual users keep access until full year ends after cancel.

### 2.2 Billing history
- **Data model:** New `Payment` collection. One document per Flitt-approved charge.
- **Source:** Webhook handler creates Payment on `order_status === "approved"` (initial + recurring).
- **Display:** Account page (`/account`), new "Past payments" section.
- **Pagination:** 12 most recent by default, "Load more" button.
- **Receipt link:** Defer for v1 (Flitt sends receipts via email; we don't host). Future: deep-link to Flitt customer portal if available.
- **Refund display:** When refund happens (manual via Flitt dashboard), webhook fires with `order_status === "reversed"` — Payment status updates to "refunded". UI shows it.

---

## 3. Existing patterns to reuse

| Need | Reuse from (file:line) | Notes |
|------|-------------------------|-------|
| recurring_data | `packages/api/src/services/flittService.ts:147-153` (`createSubscriptionCheckout`) | Add `period: "year"` branch |
| Plan price tier | `packages/api/src/models/License.ts:48-52` (`PLAN_PRICES`) | Restructure: `pro: { monthly: {...}, annual: {...} }` |
| WebhookEvent dedup | `packages/api/src/models/WebhookEvent.ts` | Pattern for `Payment` model |
| Webhook handler | `packages/api/src/routes/checkout/index.ts` (webhookRouter) | Add `Payment.create()` on approved + handle `reversed` for refund |
| Account page | `packages/web/src/pages/Account/Account.tsx` | Add "Past payments" section |
| Account API auth | HMAC token from `issueCancelToken` | Reuse for `/api/account/payments` |
| License service variant | `packages/api/src/services/licenseService.ts` (`applyRecurringCharge`) | Branch on variant for cycle length |
| Plan modal toggle | `packages/figma-plugin/src/ui/components/modalPopup/Settings.tsx` (existing toggle patterns) | Style consistency |

---

## 4. Phase 3.1 — Annual plan backend

**Effort:** ~2 hours.

### 4.1 License model

**MODIFY** `packages/api/src/models/License.ts`:

```ts
// Restructure PLAN_PRICES to support both variants:
export const PLAN_PRICES = {
  pro: {
    monthly: {
      priceCents: 1600,
      period: "month" as const,
      currency: "USD" as const,
      cycleDurationMs: 30 * 24 * 60 * 60 * 1000,
    },
    annual: {
      priceCents: 14400,
      period: "year" as const,
      currency: "USD" as const,
      cycleDurationMs: 365 * 24 * 60 * 60 * 1000,
    },
  },
} as const;

// Keep CYCLE_DURATION_MS for backward compat OR rename usages:
export const MONTHLY_CYCLE_MS = PLAN_PRICES.pro.monthly.cycleDurationMs;
export const ANNUAL_CYCLE_MS = PLAN_PRICES.pro.annual.cycleDurationMs;
```

Add `variant` to `subscription` subdoc:

```ts
const SubscriptionSchema = new Schema<ISubscription>(
  {
    flittOrderId: { type: String, required: true },
    variant: {
      type: String,
      enum: ["monthly", "annual"] as const,
      default: "monthly",
    },
    activatedAt: { type: Date, required: true },
    nextBillingAt: { type: Date, required: true },
    canceledAt: { type: Date, default: null },
    lastChargeAt: { type: Date, default: null },
    lastFailedAt: { type: Date, default: null },
    failureCount: { type: Number, default: 0 },
  },
  { _id: false },
);
```

Update `ISubscription` interface accordingly.

### 4.2 Flitt service

**MODIFY** `packages/api/src/services/flittService.ts`:

```ts
export async function createSubscriptionCheckout(params: {
  figmaUserId: string;
  variant: "monthly" | "annual";
  returnUrl?: string;
}): Promise<CheckoutResult | CheckoutError> {
  const { merchantId, secretKey, baseUrl } = config.flitt;
  if (!merchantId || !secretKey) {
    return { ok: false, error: "Flitt is not configured" };
  }

  const plan = PLAN_PRICES.pro[params.variant];
  const orderId = buildSubscriptionOrderId(params.figmaUserId, params.variant);
  const amount = plan.priceCents;
  const currency = plan.currency;

  const recurringData = {
    amount,
    period: plan.period, // "month" or "year"
    every: 1,
    quantity: 999,
    state: "shown_readonly",
  };

  const merchantData = JSON.stringify({
    figmaUserId: params.figmaUserId,
    plan: "pro",
    variant: params.variant, // ← NEW
  });

  const desc = params.variant === "annual"
    ? "Web2Wireframe Pro — Annual Subscription"
    : "Web2Wireframe Pro — Monthly Subscription";

  // ... rest mirrors existing implementation
}

// Update orderId builder:
export function buildSubscriptionOrderId(
  figmaUserId: string,
  variant: "monthly" | "annual" = "monthly",
): string {
  const safe = figmaUserId.replace(/[^A-Za-z0-9_-]/g, "");
  return `w2w_pro_${variant}_${safe}_${Date.now()}`;
}
```

### 4.3 License service

**MODIFY** `packages/api/src/services/licenseService.ts`:

`applySubscriptionActivation` — accept variant, store in subscription.variant, set cycleEndsAt by variant:

```ts
async applySubscriptionActivation(params: {
  figmaUserId: string;
  email: string | null;
  flittOrderId: string;
  variant: "monthly" | "annual"; // ← NEW
}): Promise<ILicense> {
  const now = new Date();
  const plan = PLAN_PRICES.pro[params.variant];
  const cycleEnd = new Date(now.getTime() + plan.cycleDurationMs);

  return await License.findOneAndUpdate(
    { figmaUserId: params.figmaUserId },
    {
      $set: {
        email: params.email,
        plan: "pro",
        status: "active",
        cycleStartedAt: now,
        cycleEndsAt: cycleEnd,
        "usage.imports": 0,
        "usage.periodStartedAt": now,
        subscription: {
          flittOrderId: params.flittOrderId,
          variant: params.variant, // ← NEW
          activatedAt: now,
          nextBillingAt: cycleEnd,
          canceledAt: null,
          lastChargeAt: now,
          lastFailedAt: null,
          failureCount: 0,
        },
      },
    },
    { new: true, upsert: true },
  ) as ILicense;
}
```

`applyRecurringCharge` — read variant from existing subscription, extend by correct interval:

```ts
async applyRecurringCharge(params: { figmaUserId: string }): Promise<ILicense | null> {
  // First, get the current variant from existing license
  const license = await License.findOne({ figmaUserId: params.figmaUserId, plan: "pro" });
  if (!license) return null;
  const variant = license.subscription?.variant ?? "monthly";
  const plan = PLAN_PRICES.pro[variant];

  const now = new Date();
  const cycleEnd = new Date(now.getTime() + plan.cycleDurationMs);

  return await License.findOneAndUpdate(
    { figmaUserId: params.figmaUserId, plan: "pro" },
    {
      $set: {
        cycleStartedAt: now,
        cycleEndsAt: cycleEnd,
        "usage.imports": 0,
        "usage.periodStartedAt": now,
        "subscription.nextBillingAt": cycleEnd,
        "subscription.lastChargeAt": now,
        "subscription.failureCount": 0,
      },
    },
    { new: true },
  );
}
```

### 4.4 Webhook handler

**MODIFY** `packages/api/src/routes/checkout/index.ts`:

Parse `variant` from `merchant_data`:

```ts
let merchantData: { figmaUserId?: string; plan?: string; variant?: "monthly" | "annual" } = {};
if (typeof payload.merchant_data === "string") {
  try {
    merchantData = JSON.parse(payload.merchant_data);
  } catch {}
}
const variant = merchantData.variant ?? "monthly";
const figmaUserId = merchantData.figmaUserId;
// ...

if (orderStatus === "approved") {
  if (parentOrderId && typeof parentOrderId === "string") {
    await licenseService.applyRecurringCharge({ figmaUserId });
  } else {
    await licenseService.applySubscriptionActivation({
      figmaUserId,
      email,
      flittOrderId: orderId,
      variant, // ← NEW
    });
  }
}
```

### 4.5 Checkout route

**MODIFY** `packages/api/src/routes/checkout/index.ts` `POST /create` — accept `variant` from body:

```ts
router.post("/create", async (req, res) => {
  const { figmaUserId, variant = "monthly", returnUrl } = req.body as {
    figmaUserId?: string;
    variant?: "monthly" | "annual";
    returnUrl?: string;
  };
  if (!figmaUserId) { /* 400 */ }
  if (variant !== "monthly" && variant !== "annual") {
    res.status(400).json({ error: "Invalid variant" });
    return;
  }
  const result = await createSubscriptionCheckout({ figmaUserId, variant, returnUrl });
  // ... rest
});
```

### 4.6 Tests

**EXTEND** `packages/api/__tests__/flitt-service.test.ts`:
- `createSubscriptionCheckout({variant: "annual"})` sends `amount: 14400`, `period: "year"`
- `merchant_data` includes `variant: "annual"`
- `orderId` includes `_annual_` substring

**EXTEND** `packages/api/__tests__/license-service.test.ts`:
- `applySubscriptionActivation` with variant: "annual" → cycleEndsAt = now + 365d, subscription.variant = "annual"
- `applyRecurringCharge` for annual subscription → next cycle 365d
- `applyRecurringCharge` for monthly subscription → next cycle 30d (regression)

**EXTEND** `packages/api/__tests__/checkout-routes.test.ts`:
- POST /create with variant: "annual" → calls service with annual
- POST /create with invalid variant → 400

**EXTEND** `packages/api/__tests__/flitt-webhook.test.ts`:
- Webhook with `merchant_data.variant: "annual"` → activation called with annual

---

## 5. Phase 3.2 — Annual plan UI

**Effort:** ~1 hour.

### 5.1 Plugin

**MODIFY** `packages/figma-plugin/src/ui/shared/licenseClient.ts`:

```ts
export async function createCheckout(
  figmaUserId: string,
  variant: "monthly" | "annual" = "monthly",
  signal?: AbortSignal,
): Promise<CheckoutResponse> {
  if (!figmaUserId) throw new Error("createCheckout: figmaUserId is required");
  const response = await fetch(`${API_BASE_URL}/api/checkout/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ figmaUserId, variant }),
    signal,
  });
  if (!response.ok) { /* throw */ }
  return await response.json();
}
```

**MODIFY** `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx`:

Add toggle state above Pro card:

```tsx
const [variant, setVariant] = useState<"monthly" | "annual">("monthly");

async function handleGetPro() {
  // ... existing
  const { checkoutUrl } = await createCheckout(figmaUserId, variant);
  // ... existing
}

// In JSX, inside the !isPro block, before the Pro card:
<div class={styles.planVariantToggle}>
  <button
    type="button"
    class={`${styles.variantOption} ${variant === "monthly" ? styles.variantActive : ""}`}
    onClick={() => setVariant("monthly")}
  >
    Monthly · $16
  </button>
  <button
    type="button"
    class={`${styles.variantOption} ${variant === "annual" ? styles.variantActive : ""}`}
    onClick={() => setVariant("annual")}
  >
    Annual · $144 <span class={styles.savingsBadge}>Save 25%</span>
  </button>
</div>

// Update Pro card header to reflect selected variant:
<div class={styles.planCardHeader}>
  PRO — {variant === "monthly" ? "$16/month" : "$144/year"}
</div>
```

**MODIFY** `packages/figma-plugin/src/ui/components/modalPopup/Modal.css` — toggle styles:

```css
.planVariantToggle {
  display: flex;
  gap: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 12px;
}

.variantOption {
  flex: 1;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.variantOption:hover { background: rgba(255, 255, 255, 0.04); }

.variantActive {
  background: rgba(244, 162, 97, 0.18);
  color: var(--accent);
}

.savingsBadge {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.4px;
}
```

### 5.2 Website

**MODIFY** `packages/web/src/pages/Pricing/Pricing.tsx`:
Add identical Monthly/Annual toggle, but since checkout still happens in plugin, both options route to "Install Plugin" CTA (no behavioral difference). Toggle is informational only on website.

### 5.3 Tests

**EXTEND** `packages/figma-plugin/src/__tests__/figma-user-id-plumbing.test.tsx` (or NEW):
- `createCheckout(fid, "monthly")` → URL has variant=monthly in body
- `createCheckout(fid, "annual")` → variant=annual

**NEW** test for Plan modal toggle:
- Default variant = monthly
- Click Annual button → variant updates → header shows "$144/year"
- Click Get Pro → createCheckout called with current variant

---

## 6. Phase 3.3 — Payment model + webhook tracking

**Effort:** ~1 hour.

### 6.1 Payment model

**NEW** `packages/api/src/models/Payment.ts`:

```ts
import mongoose, { Schema, type Document } from "mongoose";

export type PaymentStatus = "approved" | "declined" | "refunded";
export type PaymentVariant = "monthly" | "annual";

export interface IPayment extends Document {
  createdAt: Date;
  updatedAt: Date;
  figmaUserId: string;
  flittPaymentId: string;
  flittOrderId: string;
  parentOrderId: string | null; // null = initial subscription, set = recurring
  amount: number; // in cents
  currency: string; // "USD"
  status: PaymentStatus;
  isRecurring: boolean;
  variant: PaymentVariant;
  paidAt: Date;
  rawPayload: Record<string, unknown>; // store full webhook payload for forensics
}

const PaymentSchema = new Schema<IPayment>(
  {
    figmaUserId: { type: String, required: true, index: true },
    flittPaymentId: { type: String, required: true, unique: true, index: true },
    flittOrderId: { type: String, required: true, index: true },
    parentOrderId: { type: String, default: null },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    status: {
      type: String,
      enum: ["approved", "declined", "refunded"] as const,
      required: true,
    },
    isRecurring: { type: Boolean, default: false },
    variant: {
      type: String,
      enum: ["monthly", "annual"] as const,
      default: "monthly",
    },
    paidAt: { type: Date, required: true },
    rawPayload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

PaymentSchema.index({ figmaUserId: 1, paidAt: -1 });

export const Payment = mongoose.model<IPayment>("Payment", PaymentSchema);
```

### 6.2 Webhook updates

**MODIFY** `packages/api/src/routes/checkout/index.ts` — after `License.findOneAndUpdate` in approved branch:

```ts
import { Payment } from "../../models/Payment.js";

// Inside webhook handler, in the approved branch:
if (orderStatus === "approved" && figmaUserId) {
  const isRecurring = !!parentOrderId;
  // ... license update (existing)

  // NEW: record payment
  try {
    await Payment.create({
      figmaUserId,
      flittPaymentId: typeof payload.payment_id === "string" ? payload.payment_id : transactionId,
      flittOrderId: orderId,
      parentOrderId: isRecurring ? String(parentOrderId) : null,
      amount: typeof payload.actual_amount === "number" ? payload.actual_amount : (typeof payload.amount === "number" ? payload.amount : 0),
      currency: typeof payload.currency === "string" ? payload.currency : "USD",
      status: "approved",
      isRecurring,
      variant,
      paidAt: new Date(),
      rawPayload: payload,
    });
  } catch (err) {
    // Don't fail webhook on Payment record error — log only
    console.warn("[Flitt webhook] Payment record failed:", err);
  }
}

// NEW: handle reversed/refund
if (orderStatus === "reversed" || orderStatus === "refund") {
  // Update existing Payment status to "refunded"
  if (typeof payload.payment_id === "string") {
    await Payment.findOneAndUpdate(
      { flittPaymentId: payload.payment_id },
      { $set: { status: "refunded" } },
    );
  }
}
```

### 6.3 Tests

**NEW** `packages/api/__tests__/payment-model.test.ts`:
- Schema validation: required fields
- Indexes: figmaUserId+paidAt, unique flittPaymentId

**EXTEND** `packages/api/__tests__/flitt-webhook.test.ts`:
- Approved webhook → Payment.create called with correct fields
- Recurring approved → isRecurring: true, parentOrderId set
- Reversed → Payment.findOneAndUpdate to refunded

---

## 7. Phase 3.4 — Billing history UI

**Effort:** ~2 hours.

### 7.1 Backend route

**NEW** route in `packages/api/src/routes/checkout/index.ts` (or new file):

```ts
// Mounted on websiteRouter at /web/account/payments
const accountRouter = Router();

accountRouter.get("/payments", async (req, res) => {
  const figmaUserId = req.query.figmaUserId;
  const token = req.query.t;
  if (typeof figmaUserId !== "string" || typeof token !== "string") {
    res.status(400).json({ error: "figmaUserId and token required" });
    return;
  }
  // Verify HMAC token (reuse from cancel)
  try {
    const payload = verifyToken(token, process.env.AUTH_SECRET!);
    if (payload.userId !== figmaUserId) throw new Error("user mismatch");
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const limit = Math.min(50, parseInt(String(req.query.limit ?? "12"), 10));
  const before = req.query.before
    ? new Date(String(req.query.before))
    : new Date();

  const payments = await Payment.find({
    figmaUserId,
    paidAt: { $lt: before },
  })
    .sort({ paidAt: -1 })
    .limit(limit + 1);

  const hasMore = payments.length > limit;
  const items = payments.slice(0, limit).map((p) => ({
    id: p._id.toString(),
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    isRecurring: p.isRecurring,
    variant: p.variant,
    paidAt: p.paidAt.toISOString(),
  }));

  res.json({ items, hasMore });
});

export { accountRouter };
```

**MODIFY** `packages/api/src/index.ts` — mount on websiteRouter:

```ts
import { accountRouter } from "./routes/checkout/index.js";
websiteRouter.use("/web/account", accountRouter);
```

CORS: must allow website origin. Already configured for `/web/*`.

### 7.2 Account page UI

**MODIFY** `packages/web/src/pages/Account/Account.tsx`:

```tsx
interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: "approved" | "declined" | "refunded";
  isRecurring: boolean;
  variant: "monthly" | "annual";
  paidAt: string;
}

// Inside Account component:
const [payments, setPayments] = useState<PaymentRecord[]>([]);
const [paymentsLoading, setPaymentsLoading] = useState(true);
const [hasMorePayments, setHasMorePayments] = useState(false);

useEffect(() => {
  if (!figmaUserId || !token) return;
  fetch(
    `${API_URL}/web/account/payments?figmaUserId=${encodeURIComponent(figmaUserId)}&t=${encodeURIComponent(token)}&limit=12`,
  )
    .then((r) => r.json())
    .then((data: { items: PaymentRecord[]; hasMore: boolean }) => {
      setPayments(data.items);
      setHasMorePayments(data.hasMore);
    })
    .finally(() => setPaymentsLoading(false));
}, [figmaUserId, token]);

async function loadMorePayments() {
  if (payments.length === 0) return;
  const oldest = payments[payments.length - 1].paidAt;
  const res = await fetch(
    `${API_URL}/web/account/payments?figmaUserId=${encodeURIComponent(figmaUserId!)}&t=${encodeURIComponent(token!)}&limit=12&before=${encodeURIComponent(oldest)}`,
  );
  const data = await res.json();
  setPayments((prev) => [...prev, ...data.items]);
  setHasMorePayments(data.hasMore);
}

// In JSX, after the existing card:
<div className={styles.card}>
  <h2>Past payments</h2>
  {paymentsLoading && <p>Loading…</p>}
  {!paymentsLoading && payments.length === 0 && (
    <p className={styles.subtle}>No payments yet.</p>
  )}
  {payments.length > 0 && (
    <div className={styles.paymentsTable}>
      {payments.map((p) => (
        <div key={p.id} className={styles.paymentRow}>
          <span>{formatDate(p.paidAt)}</span>
          <span>${(p.amount / 100).toFixed(2)} {p.currency}</span>
          <span className={styles[`status_${p.status}`]}>{p.status}</span>
          <span className={styles.subtle}>
            {p.isRecurring ? "Renewal" : "Initial"} · {p.variant}
          </span>
        </div>
      ))}
      {hasMorePayments && (
        <button onClick={loadMorePayments} className="btn btn-secondary">
          Load more
        </button>
      )}
    </div>
  )}
</div>
```

**MODIFY** `packages/web/src/pages/Account/Account.module.scss` — table styles, status colors.

### 7.3 Tests

**NEW** `packages/api/__tests__/account-payments.test.ts`:
- 400 without figmaUserId or token
- 401 with invalid token
- 200 returns last 12 payments sorted desc
- Pagination with `before` cursor
- Refunded status reflected

---

## 8. Critical files summary

### Phase 3.1 (annual backend, 2h)
- MODIFY `packages/api/src/models/License.ts` — restructure PLAN_PRICES, add variant
- MODIFY `packages/api/src/services/flittService.ts` — variant param
- MODIFY `packages/api/src/services/licenseService.ts` — variant in activation/recurring
- MODIFY `packages/api/src/routes/checkout/index.ts` — variant in checkout + webhook
- EXTEND tests: flitt-service, license-service, license-model, checkout-routes, flitt-webhook

### Phase 3.2 (annual UI, 1h)
- MODIFY `packages/figma-plugin/src/ui/shared/licenseClient.ts` — variant param
- MODIFY `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx` — toggle UI
- MODIFY `packages/figma-plugin/src/ui/components/modalPopup/Modal.css` — toggle styles
- MODIFY `packages/web/src/pages/Pricing/Pricing.tsx` — informational toggle

### Phase 3.3 (Payment model, 1h)
- NEW `packages/api/src/models/Payment.ts`
- MODIFY `packages/api/src/routes/checkout/index.ts` — Payment.create on webhook
- NEW `packages/api/__tests__/payment-model.test.ts`
- EXTEND `packages/api/__tests__/flitt-webhook.test.ts`

### Phase 3.4 (billing history UI, 2h)
- NEW account router or addition to checkout/index.ts: `GET /web/account/payments`
- MODIFY `packages/api/src/index.ts` — mount accountRouter
- MODIFY `packages/web/src/pages/Account/Account.tsx` — Past payments section
- MODIFY `packages/web/src/pages/Account/Account.module.scss`
- NEW `packages/api/__tests__/account-payments.test.ts`

---

## 9. Migration path (existing data)

When Phase 3 ships, existing Pro licenses (currently no `variant` field) need a default value:

```js
// Mongo migration (run once):
db.licenses.updateMany(
  { plan: "pro", "subscription.variant": { $exists: false } },
  { $set: { "subscription.variant": "monthly" } }
);
```

Document this in `docs/plans/PHASE-3-REVENUE-FEATURES.md` deployment notes.

For Payment collection — no migration needed (new collection, starts empty). Historical payments before Phase 3 are NOT backfilled into Payment (no easy way without Flitt API export).

---

## 10. Edge cases

1. **User on Monthly switches to Annual mid-cycle**
   - Not supported in v1. UI prevents (Monthly user sees no toggle in Plan modal — toggle only visible to Free users selecting upgrade).
   - Workaround: cancel Monthly → wait for cycle end → subscribe Annual.

2. **Refund of partial subscription**
   - Manual via Flitt dashboard.
   - Webhook fires `reversed` → Payment status → "refunded".
   - License remains Pro until cycleEndsAt regardless. Owner manually overrides via admin panel if needed (e.g., user's refund means immediate downgrade to Free).

3. **Annual subscription cancellation**
   - User pays $144 in January, cancels in March.
   - Pro access until next January (cycleEndsAt = activation + 365d).
   - **No prorated refund.** This is documented in Terms (no refunds policy). Communicate clearly in cancel confirmation: "You'll keep Pro access until [Jan 2027]."

4. **Annual renewal failure**
   - Same flow as monthly: failureCount++, lastFailedAt set, banner shown.
   - Flitt retry schedule applies (2s/60s/5min/10min/1h/24h).
   - If all retries fail → user keeps access until cycleEndsAt (current cycle paid), then auto-downgrade.

5. **Currency mismatch**
   - PLAN_PRICES uses USD; Flitt charges USD. If Flitt converts to user's local currency, display still shows USD in plugin. Document in FAQ.

---

## 11. Rollout

1. Develop on `dev` branch.
2. Phase 3.1 + 3.2 ship together as "Annual plan" feature.
3. Phase 3.3 + 3.4 ship together as "Billing history" feature.
4. **Order matters:** if shipping in stages, ship 3.3 (Payment model) BEFORE 3.4 (UI) so webhook starts populating Payment records ASAP.
5. **Migration:** run Mongo migration script on production DB before/after deploy.

**Commit messages:**
- `feat(payment): add Annual plan ($144/year, 25% off)`
- `feat(payment): track per-charge Payment records via webhook`
- `feat(account): show past payments + receipts on Account page`

---

## 12. References

- **Flitt recurring_data:** `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/reference_flitt-api.md` — section "recurring_data Properties" — verify `period: "year"` is supported.
- **Master plan:** [`docs/plans/PAYMENT-SYSTEM.md`](./PAYMENT-SYSTEM.md)
- **Phase 1:** [`docs/plans/PHASE-1-PRODUCTION-TRUST.md`](./PHASE-1-PRODUCTION-TRUST.md) — failed payment warning is reused for annual cycles.
- **Phase 2:** [`docs/plans/PHASE-2-ADMIN-PANEL.md`](./PHASE-2-ADMIN-PANEL.md) — MRR aggregation must split monthly + annual/12 to avoid double-counting after Phase 3 ships.
- **Project memory:** `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/project_payment-system.md`
- **Flitt official docs:** https://docs.flitt.com/

---

## 13. Open questions / risks

1. **Flitt period: "year"** — verify Flitt supports yearly subscription period. Memory says `period: "day" | "week" | "month"` are documented. Need to ASK Flitt support if "year" works, or if we should use `period: "month", every: 12` as workaround.
2. **MRR calculation across variants** — Phase 2.2 stats currently assume monthly only. After Phase 3, MRR = `(activeMonthly × 1600) + (activeAnnual × 14400 / 12)` to normalize. Update admin stats endpoint accordingly.
3. **Receipt link** — defer to v2. If Flitt customer portal exists, deep-link to it from each payment row.
4. **rawPayload size** — storing full webhook in Payment doc adds ~2KB per payment. At 10K payments → 20MB. Acceptable. If concerns later, can move to separate FlittWebhookEvent collection or strip to essentials.
5. **Test infrastructure** — Phase 3 tests need Mongo or extensive mocking. Consider using `mongodb-memory-server` for integration coverage. Defer if existing mock patterns are sufficient.
