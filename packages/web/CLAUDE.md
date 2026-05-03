# Website_Frontend

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
    Checkout/            # (TBD) Flitt checkout entry, Success, Cancel
    Account/             # (TBD) Manage subscription, view usage, cancel
    Credits/             # (TBD) Buy Credit Packs (Pro plan only)
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

**Checkout entry points:**
- Plugin → opens `/checkout?plan=plus&fid=<figmaUserId>` for subscription
- Plugin → opens `/credits?fid=<figmaUserId>&pack=small` for one-time Credit Pack
- Plugin → opens `/account?fid=<figmaUserId>&t=<signedToken>` for Manage Subscription

**Frontend responsibilities:**
- Validate query params, display product summary
- Call API `POST /api/checkout/create` (or `/api/checkout/credits`) → receive `checkoutUrl`
- Redirect user to Flitt-hosted checkout page (`pay.flitt.com/...`)
- On return: Success/Cancel pages display result, suggest closing tab to return to plugin

**No payment SDK on frontend** — all Flitt API calls happen server-side (`packages/api`). Frontend never sees secret_key.

**`checkoutLinks` in `src/data/links.ts`:** old Pricing page links (currently `"#"`). Replace with route-based links: `/checkout?plan=plus`, etc.

## Warnings

- ეს არის **React** (არა Preact, როგორც Plugin_Frontend)
- Docs/ folder ძალიან კომპლექსურია — ფრთხილად ცვლილებებთან
- Environment variables: `VITE_API_URL` (already exists), `VITE_CHECKOUT_BASE` if needed
- No test framework configured
- **Flitt checkout link generation lives on backend** — frontend just opens `checkoutUrl` returned by API. NEVER call Flitt directly from browser.
- **Privacy/Terms pages must mention Flitt** when payment system goes live (PCI-DSS Level 1, no card data on our servers)
