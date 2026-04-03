# CLAUDE.md

Web2Wireframe - Figma plugin for converting websites to wireframes.

## Tech Stack

| Package | Language | Module | Framework | Build | Test |
|---------|----------|--------|-----------|-------|------|
| packages/shared | TypeScript | CJS+ESM | tsup (library) | tsup | Vitest (Node) |
| packages/api | TypeScript | ESM | Express 4 (unified backend) | tsc | Vitest |
| packages/web | TypeScript | ESM | React 19 + Vite 7 + SSG | vite build + prerender | - |
| packages/figma-plugin | TypeScript | ESM | **Preact** (create-figma-plugin) | build-figma-plugin | Vitest + happy-dom |
| packages/browser-extension | TypeScript | ESM | **Preact** + Vite 5 | vite build | - |

**Node requirement:** >=18.0.0, pnpm >=10.0.0

## Commands

```bash
# Docker (primary — recommended)
docker compose up -d         # API + Web + MongoDB (3 containers)
docker compose down          # Stop all
docker compose logs -f       # Follow logs

# Local dev (alternative)
pnpm dev:local               # All services via Turborepo
pnpm dev:api                 # API @ :3002
pnpm dev:web                 # Website @ :5173
pnpm dev:shared              # @w2w/shared watch
pnpm dev:plugin              # Figma plugin watch
pnpm dev:extension           # Browser extension watch

# Build & test
pnpm build                   # Turbo build (all packages)
pnpm test                    # Turbo test (shared + api + plugin)
pnpm type-check              # TypeScript validation
```

## Architecture

### Data Flow

```
Browser Extension (CDP capture) → API (pendingCDPImports) → Figma Plugin (rendering)
```

### Key Architecture Decisions

- **@w2w/shared** = single source of truth for types + CDP extraction logic (იხილე `packages/shared/src/index.ts`). Both Browser Extension and API implement `CDPClientInterface` (იხილე `packages/shared/src/types.ts`)
- **Unified API** = 3 ძველი backend (Plugin, Website, License) გაერთიანდა ერთ Express app-ში (იხილე `packages/api/src/index.ts`). Router-scoped middleware: Plugin routes (`/api/*`) და Website routes (`/web/*`) სხვადასხვა CORS/session config
- **pendingCDPImports** = in-memory Map (იხილე `packages/api/src/state.ts`), 10-min TTL, consumed on first read
- **MongoDB** = Wireframes, UserSettings, **Licenses** (previously in-memory, now persistent)
- **Authentication** = Plugin: HMAC-SHA256 Bearer tokens; Website: Figma OAuth + express-session
- **State management** = Figma Plugin uses Preact Context + figma.clientStorage; Website uses local useState
- **Wireframe rendering** = recursive node builder (იხილე `packages/figma-plugin/src/rendering/nodes.ts`)
- **SSG** = Website pre-renders 7 pages at build time for SEO (Vite SSR + StaticRouter)

### Packages

| Package | Port | Entry | Docker |
|---------|------|-------|--------|
| packages/shared | - | src/index.ts | - |
| packages/api | 3002 | src/index.ts | api service |
| packages/web | 80 | src/main.tsx | web service (nginx) |
| packages/figma-plugin | - | src/main.ts + src/ui/index.tsx | build-only |
| packages/browser-extension | - | src/background/index.ts | build-only |

### Route Structure (Unified API)

| Prefix | Source | Middleware |
|--------|--------|-----------|
| `/api/*` | Plugin routes (import, CDP, AI, wireframe, settings, auth) | CORS: figma.com + null; Bearer token auth |
| `/api/license/*` | License routes (MongoDB-backed) | Bearer token auth |
| `/web/*` | Website routes (support, session) | CORS: web2wireframe.design; express-session |
| `/auth/figma/*` | Figma OAuth (login, callback) | express-session |

## Workflow Rules

### IMPORTANT: Plan Mode შეხსენება — ყოველი სესიის დასაწყისში

როცა მომხმარებელი კოდის ცვლილებას ითხოვს (ახალი feature, bug fix, refactoring), **სანამ კოდს შეეხები**:

1. შეამოწმე: გაკეთებულია თუ არა Plan?
2. თუ არა — შეახსენე მომხმარებელს:
   - "ჯერ გეგმა არ გაგვიკეთებია. რეკომენდებული ნაბიჯები:"
   - **ნაბიჯი 1:** ფაილების ადგილმდებარეობა — "მოვძებნო რომელ ფაილებშია ეს ლოგიკა?"
   - **ნაბიჯი 2:** გეგმა — "Plan Mode-ით დავგეგმო ცვლილებები?"
3. `AskUserQuestion`-ით შესთავაზე არჩევანი

გამონაკლისი: ერთი ხაზის fix, typo, ან მომხმარებელმა აშკარად თქვა "არ მჭირდება plan".

### IMPORTANT: არ შეცვალო კოდი მომხმარებლის თანხმობის გარეშე

**არასდროს შეცვალო კოდი თავისით.** ყოველთვის:
1. ჯერ აჩვენე რა ცვლილებას აპირებ
2. დაელოდე მომხმარებლის თანხმობას
3. მხოლოდ შემდეგ შეცვალე

### IMPORTANT: არ ატვირთო კოდი GitHub-ზე დადასტურების გარეშე

### IMPORTANT: ყოველთვის მონიშნე Recommended

`AskUserQuestion`-ით კითხვისას **აუცილებლად** მონიშნე რომელია რეკომენდებული ვარიანტი.

### IMPORTANT: Interview Before Coding

ახალი ფიჩერის/ცვლილებისთვის **აუცილებლად** გამოიკითხე მომხმარებელი `AskUserQuestion` tool-ით.

### IMPORTANT: Prompt Quality Check

როცა მომხმარებელი ახალ დავალებას იძლევა, **შეაფასე პრომპტის ხარისხი**: კონკრეტული ფაილები, მკაფიო მოთხოვნა, package-ის იდენტიფიცირება.

### IMPORTANT: TDD — ტესტები იმპლემენტაციამდე

ტესტები **აუცილებლად** უნდა დაიწეროს და დამოწმდეს **იმპლემენტაციამდე**.
გამონაკლისი: one-liner fix, typo, ან მომხმარებელმა აშკარად თქვა "ტესტები არ მჭირდება".

## Code Style

- TypeScript strict mode (no `any`) — ყველა package-ში
- ESM (`import/export`) ყველგან
- Functional components + hooks (React და Preact ორივეში)
- SCSS modules (`*.module.scss`) = packages/web
- CSS modules (`*.css` + `.css.d.ts`) = packages/figma-plugin
- Zod validation = API website routes
- Express error handler middleware = always last in chain
- MongoDB indexes on `userId` fields
- packages/figma-plugin, packages/browser-extension = **Preact** (`import { h } from 'preact'`)
- React = **მხოლოდ** packages/web

## Testing Conventions

- **Framework:** Vitest
- **File naming:** `*.test.ts` / `*.test.tsx`
- **Location:** `src/__tests__/` (shared, figma-plugin) ან `__tests__/` (api)
- **packages/figma-plugin:** happy-dom environment, `@testing-library/preact`
- **packages/shared:** Node environment (no DOM), 600 tests
- **packages/api:** Node environment, supertest for integration, 322 tests
- **Run:** `pnpm test` (turbo test ყველა package-ისთვის)

## Environment Setup

ერთი root `.env` ფაილი (იხილე `.env.example`):

```
API_PORT=3002
MONGODB_URI=mongodb://mongo:27017/web2wireframe
AUTH_SECRET, SESSION_SECRET
ANTHROPIC_API_KEY, AI_MODEL
RESEND_API_KEY, SUPPORT_TO_EMAIL, NOREPLY_EMAIL
FIGMA_CLIENT_ID, FIGMA_CLIENT_SECRET, FIGMA_REDIRECT_URI
ADMIN_TOKEN, DEV_TOKEN
CORS_ORIGIN, WEBSITE_ALLOWED_ORIGINS
```

## Warnings

- **packages/figma-plugin ≠ React!** — Preact-ია, `import { h } from 'preact'` გამოიყენე
- **pendingCDPImports = ephemeral** — 10 min TTL, consumed on first read, not persisted
- **არ შეეხო** @w2w/shared-ის `CDPClientInterface`-ს — ორივე consumer (browser-extension, api) დამოკიდებულია
- **Production domain:** მხოლოდ `api.web2wireframe.design` (license.web2wireframe.design აღარ არსებობს)

### Verification After Changes

```bash
pnpm build && pnpm test
```

### Commits

```
type: short description

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`

## Docker

```yaml
# 3 services:
api:    packages/api (port 3002, Chromium, MongoDB client)
web:    packages/web (nginx, port 80, SSG static files)
mongo:  MongoDB 7 (port 27017, persistent volume)
```

```bash
docker compose up -d          # Production
docker compose -f docker-compose.yml -f docker-compose.dev.yml up  # Dev (hot reload)
```

## External Services

- Resend - Email delivery
- MongoDB - Wireframes, settings, licenses
- Puppeteer - Website rendering (legacy fallback)
- **Chrome DevTools Protocol** - Website capture (primary)

---

## CRITICAL: CDP Extraction Approach

### მიზანი: 1:1 ხარისხიანი ექსტრაქცია (html.to.design დონეზე)

**არასდროს გამოიყენო მხოლოდ `getComputedStyle()`** - ის კარგავს:
- Gradients, CSS Variables, Hover/Focus states, Original CSS rules

### სწორი მიდგომა: Chrome DevTools Protocol (CDP)

```
Browser Extension (CDP)  →  API  →  Figma Plugin
```

#### მთავარი CDP მეთოდები

```typescript
await client.send("CSS.getMatchedStylesForNode", { nodeId });  // Original rules
await client.send("CSS.getComputedStyleForNode", { nodeId });  // Fallback only
await client.send("CSS.getPlatformFontsForNode", { nodeId });
```

#### Browser Extension CDP Location

```
packages/browser-extension/src/background/cdp/
├── client.ts   # chrome.debugger wrapper
├── css.ts      # getMatchedStylesForNode
├── dom.ts      # DOM extraction
├── fonts.ts    # @font-face extraction
└── assets.ts   # Images, SVGs
```

**ყოველთვის CDP გამოიყენე ვებსაიტის capture-ისთვის. Puppeteer მხოლოდ fallback-ად.**
