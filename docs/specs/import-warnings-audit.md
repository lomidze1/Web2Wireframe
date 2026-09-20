# Import report — silent render fallbacks (audit 2026-09-10)

Places where the Figma result differs from the page **without** a
`recordWarning`. Source: survey of `packages/figma-plugin/src/rendering/`
(~150 swallowed `catch` blocks, only 6 warnings before this work).

Rule for every warning: it fires only when the output really differs
(test proves both sides), `message` is a stable template (per-instance
specifics go in `detail`), and it costs one push on an already-evaluated
condition.

## Batch A — shipped (uncommitted, 2026-09-10)

| # | Where | Loss | Status |
|---|---|---|---|
| 1 | `nodes.ts` placeholder path | realAssets image missing → grey placeholder | ✅ |
| 2 | `fills.ts` IMAGE_PLACEHOLDER | realAssets background missing → solid fill | ✅ |
| 3 | `main.ts` AVIF/WebP convert | conversion timeout/fail | ⏭ covered by #1/#2 (same visible loss) |
| 4 | `css-converter.ts` `detectConverterWarnings` | `filter: brightness/invert/…` dropped | ✅ (identity values + grayscale excluded) |
| 5 | `nodes.ts` frame textContent catch | frame's own text lost | ✅ |
| 6 | `nodes.ts` grid catch | grid → single stacked column | ✅ |
| 7 | converter | `<iframe>` → empty frame (≥40×24) | ✅ |
| 8 | converter | `<canvas>` without bitmap → empty (realAssets only) | ✅ — `<video>` without poster NOT reported (placeholder is intended) |
| 11 | `text.ts` fontName set failure | Inter fallback hid the substitution warning | ✅ bug fixed |

Converter-level losses ride on `WireframeNode.pendingWarnings` and are
emitted in `applySharedDecorationsInner` (so the report row gets a node id).

## Batch B — next (MEDIUM visibility)

| # | Where | Loss | Detectable |
|---|---|---|---|
| 10 | `css-converter.ts:~4096` | mixed `background-clip: text, …` → glyphs invisible | only if text colour is transparent — check first |
| 12 | `nodes.ts:~1194` + `clipPath.ts` | circle/ellipse/polygon/path/url() clip-path → unclipped rect | YES |
| 13 | `nodes.ts:~1786` | near-45° / collapsed transform → upright box | YES |
| 14 | `css-converter.ts:~5279` | 3D transform flattened (`droppedZ` flag exists) | YES |
| 15 | converter | `writing-mode: vertical-*` rendered horizontal | YES |
| 16 | `fills.ts:~755` | 3+ border colours → first colour | YES |
| 17 | `css-converter.ts:~4226` | repeating gradients → single cycle | YES |
| 18 | `text.ts:~1798` | bold/italic run keeps base style | YES |

## LOW / later

outline dropped when border exists; `backdrop-filter` non-blur;
`plus-lighter/darker` blend → NORMAL; hover-variant creation failure;
small-caps / text-shadow / line-clamp fallbacks; style-link skips
(visually identical); `object-fit: fill/none` (PARTIAL); SVG
`<foreignObject>/<filter>/<mask>` (PARTIAL).

## Out of scope (needs 🔴 LIVE extension change)

`mask-image` / `-webkit-mask` — not in the capture list
(`packages/browser-extension/src/content/styles.ts`).
