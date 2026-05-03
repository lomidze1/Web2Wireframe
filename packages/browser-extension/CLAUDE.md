# Browser_Extension

Chrome Extension (Manifest V3) — captures websites via **hybrid Content Script + CDP** approach and sends to Plugin_Backend.

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
    index.ts            # Service worker: handleCapturePageW2W() orchestrates content script + CDP
    cdp/
      client.ts         # CDPClient class wrapping chrome.debugger API
      index.ts          # Re-exports
      css.ts            # CSS-related CDP helpers
      dom.ts            # getDocument, getScrollDimensions
      fonts.ts          # extractFonts() — @font-face + binary extraction
      assets.ts         # Image, SVG extraction from browser cache
      snapshot.ts       # DOMSnapshot capture (legacy CDP mode only)
  content/
    index.ts            # Message handler: EXTRACT_DOM, EXTRACT_SUBTREE, COLLECT_HOVER_SELECTORS, FETCH_FONT_DATA
    extractor.ts        # CORE: extractPage() — DOM traversal (1300+ lines, getComputedStyle-based)
    hover-parser.ts     # Local hover selector parser
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

## Hybrid Capture Workflow (`handleCapturePageW2W`)

Active flow triggered by popup's "Capture" button (sends `CAPTURE_PAGE_W2W` message):

1. **Service Worker (CDP):** Set viewport via `Emulation.setDeviceMetricsOverride` + `Page.reload` (per viewport)
2. **Content Script:** `extractPage()` traverses DOM via `getComputedStyle()` + `getBoundingClientRect()`, tags text-hosting elements with `data-w2w-idx`
3. **Service Worker (CDP):** `CSS.getPlatformFontsForNode` for each tagged element — returns ACTUAL rendered font (post-fallback resolution), different from CSS request
4. **Service Worker (CDP):** `CSS.forcePseudoState` to capture `:hover` states; content script re-extracts the hovered subtree
5. **Service Worker (CDP):** Font binaries via `Page.getResourceContent`, CSS variables, image assets from browser cache
6. Result posted to `POST /api/import-w2w` on Plugin_Backend

### Why Hybrid (not pure content script)

Content script CANNOT do these — CDP fills the gaps:

- Change emulated viewport / trigger reload
- Get actual rendered font name (only sees CSS `font-family` request, not what the browser actually rendered after fallback)
- Force `:hover` / `:focus` pseudo-states
- Read cross-origin stylesheets (CORS blocks `cssRules`)
- Access browser resource cache (font/image binaries)

### Legacy Mode (NOT USED)

Old `handleCapturePage()` (CDP-only via `DOMSnapshot.captureSnapshot` + `CSS.getMatchedStylesForNode`) and `POST /api/import-cdp` endpoint exist but are unreachable from current popup UI. Preserved on `old-branch` for comparison only.

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
- **Content script is primary** — `src/content/extractor.ts` is the most critical extraction file (1300+ lines)
- **CDP is hybrid, not legacy** — heavily used per-element for `getPlatformFonts` (essential for font fallback resolution) and `forcePseudoState` (hover capture)
- API target hardcoded in `src/shared/constants.ts` (`http://localhost:3002`)
- `chrome.debugger` requires user permission on each tab
- Service worker has limited lifetime — no persistent state
- No test framework configured
- `shared-extraction` must be built before this extension
