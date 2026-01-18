# Plugin_Frontend

Figma plugin UI built with Create Figma Plugin.

## Prerequisites

- Node.js (see root `package.json` engines).
- Figma desktop app.

## Build

```bash
npm install
npm run build
```

Build output:

- `build/`
- `manifest.json`

## Watch

```bash
npm run watch
```

## Install in Figma

1. In Figma desktop, open a file.
2. Quick Actions → “Import plugin from manifest…”.
3. Select `Plugin_Frontend/manifest.json`.

## Related Docs

- Backend service: `../Plugin_Backend/README.md`
- Technical details: `../Plugin_Backend/TECHNICAL_DOCUMENTATION.md`
