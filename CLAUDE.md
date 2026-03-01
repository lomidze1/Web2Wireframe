# CLAUDE.md

Web2Wireframe - Figma plugin for converting websites to wireframes.

## Tech Stack

| Service | Language | Module | Framework | Build | Test |
|---------|----------|--------|-----------|-------|------|
| Website_Frontend | TypeScript | ESM | React 19 + Vite 7 | vite build | - |
| Website_Backend | TypeScript | ESM | Express 4 | tsc | - |
| Plugin_Frontend | TypeScript | ESM | **Preact** (create-figma-plugin) | build-figma-plugin | Vitest + happy-dom |
| Plugin_Backend | **JavaScript** | **CommonJS** | Express 4 | - | - |
| License_Backend | TypeScript | ESM | Express 4 | tsc | - |
| Browser_Extension | TypeScript | ESM | **Preact** + Vite 5 | vite build | - |
| shared-extraction | TypeScript | CJS+ESM | tsup (library) | tsup | Vitest (Node) |

**Node requirement:** >=18.0.0, npm >=9.0.0

## Commands

```bash
npm run dev              # All services concurrently
npm run dev:frontend     # Website @ :5173
npm run dev:backend      # Website_Backend @ :3001
npm run dev:plugin-backend  # Plugin_Backend @ :3002
npm run dev:plugin       # Figma plugin watch
npm run dev:extension    # Browser_Extension watch
npm run dev:shared       # shared-extraction watch

npm run build:all        # Build everything
npm run type-check       # TypeScript validation
npm run lint             # ESLint check
```

## Architecture

### Data Flow

```
Browser_Extension (CDP capture) → Plugin_Backend (pendingCDPImports) → Plugin_Frontend (Figma rendering)
```

### Key Architecture Decisions

- **shared-extraction** = single source of truth for CDP extraction logic (იხილე `shared-extraction/src/index.ts`). Both Browser_Extension and Plugin_Backend implement `CDPClientInterface` (იხილე `shared-extraction/src/types.ts`)
- **pendingCDPImports** = in-memory Map in Plugin_Backend (იხილე `Plugin_Backend/api/index.js`), 10-min TTL, consumed on first read
- **MongoDB** = only Plugin_Backend (იხილე `Plugin_Backend/models/`), optional (app degrades gracefully without it)
- **License_Backend** = in-memory Map, no database (იხილე `License_Backend/src/index.ts`), restart = data loss
- **Authentication** = Figma OAuth, session-based via express-session (იხილე `Website_Backend/src/routes/figmaAuth.ts`)
- **State management** = Plugin_Frontend uses Preact Context + figma.clientStorage (იხილე `Plugin_Frontend/src/ui/shared/ConfigContext.tsx`); Website_Frontend uses local useState only
- **Wireframe rendering** = recursive node builder (იხილე `Plugin_Frontend/src/rendering/nodes.ts`)

### Services

| Service | Port | Entry |
|---------|------|-------|
| Website_Frontend | 5173 | src/main.tsx |
| Website_Backend | 3001 | src/index.ts |
| Plugin_Frontend | - | src/main.ts (sandbox) + src/ui/index.tsx (UI) |
| Plugin_Backend | 3002 | api/index.js |
| License_Backend | 3003 | src/index.ts |
| Browser_Extension | - | src/background/index.ts |
| shared-extraction | - | src/index.ts |

## Workflow Rules

### IMPORTANT: Plan Mode შეხსენება — ყოველი სესიის დასაწყისში

როცა მომხმარებელი კოდის ცვლილებას ითხოვს (ახალი feature, bug fix, refactoring), **სანამ კოდს შეეხები**:

1. შეამოწმე: გაკეთებულია თუ არა Plan?
2. თუ არა — შეახსენე მომხმარებელს:
   - "ჯერ გეგმა არ გაგვიკეთებია. რეკომენდებული ნაბიჯები:"
   - **ნაბიჯი 1:** ფაილების ადგილმდებარეობა — "მოვძებნო რომელ ფაილებშია ეს ლოგიკა?"
   - **ნაბიჯი 2:** გეგმა — "Plan Mode-ით დავგეგმო ცვლილებები?"
   - შემდეგ ჰკითხე: "ამის მიუხედავად მაინც გინდა პირდაპირ ცვლილება დავიწყო?"
3. `AskUserQuestion`-ით შესთავაზე არჩევანი:
   - Plan Mode (Recommended) — ჯერ მოვძებნო ფაილები, შემდეგ დავგეგმო
   - პირდაპირ დაწყება — Plan-ის გარეშე პირდაპირ ცვლილებებზე გადავიდე

ეს წესი მოქმედებს **ყოველ ახალ სესიაზე**, თუნდაც მომხმარებელმა წინა სესიაში Plan გააკეთა.
გამონაკლისი: ერთი ხაზის fix, typo, ან მომხმარებელმა აშკარად თქვა "არ მჭირდება plan".

### IMPORTANT: არ შეცვალო კოდი მომხმარებლის თანხმობის გარეშე

**არასდროს შეცვალო კოდი თავისით.** ყოველთვის:
1. ჯერ აჩვენე რა ცვლილებას აპირებ
2. დაელოდე მომხმარებლის თანხმობას
3. მხოლოდ შემდეგ შეცვალე

ეს ეხება: ახალი ფაილების შექმნას, არსებული კოდის რედაქტირებას, წაშლას, რეფაქტორინგს.
დოკუმენტაციის/README ცვლილებებზეც იკითხე თუ scope დიდია.

### IMPORTANT: არ ატვირთო კოდი GitHub-ზე დადასტურების გარეშე

**არასდროს გააკეთო git push მომხმარებლის დადასტურების გარეშე.** კოდის დაწერის შემდეგ:
1. დაელოდე მომხმარებელს რომ შეამოწმოს
2. მხოლოდ მომხმარებლის ბრძანებით ატვირთე (commit + push)
3. არასდროს გააკეთო push თავისით, თუნდაც feature მზად იყოს

### IMPORTANT: ყოველთვის მონიშნე Recommended

`AskUserQuestion`-ით კითხვისას **აუცილებლად** მონიშნე რომელია რეკომენდებული ვარიანტი:
- პირველ ვარიანტად დააყენე recommended
- label-ში დაამატე `(Recommended)` ბოლოში
- description-ში მოკლედ ახსენი რატომ არის რეკომენდებული

### IMPORTANT: Interview Before Coding

ახალი ფიჩერის/ცვლილებისთვის **აუცილებლად** გამოიკითხე მომხმარებელი `AskUserQuestion` tool-ით:
- რა არის მოთხოვნა?
- რომელ სერვისში?
- Edge cases?
- როგორ დავტესტოთ?

არასდროს გამოიცანო requirements - დააზუსტე!

### IMPORTANT: Tests and Rebuild After Feature Implementation

ახალი ფუნქციის/feature-ის იმპლემენტაციის შემდეგ **აუცილებლად**:
1. დაწერე ტესტები ახალი ფუნქციონალისთვის
2. გაუშვი ტესტები და დარწმუნდი რომ გადის
3. გააკეთე rebuild (`npm run build:all`)

არასდროს ჩათვალო feature მზად ტესტებისა და rebuild-ის გარეშე.

## Code Style

- TypeScript strict mode (no `any`) — ყველა სერვისში გარდა Plugin_Backend
- ESM (`import/export`) ყველგან, **გარდა Plugin_Backend** (`require/module.exports`)
- Functional components + hooks (React და Preact ორივეში)
- SCSS modules (`*.module.scss`) = Website_Frontend
- CSS modules (`*.css` + `.css.d.ts`) = Plugin_Frontend
- Zod validation = Website_Backend API routes
- Express error handler middleware = always last in chain
- MongoDB indexes on `userId` fields
- Plugin_Frontend/Browser_Extension = **Preact** (`/** @jsx h */` pragma, `import { h } from 'preact'`)
- React = **მხოლოდ** Website_Frontend

## Testing Conventions

- **Framework:** Vitest (Plugin_Frontend + shared-extraction)
- **File naming:** `*.test.ts` / `*.test.tsx`
- **Location:** `src/__tests__/` directory
- **Plugin_Frontend:** happy-dom environment, `@testing-library/preact`
- **shared-extraction:** Node environment (no DOM)
- **Run:** `vitest run` (one-shot) / `vitest` (watch)
- **Root test:** `npm run test` არ არსებობს — ტესტები per-service გაუშვი:
  - `cd Plugin_Frontend && npx vitest run`
  - `cd shared-extraction && npx vitest run`
- სხვა სერვისებს ტესტები ჯერ არ აქვს

## Environment Setup

`.env.example` ფაილები არსებობს: Website_Backend, Plugin_Backend, License_Backend

**სავალდებულო env vars:**
- Website_Backend: `SESSION_SECRET`, `RESEND_API_KEY`, `FIGMA_CLIENT_ID`, `FIGMA_CLIENT_SECRET`
- Plugin_Backend: `MONGODB_URI` (optional), `API_PORT=3002`
- License_Backend: `PORT=3003`, `DEV_TOKEN`, `ADMIN_TOKEN`

## Warnings

- **Plugin_Frontend ≠ React!** — Preact-ია, `import { h } from 'preact'` გამოიყენე, არა `import React`
- **Plugin_Backend = JavaScript/CommonJS** — `require()` / `module.exports`, არა `import/export`
- **License_Backend restart = data loss** — in-memory storage, არა database
- **pendingCDPImports = ephemeral** — 10 min TTL, consumed on first read, not persisted
- **არ შეეხო** shared-extraction-ის `CDPClientInterface`-ს API-ის შეცვლის გარეშე — ორივე consumer (Browser_Extension, Plugin_Backend) დამოკიდებულია

### Verification After Changes

```bash
npm run type-check && npm run lint
```

### Commits

```
type: short description

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`

## Skills Available

- `/interview-me` - Requirements gathering
- `/code-review` - Quality check
- `/deploy-check` - Pre-deployment validation
- `/fix-issue [#]` - GitHub issue workflow
- `/new-feature` - Feature implementation

## Agents Available

See `.claude/agents/` for specialized agents:
- `website-frontend` - React/Vite/SCSS
- `backend-typescript` - Express/Zod
- `figma-plugin` - Figma API
- `browser-extension` - Chrome Extension/CDP
- `figma-api-guide` - CSS→Figma transformations
- `database-mongodb` - Mongoose
- `web-scraping` - Puppeteer/Cheerio (fallback)
- `fullstack-integration` - Cross-service

## External Services

- Resend - Email delivery
- MongoDB - Wireframe storage (Plugin_Backend only, optional)
- Puppeteer - Website rendering (legacy fallback)
- **Chrome DevTools Protocol** - Website capture (primary)

---

## CRITICAL: CDP Extraction Approach

### მიზანი: 1:1 ხარისხიანი ექსტრაქცია (html.to.design დონეზე)

**არასდროს გამოიყენო მხოლოდ `getComputedStyle()`** - ის კარგავს:
- Gradients (ხდება solid color)
- CSS Variables (მხოლოდ resolved value)
- Hover/Focus states
- Original CSS rules

### სწორი მიდგომა: Chrome DevTools Protocol (CDP)

```
Browser_Extension (CDP)  →  Plugin_Backend  →  Figma Plugin
```

#### CDP vs Puppeteer

| ფუნქცია | Puppeteer | CDP |
|---------|-----------|-----|
| Styles | `getComputedStyle()` | `CSS.getMatchedStylesForNode` |
| Gradients | იკარგება | ინახება original |
| CSS Variables | resolved only | `var(--name)` + resolved |
| Hover states | ვერ | pseudo-class rules |
| Fonts | family name | @font-face + files |
| Private pages | ვერ | user session |

#### მთავარი CDP მეთოდები

```typescript
// DOM
await client.send("DOM.getDocument", { depth: -1, pierce: true });
await client.send("DOM.getBoxModel", { nodeId });

// CSS - KEY DIFFERENCE!
await client.send("CSS.getMatchedStylesForNode", { nodeId });  // Original rules
await client.send("CSS.getComputedStyleForNode", { nodeId });  // Fallback only

// Fonts
await client.send("CSS.getPlatformFontsForNode", { nodeId });
```

#### Browser Extension Location

```
Browser_Extension/
├── src/background/cdp/
│   ├── client.ts   # chrome.debugger wrapper
│   ├── css.ts      # getMatchedStylesForNode (!)
│   ├── dom.ts      # DOM extraction
│   ├── fonts.ts    # @font-face extraction
│   └── assets.ts   # Images, SVGs
```

#### Plugin_Backend Endpoint

`POST /api/import-cdp` - მიიღებს CDP-ფორმატის data-ს

### წესი

**ყოველთვის CDP გამოიყენე ვებსაიტის capture-ისთვის. Puppeteer მხოლოდ fallback-ად.**
