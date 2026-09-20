# Extension: posterless `<video>` → current frame as `$url` (2026-09-13)

🔴 LIVE zone (`packages/browser-extension`) — owner consented 2026-09-13, for
today's release.

## Symptom

apple.com via the extension: the two hero tiles (`video#iphone-18-pro-animated`,
`video#apple-upgrade`) render as grey placeholders (SOLID + Image Icon). The URL
import shows an image in the same place.

## How the URL path gets its image (verified — it does nothing special)

Headless experiment on apple.com (system Chrome 152, `scratchpad/video-live-exp.cjs`):

| | `inline-media-wrapper` | `picture.start-frame` | `picture.static` | video |
|---|---|---|---|---|
| reduced motion BEFORE navigation (API) | `display:none` | `display:none` | **`display:block`** 1440×692 | no src, readyState 0 |
| reduced motion AFTER load (extension) | `display:block`, `loaded ended` | `display:none` | `display:none` | readyState 4, ended, no poster |

With reduced motion from the first paint Apple's JS never starts the video and
its CSS shows the static `<picture>`; the URL import captures that `<img>`. The
extension captures the user's live tab, where the video already played: both
pictures are `display:none` (extractor skips them — `noteSkip('hidden')`), and
`extractor.ts:539` reads only `video.poster`, which is empty → no `$url`.

`drawImage(video)` into a canvas works on the live page: not tainted
(same-origin media), 2048/2048 sampled pixels non-transparent.

## Fix — `src/content/video-frame.ts` (new) + extractor wiring

Same shape as `canvas-raster.ts` (a pre-pass before the synchronous traversal,
results in a WeakMap, every failure → null, never throws):

1. Candidates: `<video>` with an empty `poster`, `readyState >= 2`
   (HAVE_CURRENT_DATA), `videoWidth/videoHeight > 0`.
2. Draw the current frame onto a scratch canvas. Size: intrinsic, downscaled so
   the longest side is ≤ 2× the element's CSS box and ≤ 4096 (Figma's limit).
3. Reject: tainted (`getImageData`/`toDataURL` throws), fully transparent.
4. Export `image/jpeg` q 0.8 (a video frame has no alpha).
5. Budget: per frame `MAX_CANVAS_DATA_URL_BYTES`; the page total is SHARED with
   canvases (`MAX_CANVAS_TOTAL_BYTES`), because both ride in `$url` against the
   API's 50MB body limit. `rasterizeCanvases` returns the bytes it spent; the
   video pass gets the remainder.
6. Delete-on-failure per viewport, exactly like canvases (viewports are emulated
   in place; a stale entry would leak the desktop frame into mobile).
7. Extractor: `$url = video.poster || videoFrames.get(video)`.

Poster keeps precedence — behaviour for videos that have one is unchanged.
The data URL is canonical `data:image/jpeg;base64,…`, so `w2wIsInlineReadyImage`
keeps it inline (no asset duplication).

Both paths: the API bundles `src/content`, so the URL path gains frames too on
its next deploy (additive). apple.com's URL result is unchanged — its videos
are hidden there.

## Tests first — `src/content/video-frame.test.ts`

Mocked video + scratch canvas (happy-dom has no real canvas):
poster present → untouched; readyState < 2 → none; zero intrinsic size → none;
tainted → none; fully transparent → none; normal → jpeg data URL; downscale
math; over the per-frame cap → dropped; budget remainder respected; stale entry
deleted on failure; extractor wiring guard (`video.poster ||` map lookup).

## Review (second agent, 2026-09-13) — "plan OK with changes"

Applied:
- Reject a solid-black frame (EME/DRM video draws opaque black without
  throwing) — a black rectangle is worse than the placeholder. Tests: black
  rejected, near-black kept.
- Skip a video with a zero-size box before drawing, so a hidden video never
  spends the shared budget. Test added.
- Budget: `rasterizeCanvases` is NOT changed (its test expects `undefined`);
  the extractor sums `canvasBitmaps` instead. Canvas-first spending is an
  accepted, documented bias, not document order.

Confirmed, no change: pre-pass sees the post-reduced-motion state every
viewport (finish runs before each EXTRACT_DOM); hover EXTRACT_SUBTREE reuses
the map like canvases do; `collectBitmaplessCanvases` filters `tag === canvas`
so WebGL shots never touch video; `adoptPosterFromSiblings` only fires on a
video with no `$url`, so it composes; the downscale is one uniform factor.

## Verification

Extension tests + `tsc`; `import-boundary.test.ts` stays green; owner captures
apple.com with a dev build → Figma: both hero tiles show an image, not a
placeholder.
