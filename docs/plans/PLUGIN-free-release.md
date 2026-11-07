# Plugin release: free mode UI (remove Screenshot + all pricing)

Status: **PROPOSED, awaiting owner approval** · 2026-11-07
Scope: `packages/figma-plugin` only (the allowed work zone). The API, extension, shared package and website are not touched.

## 1. Owner's decisions (2026-11-07)

1. Remove the **Screenshot** tab. It used the paid Anthropic API, and `ANTHROPIC_API_KEY` is removed in Render.
2. Remove **everything about pricing**: the `3/1000` footer pill, the "Get Pro" modal, the Plan modal,
   the "imports left / See Pro" lines and the "Pro expiring" modal.
3. Fix the plugin **name/description** so it doesn't mention screenshot.
4. **HTML stays.** It runs on the same free Chromium as URL import, with no paid service.

## 2. What stays (invisible plumbing, on purpose)

- **Figma login (ConnectionGate) + license fetch**: this is our **email list / user base** (Glinc strategy).
  It keeps `figmaUserId` + email in Mongo and feeds `/admin/stats`.
- **Server quota ping** (`/api/import-w2w-file` etc.): it keeps per-user import counts for stats. The server
  cap is 1000/month, so nobody reaches it.
- Newsletter subscribe in Help (`Help.tsx`, uses the license email).

## 3. Changes (file by file)

| # | File | Change |
|---|---|---|
| 1 | `ui/components/subHeader/SubHeader.tsx:13-18` | Drop `{ id: "screenshot" }` from `VISIBLE_TABS`. The tabs become Web · Area · HTML. |
| 2 | `ui/App.tsx` | Remove the Screenshot import (`:7`) and its `case "screenshot"` (`:490`). Remove the `Plan`, `ExpiringSoonModal` mounts (`:637`, `:646`) and their state/effects (`isPlanOpen`, plan-modal event listener, `expiringDaysRemaining` effect `~:203-215, :276, :353`). Remove `onPlanClick` from the Footer. Narrow `ImportTab` to `"web" \| "html" \| "area"` (also in SubHeader). |
| 3 | `ui/components/modalPopup/QuotaExceededModal.tsx` | **Rewrite** as a plain, price-free notice: "Monthly fair-use limit reached (1000 imports). It resets next month." with only a Close button. Keep it mounted: if the 1000 cap is ever hit, the user gets a clear message instead of a silently stuck import. (`App.tsx:638-645` drops the "Get Pro" handler.) |
| 4 | `ui/components/footer/Footer.tsx` | Remove the plan pill (`deriveLabel :34-54`, markup `~:168-173`, `onPlanClick` prop, `useLicense` if it becomes unused). The settings, help, Extension and rebind buttons stay. |
| 5 | `ui/components/nextStepCard/NextStepCard.tsx` | Remove the quota lines (`:121-147`) and the `onSeePro` prop. Suggestion cards stay. `canImport` becomes always true, so drop the `deriveQuota` use. |
| 6 | `ui/pages/import/web/Web.tsx:40, :561` | Drop the `requestPlanModal` import and `onSeePro={...}`. |
| 7 | `package.json` → `figma-plugin.name` (generates `manifest.json`) | `Website to Figma — Import any site or HTML as editable designs (Web2Wireframe)` |
| 8 | **Delete orphans** (made unused by #1–#6) | `ui/pages/import/screenshot/` (whole folder), `ui/components/modalPopup/planPopup/`, `ui/components/modalPopup/ExpiringSoonModal.tsx`, `ui/shared/planEvents.ts`, `ui/shared/quota.ts` (if unused after #5). |

**Not deleted, mentioned only:** checkout and cancel helpers inside `licenseClient.ts` that only the Plan modal
used. They are dead code after this change, and we can remove them later in a separate cleanup so this diff
stays reviewable.

## 4. Tests (TDD: update and write first, then code)

- **Update:** `subHeader.test.tsx` (3 tabs, no Screenshot), `next-step-card.test.tsx` and
  `web-next-step.test.tsx` (no quota text, no "See Pro"), footer tests (no pill), and any App-level test that
  mounts Plan.
- **New:** `QuotaExceededModal` shows the fair-use text and has no "Pro" or "$" in it. The footer renders no
  `/1000`.
- **Delete with their code:** `plan-modal-*.test.tsx` (6), `screenshot-tab.test.tsx`,
  `screenshot-import.test.tsx`, `screenshot-crop.test.ts`, `quota-derive.test.ts` (if `quota.ts` is deleted),
  `subscribeButton.test.tsx` (only if it tests the Plan modal; check first).
- Gate: `pnpm --filter plugin-frontend test` + typecheck green.

## 5. Verification in Figma (required before commit)

The dev plugin talks to `localhost:3002` while `USE_PRODUCTION = false`. Two ways to check:
- **Look-only check (default):** open the dev plugin. You should see 3 tabs, no pill, no Pro anywhere. Imports
  fail (no local API), which is expected.
- **Real import check:** temporarily set `USE_PRODUCTION = true` locally (no commit). Then the dev plugin
  imports through the live API: run a Web, HTML and Area import, and check that NextStepCard shows no quota.
  **Set it back to `false` before any `git add`.**

## 6. Release (owner)

1. Commit on `dev` (only the plugin files plus this doc), with `USE_PRODUCTION = false` checked.
2. Merge to `main` is optional for the plugin (no server effect), but it keeps git in sync.
3. Kill the watch (`pgrep -fl "create-figma-plugin/build"` → `kill`), set `USE_PRODUCTION = true`,
   run `npm run build`, then set it back to `false`.
4. Figma desktop → Plugins → Manage plugins in development → **Publish** a new version (ID `1646327864971730293`).
   In the publish form, update the **description**: remove the screenshot and pricing text, say it's free.

## 7. Risks

- **Old published version** users keep seeing the old UI until Figma updates them (usually immediate on the
  next launch). The API already serves them a 1000 limit, so nothing breaks.
- **Screenshot tab in old versions**: with `ANTHROPIC_API_KEY` removed it returns an error. That's acceptable
  until the new version propagates.
- Deleting ~10 files: a missed import makes the build fail, which typecheck and tests catch before Figma does.
