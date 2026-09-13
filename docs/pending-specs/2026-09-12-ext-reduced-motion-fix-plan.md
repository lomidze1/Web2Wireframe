# Fix plan: the extension capture reaches the API's reduced-motion state (2026-09-12)

## Root cause (verified)

The URL import boots stripe.com with `prefers-reduced-motion: reduce`: `emulateReducedMotion(page)` runs before `goto` (`packages/api/src/lib/htmlExtractor.ts:462`, implemented at `packages/api/src/lib/cdp/w2w-extraction.ts:920-932`). Stripe's own script then jumps its graphics straight to the finished state.

**The extension capture never emulates reduced motion.** Commit `922639e`'s message says "emulate prefers-reduced-motion before the first viewport override", but the code isn't in that commit, in HEAD, in any branch or stash, or in the built dist. So 1.0.5 shipped without it. The other two 09-08 fixes from the same session (scrollbar hide, platform-font numbering) did land.

Symptoms in `~/Downloads/stripe_com_1440_wireframe.w2w`:
- The platform-graphic cards (`__capital-content`, `__payouts-content`, `__feature-card__container`) are at opacity 0 plus their entrance transform. The plugin skips them as transparent, which is −72 nodes at section y≈7520.
- 0/31 `.billing-plan-graphic__bar` (scaleY 0).

## Why emulation alone is not enough in a LIVE tab (verified)

The extension captures the user's tab without a reload. Running Stripe's entrance animations are Web Animations (`element.animate`), and the pre-capture CSS (`animation-play-state: paused`) does not touch them. When the user has already scrolled the page, Stripe's reduced-motion change handler cancels in-flight entrances and leaves their start styles behind.

Experiments: Puppeteer and headed-equivalent Chrome, 1440×900, the extension's exact `autoScrollPage` (400px / 100ms, then `scrollTo(0,0)` + 500ms), 2 runs per arm, deterministic. Scripts: `scratchpad/h2-experiment.cjs`, `h4-running-only.cjs`, `h3-inventory.cjs`, `sites-check.cjs`.

| Arm (prescroll = the user browsed the page first) | capital / payouts | feature cards | checkout items | bars |
|---|---|---|---|---|
| fresh (extension today) | 0 / 0 | 11111000 | 101110001 | 0/31 |
| fresh + reduced motion (≈ API) | 1 / 1 | 11111111 | 101110001 | 31/31 |
| prescroll (extension today, typical) | 1 / 1 | 11111111 | 101110001 | 0/31 |
| prescroll + reduced motion only | **0 / 0** | **11110000** | 101110001 | 31/31 |
| prescroll + finish(**all finite**) + rm + finish | 1 / 1 | 11111111 | **110000010** ✗ | 31/31 |
| **prescroll + finish(running finite) + rm + finish(running finite)** | **1 / 1** | **11111111** | **101110001** | **31/31** |
| fresh + finish(running finite) + rm + finish(running finite) | 1 / 1 | 11111111 | 101110001 | 31/31 |

Why the filter has to be "running": the checkout graphic is 57 **paused**, scroll-scrubbed Web Animations. `finish()` jumps a scrubbed timeline to its end frame, and that is what produced the ✗ row. The entrances that need finishing (platform-graphic cards and borders, dashboard rows) are all `running` with a finite `endTime`.

Other sites, prescroll scenario, base vs fix, 2 runs each (visible elements / chars):
- linear 3053/9120 → 3053/9120
- vercel 503 → 505 (+2)
- apple 448 → 448
- webflow 904 → 904
- telex 2078/4925 → 2078/4925

No site lost content.

## Change (one file + one new test file)

`packages/browser-extension/src/background/capture/w2w.ts` (🔴 LIVE extension; the owner asked for the fix):

1. **New exported helpers** (they never throw, same style as `w2wHideScrollbars`):
   - `W2W_FINISH_RUNNING_ANIMATIONS_EXPRESSION`: for each `document.getAnimations()` entry, `finish()` only if `playState === 'running'` and `effect.getComputedTiming().endTime` is finite. Each call is wrapped in try/catch; returns the count.
   - `w2wFinishRunningAnimations(client)`: `Runtime.evaluate` of that expression with `returnByValue`. Returns the count, or 0 on failure.
   - `w2wEmulateReducedMotion(client)`: `Emulation.setEmulatedMedia({ features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })`.
   - `w2wClearEmulatedMedia(client)`: `Emulation.setEmulatedMedia({ features: [] })`.
2. **`handleCapturePageW2W` order:**
   - Once per session, right after `await w2wHideScrollbars(client)` and before the first `Emulation.setDeviceMetricsOverride`: `await w2wFinishRunningAnimations(client)`, then `await w2wEmulateReducedMotion(client)`.
   - Per viewport, right after `await autoScrollPage(client)` and before the layout measurement (`w2wScrollbarWidth`) and `EXTRACT_DOM`: `await w2wFinishRunningAnimations(client)`. This catches entrances the auto-scroll started.
   - In `finally`: `await w2wClearEmulatedMedia(client)` next to `w2wShowScrollbars`, so the user's tab is handed back without the emulation. Detach clears it anyway; doing it explicitly keeps the cleanup visible.
   - `console.log` the finished counts (silenced in the Web Store build).
3. **Tests (TDD, written first):** `w2w-reduced-motion.test.ts`
   - The emulate/clear helpers send the exact CDP params and never throw.
   - The finish expression, evaluated in happy-dom with a stubbed `document.getAnimations`: finishes running+finite; skips paused, finished and infinite; survives a throwing `finish()`; returns the count.
   - A source-order guard: finish → emulate → first `"Emulation.setDeviceMetricsOverride"`; `autoScrollPage` → finish → `w2wScrollbarWidth(targetViewport` → `EXTRACT_DOM`; clear near `"Emulation.clearDeviceMetricsOverride"`. The guard pins the step that went missing silently.

## Review (second agent, 2026-09-12): CONFIRM WITH CHANGES — all applied

1. **Blocker, fixed:** scroll-driven CSS animations (`animation-timeline: scroll()/view()`) report `running` with a CSSUnitValue `endTime` (`"100%"`), so `end === Infinity` does not skip them, and `finish()` pinned a progress bar at its end in real Chrome. The filter is now `playState === 'running'` && `timeline === document.timeline` && `typeof endTime === 'number'` && `Number.isFinite(endTime)`.
2. The helpers read `result.value` only if it is a number; otherwise they return 0. `Runtime.evaluate` reports page exceptions in `exceptionDetails` and does not reject. The clear helper never throws and runs before `client.destroy()`.
3. The per-viewport finish moved to immediately before `EXTRACT_DOM`, after the compensation override and the scrollbar style injection, so it catches strictly more.
4. The CDP semantics were checked: `features: []` clears only the media features, reduced motion survives `setDeviceMetricsOverride`, and detach clears it anyway.
5. Figma check: compare against a URL import made at the same time, not against absolute numbers. Stripe runs an A/B test (`wpp_curator_h2`), and headed GPU rendering differs.

## Out of scope (deliberately)

- `packages/api`: it boots fresh with reduced motion, and an added finish pass is a separate LIVE decision.
- `packages/shared`: untouched.
- `capture/element.ts` (area and inspect capture): a different mechanism. It takes a `DOMSnapshot` of what the user selected on screen, with no scroll and no viewport override.
- The `hero-wave-animation__static` / WebGL difference: headless `--disable-gpu` vs headed GPU; this is not a timing issue.
- The Stripe chat CTA card (`UniversalChatCtaCard`): per-session page state.
- `connect-platform-graphic__payment-screen`: 3 of 6 visible in every arm; only the carousel phase differs.

## Verification

1. `npx vitest run` in the extension (266 plus the new tests), and `tsc` via `npm run build`.
2. `W2W_DEV_LOG=1 npm run build`, then a plain-build grep for the dev-log markers.
3. The owner: reload the extension → capture stripe.com → import → Figma dump. Expect section@7520 ≈ URL (−72 → ~0) and 31 bars.
