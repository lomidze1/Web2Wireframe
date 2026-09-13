# Plugin_Frontend

Figma plugin UI for converting websites to wireframes.

## Tech Stack

- @create-figma-plugin (build, ui, utilities)
- Preact with hooks
- TypeScript 5.0+
- @figma/plugin-typings 1.109.0
- Plugin window: 440x600px

## Import Types

- **Web** — URL import via Plugin_Backend
- **Screenshot** — Screenshot upload (AI-powered reconstruction)
- **HTML** — Raw HTML paste
- **Area Selection** — Element selection via browser extension
- **Browser Extension** — CDP capture bridge

## Setup

```bash
npm install
npm run build
```

Build output: `build/` directory + `manifest.json`

## Development

```bash
npm run dev      # build-figma-plugin --typecheck --watch
npm run build    # build-figma-plugin --typecheck --minify
```

## Install in Figma

1. Open Figma desktop app
2. Quick Actions → "Import plugin from manifest..."
3. Select `Plugin_Frontend/manifest.json`

## Project Structure

```
Plugin_Frontend/
├── src/
│   ├── main.ts                # Plugin sandbox entry
│   ├── ui/
│   │   ├── index.tsx          # UI entry (Preact)
│   │   ├── App.tsx            # Main app with navigation
│   │   ├── components/        # TopNav, SubHeader, Settings, etc.
│   │   ├── pages/             # Import pages (Web, Screenshot, HTML, etc.)
│   │   ├── hooks/             # Custom hooks
│   │   ├── shared/            # Shared utilities
│   │   └── styles/            # Component styles
│   └── rendering/             # Figma rendering modules
│       ├── colors.ts          # Color utilities
│       ├── gradients.ts       # Gradient parsing
│       ├── fills.ts           # Fill/stroke/effect conversion
│       ├── styles.ts          # Figma style creation
│       ├── text.ts            # Text node creation
│       ├── placeholders.ts    # Image placeholders
│       └── nodes.ts           # Frame/node creation
├── build/                     # Output
├── package.json               # figma-plugin config
└── tsconfig.json
```

## Integration

- Plugin_Backend at port 3002 (wireframe extraction)
- License_Backend at port 3003 (license validation)
- Browser_Extension (CDP data via /api/import-cdp)
