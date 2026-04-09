# New Way Architecture — h2d-style Content Script Extraction

> Created: 2026-04-09 | Branch: `new-way`

## Overview

Web2Wireframe migrated from CDP DOMSnapshot to h2d-style content script extraction.
The content script runs **in-page** using `getComputedStyle()` + `getBoundingClientRect()`
and produces **raw CSS values** (not Figma-converted). The Figma plugin then converts
CSS to Figma properties during rendering.

## Current State (PROBLEM)

```
Browser Extension ──→ Content Script (h2d-style) ──→ H2DFrameNode ──→ /api/import-h2d ──→ Plugin
URL Import (Web)  ──→ CDP DOMSnapshot (OLD)       ──→ ExtractedElement ──→ /api/import-url ──→ Plugin
```

**Two completely different extraction paths produce different data formats.**
This is why URL import has different bugs than Browser Extension import.

## Target State (h2d approach)

h2d uses the **same content script for BOTH paths**:

```
h2d Extension    ──→ Content Script (client browser) ──→ .h2d JSON ──→ Plugin
h2d URL Import   ──→ Content Script (server Chrome)  ──→ .h2d JSON ──→ Plugin
```

Web2Wireframe should do the same:

```
Browser Extension ──→ Content Script (client browser) ──→ H2DFrameNode ──→ /api/import-h2d ──→ Plugin
URL Import (Web)  ──→ Content Script (Puppeteer)      ──→ H2DFrameNode ──→ /api/import-h2d ──→ Plugin
HTML Import       ──→ Content Script (Puppeteer)      ──→ H2DFrameNode ──→ /api/import-h2d ──→ Plugin
```

**One extraction method, one data format, one rendering path.**

## How h2d Does URL Import

1. User enters URL in Figma plugin
2. Plugin fetches `api.divriots.com/h2d/capture?url=...`
3. Server launches headless Chrome, navigates to URL
4. **Same content script** is injected into the page via `page.evaluate()`
5. Content script extracts DOM + CSS (getComputedStyle, 89 properties)
6. Server collects assets via `Page.getResourceContent` (browser cache)
7. Returns .h2d file (JSON → deflate → XOR 57)
8. Plugin receives identical format as Extension path

## Content Script Extraction (packages/browser-extension/src/content/extractor.ts)

### What it captures:
- DOM traversal via TreeWalker
- 70+ CSS properties via `getComputedStyle()`
- Bounding rects via `getBoundingClientRect()`
- Pseudo-elements (::before, ::after) — materialized as temporary spans
- Text splitting via `getClientRects()`
- SVG full markup (outerHTML)
- Elements tagged with `data-w2w-idx` for service worker font lookup

### Output format: H2DFrameNode
```typescript
interface H2DFrameNode {
  type: "FRAME" | "TEXT" | "SVG";
  name: string;
  bounds: number[];        // [x1,y1,x2,y2,x3,y3,x4,y4] quad
  styles: Record<string, string>;  // Raw CSS values
  children: H2DFrameNode[];
  textValue?: string;
  svgMarkup?: string;
}
```

### Key difference from old approach:
- **Old (DOMSnapshot):** CDP captures everything in one call, tree-builder.ts converts CSS→Figma
- **New (Content Script):** In-page JS captures raw CSS, Figma plugin converts CSS→Figma during render

## Service Worker Role (CDP bridge)

Content script cannot make CDP calls. Service worker handles:
- `CSS.getPlatformFontsForNode` — actual rendered font detection
- `Page.getResourceTree` + `Page.getResourceContent` — asset extraction from cache
- `CSS.forcePseudoState` — hover/focus state capture
- Viewport emulation setup

## API Endpoints

| Endpoint | Purpose | Input | Current Status |
|----------|---------|-------|----------------|
| `/api/import-h2d` | H2D format import | H2DFrameNode tree | **IMPLEMENTED** (new-way) |
| `/api/import-url` | URL import | URL string | **OLD DOMSnapshot** (needs migration) |
| `/api/import-html` | HTML import | HTML string | **OLD DOMSnapshot** (needs migration) |
| `/api/import-cdp` | CDP data import | ExtractedElement tree | Legacy, keep for compatibility |

## Migration Plan for URL Import

To unify URL import with Browser Extension:

### Option A: Inject Content Script into Puppeteer (recommended, matches h2d)
1. API opens URL in Puppeteer
2. `page.evaluate()` runs the same content script code from `extractor.ts`
3. Content script returns H2DFrameNode tree
4. API collects assets via `Page.getResourceContent` (same as Extension service worker)
5. Returns H2DFrameNode data → Plugin renders via h2d CSS converter

### Option B: Build content script as standalone bundle
1. Bundle `extractor.ts` into a single JS string at build time
2. API injects this bundle via `page.evaluate(bundledScript)`
3. Same output format as Extension

### Steps:
1. Extract content script into shared package (or bundle for injection)
2. Create `extractWithContentScript(page)` in API that:
   - Injects content script
   - Calls `extractPage()` 
   - Collects assets via CDP
   - Returns H2DFrameNode + assets
3. Update `/api/import-url` to use new extraction
4. Update `/api/import-html` to use new extraction
5. Plugin receives same H2DFrameNode format regardless of source

## JSON Export/Import Format

### New format (H2DFrameNode):
```json
{
  "frames": [{
    "viewportWidth": 1440,
    "viewportHeight": 900,
    "tree": {
      "type": "FRAME",
      "name": "body",
      "bounds": [0,0, 1440,0, 1440,900, 0,900],
      "styles": {
        "background-color": "rgb(255, 255, 255)",
        "display": "block",
        "position": "relative"
      },
      "children": [...]
    },
    "assets": { "url": "data:image/...;base64,..." },
    "fonts": [...]
  }]
}
```

### Old format (ExtractedElement):
```json
{
  "frames": [{
    "viewportWidth": 1440,
    "viewportHeight": 900, 
    "tree": {
      "type": "frame",
      "tag": "body",
      "x": 0, "y": 0,
      "width": 1440, "height": 900,
      "fills": [{"type": "SOLID", "color": {"r": 1, "g": 1, "b": 1}}],
      "layoutMode": "VERTICAL",
      "children": [...]
    },
    "assets": { "url": "data:image/...;base64,..." }
  }]
}
```

**Key difference:** New format stores raw CSS strings. Old format stores pre-converted Figma values.

## Files Reference

| File | Role |
|------|------|
| `packages/browser-extension/src/content/extractor.ts` | Content script (DOM extraction) |
| `packages/browser-extension/src/content/visibility.ts` | Visibility filtering |
| `packages/browser-extension/src/content/styles.ts` | Pre-capture style injection |
| `packages/browser-extension/src/background/cdp.ts` | Service worker CDP orchestration |
| `packages/shared/src/h2d-types.ts` | H2DFrameNode type definitions |
| `packages/shared/src/h2d-css-converter.ts` | CSS→Figma conversion (plugin-side) |
| `packages/api/src/routes/plugin/import.ts` | API import endpoints |
| `packages/api/src/lib/cdp/index.ts` | OLD DOMSnapshot extraction (to be replaced) |
| `packages/figma-plugin/src/main.ts` | Plugin format detection + rendering |
