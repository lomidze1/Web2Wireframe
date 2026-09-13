# Adoption plan — techniques from Figma's capture extension

**Date:** 2026-08-09
**Source of findings:** `_research/figma-extension/README.md` (gitignored research copy
of Figma extension 1.3.24 = the acquired html.to.design engine).
**Status:** proposal. Nothing here is implemented. No code changed.

## Framing

The engine Figma ships is the same one we've been benchmarking against for three years.
Reading it converts "h2d does something we don't" into a list of *named mechanisms*. Two
consequences:

1. Most of the fidelity levers sit in **extraction**, not conversion — i.e. in
   `packages/browser-extension`, which is 🔴 LIVE and frozen by CLAUDE.md.
2. But the majority of those are **additive** (new fields on the captured node). An
   unrecognised field is ignored by the current plugin and by the API, so an additive
   extension release is backward compatible in both directions. That makes Phase 1
   genuinely low-risk — it still needs your explicit go-ahead and a Web Store republish.

Legend: ✅ plugin-only (allowed today) · 🟡 extension, additive (needs approval) ·
🔴 crosses the `@w2w/shared` contract (needs coordinated release)

---

## Phase 0 — plugin-only ✅ DONE (2026-08-10)

The 2026-08-05 audit's "32 captured-but-dropped properties" was already down to **9** by
the time this was picked up (`bffe680`, `774c92b`, `4cf662c` and a parallel session had
consumed the rest). Re-measured: extension captures 112, plugin reads 103.

**Implemented** — all in `packages/figma-plugin`, 32 new tests, suite 2469 green:

- **`gridArea` → grid placement.** The converter resolved a grid child's cell as
  `parseGridLine(s.gridColumnStart) ?? inferGridColumnStart(...)`, but the
  `grid-{row,column}-{start,end}` longhands are not captured, so the explicit path was dead
  and every child fell through to the geometric inference — which bails out unless every
  track is a fixed `px` value. `fr` / `minmax` / `%` grids therefore lost all explicit
  placement. `grid-area` **is** captured and carries all four lines; new `parseGridArea`
  feeds it in ahead of the inference, which stays as the fallback for spans and named areas.
- **`aspectRatio` → `constrainProportions`.** No import-time delta; the ratio survives a
  later manual resize.
- **`flexShrink: 0` no longer becomes FILL** on the main axis (cross-axis sizing is
  untouched — `flex-shrink` is a main-axis property).
- **Cross-axis FILL detection subtracted only padding** from the parent's border box, so a
  parent with a border thicker than 1px per side silently lost the `width: 100%` → FILL
  upgrade. Border widths now come off too.

**Closed as not implementable** — recorded in the `css-converter.ts` file header so this
does not get re-opened by the next audit: `wordSpacing` (absent from the Figma API),
`writingMode` (no vertical writing mode), `boxSizing` (geometry already arrives as the
border box), `flexBasis` (subsumed by measured width + `flexGrow`), `backgroundOrigin`
(paint placement is `imageTransform`), `outlineOffset` (`strokeAlign` has no offset).

Remaining plugin-only opportunity, deliberately **not** part of Phase 0: the Figma
Variables API is still entirely unused — captured CSS custom properties only ever become
PaintStyles (`main.ts:324`). That is a feature, not a cleanup.

---

## Phase 1 — extension, additive 🟡

Ranked by (fidelity gain) ÷ (risk).

### 1.1 Canvas font metrics → real line box height  ⭐ top pick
**What they do:** a small font manager builds a `<canvas>` 2D context and, per
(family, stretch, style, weight, size) actually used on the page, measures
`fontBoundingBoxAscent + fontBoundingBoxDescent` → the **line box height**. It also
detects whether a family is genuinely available by comparing `measureText` widths against
monospace/sans-serif/serif at 72px.

**Why we want it:** `line-height: normal` is font-dependent and unknowable from CSS
alone. Today we hardcode `fontSize * 1.2` for it —
[text.ts:1694](../../packages/figma-plugin/src/rendering/text.ts#L1694) and
[text.ts:2008](../../packages/figma-plugin/src/rendering/text.ts#L2008) — while real
families land anywhere from ~1.0 to ~1.5. That single constant is a systematic
vertical-rhythm error on every `normal` run, and "line breaks" is the #1 item in the
2026-08-08 render audit. It also gives us an
independent signal for the CDP platform-font sentinel problem
(`project_cdp-platform-font-sentinel`): if the canvas says the family isn't available,
don't trust the measured font name.

**Shape:** new `fonts: { [family]: { familyName, usages: [{ stretch, style, weight, size,
metrics }] } }` block on the capture payload. Purely additive.

**Cost:** ~150 lines in the extension, plus converter work in the plugin to consume it.

### 1.2 Pseudo-element sentinel with `content: none` suppression
**What they do:** inject a `<span style="all:initial">` carrying the pseudo's computed
styles + resolved content, **and at the same time** push an `adoptedStyleSheets` rule
`[data-h2d-suppress-before]::before { content: none !important }` onto that root, so the
real pseudo stops rendering while the sentinel is measured. They also resolve
`open-quote`/`close-quote` against the `quotes` property, and early-out on
`content: none|normal|no-open-quote|no-close-quote`.

**Where we are:** [extractor.ts:824](../../packages/browser-extension/src/content/extractor.ts#L824)
injects a span but does **not** suppress the original, so for the duration of the
measurement both the real pseudo and our probe are in the layout — the sentinel's own
rect is right, but the surrounding flow is displaced. Our `all:initial` reset and quote
resolution are also missing. This is a correctness fix, not a new feature.

### 1.3 Close the 69-property gap
Measured diff (`CSS_PROPERTIES` in
[styles.ts:16](../../packages/browser-extension/src/content/styles.ts#L16) vs their
frozen `je` table): **ours 112, theirs 163.**

They have and we don't (69):
`accentColor, alignContent, appearance, backfaceVisibility, backgroundAttachment,
backgroundPositionX, backgroundPositionY, borderCollapse, borderImage{Outset,Repeat,Slice,
Source,Width}, borderSpacing, clear, clip, clipRule, colorScheme, columnCount, columnFill,
columnRule{Color,Style,Width}, columnSpan, columnWidth, contain, containerType,
contentVisibility, float, fontFeatureSettings, fontKerning, fontOpticalSizing, fontPalette,
fontSizeAdjust, fontStretch, fontVariationSettings, gridAuto{Columns,Rows},
grid{Column,Row}{Start,End}, gridTemplateAreas, isolation, justifyItems, justifySelf,
lineBreak, listStyle{Image,Position}, perspective, perspectiveOrigin, quotes, rotate,
stroke{Dasharray,Dashoffset,Linecap,Linejoin,Miterlimit,Opacity,Width}, textDecoration{Color,
Style}, textIndent, textWrapStyle, transformStyle, transitionProperty, translate,
verticalAlign, willChange`

Highest converter value from that list: **`fontStretch` / `fontVariationSettings` /
`fontFeatureSettings`** (variable fonts — we already fight font-cut resolution),
**`verticalAlign`**, **`textIndent`**, **`textDecorationColor/Style`**,
**`borderCollapse` / `borderSpacing`** (tables), **`column*`** (multi-column text),
**`float` / `clear`** (we infer floats today — see `project_carousel-culling-and-float-rows`),
**`rotate` / `translate`** (independent transform properties, increasingly common),
**`stroke*`** (SVG), **`listStyleImage/Position`**.

We have and they don't (18) — mostly shorthands they deliberately avoid
(`margin, padding, gap, borderColor/Style/Width, textDecoration, backgroundPosition,
gridArea, cssFloat`) plus genuine wins for us: `direction, fill, objectPosition,
textOverflow, webkitLineClamp, webkitTextStroke*, wordSpacing`. **We are ahead on
ellipsis/line-clamp.** Consider dropping the shorthands: computed shorthands are
inconsistent across engines and the longhands are already there.

### 1.4 Transform-aware geometry
`offsetWidth/offsetHeight` when the element carries transform/rotate/scale/translate
(gives the *untransformed* layout box), `getBoundingClientRect` otherwise;
`SVGSVGElement` → computed width/height with `baseVal` fallback; `SVGGraphicsElement` →
`getBBox`. Cheap, self-contained, and fixes rotated/scaled elements arriving with the
wrong box.

### 1.5 Cascade-correct CSS variable resolution
Their stylesheet walk merges `styleSheets + adoptedStyleSheets`, dedups by `href`,
evaluates `@media`, recurses `CSSGroupingRule`, and knows about `CSSLayerBlockRule`
(cascade layers) — then resolves custom properties and their inheritance by walking
`parentElement ?? getRootNode().host`, so Shadow DOM is crossed correctly. Compare against
our CDP `extractCSSVariables`; if ours is a flat global enumeration, layered/scoped
variables resolve wrong on modern sites.

### 1.6 Enrich the SVG bake
`cb761a3` already bakes computed paint into inline SVG. Their default table `qo` is
broader (`alignmentBaseline, clip, clipPath, clipRule, color, colorInterpolation, …`) and
they also stamp `width`/`height` from computed px onto the clone. Small delta, direct
quality win on icon sets.

### 1.7 Drop CDP where a DOM trick is enough
They hide the scrollbar for the duration of the capture instead of asking
`Page.getLayoutMetrics` for the compensation. Less CDP surface = fewer
`chrome.debugger` attach failures and no debugger banner for that path. Worth evaluating
in isolation — we still need CDP for viewport emulation, font binaries and hover.

---

## Phase 2 — structural, needs a coordinated release 🔴

### 2.1 Stop splitting text into one node per visual line ⭐ biggest single change
**What we do:** [extractor.ts:556](../../packages/browser-extension/src/content/extractor.ts#L556)
walks the text node character by character with a fresh `Range` per index and emits **one
`TEXT` node per visual line**.

**What they do:** one Range for the whole text node → `getBoundingClientRect()` +
`getClientRects()`; `lineCount` is derived by clustering rect centers along the block
axis with a 1px tolerance (writing-mode aware); the text stays **one node**. When the
element is under a transform, the raw rects are thrown away and an AABB is solved in
inverse-parent-transform space using the line box height from 1.1.

**Why it matters:** per-line splitting is the structural reason our hard line breaks,
margin collapse and text-merge work keeps needing special cases, and it produces Figma
text that is not editable as a paragraph. `lineCount` as a *verification* signal (did the
re-flow in Figma produce the same number of lines?) is a much stronger design than baking
the browser's wrap into the output.

**Cost:** this changes the shape of `W2WTextNode` → `@w2w/shared` → API → plugin. It is a
real migration: the plugin must handle both shapes for at least one release, and the
extension/API/plugin must ship in the documented order (API first, then clients). Not a
one-week job — but it is the item that most separates our output from theirs.

### 2.2 React fiber component naming
Reading `__reactFiber$*` for component name, props and source location gives named,
component-shaped layers instead of `div / div / span`. Their `data-figma-asset-key` +
`data-figma-variant-props` path maps an element directly onto a real Figma component with
variants — that's Figma-ecosystem-specific and not copyable, but **layer naming from
React component names is**, and it is highly visible to users.

### 2.3 Preview-iframe targeting — product, not just fidelity
They special-case Figma Make, **v0.dev**, **bolt.new**, **claude.ai / claude.site
artifacts**, **chatgpt.com canvas**, Gemini, Replit and Genspark: probe all frames, pick
the least wrapper-like frame whose loaded URL matches, inject there, fall back to
top-frame on a miss.

Today a W2W capture on any of those pages grabs the host chrome, not the app. Those users
are exactly the "vibe coding → hand it to a designer" segment. This is a **positioning**
item as much as a technical one and belongs in the growth conversation, not only here.

---

## Suggested sequence

| Step | Scope | Gate |
|---|---|---|
| Phase 0 | plugin | none — can start now |
| 1.1 + 1.2 | extension (additive) | your approval + Web Store republish |
| 1.3 + 1.4 | extension (additive) | same release as above |
| 1.5 – 1.7 | extension / api | separate, after 1.1–1.4 verified in Figma |
| 2.1 | shared contract | dedicated plan + staged release |
| 2.2 / 2.3 | extension | after 2.1, or standalone if prioritised for growth |

Per CLAUDE.md every extension release goes: verify in Figma → `USE_PRODUCTION=false` →
commit → API deploy first if `api`/`shared` moved → then plugin publish + Web Store upload.

## Boundary

This plan describes **mechanisms** observed in third-party code. Implementations must be
written from scratch against our own types. No lines are copied from
`_research/figma-extension/` (which is gitignored and never shipped).
