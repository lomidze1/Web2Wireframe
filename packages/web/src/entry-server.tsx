import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AppRoutes, { staticRoutes } from "./AppRoutes";
import { AuthProvider } from "./contexts/AuthContext";

export function render(url: string): string {
  return renderToString(
    <AuthProvider>
      <StaticRouter location={url}>
        {/* P5-A11Y-2: skip-to-content link + #main anchor must exist in the
            pre-hydration HTML (what Googlebot + pre-JS keyboard users see).
            Previously only `App.tsx` carried them — that file is never used
            by SSG, so the SSG output silently failed WCAG 2.4.1 even
            though the live-after-hydration page passed. Mirroring the
            structure here keeps the two sources of truth in sync. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <div className="appShell">
          <Header />
          <main id="main" className="main">
            <AppRoutes />
          </main>
          <Footer />
        </div>
      </StaticRouter>
    </AuthProvider>,
  );
}

export { staticRoutes };
