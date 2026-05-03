# Plugin_Frontend

Figma plugin UI and rendering engine — **Preact** (NOT React) via create-figma-plugin.

## Tech Stack

- **Language:** TypeScript (extends `@create-figma-plugin/tsconfig`)
- **UI Framework:** **Preact** (`/** @jsx h */` pragma) via `@create-figma-plugin/ui`
- **Build:** `build-figma-plugin` (from `@create-figma-plugin/build`)
- **Figma types:** `@figma/plugin-typings 1.109.0`
- **Serialization:** `@msgpack/msgpack` (binary encoding for large data)
- **Styling:** CSS modules (`*.css` + `.css.d.ts` generated type files)
- **Testing:** Vitest + happy-dom + `@testing-library/preact`

## Commands

```bash
npm run build     # build-figma-plugin --typecheck --minify
npm run watch     # build-figma-plugin --typecheck --watch
npm run test      # vitest run
npm run test:watch  # vitest
```

## Architecture — Two Entry Points

### 1. Plugin Sandbox (`src/main.ts`)
Runs in Figma's sandbox. Handles:
- `figma.ui.onmessage` — receives data from UI
- Wireframe rendering via Figma API
- Font loading and fallback flow

### 2. Plugin UI (`src/ui/index.tsx`)
Runs in iframe. Preact app:

```
src/
  main.ts               # Figma sandbox: message handling, rendering orchestration
  types/index.ts        # WireframeNode, RenderContext, all Figma-ready types
  rendering/
    nodes.ts            # createWireframeFrame — recursive node builder (CORE)
    colors.ts           # hex→FigmaRGB
    gradients.ts        # linear, radial, conic gradient parsing
    layout.ts           # CSS flex → Figma auto layout
    fills.ts            # Fills/strokes/effects → Figma paints
    styles.ts           # PaintStyle linking/creation
    text.ts             # TextNode creation
    placeholders.ts     # Image placeholder frames
  utils/
    errorHandler.ts     # ErrorCode enum
    logger.ts           # logger.info/warn/debug
  ui/
    index.tsx           # render(App) entry
    App.tsx             # ConfigProvider wrapper, page/tab routing
    shared/
      ConfigContext.tsx  # Preact context: PluginConfig, figma.clientStorage persistence
      absoluteModeRenderer.ts
      licenseClient.ts
      transformData.ts
    pages/
      import/           # web/, screenshot/, html/, areaSelection/, browserExtension/
      aiGeneration/     # block + page modes
      library/          # myLibrary/, community/
    components/
      topNav/           # Main navigation
      subHeader/        # Import tab switcher
      footer/           # Settings/Help/Plan
      modalPopup/       # Settings, Help, Purchase, FontFallback, LayoutChoice
    hooks/
      useTabSettings.ts
    styles/
      global.css        # CSS variables (design tokens)
```

## State Management

- `ConfigContext` (Preact context) — global plugin config
- Persisted to `figma.clientStorage`
- `PluginConfig`: viewports, colorMode, fontMode, textMode, pluginColors, pluginFont, showImportOptions, cssVariablesDefault, layoutModeDefault
- Per-tab session overrides via `sessionOverrides` map

## Message Protocol (main.ts ↔ ui)

- `render-wireframe` — trigger creation
- `font-not-available` / `font-fallback-choice` — font fallback
- `render-progress` — progress 0-100%
- `wireframe-created` / `wireframe-error` — completion
- `save-config` / `load-config` / `config-loaded` — settings

## Testing

- **Framework:** Vitest + happy-dom
- **Files:** `src/__tests__/*.test.ts` / `*.test.tsx`
- **Config:** `vitest.config.ts`
- **Existing tests:** colors, fills, gradients, layout, text-segments, text-styles, text-sizing, styles-linking, transform-data, importOptionsModal, settingsPanel, useImportOptionsShortcut, useTabSettings, urlValidation

## License & Payment Integration (Flitt)

**User identity:**
- Plugin sandbox (`main.ts`) reads `figma.currentUser.id` and posts it to UI via `figma.ui.postMessage({ type: "current-user", figmaUserId })`
- UI stores in ConfigContext or shared module → ALL API calls include figmaUserId in body/query
- ⚠️ **Currently NOT implemented** — primary blocker for payment flow

**API client:**
- `src/ui/shared/licenseClient.ts` — fetches `/api/license/me?figmaUserId=<ID>`
- Returns `{ plan, status, limits, usage, creditsBalance, cycleEndsAt }`
- Bearer token auth (HMAC-signed plugin token)

**Limit gates (TBD):**
- Before import action → check `usage.imports < limits.imports`
- Before AI generation → check `usage.aiGenerations < limits.aiGenerations OR creditsBalance > 0`
- If gate fails → show Purchase modal with upgrade options

**Purchase modal (`src/ui/components/modalPopup/Purchase.tsx`):**
- Currently 29-line stub — needs real implementation
- On upgrade click → opens `https://web2wireframe.design/checkout?plan=<plan>&fid=<figmaUserId>` in browser
- After return → poll `/api/license/me` for plan update

**Manage Subscription:**
- Footer or Settings has button → opens `https://web2wireframe.design/account?fid=<ID>&t=<signedToken>`
- `signedToken` = HMAC-SHA256 of `{figmaUserId, exp}` with AUTH_SECRET (server validates on Account page)

**No Flitt SDK in plugin** — all checkout URLs come from backend.

## Warnings

- **Preact, NOT React!** — `import { h } from 'preact'`, არა `import React`
- JSX pragma: `/** @jsx h */` required in `.tsx` files
- `rendering/nodes.ts` = ყველაზე კრიტიკული ფაილი, ძალიან ფრთხილად
- Two separate execution contexts: sandbox (main.ts) and iframe (ui/)
- Network access configured in `package.json` figma-plugin section
- **Plugin never calls Flitt API directly** — all payment/checkout flows go through `packages/api` backend
- **Hardcoded `localhost:3002` and `DEV_TOKEN`** in licenseClient.ts and other API callers — needs migration to env-based config before payment integration
