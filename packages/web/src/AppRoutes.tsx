import type { ReactElement } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home/Home";
import HowItWorks from "./pages/HowItWorks/HowItWorks";
import Pricing from "./pages/Pricing/Pricing";
import Docs from "./pages/Docs/Docs";
import Support from "./pages/Support/Support";
import Terms from "./pages/Terms&conditions/Terms";
import Privacy from "./pages/Privacy/Privacy";

/** All routes for SSG prerendering */
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
    </Routes>
  );
}
