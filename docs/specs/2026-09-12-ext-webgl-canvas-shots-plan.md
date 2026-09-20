# Fix plan: WebGL canvases reach Figma in extension captures (2026-09-12)

## Symptom

The owner's dump from 2026-09-12 16:58 compares a URL import and an extension capture of stripe.com made at the same time. In the extension frame, 6 WebGL canvases arrive with no `$url`, so they render as empty boxes:

- hero wave
- `agentic-graphic__background-canvas`
- `issuing-graphic__background-canvas` (the Visa card)
- `globe__canvas`
- `data-viz__canvas`
- `developers-wave-animation__canvas`

The URL import shows Stripe's `__static <picture>` fallbacks in their place. Headless with `--disable-gpu` has no WebGL, so Stripe serves those fallbacks.

## Root cause (verified, headed Chrome with a GPU, stripe.com, the extension's exact pipeline)

All six are WebGL contexts with `preserveDrawingBuffer: false`. Their pixels exist only in the compositor. The page can read them back (`toDataURL` / `drawImage`) only inside the frame in which it drew. `rasterizeCanvas` (`content/canvas-raster.ts:168-227`) bets on `requestAnimationFrame` landing right after the page's own draw. That works only while the page redraws every frame.

| Canvas | rAF read, no reduced motion | rAF read, with reduced motion (current extension) |
|---|---|---|
| hero-wave | 37.9% painted | **0%** |
| agentic | 5.5% | **0%** ← regression from the reduced-motion fix; the loop stops |
| issuing / globe / data-viz / dev-wave | 0% (renders on demand, then stops) | 0% |

So the bitmap has to come from the compositor. `Page.captureScreenshot` reads the compositor.

## Why a plain screenshot is not enough (verified)

The existing tainted-canvas fallback (`packages/shared/src/w2w-canvas-shots.ts`, LIVE) photographs the canvas rect as it looks on screen: 100% opaque, with the section background and everything painted above the canvas baked in. On `developers-wave` that bakes in the heading "Scale with confidence…" and the stats "500M+ / 10K+ / 150K+", which Figma then shows twice. The code comment there already warns that a blank canvas would become an opaque rectangle covering content.

**An isolated shot solves both problems.** For the length of one screenshot:

- inject a style that sets `visibility: hidden` on everything except the target canvas, makes `html`/`body` transparent, and sets `opacity: 1` on the canvas and its ancestor chain, so Figma doesn't apply the ancestor opacity a second time;
- apply `Emulation.setDefaultBackgroundColorOverride` with transparent black.

The PNG then holds the canvas's own pixels with alpha.

Measured with the exact planned mechanism (headed Chrome, the extension pipeline including the reduced-motion fix). Script: `scratchpad/webgl-final.cjs`.

| Site | Qualifying canvases | Pass time | Leftover attrs/styles | Result |
|---|---|---|---|---|
| stripe.com | 6 + 1 synthetic | 2139ms | 0 | hero 33% · agentic 5.4% · issuing 76.9% · globe 83.1% · data-viz 13.1% · dev-wave 52.5% opaque; **synthetic never-drawn WebGL canvas → 0% (2KB), stays blank** |
| webflow.com | 1 | 462ms | 0 | hero WebGL canvas 36.5% (empty before) |
| linear / vercel / apple / telex | 0 | ~0ms | 0 | no change |

A visual check of the PNGs: the globe dots, the Visa card with its glow, the hero wave, and dev-wave lines without any text are all clean.

## Change (extension only; `packages/shared` and `packages/api` untouched)

1. **New `packages/browser-extension/src/background/capture/webgl-canvas-shots.ts`:**
   - `W2W_WEBGL_CANVAS_PROBE_EXPRESSION`: every `<canvas>` with a rect larger than 0.5px whose `getContext('2d')` returns null (another context type) or throws (control was transferred to an OffscreenCanvas). It returns `{ idx, x, y, width, height }` in document coordinates.
     - 2D canvases are excluded: a 2D read is reliable, so if the page reads blank, the canvas IS blank.
     - Asking for `'2d'` claims nothing new, because the content-script pre-pass already asked every canvas for `'2d'` (the same argument `w2w-canvas-shots.ts` makes).
   - `w2wIsolateCanvasExpression(idx)` and `W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION`: set `data-w2w-canvas-shot` on the canvas and `data-w2w-canvas-shot-chain` on its ancestors, plus a style element with id `__w2w_canvas_shot`. Restore removes all of them.
   - `captureWebglCanvases(client, frame)`, never throws:
     - collect the canvas FRAME nodes without `$url`; return early when there are none;
     - probe; for each probe, require exactly one node matching the rect within 1px (the same rule as the tainted path);
     - isolate, then set the transparent background override.
     - **If the override fails, restore and abort the whole pass.** Without a transparent background, a blank canvas would become an opaque rectangle.
     - screenshot: `png`, clip at document coordinates, `scale: 1`, `captureBeyondViewport: true`;
     - in a `finally`: clear the override (`setDefaultBackgroundColorOverride` with no color) and restore;
     - budget: skip a shot over `MAX_CANVAS_DATA_URL_BYTES` (4MB) or one that would push the pass total over `MAX_CANVAS_TOTAL_BYTES` (8MB), in document order. Imported from `content/canvas-raster.ts`, the same limits the content-script canvas export uses;
     - `node.$url = data:image/png;base64,…`;
     - `console.log` the count and the KB.
   - Always PNG: the alpha is the point, and JPEG would turn transparency black.
2. **`w2w.ts`:** call `await captureWebglCanvases(client, frame)` right after `await captureTaintedCanvases(client, frame)` and before `captures.push`. That's per viewport, and still inside the window where `frame` gets filled in place.
3. **Tests (TDD, written first):** `webgl-canvas-shots.test.ts`
   - with a mock client: no candidate nodes means no CDP calls; the happy path runs isolate → override → screenshot (png, clip, `captureBeyondViewport`) → clear → restore, in that order, and assigns `$url` to the single matching node;
   - a node that already has `$url` is untouched; an ambiguous rect match (2 nodes) is skipped;
   - an override failure means no screenshot, restore still runs, nothing is assigned, and the pass aborts;
   - a screenshot failure still clears the override and restores, and the pass moves on to the next canvas;
   - the per-shot and total budgets are enforced; a probe rejection resolves quietly;
   - the isolate and restore expressions, evaluated in happy-dom: the attributes and style are set, then fully removed;
   - a source-order guard in `w2w.ts`: after `captureTaintedCanvases(client, frame)` and before `captures.push`.

## Review (second agent, 2026-09-12): CONFIRM WITH CHANGES — to apply before coding

1. **Blocker, abort leaves the tab blank:** if the debugger detaches mid-isolation (the user cancels the debugger bar or closes the tab), the `finally` restore can't run, because `Runtime.evaluate` is gone. The isolation style stays behind and the page stays hidden. Fix: the isolate expression also starts a page-side restore timer (about 3s) and keeps its handle on `window`, so restore can clear it. Test: isolate, never restore, and the timer cleans up.
2. **The probe can break a page:** `rasterizeCanvas` returns before `getContext` when the bitmap size is 0 (`canvas-raster.ts:169`), and canvases added later were never claimed. Calling `getContext('2d')` on those claims 2D, and the page's later `getContext('webgl')` then returns null. Fix: skip canvases with `width`/`height` of 0, and only query canvases whose rect matches a candidate node. Test the zero-bitmap case.
3. **Styling applied twice:** the shot bakes in the canvas's own border, background and box-shadow, plus any filter or blend on the chain, and the plugin applies them again as strokes and effects (`nodes.ts:870`, `css-converter.ts:3521-3548`, `:768`). Fix: add `filter:none; mix-blend-mode:normal` to the chain and canvas, `border-color:transparent; background:transparent; box-shadow:none` to the canvas, and keep `transition:none`, all `!important`.
4. **Index drift:** re-check that the canvas at `idx` still has the probed rect (±1px) inside the isolate expression; skip it if not.
5. **Resolution and budget:** the probe also returns `canvas.width` and `devicePixelRatio`. Use `clip.scale = min(1, (canvas.width / rect.width) / dpr)`, which is the resolution `toDataURL` would give. That frees the budget (stripe was at 7.9 of 8MB, with dev-wave as the first canvas to drop) and helps Figma's 4096px limit.
6. Notes:
   - Each `captureBeyondViewport` shot fires one `resize`; stripe measured fine.
   - A fully transparent shot still sets `$url` and hides the plugin's "Canvas couldn't be captured" warning. Consider skipping shots whose PNG is tiny or fully transparent.
   - Verified: a transferred OffscreenCanvas has `tainted=false` in the LIVE probe, so it reaches the new pass. The plugin passes the canvas `$url` straight to `figma.createImage`, so alpha survives. Chain opacity:1 is correct.

## Risks

- **Visible flash:** the user's tab goes blank for roughly 0.3s per qualifying canvas (2.1s total on stripe). The capture already flashes because of `captureBeyondViewport` resizes.
- **Specificity leak:** a page rule with `visibility: visible !important` and higher specificity than `html *` can leak into a shot. That is rare, and it's no worse than today's plain shot.
- **Payload:** stripe adds about 6MB of PNG (7.9MB base64), close to the 8MB cap, so a later canvas can be dropped with a warning. The `.w2w` is a local file, not the API's 50MB body.
- **DPR:** shots come out at device pixels (2x on Retina), matching the tainted path. That means sharper images and a larger payload.

## Out of scope

- The tainted path (`packages/shared`, LIVE) keeps its plain shot. Whether to switch it to isolation is a separate decision.
- The API is unchanged. It has no GPU, and its static fallbacks already reach Figma.

## Verification

1. The extension test suite plus `tsc` (`npm run build`), a `W2W_DEV_LOG=1` build, and a plain-build marker grep.
2. The owner: reload the extension → capture stripe.com → import → dump. Expect the six canvases as IMAGE fills with no duplicated dev-wave text.
