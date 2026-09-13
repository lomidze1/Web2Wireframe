# Browser Extension "Your Plan" Modal — Audit Report

**Author:** Investigation pass (no code changes).
**Date:** 2026-05-25
**Scope:** Browser Extension `PlanModal` displayed-plan bug + modal content staleness.

---

## TL;DR / შემაჯამებელი

**KA:** `PlanModal.tsx`-ი hard-coded mock UI-ია — არცერთი network call არ ხდება, `figmaUserId` არ არსებობს extension-ში, "Free Plan" badge ჩაწერილია JSX-ში string-ად ([PlanModal.tsx:50](../../packages/browser-extension/src/popup/components/PlanModal.tsx)). მისი მონაცემები არ მოდის backend-დან, ამიტომ ვერც pro-მომხმარებელს, ვერც ვერავის სხვას ვერ ეჩვენება სწორი ფაქტიური plan-ი. დამატებით, modal-ი ჯერ კიდევ "Plus" და "Pro" tier-ებზეა აგებული, "AI generation" და "Priority support" feature-ებით — სამივე გადაიდო ([PAYMENT-SYSTEM.md:417](../plans/PAYMENT-SYSTEM.md), [CLAUDE.md project Payment System notes]).

**EN:** `PlanModal.tsx` is a hard-coded mock — no network call, no `figmaUserId`, and the "Free Plan" badge is a literal string in JSX. The backend was never consulted; every user sees the same screen. The modal also still ships obsolete tier names ("Plus", "Pro") and feature rows ("AI generation", "Priority support") that were dropped from the launch plan.

---

## 1. Data Flow Map / მონაცემთა ნაკადი

Numbered hops, each with `file:line` evidence.

### A. Browser Extension side (broken — no hops to backend)

| # | Step | File:line | Status |
|---|------|-----------|--------|
| 1 | User clicks crown icon in popup footer | [Footer.tsx:11-19](../../packages/browser-extension/src/popup/components/Footer.tsx) | OK |
| 2 | `onPlanClick` → `setShowPlanModal(true)` in App.tsx | [App.tsx:38, App.tsx:211, App.tsx:216](../../packages/browser-extension/src/popup/App.tsx) | OK |
| 3 | `<PlanModal isOpen={…} onClose={…} />` mounts | [App.tsx:216](../../packages/browser-extension/src/popup/App.tsx) | OK |
| 4 | **Component renders entirely from constants** — no `useEffect`, no `fetch`, no props carrying license data | [PlanModal.tsx:14-22, :50](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | **BROKEN** |
| 5 | Plan badge → hard-coded string `"Free Plan"` | [PlanModal.tsx:50](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | **BROKEN** |
| 6 | "View Plans" button → opens `https://web2wireframe.design/pricing` in new tab | [PlanModal.tsx:88](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | OK (target page exists at [packages/web/src/pages/Pricing](../../packages/web/src/pages/Pricing/)) |

The flow **terminates inside the component**. The backend is never reached.

### B. Backend license endpoint (works — but extension never calls it)

| # | Route | File:line | Auth |
|---|-------|-----------|------|
| 7 | `GET /api/license/me` returns full `SerializedLicense` | [routes/license/index.ts:118-128](../../packages/api/src/routes/license/index.ts) | `authenticatePlugin` Bearer HMAC |
| 8 | Identity = `req.userId!` (from verified plugin token, **not** body/query) | [routes/license/index.ts:121](../../packages/api/src/routes/license/index.ts) | — |
| 9 | `licenseService.getOrCreate(figmaUserId)` → MongoDB lookup; if no doc → creates a Free one | [routes/license/index.ts:122](../../packages/api/src/routes/license/index.ts) | — |
| 10 | Response shape includes `plan` (`"free" \| "pro"`), `cycleEndsAt`, `usage.imports`, `limits.imports` (null = unlimited), `subscription.lastDuration`, etc. | [routes/license/index.ts:36-103](../../packages/api/src/routes/license/index.ts) | — |

### C. Figma plugin (working reference flow — for contrast)

| # | Step | File:line |
|---|------|-----------|
| 11 | Plugin sandbox reads `figma.currentUser.id`, posts to UI | [packages/figma-plugin/CLAUDE.md "License & Payment Integration"] |
| 12 | UI stores in `ConfigContext.figmaUserId` | [Plan.tsx:50-51](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx) |
| 13 | `LicenseProvider` preloads via `fetchMyLicense(figmaUserId)` with `Authorization: Bearer <token>` | [licenseClient.ts:216-236](../../packages/figma-plugin/src/ui/shared/licenseClient.ts) |
| 14 | Bearer token comes from Figma OAuth → `connectFigma()` → backend-issued HMAC | [licenseClient.ts:118-152](../../packages/figma-plugin/src/ui/shared/licenseClient.ts) |
| 15 | Plan modal renders `planLabel = "PRO · YEARLY"`, status, usage, billing email, `cycleEndsAt` etc. | [Plan.tsx:199-321](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx) |

The plugin does the right thing. The extension simply doesn't participate.

---

## 2. figmaUserId Acquisition Analysis

**Search result:** `grep -rn "figmaUserId\|figmaUser" packages/browser-extension/src` returns **zero hits**.

The extension has no concept of `figmaUserId`:

- No storage key for it in [shared/constants.ts:STORAGE_KEYS / DEFAULT_SETTINGS](../../packages/browser-extension/src/shared/constants.ts)
- No field for it on `ExtensionSettings` ([shared/types.ts:416-424](../../packages/browser-extension/src/shared/types.ts))
- No prompt to enter it on the Options page ([options/main.tsx](../../packages/browser-extension/src/options/main.tsx) — only `backendUrl` and `pairingCode` are exposed)
- No OAuth, no HMAC Bearer token, no `Authorization` header anywhere

**Closest existing primitive:** `settings.pairingCode` ([options/main.tsx:62-69](../../packages/browser-extension/src/options/main.tsx)). The user pastes a short code minted by the plugin via `POST /api/extension-pair` ([routes/plugin/cdp.ts:81-110](../../packages/api/src/routes/plugin/cdp.ts)). The extension sends it in capture request bodies ([background/utils/download.ts:100](../../packages/browser-extension/src/background/utils/download.ts)). The backend maps the code → `figmaUserId` server-side. **The extension itself never learns the figmaUserId.** That mapping is consumed only by capture routes; no equivalent license route exists for pairing-code-scoped identity.

**Conclusion:** the extension is anonymous from the license endpoint's standpoint. There is no plausible code path by which the modal could resolve the real user's plan with the current architecture.

---

## 3. Root Cause / ძირეული მიზეზი

**KA:** "Free Plan" badge ჰარდკოდირებულია JSX-ში — `<span class="plan-badge plan-badge-free">Free Plan</span>` ([PlanModal.tsx:50](../../packages/browser-extension/src/popup/components/PlanModal.tsx)). Modal-ი არცერთ backend call-ს არ აკეთებს, არც license context, არც chrome.storage state-ში ცოცხალი license. ეს არ არის network/auth bug — UI-ი არასოდეს ყოფილა wired live data-ზე. დამატებითი strukurული გადატვირთვა: extension-ი `figmaUserId`-ს არ ფლობს (zero references), `/api/license/me` მოითხოვს Figma OAuth-დან მიღებულ HMAC Bearer token-ს ([routes/license/index.ts:118-128](../../packages/api/src/routes/license/index.ts)), რომელიც extension-ში არ არსებობს. ერთადერთი user-binding extension-ში არის `pairingCode` ([options/main.tsx:62](../../packages/browser-extension/src/options/main.tsx)) რომელიც მხოლოდ capture-routes-ისთვის გამოიყენება — license-ისთვის backend-ში შესაბამისი route არ არსებობს.

**EN:** The "Free Plan" badge is a literal JSX string at [PlanModal.tsx:50](../../packages/browser-extension/src/popup/components/PlanModal.tsx); the modal makes no API call, holds no license state, and never reads anything from `chrome.storage`. This is **not** an auth or CORS fault — the UI was simply never wired to live data. Compounding it: the extension has **zero references to `figmaUserId`** (verified by grep), and `/api/license/me` requires a Figma-OAuth-derived HMAC Bearer token that only the Figma plugin holds ([routes/license/index.ts:118-128](../../packages/api/src/routes/license/index.ts)). The pairing-code mechanism ([routes/plugin/cdp.ts:81-110](../../packages/api/src/routes/plugin/cdp.ts)) does map code → `figmaUserId` server-side, but its only consumers are capture routes — there is no license endpoint scoped by pairing code today. Hypothesis 6 ("legacy UI never wired to live backend data") matches the evidence; hypotheses 1-5 are ruled out because there is no request to misroute, no token to invalidate, and no response to mis-parse.

---

## 4. "Your Plan" Modal Audit Table

| # | Field shown in modal | Current value source | Outdated? | Fix needed | Severity |
|---|---|---|---|---|---|
| 1 | Title "Your Plan" | [PlanModal.tsx:41](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | No | Keep | — |
| 2 | Badge "Free Plan" | [PlanModal.tsx:50](../../packages/browser-extension/src/popup/components/PlanModal.tsx) — hardcoded | **Yes — wrong for every paid user** | Either fetch real license OR replace with "Sign in via the plugin to see your plan" | **CRITICAL** |
| 3 | Column header "Plus" | [PlanModal.tsx:57](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | **Yes — "Plus" tier was removed** ([PAYMENT-SYSTEM.md:417](../plans/PAYMENT-SYSTEM.md): "remove `LicensePlan = 'free' \| 'plus' \| 'pro'` → `['free', 'pro']`") | Replace "Plus / Pro" columns with "Pro Monthly · $16 / Pro Yearly · $144" to match canonical plan table ([CLAUDE.md "Plans (launch — June 16, 2026)"]) | **HIGH** |
| 4 | Column header "Pro" | [PlanModal.tsx:58](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Partially — should disambiguate Monthly vs Yearly | Same as #3 | **HIGH** |
| 5 | Feature row "Imports per month: Unlimited / Unlimited" | [PlanModal.tsx:15](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Yes — hides the Free tier's 10/month cap, and hides the user's current usage counter | Show Free=10/mo; show live `usage.imports / limits.imports` when license is loaded | **HIGH** |
| 6 | Feature row "AI generation: ✗ / ✓" | [PlanModal.tsx:20](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | **Yes — feature dropped from launch** ("AI Generation tab does not exist in launch — code is on `ai-generation-backup` branch", [CLAUDE.md "Payment System"]) | Remove row | **CRITICAL** (false promise of unavailable feature) |
| 7 | Feature row "Priority support: ✗ / ✓" | [PlanModal.tsx:21](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Partially — Yearly-only per plugin ([Plan.tsx:383](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx) "Priority email support" in Yearly card) | Either remove or scope to Yearly only | MEDIUM |
| 8 | Feature row "Viewports: All / All" | [PlanModal.tsx:16](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Partially — Free also gets all viewports today, so the row is informationally empty | Either remove or replace with a real differentiator | LOW |
| 9 | Feature row "Full color & fonts: ✓ / ✓" | [PlanModal.tsx:17](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Same as #8 — identical across tiers | Remove or replace | LOW |
| 10 | Feature row "Real text content: ✓ / ✓" | [PlanModal.tsx:18](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Same | Remove or replace | LOW |
| 11 | Feature row "Styles & assets: ✓ / ✓" | [PlanModal.tsx:19](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Same | Remove or replace | LOW |
| 12 | No price shown | — | **Yes — missing $16 / $144** | Add prices in tier column headers | **HIGH** |
| 13 | No `cycleEndsAt` / "Cycle resets in X days" | — | **Yes — Pro user can't see when access expires; Free user can't see when quota resets** | Add when license is loaded (mirror plugin's `inDaysPhrase()` at [Plan.tsx:42-47](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx)) | **HIGH** |
| 14 | No usage counter | — | **Yes — Free users have no visibility into 10/mo quota** | Show `usage.imports / limits.imports` (or "(unlimited)") | **HIGH** |
| 15 | No status field | — | Yes — `canceled`/`expired` Pro can't be distinguished | Add when license is loaded | MEDIUM |
| 16 | No "Manage Subscription" entry point for paid users | — | Yes | Either add (using a website-Account deep-link with one-time token; would require a new extension-side identity mechanism) or document "Manage from the Figma plugin" | MEDIUM |
| 17 | CTA "View Plans" → `/pricing` | [PlanModal.tsx:88-91](../../packages/browser-extension/src/popup/components/PlanModal.tsx) | Label is fine; target exists ([packages/web/src/pages/Pricing](../../packages/web/src/pages/Pricing/)) | Keep, optionally rename to "See pricing" for consistency | LOW |
| 18 | No empty-state when not paired | — | Yes — silently shows "Free" even when user pasted no pairing code | Add "Connect to the W2W plugin to see your plan" notice when `settings.pairingCode === ""` | MEDIUM |
| 19 | No loading/error state | — | Yes — once wired up, must mirror plugin's `isLicenseLoading`/`displayError` UX ([Plan.tsx:256-282](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx)) | Add | MEDIUM |

---

## 5. Proposed Fixes

### Fix priority order

There are two independent layers to fix; each can ship without the other.

- **Layer A (content cleanup, no backend dependency):** rewrite modal copy/tiers/features to match the canonical launch model. Closes audit rows #3, #4, #6, #7, #8-11, #12, #17. Ships immediately.
- **Layer B (live data wiring):** thread the user's actual license into the extension. Closes #2, #5, #13, #14, #15, #16, #18, #19. Requires a small backend addition.

### Layer A — content cleanup (low risk, ~30 lines)

**File:** [packages/browser-extension/src/popup/components/PlanModal.tsx](../../packages/browser-extension/src/popup/components/PlanModal.tsx)

#### Change 1 — replace the obsolete features list

**Before** (lines 14-22):
```tsx
const PLAN_FEATURES: PlanFeature[] = [
  { name: "Imports per month", plus: "Unlimited", pro: "Unlimited" },
  { name: "Viewports", plus: "All", pro: "All" },
  { name: "Full color & fonts", plus: true, pro: true },
  { name: "Real text content", plus: true, pro: true },
  { name: "Styles & assets", plus: true, pro: true },
  { name: "AI generation", plus: false, pro: true },
  { name: "Priority support", plus: false, pro: true },
];
```
**After:**
```tsx
// Mirrors the Pro cards in the Figma plugin's Plan modal
// (packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx).
const PLAN_FEATURES: PlanFeature[] = [
  { name: "Imports per month", free: "10", pro: "Unlimited" },
  { name: "All viewports", free: true, pro: true },
  { name: "Full colors & fonts", free: true, pro: true },
  { name: "Styles & assets", free: true, pro: true },
  { name: "Priority email support", free: false, pro: true },
];
```
Update the `PlanFeature` interface to `free / pro` accordingly.

#### Change 2 — relabel column headers + add prices

**Before** (lines 56-59):
```tsx
<span></span>
<span class="plan-column plan-column-plus">Plus</span>
<span class="plan-column plan-column-pro">Pro</span>
```
**After:**
```tsx
<span></span>
<span class="plan-column plan-column-free">Free</span>
<span class="plan-column plan-column-pro">Pro · from $16</span>
```

#### Change 3 — until Layer B lands, stop asserting "Free Plan"

**Before** (lines 48-51):
```tsx
<div class="current-plan">
  <span class="plan-badge plan-badge-free">Free Plan</span>
</div>
```
**After (interim, Layer-A-only):**
```tsx
<div class="current-plan">
  <span class="plan-subtitle">Open the Figma plugin to view your current plan.</span>
</div>
```
This stops the false "Free" claim for paid users without yet adding any network code. Once Layer B is in, this block becomes the live badge.

**Risk:** zero — pure constant/copy changes, no behavior touched.
**Test:** load extension popup → click crown → visually confirm new copy. No automated test exists for this file today, so no test regression risk.

---

### Layer B — wire live license (medium risk, new backend route required)

**Backend addition:** new route `POST /api/license/by-pairing-code` (or extend `/api/extension-pair` redemption response). Returns the same `SerializedLicense` shape as `/api/license/me`, scoped by a valid pairing code.

**File:** [packages/api/src/routes/plugin/cdp.ts](../../packages/api/src/routes/plugin/cdp.ts) (or new file under `routes/license/`). Reuse `resolvePairingCode()` helper already used by `/api/import-w2w` ([cdp.ts:64-78](../../packages/api/src/routes/plugin/cdp.ts)) + `licenseService.getOrCreate()`.

**Extension changes:**

1. **File:** [packages/browser-extension/src/popup/components/PlanModal.tsx](../../packages/browser-extension/src/popup/components/PlanModal.tsx) — add `useEffect` on `isOpen` to fetch when modal opens:
   ```tsx
   useEffect(() => {
     if (!isOpen) return;
     chrome.storage.sync.get([STORAGE_KEYS.SETTINGS], async (stored) => {
       const settings = stored[STORAGE_KEYS.SETTINGS] as ExtensionSettings | undefined;
       const code = settings?.pairingCode?.trim();
       if (!code) { setState({ kind: "unpaired" }); return; }
       try {
         const res = await fetch(`${settings.backendUrl}/api/license/by-pairing-code`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ pairingCode: code }),
         });
         if (!res.ok) throw new Error(await res.text());
         setState({ kind: "loaded", license: await res.json() });
       } catch (err) {
         setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to load plan" });
       }
     });
   }, [isOpen]);
   ```
2. Render the four states (`unpaired` / `loading` / `loaded` / `error`) — mirror plugin's [Plan.tsx:251-282](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx) UX.
3. When `loaded`, show:
   - Badge: `Free` or `Pro · MONTHLY` / `Pro · YEARLY` (derive from `license.plan` + `license.subscription?.lastDuration`, see plugin [Plan.tsx:200-206](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx)).
   - Usage row: `usage.imports / limits.imports` (or "(unlimited)" when `limits.imports === null`).
   - Cycle row: `inDaysPhrase(cycleEndsAt)` — copy from plugin [Plan.tsx:42-47](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx).
4. When `unpaired`, link to the Options page with `chrome.runtime.openOptionsPage()`.

**Risk:** medium — new backend route, but it reuses an existing helper and an existing service. Auth model: the pairing code is already a bearer secret for capture; using it for read-only license lookup is the same trust level.

**Test plan:**
- Backend: unit test for the new route — valid code → license JSON, expired code → 401, missing code → 400.
- Extension: manual — paste pairing code in Options, open popup → click crown → verify Pro plan, usage counter, cycle date all populate. Try with no pairing code → verify "unpaired" notice.

---

## 6. Open Questions / დარჩენილი კითხვები

1. **Layer B identity model — pairing code vs full OAuth?** Reusing the existing pairing code is cheapest (no new auth surface) but means license lookup gets the same lifetime as the pairing code. Alternative: have the extension do its own minimal Figma OAuth. Recommendation: pairing code — fits launch timeline.
2. **Fallback wording when no pairing code is set** — "Connect to the W2W plugin to see your plan" vs "Sign in via the Figma plugin"? Owner pick.
3. **Should the extension's plan modal also offer "Get Pro" checkout, or only show status + link to /pricing?** The plugin owns the full checkout flow today; duplicating it in the extension means another surface to maintain. Recommendation: keep the extension read-only, link to `/pricing` for upgrades — matches the existing "View Plans" CTA intent.
4. **Should Pro users see a "Manage Subscription" button in the extension?** Possible, but it requires an extension-side analogue of `issueCancelToken` ([licenseClient.ts:299-325](../../packages/figma-plugin/src/ui/shared/licenseClient.ts)). Recommendation: skip for now, surface "Manage from the Figma plugin" hint instead.
5. **Should "Priority email support" be Yearly-only here too?** The plugin lists it under the Yearly card only ([Plan.tsx:383](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx)). The audit assumes yes; confirm before shipping the new feature list.
6. **Are there existing tests asserting the buggy hardcoded UI?** No automated test imports `PlanModal.tsx` (verified by grep). Layer A & B are free to change copy without test churn. The Figma plugin's plan tests (e.g. `plan-modal-yearly.test.tsx`) cover plugin Plan only and are unaffected.

---

## Appendix: search evidence

```
$ grep -rn "figmaUserId\|figmaUser" packages/browser-extension/src
(no output)
```

```
$ grep -rn "pairing\|pairingCode" packages/browser-extension/src
src/options/main.tsx:62      <label htmlFor="pairingCode">Pairing Code</label>
src/options/main.tsx:65        id="pairingCode"
src/options/main.tsx:66        value={settings.pairingCode}
src/background/utils/download.ts:100  pairingCode: settings.pairingCode,
src/shared/constants.ts:31   pairingCode: "",
src/shared/types.ts:423      pairingCode: string;
```

```
$ grep -n "Free Plan\|plan-badge" packages/browser-extension/src/popup/components/PlanModal.tsx
50:  <span class="plan-badge plan-badge-free">Free Plan</span>
```
