# Extension Identity Parity Plan — h2d-style "Your Plan" + User + Logout + Upgrade

> Planning artifact written per `~/.claude/Prompter.md` (XML-tagged feature design).
> Status: **DRAFT — pending owner approval.** No code changes yet.
> Date: 2026-05-26.
> Supersedes: Layer A from [audit-browser-extension-plan.md](./audit-browser-extension-plan.md) (Layer A shipped 2026-05-25 as content cleanup; this plan is Layer B + h2d-parity UI).

---

<task>
Bring the Browser Extension's account/license UX to parity with html.to.design ("h2d"): show the actual logged-in user, real plan status, live usage counter, in-extension Upgrade to PRO, and Logout — sourced from the same MongoDB license document the Figma plugin already reads via [/api/license/me](../../packages/api/src/routes/license/index.ts).
</task>

<context>
**Current state (audit verified 2026-05-25):**
- Browser Extension is fully anonymous: zero `figmaUserId` references in `packages/browser-extension/src` (grep).
- "Your Plan" modal is a *Compare-plans* screen, not a real plan screen. Layer A (shipped) removed the false "Free Plan" badge but the modal still doesn't fetch any data.
- Identity bridge exists but is one-way: the Figma plugin issues a pairing code via `POST /api/extension-pair` ([cdp.ts:81-108](../../packages/api/src/routes/plugin/cdp.ts), 10-min TTL); the extension's Options page accepts the code ([options/main.tsx:62](../../packages/browser-extension/src/options/main.tsx)); the backend resolves code → `figmaUserId` *only on capture requests* ([cdp.ts:67-78](../../packages/api/src/routes/plugin/cdp.ts)). The extension never learns who the user is.
- The Figma plugin already has the canonical "Your Plan" experience: [Plan.tsx:220-321](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx) — Current plan badge, Status, Usage, Access expires, Account ID, Manage Subscription, and Get-Pro cards with checkout polling. We will mirror its data + behavior, not redesign from scratch.

**Target (per owner — h2d as visual reference):**
- Top-bar "Upgrade to PRO" button (yellow, header-pinned).
- Account dropdown menu: `User: <email>` · `Logout` · `Upgrade to PRO` · `Contact us`.
- Footer pill: "10 FREE imports left — Reset in 29 days" (live from license JSON).
- "Your Plan" modal: a real plan screen with Status / Usage / Access expires / Account ID, mirroring [Plan.tsx](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx). NOT a Compare-plans table.

**Why now:** without an identity hop, Pro users see "Free" in the extension forever, the footer counter cannot be shown, and Upgrade-to-PRO has no figmaUserId to send to `/api/checkout/create`. Same root cause for all three.
</context>

<reference_artifacts>
- **h2d screenshots (owner-provided 2026-05-26):**
  - Header has a yellow `Upgrade to PRO` button + "Made by div.RIOTS" attribution. The dropdown menu (3-dot or avatar trigger) lists: `Edit extension shortcuts`, `User: <email>`, `Logout`, `Upgrade to PRO`, `Contact us`.
  - Footer pill: `10 FREE imports left — Reset in 29 days` (Figma icon on the left, help icon on the right).
  - Plan modal: card with `Current plan: PRO · MONTHLY` badge, then a metadata grid (`Status: Active`, `Usage: 0 imports this cycle (unlimited)`, `Access expires: in 392 days`, `Account ID: <Figma user id>`), then `Upgrade to Yearly — Save 25% ($144 / 365 days)` CTA.
- **Internal canonical Plan UI:** [packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx). Same labels, same data shape — port verbatim into the extension.
- **License API contract:** [packages/api/src/routes/license/index.ts](../../packages/api/src/routes/license/index.ts) — `SerializedLicense` is already the right wire shape (`plan`, `status`, `cycleEndsAt`, `usage.imports`, `limits.imports`, `subscription.lastDuration`, `email`).
- **Pairing code primitive:** [packages/api/src/routes/plugin/cdp.ts:81-108](../../packages/api/src/routes/plugin/cdp.ts), state map [packages/api/src/state.ts](../../packages/api/src/state.ts).
- **Plugin's checkout flow (to replicate):** [Plan.tsx:100-189](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx), [licenseClient.ts:250-287](../../packages/figma-plugin/src/ui/shared/licenseClient.ts).
</reference_artifacts>

<requirements>

### Functional

1. **Identity hop:** when the user pastes a pairing code into the extension Options page, the extension obtains a long-lived session that knows `figmaUserId` and `email`. No re-paste needed for daily use.
2. **Live "Your Plan" modal:** mirrors the plugin's Plan modal — Current plan badge (`FREE` / `PRO · MONTHLY` / `PRO · YEARLY`), Status, Usage (live counter), Access expires (`inDaysPhrase()`), Account ID. Loading / error / unpaired states all rendered.
3. **Upgrade to PRO from the extension:** opens `/api/checkout/create` checkout URL in a new tab. Polls `/api/license/me` after the user returns (mirror plugin polling at [Plan.tsx:145-189](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx)).
4. **Logout:** clears the extension's stored session (token + figmaUserId + email + pairingCode). Backend-side: best-effort token revoke.
5. **Footer usage pill:** when license is loaded, render `"N FREE imports left — Resets in D days"` (free tier) or `"Pro · Active until <date>"` (pro tier). Hidden while unpaired or loading.
6. **Account dropdown menu (account-aware Footer):** when authenticated → `User: <email>` + `Logout` + `Upgrade to PRO` (if free) + `Contact us`. When unpaired → `Pair with the Figma plugin` CTA opening Options page.

### Non-functional

- No new auth surface that bypasses the existing trust root (figma.currentUser.id verified by the Figma OAuth Bearer token). Extension session must derive its identity *from* the verified plugin identity, not in parallel to it.
- All extension license traffic over HTTPS to the same `api.web2wireframe.design` host. No card data, no Flitt SDK in the extension.
- No card data, no Flitt API key, no AUTH_SECRET inside the extension bundle.
- Build size budget: extension popup bundle should stay under +5 KB gzip after this change (current popup: 4.93 KB gzip).
- TypeScript strict; no `any`; Preact (not React).

</requirements>

<architecture>

### Identity hop — recommended approach

**Pairing code redemption → extension session token (Bearer).**

```
┌──────────────────┐   ❶ POST /api/extension-pair (plugin Bearer)        ┌──────────────┐
│  Figma plugin    │ ─────────────────────────────────────────────────▶  │   Backend    │
│  (BrowserExt tab)│ ◀───────────────────────────────────────────────── │              │
│                  │   ❷ { code: "ABC23XYZ", expiresInSeconds: 600 }     │ pendingPair  │
└──────────────────┘                                                     └──────────────┘

User copies the code to the extension's Options page.

┌──────────────────┐   ❸ POST /api/extension-session/redeem                ┌──────────────┐
│   Extension      │      { pairingCode: "ABC23XYZ" }                     │   Backend    │
│                  │ ─────────────────────────────────────────────────▶   │              │
│                  │ ◀───────────────────────────────────────────────── │ verify code, │
│                  │   ❹ { sessionToken, expiresAt, figmaUserId,         │ delete code, │
│                  │       email, license: <SerializedLicense> }         │ issue HMAC   │
└──────────────────┘                                                     └──────────────┘

┌──────────────────┐   ❺ subsequent calls — Authorization: Bearer <sessionToken>
│   Extension      │ ─────────────────────────────────────────────────▶  /api/license/me
│                  │ ─────────────────────────────────────────────────▶  /api/checkout/create
│                  │ ─────────────────────────────────────────────────▶  /api/import-w2w (replace pairingCode with Bearer)
└──────────────────┘
```

Why not just keep using the pairing code as the credential for license calls (Layer B from audit)?

- Pairing codes are 10-min TTL by design — fine as a one-time handoff, but the extension session must outlive that window.
- Keeping pairing code valid past redemption widens the brute-force window unnecessarily ([cdp.ts:55-61](../../packages/api/src/routes/plugin/cdp.ts) explicitly invalidates older codes for this reason).
- Long-lived Bearer token = same model the plugin uses ([licenseClient.ts:84-98](../../packages/figma-plugin/src/ui/shared/licenseClient.ts)) → one shared auth middleware, one revoke surface.

### Storage map (extension side)

| Key | Scope | Lifetime | Cleared on |
|-----|-------|----------|------------|
| `extensionSession.token` | `chrome.storage.local` | 30 days (TTL renewed on use) | Logout, token revoke |
| `extensionSession.expiresAt` | `chrome.storage.local` | mirror of backend expiry | Logout |
| `extensionSession.figmaUserId` | `chrome.storage.local` | session | Logout |
| `extensionSession.email` | `chrome.storage.local` | session | Logout |
| `cachedLicense` | `chrome.storage.session` | popup-tab session | Logout, refresh-on-open |

`pairingCode` stays as an Options input for the *initial* hand-off but is wiped on successful redemption to avoid drift.

### Backend additions (new endpoints)

1. `POST /api/extension-session/redeem` — body `{ pairingCode }`. Validates pairing code via existing `pendingPairings` map; on success, mints an HMAC session token (same algorithm as plugin tokens — reuse [packages/api/src/middleware/auth.ts](../../packages/api/src/middleware/auth.ts)), deletes the pairing code, returns `{ sessionToken, expiresAt, figmaUserId, email, license }`. Rate-limited via existing `authRateLimiter`.
2. `POST /api/extension-session/refresh` — Bearer auth; mints a fresh token to extend the session. Best-effort; called when extension popup opens and the token is within 24 h of expiry.
3. `POST /api/extension-session/revoke` — Bearer auth; backend-side cleanup on logout. Optional; primary state is local.
4. **Reuse existing routes for everything else.** `/api/license/me`, `/api/checkout/create`, and `/api/import-w2w` accept the same Bearer scheme — just need to allow extension-issued tokens through the same `authenticatePlugin` middleware (the secret + algorithm are identical). Extension's `/api/import-w2w` calls migrate from `pairingCode` body field to `Authorization: Bearer <sessionToken>`.

### Extension code layout (new + changed)

```
packages/browser-extension/src/
  shared/
    licenseClient.ts            ← NEW: redeem / refresh / revoke / fetchLicense / createCheckout (port from plugin's licenseClient.ts; trim to extension's needs)
    types.ts                    ← ADD: ExtensionSession, CachedLicense
  popup/
    components/
      PlanModal.tsx             ← REWRITE: drop compare-plans, render Status / Usage / Access expires / Account ID; add unpaired/loading/error states
      AccountMenu.tsx           ← NEW: dropdown — User / Logout / Upgrade to PRO / Contact us
      UsagePill.tsx             ← NEW: footer pill with imports-left counter
      Footer.tsx                ← UPDATE: mount UsagePill + AccountMenu trigger
    hooks/
      useExtensionLicense.ts    ← NEW: { license, isLoading, error, refresh, logout } — mirror plugin's LicenseContext but extension-flavored
  options/
    main.tsx                    ← UPDATE: pairing code field now triggers redeem on save; show paired-state badge with email
```

</architecture>

<phases>

### Phase 1 — Backend session endpoints
- New file `packages/api/src/routes/extension/session.ts` with `redeem` / `refresh` / `revoke` handlers.
- Tests in `packages/api/__tests__/extension-session.test.ts`: redeem-success, redeem-invalid-code, redeem-expired-code, redeem-double-use, refresh-rotation, revoke-clears.
- Migrate `/api/import-w2w` to accept the Bearer token in addition to the existing `pairingCode` body field (dual-write for one release, then drop the body field). Backwards-compatible by default; **TODO marker** for removal.
- Verification: `pnpm --filter @w2w/api test` green; manual `curl` against `POST /api/extension-session/redeem` with a freshly issued pairing code.

### Phase 2 — Extension license client + session storage
- Port `packages/figma-plugin/src/ui/shared/licenseClient.ts` into the extension as `packages/browser-extension/src/shared/licenseClient.ts`, stripping out the Figma-OAuth-specific `connectFigma()` and replacing it with `redeemPairingCode()`.
- Add `chrome.storage.local` read/write helpers under `shared/session.ts`.
- Type-check + build clean.

### Phase 3 — Plan modal rewrite (real "Your Plan")
- Port [Plan.tsx](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx) structure into [PlanModal.tsx](../../packages/browser-extension/src/popup/components/PlanModal.tsx). Same Status / Usage / Access expires / Account ID grid. Same Get-Pro cards with checkout polling.
- States: `unpaired` → "Open the Figma plugin's Browser Extension tab to pair", `loading`, `error`, `loaded` (free), `loaded` (pro).
- Manual: load extension, pair, open modal — confirm all four states.

### Phase 4 — Account menu + Upgrade button
- New `AccountMenu.tsx` component triggered from the existing crown icon (repurpose) or a new avatar icon.
- Menu items: `User: <email>` (read-only), `Logout` (clears state, returns to unpaired UI), `Upgrade to PRO` (only when free; opens checkout flow via `createCheckout()`), `Contact us` (mailto or website link).
- Manual: pair, open menu, click Logout, confirm extension returns to unpaired state and counter pill disappears.

### Phase 5 — Footer usage pill
- New `UsagePill.tsx`. Reads from `useExtensionLicense()`.
- Free: `N FREE imports left — Resets in D days` (links to Plan modal).
- Pro: `Pro · Active until <date>` (links to Plan modal).
- Hidden when unpaired or `isLoading`.

</phases>

<example>
<input>
Logged-in user, Pro Monthly, 0 imports used, 392 days until cycle end.
</input>
<output>
Footer pill: "Pro · Active until Jun 2027"
Plan modal:
  Current plan: PRO · MONTHLY
  Status: Active
  Usage: 0 imports this cycle (unlimited)
  Access expires: in 392 days
  Account ID: 1082972835952103170
  CTA: "Upgrade to Yearly — Save 25% ($144 / 365 days)"
Account menu:
  User: lomidzegiorgi97@gmail.com
  Logout
  Contact us
(No "Upgrade to PRO" because already Pro; "Upgrade to Yearly" lives inside the modal.)
</output>
</example>

<example>
<input>
Anonymous (extension never paired).
</input>
<output>
Footer pill: hidden.
Plan modal: "Open the Figma plugin's Browser Extension tab to pair." button → opens chrome.runtime.openOptionsPage().
Account menu: only `Pair with Figma plugin` + `Contact us`.
Upgrade-to-PRO header button: hidden until paired.
</output>
</example>

<example>
<input>
Free user, 3/10 imports used, cycle resets in 21 days.
</input>
<output>
Footer pill: "7 FREE imports left — Resets in 21 days"
Plan modal:
  Current plan: FREE
  Status: Active
  Usage: 3/10 imports this month
  Cycle resets: in 21 days
  Account ID: <figma id>
  Cards: Monthly · $16 / Yearly · $144 (Get Pro buttons)
Account menu:
  User: <email>
  Upgrade to PRO
  Logout
  Contact us
</output>
</example>

<constraints>

### Out of scope (explicitly deferred)

- "Manage Subscription" entry-point inside the extension. Stays in the plugin until launch traffic justifies a second surface. Rationale: extra token-issue route + Account-page deep-link + duplicated cancel flow for a button that <5% of users will click monthly.
- Independent Figma OAuth flow inside the extension. The pairing code already proves plugin → extension co-ownership; redoing OAuth from a non-Figma surface is more friction, not less.
- "Edit extension shortcuts" item in the dropdown (h2d has it; W2W extension has no custom shortcuts yet — add only when shortcuts ship).
- Localization. KA strings will be added in a follow-up.
- Telemetry / analytics on login/logout/upgrade clicks.

### Hard constraints

- **No Flitt SDK in the extension.** Card data never reaches us. Checkout URL comes from backend.
- **No AUTH_SECRET in the extension bundle.** Token verification happens server-side only.
- **No deletion of the existing pairing code flow** in this PR. Capture routes keep accepting `pairingCode` body field through one release for clean rollback; flip to Bearer-only afterwards.
- **No new dependencies.** Use `fetch`, `chrome.storage`, existing Preact, existing CSS classes.

### Risk register

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Extension session token leakage via XSS on a captured page | Low (popup is isolated) | Store in `chrome.storage.local`, never in `document.cookie`; don't include in capture page context |
| Long-lived token revoked server-side, extension keeps trying | Medium | On 401, clear local session and show "Reconnect via Figma plugin" — same recovery as plugin's [Plan.tsx:266-280](../../packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx) |
| Pairing-code double-use race (user opens 2 extension instances) | Low | Backend deletes code on first successful redeem; second redeem returns 404 with clear error |
| Checkout opened from extension, user pays, plugin doesn't know | Low | Both surfaces fetch `/api/license/me` on next open; the backend is the source of truth |

</constraints>

<verification>

### Per-phase

- **Phase 1:** `pnpm --filter @w2w/api test` green; new tests assert redeem/refresh/revoke; existing `cdp` route tests still green.
- **Phase 2:** `pnpm --filter web2wireframe-extension type-check && pnpm --filter web2wireframe-extension build` clean. No new test required (port-only).
- **Phase 3:** Manual — pair with plugin, open extension Plan modal, verify all four states by toggling local network conditions (block API → error; clear storage → unpaired).
- **Phase 4:** Manual — paired state, open Account menu, click `Logout`, confirm UI returns to unpaired state immediately; click `Upgrade to PRO`, confirm checkout opens in a new tab with the right URL.
- **Phase 5:** Manual — verify counter against the plugin's Plan modal numbers (must match exactly; same backend, same license).

### End-to-end smoke

1. Fresh state (uninstall + reinstall extension).
2. Plugin → Browser Extension tab → copy pairing code.
3. Extension Options → paste code → save → confirm success badge with email.
4. Open popup → confirm footer pill shows correct counter.
5. Click crown icon → Plan modal opens with real plan, real usage, real expiry.
6. Click Account → confirm email matches Figma account.
7. Click Logout → confirm popup returns to unpaired state.

### Regression scope

- `/api/import-w2w` still works with the legacy `pairingCode` body field (dual-write) — confirm by capturing a page from a non-upgraded extension build.
- Plugin's own Plan modal: untouched; tests `plan-modal-*.test.tsx` should pass unchanged.

</verification>

<resolved_decisions>

> Resolved 2026-05-26 via owner interview (AskUserQuestion).

1. **Session token lifetime: 30 days** with rolling refresh on each popup open (refresh fires when < 24 h to expiry).
2. **Pro-user header "Upgrade to PRO" button: hidden** (the in-modal "Upgrade to Yearly" CTA covers monthly→yearly).
3. **Pairing UX v1: manual code paste.** Plugin shows 8-char code → user pastes into ext Options. Figma deep-link / QR deferred.
4. **Logout: backend revoke + local clear.** `POST /api/extension-session/revoke` invalidates the HMAC token server-side; extension then wipes local state.
5. **Footer usage pill: clickable** → opens the Plan modal (same target as the crown icon; both surfaces stay functional).
6. **Header redesign (h2d-style dark bar + "Upgrade to PRO" button):** **out of scope for this plan.** Revisit as a separate UI pass once Phases 1-5 ship.

</resolved_decisions>

<output_format>

Once approved, implementation lands in **5 PRs** (one per Phase), each independently reviewable and revertable. PR titles:

1. `feat(api): extension session redeem/refresh/revoke endpoints`
2. `feat(extension): licenseClient + session storage`
3. `feat(extension): Your Plan modal — live license data`
4. `feat(extension): account menu (user/logout/upgrade)`
5. `feat(extension): footer usage pill`

Each PR includes its own verification steps from the matching Phase section above.

</output_format>

<approval_required>
- [x] **Approach approved** (pairing code → bearer session token).
- [x] **Phase split approved** (5 PRs in order above).
- [x] **Open questions resolved** (decisions captured in `<resolved_decisions>` above).
- [ ] **Out-of-scope list approved** (or items moved into scope) — **pending owner sign-off.**

After approval: enter Plan Mode for **Phase 1** specifically (backend session route + tests), present a focused implementation plan, and start coding only after the Phase-1 plan is approved.
</approval_required>
