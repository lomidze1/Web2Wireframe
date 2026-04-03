# Web2Wireframe

Convert websites to pixel-perfect Figma wireframes using Chrome DevTools Protocol (CDP).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      pnpm + Turborepo                            │
├──────────────────────────────────────────────────────────────────┤
│  packages/shared          @w2w/shared (types + CDP extraction)   │
├──────────────────────────────────────────────────────────────────┤
│  packages/api             Unified API (port 3002)                │
│                           Express, MongoDB, Puppeteer, Claude AI │
├──────────────────────────────────────────────────────────────────┤
│  packages/web             Marketing Website (port 80)            │
│                           React 19, Vite 7, SSG, nginx           │
├──────────────────────────────────────────────────────────────────┤
│  packages/figma-plugin    Figma Plugin (Preact, build-only)      │
├──────────────────────────────────────────────────────────────────┤
│  packages/browser-extension  Chrome Extension + CDP (build-only) │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Docker (recommended)
docker compose up -d       # API + Web + MongoDB

# Local dev
pnpm install
pnpm build
pnpm dev:local             # All services via Turborepo
```

## Packages

| Package | Port | Tech Stack | Purpose |
|---------|------|------------|---------|
| [packages/shared](packages/shared/) | — | TypeScript, tsup | Shared types + CDP extraction logic |
| [packages/api](packages/api/) | 3002 | Express, MongoDB, Puppeteer, Claude AI | Unified backend API |
| [packages/web](packages/web/) | 80 | React 19, Vite 7, SSG | Marketing site with pre-rendered SEO |
| [packages/figma-plugin](packages/figma-plugin/) | — | Preact, Figma API | Figma plugin UI + rendering |
| [packages/browser-extension](packages/browser-extension/) | — | Preact, Vite, Chrome CDP | CDP-based website capture |

## Docker

```bash
docker compose up -d         # 3 services: api + web + mongo
docker compose logs -f       # Follow logs
docker compose down          # Stop all
```

| Service | Image | Port | Health Check |
|---------|-------|------|-------------|
| api | node:18-slim + chromium | 3002 | /api/health |
| web | nginx:alpine | 80 | — |
| mongo | mongo:7 | 27017 | mongosh ping |

## Development

```bash
pnpm dev:local           # All packages (Turborepo)
pnpm dev:api             # API @ :3002
pnpm dev:web             # Website @ :5173
pnpm dev:shared          # @w2w/shared watch
pnpm dev:plugin          # Figma plugin watch
pnpm dev:extension       # Browser extension watch

pnpm build               # Build everything
pnpm test                # Run all tests
pnpm type-check          # TypeScript validation
```

## Data Flow

### CDP Capture (Primary)

```
Browser Extension → CDP (chrome.debugger) → Active Tab
        ↓
@w2w/shared (DOM + matched CSS rules + fonts)
        ↓
API (/api/import-cdp)
        ↓
Figma Plugin → Figma API → Wireframe in Figma
```

### URL Import (Fallback)

```
Figma Plugin → API (/api/import-url)
        ↓
Puppeteer (getComputedStyle — lower fidelity)
        ↓
Figma Plugin → Figma API → Wireframe in Figma
```

## Project Structure

```
Web2Wireframe/
├── packages/
│   ├── shared/              # @w2w/shared — types + CDP extraction (600 tests)
│   ├── api/                 # @w2w/api — unified backend (322 tests)
│   ├── web/                 # @w2w/web — React site + SSG (7 pre-rendered pages)
│   ├── figma-plugin/        # Figma plugin UI + rendering (863 tests)
│   └── browser-extension/   # Chrome extension with CDP
├── docker-compose.yml       # Production (api + web + mongo)
├── docker-compose.dev.yml   # Dev overrides (hot reload)
├── .env                     # Environment variables
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # Workspace: packages/*
└── CLAUDE.md                # Development rules
```

## Requirements

- Node.js >= 18.0.0
- pnpm >= 10.0.0
- Docker (recommended for running services)
- Figma desktop app (for plugin development)
- Chrome/Chromium (for extension development)
