# W2W Current CSS Extraction & Figma Rendering Capabilities

Comprehensive audit of what Web2Wireframe extracts from the DOM and renders in Figma.

**Files analyzed:**
- `shared-extraction/src/tree-builder.ts` (buildElementTree — main extraction)
- `shared-extraction/src/style-parsers.ts` (CSS-to-Figma parsers)
- `shared-extraction/src/css.ts` (CDP matched styles extraction)
- `shared-extraction/src/utils.ts` (layout, sizing, color parsing)
- `shared-extraction/src/constants.ts` (tag lists)
- `shared-extraction/src/types.ts` (ExtractedElement, FigmaFill/Stroke/Effect)
- `Plugin_Frontend/src/rendering/nodes.ts` (Figma node creation)
- `packages/shared-types/src/index.ts` (shared type definitions)

---

## 1. CSS Properties Extracted (tree-builder.ts)

### Background & Fills
| CSS Property | Source | Line(s) |
|---|---|---|
| `background` | matchedRules or bodyOriginalCSS | tree-builder.ts:1366-1377 |
| `background-image` | matchedRules or computedStyles | tree-builder.ts:1369-1383 |
| `background-color` | computedStyles | tree-builder.ts:1386-1392 |

### Borders & Strokes
| CSS Property | Source | Line(s) |
|---|---|---|
| `border-width` | computedStyles | tree-builder.ts:1454 |
| `border-color` | computedStyles | tree-builder.ts:1455 |
| `border-style` | computedStyles | tree-builder.ts:1456 |
| `border-top` | computedStyles | tree-builder.ts:1457 |
| `border-right` | computedStyles | tree-builder.ts:1458 |
| `border-bottom` | computedStyles | tree-builder.ts:1459 |
| `border-left` | computedStyles | tree-builder.ts:1460 |
| `border-radius` | computedStyles | tree-builder.ts:1472-1473 |

### Effects
| CSS Property | Source | Line(s) |
|---|---|---|
| `box-shadow` | matchedRules (priority) or computedStyles | tree-builder.ts:1478-1489 |
| `backdrop-filter` | matchedRules (priority) or computedStyles | tree-builder.ts:1493-1502 |
| `filter` | computedStyles | tree-builder.ts:1507-1508 |

### Typography
| CSS Property | Source | Line(s) |
|---|---|---|
| `font-family` | platformFontMap (priority) > matchedRules > computedStyles | tree-builder.ts:1512-1542 |
| `font-size` | computedStyles | tree-builder.ts:1543 |
| `font-weight` | derivedFromPlatformFont > computedStyles | tree-builder.ts:1544 |
| `line-height` | computedStyles (with "normal" resolution logic) | tree-builder.ts:1545, 1180-1219 |
| `letter-spacing` | computedStyles | tree-builder.ts:1546-1547 |
| `text-align` | computedStyles | tree-builder.ts:1548 |
| `color` | computedStyles | tree-builder.ts:1450 |
| `text-decoration` / `text-decoration-line` | computedStyles (on inline children) | tree-builder.ts:808-817 |
| `text-decoration-color` | computedStyles (on inline children) | tree-builder.ts:820 |
| `text-decoration-style` | computedStyles (on inline children) | tree-builder.ts:821-824 |
| `text-decoration-thickness` | computedStyles (on inline children) | tree-builder.ts:825-826 |

### Layout (Flexbox/Grid)
| CSS Property | Source | Line(s) |
|---|---|---|
| `display` | computedStyles (via getLayoutMode) | utils.ts:384-445 |
| `flex-direction` | computedStyles (via getLayoutMode) | utils.ts:388-391 |
| `grid-auto-flow` | computedStyles (via getLayoutMode) | utils.ts:396-398 |
| `grid-template-columns` | computedStyles (via getLayoutMode) | utils.ts:400-427 |
| `padding-top/right/bottom/left` | computedStyles | tree-builder.ts:1551-1556 |
| `gap` / `row-gap` | computedStyles | tree-builder.ts:1558-1559 |
| `justify-content` | computedStyles | tree-builder.ts:1561 |
| `align-items` | computedStyles | tree-builder.ts:1562 |
| `flex-wrap` | computedStyles | tree-builder.ts:1563 |
| `flex-grow` | computedStyles | tree-builder.ts:1565 |
| `align-self` | computedStyles | tree-builder.ts:1568 |

### Sizing
| CSS Property | Source | Line(s) |
|---|---|---|
| `width` | computedStyles (sub-pixel precision) | tree-builder.ts:145-173 |
| `height` | computedStyles (sub-pixel precision) | tree-builder.ts:145-173 |
| `box-sizing` | computedStyles (affects dimension calc) | tree-builder.ts:153-173 |

### Positioning & Visual
| CSS Property | Source | Line(s) |
|---|---|---|
| `position` | computedStyles | tree-builder.ts:1606-1608 |
| `z-index` | computedStyles | tree-builder.ts:1609-1611 |
| `opacity` | computedStyles | tree-builder.ts:1596 |
| `mix-blend-mode` | computedStyles | tree-builder.ts:1599-1600 |
| `transform` (rotate/matrix) | computedStyles | tree-builder.ts:1602-1603, 181-205 |
| `overflow` / `overflow-x` / `overflow-y` | computedStyles | tree-builder.ts:1889, 270-293 |
| `margin-top/right/bottom/left` | computedStyles + matchedRules | tree-builder.ts:1616-1659 |
| `list-style-type` | computedStyles (for `<li>` only) | tree-builder.ts:1764-1766 |

### CSS Variables
| Feature | Source | Line(s) |
|---|---|---|
| `var()` in background | matchedRules | tree-builder.ts:1394-1420 |
| `var()` in background-color | matchedRules | tree-builder.ts:1405-1406 |
| `var()` in color | matchedRules | tree-builder.ts:1409-1410 |
| `var()` in border-color | matchedRules | tree-builder.ts:1413-1414 |
| CSS variable resolution | css.ts:604-657, style-parsers.ts:1064-1105 | |

---

## 2. CSS Properties Converted to Figma (nodes.ts)

### Frame Properties
| Figma Property | CSS Source | nodes.ts Line(s) |
|---|---|---|
| `frame.layoutMode` | `display` + `flex-direction` / grid | 270-273 |
| `frame.layoutSizingHorizontal` | flex-grow, align-self, parent context | 276-280 |
| `frame.layoutSizingVertical` | flex-grow, align-self, parent context | 281-284 |
| `frame.primaryAxisAlignItems` | `justify-content` | 288-291 |
| `frame.counterAxisAlignItems` | `align-items` | 289-292 |
| `frame.layoutWrap` | `flex-wrap: wrap` | 298-300 |
| `frame.itemSpacing` | `gap` or calculated from child positions | 302-304 |
| `frame.paddingTop/Right/Bottom/Left` | `padding-*` | 306-311 |
| `frame.fills` | fills[] array (solid + gradients) | 327-411 |
| `frame.strokes` | strokes[] array (border sides) | 413-425 |
| `frame.strokeWeight` | `border-width` | 418 |
| `frame.effects` | effects[] array (shadows + blurs) | 428-433 |
| `frame.topLeftRadius` etc. | `border-radius` (per-corner) | 436-447 |
| `frame.cornerRadius` | `border-radius` (uniform) | 445 |
| `frame.opacity` | `opacity` | 450-452 |
| `frame.blendMode` | `mix-blend-mode` | 455-477 |
| `frame.rotation` | `transform: rotate()` / `matrix()` | 482-485 |
| `frame.clipsContent` | `overflow: hidden/scroll/auto` | 488-491 |

### Fill Types Supported
| Figma Fill Type | CSS Source | style-parsers.ts Line(s) |
|---|---|---|
| `SOLID` | `background-color`, solid color in gradient | 358-370 |
| `GRADIENT_LINEAR` | `linear-gradient()` | 319-325, 379-422 |
| `GRADIENT_RADIAL` | `radial-gradient()` | 329-337, 436-524 |
| `GRADIENT_CONIC` | `conic-gradient()` | 340-342, 545-588 |
| `IMAGE_PLACEHOLDER` | `background-image: url()` | 345-355 |
| `IMAGE` (real) | base64 from assetsMap (realAssets mode) | nodes.ts:374-411 |

### Stroke Types Supported
| Feature | CSS Source | style-parsers.ts Line(s) |
|---|---|---|
| Per-side borders | `border-top/right/bottom/left` | 963-988 |
| Uniform border | `border-width` + `border-color` | 990-1008 |
| Border styles | `solid` / `dashed` / `dotted` | 1044-1053 |
| Position | Always `INSIDE` | 1003, 1036 |

### Effect Types Supported
| Figma Effect | CSS Source | style-parsers.ts Line(s) |
|---|---|---|
| `DROP_SHADOW` | `box-shadow` (outer) | 844-851 |
| `INNER_SHADOW` | `box-shadow` with `inset` | 844-851 |
| `BACKGROUND_BLUR` | `backdrop-filter: blur()` | 862-882 |
| `LAYER_BLUR` | `filter: blur()` | 893-915 |
| `DROP_SHADOW` (from filter) | `filter: drop-shadow()` | 917-935 |

### Blend Modes Mapped (nodes.ts:456-477)
| CSS `mix-blend-mode` | Figma `BlendMode` |
|---|---|
| `multiply` | `MULTIPLY` |
| `screen` | `SCREEN` |
| `overlay` | `OVERLAY` |
| `darken` | `DARKEN` |
| `lighten` | `LIGHTEN` |
| `color-dodge` | `COLOR_DODGE` |
| `color-burn` | `COLOR_BURN` |
| `hard-light` | `HARD_LIGHT` |
| `soft-light` | `SOFT_LIGHT` |
| `difference` | `DIFFERENCE` |
| `exclusion` | `EXCLUSION` |
| `hue` | `HUE` |
| `saturation` | `SATURATION` |
| `color` | `COLOR` |
| `luminosity` | `LUMINOSITY` |

---

## 3. Layout Detection Logic (utils.ts:380-446)

```
getLayoutMode(computedStyles, tag)
  |
  +-- display: flex/inline-flex
  |     +-- flex-direction: column/column-reverse -> VERTICAL
  |     +-- else -> HORIZONTAL
  |
  +-- display: grid/inline-grid
  |     +-- grid-auto-flow includes "column" -> HORIZONTAL
  |     +-- grid-template-columns has auto-fit/auto-fill -> HORIZONTAL
  |     +-- grid-template-columns has >1 column -> HORIZONTAL
  |     +-- else -> VERTICAL
  |
  +-- display: inline/inline-block -> HORIZONTAL
  |
  +-- tag: ul/ol -> VERTICAL
  |
  +-- display: list-item -> HORIZONTAL
  |
  +-- else -> NONE
```

**Important:** NONE layout means no auto-layout in Figma (absolute positioning used instead).

---

## 4. Sizing Logic (utils.ts:457-508)

```
getLayoutSizing(computedStyles, flexGrow, alignSelf, parentContext)
  |
  +-- No parentContext or parent is NONE -> { horizontal: undefined, vertical: undefined }
  |
  +-- Parent is VERTICAL:
  |     Main axis (vertical):  flexGrow > 0 -> FILL, else -> FIXED
  |     Cross axis (horizontal): alignSelf = stretch -> FILL, else -> FIXED
  |
  +-- Parent is HORIZONTAL:
        Main axis (horizontal): flexGrow > 0 -> FILL, else -> FIXED
        Cross axis (vertical):  alignSelf = stretch -> FILL, else -> FIXED
```

**Additional logic in tree-builder.ts:1574-1594:**
- Grid children get effectiveFlexGrow = 1 (always FILL on main axis)
- FILL is overridden to FIXED if child is significantly smaller than parent content area (>2px difference) -- prevents false stretch detection
- `align-self: auto` inherits parent's `align-items`
- CSS default `align-items: normal` resolves to `stretch` for flex containers

**HUG content is applied in nodes.ts:276-285** only for `layoutSizingHorizontal/Vertical === "HUG"`, otherwise FIXED is used. Note: the extraction does not currently set HUG -- only FIXED and FILL are produced by `getLayoutSizing`.

---

## 5. Skipped Tags (constants.ts:7-18)

```
SKIP_TAGS = [
  "script", "style", "meta", "noscript", "link",
  "head", "title", "br", "base", "template"
]
```

Additionally skipped:
- Nodes with `nodeType !== 1` (non-elements) -- tree-builder.ts:1310
- Nodes with `bounds.width < 1 || bounds.height < 1` (except media tags) -- tree-builder.ts:1318
- Nodes with `display: contents` are flattened (children promoted to parent) -- tree-builder.ts:246-263
- Children outside viewport (`bounds.x >= viewportWidth`) -- tree-builder.ts:2013-2015
- Children with `width <= 3 || height <= 3` are dropped -- tree-builder.ts:2027
- Max tree depth: 15 (constants.ts:60)

---

## 6. Text Tags (constants.ts:22-43)

```
TEXT_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "label", "td", "th", "button",
  "strong", "em", "b", "i", "small", "mark", "sub", "sup"
]
```

**NOTE:** `<li>` is NOT a text tag -- list items become frames with bullet + text children.

**INLINE_TAGS** (collected as styled segments, not separate elements) -- tree-builder.ts:447-450:
```
"a", "span", "strong", "em", "b", "i", "u", "s", "small", "mark",
"sub", "sup", "code", "kbd", "var", "abbr", "cite", "q", "del", "ins"
```

**Text wrapping logic** (tree-builder.ts:1771-1778):
- If a TEXT_TAG has padding, fills, strokes, effects, or border-radius: becomes a frame with a synthetic text child (e.g., styled buttons)
- Otherwise: becomes a pure text node

---

## 7. Image Handling

### Extraction (tree-builder.ts:1781-1805)
- `<img>`: uses `currentSrc` > `src` > `data-src` (lazy-load support)
- `<video>`: uses `poster` attribute
- Background images: extracts all `url()` from `background-image`
  - First URL -> `imageUrl`
  - Additional URLs -> `additionalImageUrls[]`
- Relative URLs resolved against `documentURL`

### Media Tags (constants.ts:46-53)
```
MEDIA_TAGS = ["img", "video", "iframe", "picture", "canvas", "svg"]
```

### Rendering (nodes.ts:234-258)
- **realAssets mode**: looks up `imageUrl` in `assetsMap` (URL -> base64), creates real Figma image via `createRealImage()`
- **Default mode**: creates wireframe placeholder via `createPlaceholder()` with colored rectangle + icon
- **Background images on containers** (nodes.ts:374-411): creates IMAGE fills from base64, respects CSS stacking order (first = top, reversed for Figma)
- **Fallback dimensions** for media with 0 bounds (tree-builder.ts:80-130): HTML attributes > aspect ratio > 50% parent > 150px minimum

---

## 8. SVG Handling

**Current state: minimal.**
- SVG is in `MEDIA_TAGS` -- always becomes a placeholder (tree-builder.ts:1816-1819)
- SVG data URIs are skipped as IMAGE fills: `if (isSvgDataUri(base64Data)) continue` (nodes.ts:392)
- No SVG-to-Figma vector conversion exists
- SVGs are rendered as colored placeholder rectangles in wireframe mode

---

## 9. Font Handling

### Extraction
| Source | Priority | Details |
|---|---|---|
| `CSS.getPlatformFontsForNode` | 1 (highest) | Actual rendered font from browser (tree-builder.ts:1518-1531) |
| Matched CSS rules | 2 | Original `font-family` from CSS (tree-builder.ts:1532-1534) |
| Computed styles | 3 (fallback) | Resolved `font-family` (tree-builder.ts:1535-1537) |

### Platform Font Processing
- Selects font with highest `glyphCount` (tree-builder.ts:1521)
- Skips obfuscated font names via `isObfuscatedFont()` (tree-builder.ts:1524)
- Derives weight from variable font PostScript names via `deriveWeightFromPlatformFont()` (tree-builder.ts:1530)
- Full font fallback chain stored in `fontFamilyList[]` (tree-builder.ts:1538-1541)

### Icon Fonts (tree-builder.ts:460-476)
Detected patterns (case-insensitive):
```
"font awesome", "fontawesome", "fa-solid", "fa-regular", "fa-brands",
"fa-light", "fa-thin", "material icons", "material symbols",
"bootstrap-icons", "remixicon", "icomoon", "ionicons",
"boxicons", "phosphor", "tabler-icons", "lucide",
"typicons", "linearicons", "simple-line-icons", "feather"
```

Icon font extraction has 3 fallback layers:
1. DOMSnapshot pseudo-element children with text content (tree-builder.ts:533-577)
2. Runtime `getComputedStyle(el, '::before')` extraction (tree-builder.ts:581-596)
3. CSS matched styles `content` property (tree-builder.ts:602-627)

### Rendering in Figma (nodes.ts)
- Text nodes use `context.fontFamily` (configurable plugin setting)
- Font fallback flow via `main.ts` sandbox (attempts font load, prompts user on failure)
- Icon fonts that fail text rendering: colored placeholder rectangle (nodes.ts:209-226)

---

## 10. Effects

### Box Shadow (style-parsers.ts:737-852)
- Multiple shadows (comma-separated)
- Inset shadows -> `INNER_SHADOW`
- Outer shadows -> `DROP_SHADOW`
- Extracts: offset-x, offset-y, blur-radius, spread-radius, color
- CSS variable colors resolved
- Color at start or end of shadow string supported
- Default shadow color: `rgba(0,0,0,0.25)` when not specified

### Backdrop Filter (style-parsers.ts:862-882)
- `blur()` -> `BACKGROUND_BLUR` with blurRadius
- Other backdrop-filter functions (saturate, brightness, etc.) ignored

### CSS Filter (style-parsers.ts:893-938)
- `blur()` -> `LAYER_BLUR`
- `drop-shadow()` -> `DROP_SHADOW` (multiple supported)
- Other filter functions (brightness, contrast, grayscale, etc.) skipped

### Opacity (nodes.ts:450-452)
- Applied when `colorMode !== "plugin"` and `0 < opacity < 1`

### Blend Modes (nodes.ts:455-477)
- 14 CSS blend modes mapped to Figma equivalents
- Skipped in "plugin" color mode

### Border Radius (nodes.ts:436-447)
- Per-corner radii: `topLeftRadius`, `topRightRadius`, `bottomRightRadius`, `bottomLeftRadius`
- Clamped to `min(width, height) / 2`
- Elliptical radii (slash syntax): only horizontal values used (utils.ts:128-130)

### Rotation (nodes.ts:482-485)
- `transform: rotate(Xdeg)` supported
- `transform: matrix(a,b,c,d,tx,ty)` -> rotation via `atan2(b,a)`
- Figma rotation is counter-clockwise (negated from CSS clockwise)

### Overflow (nodes.ts:488-491)
- `overflow: hidden|scroll|auto` -> `frame.clipsContent = true`
- `overflow: visible` -> `frame.clipsContent = false`
- Considers both `overflow-x` and `overflow-y` (most restrictive wins)

---

## 11. Known Limitations

### Layout
1. **No HUG sizing produced** -- `getLayoutSizing()` only returns FIXED or FILL, never HUG. The HUG check in nodes.ts (lines 276-285) is dead code since extraction never sets it. CSS `width: fit-content` / `height: auto` are not mapped to HUG.
2. **CSS Grid treated as simplified flex** -- grid-template-columns counted for column detection but no actual grid cell positioning. Multi-row grids with different column counts lose structure.
3. **No `column-gap` / `row-gap` separation** -- only `gap` / `row-gap` extracted, no `column-gap` for wrap layouts.
4. **No `order` property** -- CSS flex/grid `order` not extracted; DOM order is used.
5. **No `flex-basis`** -- not used in sizing calculation (only `flex-grow` and `align-self`).
6. **Z-index not used for ordering** (tree-builder.ts:2038-2041) -- DOM order preserved intentionally.
7. **Space-around/space-evenly** approximated with padding (nodes.ts:314-323), not exact Figma equivalent.
8. **Margin collapsing** simplified -- only adjacent vertical sibling margins collapsed (tree-builder.ts:2046-2059), no parent-child or nested collapsing.

### Visual
9. **No text-shadow** -- only `box-shadow` extracted, no CSS `text-shadow` support.
10. **No outline** -- CSS `outline` property not extracted.
11. **No background-size / background-position / background-repeat** -- these are not mapped to Figma fill properties for gradient/image fills.
12. **No clip-path** -- CSS `clip-path` not extracted.
13. **No mask / mask-image** -- CSS masking not supported.
14. **CSS filter functions** (brightness, contrast, grayscale, sepia, hue-rotate, saturate, invert) have no Figma equivalent and are silently skipped.
15. **No multi-value border-radius** for elliptical corners -- slash syntax (`10px / 20px`) uses only horizontal radii (utils.ts:128-130).
16. **Named colors limited** -- only 10 common names supported in `parseColorToFigma()` (style-parsers.ts:84-96). CSS named colors like `tomato`, `cornflowerblue`, etc. will fail to parse.

### Typography
17. **No text-transform** -- CSS `text-transform: uppercase/lowercase/capitalize` not applied to extracted text content.
18. **No white-space** -- CSS `white-space: nowrap/pre/pre-wrap` not extracted or used.
19. **No word-break / overflow-wrap** -- no text wrapping behavior extracted.
20. **No font-variant** -- small-caps, numeric variants not extracted.
21. **No font-style** (italic) -- not extracted from tree-builder or used in nodes.ts text rendering.
22. **Text decoration on parent elements** only collected for inline children via `collectStyledText`, not on standalone text elements.

### SVG & Media
23. **SVG rendered as placeholder only** -- no vector conversion.
24. **No `<canvas>` rendering** -- always placeholder.
25. **No `<video>` frame capture** -- only poster attribute used.
26. **No srcset/picture element handling** -- `<picture>` is just a placeholder, source selection not extracted.

### CSS Features
27. **No @media query awareness** -- extraction captures the current viewport state only.
28. **No CSS animations/transitions** -- only static state captured.
29. **No :hover/:focus styles applied** -- pseudo-state styles are captured and stored as plugin data (nodes.ts:494-502) but NOT applied visually.
30. **No CSS counters** -- `counter()` / `counters()` in content not resolved.
31. **No `::placeholder` pseudo-element** -- form input placeholder text not extracted.

### Architecture
32. **Puppeteer path missing asset extraction** -- `extractAssetsForTree()` lacks `convertImage` callback (documented in MEMORY.md).
33. **WebP/AVIF conversion missing in Node.js** -- no `sharp` library, OffscreenCanvas unavailable (documented in MEMORY.md).
34. **2 pre-existing test failures** in `Plugin_Backend/__tests__/importHtmlApi.test.ts`.
35. **Debug logs in production** -- `[W2W]` / `[W2W-DEBUG]` console.log statements in main.ts and nodes.ts (nodes.ts:241).

---

## Quick Reference: Extraction Pipeline

```
DOMSnapshot.captureSnapshot
  |
  v
parseSnapshot() -> ParsedSnapshotNode[]
  |
  v
findNodesNeedingMatchedStyles() -> nodes with gradients/var()
  |
  v
CSS.getMatchedStylesForNode (batch, parallel)
  |
  v
extractCSSVariables() -> Map<varName, resolvedValue>
  |
  v
extractBackgroundFromCSS() -> body original gradient
  |
  v
buildElementTree() -> ExtractedElement tree
  |                    (uses: parseBackgroundToFills, parseBoxShadowToEffects,
  |                     parseBordersToStrokes, parseBackdropFilterToEffects,
  |                     parseFilterToEffects, getLayoutMode, getLayoutSizing)
  v
Plugin_Frontend/rendering/nodes.ts -> createNodeInFigma() -> Figma SceneNode tree
```
