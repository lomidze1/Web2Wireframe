# shared-extraction

Shared CDP extraction logic for Web2Wireframe. Used by both Browser_Extension and Plugin_Backend.

## Purpose

Provides a unified `extract()` function that:
1. Captures DOM snapshot via `DOMSnapshot.captureSnapshot`
2. Gets matched CSS rules via `CSS.getMatchedStylesForNode` (preserves gradients, variables)
3. Extracts CSS variables from the page
4. Builds an `ExtractedElement` tree with Figma-ready fills, strokes, and effects

## Tech Stack

- TypeScript 5.3
- tsup (ESM + CJS dual build)
- Vitest (testing)

## Usage

```typescript
import { extract, CDPClientInterface } from 'shared-extraction';

// Implement CDP client for your environment
class MyCDPClient implements CDPClientInterface {
  async send(method: string, params?: any) { /* ... */ }
  async enableDomains(...domains: string[]) { /* ... */ }
}

const client = new MyCDPClient();
const tree = await extract(client, { viewportWidth: 1440 });
```

## Key Exports

| Export | Description |
|--------|------------|
| `extract()` | Main extraction function |
| `captureSnapshot()` | DOMSnapshot.captureSnapshot wrapper |
| `getMatchedStylesForNode()` | CSS.getMatchedStylesForNode wrapper |
| `parseBackgroundToFills()` | CSS background → Figma fills |
| `parseBoxShadowToEffects()` | CSS box-shadow → Figma effects |
| `parseBordersToStrokes()` | CSS borders → Figma strokes |
| `buildElementTree()` | Parsed DOM → ExtractedElement tree |
| `parseColorToFigma()` | CSS color → Figma RGB(A) |
| `extractCSSVariables()` | Extract all CSS custom properties |

## Module Structure

```
src/
├── index.ts           # Exports + main extract() function
├── types.ts           # All type definitions
├── snapshot.ts        # DOM snapshot capture & parsing
├── css.ts             # CSS extraction (matched styles, variables)
├── style-parsers.ts   # CSS → Figma conversion
├── tree-builder.ts    # DOM → ExtractedElement tree
├── constants.ts       # SKIP_TAGS, TEXT_TAGS, etc.
├── utils.ts           # parseColor, isGradient, etc.
└── __tests__/         # Test suite
```

## Development

```bash
npm run dev          # Watch mode (tsup)
npm run build        # Production build
npm run type-check   # TypeScript validation
npm run test         # Run tests (vitest)
npm run test:watch   # Watch mode tests
```
