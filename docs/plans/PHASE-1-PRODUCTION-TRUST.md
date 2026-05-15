# Phase 1 — Production Trust Signals

**Status:** Planning complete, awaiting implementation.
**Last updated:** 2026-05-04
**Estimated effort:** ~3 hours total
**Prerequisites:** Phase 0–10 of payment system already complete (see `docs/plans/PAYMENT-SYSTEM.md`).
**Branch strategy:** direct commits to `dev`, one commit per task (1.1, 1.2, 1.3).

---

## How to resume work from this file

Open a fresh Claude Code session, then:

> წაიკითხე `docs/plans/PHASE-1-PRODUCTION-TRUST.md` და დაიწყე Phase 1.1-დან. მიყევი TDD-ს (ჯერ ტესტი, მერე იმპლემენტაცია). ყოველი ფაზის შემდეგ commit-ი გავაკეთო ერთად.

The plan is structured so each Phase (1.1, 1.2, 1.3) is independently shippable. Implement in order: **1.1 → 1.2 → 1.3** (smallest to largest, easiest to verify).

---

## 1. Context

After Flitt payment system launch (Phases 0–10 complete), three production-quality trust signals are missing from the Pro user experience:

1. **No billing email displayed** — Pro users cannot verify which email Flitt has on file. Creates support tickets when receipts go missing or when users forget which card/email they used.
2. **No failed payment warning** — when Flitt's auto-charge declines, the user has no indication anywhere in plugin or website. They learn only after auto-downgrade to Free at cycle end. Single biggest preventable churn risk.
3. **No reactivate path mid-cycle** — once user cancels, no UI path back to Pro until cycle ends and they go through full new checkout. Loses willing-to-pay users who change their minds.

These are three small features but each addresses a specific user-trust failure mode that will hurt MRR and customer satisfaction in production.

---

## 2. Decisions locked (2026-05-04)

### 2.1 Email row (Task C)
- **Display location:** Plan modal `planMeta` section, between "Status" and billing date rows.
- **Visibility:** Pro plan only (Free has no email anyway since email is collected at Flitt checkout).
- **Read-only:** No edit UI. Users change email by canceling + re-subscribing with different email at Flitt checkout.
- **Account page:** Already shows email — no change needed there.

### 2.2 Failed payment warning (Task B)
- **Trigger:** `license.subscription?.failureCount > 0`.
- **Locations:** Plan modal (top of modalContent, above planSummary) AND Account page (top of card).
- **Severity tiers:**
  | failureCount | Severity | Color |
  |---|---|---|
  | 1 | Info | Yellow (`#ffd54f` border, `#fff8e1` bg) |
  | 2-3 | Warning | Orange (`#ff9800`, `#fff3e0`) |
  | 4+ | Urgent | Red (`#f44336`, `#ffebee`) |
- **Message:** `"Last payment attempt failed (${failureCount} attempts). Update your payment method by ${cycleEndsAt} to keep Pro access."`
- **CTA:** Link to "Manage Subscription" (opens Account page) — user updates card via Flitt's portal there.

### 2.3 Reactivate canceled subscription (Task A)
- **Trigger:** `license.status === "canceled" && license.plan === "pro" && now < cycleEndsAt`.
- **Location:** Account page primarily; Plan modal optionally.
- **Backend behavior:**
  - Call Flitt `SubscriptionActions({ order_id, action: "resume" })`.
  - License: `status: "active"`, `subscription.canceledAt: null`.
  - **No new charge** — just resumes auto-renewal schedule on next cycle.
- **Open question:** Verify with Flitt support whether `action: "resume"` works after `action: "stop"`. Memory notes both `pause`/`resume` are supported but does not confirm whether resume works on a stopped subscription.
- **Fallback if Flitt doesn't support resume after stop:** Create new subscription checkout with same email/figmaUserId. User would pay again immediately but `cycleEndsAt` should be preserved server-side to avoid double-billing perception. **This fallback adds complexity — confirm Flitt behavior FIRST before building.**

---

## 3. Existing patterns to reuse

| Need | Reuse from (file:line) | Notes |
|------|-------------------------|-------|
| HMAC token verify | `packages/api/src/middleware/auth.ts:50-89` (`verifyToken`) | Same secret as cancel — reuse signedToken from `issueCancelToken` |
| Cancel-token issuer | `packages/api/src/routes/plugin/auth-token.ts` | Use as-is for reactivate |
| Flitt service shape | `packages/api/src/services/flittService.ts:225-270` (`cancelSubscription`) | Mirror for `reactivateSubscription` |
| License service pattern | `packages/api/src/services/licenseService.ts:155-175` (`applySubscriptionCancel`) | Mirror for `applySubscriptionReactivate` |
| Cancel route | `packages/api/src/routes/checkout/index.ts:140-200` (cancel handler) | Mirror for reactivate handler |
| Account page action | `packages/web/src/pages/Account/Account.tsx:75-103` (`handleCancel`) | Mirror for `handleReactivate` |
| Plan modal meta row | `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx:192-217` | Add email row inside `planMeta` |
| License interface | `packages/figma-plugin/src/ui/shared/licenseClient.ts:15-32` | `email` already declared, just consume |
| Test mock pattern (no DB) | `packages/api/__tests__/license-routes.test.ts:1-30` | `vi.mock('../src/state.js', ...)` for `mongoConnected: true` |

---

## 4. Phase 1.1 — Email row in Plan modal

**Effort:** ~5 minutes.

### 4.1 Files

**MODIFY** `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx`:

In the `planMeta` section (around line 192-217), add inside the `{license && (...)}` block, after the "Status" row and before the next-billing/cycle-resets row:

```tsx
{isPro && license.email && (
  <div class={styles.planMetaRow}>
    <span>Billing email</span>
    <span class={styles.planMetaValue}>{license.email}</span>
  </div>
)}
```

### 4.2 Tests

**EXTEND** `packages/figma-plugin/src/__tests__/figma-user-id-plumbing.test.tsx` (or NEW dedicated test) — add one assertion:

```tsx
it("Pro license with email shows the Billing email row", async () => {
  // mock fetchMyLicense to return Pro license with email: "user@example.com"
  // render Plan modal
  // expect text "Billing email" + "user@example.com"
});
```

### 4.3 Verification

- `pnpm test` (figma-plugin) → all pass
- `pnpm type-check` clean
- Manual: open Plan modal as Pro user with email → row visible
- Manual: Free user → no row (license.email is null)

---

## 5. Phase 1.2 — Failed payment warning banner

**Effort:** ~30 minutes.

### 5.1 Backend

No backend changes needed — `license.subscription.failureCount` already incremented by webhook handler (see `packages/api/src/routes/checkout/index.ts` `applyFailedCharge` call).

### 5.2 Frontend

**MODIFY** `packages/figma-plugin/src/ui/components/modalPopup/Modal.css` — add styles:

```css
/* Failed payment warning banner — severity-tiered */
.planFailedPaymentBanner {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.4;
  border: 1px solid;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.planFailedPaymentBannerInfo {
  border-color: rgba(255, 213, 79, 0.6);
  background: rgba(255, 248, 225, 0.18);
  color: #ffd54f;
}

.planFailedPaymentBannerWarning {
  border-color: rgba(255, 152, 0, 0.7);
  background: rgba(255, 152, 0, 0.12);
  color: #ff9800;
}

.planFailedPaymentBannerUrgent {
  border-color: rgba(244, 67, 54, 0.8);
  background: rgba(244, 67, 54, 0.14);
  color: #f44336;
  font-weight: 700;
}
```

**MODIFY** `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx` — at top of `modalContent` (before `planSummary`):

```tsx
function getFailureSeverity(count: number): "info" | "warning" | "urgent" {
  if (count >= 4) return "urgent";
  if (count >= 2) return "warning";
  return "info";
}

// Inside the component, after `const isPro = ...`:
const failureCount = license?.subscription?.failureCount ?? 0;
const severity = getFailureSeverity(failureCount);
const severityClass = {
  info: styles.planFailedPaymentBannerInfo,
  warning: styles.planFailedPaymentBannerWarning,
  urgent: styles.planFailedPaymentBannerUrgent,
}[severity];

// In JSX, top of modalContent:
{license && failureCount > 0 && (
  <div class={`${styles.planFailedPaymentBanner} ${severityClass}`}>
    <div>
      ⚠️ Last payment attempt failed ({failureCount} {failureCount === 1 ? "attempt" : "attempts"}).
    </div>
    <div>
      Update your payment method by {formatDate(license.cycleEndsAt)} to
      keep Pro access. Use "Manage Subscription" below.
    </div>
  </div>
)}
```

**MODIFY** `packages/web/src/pages/Account/Account.tsx` — same banner at top of card.

**MODIFY** `packages/web/src/pages/Account/Account.module.scss` — mirror the SCSS classes.

### 5.3 Tests

**NEW** `packages/figma-plugin/src/__tests__/plan-modal-failed-payment.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
// ...

describe("Plan modal — failed payment banner", () => {
  it("does not show banner when failureCount = 0", () => { ... });
  it("shows info banner (yellow) when failureCount = 1", () => { ... });
  it("shows warning banner (orange) when failureCount = 2", () => { ... });
  it("shows warning banner (orange) when failureCount = 3", () => { ... });
  it("shows urgent banner (red) when failureCount = 4", () => { ... });
  it("includes formatted cycleEndsAt date", () => { ... });
});
```

### 5.4 Verification

- `pnpm test` figma-plugin + api → all pass
- Manual: use admin endpoint to set `subscription.failureCount = 2` for test license:
  ```bash
  curl -H "Authorization: Bearer $ADMIN_TOKEN" \
    -X POST -H "Content-Type: application/json" \
    -d '{"figmaUserId":"<fid>","subscription":{"failureCount":2}}' \
    http://localhost:3002/api/admin/license/override
  ```
  → reload Plan modal → orange warning banner visible.
- Manual: set failureCount = 5 → red urgent banner.

---

## 6. Phase 1.3 — Reactivate canceled subscription

**Effort:** ~2 hours.

**Critical first step:** Verify Flitt API behavior. Before writing any code:
1. Confirm with Flitt support whether `action: "resume"` works after `action: "stop"`.
2. If yes → proceed with this plan as written.
3. If no → modify plan to use new-checkout fallback (see §2.3).

### 6.1 Backend

**MODIFY** `packages/api/src/services/licenseService.ts` — add new method:

```ts
async applySubscriptionReactivate(params: {
  figmaUserId: string;
}): Promise<ILicense | null> {
  // Only valid when canceled + cycleEndsAt > now (still in grace period).
  // After cycleEndsAt, the lazy cleanup has already downgraded to Free,
  // so reactivate is impossible — user must do a fresh checkout.
  return await License.findOneAndUpdate(
    {
      figmaUserId: params.figmaUserId,
      plan: "pro",
      status: "canceled",
      cycleEndsAt: { $gt: new Date() },
    },
    {
      $set: {
        status: "active",
        "subscription.canceledAt": null,
      },
    },
    { new: true },
  );
}
```

**MODIFY** `packages/api/src/services/flittService.ts` — add `reactivateSubscription`:

```ts
export async function reactivateSubscription(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Mirrors cancelSubscription — same shape, just action: "resume".
  // ⚠️ VERIFY WITH FLITT: does action:"resume" work after a previous
  // action:"stop"? If not, this entire flow becomes "create new
  // subscription checkout" instead.
  const { merchantId, secretKey, baseUrl } = config.flitt;
  if (!merchantId || !secretKey) {
    return { ok: false, error: "Flitt not configured" };
  }
  // ... full implementation mirroring cancelSubscription with action: "resume"
}
```

**MODIFY** `packages/api/src/routes/checkout/index.ts` — add to `cancelRouter`:

```ts
cancelRouter.post("/reactivate", async (req, res) => {
  // Mirrors cancel handler:
  // 1. Body { figmaUserId, token } validation
  // 2. verifyToken (HMAC) + assert userId matches
  // 3. Get license, verify plan === "pro" && status === "canceled" && cycleEndsAt > now
  // 4. flittService.reactivateSubscription(license.subscription.flittOrderId)
  // 5. licenseService.applySubscriptionReactivate({ figmaUserId })
  // 6. res.json({ ok: true, status: "active", nextBillingAt: cycleEndsAt })
  // Error paths:
  //   - 400 missing fields
  //   - 401 invalid token
  //   - 404 if no canceled subscription found
  //   - 502 if Flitt rejects
  //   - 500 catch-all
});
```

### 6.2 Tests

**EXTEND** `packages/api/__tests__/license-service.test.ts`:

```ts
describe("licenseService.applySubscriptionReactivate", () => {
  it("succeeds when canceled + cycleEndsAt > now", async () => { ... });
  it("returns null when status='active' (not canceled)", async () => { ... });
  it("returns null when cycleEndsAt has passed (would have been downgraded)", async () => { ... });
  it("returns null when plan='free'", async () => { ... });
  it("clears canceledAt and sets status='active' on success", async () => { ... });
});
```

**EXTEND** `packages/api/__tests__/flitt-service.test.ts`:

```ts
describe("reactivateSubscription", () => {
  it("posts action='resume' with valid signature", async () => { ... });
  it("returns error when Flitt response_status is not success", async () => { ... });
});
```

**EXTEND** `packages/api/__tests__/checkout-routes.test.ts`:

```ts
describe("POST /api/subscription/reactivate", () => {
  it("returns 400 when fields missing", async () => { ... });
  it("returns 401 when token invalid", async () => { ... });
  it("returns 401 when token signed for different user", async () => { ... });
  it("returns 404 when no canceled Pro subscription", async () => { ... });
  it("returns 502 when Flitt rejects", async () => { ... });
  it("succeeds: calls Flitt resume + applies reactivate + returns next billing", async () => { ... });
});
```

### 6.3 Frontend

**MODIFY** `packages/figma-plugin/src/ui/shared/licenseClient.ts` — add method:

```ts
export async function reactivateSubscription(
  figmaUserId: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: true; status: string; nextBillingAt: string }> {
  const response = await fetch(
    `${API_BASE_URL}/api/subscription/reactivate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figmaUserId, token }),
      signal,
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof (body as { error?: string }).error === "string"
        ? (body as { error: string }).error
        : `Reactivate failed (${response.status})`,
    );
  }
  return (await response.json()) as { ok: true; status: string; nextBillingAt: string };
}
```

**MODIFY** `packages/web/src/pages/Account/Account.tsx`:

When `license.status === "canceled"` AND `cycleEndsAt > now`:
- Show banner: `"Your subscription is canceled. Pro access continues until {cycleEndsAt}."`
- Show button: `"Reactivate subscription"` (accent color, prominent)
- On click → `POST /api/subscription/reactivate` with figmaUserId + token from URL
- On success → update local state to `status: "active"`, `subscription.canceledAt: null`
- Show success toast: `"Subscription reactivated. You'll be charged next at {cycleEndsAt}."`

**MODIFY** `packages/web/src/pages/Account/Account.module.scss` — styles for reactivate banner + button.

**(Optional) MODIFY** `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx`:
For canceled Pro state, optionally show inline "Reactivate" button next to "Manage Subscription" so user doesn't have to navigate to website. Implementation: same `licenseClient.reactivateSubscription(figmaUserId, token)` flow, plugin generates token via `issueCancelToken` (reuse — same token works for both).

### 6.4 Verification

- `pnpm test` → all green
- `pnpm type-check` → exit 0
- Manual end-to-end:
  1. Pro user cancels → status = canceled
  2. Open Account page → "Reactivate subscription" button visible
  3. Click → status returns to active
  4. Verify in Flitt dashboard that subscription is reactivated
  5. (If subscription wasn't actually reactivated in Flitt — fallback flow needed)

---

## 7. Test mock patterns (for new tests)

### 7.1 No-DB unit tests
For tests that exercise the License service or routes without a real MongoDB:

```ts
// At top of test file, BEFORE importing the route:
vi.mock("../src/state.js", () => ({
  mongoConnected: true,
  setMongoConnected: vi.fn(),
  pendingCDPImports: new Map(),
}));

vi.mock("../src/services/licenseService.js", () => ({
  licenseService: {
    getOrCreate: vi.fn(),
    applySubscriptionReactivate: vi.fn(),
    // ... other mocked methods
  },
}));
```

### 7.2 Frontend tests with mocked fetch
Same pattern as `packages/figma-plugin/src/__tests__/figma-user-id-plumbing.test.tsx`:

```ts
const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
  new Response(JSON.stringify({ /* license shape */ }), { status: 200 })
);
```

---

## 8. Critical files summary

### Phase 1.1 (5 min)
- MODIFY `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx`
- (Optional) EXTEND `packages/figma-plugin/src/__tests__/figma-user-id-plumbing.test.tsx`

### Phase 1.2 (30 min)
- MODIFY `packages/figma-plugin/src/ui/components/modalPopup/Modal.css`
- MODIFY `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx`
- MODIFY `packages/web/src/pages/Account/Account.tsx`
- MODIFY `packages/web/src/pages/Account/Account.module.scss`
- NEW `packages/figma-plugin/src/__tests__/plan-modal-failed-payment.test.tsx`

### Phase 1.3 (2 h)
- MODIFY `packages/api/src/services/licenseService.ts`
- MODIFY `packages/api/src/services/flittService.ts`
- MODIFY `packages/api/src/routes/checkout/index.ts`
- EXTEND `packages/api/__tests__/license-service.test.ts`
- EXTEND `packages/api/__tests__/flitt-service.test.ts`
- EXTEND `packages/api/__tests__/checkout-routes.test.ts`
- MODIFY `packages/figma-plugin/src/ui/shared/licenseClient.ts`
- MODIFY `packages/web/src/pages/Account/Account.tsx`
- MODIFY `packages/web/src/pages/Account/Account.module.scss`
- (Optional) MODIFY `packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx`

---

## 9. Rollout

1. Develop on `dev` branch.
2. Implement Phase 1.1 → run all tests → user-verify in Figma → commit.
3. Implement Phase 1.2 → tests + verify (use admin override to set failureCount) → commit.
4. Implement Phase 1.3 backend first → tests → frontend → manual verify → commit.
5. After all 3 phases verified, optionally squash into one feat commit or keep granular.

**Commit messages:**
- `feat(plugin): show billing email in Plan modal for Pro users`
- `feat: failed payment warning banner with severity tiers`
- `feat(payment): reactivate canceled subscription before cycle ends`

---

## 10. References

- **Master plan:** [`docs/plans/PAYMENT-SYSTEM.md`](./PAYMENT-SYSTEM.md)
- **Project memory:** `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/project_payment-system.md`
- **Flitt API reference:** `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/reference_flitt-api.md`
  - **Section to verify:** "Subscription Actions API" — confirm `action: "resume"` after `stop`.
- **Phase 2 plan:** [`docs/plans/PHASE-2-ADMIN-PANEL.md`](./PHASE-2-ADMIN-PANEL.md)
- **Phase 3 plan:** [`docs/plans/PHASE-3-REVENUE-FEATURES.md`](./PHASE-3-REVENUE-FEATURES.md)
- **Project rules (CLAUDE.md):** root `CLAUDE.md` — TDD, plan mode, verify-before-commit.
- **Flitt official docs:** https://docs.flitt.com/

---

## 11. Open questions / risks

1. **Flitt resume after stop** — RESOLVE BEFORE Phase 1.3 implementation. Contact: support@flitt.com.
2. **failureCount semantics** — Currently webhook just increments on every declined event. May want to differentiate "first attempt failed" vs "all retries exhausted". Defer if not problematic in sandbox testing.
3. **Email PII in Plan modal** — billing email is sensitive. Currently shown in plain text. Consider truncating in future (e.g. `g••••@example.com`). Out of scope for Phase 1.
