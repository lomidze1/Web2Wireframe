# Browser_Extension

Chrome Extension (Manifest V3) — captures websites via CDP and sends to Plugin_Backend.

## Tech Stack

- **Language:** TypeScript (strict, `"types": ["chrome"]`)
- **UI Framework:** **Preact** (popup and options pages)
- **Build:** Vite 5 with `@preact/preset-vite`
- **Serialization:** `@msgpack/msgpack` (binary encoding)
- **Shared:** `shared-extraction` package
- **Module:** ESM
- **Manifest:** Chrome Manifest V3

## Commands

```bash
npm run dev       # vite build --watch
npm run build     # vite build
```

## Architecture

```
src/
  background/
    index.ts            # Service worker: CDP orchestration
    cdp/
      client.ts         # CDPClient class wrapping chrome.debugger API
      index.ts          # Re-exports
      css.ts            # getMatchedStylesForNode — CSS rule extraction
      dom.ts            # getDocument, getScrollDimensions
      fonts.ts          # extractFonts() — @font-face extraction
      assets.ts         # Image, SVG extraction
      snapshot.ts       # DOMSnapshot capture
  content/
    index.ts            # Content script (injected into all pages)
  popup/
    index.html          # Popup entry
    main.tsx            # Preact render
    App.tsx             # Main popup UI
    components/
      CaptureButtons.tsx
      SaveOptions.tsx   # "local" vs "figma" save
      ViewportsSection.tsx
      VisualFlow.tsx
      HelpModal.tsx, PlanModal.tsx, Footer.tsx, Icons.tsx
  options/
    index.html          # Options page
    main.tsx
  shared/
    types.ts            # ExtensionMessage union, ExtensionSettings, CaptureOptions
    constants.ts        # API_URL, VIEWPORTS, SKIP_TAGS, TEXT_TAGS, MEDIA_TAGS
    style-parsers.ts    # CSS parsing utilities
    utils.ts
  styles/
    global.css
```

## CDP Workflow

1. `CDPClient` wraps `chrome.debugger` API (not Puppeteer)
2. `DOMSnapshot.captureSnapshot` — one call for entire page layout + computed styles
3. `CSS.getMatchedStylesForNode` — only for gradient/variable nodes (selective, not all)
4. Result posted to `POST /api/import-cdp` on Plugin_Backend

## Manifest V3 Permissions

`activeTab`, `debugger`, `scripting`, `storage`, `downloads`

## Build Outputs (Vite rollup)

- `background/index.js` — service worker
- `content/index.js` — content script
- `src/popup/index.html` — popup
- `src/options/index.html` — options page

## Key Types

- `ExtensionMessage` — typed message union for `chrome.runtime` messaging
- `CaptureResult` — full page capture (url, title, frames[], fonts[], cssVariables[])
- `CapturedFrame` — single viewport: `{ viewport, tree: ExtractedElement }`
- `ExtensionSettings` — backendUrl, autoCapture, captureAssets, captureFonts, compressData

## Warnings

- **Preact, NOT React** — `import { h } from 'preact'`
- API target hardcoded in `src/shared/constants.ts` (`http://localhost:3002`)
- `chrome.debugger` requires user permission on each tab
- Service worker has limited lifetime — no persistent state
- No test framework configured
- `shared-extraction` must be built before this extension
