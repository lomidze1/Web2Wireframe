# Web2Wireframe Quality Improvement Plan

> Based on complete reverse-engineering of html.to.design (h2d) v0.0.191
> and full audit of W2W's current codebase (2026-03-28)

---

## Executive Summary

h2d და W2W-ს ფუნდამენტურად განსხვავებული არქიტექტურა აქვთ:
- **h2d:** Content script (raw CSS) → Figma plugin (smart conversion engine, 2MB)
- **W2W:** CDP snapshot → tree-builder (smart conversion) → Figma plugin (dumb render)

**კრიტიკული აღმოჩენა:** h2d-ის URL import **სერვერზე headless browser-ს იყენებს** (api.divriots.com) — ზუსტად ისევე როგორც ჩვენი Puppeteer path. ანუ ჩვენი არქიტექტურა სწორია, პრობლემა **extraction/conversion ხარისხშია**.

ხარისხის სხვაობა 3 კატეგორიაშია:
1. **Missing features** — Grid, SVG, pseudo-elements, hover sub-trees
2. **Suboptimal logic** — sizing (HUG never produced), filtering, fit-content
3. **Missing CSS properties** — 30+ properties h2d captures that W2W ignores

გეგმა 4 ფაზადაა: Quick Wins → Core Quality → Feature Parity → Architecture

---

## Phase 1: Quick Wins (1-2 დღე, დიდი impact)

### 1.1 Pre-Capture Style Injection
**Impact:** High | **Difficulty:** Easy | **Files:** `shared-extraction/src/snapshot.ts`

h2d 5 style element-ს ინჟექტავს capture-მდე. ჩვენ — 0-ს.

```css
/* Inject before DOMSnapshot.captureSnapshot */
*, *::before, *::after {
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  caret-color: transparent !important;
}
body::-webkit-scrollbar { display: none }
```

**რატომ:** ანიმაციების mid-state capture, scrollbar artifacts, cursor blink.

**Implementation:**
- `snapshot.ts` → `captureSnapshot()` ფუნქციაში, snapshot-მდე:
  - `Runtime.evaluate` → inject style element
  - `DOMSnapshot.captureSnapshot`
  - `Runtime.evaluate` → remove style element

---

### 1.2 Aggressive Filtering — Skip Non-Visual Tags
**Impact:** Medium | **Difficulty:** Easy | **Files:** `shared-extraction/src/constants.ts`, `tree-builder.ts`

h2d 2220 element-იდან 1414-ს ფილტრავს (63%). ჩვენი SKIP_TAGS-ს შეიძლება აკლია:

**დასამატებელი SKIP_TAGS-ში:**
- `dialog` (hidden modals)
- `template` (inert content)
- `colgroup`, `col` (table column defs)
- `datalist` (hidden option lists)
- `details` (when closed)

**დასამატებელი visibility checks (tree-builder.ts):**
- `clip: rect(0px, 0px, 0px, 0px)` → skip
- `clipPath: inset(50%)` → skip
- `clipPath: inset(0px 0px 99.9% 99.9%)` → skip
- `overflow: hidden` + size < 1px → skip

---

### 1.3 webkitTextFillColor Support
**Impact:** High | **Difficulty:** Easy | **Files:** `shared-extraction/src/tree-builder.ts`, `constants.ts`

h2d-ში 689/695 node-ს აქვს `webkitTextFillColor`. ეს **override-ავს** CSS `color`-ს.
ჩვენ ამას საერთოდ არ ვამოწმებთ.

**Implementation:**
1. `SNAPSHOT_COMPUTED_STYLES`-ში დაამატე: `'-webkit-text-fill-color'`
2. `tree-builder.ts` text color extraction-ში:
   ```typescript
   const textFillColor = styles['-webkit-text-fill-color'];
   const color = textFillColor && textFillColor !== styles['color']
     ? textFillColor : styles['color'];
   ```

---

### 1.4 textOverflow: ellipsis Support
**Impact:** Medium | **Difficulty:** Easy | **Files:** `tree-builder.ts`, `nodes.ts`

h2d ინახავს `textOverflow` property-ს. ჩვენ არ ვიჭერთ.

**Implementation:**
1. Capture `text-overflow` in snapshot
2. If `text-overflow: ellipsis` → set Figma `textTruncation: 'ENDING'`

---

## Phase 2: Core Quality (3-5 დღე)

### 2.1 HUG Sizing — ყველაზე კრიტიკული ბაგი
**Impact:** Critical | **Difficulty:** Medium | **Files:** `shared-extraction/src/utils.ts`

**W2W-ის `getLayoutSizing()` არასდროს აბრუნებს HUG.** ეს ნიშნავს `width: fit-content` / `height: auto` ელემენტები ყოველთვის FIXED ხდება, რაც layout-ს ტეხავს.

h2d-ის მიდგომა (fit-content detection):
```javascript
// Temporarily remove parent padding to check if width is intrinsic
parent.style.paddingRight = "";
let changed = computedWidth !== originalWidth;
parent.style.paddingRight = "1px";
changed ||= computedWidth !== originalWidth;
// If NOT changed → fit-content (HUG)
```

**ჩვენი Implementation ვარიანტი:**
DOMSnapshot-ში ეს ტრიკი ვერ იმუშავებს (read-only). ამიტომ:

**Option A:** Heuristic-based (მარტივი, 80% accuracy):
```typescript
function getLayoutSizing(element, parent): "FIXED" | "HUG" | "FILL" {
  // FILL: width matches parent content area
  if (style.width === '100%' || (display === 'block' && position === 'static'))
    return 'FILL';

  // HUG: width is auto/fit-content/max-content AND not block-level
  if (style.width === 'auto' && (display.includes('inline') || display === 'flex'))
    return 'HUG';
  if (style.width === 'fit-content' || style.width === 'max-content')
    return 'HUG';

  return 'FIXED';
}
```

**Option B:** Runtime.evaluate per element (ზუსტი, ნელი):
- h2d-ის padding manipulation trick-ის იმპლემენტაცია CDP-ით
- მხოლოდ auto-layout children-ებისთვის (არა ყველა ელემენტისთვის)

---

### 2.2 SVG Extraction
**Impact:** High | **Difficulty:** Medium | **Files:** `tree-builder.ts`, `types.ts`, `nodes.ts`

h2d: SVG markup → `figma.createNodeFromSvg()` → editable vector
W2W: SVG → placeholder rectangle

**Implementation:**
1. `ExtractedElement`-ში ახალი field: `svgContent?: string`
2. `tree-builder.ts` → SVG tag-ზე: `element.svgContent = outerHTML from snapshot`
3. `nodes.ts` → `if (element.svgContent) figma.createNodeFromSvg(element.svgContent)`

**Problem:** DOMSnapshot არ აბრუნებს outerHTML-ს. გამოსავალი:
- `Runtime.callFunctionOn` → `element.outerHTML` SVG ელემენტებისთვის
- ან `DOM.getOuterHTML({ nodeId })` CDP command

---

### 2.3 Fix Puppeteer Asset Extraction
**Impact:** High | **Difficulty:** Medium | **Files:** `Plugin_Backend/lib/cdp/index.ts`

**ცნობილი ბაგი:** URL import path-ით `assets: []` ცარიელია.
Root cause: `extractAssetsForTree()` არ აქვს `convertImage` callback.

**Fix:**
1. `sharp` library Node.js-ში WebP/AVIF → PNG conversion
2. `Page.getResourceContent` Browser cache-დან (h2d-ის მიდგომა)
3. Connect `convertImage` callback `extractAssetsForTree()`-ში

---

### 2.4 Text Node Hierarchy Improvement
**Impact:** Medium | **Difficulty:** Medium | **Files:** `tree-builder.ts`, `constants.ts`

h2d: `<button>Click</button>` → FRAME (button) + TEXT child ("Click")
W2W: `<button>Click</button>` → text node (textContent: "Click")

h2d-ის მიდგომა უკეთესია რადგან:
- Button-ის background/border/padding FRAME-ზეა
- Text content TEXT child-ზეა
- ეს Figma-ში component-like სტრუქტურას ქმნის

**Implementation:**
- TEXT_TAGS-დან ამოიღე: `button`, `a` (when they have background/padding)
- `needsFrameWrapper()` logic-ის გაფართოება

---

## Phase 3: Feature Parity (1-2 კვირა)

### 3.1 CSS Grid Support
**Impact:** High | **Difficulty:** Hard | **Files:** `tree-builder.ts`, `types.ts`, `nodes.ts`

Tesla.com-ზე **102 Grid ელემენტი** (6%). ჩვენ Grid-ს flex-like column-ებად ვაკონვერტებთ.

**Figma Grid API (2024+):**
```typescript
node.layoutMode = 'GRID';
node.gridColumnCount = 3;
node.gridRowCount = 2;
// + gridColumnSizes, gridRowSizes
```

**Implementation:**
1. Snapshot-ში: capture `grid-template-columns`, `grid-template-rows`, `grid-auto-flow`
2. `tree-builder.ts`: Parse grid template → column/row counts + sizes
3. `nodes.ts`: Set `layoutMode = 'GRID'` + grid dimensions

---

### 3.2 Pseudo Elements (::before/::after)
**Impact:** Medium | **Difficulty:** Hard | **Files:** `tree-builder.ts`, `snapshot.ts`

h2d: 111 pseudo-element nodes (tag: "UNKNOWN") — standalone FRAME nodes
W2W: Limited detection, no standalone nodes

**Implementation:**
1. DOMSnapshot-ში pseudo-elements-ს capture (ან `DOM.getBoxModel` pseudo-ისთვის)
2. Standalone ExtractedElement-ად conversion
3. Parent-ის children-ში insertion

---

### 3.3 Shadow DOM Support
**Impact:** Medium | **Difficulty:** Hard | **Files:** `snapshot.ts`, `tree-builder.ts`

h2d: 9 shadow roots Tesla.com-ზე, `chrome.dom.openOrClosedShadowRoot()`
W2W: No shadow DOM support

**Implementation:**
- `DOMSnapshot.captureSnapshot` with `includeDOMRects: true` supports shadow DOM
- ან `DOM.describeNode` → `shadowRoots` property

---

### 3.4 Hover State Sub-Trees
**Impact:** Medium | **Difficulty:** Hard | **Files:** `tree-builder.ts`, `types.ts`, `nodes.ts`

h2d: 56 elements-ს hover state სრული sub-tree re-capture-ით
W2W: `pseudoStateStyles` — style delta only, rendering არ ხდება

**Full implementation:** Figma component variants (default + hover state)

---

### 3.5 Additional CSS Properties
**Impact:** Medium | **Difficulty:** Easy (each) | **Files:** `constants.ts`, `tree-builder.ts`

**High priority:**
- `clip-path` — visual masking + visibility filtering
- `backdrop-filter` — უკვე partially supported, expand
- `text-shadow` → Figma text effects
- `object-position` — image positioning within frame
- `aspect-ratio` — maintain proportions

**Medium priority:**
- `direction` (RTL)
- `writing-mode` (vertical text)
- `-webkit-text-stroke-color/width` (text outlines)
- `text-transform` (uppercase/lowercase)

---

## Phase 4: Architecture Consideration (long-term)

### 4.1 Raw CSS Passthrough
**Impact:** Fundamental | **Difficulty:** Very Hard

h2d-ის მთავარი უპირატესობა: Figma plugin-ს raw CSS აქვს და smart decisions იღებს.

**ნაწილობრივი გამოსავალი (already exists):**
`ExtractedElement.computedStyles` field უკვე არსებობს — Record<string, string>.

**გეგმა:**
1. `computedStyles`-ში მეტი property ჩაწერე tree-builder-ში
2. `nodes.ts`-ში `computedStyles` fallback-ად გამოიყენე layout decisions-ში
3. Gradually move more CSS→Figma logic to Plugin_Frontend side

ეს **არ არის refactor** — ეს incremental migration-ია.

---

## Priority Matrix

| # | Task | Impact | Effort | Phase |
|---|------|--------|--------|-------|
| 1 | HUG sizing fix | Critical | Medium | 2 |
| 2 | Pre-capture style injection | High | Easy | 1 |
| 3 | SVG extraction | High | Medium | 2 |
| 4 | Fix Puppeteer assets | High | Medium | 2 |
| 5 | webkitTextFillColor | High | Easy | 1 |
| 6 | CSS Grid support | High | Hard | 3 |
| 7 | Aggressive filtering | Medium | Easy | 1 |
| 8 | textOverflow: ellipsis | Medium | Easy | 1 |
| 9 | Text node hierarchy | Medium | Medium | 2 |
| 10 | Pseudo elements | Medium | Hard | 3 |
| 11 | Shadow DOM | Medium | Hard | 3 |
| 12 | Hover sub-trees | Medium | Hard | 3 |
| 13 | clip-path support | Medium | Medium | 3 |
| 14 | text-shadow | Medium | Medium | 3 |
| 15 | computedStyles passthrough | Fundamental | Very Hard | 4 |

---

## W2W Advantages to PRESERVE

არ დავკარგოთ ჩვენი უპირატესობები:
1. **CSS Variables** — `var(--primary-color)` extraction (h2d-ს არ აქვს)
2. **Matched CSS Rules** — original CSS (not just computed)
3. **Styled Text Segments** — inline mixed styles (bold+italic in same paragraph)
4. **Per-side Borders** — top/right/bottom/left separately (h2d uses shorthand)
5. **Server-side Capture** — Puppeteer path (no extension needed)
6. **Text decoration detail** — color, style, thickness separately
7. **Gradient support** — linear, radial, conic with CSS variable resolution
8. **3-tier font resolution** — platform fonts > matched rules > computed
9. **Icon font extraction** — 3-tier detection system

---

## Files Reference

| Task | Primary Files to Modify |
|------|------------------------|
| Pre-capture injection | `shared-extraction/src/snapshot.ts` |
| Filtering | `shared-extraction/src/constants.ts`, `tree-builder.ts` |
| HUG sizing | `shared-extraction/src/utils.ts` → `getLayoutSizing()` |
| SVG extraction | `tree-builder.ts`, `types.ts`, `Plugin_Frontend/src/rendering/nodes.ts` |
| Asset fix | `Plugin_Backend/lib/cdp/index.ts` |
| Grid support | `tree-builder.ts`, `types.ts`, `nodes.ts` |
| CSS properties | `shared-extraction/src/constants.ts` → `SNAPSHOT_COMPUTED_STYLES` |
| Text hierarchy | `shared-extraction/src/constants.ts` → `TEXT_TAGS` |
| Pseudo elements | `shared-extraction/src/snapshot.ts`, `tree-builder.ts` |
