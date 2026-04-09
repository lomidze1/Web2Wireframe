# h2d vs Web2Wireframe — Architecture Comparison

## Fundamental Architecture Difference

```
h2d:  Content Script (getComputedStyle) → raw CSS JSON → Figma Plugin (CSS→Figma conversion)
W2W:  CDP (DOMSnapshot + CSS.getMatchedStyles) → tree-builder (CSS→Figma conversion) → Figma Plugin (render only)
```

**h2d splits the work: extraction is dumb, plugin is smart.**
**W2W does the opposite: extraction is smart, plugin is dumb.**

This means h2d's Figma plugin contains the complex CSS→Figma interpretation logic,
while our Plugin_Frontend mostly just renders pre-computed values.

## Detailed Comparison

### 1. Style Extraction

| Aspect | h2d | Web2Wireframe |
|--------|-----|---------------|
| Method | `getComputedStyle()` in content script | `DOMSnapshot.captureSnapshot` + `CSS.getMatchedStylesForNode` |
| Format | Raw CSS values (strings) | Pre-parsed Figma values |
| Properties | 80 CSS properties | ~40 mapped properties |
| Storage | `styles: { width: "auto", display: "flex" }` | `layoutMode: "HORIZONTAL", width: 1440` |
| Grid support | Full (gridTemplate*) | None |
| Transform | Both matrix + original CSS | Rotation angle only |
| Backdrop filter | Yes (blur, etc.) | No |
| Clip path | Yes | No |

### 2. Node Types

| h2d | W2W | Notes |
|-----|-----|-------|
| FRAME | frame | Equivalent |
| TEXT | text | h2d TEXT is minimal (value + font only) |
| SVG | (none) | h2d stores full SVG markup |
| (none) | placeholder | W2W uses placeholders for images |

### 3. Text Handling

**h2d approach:**
- TEXT node = `{ value: "Hello", font: "Arial Bold", platformFont: {...} }`
- Typography styles (fontSize, color, lineHeight) live on PARENT frame
- Text is always a leaf node with zero style properties

**W2W approach:**
- text node = full element with all typography properties inline
- `textContent`, `fontSize`, `fontWeight`, `lineHeight`, `fontFamily` all on same node
- Supports `styledSegments` for inline mixed styles

### 4. Image Handling

**h2d approach:**
- Content script identifies image URLs (`img.src`, `background-image`)
- Sends `getAssetWithCDP` message to background
- Background uses `Page.getResourceTree()` + `Page.getResourceContent()`
- Returns base64 data embedded in `.h2d` file
- Node has `$url` pointing to `assets{}` dict

**W2W approach (Browser Extension path):**
- `Page.getResourceTree()` + `Page.getResourceContent()` (same as h2d)
- Assets stored in extraction result, passed through Plugin_Backend
- Plugin_Frontend decodes and creates Figma images

**W2W approach (Puppeteer/URL path):**
- `extractAssetsForTree()` in Plugin_Backend
- Missing `convertImage` callback → assets often empty
- WebP/AVIF not supported in Node.js (no OffscreenCanvas)
- **This is a known bug — assets: [] for URL imports**

### 5. SVG Handling

**h2d:** Stores full SVG markup in node, Figma plugin uses `figma.createNodeFromSvg()`
**W2W:** SVGs become placeholder frames (no SVG extraction)

### 6. Layout Detection

**h2d:** Stores raw CSS — `display: flex`, `flexDirection: column`, `gap: 24px`
- Figma plugin interprets: flex → auto layout, gap → itemSpacing

**W2W:** Pre-computes in tree-builder — `layoutMode: "VERTICAL"`, `itemSpacing: 24`
- Less information available at render time
- Layout detection can be wrong and plugin can't recover

### 7. Positioning

**h2d:**
- `x`, `y`, `width`, `height` — absolute page coordinates
- `quad` — 4-corner coordinates (handles rotation/skew)
- Raw `position`, `left`, `top`, `right`, `bottom` in styles
- Figma plugin decides how to position

**W2W:**
- `x`, `y`, `width`, `height` — absolute coordinates
- No quad (can't handle rotation accurately)
- Pre-computed `position` enum

### 8. Font Handling

**h2d:**
- Full `@font-face` entries with `src` URLs
- `platformFont` from `CSS.getPlatformFontsForNode`
- Font binary data extracted via `Page.getResourceContent`

**W2W:**
- `fontFamily` CSS value
- `platformFontFamily` from CDP
- No font binary extraction

### 9. Hover States

**h2d:** Full node sub-tree with hover styles applied (via `CSS.forcePseudoState`)
**W2W:** `pseudoStateStyles` object with changed CSS properties

### 10. Pseudo Elements (::before, ::after)

**h2d:** `fetchBeforeAfter` message → CDP box model for pseudo elements
**W2W:** Basic pseudo-element detection, limited support

## Key Quality Differences (Root Causes)

### Why h2d produces better results:

1. **Figma plugin has raw CSS** — can make intelligent decisions at render time
2. **Grid layout support** — many modern sites use CSS Grid
3. **SVG preservation** — icons/logos render perfectly
4. **Embedded assets** — no broken images, no fetch failures
5. **4-corner coordinates** — handles transforms correctly
6. **Minimal text nodes** — less chance of style conflicts
7. **Hover states as sub-trees** — perfect interactive components

### Where W2W has advantages:

1. **Matched CSS rules** — access to original CSS (not just computed)
2. **CSS variables** — can extract `var(--primary-color)`
3. **Server-side capture** — Puppeteer path doesn't need extension
4. **Styled text segments** — inline mixed styles (bold + italic in same paragraph)

### Where both struggle:

1. Lazy-loaded images (below fold)
2. Complex animations
3. Canvas/WebGL content
4. Iframes from different origins
5. Dynamic content (SPAs with client-side routing)
