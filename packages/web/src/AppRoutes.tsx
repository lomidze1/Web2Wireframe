import type { ReactElement } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home/Home";
import HowItWorks from "./pages/HowItWorks/HowItWorks";
import Pricing from "./pages/Pricing/Pricing";
import Docs from "./pages/Docs/Docs";
import Support from "./pages/Support/Support";
import Terms from "./pages/Terms&conditions/Terms";
import Privacy from "./pages/Privacy/Privacy";
import CheckoutSuccess from "./pages/Checkout/CheckoutSuccess";
import CheckoutCancel from "./pages/Checkout/CheckoutCancel";
import CheckoutPage from "./pages/Checkout/CheckoutPage";
import Account from "./pages/Account/Account";
import Signin from "./pages/Signin/Signin";
import Renew from "./pages/Renew/Renew";
import LandingPage from "./pages/Landing/LandingPage";
import Go from "./pages/Go/Go";
import { landingPages } from "./pages/Landing/landingData";
import { docsNavigation } from "./pages/Docs/data/docsStructure";

/**
 * All routes for SSG prerendering. Checkout/Account/Renew are dynamic and
 * intentionally excluded — they're query-param-driven and require runtime
 * state, so prerendering provides no benefit.
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
  "/pricing",
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
      <Route path="/pricing" element={<Pricing />} />
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
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="/checkout/cancel" element={<CheckoutCancel />} />
      <Route path="/account" element={<Account />} />
      <Route path="/signin" element={<Signin />} />
      <Route path="/renew" element={<Renew />} />
      <Route path="/go/:source" element={<Go />} />
    </Routes>
  );
}
