# Real Assets Feature — Implementation Plan

## Context

Web2Wireframe currently converts all images to gray placeholder rectangles (mountain/sun icon). Users want the option to extract actual website images and render them in Figma as real IMAGE fills.

**Research basis:** html.to.design reverse-engineering (saved in memory) showed they use `Page.getResourceTree()` + `Page.getResourceContent()` to read images from browser cache — 0 CORS, 0 network requests, original quality preserved. We follow the same approach.

## Architecture: Separate Assets Map

Image base64 data is large and can be duplicated (same image on multiple elements). Instead of embedding on each node, we use a **separate `Record<string, string>` (URL → base64)** that travels alongside the tree. Each node gets only `imageUrl?: string` pointing into the map.

**Size limits:** Per-image max 2MB base64, total payload max 30MB (fits in existing 50MB express.json limit).

---

## Phase 1: shared-extraction — Types (3 files) ✅ DONE

### 1.1 `shared-extraction/src/types.ts`
- Add `imageUrl?: string` to `ExtractedElement` (after `isPlaceholder`)
- Add `assets?: Record<string, string>` to `CapturedFrame`
- Add `imageUrl?: string` to `FigmaFill` type

### 1.2 `shared-extraction/src/tree-builder.ts`
- Extract `imageUrl` from element attributes:
  - `<img>`: `src` or `data-src`
  - `<video>`: `poster`
  - Background-image: parse URL from `background-image` computed style
- Add `imageUrl` to returned element object

### 1.3 `shared-extraction/src/style-parsers.ts`
- In `parseBackgroundLayer()` when creating `IMAGE_PLACEHOLDER` fill, include the extracted URL as `imageUrl` field

### Build: `cd shared-extraction && npm run build`

---

## Phase 2: Browser_Extension — CDP Asset Extraction (2 files) ✅ DONE

### 2.1 `Browser_Extension/src/background/cdp/assets.ts` (REWRITE)
Replace Runtime.evaluate approach with h2d approach:

**New exports:**
- `buildResourceMap(client)` — calls `Page.getResourceTree()`, flattens all frames' resources, filters to images, returns `Map<string, { frameId, mimeType }>`
- `getResourceBase64(client, frameId, url)` — calls `Page.getResourceContent({ frameId, url })`, returns base64 string or null
- `extractAssetsForTree(client, tree, resourceMap)` — walks ExtractedElement tree, collects all imageUrls, resolves each against resourceMap, calls getResourceBase64, returns `Record<string, string>` (url → base64). Handles:
  - `data:` URLs — already base64, use directly
  - Normal URLs — resolve via Page.getResourceContent
  - Size gating (skip >2MB per image, >30MB total)

### 2.2 `Browser_Extension/src/background/index.ts`
In `handleCapturePage()`, `handleCaptureElement()`, `handleCaptureElementByBackendId()`:
- After tree building, call `buildResourceMap(client)` + `extractAssetsForTree(client, tree, resourceMap)`
- Replace `assets: []` with `assets: extractedAssetsMap`
- Add to frame data: `assets: assetsMap`
- Respect existing `captureAssets` setting from ExtensionSettings

### Build: `cd Browser_Extension && npm run build`

---

## Phase 3: Plugin_Backend — Pass-through (1 file) ✅ DONE

### 3.1 `Plugin_Backend/api/index.js`
In POST `/api/import-cdp`:
- Include `assets: frame.assets || {}` in frame data stored in pendingCDPImports
- No other changes needed — assets travel inside frames

---

## Phase 4: Plugin_Frontend — Settings UI (4 files) ✅ DONE

### 4.1 `Plugin_Frontend/src/ui/shared/ConfigContext.tsx`
- Add `assetMode: "placeholders" | "realAssets"` to `PluginConfig`
- Add `assetMode: "placeholders"` to `DEFAULT_CONFIG`

### 4.2 `Plugin_Frontend/src/ui/hooks/useTabSettings.ts`
- Add `localAssetMode` state + `setAssetMode` handler (same pattern as colorMode/fontMode)
- Include in handleReset, handleSaveAsDefault, sync effect

### 4.3 `Plugin_Frontend/src/ui/components/settingsPanel/SettingsPanel.tsx`
- Add `localAssetMode` and `setAssetMode` to `SettingsPanelProps`
- Add "Assets" dropdown row after Text, before CSS Variables:
  - Options: "Plugin Placeholders" / "Real Assets"

### 4.4 `Plugin_Frontend/src/types/index.ts`
- Add `imageUrl?: string` to `WireframeNode`
- Add `assetMode?: "placeholders" | "realAssets"` to `RenderWireframeData`
- Add `assetMode: "placeholders" | "realAssets"` and `assetsMap?: Map<string, string>` to `RenderContext`

---

## Phase 5: Plugin_Frontend — Rendering (5 files) ✅ DONE

### 5.1 `Plugin_Frontend/src/rendering/realImages.ts` (NEW)
- `createRealImage(node, base64Data, context)` — decodes base64 → Uint8Array → `figma.createImage(bytes)` → IMAGE fill with `scaleMode: "FILL"`
- SVG detection: if data starts with `<svg` or mime is svg, use `figma.createNodeFromSvg(string)` instead
- Fallback: on error, return `createPlaceholder()`
- Apply borderRadius, clipsContent same as placeholder

### 5.2 `Plugin_Frontend/src/rendering/nodes.ts`
- At line 208-218 (placeholder branch), add check before createPlaceholder:
  ```
  if assetMode === "realAssets" && node.imageUrl && assetsMap.has(node.imageUrl)
    → createRealImage(node, assetsMap.get(imageUrl), context)
  else
    → createPlaceholder() (current behavior)
  ```

### 5.3 `Plugin_Frontend/src/rendering/fills.ts`
- In `IMAGE_PLACEHOLDER` case: if `assetMode === "realAssets"` and `fill.imageUrl` exists in assetsMap → create IMAGE fill with `figma.createImage(bytes)`
- Else: fallback to current solid surface color

### 5.4 `Plugin_Frontend/src/main.ts`
- In `render-wireframe` handler: extract assets from frame data, build unified `assetsMap: Map<string, string>`
- Pass `assetMode` and `assetsMap` into RenderContext

### 5.5 `Plugin_Frontend/src/ui/pages/import/browserExtension/BrowserExtension.tsx`
- Add `assets` to `PendingData` interface
- Pass `assetMode` in render-wireframe message

### Also update: `Plugin_Frontend/src/ui/shared/absoluteModeRenderer.ts`
- Pass through `imageUrl` field when converting ExtractedElement → WireframeNode

### Build: `cd Plugin_Frontend && npm run build`

---

## Phase 6: Tests

### 6.1 `shared-extraction/src/__tests__/imageUrl-extraction.test.ts`
- tree-builder extracts imageUrl from img src
- tree-builder extracts imageUrl from background-image url()
- parseBackgroundLayer includes imageUrl in IMAGE_PLACEHOLDER fill

### 6.2 `Plugin_Frontend/src/__tests__/realImages.test.ts`
- createRealImage creates frame with IMAGE fill
- createRealImage falls back to placeholder on error
- nodes.ts routes to createRealImage when assetMode=realAssets

---

## Verification

1. `cd shared-extraction && npx vitest run` — tests pass
2. `cd Plugin_Frontend && npx vitest run` — tests pass
3. `npm run type-check` — no TypeScript errors
4. `npm run lint` — no lint errors
5. `npm run build:all` — all services build
6. Manual test: capture a website with Browser Extension → import in Figma → verify real images appear when "Real Assets" selected, placeholders when "Plugin Placeholders" selected

---

## Files Modified (Total: ~15)

| File | Change |
|------|--------|
| `shared-extraction/src/types.ts` | Add imageUrl, assets fields |
| `shared-extraction/src/tree-builder.ts` | Extract imageUrl from attributes |
| `shared-extraction/src/style-parsers.ts` | Add imageUrl to IMAGE_PLACEHOLDER |
| `Browser_Extension/src/background/cdp/assets.ts` | REWRITE: Page.getResourceTree approach |
| `Browser_Extension/src/background/index.ts` | Integrate asset extraction into capture |
| `Plugin_Backend/api/index.js` | Pass assets through |
| `Plugin_Frontend/src/ui/shared/ConfigContext.tsx` | Add assetMode setting |
| `Plugin_Frontend/src/ui/hooks/useTabSettings.ts` | Add assetMode state/handler |
| `Plugin_Frontend/src/ui/components/settingsPanel/SettingsPanel.tsx` | Add Assets dropdown |
| `Plugin_Frontend/src/types/index.ts` | Add imageUrl, assetMode, assetsMap |
| `Plugin_Frontend/src/rendering/realImages.ts` | **NEW**: createRealImage function |
| `Plugin_Frontend/src/rendering/nodes.ts` | Branch on assetMode |
| `Plugin_Frontend/src/rendering/fills.ts` | IMAGE_PLACEHOLDER → real IMAGE fill |
| `Plugin_Frontend/src/main.ts` | Build assetsMap, pass to context |
| `Plugin_Frontend/src/ui/pages/import/browserExtension/BrowserExtension.tsx` | Pass assets data |
| `Plugin_Frontend/src/ui/shared/absoluteModeRenderer.ts` | Pass imageUrl through |
