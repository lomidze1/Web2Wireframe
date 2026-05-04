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
import Account from "./pages/Account/Account";

/** All routes for SSG prerendering. Checkout/Account are dynamic and
 * intentionally excluded — they're query-param-driven and require
 * runtime state, so prerendering provides no benefit. */
export const staticRoutes = [
  "/",
  "/how-it-works",
  "/pricing",
  "/docs",
  "/support",
  "/terms",
  "/privacy",
];

export default function AppRoutes(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/docs/*" element={<Docs />} />
      <Route path="/support" element={<Support />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="/checkout/cancel" element={<CheckoutCancel />} />
      <Route path="/account" element={<Account />} />
    </Routes>
  );
}
