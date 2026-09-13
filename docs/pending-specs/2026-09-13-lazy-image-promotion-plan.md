# Fix plan: lazy `<img>`s load before extraction (2026-09-13)

## Symptom

The owner's URL import of stripe.com reported `Images: Image couldn't be loaded — replaced with a placeholder (7 layers)`. An extension capture of a tab that hasn't been scrolled yet would lose the same images. The parity report (`2026-09-12-url-vs-ext-pipeline-parity.md`, item 1) traced this to `loading="lazy"` images inside `<picture>` that are still unloaded when the DOM is read. The extractor then records the `<img src>` fallback (`extractor.ts:487`), which the browser never requests, so no asset lookup can find it.

## Root cause (verified, headless Chrome with the API's pipeline, stripe.com; scripts `scratchpad/lazy-exp.cjs` and `lazy-exp2.cjs`)

`waitForRenderReadiness` (`packages/browser-extension/src/content/extractor.ts:214-238`) already waits for images that are `!complete`, by calling `img.decode()` capped at 2.5s. But **`decode()` does not start a deferred lazy load**:

| Arm | Lazy images that render but are still pending | Loaded | Time |
|---|---|---|---|
| today: `decode()` wait | 11 | **0** | **2501ms** (the whole cap, wasted) |
| promote to `loading="eager"`, then the same `decode()` wait | 11 | **11** | **224ms** |

After promotion, all 11 `currentSrc` values are the browser-chosen `<source>` variants (different from the `src` fallback), all 11 are listed in `Page.getResourceTree`, and all 11 returned HTTP 200. The API lookup (`w2w-extraction.ts:510-582`, exact match) and the extension harvest (`Page.getResourceTree`) both find them.

Other sites (the same pipeline, "rendered" meaning a non-zero box):

| Site | Rendered pending lazy images | Change |
|---|---|---|
| apple.com | 0 | none |
| vercel.com | 0 (10 pending but none rendered) | none |
| webflow.com | 2 (already loading) | 0 new requests |
| iwm.org.uk | 0 | none |
| telex.ge | 0 | none |

## Change (one source file: `packages/browser-extension/src/content/extractor.ts`)

1. **New exported `promoteLazyImages(doc = document): number`.** It sets `loading="eager"` on every `<img>` that meets all three conditions, and returns the count:
   - its `loading` attribute is `lazy`;
   - it is still pending (`!complete || !naturalWidth`);
   - it has a layout box (`getBoundingClientRect()` width and height > 0). Images with no box are dropped by the traversal anyway, so they aren't worth the network cost.

   It reads and writes the attribute rather than the IDL property, to stay robust. It never throws.
2. **In `waitForRenderReadiness`,** call `promoteLazyImages()` right before the existing `pending` filter. The promoted images then land in the existing capped `decode()` wait (at most 50 images, 2.5s). No new timeout, no new wait.
3. The attribute is **not** restored afterwards. Setting `lazy` back cannot unload an image. It could at most defer one that hasn't finished, so the unfinished image would fall back to `src` exactly as it does today. The extractor doesn't record `loading` (`extractAttributes`), so the captured output doesn't change.

Both paths get this: the extension through its content script, and the API through `scripts/bundle-content-script.mjs` → `packages/shared/dist/w2w-content-script.iife.js`, a generated file. No `packages/shared` or `packages/api` source changes.

## Review (second agent): CONFIRM WITH CHANGES — applied

1. **Mechanism confirmed.** Tested from a CDP isolated world, which is the content script's situation. `setAttribute('loading','eager')` resumes the paused lazy load, and a `<picture>` picks its `<source>`. Attribute and IDL property are equivalent.
2. **Timing claim fixed.** Today's wait set (`!complete && img.src`) also holds the lazy images that have no box: 26 on stripe. `decode()` never settles for them either, so promoting alone still hits 2502ms. **The wait set now leaves out images still marked `loading="lazy"` after promotion.** Measured: 10 awaited, 183ms, 11/11 loaded.
3. **Promotions are capped at 50** (the wait cap), in document order, so a gallery page can't fire hundreds of requests on the live tab.
4. Layout can shift when an image with the wrong intrinsic size loads. It happens before measurement, so the capture shows the loaded layout. On stripe: document height unchanged, 0 of 33 headings moved.
5. The `src` fallback stays for images that don't load in time. Dropping it would hide the plugin's "Image couldn't be loaded" warning without drawing anything better.
6. Correction to the context above: both paths already auto-scroll. The leftover images are ones scrolling can't reach, meaning horizontal carousels (8 of 11) and a `visibility:hidden` stack (3), not an "unscrolled tab".

## Tests (TDD, first) — `content/lazy-images.test.ts` (updated)

1. `promoteLazyImages` promotes a lazy, pending image that has a box, and returns 1.
2. It leaves alone: a loaded lazy image, an eager image, an image with no `loading` attribute, and a lazy image with no box.
3. A lazy image with `complete=true` but `naturalWidth=0` counts as pending and IS promoted.
4. Promotion cap: 60 promotable images → 50 promoted, and the rest keep `lazy`.
5. It never throws when `getBoundingClientRect` throws; that image is skipped.
6. `imagesToAwait` leaves out still-lazy pending images, includes promoted and eager pending ones, and is capped at 50.
7. Fake timers: with a no-box lazy image whose `decode()` never settles plus a promoted image, `waitForRenderReadiness` resolves long before 2500ms.
8. Source-order guard: `promoteLazyImages()` runs before `imagesToAwait()` inside `waitForRenderReadiness`.
9. Real browser: inject the rebuilt content-script bundle into stripe.com and call `__w2w_extractPage()`. Expect every promoted `<img>` `$url` to be a URL the browser requested (in `Page.getResourceTree`), and the extraction wait to be well under 2.5s.

## Superseded test list (pre-review)

1. It promotes a lazy, pending image that has a box, and returns 1.
2. It leaves alone: an already-loaded lazy image, an eager or unspecified image, a lazy image with no box (zero rect), and a lazy image whose `complete` is true but `naturalWidth` is 0. That last case counts as pending, so it IS promoted — the test pins the definition.
3. It never throws, even when `getBoundingClientRect` throws.
4. A source-order guard: in `extractor.ts`, `promoteLazyImages()` is called inside `waitForRenderReadiness`, before the `pending` filter.

## Regression control

- **The tests above** plus the full extension suite and `tsc`.
- **Blast radius:** measured on 6 sites. Only pages with rendered-but-unloaded lazy images change, and there the only change is that those images load.
- **Time:** the extraction wait shrinks (2.5s → ~0.2s on stripe). It can't grow, because the cap is unchanged.
- **Network:** promoted images are ones the capture includes anyway. On stripe that is 10 requests.
- **Figma check by the owner:**
  1. An extension capture of a fresh, unscrolled stripe tab should have 0 "Image couldn't be loaded" placeholders, and the testimonial, case-study and customer-story images should be real.
  2. After rebuilding the local API (`pnpm --filter @w2w/shared build`, then `docker compose up -d --build api`), a URL import should lose the "7 layers" placeholder warning.
  3. The dump should otherwise equal the previous one, apart from live-state noise.
- **Release note:** the URL path benefits only after an API redeploy, and the extension path after a Web Store republish.

## Out of scope

- CSS background images lazy-loaded by JS (`data-bg`, lazysizes).
- `iframe loading=lazy`.
- The API's server-side fetch fallback for misses (a parity item).
