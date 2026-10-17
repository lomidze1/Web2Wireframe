# packages/web

Marketing website for Web2Wireframe — React 19 + Vite 7 + TypeScript.

## Tech Stack

- **Framework:** React 19 + React DOM
- **Router:** react-router-dom v7
- **Build:** Vite 7 with `@vitejs/plugin-react`
- **Styling:** SCSS modules (`*.module.scss` per component)
- **State:** Local `useState`/`useEffect` only (no state management library)
- **Module:** ESM

## Commands

```bash
npm run dev       # Vite dev server @ :5173
npm run build     # Production build
npm run preview   # Preview production build
```

## Architecture

```
src/
  main.tsx               # Entry: createRoot, StrictMode
  App.tsx                # BrowserRouter, Routes, layout (Header + Footer)
  components/            # Header.tsx, Footer.tsx (+ *.module.scss)
  pages/
    Home/
    HowItWorks/
    Pricing/
    Checkout/            # CheckoutSuccess + CheckoutCancel (no checkout entry — flow starts in plugin)
    Account/             # Manage subscription page (cancel-only at launch)
    Docs/                # Complex: sidebar, breadcrumb, search, 30+ sub-pages
    Support/
    Terms&conditions/
    Privacy/
  styles/
    global.scss          # Global styles
  data/
    links.ts             # Shared navigation links
  assets/                # PNG images by category
```

## Patterns

- Page folder structure: `PageName.tsx` + `PageName.module.scss`
- `Docs/` is the most complex page: `DocsLayout`, `DoksSidebar`, `DocsRightNav`, `DocsBreadcrumb`
- Docs content driven by `docsStructure.ts` and `docsSearchIndex.ts`
- `ScrollToTop` component for route navigation

## Style

- SCSS modules everywhere — `import styles from './Component.module.scss'`
- Global styles in `src/styles/global.scss`
- No inline styles

## Payment Flow (Flitt)

**Plans:** Free (3 imports/month — ექსპერიმენტი 2026-10-17 → 2026-11-16, იყო 10) · Pro $16/month · USD only · no VAT collected at launch.

**Checkout flow** — Pro upgrade starts INSIDE the plugin (needs `figma.currentUser.id`):
1. Plugin sandbox emits `current-user` → UI knows `figmaUserId`
2. User clicks "Get Pro" in Plan modal → UI calls `POST /api/checkout/create` with `figmaUserId`
3. Backend signs Flitt request, returns `checkoutUrl` (pay.flitt.com)
4. UI opens `checkoutUrl` in new browser tab and starts polling `/api/license/me` every 5s
5. User completes payment on Flitt → Flitt redirects browser to `/checkout/success` AND POSTs server-callback to `/api/webhooks/flitt`
6. Webhook handler activates the Pro license; polling detects the change → toast in plugin

**Cancel flow** — initiated from plugin, completed on website:
1. Plugin "Manage Subscription" → calls `POST /api/auth/issue-cancel-token` (5-min HMAC token)
2. UI opens `https://web2wireframe.design/account?fid=<id>&t=<token>` in new tab
3. Account page reads license, shows "Cancel" button → `POST /api/subscription/cancel { figmaUserId, token }`
4. Backend verifies HMAC + calls `Flitt.SubscriptionActions stop` → sets `status=canceled`; plan stays `pro` until `cycleEndsAt` (lazy downgrade)

**No payment SDK on frontend** — all Flitt API calls happen server-side (`packages/api`). Frontend never sees secret_key.

**`checkoutLinks` in `src/data/links.ts`:** Pricing page CTAs deep-link to the Figma Community plugin listing (checkout requires `figmaUserId`, only available inside the plugin).

## Warnings

- ეს არის **React** (არა Preact, როგორც `packages/figma-plugin`)
- Docs/ folder ძალიან კომპლექსურია — ფრთხილად ცვლილებებთან
- Environment variables: `VITE_API_URL` (already exists), `VITE_CHECKOUT_BASE` if needed
- No test framework configured
- **Flitt checkout link generation lives on backend** — frontend just opens `checkoutUrl` returned by API. NEVER call Flitt directly from browser.
- **Privacy/Terms pages must mention Flitt** when payment system goes live (PCI-DSS Level 1, no card data on our servers)
