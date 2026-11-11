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

## Free product (since 2026-11-07)

Web2Wireframe is **free**: no plans, no Pro, no checkout, no donate. The `/pricing` page was
removed 2026-11-11; `vercel.json` 308-redirects `/pricing` to `/` (old plugin/extension Help links). Checkout, Account, Signin and
Renew pages + website login (AuthContext) were removed 2026-11-09; `vercel.json` 301-redirects
their old URLs. `src/freeMode.test.tsx` renders every prerendered page and fails on any price,
"Pro", checkout, Flitt or screenshot copy. Plan: `docs/plans/WEB-free-update.md`.

## Warnings

- ეს არის **React** (არა Preact, როგორც `packages/figma-plugin`)
- Docs/ folder ძალიან კომპლექსურია — ფრთხილად ცვლილებებთან
- Environment variables: `VITE_API_URL`
- Tests: Vitest (`npm test`)
