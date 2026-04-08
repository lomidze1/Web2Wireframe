# h2d vs Web2Wireframe -- Exhaustive Differences

> Generated 2026-03-28 from reverse-engineering h2d v0.0.191 and W2W `test` branch source code.
> Test site: tesla.com (1440w, default theme).

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [CSS Properties](#2-css-properties)
3. [Node Types](#3-node-types)
4. [Layout Detection](#4-layout-detection)
5. [Image/Asset Handling](#5-imageasset-handling)
6. [SVG Handling](#6-svg-handling)
7. [Font Handling](#7-font-handling)
8. [Text Handling](#8-text-handling)
9. [Visibility/Filtering](#9-visibilityfiltering)
10. [Hover/Interaction States](#10-hoverinteraction-states)
11. [Shadow DOM](#11-shadow-dom)
12. [Pre-Capture Preparation](#12-pre-capture-preparation)
13. [Pseudo Elements](#13-pseudo-elements)
14. [Transform Handling](#14-transform-handling)
15. [Specific CSS Features](#15-specific-css-features)
16. [Output Format](#16-output-format)
17. [Performance](#17-performance)

---

## 1. Architecture

### 1.1 Extraction Method

| Aspect | h2d | W2W |
|--------|-----|-----|
| Primary extraction | Content script `getComputedStyle()` + `computedStyleMap()` | `DOMSnapshot.captureSnapshot` (single CDP call) |
| Style source | In-page JavaScript (content script in isolated world) | CDP DOMSnapshot computed styles array |
| CSS rules access | NOT used (`CSS.getMatchedStylesForNode` count = 0) | Used for gradient/variable/hover nodes |
| DOM traversal | TreeWalker + recursive `no()` function | Flat array from DOMSnapshot, parent-child index map |
| Element marking | Adds `h2d-*` CSS classes to all 2,220 elements before capture | No page modification |

**h2d:** Content script runs `getComputedStyle()` on every element in the actual page context, then sends raw CSS string values to the Figma plugin.

**W2W:** Uses `DOMSnapshot.captureSnapshot` which returns a flat array of all nodes with their computed styles in a single CDP call. Then selectively calls `CSS.getMatchedStylesForNode` for nodes with gradients, CSS variables, borders, or hover states.

**Impact:** h2d's approach is simpler but modifies the page (class injection). W2W's snapshot approach is more efficient (one call vs thousands of getComputedStyle) but gets slightly different data (DOMSnapshot uses the same computed style engine but returns a subset of requested properties).

**Difficulty to align:** N/A -- architectural choice, not a bug.

### 1.2 Conversion Location

| Aspect | h2d | W2W |
|--------|-----|-----|
| Where CSS -> Figma conversion happens | **Figma plugin** (2MB JS bundle) | **tree-builder.ts** (extraction side) |
| Data passed to renderer | Raw CSS strings (`display: "flex"`, `width: "auto"`) | Pre-computed Figma values (`layoutMode: "HORIZONTAL"`, `width: 1440`) |
| Plugin complexity | Heavy -- full CSS interpretation engine | Light -- mostly `createFrame`/`createTextNode` |
| Error recovery at render time | Plugin can re-interpret raw CSS | Plugin has no raw CSS, cannot fix bad conversion |

**Impact:** This is the single most impactful architectural difference. h2d's Figma plugin has access to ALL raw CSS and can make intelligent layout decisions (e.g., "this 100% width inside a flex container should be FILL"). W2W's plugin only gets pre-computed values and cannot recover from tree-builder mistakes.

**Difficulty to fix:** Hard -- would require passing `computedStyles` through to Plugin_Frontend and building a CSS interpretation engine there. W2W already partially does this with the `computedStyles` passthrough field on ExtractedElement but it is not widely used at render time.

### 1.3 Data Flow

```
h2d:
  Content Script (getComputedStyle) --> raw CSS JSON --> XOR+deflate --> .h2d file --> Figma Plugin (CSS->Figma engine)

W2W (Browser Extension path):
  Browser_Extension (CDP snapshot) --> Plugin_Backend (pendingCDPImports) --> Plugin_Frontend (render only)

W2W (Puppeteer/URL path):
  Plugin_Backend (Puppeteer CDP) --> tree-builder --> Plugin_Frontend (render only)
```

---

## 2. CSS Properties

### 2.1 Properties h2d captures that W2W does NOT request in DOMSnapshot

W2W's `SNAPSHOT_COMPUTED_STYLES` requests ~67 properties. h2d's `td` array + `computedStyleMap` reads ~99 properties.

**Properties h2d captures that W2W completely misses:**

| Property | h2d Usage | Impact | Fix Difficulty |
|----------|-----------|--------|----------------|
| `accentColor` | Form element accent | Minor -- form controls | Easy |
| `appearance` | 23 nodes (button, none) | Minor -- mostly cosmetic | Easy |
| `backgroundBlendMode` | Layer compositing | Medium -- multi-layer backgrounds | Easy |
| `backgroundClip` | Text clipping effects | Medium -- `background-clip: text` | Easy |
| `backgroundOrigin` | Background positioning box | Minor | Easy |
| `clip` | Legacy clipping (`rect()`) | Medium -- visibility filtering | Easy |
| `clipPath` | 1 node (`inset(100%)`) | High -- affects visibility + visual masking | Medium |
| `content` | 12 nodes (pseudo-elements) | High -- pseudo-element content | Already partially handled |
| `direction` | RTL text support | Medium -- internationalization | Easy |
| `fill` | SVG fill color | Medium -- inline SVG coloring | Easy |
| `float` | Legacy float layouts | Low -- mostly superseded by flex | Easy |
| `fontStretch` | Font width variation | Low -- rarely used | Easy |
| `fontVariationSettings` | Variable font axes | Medium -- modern typography | Medium |
| `gridTemplateAreas` | Named grid areas | High -- grid layout | Hard |
| `isolation` | Stacking context | Low -- compositing edge case | Easy |
| `justifySelf` | Per-item alignment | Medium -- grid/flex layouts | Easy |
| `letterSpacing` | **W2W does capture this** | -- | -- |
| `margin` (shorthand) | 35 nodes | Medium -- h2d uses shorthand, W2W uses longhand | N/A (same data) |
| `mixBlendMode` | **W2W does capture this** | -- | -- |
| `objectPosition` | Image positioning within frame | Medium -- hero images | Easy |
| `outlineColor` | 695 nodes | Low -- outlines not usually in Figma | Easy |
| `outlineOffset` | 680 nodes | Low | Easy |
| `outlineStyle` | Outline rendering | Low | Easy |
| `outlineWidth` | Outline rendering | Low | Easy |
| `pointerEvents` | 174 nodes | Low -- no Figma equivalent | N/A |
| `rotate` | CSS `rotate` property (separate from `transform`) | Medium -- modern transform syntax | Easy |
| `scale` | CSS `scale` property (separate from `transform`) | Medium -- modern transform syntax | Easy |
| `textOverflow` | `ellipsis` truncation | Medium -- text clipping | Easy |
| `textShadow` | Text shadow effects | Medium -- visual effect | Medium |
| `verticalAlign` | 8 nodes (middle) | Low -- mostly for inline elements | Easy |
| `visibility` | Hidden but space-occupying | Medium -- visibility filtering | Easy |
| `webkitMaskClip` | Mask clipping | Low -- rare | Easy |
| `webkitMaskImage` | Mask images (gradients) | Medium -- fade effects | Hard |
| `webkitMaskOrigin` | Mask positioning | Low | Easy |
| `webkitMaskPosition` | Mask positioning | Low | Easy |
| `webkitMaskRepeat` | Mask tiling | Low | Easy |
| `webkitMaskSize` | Mask sizing | Low | Easy |
| `webkitTextFillColor` | 689 nodes -- gradient text | High -- text color override | Easy |
| `webkitTextStrokeColor` | 689 nodes -- text outline | Medium -- text effects | Easy |
| `webkitTextStrokeWidth` | Text outline width | Medium | Easy |
| `writingMode` | Vertical text (`vertical-rl`) | Medium -- CJK layouts | Medium |

### 2.2 Properties W2W captures that h2d does NOT

| Property | W2W Usage | Notes |
|----------|-----------|-------|
| `border-top-width` (individual) | Per-side border widths | h2d uses shorthand `borderWidth` only |
| `border-top-color` (individual) | Per-side border colors | h2d uses shorthand `borderColor` only |
| `list-style-position` | Bullet position (inside/outside) | h2d does not capture this |
| `text-decoration-line` | Separate from text-decoration | h2d captures combined `textDecoration` |
| `text-decoration-color` | Decoration color | h2d does not capture |
| `text-decoration-style` | Solid/dotted/dashed | h2d does not capture |
| `text-decoration-thickness` | Decoration thickness | h2d does not capture |

### 2.3 computedStyleMap() API

h2d uses the CSS Typed OM (`computedStyleMap()`) for 10 properties:
- `width`, `height`, `left`, `top`, `right`, `bottom`, `flexGrow`, `flexShrink`, `order`, `opacity`

This gives typed values (`CSSUnitValue`, `CSSKeywordValue`) which can distinguish `auto` from `0px` -- critical for sizing decisions.

**W2W:** Uses only string values from DOMSnapshot. Cannot distinguish `width: auto` from `width: 0px` when the element happens to be 0px wide.

**Impact:** Medium -- affects sizing accuracy (HUG vs FIXED decisions).
**Difficulty to fix:** Hard -- would require Runtime.evaluate calls for each element, defeating the snapshot approach.

---

## 3. Node Types

### 3.1 Type Comparison

| h2d Type | Count (Tesla) | W2W Equivalent | Notes |
|----------|---------------|----------------|-------|
| FRAME | 695 | `frame` | Equivalent |
| TEXT | 99 | `text` | Different content model (see section 8) |
| SVG | 12 | `placeholder` | **W2W has no SVG type** -- SVGs become placeholders |
| -- | -- | `placeholder` | W2W has a placeholder type for images/media |

### 3.2 Node Creation Logic

**h2d:** Three decision branches in `no()` function:
1. `mo(t)` -- text node (nodeType 3) --> create TEXT
2. `Wr(t)` -- SVG element --> create SVG with full `outerHTML`
3. Element node --> create FRAME via `ro()`, recurse children

**W2W:** Decision in `buildNode()`:
1. `SKIP_TAGS` -- skip entirely (script, style, meta, etc.)
2. `MEDIA_TAGS` (img, video, iframe, svg, canvas) --> `placeholder` type
3. `TEXT_TAGS` (h1-h6, p, span, label, button, etc.) --> `text` type
4. Everything else --> `frame` type, recurse children

**Key difference:** h2d decides node type by the DOM node type (text node vs element vs SVG), while W2W decides by tag name. This means:
- In h2d, a `<button>` is always a FRAME (with a TEXT child for its label)
- In W2W, a `<button>` is a `text` type (has text content directly)

**Impact:** Medium -- h2d's approach creates cleaner hierarchy (button = frame + text child). W2W's approach loses the frame wrapper unless `needsFrameWrapper()` detects padding/background/border.
**Difficulty to fix:** Medium -- would require refactoring the TEXT_TAGS classification.

---

## 4. Layout Detection

### 4.1 Flex Layout

| Aspect | h2d | W2W |
|--------|-----|-----|
| Detection | Raw `display: flex/inline-flex` stored in styles | Computed in `getLayoutMode()` from `display` + `flex-direction` |
| Direction | `flexDirection: "column"/"row"` raw CSS | `layoutMode: "HORIZONTAL"/"VERTICAL"` pre-computed |
| Gap | `gap: "0px 24px"` (supports row-gap/column-gap separately) | `itemSpacing` (single number from `gap` or `row-gap`/`column-gap`) |
| Flex grow/shrink | `flexGrow: 0/1`, `flexShrink: 0/1` on each child | `layoutGrow: 0/1` pre-computed |
| Flex basis | `flexBasis: "0px"/"auto"` | Not directly captured |
| Flex wrap | `flexWrap: "wrap"` | `flexWrap: "wrap"` (captured) |
| Alignment | `alignItems`, `justifyContent`, `alignSelf`, `justifyItems` | `alignItems`, `justifyContent` (captured); `alignSelf` partially |
| Order | `order: 0` (on all 695 nodes) | Not captured |

**Impact:** Medium -- W2W captures the main flex properties. Missing `flexBasis` and `order` cause occasional layout issues.
**Difficulty to fix:** Easy for order/flexBasis.

### 4.2 CSS Grid

| Aspect | h2d | W2W |
|--------|-----|-----|
| Detection | `display: grid` + `gridTemplateColumns/Rows/Areas` | `grid-template-columns/rows` requested in snapshot but **not used in tree-builder** |
| Grid areas | `gridArea: "tds-shell-content"` | Not captured |
| Grid auto-flow | `gridAutoFlow: "column"` | `grid-auto-flow` requested but not used |
| Figma conversion | Grid --> Figma Grid layout (full support) | **Grid treated as NONE layout** |

**h2d captures 102 grid elements on Tesla.com (5.9% of visible elements).** These include product grids, card layouts, and full-page structure. W2W treats all of these as non-layout containers, causing incorrect positioning.

**Impact:** High -- modern sites heavily use CSS Grid.
**Difficulty to fix:** Hard -- requires building a CSS Grid -> Figma layout converter.

### 4.3 Sizing (HUG / FILL / FIXED)

| Aspect | h2d | W2W |
|--------|-----|-----|
| Method | Raw CSS values (`auto`, `100%`, `fit-content`) interpreted by Figma plugin | Pre-computed by `getLayoutSizing()` in tree-builder |
| `width: auto` | Plugin decides HUG or FILL based on context | `getLayoutSizing()` returns FIXED (defaults to pixel value) |
| `width: 100%` | FILL (within flex/grid) | FILL (when parent has flex layout) |
| `width: fit-content` | **Detected via padding manipulation trick** | Not detected (treated as FIXED) |
| `height: auto` | HUG (if flex/grid child) or FIXED | HUG or FIXED heuristic |
| `min-width/max-width` | Available as raw CSS for constraint decisions | Not used for sizing decisions |

### 4.4 fit-content Detection

**h2d** uses a clever DOM manipulation trick:

```javascript
// Temporarily remove parent padding to check if element width is intrinsic
parent.style.paddingRight = "";
let changed = element.computedWidth !== originalWidth;
// If NOT changed -> width is fit-content (intrinsic)
```

**W2W** has no equivalent. Elements with `width: fit-content` are treated as FIXED width.

**Impact:** High -- many buttons, badges, and inline-block elements use fit-content. Getting this wrong makes them too wide or too narrow in Figma.
**Difficulty to fix:** Medium -- can only be done in content script context (Browser Extension), not in DOMSnapshot.

---

## 5. Image/Asset Handling

### 5.1 Extraction Method

| Aspect | h2d | W2W (Browser Extension) | W2W (Puppeteer) |
|--------|-----|-------------------------|-----------------|
| Method | `Page.getResourceTree` + `Page.getResourceContent` | Same approach | `extractAssetsForTree()` (broken) |
| Source | Browser cache (0 HTTP requests) | Browser cache | HTTP fetch (CORS issues) |
| Count (Tesla) | 42 assets (37 images + 5 CSS/fonts) | Similar | **0 assets (known bug)** |
| Size | 1.7MB in 64ms | Similar | N/A |
| Format | Base64 embedded in .h2d JSON | Base64 in assets map | Missing `convertImage` callback |
| WebP/AVIF | Handled by browser | Handled by browser | No OffscreenCanvas in Node.js |

**Impact:** Critical for Puppeteer path -- URL imports produce empty image frames. Browser Extension path works similarly to h2d.
**Difficulty to fix:** Medium -- add `sharp` library for Node.js image conversion.

### 5.2 Image Reference

**h2d:** Node has `$url` pointing to `assets{}` dictionary. Images are embedded as base64 data URIs.

**W2W:** Node has `imageUrl` (original URL) + `additionalImageUrls` (multiple background layers). Assets stored separately in `CapturedFrame.assets` map (URL -> base64).

### 5.3 Background Images

| Aspect | h2d | W2W |
|--------|-----|-----|
| `background-image: url()` | Extracted via `getAssetWithCDP` in content script | Detected in `computedStyles["background-image"]`, URL extracted |
| Multiple `url()` layers | Each extracted separately | `additionalImageUrls` array for 2nd+ layers |
| `background-size` | `backgroundSize: "cover"/"contain"` stored | Used for `scaleMode: "FILL"/"FIT"` in Figma |
| `background-position` | `backgroundPosition: "6px 50%"` stored | Not used for positioning |

---

## 6. SVG Handling

| Aspect | h2d | W2W |
|--------|-----|-----|
| Detection | `Wr(t)` -- checks if element is SVG | `MEDIA_TAGS` includes `"svg"` |
| Extraction | Full SVG markup via `t.cloneNode(true).outerHTML` | **Not extracted** |
| Output | `{ type: "SVG", svg: "<svg>...</svg>" }` | `{ type: "placeholder", isPlaceholder: true }` |
| Figma rendering | `figma.createNodeFromSvg(markup)` -- perfect vector | Grey placeholder frame with "X" |
| Icon SVGs | Full vector paths preserved | Lost (grey rectangle) |
| Complex SVGs | Inline SVG with all paths/groups | Not supported |

**Impact:** Critical -- SVG icons and logos are ubiquitous. W2W renders them as grey placeholder boxes, losing all visual information.
**Difficulty to fix:** Medium -- need to serialize SVG outerHTML and pass through to Plugin_Frontend. Requires new node type or field.

---

## 7. Font Handling

### 7.1 Font Detection

| Aspect | h2d | W2W |
|--------|-----|-----|
| CSS font-family | `fontFamily` on every FRAME node | `font-family` in computedStyles |
| Platform font | `CSS.getPlatformFontsForNode` (7 calls on Tesla) | Same approach via `collectPlatformFonts()` |
| Font resolution | Platform font for TEXT nodes only | Platform font for all text elements + icon pseudo-elements |

### 7.2 Font Data Extraction

| Aspect | h2d | W2W |
|--------|-----|-----|
| @font-face URLs | Extracted via `Page.getResourceContent` (CSS files) | Extracted in `extractFontFaces()` |
| Font binary data | **Extracted as base64** from browser cache | **Not extracted** (URLs only) |
| Font embedding | Font files embedded in .h2d file | Only URL references stored |
| Google Fonts | Handled via resource extraction | `isGoogleFont` flag detected |

**Impact:** Medium -- h2d can ship font files with the design, W2W relies on Figma having the fonts installed.
**Difficulty to fix:** Easy -- use `Page.getResourceContent` for font files.

### 7.3 Icon Font Detection

Both tools detect icon fonts, but with different approaches:

| Aspect | h2d | W2W |
|--------|-----|-----|
| Detection | Via content property on pseudo-elements | `isIconFont()` pattern matching + class name hints |
| Platform font | Used for accurate font family name | Used (`iconPlatformFontMap`) |
| Fallback | N/A | Runtime extraction via `getComputedStyle(el, '::before')` |

**Impact:** W2W has more robust icon font detection with multiple fallback layers.

---

## 8. Text Handling

### 8.1 Text Node Structure

| Aspect | h2d | W2W |
|--------|-----|-----|
| TEXT node content | `{ value: "Vehicles", font: "Universal Sans Text Medium" }` | Full element with `textContent`, `fontSize`, `fontWeight`, etc. |
| Typography styles location | **On PARENT frame** | **On text node itself** |
| Font info | `platformFont: { familyName: "..." }` | `fontFamily`, `platformFontFamily`, `fontFamilyList` |
| Text node children | Never (always leaf) | Never (always leaf in final tree) |

**h2d:** TEXT node is minimal -- just value + font name. All typography styles (fontSize, color, lineHeight, textAlign) are stored on the parent FRAME node. The Figma plugin reads the parent's styles when creating the text.

**W2W:** Text node carries all its own typography properties. This is more self-contained but creates potential style duplication with parent frames.

### 8.2 Styled Text Segments

| Aspect | h2d | W2W |
|--------|-----|-----|
| Mixed inline styles | **Single style per text** | `styledSegments[]` with per-segment color/weight/size |
| Example: `<p>Hello <b>world</b></p>` | One TEXT "Hello world" with parent's style | Two segments: `[{text:"Hello "}, {text:"world", fontWeight:700}]` |
| Link detection | Not in TEXT node | `isLink: true` on `<a>` segments |
| Text decoration per segment | Not supported | `textDecoration`, `textDecorationColor`, `textDecorationStyle` |

**Impact:** W2W has **better** styled text support than h2d. h2d loses inline style variations (bold within paragraph, colored links, etc.).
**Difficulty to fix:** N/A -- W2W advantage.

### 8.3 Text Merging

| Aspect | h2d | W2W |
|--------|-----|-----|
| Inline text merging | Aggressive -- 193 `<span>` --> 10 FRAME nodes | Partial -- inline elements collected as segments |
| `<a>` merging | 342 `<a>` --> 42 FRAME nodes (88% merged) | Collected as styled segments when inside text elements |
| `<li>` merging | 237 `<li>` --> 16 FRAME nodes (93% merged) | `<li>` handled as frame with bullet + text children |

### 8.4 Text Line Detection

| Aspect | h2d | W2W |
|--------|-----|-----|
| Line count | Via text quads (`B2()` function) | Via `textBoxes` from DOMSnapshot |
| Ellipsis detection | Detects `text-overflow: ellipsis` truncation | `textOverflow` not captured |
| Line height accuracy | From rendered text boxes | From `collectRawTextBoxes()` with DPR scaling |

---

## 9. Visibility/Filtering

### 9.1 h2d Filtering (2220 --> 806 nodes, 63% filtered)

h2d's `po()` visibility function checks:
1. `display: none` --> skip
2. No `offsetParent` + zero size --> skip (exception: body, html, fixed)
3. `overflow: hidden` + width/height < 1px --> skip
4. `clip: rect(0,0,0,0)` --> skip
5. `clipPath: inset(50%)` --> skip
6. `clipPath: inset(0px 0px 99.9% 99.9%)` --> skip

### 9.2 W2W Filtering

W2W's `buildNode()` checks:
1. `SKIP_TAGS` (script, style, meta, noscript, link, head, title, br, base, template)
2. `bounds.width < 1 || bounds.height < 1` (except media tags)
3. `visibility: hidden` -- **not checked**
4. `display: none` -- elements with no layout bounds from DOMSnapshot are implicitly filtered

### 9.3 Differences

| Check | h2d | W2W |
|-------|-----|-----|
| Skip tags | script, link, meta, style, head, title, noscript, br, dialog, table/tbody/tr/td, video, kbd | script, style, meta, noscript, link, head, title, br, base, template |
| `display: none` | Explicit check | Implicit (no bounds in snapshot) |
| `visibility: hidden` | Checked in text node creation | **Not checked** -- may render invisible elements |
| `offsetParent` null | Checked | **Not checked** |
| `clip` / `clipPath` | Multiple patterns checked | **Not checked** |
| `overflow + zero size` | Checked | **Not checked** |
| Off-screen elements (y < 0) | Filtered by zero-bounds | **Not filtered** -- may include off-screen elements |
| Lazy-loaded images | Filtered by content script | Included with 0 bounds (fallback sizing applied) |

**Impact:** High -- W2W may include invisible elements and miss accessibility-hidden elements (sr-only patterns use `clip: rect(0,0,0,0)` or `clipPath: inset(50%)`). This adds noise to the Figma output.
**Difficulty to fix:** Easy -- add clip/clipPath/visibility checks in `buildNode()`.

---

## 10. Hover/Interaction States

| Aspect | h2d | W2W |
|--------|-----|-----|
| Method | `CSS.forcePseudoState` on 56 elements | `CSS.getMatchedStylesForNode` pseudoElements data |
| Hover data | **Complete sub-tree re-serialized with :hover forced** | `PseudoStateStyles.hover` -- changed CSS properties only |
| States captured | `:hover` only (56 elements on Tesla) | `:hover`, `:focus`, `:active`, `:focus-visible` |
| Figma output | Component variants (default + hover) | `pluginData("hoverStyles")` -- stored for future variant generation |
| Visual difference | Hover variant visually different (color changes, transforms) | Style delta stored but not rendered as variants |

**h2d approach:** Forces `:hover` pseudo-state via CDP, then re-captures the entire sub-tree. This means hover states include layout changes, child visibility changes, and cascading style changes. The Figma plugin creates component variants.

**W2W approach:** Extracts only the CSS property differences between normal and hover states. Stores as metadata on the frame. Does not create Figma variants.

**Impact:** High -- h2d produces interactive components; W2W produces static frames.
**Difficulty to fix:** Hard -- requires variant generation in Plugin_Frontend + sub-tree re-capture.

---

## 11. Shadow DOM

| Aspect | h2d | W2W |
|--------|-----|-----|
| Detection | `chrome.dom.openOrClosedShadowRoot()` | DOMSnapshot `shadowRootType` (open/closed) |
| Traversal | Full shadow DOM content serialized | `contentDocumentIndex` for iframes; shadow roots parsed but **not traversed** |
| Marking | `__h2d_shadowRoot` attribute on shadow hosts | Shadow root type stored on `ParsedSnapshotNode` |
| Count (Tesla) | 9 shadow roots fully extracted | 9 shadow roots detected but content not merged |

**h2d:** Shadow DOM content is serialized separately and merged into the parent tree. Shadow hosts get a special attribute. The content script accesses shadow DOM via `chrome.dom.openOrClosedShadowRoot()` which even accesses closed shadow roots.

**W2W:** DOMSnapshot includes shadow DOM content in the flat node array with `shadowRootType` annotations. However, the `buildElementTree()` function does not currently merge shadow DOM children into the parent tree.

**Impact:** Medium -- depends on how much content is inside shadow DOM. Tesla has 9 roots (some Google Maps widgets, custom elements).
**Difficulty to fix:** Medium -- DOMSnapshot already captures shadow DOM data; need to handle the parent-child traversal in tree-builder.

---

## 12. Pre-Capture Preparation

### 12.1 h2d Style Injection (5 style elements)

| Injection | CSS | Purpose |
|-----------|-----|---------|
| 1. Animation pause | `animation-play-state: paused !important` | Freeze animations mid-state |
| 2. Transition disable | `transition-duration: 0s !important` | Prevent mid-transition captures |
| 3. Scrollbar hide | `body::-webkit-scrollbar { display: none }` | Clean capture without scrollbars |
| 4. Caret hide | `caret-color: transparent !important` | Remove text cursor from focused inputs |
| 5. Hover transition | Same as #2 (for hover state capture) | Instant hover state |

### 12.2 W2W Pre-Capture

**W2W does NONE of this.** No style injection before capture.

**Impact:** Medium -- W2W may capture mid-animation states, visible scrollbars, and blinking cursors. Transitions during capture can cause inconsistent style readings.
**Difficulty to fix:** Easy -- inject styles via `Runtime.evaluate` before snapshot.

---

## 13. Pseudo Elements

### 13.1 ::before/::after

| Aspect | h2d | W2W |
|--------|-----|-----|
| Detection | `fetchBeforeAfter` message via CDP | DOMSnapshot `pseudoType` field |
| Output | **111 standalone FRAME nodes** (tag: "UNKNOWN") | Pseudo-element text extracted, icon fonts handled |
| Box model | Full CDP box model for positioning | Bounds from DOMSnapshot layout |
| Content | CSS `content` property value | Text content from snapshot + fallback from matched styles |
| Icon fonts | Handled as regular text in FRAME | Detected via `isIconFont()`, fallback via runtime extraction |
| Decorative | Background/border pseudo-elements become FRAME nodes | **Not extracted** (only text content) |

**h2d creates 111 nodes from pseudo-elements on Tesla.** These include decorative elements, icon glyphs, borders, and content injected via CSS. W2W only extracts text content from pseudo-elements (primarily for icon fonts).

**Impact:** High -- decorative pseudo-elements (borders, backgrounds, separators created with ::before/::after) are invisible in W2W output.
**Difficulty to fix:** Medium -- need to create FRAME nodes for pseudo-elements with background/border styles, not just text content.

### 13.2 ::marker

| Aspect | h2d | W2W |
|--------|-----|-----|
| Detection | Part of pseudo-element handling | DOMSnapshot captures `::marker` as pseudo-type |
| Output | Included in list item TEXT | Separate bullet character via `getBulletCharacter()` |

W2W actually handles `::marker` better than h2d for structured list output.

---

## 14. Transform Handling

| Aspect | h2d | W2W |
|--------|-----|-----|
| Matrix transform | `transform: "matrix(1, 0, 0, 1, -864, -540)"` | `extractRotationFromTransform()` -- rotation only |
| Original CSS | `transform2: "translate(-50%, -50%)"` | **Not preserved** |
| Transform origin | `transformOrigin2: "864px 540px"` | **Not captured** |
| Quad coordinates | `quad: [x1,y1, x2,y2, x3,y3, x4,y4]` (4 corners) | **Not available** (single x,y,w,h) |
| Rotation | Extracted from matrix | Extracted from `rotate()` or matrix `atan2(b,a)` |
| Scale | Preserved in matrix | **Not extracted** |
| Skew | Preserved in quad coordinates | **Not extracted** |
| Translate | Preserved in matrix/original CSS | **Not extracted** (position used instead) |

**h2d stores BOTH the resolved matrix AND the original CSS transform.** This means the Figma plugin can choose between:
- Using the matrix for accurate positioning
- Using the original CSS for semantic understanding (e.g., `translate(-50%, -50%)` means "center this element")

**W2W** only extracts rotation angle from the matrix. Scale, skew, and translate components are lost.

**Impact:** Medium-High -- centered elements (`translate(-50%, -50%)`) lose their centering intent. Scaled elements get wrong dimensions.
**Difficulty to fix:** Medium -- extract scale/translate from matrix, add `transform2` equivalent.

---

## 15. Specific CSS Features

### 15.1 backdrop-filter

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | `backdropFilter: "blur(20px)"` on 6 nodes | `backdrop-filter` in snapshot + matched styles |
| Figma rendering | Blur effect on frame | `parseBackdropFilterToEffects()` --> BACKGROUND_BLUR |
| Status | **Both support this** | **Both support this** |

W2W now supports backdrop-filter (added recently via `style-parsers.ts`).

### 15.2 clip-path

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | `clipPath: "inset(100%)"` stored | **Not captured in DOMSnapshot** |
| Usage | Visibility filtering + visual masking | Not used |
| `inset()` | Visibility check | Not checked |
| `circle()`, `polygon()`, `path()` | Stored but not converted to Figma | Not captured |

**Impact:** Medium -- `clip-path` is used for visibility hiding (accessibility) and visual masking (circular images, diagonal sections).
**Difficulty to fix:** Easy to add to snapshot; Hard to convert complex clip-paths to Figma.

### 15.3 CSS Grid (detailed)

| Property | h2d | W2W |
|----------|-----|-----|
| `grid-template-columns` | 19 nodes: `"auto"`, `"repeat(4, 1fr)"`, `"211px 211px 211px"` | Requested but unused |
| `grid-template-rows` | 17 nodes: `"56px 1fr 52px"` | Requested but unused |
| `grid-template-areas` | 3 nodes: `'"header" "content" "footer"'` | **Not captured** |
| `grid-auto-flow` | 3 nodes: `"column"` | Requested but unused |
| `grid-area` | 34 nodes: `"tds-shell-content"` | **Not captured** |

**Impact:** High -- 102 grid elements on Tesla.com get no layout.

### 15.4 aspect-ratio

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | `aspectRatio: "auto 512 / 512"` on 17 nodes | **Not captured** |
| Impact | Image containers maintain proportion | Images may get wrong proportions |

**Difficulty to fix:** Easy -- add to SNAPSHOT_COMPUTED_STYLES, apply during sizing.

### 15.5 object-fit

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | `objectFit: "cover"/"contain"` on 9 nodes | **Not captured** |
| Figma equivalent | `scaleMode: "FILL"/"FIT"` on image fills | Default FILL used |

**Difficulty to fix:** Easy -- add to snapshot, apply in placeholder/image creation.

### 15.6 text-overflow

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | Not explicitly captured, but ellipsis detected via text quads | **Not captured** |
| Impact | Text truncation preserved | Full text shown (may overflow container) |

### 15.7 filter (CSS)

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | `filter: "none"` stored | `filter` in snapshot |
| Figma rendering | Blur, drop-shadow effects | `parseFilterToEffects()` -- LAYER_BLUR, DROP_SHADOW |
| Status | **Both support this** | **Both support this** |

### 15.8 mix-blend-mode

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | Not explicitly in property list | `mix-blend-mode` in snapshot |
| Figma rendering | N/A | `frame.blendMode` mapped from CSS values |
| Status | **W2W has better support** | Mapped to Figma BlendMode enum |

### 15.9 text-shadow

| Aspect | h2d | W2W |
|--------|-----|-----|
| Capture | `textShadow: "none"` stored | **Not captured** |
| Figma rendering | Could be converted to text effects | Not available |

**Difficulty to fix:** Easy -- add to snapshot; Medium for Figma text effect conversion.

---

## 16. Output Format

### 16.1 h2d Output (.h2d file)

```
JSON --> deflate --> XOR with key 57 --> .h2d file
```

Structure:
```json
{
  "nodes": [
    {
      "type": "FRAME",
      "tag": "div",
      "x": 0, "y": 0, "width": 1440, "height": 3200,
      "quad": [0,0, 1440,0, 1440,3200, 0,3200],
      "styles": {
        "display": "flex",
        "flexDirection": "column",
        "backgroundColor": "rgb(255, 255, 255)",
        "gap": "0px"
      },
      "classList": ["tds-shell"],
      "children": [...]
    }
  ],
  "assets": {
    "https://example.com/image.jpg": "data:image/jpeg;base64,..."
  },
  "fonts": {
    "Universal Sans Text Medium": { "@font-face": {...}, "platformFont": {...} }
  }
}
```

### 16.2 W2W Output (ExtractedElement tree)

```json
{
  "type": "frame",
  "tag": "div",
  "name": "Shell",
  "x": 0, "y": 0, "width": 1440, "height": 3200,
  "layoutMode": "VERTICAL",
  "itemSpacing": 0,
  "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
  "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1, "a": 1 } }],
  "strokes": [],
  "effects": [],
  "backgroundColor": "#ffffff",
  "fontFamily": "Universal Sans Text",
  "fontSize": 14,
  "textContent": "",
  "children": [...]
}
```

### 16.3 Key Format Differences

| Aspect | h2d | W2W |
|--------|-----|-----|
| Style format | Raw CSS strings | Pre-computed Figma values |
| Color format | `"rgb(255, 255, 255)"` | `{ r: 1, g: 1, b: 1, a: 1 }` (Figma-ready) |
| Background | `styles.backgroundColor` string | `fills: FigmaFill[]` array (supports multiple layers) |
| Border | `styles.borderWidth/Color/Style` | `strokes: FigmaStroke[]` array |
| Shadow | `styles.boxShadow` string | `effects: FigmaEffect[]` array |
| Assets | `$url` reference to `assets{}` dict | `imageUrl` string + separate assets map |
| Coordinates | `quad[]` (4 corners) + `x,y,w,h` | `x, y, width, height` only |
| Compression | deflate + XOR obfuscation | MessagePack binary encoding (main.ts -> sandbox) |

**Impact:** W2W's Figma-ready format means less processing in the plugin but less flexibility. h2d's raw CSS format means the plugin can make context-aware decisions.

---

## 17. Performance

### 17.1 Capture Duration

| Metric | h2d (Tesla.com) | W2W Estimate |
|--------|-----------------|--------------|
| Total capture time | 27.7 seconds | 5-15 seconds |
| CDP calls | 681 | ~50-200 (snapshot + matched styles) |
| DOM elements processed | 2,220 | All elements in snapshot (similar count) |
| Style reads | 2,220 x getComputedStyle | 1 DOMSnapshot call |
| Asset extraction | 42 calls, 64ms | Similar for extension path |
| Hover states | 56 forcePseudoState calls, 58ms | Extracted from matched styles (0 extra calls) |

### 17.2 Efficiency Comparison

| Aspect | h2d | W2W |
|--------|-----|-----|
| Style extraction | O(N) getComputedStyle calls (each synchronous) | O(1) DOMSnapshot call |
| Per-element processing | TreeWalker + recursive function | Flat array iteration |
| CDP calls | 681 total | ~50-200 total |
| Network | 0 HTTP (all from cache) | 0 HTTP (extension) or N HTTP (Puppeteer) |
| Output size | 3.5MB JSON, 2.0MB compressed | Typically smaller (pre-computed, no raw CSS) |

**W2W is significantly faster** due to the DOMSnapshot bulk approach. h2d makes 681 individual CDP calls vs W2W's ~50-200. However, h2d extracts more data per element (89 CSS properties vs ~67).

### 17.3 Figma Plugin Rendering

| Aspect | h2d | W2W |
|--------|-----|-----|
| Plugin JS size | 2MB (full CSS engine) | ~200KB (render only) |
| Per-node processing | Full CSS interpretation | Apply pre-computed values |
| Render time | Higher (interpreting CSS) | Lower (direct application) |

---

## Summary: Priority Fix List

### Tier 1 -- Critical Quality Gaps

| # | Gap | h2d Advantage | Fix Difficulty | Impact |
|---|-----|---------------|----------------|--------|
| 1 | SVG extraction | Full inline SVG markup | Medium | Icons/logos are placeholder boxes |
| 2 | CSS Grid layout | 102 elements properly laid out | Hard | 6% of visible elements have no layout |
| 3 | fit-content sizing | Padding manipulation detection | Medium | Buttons/badges sized incorrectly |
| 4 | Pre-capture injection | Animation pause, scrollbar hide | Easy | Mid-animation captures, scrollbar noise |
| 5 | Visibility filtering | clip/clipPath/visibility checks | Easy | Invisible sr-only elements pollute output |

### Tier 2 -- Important Quality Gaps

| # | Gap | h2d Advantage | Fix Difficulty | Impact |
|---|-----|---------------|----------------|--------|
| 6 | Pseudo-element frames | 111 decorative pseudo-element nodes | Medium | Missing borders, separators, decorations |
| 7 | Hover variants | Component variant generation | Hard | Static output vs interactive components |
| 8 | Shadow DOM traversal | Full content extraction | Medium | Shadow DOM content invisible |
| 9 | Transform preservation | Matrix + original CSS + quad | Medium | Centered/scaled elements off |
| 10 | Puppeteer assets | Browser cache extraction | Medium | URL imports have 0 images |

### Tier 3 -- Nice to Have

| # | Gap | Fix Difficulty | Impact |
|---|-----|----------------|--------|
| 11 | aspect-ratio | Easy | Image proportions |
| 12 | object-fit | Easy | Image cropping |
| 13 | text-shadow | Easy/Medium | Text effects |
| 14 | webkitTextFillColor | Easy | Gradient text |
| 15 | Missing CSS properties (30+) | Easy | Edge cases |
| 16 | Font binary extraction | Easy | Font availability |

### W2W Advantages (do NOT lose these)

| Feature | W2W Advantage | Why it Matters |
|---------|---------------|----------------|
| Styled text segments | Per-segment color/weight/size | Bold+italic within paragraphs |
| CSS variable extraction | `var(--primary-color)` preserved | Design token awareness |
| Matched CSS rules | Original CSS rules available | Better gradient/variable handling |
| Server-side capture | Puppeteer (no extension needed) | Accessibility, automation |
| mix-blend-mode | Full mapping to Figma | Layer compositing |
| Text decoration details | color, style, thickness per segment | Richer text styling |
| Faster capture | DOMSnapshot bulk approach | 5-15s vs 28s |
