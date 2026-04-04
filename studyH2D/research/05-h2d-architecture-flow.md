# h2d Architecture & Data Flow

## Components

```
┌─────────────────────────────────────────────────────┐
│                  Chrome Extension                    │
│                                                     │
│  ┌─────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ Popup   │───→│  Background  │←──→│  Content   │  │
│  │ (UI)    │    │  (Service    │    │  Script    │  │
│  │         │    │   Worker)    │    │  (in-page) │  │
│  └─────────┘    └──────────────┘    └───────────┘  │
│                       │                    │        │
│                       │ CDP                │ DOM    │
│                       ▼                    ▼        │
│                 chrome.debugger       getComputedStyle│
│                 Page.getResource      DOM traversal  │
│                 CSS.forcePseudo       h2d-* classes   │
│                 CSS.getPlatformFont                  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼ .h2d file OR gstorage upload
┌─────────────────────────────────────────────────────┐
│                  Figma Plugin                        │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ CSS → Figma Conversion Engine                │   │
│  │ - Parse raw CSS values                        │   │
│  │ - Convert colors, sizes, layouts              │   │
│  │ - Build Figma node tree                       │   │
│  │ - Create images from base64 assets            │   │
│  │ - Create SVGs from markup                     │   │
│  │ - Apply fonts                                 │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Capture Flow (Detailed)

### Phase 1: Initialization
```
Popup                    Background                Content Script
  │                         │                          │
  │ startCapture(target,    │                          │
  │   opts: {full, tasks,   │                          │
  │   saveLocation})        │                          │
  │ ─────────────────────→  │                          │
  │                         │ setCaptureAnalytics ───→ │
  │                         │ removeSelector ────────→ │
  │                         │                          │
  │                         │ Emulation.setDeviceMetrics(1440w)
  │                         │ DOM.enable, CSS.enable,  │
  │                         │ Page.enable              │
  │                         │ DOM.getDocument(depth:95) │
```

### Phase 2: Content Script Conversion
```
  Background                Content Script (in-page JS)
    │                          │
    │ convertBody ───────────→ │
    │ {theme:"default",        │
    │  width:1440}             │
    │                          │ 1. Add h2d-* classes to ALL elements
    │                          │ 2. Recursive DOM traversal
    │                          │ 3. For each visible element:
    │                          │    - getComputedStyle() → 80 properties
    │                          │    - getBoundingClientRect() → quad
    │                          │    - Check if img/bg-image → need asset
    │                          │    - Check if SVG → extract markup
    │                          │    - Determine if TEXT leaf
    │                          │
    │  ◄── getAssetWithCDP ──  │ 4. Request image assets
    │  Page.getResourceTree()  │
    │  Page.getResourceContent │
    │  ── base64 data ───────→ │
    │                          │
    │  ◄── getPlatformFont ──  │ 5. Request real font names
    │  DOM.querySelector       │
    │  CSS.getPlatformFonts    │
    │  ── {familyName} ──────→ │
    │                          │
    │  ◄── fetchBeforeAfter ── │ 6. Pseudo-element dimensions
    │  DOM.querySelector       │
    │  DOM.getBoxModel         │
    │  ── {width,height} ────→ │
    │                          │
    │  ◄── forcePseudoState ── │ 7. Hover state capture
    │  CSS.forcePseudoState    │    (re-traverse element with
    │  ── done ──────────────→ │     forced :hover)
    │                          │
    │  ◄── storeSerializedFrame│ 8. Package result
    │  {frame, assets, fonts}  │
```

### Phase 3: Finalization
```
  Background
    │
    │ Merge serialized frames (multi-theme support)
    │ Merge assets and fonts from all frames
    │
    │ Encode:
    │   JSON.stringify(data)
    │   → TextEncoder.encode()
    │   → deflate compression
    │   → XOR each byte with 57
    │
    │ if saveLocation === "gstorage":
    │   Upload to Google Cloud Storage
    │   Notify Figma plugin via API
    │ else:
    │   chrome.downloads.download(.h2d file)
```

## CDP Commands Summary

| Command | Count (Apple) | Purpose |
|---------|---------------|---------|
| DOM.querySelector | 677 | Find elements by h2d-* class |
| CSS.forcePseudoState | 354 | Force :hover/:focus states |
| DOM.describeNode | 322 | Node info (tag, attributes) |
| Runtime.callFunctionOn | 63 | Call page functions |
| DOM.resolveNode | 62 | nodeId → RemoteObject |
| DOM.getBoxModel | 60 | Element dimensions |
| CSS.getPlatformFontsForNode | 31 | Real font name |
| Page.getResourceContent | 30 | Extract images from cache |
| DOM.getContentQuads | 19 | Element coordinates |
| Page.getResourceTree | 2 | List all page resources |
| Emulation.setDeviceMetrics | 1 | Set viewport |
| DOM.getDocument | 1 | Full DOM tree |

### What they DON'T use:
- `CSS.getMatchedStylesForNode` — 0 calls (they use getComputedStyle in content script)
- `Page.captureScreenshot` — 0 for the main capture (only for thumbnail)
- `Runtime.evaluate` — 0 (no JS injection via CDP)
- `DOMSnapshot.captureSnapshot` — 0 (no snapshot approach)
- `Network.getResponseBody` — 0 (no network interception)

## Message Protocol (webext-bridge)

h2d uses `webext-bridge` library for communication:

| Message | Direction | Data |
|---------|-----------|------|
| startCapture | popup → bg | {target, opts} |
| convertBody | bg → cs | {theme, width} |
| getAssetWithCDP | cs → bg | {url} → {base64, mimeType} |
| getPlatformFontForNode | cs → bg | {selector} → {familyName, postScriptName} |
| fetchBeforeAfter | cs → bg | {selector} → {pseudoType, border, content, w, h} |
| forcePseudoState | cs → bg | {selector, states} |
| fetchShadowRoot | cs → bg | {selector} → shadow DOM content |
| storeSerializedFrame | cs → bg | {frame, assets, fonts} |
| finalizeImport | popup → bg | trigger save/upload |

## h2d-* Class System

Every DOM element gets a unique hash class:
```
h2d-3c0d0a08, h2d-832fe91a, h2d-7aa5cc11
```

Purpose: reliable element selection for CDP operations.
- Background can find any element via `DOM.querySelector(".h2d-f41db3f7")`
- Content script uses these for messaging (which element needs what)
- Injected by `cleanupDomForAttach.js` before conversion starts
