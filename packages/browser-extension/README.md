# Web2Wireframe Browser Extension

Chrome/Chromium extension for capturing websites using Chrome DevTools Protocol (CDP).

## Features

- **CDP-based capture**: Uses Chrome DevTools Protocol for accurate style extraction
- **Matched CSS rules**: Preserves gradients, CSS variables, hover states (unlike `getComputedStyle`)
- **Font extraction**: Detects @font-face rules and Google Fonts
- **Asset extraction**: Captures images, SVGs, and background images
- **Private pages**: Can capture logged-in pages (user's session)

## Development

### Setup

```bash
cd packages/browser-extension
npm install
```

### Build

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build
```

### Load in Chrome

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `packages/browser-extension/dist` folder

## Architecture

```
packages/browser-extension/
├── manifest.json           # Extension manifest (V3)
├── src/
│   ├── background/         # Service worker + CDP client
│   │   └── cdp/           # CDP extraction modules
│   │       ├── client.ts  # CDP connection wrapper
│   │       ├── dom.ts     # DOM tree extraction
│   │       ├── css.ts     # CSS rules extraction (KEY!)
│   │       ├── fonts.ts   # Font extraction
│   │       ├── snapshot.ts # Full page capture
│   │       └── assets.ts  # Image/SVG extraction
│   ├── content/           # Content script (page context)
│   ├── popup/             # Extension popup UI
│   │   └── components/    # CaptureButtons, ViewportsSection, etc.
│   ├── options/           # Settings page
│   └── shared/            # Types, constants, utils
└── dist/                  # Build output
```

Uses `shared-extraction` library for unified CDP extraction logic (shared with Plugin_Backend).

## CDP vs Puppeteer

| Feature | Puppeteer | CDP Extension |
|---------|-----------|---------------|
| Style extraction | `getComputedStyle()` only | `getMatchedStylesForNode` + computed |
| Gradients | Lost (computed to solid) | Preserved as original CSS |
| CSS Variables | Only resolved value | Original `var()` + resolved |
| Hover states | Cannot capture | Via pseudo-class rules |
| Private pages | Cannot access | User's session |

## Usage Flow

1. User clicks extension icon
2. Extension attaches debugger to tab
3. CDP extracts DOM tree with matched CSS rules
4. Data sent to Plugin_Backend (`/api/import-cdp`)
5. Backend processes and sends to Figma plugin

## Permissions

- `debugger`: Required for CDP access
- `activeTab`: Access current tab
- `scripting`: Inject content script
- `storage`: Save settings
