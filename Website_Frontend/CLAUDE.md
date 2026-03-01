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

## Warnings

- ეს არის **React** (არა Preact, როგორც Plugin_Frontend)
- Docs/ folder ძალიან კომპლექსურია — ფრთხილად ცვლილებებთან
- No environment variables needed (static site)
- No test framework configured
