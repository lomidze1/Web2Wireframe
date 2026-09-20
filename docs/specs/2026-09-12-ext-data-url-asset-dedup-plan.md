# Fix plan: the extension stops storing inline image payloads twice (2026-09-12)

## Symptom

After the WebGL canvas pass, the stripe.com `.w2w` grew from 9MB to 27MB. In the decoded capture (`scratchpad/ext3.json`):

- 9 assets are keyed by a whole `data:` URL: 10.1MB of keys plus 10.1MB of content;
- the tree's `$url` holds the same 10.1MB.

That is roughly 20MB of pure duplication.

## Root cause (verified)

`w2wCollectImageUrls` (`packages/browser-extension/src/background/capture/w2w.ts:1182`) returns every `$url`, including `data:` URLs. That is the canvas bitmaps: the content-script export, the tainted shots and the WebGL shots.

- `w2wHarvestImageAssets` (`:1212`) can't find a `data:` URL in the resource tree, so it counts it as missed.
- The page-context fallback (`FETCH_FONT_DATA`, `:556`) then `fetch()`es the data URL, sniffs it, and stores the payload again under the data URL as its key.

The API skips `data:` URLs at the same step (`packages/api/src/lib/cdp/w2w-extraction.ts:516`). The plugin reads a `data:` `$url` directly when the map has no entry for it: `nodes.ts:865-868` and `fills.ts:253-255`. The comment there says a data URL is the payload and never belongs in the map.

## Why not a blanket `data:` filter (regression found)

`main.ts:590-600` turns each asset into `data:${mimeType};base64,${content}`. Figma-unsupported mimes such as webp and avif go through the UI conversion (`assetsToConvert`).

An `<img src="data:image/webp;base64,…">` (or avif) works today only because the harvest re-stored it as an asset and the conversion pipeline then made it Figma-ready. The inline fallback does no conversion, so `figma.createImage` would receive webp bytes. That's a regression, and it's the one the API path already has.

## Change

In `w2wCollectImageUrls`, skip only data URLs the plugin can use exactly as they are: `^data:image/(png|jpeg|gif);base64,` (case-insensitive). For these, the asset `main.ts` would build is the identical string:

- in all three stripe captures, 21 of 21 such assets were byte-identical to their inline payload, with the same mime;
- every data URL on stripe is `canvas:image/png;base64`.

Everything else keeps today's path: webp/avif/svg data URLs, non-base64 data URLs, and http(s) URLs.

All three callers want exactly this set:

- the per-viewport harvest (`:1212`);
- the final page-context recovery list (`:556`);
- the dev-log missing list (`:593`).

## Review (second agent): CONFIRM WITH CHANGES — applied

The first filter would have regressed in three cases, because today's fetch-and-sniff path normalises things that the plugin's inline fallback does not:

1. **Uppercase `DATA:`:** the fallback is case-sensitive (`nodes.ts:866`, `fills.ts:255`), and `img.dataset.src` (`extractor.ts:487`) isn't normalised. So the match must be case-sensitive, and `DATA:` is KEPT.
2. **Mislabelled payloads (webp bytes labelled png):** today recovery sniffs the real mime (`w2w.ts:570`), and the conversion at `main.ts:594` runs on it. So skip a URL only if `w2wSniffImageMime(payload)` equals the declared mime.
3. **Non-canonical base64 (`%`, whitespace, missing padding):** `fetch()` normalises these; the plugin decoders don't. So the payload must be strict `[A-Za-z0-9+/]+={0,2}` with a length that is a multiple of 4.

Final rule: skip iff the URL matches the case-sensitive `^data:image/(png|jpeg|gif);base64,<canonical base64>$` AND the sniffed payload mime equals the declared mime. Then the bytes the plugin renders are identical to today's by construction.

Note: `resourceMapMisses` ends the same only when page-context recovery succeeds. If it fails (for example with an orphaned content script), the popup used to count the canvas data URLs as "couldn't be loaded" even though they rendered. That false warning goes away, which is an improvement.

## Tests (TDD, first)

`w2w-assets-harvest.test.ts` (existing file) or a new `w2w-inline-images.test.ts`:

1. `w2wCollectImageUrls` returns https URLs plus `data:image/webp;base64,…`, `data:image/svg+xml,…` and `data:image/svg+xml;base64,…`, and omits `data:image/png;base64,…`, `data:image/jpeg;base64,…` and `data:image/gif;base64,…`. Uppercase `DATA:IMAGE/PNG;BASE64,` is also omitted.
2. `w2wHarvestImageAssets` over a frame whose only image is an inline PNG makes no resource request, counts no miss, and adds no asset.
3. The existing `w2w-assets-harvest.test.ts` stays green, unchanged.

## Regression control

- **By construction:** for an omitted URL, the plugin's asset (`main.ts:592`) is the identical string, so `nodes.ts:868` / `fills.ts:254` get the same bytes.
- **Capture stats:** `resourceMapMisses` ends the same. The inline URLs were counted as missed, then recovered and decremented. Only the per-viewport "deferred" log line gets smaller.
- **Figma check by the owner:** a new extension capture of stripe.com. Expect the `.w2w` to be about 7-8MB instead of 27MB, and the new ext dump to equal the 2026-09-12T16-41 ext dump: the same node count (3633 ± run noise) and the same 40 IMAGE layers, including the 6 WebGL canvases.
- **Out of scope:** the API's blanket skip (a webp/avif data URL regression on the URL path, LIVE). Recorded here as a finding for a later parity decision.
