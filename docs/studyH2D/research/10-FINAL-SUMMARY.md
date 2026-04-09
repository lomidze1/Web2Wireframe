# html.to.design — Complete Research Summary

## Research Overview

**Target:** html.to.design (h2d) Chrome Extension + Figma Plugin v0.0.191
**Site tested:** tesla.com (full page, 1440w, default theme)
**Date:** 2026-03-28
**Methods:** .h2d file decoding, content script deobfuscation, DOM mutation spy, CDP command logging, Figma plugin analysis

---

## 1. Architecture

```
┌─ Chrome Extension ────────────────────────────────────┐
│                                                       │
│  Content Script (isolated world)                      │
│  ├─ TreeWalker → mark ALL elements with h2d-* class  │
│  ├─ getComputedStyle() → 89 CSS properties            │
│  ├─ computedStyleMap() → width/height/flex/opacity    │
│  ├─ getBoundingClientRect() → quad coordinates        │
│  └─ Filter: 2220 DOM → 806 output nodes (63% cut)    │
│                                                       │
│  Service Worker (CDP bridge)                          │
│  ├─ Page.getResourceContent → 42 assets (1.7MB)      │
│  ├─ CSS.forcePseudoState → 56 hover states            │
│  ├─ CSS.getPlatformFontsForNode → 7 font detections   │
│  ├─ DOM.querySelector → 290 element lookups           │
│  └─ DOM.getDocument(depth:95) → full DOM tree         │
│                                                       │
│  Output: JSON → deflate → XOR 57 → .h2d file         │
└───────────────────────────────────────────────────────┘
                        │
                        ▼
┌─ Figma Plugin (~2MB JS) ─────────────────────────────┐
│  CSS → Figma Conversion Engine                        │
│  ├─ display:flex → layoutMode HORIZONTAL/VERTICAL     │
│  ├─ CSS Grid → Figma Grid layout                      │
│  ├─ Raw CSS sizes → HUG/FILL/FIXED sizing             │
│  ├─ base64 assets → figma.createImage()               │
│  ├─ SVG markup → figma.createNodeFromSvg()            │
│  └─ Hover data → Figma component variants             │
└───────────────────────────────────────────────────────┘
```

---

## 2. Key Numbers (Tesla.com capture)

| Metric | Value |
|--------|-------|
| Capture duration | 27.7 seconds |
| DOM elements marked | 2,220 |
| Elements in output | 806 (37%) |
| CDP calls total | 681 |
| Assets extracted | 42 (37 images + 5 CSS/fonts) |
| Asset data | 1.7MB (from browser cache, 0 HTTP requests) |
| Hover states captured | 56 elements |
| Fonts detected | 7 unique platform fonts |
| Shadow roots | 9 |
| .h2d file size | 2.0MB compressed |
| JSON size | 3.5MB uncompressed |

---

## 3. CDP Commands (681 total, by frequency)

| Command | Count | Time | Data | Purpose |
|---------|-------|------|------|---------|
| DOM.querySelector | 290 | 928ms | 4KB | Find elements by h2d-* class |
| DOM.describeNode | 233 | 46ms | 40KB | Get node tag, attributes |
| CSS.forcePseudoState | 56 | 58ms | 0.1KB | Force :hover state |
| Page.getResourceContent | 42 | 64ms | 1.7MB | **Extract images from cache** |
| DOM.resolveNode | 33 | 14ms | 5KB | nodeId → RemoteObject |
| CSS.getPlatformFontsForNode | 7 | 3ms | 1KB | Real font name |
| Page.getResourceTree | 6 | 60ms | 386KB | List all page resources |
| DOM.getDocument | 1 | 97ms | 2.2MB | Full DOM tree |

### What h2d does NOT use:
- `CSS.getMatchedStylesForNode` — 0 (uses getComputedStyle in content script instead)
- `Page.captureScreenshot` — 0 (no screenshots)
- `Runtime.evaluate` — 0 (no JS injection via CDP)
- `DOMSnapshot.captureSnapshot` — 0 (no snapshot approach)

---

## 4. Filtering Logic (2220 → 806)

### Completely removed (non-visual):
script, link, meta, style, head, title, noscript, br, dialog, table/tbody/tr/td, video, kbd

### Heavily merged into TEXT nodes:
| Tag | DOM | Output | Filtered % | Reason |
|-----|-----|--------|-----------|--------|
| span | 193 | 10 | 95% | Inline text → parent TEXT |
| li | 237 | 16 | 93% | List items → TEXT |
| a | 342 | 42 | 88% | Text links → TEXT |
| button | 88 | 28 | 68% | Hidden nav buttons |
| img | 91 | 40 | 56% | Off-screen/lazy |
| div | 680 | 376 | 45% | Empty/invisible |

### Visibility check (po function):
1. `display: none` → skip
2. No `offsetParent` + zero size → skip (unless body/html/fixed)
3. `overflow: hidden` + size < 1px → skip
4. `clip: rect(0,0,0,0)` or `clipPath: inset(50%)` → skip

---

## 5. Style Extraction (89 CSS properties)

h2d reads **89 CSS properties** via `getComputedStyle()` and filters against default values.

### Method:
```javascript
// For each property:
let defaultValue = rl[property]; // lookup default
let currentValue = getComputedStyle(element)[property];
if (currentValue !== defaultValue) {
    node.styles[property] = currentValue; // store only non-defaults
}
```

### Categories:
- **Layout (12):** display, flexDirection, flexWrap, flexGrow, flexShrink, flexBasis, alignItems, alignSelf, justifyContent, justifyItems, gap, order
- **Grid (5):** gridArea, gridAutoFlow, gridTemplateAreas, gridTemplateColumns, gridTemplateRows
- **Size (7):** width, height, minWidth, minHeight, maxWidth, maxHeight, aspectRatio
- **Position (6):** position, left, top, right, bottom, zIndex
- **Spacing (7):** margin, marginTop/Right/Bottom/Left, padding, boxSizing
- **Background (4):** backgroundColor, backgroundPosition, backgroundRepeat, backgroundSize
- **Border (11):** borderWidth, borderStyle (×5), borderColor, borderRadius (×4)
- **Typography (12):** fontFamily, fontSize, fontWeight, lineHeight, color, textAlign, textDecoration, whiteSpace, listStyleType, verticalAlign, webkitTextFillColor, webkitTextStrokeColor
- **Visual (12):** opacity, boxShadow, backdropFilter, clipPath, transform, transform2, transformOrigin2, overflow, overflowX, overflowY, pointerEvents, appearance
- **Other (4):** content, outlineColor, outlineOffset, objectFit
- **Via computedStyleMap (10):** width, height, left, top, right, bottom, flexGrow, flexShrink, order, opacity

### Special: fit-content detection
```javascript
// Temporarily remove parent padding to check if element width is intrinsic
parent.style.paddingRight = "";
let changed = element.computedWidth !== originalWidth;
// If NOT changed → width is fit-content (intrinsic)
```

---

## 6. Pre-capture Style Injection

h2d injects 5 style elements before serialization:

```css
/* 1. Pause all animations */
*, *::before, *::after {
  animation-play-state: paused !important;
  transition-duration: 0s !important;
}

/* 2. Hide scrollbars */
body::-webkit-scrollbar { display: none }

/* 3. Hide caret and transitions */
*, *::before, *::after {
  caret-color: transparent !important;
  transition-duration: 0s !important;
}
```

---

## 7. Asset Extraction

### Method: `Page.getResourceTree` + `Page.getResourceContent`
- 120 resources found in browser cache
- 94 images available
- 42 actually extracted (37 images + 5 CSS/fonts)
- **0 additional HTTP requests** — everything from browser cache
- **0 CORS issues** — browser already has the resources
- Total extracted: 1.7MB in 64ms (near-instant cache reads)

### Image size breakdown:
| Image | Decoded Size |
|-------|-------------|
| Homepage hero (Model Y) | 213KB |
| Homepage hero (Model 3) | 84KB |
| American Heroes banner | 183KB |
| Features section | 138KB |
| Google Maps tiles (×7) | ~110KB total |

---

## 8. Node Types

Only 3 types in output:

| Type | Count | Description |
|------|-------|-------------|
| FRAME | 695 | Any container (div, section, img, button, a...) |
| TEXT | 99 | Leaf text content (value + font only) |
| SVG | 12 | Full SVG markup inline |

### TEXT node = minimal:
```json
{
  "type": "TEXT",
  "x": 528.7, "y": 19.5, "width": 56.05, "height": 17,
  "value": "Vehicles",
  "font": "Universal Sans Text Medium",
  "platformFont": { "familyName": "Universal Sans Text Medium" }
}
```
All typography styles live on the PARENT frame — not on the text node.

---

## 9. h2d vs Web2Wireframe — Critical Differences

### Architecture (fundamental):
| | h2d | W2W |
|---|-----|-----|
| Style extraction | Content script (getComputedStyle) | CDP (DOMSnapshot + getMatchedStyles) |
| Data format | Raw CSS values | Pre-parsed Figma values |
| Conversion location | **Figma plugin** (2MB engine) | **tree-builder** (extraction side) |
| Plugin complexity | Heavy (CSS→Figma engine) | Light (render only) |

### Feature gaps:
| Feature | h2d | W2W |
|---------|-----|-----|
| CSS Grid | Full support (102 elements on Tesla) | None |
| SVG | Full markup inline | Not extracted |
| Hover states | Complete sub-tree re-capture (56 elements) | Basic pseudoStateStyles |
| fit-content detect | Padding manipulation trick | Not detected |
| Pre-capture injection | Animation pause, scrollbar hide, transition disable | None |
| Asset extraction | Page.getResourceContent (42 assets, 1.7MB, 0 HTTP) | Partial (Puppeteer path broken) |
| Pseudo elements | ::before/::after as standalone nodes (111 nodes) | Limited |
| Shadow DOM | Full support (9 roots on Tesla) | Not handled |
| Transform preservation | Both matrix + original CSS | Rotation only |
| backdrop-filter | Yes | No |
| clip-path | Yes | No |

### Quality advantages (W2W):
| Feature | W2W | h2d |
|---------|-----|-----|
| CSS variables | Can extract var(--name) | Only resolved values |
| Matched CSS rules | Original CSS rules available | Only computed values |
| Server-side capture | Puppeteer (no extension needed) | Extension required |
| Styled text segments | Inline mixed styles | Single style per text |

---

## 10. Actionable Improvements for W2W

### Priority 1 — Quick Wins:
1. **Pre-capture style injection** — Pause animations, hide scrollbars, disable transitions
2. **Aggressive filtering** — Skip non-visual tags (script, meta, link, style, br)
3. **Text merging** — Inline elements (span, a, li) → merge into parent text

### Priority 2 — Major Quality:
4. **Fix Puppeteer asset extraction** — `Page.getResourceContent` for images (already known bug)
5. **SVG extraction** — Store full SVG markup for icons/logos
6. **fit-content detection** — Implement padding manipulation trick

### Priority 3 — Feature Parity:
7. **CSS Grid support** — gridTemplateColumns/Rows → Figma Grid layout
8. **Shadow DOM** — Handle shadow roots
9. **Pseudo elements** — ::before/::after as standalone nodes
10. **backdrop-filter, clip-path** — Visual effects support

### Priority 4 — Architecture Consideration:
11. **Consider storing raw CSS** — Pass more raw CSS to Plugin_Frontend, let it make smarter layout decisions (h2d's approach). This is a big refactor but addresses the root cause of quality differences.

---

## Research Files Index

| File | Content |
|------|---------|
| `01-h2d-file-format.md` | .h2d encode/decode pipeline |
| `02-json-structure-analysis.md` | Complete JSON schema |
| `03-style-properties-complete.md` | 89 CSS properties + defaults |
| `04-h2d-vs-w2w-comparison.md` | Detailed architecture comparison |
| `05-h2d-architecture-flow.md` | Data flow diagrams |
| `06-spy-injection-plan.md` | Research plan |
| `07-content-script-deobfuscation.md` | DOM traversal, visibility, node creation |
| `08-figma-plugin-analysis.md` | 2MB Figma plugin key functions |
| `09-runtime-spy-findings.md` | DOM mutation spy results |
| `10-FINAL-SUMMARY.md` | This document |
| `h2d-figma-plugin-main-bundle.js` | Raw Figma plugin code (2MB) |
| `h2d-content-script-beautified.js` | Beautified content script (315KB) |
| `spy-scripts/` | 8 spy scripts ready to use |
| `../decoded/` | 3 decoded .h2d files (Tesla, Apple, Stamatiou) |
| `../spy-response/` | Runtime spy data (DOM mutations + CDP log) |
