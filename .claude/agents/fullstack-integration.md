---
name: fullstack-integration
description: Monorepo architecture and cross-service integration expert. Use for multi-service features, data flows, deployment, and service communication issues.
tools: Read, Write, Edit, Glob, Grep, Bash
model: inherit
---

# Full Stack Integration Agent

Monorepo architecture and cross-package integration for Web2Wireframe.

## Role

You understand every package, how they talk to each other, and how they deploy.
Use this agent for cross-package features, data-flow problems, and architecture
decisions.

## 🔒 LIVE zone — read before editing

Everything is shipped and live. Only `packages/figma-plugin` is open for routine
work.

| Package | Status | Why it is frozen |
|---|---|---|
| `packages/api` | 🔴 LIVE at `api.web2wireframe.design` (Render) | The published plugin depends on the exact request/response shape. A breaking redeploy hits real users immediately. |
| `packages/shared` | 🔴 LIVE contract | `CDPClientInterface` + import data format bind extension → API → plugin. The extension is published, so its format is frozen. |
| `packages/browser-extension` | 🔴 LIVE on the Chrome Web Store (`fcmicolldgpmpdkcdljkaaimmjmboipl`) | Its output must stay compatible with the API. |

**Never edit those three without asking the owner first.** `packages/figma-plugin`
and `packages/web` are safe to change locally — published builds are frozen at the
version users already have.

## Monorepo layout

pnpm workspaces (`pnpm-workspace.yaml` → `packages/*`) driven by Turborepo.
**pnpm ≥10, Node ≥18 <23.**

| Directory | pnpm package name | Port | Stack |
|---|---|---|---|
| `packages/api` | `@w2w/api` | 3002 | Express 4, TS/ESM, MongoDB, Chromium |
| `packages/web` | `@w2w/web` | 5173 dev · 80 prod (nginx) | React 19 + Vite 7 + SSG |
| `packages/shared` | `@w2w/shared` | — | tsup library (CJS+ESM) |
| `packages/figma-plugin` | **`plugin-frontend`** ⚠️ | — | **Preact** via create-figma-plugin |
| `packages/browser-extension` | `web2wireframe-extension` | — | **Preact** + Vite 5, MV3 |

⚠️ `packages/figma-plugin` still carries the pre-migration package name
`plugin-frontend`. `pnpm --filter plugin-frontend` is correct; the directory name
is not the filter name.

⚠️ `figma-plugin` and `browser-extension` are **Preact, not React**. Use
`import { h } from 'preact'`. React lives only in `packages/web`.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  packages/browser-extension   (Chrome MV3, Preact)         │
│  content script = primary extraction · CDP for the rest    │
└───────────────┬────────────────────────────────────────────┘
                │ POST /api/import-w2w
                ▼
┌────────────────────────────────────────────────────────────┐
│  packages/api   @w2w/api  :3002   (unified Express app)    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ pendingCDPImports — in-memory Map, 10 min TTL,       │  │
│  │ consumed on first read (packages/api/src/state.ts)   │  │
│  └──────────────────────────────────────────────────────┘  │
│  MongoDB: Wireframes · UserSettings · Licenses             │
└───────────────┬────────────────────────────────────────────┘
                │ GET (plugin polls / fetches)
                ▼
┌────────────────────────────────────────────────────────────┐
│  packages/figma-plugin   (Preact, Figma sandbox + UI)      │
│  recursive node builder → src/rendering/nodes.ts           │
└────────────────────────────────────────────────────────────┘

packages/web  ──HTTP──▶  /web/*   (support, session)
packages/web  ──HTTP──▶  /auth/figma/*  (OAuth)
Flitt         ──HTTP──▶  /api/webhooks/flitt  (SHA1-signed callback)

packages/shared = single source of truth for types + CDP extraction logic,
                  imported by BOTH browser-extension and api.
```

**Three old backends (Plugin, Website, License) were merged into one Express app
in `packages/api/src/index.ts`** (migration 2026-03-26). There is no `:3001` and
no `:3003` any more.

## Route map — one app, router-scoped middleware

| Prefix | Router | Middleware |
|---|---|---|
| `/api/*` | plugin: import, cdp, ai, wireframe, settings, auth, newsletter, import-report | CORS figma.com + `null`; HMAC-SHA256 Bearer |
| `/api/license/*` | license (MongoDB-backed) | Bearer token |
| `/api/admin/{license,stats,panel,cancellations}` | admin | admin token |
| `/api/checkout/*` | Flitt checkout | public, validated by `figmaUserId` in body |
| `/api/webhooks/flitt` | Flitt callback | public, **SHA1 signature check is mandatory** |
| `/web/*` | website: support, session | CORS web2wireframe.design; express-session |
| `/auth/figma/*` | Figma OAuth | express-session |

Express error-handler middleware is always last in the chain.

## Capture flow (hybrid — content script primary)

```
1. popup → CAPTURE_PAGE_W2W
2. service worker (CDP): Emulation.setDeviceMetricsOverride + Page.reload per viewport
3. content script: extractPage() — full DOM, 70+ CSS props, geometry, line boxes
4. service worker (CDP): CSS.getPlatformFontsForNode per text element
5. service worker (CDP): CSS.forcePseudoState for :hover
6. service worker (CDP): font binaries + CSS variables + assets from cache
7. POST /api/import-w2w        ← NOT /api/import-cdp
```

CDP is used only where a content script physically cannot do the job
(multi-viewport, scrollbar metrics, real rendered font, forced pseudo-state,
cross-origin stylesheets, cached font/asset binaries). Details:
[`packages/browser-extension/CLAUDE.md`](../../packages/browser-extension/CLAUDE.md).

The legacy CDP-only `handleCapturePage()` is dead code, unreachable from the
popup. New work always uses `handleCapturePageW2W()`.

## Commands

```bash
# Docker — primary
docker compose up -d       # api + web + mongo
docker compose logs -f
docker compose down

# Local dev
pnpm dev:local             # everything via Turborepo
pnpm dev:api               # @w2w/api @ :3002
pnpm dev:web               # @w2w/web @ :5173
pnpm dev:shared            # @w2w/shared watch
pnpm dev:plugin            # figma plugin watch
pnpm dev:extension         # extension watch

# Quality
pnpm build                 # turbo build (respects ^build dependency order)
pnpm test                  # turbo test — shared + api + plugin
pnpm type-check
```

⚠️ `pnpm build` produces a **production** plugin bundle. For local plugin testing
use `npm run watch` inside `packages/figma-plugin`.

## Environment

One root `.env` (see `.env.example`). **Never read the real `.env`.**

```
API_PORT · MONGODB_URI · AUTH_SECRET · SESSION_SECRET
ANTHROPIC_API_KEY · AI_MODEL
RESEND_API_KEY · SUPPORT_TO_EMAIL · NOREPLY_EMAIL
FIGMA_CLIENT_ID · FIGMA_CLIENT_SECRET · FIGMA_REDIRECT_URI
ADMIN_TOKEN · DEV_TOKEN
CORS_ORIGIN · WEBSITE_ALLOWED_ORIGINS
FLITT_MERCHANT_ID · FLITT_SECRET_KEY · FLITT_BASE_URL
```

## Deployment

| Target | Platform | Trigger |
|---|---|---|
| `packages/api` | **Render** | auto-deploy on merge to `main` |
| `packages/web` | **Vercel** | auto-deploy on merge to `main` |
| `packages/figma-plugin` | Figma Community (id `1646327864971730293`) | manual publish |
| `packages/browser-extension` | Chrome Web Store (`fcmicolldgpmpdkcdljkaaimmjmboipl`) | manual zip upload |

There are no GitHub Actions — deploy config lives in the Render/Vercel
dashboards. If `api` and `shared` are untouched, a redeploy rebuilds an identical
API, so nothing breaks.

**Release order when a change spans packages:** merge `dev → main` first (API
deploys), confirm Render is live, *then* publish the plugin and the extension.
The API has no build marker — verify via the Render dashboard or a real import.

## Common integration issues

- **Import never reaches the plugin.** `pendingCDPImports` is in-memory with a
  10-minute TTL and is consumed on first read. It does not survive an API restart.
- **CORS on `/api/*`.** Figma sends `Origin: null` from the plugin iframe; that
  origin must stay allowed.
- **Extension loaded unpacked gets a different ID** → CORS failures. The
  `manifest.json` `key` field pins the ID.
- **Type errors across packages.** `turbo type-check` respects `^build`, so
  `@w2w/shared` must build before its consumers.
- **Figma's iframe has no Web Crypto** — `w2w-codec` falls back to pure JS.

## When to use this agent

Cross-package features · data-flow problems between extension, API and plugin ·
Turborepo/pnpm workspace config · deployment coordination · environment variables
· architecture decisions.
