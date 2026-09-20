# packages/figma-plugin

Figma plugin UI and rendering engine — **Preact** (NOT React) via create-figma-plugin.

## Tech Stack

- **Language:** TypeScript (extends `@create-figma-plugin/tsconfig`)
- **UI Framework:** **Preact** (`/** @jsx h */` pragma) via `@create-figma-plugin/ui`
- **Build:** `build-figma-plugin` (from `@create-figma-plugin/build`)
- **Figma types:** `@figma/plugin-typings 1.109.0`
- **Serialization:** `@msgpack/msgpack` (binary encoding for large data)
- **Styling:** CSS modules (`*.css` + `.css.d.ts` generated type files)
- **Testing:** Vitest + happy-dom + `@testing-library/preact`

## Commands

```bash
npm run build     # build-figma-plugin --typecheck --minify
npm run watch     # build-figma-plugin --typecheck --watch
npm run test      # vitest run
npm run test:watch  # vitest
```

## Architecture — Two Entry Points

### 1. Plugin Sandbox (`src/main.ts`)
Runs in Figma's sandbox. Handles:
- `figma.ui.onmessage` — receives data from UI
- Wireframe rendering via Figma API
- Font loading and fallback flow

### 2. Plugin UI (`src/ui/index.tsx`)
Runs in iframe. Preact app:

```
src/
  main.ts               # Figma sandbox: message handling, rendering orchestration
  types/index.ts        # WireframeNode, RenderContext, all Figma-ready types
  rendering/
    nodes.ts            # createWireframeFrame — recursive node builder (CORE)
    colors.ts           # hex→FigmaRGB
    gradients.ts        # linear, radial, conic gradient parsing
    layout.ts           # CSS flex → Figma auto layout
    fills.ts            # Fills/strokes/effects → Figma paints
    styles.ts           # PaintStyle linking/creation
    text.ts             # TextNode creation
    placeholders.ts     # Image placeholder frames
  utils/
    errorHandler.ts     # ErrorCode enum
    logger.ts           # logger.info/warn/debug
  ui/
    index.tsx           # render(App) entry
    App.tsx             # ConfigProvider wrapper, page/tab routing
    shared/
      ConfigContext.tsx  # Preact context: PluginConfig, figma.clientStorage persistence
      absoluteModeRenderer.ts
      licenseClient.ts
      transformData.ts
    pages/
      import/           # web/, screenshot/, html/, areaSelection/, browserExtension/
      library/          # myLibrary/, community/
    components/
      subHeader/        # Import tab switcher
      footer/           # Settings/Help/Plan
      modalPopup/       # Settings, Help, Purchase, FontFallback, LayoutChoice
    hooks/
      useTabSettings.ts
    styles/
      global.css        # CSS variables (design tokens)
```

## State Management

- `ConfigContext` (Preact context) — global plugin config
- Persisted to `figma.clientStorage`
- `PluginConfig`: viewports, colorMode, fontMode, textMode, pluginColors, pluginFont, showImportOptions, cssVariablesDefault, layoutModeDefault
- Per-tab session overrides via `sessionOverrides` map

## Message Protocol (main.ts ↔ ui)

- `render-wireframe` — trigger creation
- `font-not-available` / `font-fallback-choice` — font fallback
- `render-progress` — progress 0-100%
- `wireframe-created` / `wireframe-error` — completion
- `save-config` / `load-config` / `config-loaded` — settings

## Testing

- **Framework:** Vitest + happy-dom
- **Files:** `src/__tests__/*.test.ts` / `*.test.tsx`
- **Config:** `vitest.config.ts`
- **Existing tests:** colors, fills, gradients, layout, text-segments, text-styles, text-sizing, styles-linking, transform-data, importOptionsModal, settingsPanel, useImportOptionsShortcut, useTabSettings, urlValidation

## License & Payment Integration (Flitt)

**User identity:**
- Plugin sandbox (`main.ts`) reads `figma.currentUser.id` and responds to `get-current-user` with `figma.ui.postMessage({ type: "current-user", data: { userId } })`
- UI stores in `ConfigContext.figmaUserId` → ALL API calls include figmaUserId in body/query
- ✅ Implemented (Phase 0 of payment system).

**API client (`src/ui/shared/licenseClient.ts`):**
- `fetchMyLicense(figmaUserId)` → `GET /api/license/me?figmaUserId=<ID>`
- `createCheckout(figmaUserId)` → `POST /api/checkout/create` → returns `{ checkoutUrl, orderId }`
- `issueCancelToken(figmaUserId)` → `POST /api/auth/issue-cancel-token` → 5-min HMAC token
- License shape: `{ plan, status, cycleStartedAt, cycleEndsAt, usage: { imports, periodStartedAt }, limits: { imports }, subscription, ... }` (limits.imports = `null` for unlimited Pro)

**Limit gates (server-side enforcement):**
- Backend middleware `requireImportAllowance` gates every import endpoint (URL/HTML/Screenshot/CDP/W2W)
- Browser extension capture goes through `/api/import-w2w` (public) → plugin polls `/api/pending-import?figmaUserId=<id>` (gated at consume time, not on every poll)
- On 403 → plugin's `isQuotaExceeded(response)` helper dispatches `w2w:quota-exceeded` event → App.tsx shows `QuotaExceededModal`
- `Get Pro` in modal → opens Plan modal → checkout flow (see web/CLAUDE.md)

**Plan modal (`src/ui/components/modalPopup/planPopup/Plan.tsx`):**
- Shows current plan + monthly usage; for Pro: next billing date and "Manage Subscription" button
- "Get Pro" button → calls `createCheckout` → `window.open(checkoutUrl, "_blank")` → polls `/api/license/me` every 5s for 5min → notifies on plan=pro

**Manage Subscription (Pro only):**
- Plan modal "Manage Subscription" button → calls `issueCancelToken` → opens `https://web2wireframe.design/account?fid=<ID>&t=<token>` in browser
- AUTH_SECRET stays in backend; sandbox doesn't hold prod secrets

**No Flitt SDK in plugin** — all checkout URLs come from backend.

## Dev-Log Bridge (Claude → plugin console)

Figma desktop exposes the plugin console nowhere Claude can read (remote
debugging disabled; renderer `console.*` not piped to stdout). The dev-log
bridge mirrors plugin output to a local receiver Claude tails.

**ჩართვა:** receiver ავტომატურად ეშვება ყოველი სესიის დასაწყისში —
`scripts/devcheck.sh` (SessionStart hook, `.claude/settings.json`), tree-dump
receiver-თან და `npm run watch`-თან ერთად. ხელით გაშვება fallback-ად:

```bash
node packages/figma-plugin/scripts/devlog-server.mjs   # listens on 127.0.0.1:3999
```

შემდეგ მომხმარებელი dev plugin-ით აკეთებს import-ს → ლოგები
`/tmp/w2w-devlog.log`-ში ჩამოდის, საიდანაც Claude კითხულობს
(`tail -f /tmp/w2w-devlog.log`). წინაპირობა: plugin გაშვებულია dev/watch
build-ით (`npm run watch`).

**როგორ მუშაობს:** sandbox (`main.ts`) console/logger → `figma.ui.postMessage`
→ UI iframe → batched `fetch` → `http://localhost:3999/log`. იხ.
`src/utils/devLogger.ts`. `logger.*` (logger.ts) dev-ში console-ში გადის და
bridge იჭერს; prod-ში no-op რჩება.

**🔒 prod-safety (live-ზე ვერ აიტვირთება):**
- gate = `if (__W2W_DEV_LOG__)` — compile-time global (esbuild `define`).
  dev/watch → `true`; `npm run build` (W2W_PROD=1) → `false` → DCE სრულად
  ამოაგდებს bridge-ს bundle-დან (`build-figma-plugin.{main,ui}.cjs`).
- `scripts/build-prod.mjs`-ში post-build grep gate: თუ `__W2W_DEVLOG__` ან
  `localhost:3999` build-ში დარჩა → build **fail**. ე.ი. ფიზიკურად ვერ აიტვირთება.
- `localhost:3999` მხოლოდ `devAllowedDomains`-შია (published plugin იგნორირებს).

## Import Profiler (`src/utils/perf.ts`)

იმპორტის ტაიმინგის ცხრილი — h2d-ის `ue(label, fn)`-ის ანალოგი. **სანამ სიჩქარეზე
იმუშავებ, ჯერ გაზომე** — 2026-08-31-ს სამი სესია `css-converter.ts`-ს ადანაშაულებდა,
გაზომვამ კი აჩვენა, რომ ის იმპორტის 0.03%-ია, ხოლო 73% ერთ გამოტოვებულ
`loadFontAsync`-ის ქეშში იჯდა.

**API:**
```ts
perf.timed(label, fn)            // async ეტაპი
perf.timedSync(label, fn)        // sync ეტაპი
perf.timed(label, fn, true)      // nested — მშობლის შიგნით; TOTAL-ში არ შედის,
                                 //          ცალკე სექციაში ms/call avg-ით
perf.mark(label, ms)             // წინასწარ გაზომილი მონაკვეთი
perf.count(label, n)             // მოცულობა (nodes, frames) — დროის გარეშე
perf.handoff()                   // UI realm → sandbox (label → ms)
perf.report()                    // ფორმატირებული ცხრილი + ცხრილს ასუფთავებს
```

**გამოყენება:** `npm run watch` → `node scripts/devlog-server.mjs` → Figma-ში
plugin-ის სრული reload → იმპორტი. ცხრილი ავტომატურად იბეჭდება იმპორტის ბოლოს და
dev-log bridge-ით ჩამოდის receiver-ის stdout-ში.

**🔒 prod-safety:** იგივე `__W2W_DEV_LOG__` gate, რაც bridge-ს, ოღონდ **ყოველი
call site-იც დაფარულია** (`if (!__W2W_DEV_LOG__) return inner(...)`) — ასე prod
bundle-ში არც label-ის სტრიქონები რჩება და არც ერთი ზედმეტი closure hot path-ზე.
`build-prod.mjs`-ის `FORBIDDEN`-ში `[w2w-perf]` სენტინელია → გაჟონვისას build
**ვარდება**. ⚠️ ახალი ინსტრუმენტაციის დამატებისას **call site-იც დაფარე**, არა
მარტო `perf.ts`-ის შიგნეული.

⚠️ ცხრილის `TOTAL` **ორმაგად ითვლის** — `node.*` ლეიბლები `createWireframeFrame`-ის
შიგნითაა, მაგრამ nested-ად მონიშნული არაა. რეალური ჯამი =
`ui.fetch + ui.bridge + WALL-CLOCK`.

**სერვერის მხარე:** `packages/api`-ს თავისი აქვს — `[W2W-PERF] <stage> <ms>`
(`src/utils/stageTimer.ts`), `docker compose logs api`-ში. `console.log`-ზეა,
რომელსაც `consoleGating.ts` production-ში ისედაც აჩუმებს.

## Warnings

- **Preact, NOT React!** — `import { h } from 'preact'`, არა `import React`
- JSX pragma: `/** @jsx h */` required in `.tsx` files
- `rendering/nodes.ts` = ყველაზე კრიტიკული ფაილი, ძალიან ფრთხილად
- Two separate execution contexts: sandbox (main.ts) and iframe (ui/)
- Network access configured in `package.json` figma-plugin section
- **Plugin never calls Flitt API directly** — all payment/checkout flows go through `packages/api` backend
- **Hardcoded `localhost:3002` and `DEV_TOKEN`** in licenseClient.ts and other API callers — needs migration to env-based config before payment integration
