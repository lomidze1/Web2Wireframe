# Hotfix: lift the free import limit (3 → 1000)

Status: **PROPOSED, awaiting owner approval** · 2026-11-07

## 1. Why

- The 10 → 3 pricing experiment (2026-10-17) ended with 0 payments, and the owner decided W2W goes free.
- The limit is still `PLAN_LIMITS.free.imports = 3` in the live API. Every user who makes a 4th import in a month
  gets the "You've reached your free limit — $16 Get Pro" modal. The owner hit it on 2026-11-07.
- The hosting move to $0 is done: Render Free plus Atlas M0 `w2w-free` (1048 docs migrated, verified by
  that same modal reading the license from the new DB). This hotfix is the last blocker to "free and working".

**Goal:** no user can be blocked by the import limit, with the smallest possible change to the LIVE API
and **no change** to the published plugin, the extension or the website.

## 2. The decision: 1000, not Infinity

The limit is one constant. The server gate (`licenseService.useImport`) and the `limits.imports` value every
client reads at runtime both come from it. How the **already-published** clients show each choice:

| Where (published, can't change quickly) | `free: 1000` | `free: Infinity` (serialized as `null`) |
|---|---|---|
| Server gate (`useImport`, `$lt: limit`) | blocks only at 1000/month (nobody gets there) | never blocks |
| Plugin footer pill (`Footer.tsx:47`) | `5/1000` | **`5/3` + red "near limit" warning** (falls back to `?? 3`) ❌ |
| Plugin NextStepCard (`quota.ts`) | "995 free imports left this month" | no quota text ✅ |
| Extension footer pill (`planHelpers.ts` `usagePillText`) | `5/1000 imports per month` | **`5/3 imports per month`** (falls back to `?? 3`) ❌ |
| Extension Plan modal (`limitText`) | `5/1000 imports this month` | "5 imports this cycle (unlimited)" |
| Paywall modal (on a 403 `limit_exceeded`) | never shows | never shows |

`Infinity` makes both published clients show a **false "over the limit" warning**. `1000` shows honest
numbers everywhere and blocks nobody, so we go with **1000**. Polishing the UI (removing the pill, the counts
and the Pro modal) belongs to the later plugin and extension free-mode release, not this hotfix.

Also checked:
- **Existing usage counters need no data migration.** Users at 3/3 drop below the new gate at once, because
  the gate compares `usage.imports < 1000` on every call. Their monthly lazy reset keeps working as before.
- **No Pro user is affected** (the Pro branch ignores the limit).
- `Number.isFinite(1000)` holds, so `serializeLicense` sends `limits.imports: 1000` (`serializeLicense.ts:43-56`).

## 3. Scope: exact changes (LIVE zone `packages/api`, approved by owner 2026-11-07)

| File | Change |
|---|---|
| `packages/api/src/models/License.ts:83-91` | `free: { imports: 3 }` → `free: { imports: 1000 }`. Update the doc comment: the experiment ended, W2W is free, and why the value is 1000 rather than Infinity (the published clients' `?? 3` fallback). |
| `packages/api/__tests__/license-model.test.ts` | Assert `PLAN_LIMITS.free.imports === 1000` (test written first, TDD). |
| `packages/api/__tests__/license-routes.test.ts` | `limits.imports` expectation 3 → 1000. |
| `packages/api/__tests__/extension-session.test.ts` | `license.limits.imports` expectation 3 → 1000. |
| `packages/api/__tests__/license-service.test.ts` | `remaining: 2` → `remaining: 999`. Add a regression test: a Free user with `usage.imports = 3` gets `ok` (i.e. the old wall is gone). |

**Not touched, on purpose:**
- `packages/shared`, `packages/browser-extension`, `packages/figma-plugin`, `packages/web`.
- `emailService.ts` copy "Free plan (3 imports per month)": it is only in the Pro-expiry reminder (cron
  disabled through `EXPIRY_REMINDERS_ENABLED`) and the refund email (no Pro buyers exist). It gets fixed in the
  full free-mode cleanup.
- The website still says "3 imports / month" on Pricing, the landing pages and Terms. That is a follow-up, and
  it goes out with the free-mode website copy.

## 4. Steps

| # | Step | Verify |
|---|---|---|
| 1 | Update the 4 test files first (TDD) and run them against the old constant | They **fail** on the 3 vs 1000 assertions |
| 2 | Change the constant and its comment | — |
| 3 | `pnpm --filter @w2w/api test` and `pnpm --filter @w2w/api type-check` (or `tsc --noEmit`) | All green, no type errors |
| 4 | Pre-commit gate: `USE_PRODUCTION = false` (it is, `apiConfig.ts:22`). `git status`: stage **only** the 5 API files (the working tree has unrelated docs and skill deletions that must stay out) | `git diff --cached --stat` = 5 files |
| 5 | Commit on `dev`: `fix(api): lift free import limit 3 → 1000 (W2W is free)` | — |
| 6 | **Owner confirmation, then push.** `dev` → push. Merge `dev` → `main` (`--no-ff`, as before) → push `main` | `git diff origin/main dev -- packages` was empty before the change, so `main` gets only this API change plus 3 docs commits. The website (Vercel) builds the same site |
| 7 | Render auto-deploys `main` (~3–5 min, Free instance) | Render Events: deploy **Live**. Logs: no Mongo or auth errors |
| 8 | Live API check | `curl /api/health` returns 200 |
| 9 | Owner's acceptance test in Figma: 4th+ import of the month | The import succeeds and the paywall does **not** appear. The footer pill reads `N/1000` |

## 5. Risks and rollback

- **Rollback (fast):** Render → Deploys → previous deploy → **Rollback** (about 1 min, no git needed).
  Clean rollback: `git revert` the commit and merge to `main`.
- **Render Free build:** the deploy rebuilds the Docker image on 0.1 CPU. The 2026-11-07 deploy built and
  went live fine, so this is a low risk.
- **Abuse:** 1000/month per Figma user still caps runaway loops on the URL and HTML import (Chromium on a
  512 MB instance). That is a reason not to use Infinity on the server either.
- **Screenshot import** still calls the paid Anthropic API, and 1000/month makes it effectively unmetered.
  **Open question for the owner, see below.**
- **"Payment failed" banner on Render:** the outstanding Standard-tier invoice. It is unrelated to this deploy
  but must be paid or resolved, or Render may suspend the workspace.

## 6. Open questions for the owner

1. **Screenshot import** (paid Anthropic API): keep it working, or turn it off now? The cheapest no-code
   switch is to remove or blank `ANTHROPIC_API_KEY` in Render, so screenshot imports error out while
   URL, HTML and extension imports keep working. The plugin then shows a generic error on that tab until the
   plugin release removes the tab. Recommended: turn it off now, matching the 2026-11-05 decision.
2. Execution in **this session** (recommended) vs. linked sessions: this is one sequential change of
   5 files that touch each other, so parallel sessions would add coordination cost and no speed.
   Linked sessions make sense later, for the free-mode cleanup (plugin, extension and website are
   independent there).

## 7. After this hotfix (separate tasks, not now)

- Free-mode release: remove the paywall, Flitt, screenshot, pill and counts from the plugin, extension and
  website, plus the website copy ("3 imports"), SEO price schema and Terms.
- After a few stable days on M0: terminate the old Atlas FLEX cluster `Web2Wireframe` (backup at
  `~/w2w-backup/atlas-2026-11-05.gz`). Check whether `check-subscriber-api` on Render shares the 750 free
  hours, and suspend it if unused.
- Rotate `ADMIN_TOKEN` (it was pasted into chat).
