import type { ReactElement } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home/Home";
import HowItWorks from "./pages/HowItWorks/HowItWorks";
import Docs from "./pages/Docs/Docs";
import Support from "./pages/Support/Support";
import Terms from "./pages/Terms&conditions/Terms";
import Privacy from "./pages/Privacy/Privacy";
import LandingPage from "./pages/Landing/LandingPage";
import Go from "./pages/Go/Go";
import A11yFix, { A11Y_FIX_THANKS_PATH } from "./pages/A11yFix/A11yFix";
import { landingPages } from "./pages/Landing/landingData";
import { docsNavigation } from "./pages/Docs/data/docsStructure";

/**
 * All routes for SSG prerendering.
 *
 * S-C3: docs sub-routes were previously listed in sitemap.xml but NOT
 * prerendered, so Googlebot saw an empty SPA shell with the home page's
 * title on every one of them (Critical SEO issue). We now flatten
 * `docsNavigation` from the docs structure module so the sitemap + the
 * prerender list always agree, and adding a new docs page only requires
 * editing the docs structure file.
 */
const docsStaticRoutes = docsNavigation.flatMap((topic) =>
  topic.pages.map((page) => `/docs/${topic.id}/${page.path}`),
);

export const staticRoutes = [
  "/",
  "/how-it-works",
  ...landingPages.map((page) => page.slug),
  "/docs",
  "/support",
  "/terms",
  "/privacy",
  ...docsStaticRoutes,
];

export default function AppRoutes(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      {landingPages.map((page) => (
        <Route
          key={page.slug}
          path={page.slug}
          element={<LandingPage content={page} />}
        />
      ))}
      <Route path="/docs/*" element={<Docs />} />
      <Route path="/support" element={<Support />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      {/* Fake door for the plugin's contrast fix — static paths outrank :source. */}
      <Route path="/go/a11y-fix" element={<A11yFix />} />
      <Route path={A11Y_FIX_THANKS_PATH} element={<A11yFix submitted />} />
      <Route path="/go/:source" element={<Go />} />
    </Routes>
  );
}
