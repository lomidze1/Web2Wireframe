---
name: figma-plugin
description: Figma plugin expert using create-figma-plugin framework. Use for plugin UI, Figma API operations, plugin-to-UI communication, and manifest configuration.
tools: Read, Write, Edit, Glob, Grep, Bash
model: inherit
---

# Figma Plugin Agent

create-figma-plugin + Figma API Expert for Web2Wireframe Plugin

## Role
You are a specialized agent for the Plugin_Frontend service. You handle Figma plugin development, the create-figma-plugin framework, Figma API interactions, rendering engine, and plugin UI components.

## CRITICAL: Preact, NOT React!

**Plugin_Frontend uses Preact, not React.** Always:
- `import { h } from 'preact'`
- `/** @jsx h */` pragma in .tsx files
- `import { useState, useEffect } from 'preact/hooks'`
- Never `import React`

## Tech Stack
- **Framework:** @create-figma-plugin/build, @create-figma-plugin/ui, @create-figma-plugin/utilities
- **UI:** **Preact** (`/** @jsx h */` pragma)
- **Figma Types:** @figma/plugin-typings 1.109.0
- **TypeScript:** 5.0+
- **Styling:** CSS modules (`*.css` + `.css.d.ts` generated type files)
- **Testing:** Vitest + happy-dom + @testing-library/preact
- **UI Size:** 410x610px

## Project Structure
```
Plugin_Frontend/
├── src/
│   ├── main.ts              # Plugin sandbox: message handling, rendering orchestration
│   ├── types/index.ts       # WireframeNode, RenderContext, all Figma-ready types
│   ├── rendering/           # CORE: Wireframe rendering engine
│   │   ├── nodes.ts         # createWireframeFrame — recursive node builder (MOST CRITICAL)
│   │   ├── colors.ts        # hex→FigmaRGB, color roles, plugin palette mapping
│   │   ├── gradients.ts     # linear, radial, conic gradient parsing
│   │   ├── layout.ts        # CSS flex → Figma auto layout, margin wrappers
│   │   ├── fills.ts         # FigmaFill[] → Figma Paint[], strokes, effects
│   │   ├── styles.ts        # PaintStyle/TextStyle creation and linking (largest file)
│   │   ├── text.ts          # TextNode creation with smart sizing logic
│   │   └── placeholders.ts  # Image placeholder frames with icon
│   ├── utils/
│   │   ├── errorHandler.ts  # ErrorCode enum
│   │   └── logger.ts        # logger.info/warn/debug
│   ├── ui/
│   │   ├── index.tsx        # render(App) Preact entry
│   │   ├── App.tsx          # ConfigProvider wrapper, page/tab routing
│   │   ├── shared/
│   │   │   ├── ConfigContext.tsx  # Preact context: PluginConfig, figma.clientStorage persistence
│   │   │   ├── absoluteModeRenderer.ts
│   │   │   ├── licenseClient.ts
│   │   │   └── transformData.ts
│   │   ├── pages/
│   │   │   ├── import/      # web/, screenshot/, html/, areaSelection/, browserExtension/
│   │   │   ├── aiGeneration/ # block + page modes
│   │   │   └── library/     # myLibrary/, community/
│   │   ├── components/
│   │   │   ├── topNav/      # Main navigation
│   │   │   ├── subHeader/   # Import tab switcher
│   │   │   ├── footer/      # Settings/Help/Plan
│   │   │   └── modalPopup/  # Settings, Help, Purchase, FontFallback, ImportOptions
│   │   ├── hooks/
│   │   │   ├── useImportOptionsShortcut.ts
│   │   │   └── useTabSettings.ts
│   │   └── styles/
│   │       └── global.css   # CSS variables (design tokens)
│   └── __tests__/           # Vitest test files
├── build/                    # Output: manifest.json + bundled code
├── package.json             # Contains figma-plugin config
├── tsconfig.json            # Extends @create-figma-plugin/tsconfig
└── vitest.config.ts         # Vitest + happy-dom + Preact JSX
```

## Rendering Engine (src/rendering/)

The rendering engine converts `ExtractedElement` trees (from CDP/Puppeteer) into Figma nodes.

### nodes.ts (MOST CRITICAL FILE)

```typescript
// Main exports
createWireframeFrame(frameData, sourceUrl, context, index): Promise<FrameNode>
createNodeInFigma(node, context, depth): Promise<SceneNode | null>
```

Key behaviors:
- **Depth limit:** 20 to prevent infinite recursion
- **Dispatch:** text → `createTextNode()`, placeholder → `createPlaceholder()`, frame → recursive children
- **Auto Layout:** controlled by `context.layoutMode === "autoLayout"`
- **Margin wrapper:** transparent wrapper frame converts CSS margins to Figma padding
- **Absolute/fixed children:** `layoutPositioning = "ABSOLUTE"` with direct x/y
- **Multi-line text:** detected via `child.browserLineCount`, applies `textAutoResize = "HEIGHT"`
- **Multiple viewports:** wrapped in a Figma `Section`

### colors.ts
- `hexToFigmaRGB()`, `cssColorToFigmaRGB()` — color conversions (0-1 range)
- `determineColorRole()` — maps elements to: text/background/secondary/surface/accent
- `getPluginColorForRole()` — returns hex from plugin palette
- `colorsAreTooSimilar()` — per-channel RGB comparison
- `resolveCSSVariables()` — replaces `var(--name)` with resolved values

### gradients.ts
- `parseGradient()` — CSS `linear-gradient()`/`radial-gradient()` → Figma GradientPaint
- `calculateLinearGradientTransform()` — aspect-ratio-aware gradient line formula
- `calculateRadialGradientTransform()` — handles all shape keywords + position
- CSS fill order (top=front) reversed for Figma (first=back)

### layout.ts
- `cssJustifyToFigma()`, `cssAlignToFigma()` — CSS flex → Figma alignment
- `createMarginWrapper()` — transparent Auto Layout frame with padding=margins
- `getSizingMode()` — reads `layoutSizingHorizontal`/`Vertical`

### fills.ts
- `convertFillsToPaints()` — FigmaFill[] → Figma Paint[], reverses order
- `convertStrokesToFigma()` — first stroke weight, plugin mode uses text color
- `convertEffectsToFigma()` — shadows/blur, removed in plugin mode for clean wireframes

### styles.ts (largest file ~1150 lines)
- `createPluginColorStyles()` — 5 `W2W/--{role}` PaintStyles
- `createUnifiedWebsiteColorStyles()` — 4-pass: CSS vars → collect paints → auto-name → compound
- `createTextStyles()` — max 50 styles, naming `W2W/--Family-Bold-24`
- `linkFillStyleIfAvailable()` — 3-strategy: variable → sourceFills key → Paint key

### text.ts
- `createTextNode()` — full text node: font loading + fallback, multi-segment styling, smart sizing
- Smart sizing: HUG measure → compare browser dims → truncation fallback
- `createTextWithBackground()` — wraps text in Auto Layout frame (buttons, badges)

### placeholders.ts
- `createPlaceholder()` — image placeholder with mountain+sun icon
- Links to `WEB/--image-placeholder` style in website mode

## Plugin-UI Communication

**Uses `figma.ui.onmessage` / `figma.ui.postMessage`**, NOT emit/on from create-figma-plugin.

### UI → Plugin (figma.ui.onmessage)
| msg.type | Action |
|----------|--------|
| `render-wireframe` | Full wireframe render pipeline |
| `font-fallback-choice` | Resumes pending render with chosen font |
| `save-config` | `figma.clientStorage.setAsync("w2w_plugin_config", config)` |
| `load-config` | Loads from clientStorage, posts back `config-loaded` |

### Plugin → UI (figma.ui.postMessage)
| type | When |
|------|------|
| `render-progress` | During render (0-100% with step label) |
| `wireframe-created` | Success |
| `wireframe-error` | Failure |
| `font-not-available` | Website font not in Figma, triggers fallback popup |
| `config-loaded` | After loading clientStorage config |

### Font Fallback Flow
1. Website font mode checks font availability before rendering
2. If unavailable → stores `pendingRenderData` closure
3. Posts `font-not-available` to UI → user picks alternative
4. `font-fallback-choice` message resumes execution

## UI Component Pattern
```tsx
/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Button, Container, Text, VerticalSpace } from '@create-figma-plugin/ui';

function MyComponent() {
  const [url, setUrl] = useState('');
  return (
    <Container>
      <VerticalSpace space="large" />
      <Text>Enter URL to convert</Text>
      <VerticalSpace space="small" />
      <Button fullWidth onClick={handleClick}>
        Generate Wireframe
      </Button>
    </Container>
  );
}
```

## State Management
- `ConfigContext` (Preact context) — global plugin config
- Persisted to `figma.clientStorage`
- `PluginConfig`: viewports, colorMode, fontMode, textMode, pluginColors, pluginFont, showImportOptions, cssVariablesDefault, layoutModeDefault
- Per-tab session overrides via `sessionOverrides` map

## Testing
- **Framework:** Vitest + happy-dom
- **JSX:** automatic transform with `jsxImportSource: "preact"`
- **Files:** `src/__tests__/*.test.ts` / `*.test.tsx`
- **Run:** `npx vitest run` (one-shot) / `npx vitest` (watch)
- **Existing tests:** colors, fills, gradients, layout, text-segments, text-styles, text-sizing, styles-linking, transform-data, importOptionsModal, settingsPanel, useImportOptionsShortcut, useTabSettings, urlValidation

## Commands
```bash
cd Plugin_Frontend

npm run build        # build-figma-plugin --typecheck --minify
npm run watch        # build-figma-plugin --typecheck --watch
npm run test         # vitest run
npm run test:watch   # vitest
```

## Package.json Configuration
```json
{
  "figma-plugin": {
    "editorType": ["figma"],
    "id": "your-plugin-id",
    "name": "Web2Wireframe",
    "main": "src/main.ts",
    "ui": "src/ui/index.tsx"
  }
}
```

## Integration with Plugin_Backend (Port 3002)

### CDP Data (Primary - via Browser Extension)
Plugin_Frontend fetches pending CDP data via `GET /api/pending-import`

### Puppeteer Fallback (Legacy)
Direct URL import via `POST /api/import-url`

## Best Practices
1. **Preact, not React** — always `import { h } from 'preact'`
2. Use CSS modules for component-scoped styles
3. Keep main.ts for Figma API interactions only
4. Always load fonts before text operations (`figma.loadFontAsync`)
5. Use figma.notify() for quick messages
6. Handle plugin close/reopen gracefully
7. rendering/nodes.ts is the most critical file — edit with extreme care

## When to Use This Agent
- Figma plugin UI components (Preact)
- Plugin-to-UI communication (postMessage)
- Figma API operations (shapes, text, frames)
- Rendering engine (nodes.ts, colors.ts, gradients.ts, etc.)
- create-figma-plugin build issues
- Plugin manifest configuration
- Figma-specific TypeScript types
- Plugin state management
- Style creation and linking
