# Fix plan: images over 4096px reach Figma (2026-09-13)

## Symptom

In the owner's extension import of apple.com (dump 2026-09-13 01:07, frame A), the 3008×692 hero `img` rendered as a grey placeholder, with the plugin log line `Image could not be decoded — replaced with a placeholder` (`realImages.ts:320`). The URL import of the same page drew it.

## Root cause (verified)

- Figma's docs for `figma.createImage` say: "Images have a maximum size of 4096 pixels (4K) in width and height … Invalid images will throw an error" ("Image is too large"). Figma does not downscale.
- The extension captures at native DPR (`deviceScaleFactor: 0`, in HEAD since `922639e`), so on a Retina display `srcset` resolves to the 2x candidate. The asset for that hero is `hero_iphone_duo_announce…_largetall_2x.jpg`: JPEG, **6016×1384**. The same capture's 2524×1160 promo images all rendered.
- The plugin has no size guard. `ui/shared/imageDownscale.ts` serves screenshot import only, and the render paths (`realImages.ts:266`, `fills.ts:290`) call `createImage` on whatever they're given.
- The API captures at DPR 1 and gets the 1x candidate, which is why the URL import worked. Any image over 2048 CSS px on a 2x screen, or over 4096 at any DPR (for example a tall canvas bitmap or a huge background), fails the same way.

## Change (figma-plugin only; not a LIVE zone)

1. **New `src/utils/figmaImageLimit.ts`** (pure, testable):
   - `FIGMA_MAX_IMAGE_DIMENSION = 4096`
   - `dataUriImageSize(dataUri)`: the natural size of a base64 `data:image/(png|jpeg|gif)` URI, read from its header. It decodes a ~256KB prefix and falls back to the whole payload when a JPEG's SOF sits deeper. It uses `parseImageSize` (`rendering/imageCrop.ts`) and `base64ToBytes`, which gets exported from `realImages.ts`. It returns null for anything else.
   - `exceedsFigmaImageLimit(dataUri)`: `max(w, h) > 4096`. Unknown formats return false, because they are the format-conversion path's job.
   - `fitWithinFigmaLimit(w, h, max = 4096)`: an aspect-preserving target size that never upscales and never goes below 1.
   - `collectInlineOversizedImages(rawFrame)`: walks `capturedData.frame` and returns every oversized inline `data:` image, both in `$url` (canvas bitmaps, `<img src=data:>`) and in `url(data:…)` inside `styles.backgroundImage`. These never pass through `assets`.
2. **`main.ts` asset pre-pass (`:584-604`):** a supported-mime asset that `exceedsFigmaImageLimit` goes into `assetsToConvert`, like webp/avif do today. Then every `collectInlineOversizedImages(fd.capturedData.frame)` URI that isn't already in `fd.assets` is queued with `url = dataUri`. The converted result lands in `fd.assets[url]`, and the render paths look the map up first (`nodes.ts:867-868`, `fills.ts:253-255`), so they pick it up with no render-path change.
3. **`ui/App.tsx` `convert-assets` handler (`:340`):** size the canvas with `fitWithinFigmaLimit(naturalWidth, naturalHeight)` and `drawImage(img, 0, 0, w, h)`. The transparency rule is unchanged (PNG if any transparent pixel, otherwise JPEG 0.85). This also fixes webp/avif over 4096, which were converted at full size and then failed.
4. **Failure mode is unchanged.** If conversion fails or times out (30s), the asset is skipped and `createImage` throws into today's placeholder and warning.

## Review (second agent): CONFIRM WITH CHANGES — revised design

Findings:

- **The timeout was all-or-nothing** (`main.ts:633-636`). Converting each asset once per frame and scanning every pixel could push a multi-viewport import past 30s and lose the webp/avif conversions that work today.
- **Background geometry depends on the image's natural pixel size.** With `background-size: auto`, the tile scale is set by the natural size (`imageCrop.ts:180-182, 215`; `fills.ts:373-381`), so a downscaled image would tile at 68%.
- **Frames with a prefilled `fd.assets` would skip the check** (legacy paths).
- **The failure warning would change** from "could not be decoded" to "couldn't be loaded".

Revised design:

1. **Which images:** the URLs the renderer will actually request, walked from each frame's converted `tree`: `node.imageUrl` and `node.fills[].imageUrl`, recursively. That gives exact keys by construction, including quoted and multi-layer backgrounds. The source is `fd.assets[url]`, falling back to the URL itself when it's an inline `data:` image. This covers every flow that builds a tree plus assets, legacy included. Pure helper: `planOversizedImages(frames)` in `utils/figmaImageLimit.ts`.
2. **One conversion per URL**, deduplicated across frames, merged into the same frames' `fd.assets`. The existing webp/avif queue is deduplicated the same way.
3. **Raw first:** the raw entry stays in `fd.assets[url]` and the conversion overwrites it. A failed conversion therefore keeps today's "could not be decoded" path and warning.
4. **Partial results survive the timeout.** The UI posts `asset-converted` after each asset and `assets-converted` at the end. The sandbox keeps whatever arrived when the 30s timeout fires.
5. **UI:** size the canvas with `fitWithinFigmaLimit`, and skip the per-pixel transparency scan when the source is `image/jpeg` (JPEG has no alpha). Each result also returns `originalWidth`/`originalHeight`.
6. **Original sizes** go into `RenderContext.imageNaturalSizes: Map<url, {width, height}>`, set only when a conversion changed the dimensions. `fills.ts` uses it before `parseImageSize(bytes)` at its three natural-size reads (`:306`, `:340`, `:373`), so tiling and cropping keep the page's geometry. Child contexts spread the parent context, so the map propagates.

## Tests (TDD, first) — revised

1. `dataUriImageSize` reads PNG, JPEG and GIF sizes, including a JPEG whose SOF sits past a 300KB APP segment.
2. `exceedsFigmaImageLimit` (true/false cases as before).
3. `fitWithinFigmaLimit` (as before).
4. `planOversizedImages`:
   - takes URLs from `tree` imageUrl and fills, sourced from `fd.assets` or inline data;
   - deduplicates across two frames that share an asset;
   - queues a frame that has only a prefilled `fd.assets` (no `capturedData`);
   - uses the fill's `imageUrl` verbatim for a background whose URL was quoted;
   - skips images at or under 4096, svg, and unknown formats.
5. fills: an `auto` background TILE, and a background cover CROP, use `imageNaturalSizes` when present. Given a 4096-wide downscaled PNG and an original of 6016, the scale must come out the same as with the original.
6. UI helper: `mayHaveAlpha("data:image/jpeg…")` is false (no scan); png/webp/gif return true.
7. Wiring guards on the raw source: the `main.ts` conversion keeps partial results on timeout and merges conversions into `fd.assets` (raw first); `App.tsx` posts `asset-converted` per asset and sizes the canvas with `fitWithinFigmaLimit`.

## Original test list (superseded)

`__tests__/figma-image-limit.test.ts`:

1. `dataUriImageSize` reads PNG, JPEG and GIF sizes from data URIs. A JPEG whose SOF sits past a 300KB APP segment is still read, through the full-decode fallback.
2. `exceedsFigmaImageLimit`:
   - true: JPEG 6016×1384; PNG 4097×1
   - false: PNG 4096×4096; svg data URI; webp data URI; an https URL; malformed base64
3. `fitWithinFigmaLimit`:
   - 6016×1384 → 4096×942
   - 1000×5000 → 819×4096
   - 4096×100 → unchanged
   - 10×10 → unchanged (never upscales)
4. `collectInlineOversizedImages` returns oversized `$url` and background `url(data:…)` URIs. It skips small data URIs, https URLs, and svg data.
5. Wiring guards (raw source):
   - `main.ts` routes oversized supported assets and inline oversized URIs into `assetsToConvert` before the `convert-assets` message;
   - `App.tsx`'s handler sizes its canvas with `fitWithinFigmaLimit`.

## Regression control

- **Images at or under 4096 take exactly today's path.** The only new work is a header parse per asset.
- **Real check:**
  - re-import the owner's `apple_com_1440_wireframe.w2w`: the hero image should render and the "could not be decoded" warning should be gone;
  - re-import a stripe `.w2w`: identical, since stripe has no image over 4096;
  - the plugin test suite plus `tsc` (`npm run build` typecheck via watch).
- **Quality:** an oversized opaque image is re-encoded as JPEG 0.85 at 4096px, which is still more pixels than a 2x display shows at that size.

## Out of scope

- Videos without a poster (a separate item).
- Capturing at DPR 1 (a trade-off decision; the extension keeps DPR 2 for sharp images).
- The API/URL-path typography bug (step 3).
