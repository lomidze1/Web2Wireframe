# CLAUDE.md

Web2Wireframe - Figma plugin for converting websites to wireframes.

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

## Workflow Rules

### IMPORTANT: არ შეცვალო კოდი მომხმარებლის თანხმობის გარეშე

**არასდროს შეცვალო კოდი თავისით.** ყოველთვის:
1. ჯერ აჩვენე რა ცვლილებას აპირებ
2. დაელოდე მომხმარებლის თანხმობას
3. მხოლოდ შემდეგ შეცვალე

ეს ეხება: ახალი ფაილების შექმნას, არსებული კოდის რედაქტირებას, წაშლას, რეფაქტორინგს.
დოკუმენტაციის/README ცვლილებებზეც იკითხე თუ scope დიდია.

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

### Code Style

- TypeScript strict mode (no `any`)
- SCSS modules for React styling
- Zod for API validation
- Express error handler middleware last
- MongoDB indexes on userId fields

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

## Services

| Service | Port | Entry |
|---------|------|-------|
| Website_Frontend | 5173 | src/main.tsx |
| Website_Backend | 3001 | src/index.ts |
| Plugin_Frontend | - | src/main.ts |
| Plugin_Backend | 3002 | api/index.js |
| License_Backend | 3003 | src/index.ts |
| Browser_Extension | - | src/background/index.ts |
| shared-extraction | - | src/index.ts |

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
- MongoDB - Wireframe storage
- Puppeteer - Website rendering (legacy)
- **Chrome DevTools Protocol** - Website capture (primary)

---

## 🚨 CRITICAL: CDP Extraction Approach

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

| ფუნქცია | Puppeteer ❌ | CDP ✅ |
|---------|-------------|--------|
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
await client.send("CSS.getMatchedStylesForNode", { nodeId });  // ✅ Original rules
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
