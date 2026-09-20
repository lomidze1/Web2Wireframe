# Extension vs URL import — stripe.com graphics captured in their entrance start state (2026-09-12)

> Delivery note: the `SendMessage` tool is not available in this research session. The summary was sent to `web2wireframe-71` with the session-management `send_message` tool instead.

Research only. No repo code was changed. Experiments live in the session scratchpad (`exp.mjs`, `exp2.mjs`, `out-*.json`), outside the repo.

## Verdict

**The browser extension does not emulate `prefers-reduced-motion` at all.** The `w2wEmulateReducedMotion()` fix from 2026-09-08 never landed: it is missing from the working tree, from `HEAD`, from commit `922639e` (even though that commit's message lists it), from every branch and stash, and from the built `dist/`. The API boots stripe.com with `reduce`, so Stripe's script jumps its graphics straight to the finished state. The extension leaves Stripe's JavaScript Web Animations running (`element.animate()`, 100 animations on the page), and capture catches them mid-entrance.

Putting the emulation back is necessary but **not sufficient for a live tab**. If the sequences already played before the capture, which is the normal case when the user scrolled, Stripe's reduced-motion handler cancels the running animations and leaves the start-state styles behind. The fix is: finish the finite animations, then emulate reduced motion, then finish them again before `EXTRACT_DOM`.

## Evidence that the analyzed capture ran without reduced motion

In `ext.json`, all 31 `.billing-plan-graphic__bar` have `height 0` and `transform: matrix(1,0,0,0,0,0)`, which is scaleY 0. That is exactly the no-reduced-motion signature described in `packages/api/src/lib/cdp/w2w-extraction.ts:892-903`. With reduced motion, the 09-08 fix produced 31 bars at URL-import heights.

```
grep -rn "setEmulatedMedia|EmulateReducedMotion|prefers-reduced-motion" packages/browser-extension/src  → only canvas-raster comments
git log --all -S setEmulatedMedia                                                                   → no commits
git show 922639e:…/w2w.ts | grep Emulated                                                           → nothing
dist/background/index.js                                                                            → no "prefers-reduced-motion"
```

## Pipeline comparison (page ready → DOM read)

| Step | Extension (`handleCapturePageW2W`) | API (`renderWebsiteW2W` → `extractWithContentScript`) | Difference |
|---|---|---|---|
| Page origin | The user's live tab; no reload (`w2w.ts:204-206`) | Fresh headless Chromium, `page.goto` with `domcontentloaded`, then `waitForNetworkSettled` (`htmlExtractor.ts:452-456, 517-519`) | The live tab may already have played or paused its sequences |
| **Reduced motion** | **None anywhere** | `emulateReducedMotion(page)` **before `goto`** (`htmlExtractor.ts:462`; impl. `w2w-extraction.ts:920-932`) | **Root cause** |
| GPU | Headed Chrome with a GPU | `--disable-gpu` (`htmlExtractor.ts:455`) | Changes WebGL fallbacks (hero wave) |
| Scrollbar hide | Before measuring (`w2w.ts:167`, impl. `:946-964`) | After compensation (`w2w-extraction.ts:296-305`) | Not animation-relevant |
| Viewport | Override 1440×900 (`w2w.ts:197-200`, `VIEWPORT_HEIGHT=900` at `:58`) | `setViewport` 1440×900 before `goto`, then the CDP override (`htmlExtractor.ts:514`, `w2w-extraction.ts:200-210`) | Same 900px height, so IntersectionObserver geometry matches |
| Reload | None | Skipped (`prefetchedFonts`, `w2w-extraction.ts:227-237`) | Equal |
| Settle | Fixed 500ms (`w2w.ts:207`) | Network-settle wait (`htmlExtractor.ts:519`) | Minor |
| Hydration | `w2wWaitForHydration` (`w2w.ts:212`, shared expression) | `waitForHydration` (`w2w-extraction.ts:243`) | Same code (`@w2w/shared/src/w2w-hydration.ts:21`) |
| Auto-scroll | `legacy.ts:62-107`: **400px** step, 100ms dwell, `scrollTo(0,0)` + 500ms | `w2w-extraction.ts:935-980`: **`innerHeight-100` (800px)** step, 100ms dwell, `scrollTo(0,0)` + 500ms | Step differs; **ruled out** as the cause (see H3) |
| Font force-load | — | `document.fonts` load (`w2w-extraction.ts:257-270`) | Not animation-relevant |
| Compensation + style | +300ms if a scrollbar is present, +200ms (`w2w.ts:218-247`) | Same (`w2w-extraction.ts:273-305`) | Equal (≈700ms from the last scroll to the read on both paths) |
| DOM read | `EXTRACT_DOM` → `extractPage()` (`w2w.ts:256`) | Same bundle through `page.evaluate` (`w2w-extraction.ts:311-316`) | Same extractor |
| Inside `extractPage` | fonts/images wait (`extractor.ts:136, 214-238`), `rasterizeCanvases` (`:141`), `injectPreCaptureStyles` (`:144`) | Same | Same |
| Pre-capture CSS | `animation-play-state: paused; transition-duration: 0s` (`styles.ts:207-213`) | Same | Pauses CSS animations only; **Web Animations (`element.animate`) are untouched** |

## Ranked hypotheses

### H1: missing reduced-motion emulation (VERIFIED, primary cause)

Setup: headless Chrome 1440×900 on stripe.com, running each path's timing, then reading `getComputedStyle` after the pre-capture CSS.

| Arm | Reduced motion | Scroll step | capital/payouts content | Animations on page |
|---|---|---|---|---|
| `api` | before `goto` | vh−100 | **op 1, none** | 1 (0 running) |
| `api-norm` | none | vh−100 | **op 0, `matrix(0.94…)`, 2 anims each** | 100 (CSSAnimation + **Animation**) |
| `ext` | none | 400 | **op 0, `matrix(0.94…)`** | 100 (42 running) |
| `ext-rmearly` | before `goto` | 400 | op 1 | 1 |
| `ext-rmlate` | `Emulation.setEmulatedMedia` after boot | 400 | op 1 | 1 |

- The API timing without reduced motion reproduces the extension's bug exactly. The extension timing with reduced motion fixes it. Reduced motion is the variable; scroll step and timing are not.
- A late CDP `setEmulatedMedia` works on a fresh page: Stripe listens for `matchMedia` changes. This matches the 09-08 bars result.
- Bars: 0/31 over 1px without reduced motion, 31/31 with it (`exp2` arms `none` / `rmlate`).

### H2: live-tab state defeats a late reduced-motion switch (VERIFIED, secondary)

`exp2` simulates a user who scrolled the page before capturing (`prescroll`).

| Arm | capital / payouts | Bars |
|---|---|---|
| `prescroll` (the extension as it ships today) | op 0 `0.94` / op 1 | 0/31 |
| `prescroll,finishEnd` | op 1 / op 1 | **0/31** |
| `prescroll,rmlate,finishEnd` | **op 0 `0.94`, 0 anims** / same | 31/31 |
| **`prescroll,finishPre,rmlate,finishEnd`** | **op 1 / op 1** | **31/31** |
| `rmlate,finishEnd` (fresh) | op 1 / op 1 | 31/31 |

Stripe's reduced-motion change handler cancels the in-flight `element.animate()` entrances. The elements fall back to their base style (opacity 0, scale 0.94), and nothing is left for `finish()` to act on. Finishing **before** the switch captures the end state first. Only the full order fixes both the cards and the bars.

### H3: scroll step / dwell / time between the last scroll and the read (REFUTED)

`api-norm` (800px step) fails and `ext-rmearly` (400px step) succeeds. Both paths spend about 700ms between `scrollTo(0,0)` and the read.

### H4: pre-capture CSS freezes elements mid-entrance (REFUTED as the cause, but relevant)

`styles.ts:207-213` pauses CSS animations only. Stripe's entrances are Web Animations (`kinds: ["CSSAnimation","Animation"]`), which that CSS does not touch. This is also why a CSS-only freeze could never fix this. Both paths use the same bundle.

### H5: `hero-wave-animation__static` at opacity 0 (PLAUSIBLE, unverified, different cause)

It was op 1 in every headless arm, with or without reduced motion. The API runs `--disable-gpu`, so the WebGL wave never starts and the static fallback stays visible. The user's headed Chrome runs the WebGL wave and hides the static layer. That makes this a GPU/WebGL difference, not timing. `rasterizeCanvases` (`extractor.ts:141`) should capture the canvas instead; check whether it did.

### H6: `feature-card__container` 2/4 at op 0 `translateY(30)`, `replay-button` op 0, animated counter (UNVERIFIED)

- `replay-button` is op 0 in **every** arm, including the API one, so it is not a divergence caused by this timing.
- `feature-card__container` was op 1 in every headless arm, including the no-reduced-motion ones. Its state in the live tab is probably a time-based cycle. Reduced motion stops all running animations (0 running under reduce), so it will likely be covered, but this was not tested in headed Chrome.
- The hero counter was not tested.

### Not factors

The viewport height is 900 on both paths. Tab visibility is not a factor, because the popup is open during capture and the tab stays visible.

## Recommended fix

**File:** `packages/browser-extension/src/background/capture/w2w.ts` (🔴 LIVE extension; needs the owner's explicit OK)
**Function:** `handleCapturePageW2W()`

1. **Once per session, right after `w2wHideScrollbars(client)` (`:167`) and before the first `setDeviceMetricsOverride`:**
   - `w2wFinishAnimations(client)`: a `Runtime.evaluate` that calls `finish()` on every `document.getAnimations()` entry with a finite `effect.getComputedTiming().endTime` that is not already `finished`, wrapping each call in try/catch.
   - Then `w2wEmulateReducedMotion(client)`: `Emulation.setEmulatedMedia({ features: [{ name: "prefers-reduced-motion", value: "reduce" }] })`. Never throws.
2. **Per viewport, after `autoScrollPage` (`:215`) and before `EXTRACT_DOM` (`:256`):** call `w2wFinishAnimations(client)` again, to catch entrances started by the auto-scroll.
3. **In `finally`:** `Emulation.setEmulatedMedia({ features: [] })`, alongside `w2wShowScrollbars`. Debugger detach also clears the emulation; resetting it explicitly is the cleanup.
4. Re-add the missing tests: a source-order guard like `w2w-hydration.test.ts` (finish → emulate → first override; finish after the auto-scroll) and a unit test for the finite-only filter.

Sketch:

```ts
const W2W_FINISH_ANIMATIONS_EXPRESSION = `(() => {
  let n = 0;
  for (const a of document.getAnimations()) {
    const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : Infinity;
    if (end === Infinity || a.playState === 'finished') continue;   // never finish marquees/loops
    try { a.finish(); n++; } catch {}
  }
  return n;
})()`;
```

**Risk to other sites**
- `emulate reduced motion`: already measured on the API path (`w2w-extraction.ts:909-913`). linear / vercel / telex / apple showed no difference beyond noise. Low risk.
- `finish()` mutates the user's real tab: finite animations jump to their end, and `animationend` / `finish` handlers fire, which can advance carousels or step-driven sequences. Infinite animations are skipped. On an animation with `fill: none` whose base style is hidden, `finish()` leaves it hidden, which is no worse than today. A long, finite CSS marquee jumps to its end frame. This is acceptable for a capture, and the tab is handed back in a "finished" state rather than mid-animation. Medium-low risk. Worth a spot check on 3–4 animation-heavy sites (linear.app, vercel.com, apple.com, a Webflow site).
- **API parity:** the API boots fresh with reduced motion and does not need the pre-switch finish. The extra finish before extraction would be cheap parity there too, but `packages/api` is LIVE and this is a separate decision.

## Open questions

1. **How did `w2wEmulateReducedMotion` get lost?** It was verified on 2026-09-08 (memory `ext-vs-url-divergence-2026-09-08`) and named in the `922639e` message, but it is in no commit. Were other hunks from that session (tests, `constants.ts`) also dropped? A parallel session or partial staging is the likely cause. Check before re-implementing.
2. **Headed-Chrome verification:** all experiments ran headless with `--disable-gpu`. Confirm with a real extension capture in Figma: the platform-graphic cards, the feature cards, the hero counter, and whether the hero wave comes through as a canvas raster.
3. **Should the API add a `finish()` pass before extraction for parity?** (LIVE; not needed for stripe.)
4. **Multi-viewport:** reduced motion is set once and persists. The second pass of `finish()` runs per viewport. Confirm that a viewport reflow does not restart the entrances. Stripe restarted none under reduced motion.
