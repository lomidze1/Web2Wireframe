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
Browser Extension (Content Script primary + CDP for specific tasks)
  → API (pendingCDPImports) via POST /api/import-w2w
  → Figma Plugin (rendering)
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
| `/api/checkout/*` | Flitt checkout creation (subscriptions + Credit Packs) | Public (validated by figmaUserId in body) |
| `/api/webhooks/flitt` | Flitt server callback (signature-verified) | Public, SHA1 signature check |
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

### IMPORTANT: Pre-Launch Checklist

როცა owner-ი ახალ სესიაში გეკითხება "გამოქვეყნებამდე რა დამრჩა გასაკეთებელი"
(ან მსგავსს — "launch-მდე რა მჭირდება", "what's left before launch"),
**აუცილებლად წაიკითხე** `docs/PRE-LAUNCH-CHECKLIST.md` და მისი მიხედვით უპასუხე.

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
FLITT_MERCHANT_ID, FLITT_SECRET_KEY, FLITT_BASE_URL
```

## Payment System (Flitt)

**Provider:** Flitt (Georgia/CIS PCI-DSS Level 1 gateway). **მხოლოდ Flitt** — Stripe/Paddle/LemonSqueezy/Polar **არასოდეს** ვახსენოთ კოდში ან დოკუმენტაციაში.

### Plans (Single-tier launch — June 16, 2026)

| Plan | Imports | ფასი (USD) |
|------|---------|-----------|
| Free | 10 / month | $0 |
| Pro | unlimited | $16 / month |

**Pricing rationale:**
- $16 covers Flitt's 4% commission (net ≈ $15.36) — round whole-dollar pricing for simplicity
- USD only globally; **EU VAT NOT collected at launch** (Terms disclaimer + non-EU seller posture); revisit at ~$30K/year EU revenue
- **No refunds**, cancel-anytime; cancellation = end-of-period (Pro until cycleEndsAt, then Free)
- **No trial** — Free tier IS the trial (10 imports/month forever)
- **Quota-exceeded UX:** hard block + upgrade modal on 11th import attempt

**Counter rules:**
- Imports counter = URL + Screenshot + HTML + Browser Extension capture
- Screenshot import counts as a regular import (uses Anthropic AI internally, but billed as 1 import)
- Counters reset monthly via **lazy reset** (no cron; on every license read, if `now >= cycleEndsAt` → reset)
- AI Generation tab does **not** exist in launch — code is on `ai-generation-backup` branch

### User Identity
- **NO registration, NO login**
- Plugin reads `figma.currentUser.id` (Figma SDK) → primary key for License
- Email collected at Flitt checkout (receipts/recovery only)

### Recurring Billing
- Native Flitt subscriptions (`subscription: "Y"` + `recurring_data`)
- **Flitt charges automatically** — no custom cron for charging
- Cancel via Flitt API: `SubscriptionActions({ order_id, action: "stop" })`
- Webhook = source of truth for license status

### Currency
- **USD** primary (Flitt supports USD/GEL/EUR)

### Implementation reference
- Strategy: [docs/decisions/LAUNCH-STRATEGY-2026.md](docs/decisions/LAUNCH-STRATEGY-2026.md)
- Plan: [docs/plans/PAYMENT-SYSTEM.md](docs/plans/PAYMENT-SYSTEM.md) (single-tier $16, finalized 2026-05-04)
- Flitt API ref: see auto-memory `reference_flitt-api.md`

## Warnings

- **packages/figma-plugin ≠ React!** — Preact-ია, `import { h } from 'preact'` გამოიყენე
- **pendingCDPImports = ephemeral** — 10 min TTL, consumed on first read, not persisted
- **არ შეეხო** @w2w/shared-ის `CDPClientInterface`-ს — ორივე consumer (browser-extension, api) დამოკიდებულია
- **Production domain:** მხოლოდ `api.web2wireframe.design` (license.web2wireframe.design აღარ არსებობს)
- **Payment provider = Flitt only** — Stripe/Paddle/LemonSqueezy/Polar/Chargebee **არასოდეს** ვახსენოთ. თუ ძველ კოდს იხილავ მათი ხსენებით, წაშალე
- **Card data არასოდეს ხვდება ჩვენთან** — Flitt PCI-compliant. rectoken-საც კი არ ვინახავთ (Flitt ფლობს subscription-ს)
- **Webhook signature verification აუცილებელია** — `/api/webhooks/flitt` ყოველთვის ამოწმოს SHA1 signature

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
- Puppeteer - Website rendering (API-side legacy fallback only — not used by Browser Extension)
- **Content Script + Chrome DevTools Protocol** - Website capture (hybrid; see CRITICAL section below)
- **Flitt** - Payment gateway (subscriptions + one-time Credit Packs); see Payment System section

---

## CRITICAL: Hybrid Extraction Approach (Content Script + CDP)

### მიზანი: 1:1 ხარისხიანი ექსტრაქცია (html.to.design დონეზე)

**არქიტექტურა არის ჰიბრიდული** — content script primary, CDP კონკრეტული ამოცანებისთვის რომლებიც content script-ში ტექნიკურად შეუძლებელია.

### Primary: Content Script (DOM ექსტრაქციის უმეტესობა)

```
ფაილი: packages/browser-extension/src/content/extractor.ts
```

რას აკეთებს `extractPage()`:
- DOM tree traversal (recursive `<html>`-დან)
- 70+ CSS property `getComputedStyle()`-ით
- Geometry: `getBoundingClientRect()`
- Text content + line-breaking via `Range.getClientRects()`
- Pseudo-elements (`::before`, `::after`) — DOM injection ხერხით
- SVG markup inlining

### Secondary: CDP (კონკრეტული ამოცანებისთვის — გამართლებული)

CDP გამოიყენება **მხოლოდ იქ სადაც content script ვერ მოახერხებს**:

| CDP API | რისთვის | რატომ ვერ აკეთებს content script |
|---------|---------|-----------------------------------|
| `Emulation.setDeviceMetricsOverride` + `Page.reload` | Multi-viewport capture | Content script ფიქსირებულ viewport-შია |
| `Page.getLayoutMetrics` | Scrollbar compensation | `window.innerWidth` არ ითვლის scrollbar offset-ს |
| `CSS.getPlatformFontsForNode` | რეალურად დარენდერებული ფონტი | `getComputedStyle().fontFamily` მხოლოდ CSS request-ს აბრუნებს, არა fallback-ის შემდგომ რეალურ ფონტს |
| `CSS.forcePseudoState` | `:hover` state capture | Content script ვერ აიძულებს pseudo-class-ს |
| `CSS.getStyleSheetText` | Cross-origin stylesheet-ების კითხვა | CORS ბლოკავს content script-ის `cssRules` წვდომას |
| `Page.getResourceContent` | Font binary file-ების ამოღება cache-დან | CORS ბლოკავს fetch-ს page context-დან |
| `extractCSSVariables` (CDP-based) | CSS custom properties enum-ი | Per-element iteration ნაცვლად global scope |

### Data Flow

```
1. User clicks "Capture" → popup sends CAPTURE_PAGE_W2W
2. Service Worker (CDP): Emulation.setDeviceMetricsOverride + Page.reload (per viewport)
3. Content Script: extractPage() — full DOM + styles + geometry
4. Service Worker (CDP): CSS.getPlatformFontsForNode for each text element (data-w2w-idx tagged)
5. Service Worker (CDP): CSS.forcePseudoState for hover capture
6. Service Worker (CDP): font binaries + CSS variables + assets
7. Result: POST /api/import-w2w (NOT /api/import-cdp)
```

### Browser Extension Code Layout

```
packages/browser-extension/src/
├── background/
│   ├── index.ts          # Service worker: handleCapturePageW2W() — orchestrates content script + CDP
│   └── cdp/
│       ├── client.ts     # chrome.debugger wrapper (CDPClient class)
│       ├── css.ts        # CSS-related CDP helpers
│       ├── dom.ts        # DOM-related CDP helpers
│       ├── fonts.ts      # @font-face + binary extraction
│       └── assets.ts     # Image/SVG resource extraction from cache
└── content/
    ├── index.ts          # Message handler (EXTRACT_DOM, EXTRACT_SUBTREE, COLLECT_HOVER_SELECTORS, FETCH_FONT_DATA)
    ├── extractor.ts      # CORE: extractPage() — DOM traversal (1300+ lines)
    └── hover-parser.ts   # Local hover selector parser (no @w2w/shared import)
```

### Legacy CDP-Only Mode (DO NOT USE)

ძველი `handleCapturePage()` ფუნქცია (CDP-only, DOMSnapshot-based) ფიზიკურად კოდშია, მაგრამ **dead code-ია** — popup UI-დან მიუწვდომელია. შენახულია მხოლოდ `old-branch`-ზე შედარებისთვის. **ახალი კოდი ყოველთვის `handleCapturePageW2W()`-ს იყენებს.**

---

## General LLM Coding Philosophy

ზოგადი ქცევითი წესები (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) იხილე გლობალურ `~/.claude/CLAUDE.md`-ში — Karpathy-inspired guidelines. ეს ფაილი ავტომატურად ჩაიტვირთება ყველა conversation-ში და ავსებს ამ პროექტის წესებს.
