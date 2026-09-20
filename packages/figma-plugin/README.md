# packages/figma-plugin

Figma plugin UI for converting websites to wireframes.

## Tech Stack

- @create-figma-plugin (build, ui, utilities)
- Preact with hooks
- TypeScript 5.0+
- @figma/plugin-typings 1.109.0
- Plugin window: 440x600px

## Import Types

- **Web** — URL import via `packages/api`
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
3. Select `packages/figma-plugin/manifest.json`

## Project Structure

```
packages/figma-plugin/
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

- `packages/api` @ :3002 — wireframe extraction **and** license validation
  (the former License_Backend :3003 was merged into it on 2026-03-26)
- `packages/browser-extension` — capture arrives via `POST /api/import-w2w`;
  the plugin fetches it with `GET /api/pending-import`
