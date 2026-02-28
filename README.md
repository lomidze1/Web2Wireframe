# Web2Wireframe

Convert websites to pixel-perfect Figma wireframes using Chrome DevTools Protocol (CDP).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        npm Workspaces                            │
├────────────────┬────────────────┬──────────────┬────────────────┤
│ Website        │ Website        │ Plugin       │ Plugin         │
│ Frontend       │ Backend        │ Frontend     │ Backend        │
│ (React/Vite)   │ (Express/TS)   │ (Figma)      │ (Express)      │
│ :5173          │ :3001          │ 440x600 UI   │ :3002          │
├────────────────┴────────────────┴──────────────┴────────────────┤
│ License_Backend (Express/TS) :3003                               │
├──────────────────────────────────────────────────────────────────┤
│ Browser_Extension (Chrome Extension + CDP)                       │
├──────────────────────────────────────────────────────────────────┤
│ shared-extraction (CDP extraction library)                       │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
npm install
npm run dev          # All services concurrently
```

## Services

| Service | Port | Tech Stack | Purpose |
|---------|------|------------|---------|
| [Website_Frontend](Website_Frontend/) | 5173 | React 19, Vite 7, SCSS | Marketing site, docs, support |
| [Website_Backend](Website_Backend/) | 3001 | Express, TypeScript, Zod, Resend | Support API, Figma OAuth |
| [Plugin_Frontend](Plugin_Frontend/) | — | @create-figma-plugin, Preact | Figma plugin UI |
| [Plugin_Backend](Plugin_Backend/) | 3002 | Express, Puppeteer, Cheerio | Wireframe extraction API |
| [License_Backend](License_Backend/) | 3003 | Express, TypeScript | License/subscription management |
| [Browser_Extension](Browser_Extension/) | — | Chrome Extension, Preact, Vite | CDP-based website capture |
| [shared-extraction](shared-extraction/) | — | TypeScript, Vitest | Shared CDP extraction logic |

## Development

```bash
npm run dev              # All services
npm run dev:frontend     # Website_Frontend @ :5173
npm run dev:backend      # Website_Backend @ :3001
npm run dev:plugin-backend  # Plugin_Backend @ :3002
npm run dev:plugin       # Figma plugin watch
npm run dev:extension    # Browser_Extension watch
npm run dev:shared       # shared-extraction watch

npm run build:all        # Build everything
npm run type-check       # TypeScript validation
npm run lint             # ESLint check
```

## Data Flow

### CDP Capture (Primary)

```
Browser Extension → CDP (chrome.debugger) → Active Tab
        ↓
shared-extraction (DOM + matched CSS rules + fonts)
        ↓
Plugin_Backend (/api/import-cdp)
        ↓
Plugin_Frontend → Figma API → Wireframe in Figma
```

### URL Import (Fallback)

```
Plugin_Frontend → Plugin_Backend (/api/import-url)
        ↓
Puppeteer (getComputedStyle — loses gradients/variables)
        ↓
Plugin_Frontend → Figma API → Wireframe in Figma
```

## Project Structure

```
Web2Wireframe/
├── Website_Frontend/     # Marketing site (React + Vite)
├── Website_Backend/      # Support API (Express + TypeScript)
├── Plugin_Frontend/      # Figma plugin UI (Preact)
├── Plugin_Backend/       # Wireframe extraction API (Express)
├── License_Backend/      # License management (Express + TypeScript)
├── Browser_Extension/    # Chrome extension with CDP
├── shared-extraction/    # Shared CDP extraction library
├── .claude/              # Claude Code config (agents, skills, settings)
├── CLAUDE.md             # Development workflow rules
├── TODO.md               # Feature tracking
└── package.json          # Monorepo root (npm workspaces)
```

## Requirements

- Node.js >= 18.0.0
- npm >= 9.0.0
- Figma desktop app (for plugin development)
- Chrome/Chromium (for extension development)
