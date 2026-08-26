import type { SeoConfig } from "./types";
import { SITE_URL } from "./types";
import {
  organizationSchema,
  softwareApplicationSchema,
  productSchema,
  breadcrumbSchema,
  faqSchema,
  websiteSchema,
} from "./schemas";
import { docsNavigation } from "../pages/Docs/data/docsStructure";
import { landingPages } from "../pages/Landing/landingData";

/**
 * S-C3: per-page SEO copy for the 16 docs sub-routes. Audit-suggested
 * titles/descriptions tuned for distinct search intent — every entry maps
 * to a unique URL path so Google never sees duplicate <title> across docs.
 * Order matches `docsNavigation` topic ordering.
 */
export const DOCS_PAGE_SEO: Record<
  string,
  { title: string; description: string }
> = {
  "introduction/what-is": {
    title: "What is Web2Wireframe? — Docs",
    description:
      "Figma plugin that converts websites into clean, structured wireframes in seconds using multiple import methods.",
  },
  "introduction/why-web2wireframe": {
    title: "Why Web2Wireframe? — Docs",
    description:
      "Removes friction from early design stages with structured layouts from real websites and consistent reusable libraries.",
  },
  "start/how-to-install": {
    title: "How to Install Web2Wireframe — Docs",
    description:
      "Step-by-step guide to installing the Web2Wireframe plugin from Figma Community with system requirements.",
  },
  "start/getting-started": {
    title: "Getting Started with Web2Wireframe — Docs",
    description:
      "Overview of the main plugin interface, available import methods, library access, and basic settings configuration.",
  },
  "start/set-settings": {
    title: "Configure Web2Wireframe Settings — Docs",
    description:
      "Guide to adjusting plugin settings before starting imports for optimal wireframe generation results.",
  },
  "start/fast-first-import": {
    title: "Your First Import in 3 Steps — Docs",
    description:
      "Quick walkthrough of the fastest path from opening the plugin to generating your first editable wireframe.",
  },
  "import-methods/web-import": {
    title: "Web Import: Generate from URL — Docs",
    description:
      "Convert any live website into a wireframe by providing its URL for instant structural analysis and conversion.",
  },
  "import-methods/screenshot-import": {
    title: "Screenshot Import — Docs",
    description:
      "Transform website screenshots into editable wireframes without needing live access to the original site.",
  },
  "import-methods/html-import": {
    title: "HTML Import — Docs",
    description:
      "Paste raw HTML directly to generate wireframes — ideal for authenticated pages or offline content.",
  },
  "import-methods/area-capture": {
    title: "Area Capture: Select Sections — Docs",
    description:
      "Capture specific sections of a webpage instead of the full page for focused, partial imports.",
  },
  "browser-extension/extension-overview": {
    title: "Browser Extension Overview — Docs",
    description:
      "Direct-from-browser capture of website content with seamless integration into the Web2Wireframe workflow.",
  },
  "browser-extension/import-with-extension": {
    title: "Import Using the Browser Extension — Docs",
    description:
      "Step-by-step guide to installing and using the browser extension for quick content capture and import.",
  },
  "pricing/overview": {
    title: "Web2Wireframe Pricing Plans — Docs",
    description:
      "Free and Pro tier comparison including features, limits, and benefits for different user needs.",
  },
  "pricing/purchase": {
    title: "How to Purchase & Access Pro — Docs",
    description:
      "Complete guide to upgrading from Free to Pro, payment methods, account access, and feature activation.",
  },
  "pricing/additional": {
    title: "Pricing FAQs & Details — Docs",
    description:
      "Answers to common billing questions, refund policy, subscription management, and pricing transparency.",
  },
};

function buildDocsSeoEntries(): Record<string, SeoConfig> {
  const entries: Record<string, SeoConfig> = {};
  for (const topic of docsNavigation) {
    for (const page of topic.pages) {
      const routeKey = `${topic.id}/${page.path}`;
      const route = `/docs/${routeKey}`;
      const copy = DOCS_PAGE_SEO[routeKey];
      if (!copy) {
        // Fallback: derive from page title — safer than silently omitting.
        continue;
      }
      entries[route] = {
        title: copy.title,
        description: copy.description,
        canonical: `${SITE_URL}${route}`,
        ogType: "article",
        jsonLd: [
          breadcrumbSchema([
            { name: "Home", url: "/" },
            { name: "Docs", url: "/docs" },
            { name: topic.title, url: topic.path },
            { name: page.title, url: route },
          ]),
        ],
      };
    }
  }
  return entries;
}

/**
 * SEO entries for the four keyword landing pages. Title, description and the
 * FAQ text all come from `landingData` — the same objects the pages render —
 * so the FAQPage structured data can never describe copy the page doesn't
 * actually show, which is what Google penalises.
 */
function buildLandingSeoEntries(): Record<string, SeoConfig> {
  const entries: Record<string, SeoConfig> = {};
  for (const page of landingPages) {
    entries[page.slug] = {
      title: page.seoTitle,
      description: page.seoDescription,
      canonical: `${SITE_URL}${page.slug}`,
      ogType: "article",
      jsonLd: [
        faqSchema(page.faq),
        breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: page.breadcrumb, url: page.slug },
        ]),
      ],
    };
  }
  return entries;
}

const SUPPORT_FAQ = [
  {
    question: "How many imports do I get on the Free plan?",
    answer:
      "Free users get 10 imports per month. The counter resets monthly.",
  },
  {
    question: "What's the difference between Pro Monthly and Pro Yearly?",
    answer:
      "Pro Monthly is $16 for 30 days of unlimited imports. Pro Yearly is $144 for 365 days — a 25% discount versus monthly. Both are one-time payments with no auto-renewal.",
  },
  {
    question: "Is my payment information secure?",
    answer:
      "Yes. Payments are processed by Flitt, a PCI-DSS Level 1 certified payment gateway. Your card details never touch our servers.",
  },
  {
    question: "Can I cancel my subscription?",
    answer:
      "Yes. You can stop renewing anytime. Your Pro access stays active until the end of the current period.",
  },
];

export const seoConfig: Record<string, SeoConfig> = {
  "/": {
    title:
      "Web2Wireframe — Convert Any Website Into Editable Figma Wireframes",
    description:
      "Decide how the wireframe comes out — before it lands in Figma. Configure layout, text, assets, colours, fonts and variables up front, then import any website. Free tier available.",
    canonical: `${SITE_URL}/`,
    ogType: "website",
    twitterCard: "summary_large_image",
    // S-H5: `websiteSchema` (with SearchAction) belongs only on the home
    // page — Google expects exactly one canonical document per site.
    jsonLd: [organizationSchema, softwareApplicationSchema, websiteSchema],
  },
  "/how-it-works": {
    title: "How It Works — Web2Wireframe",
    description:
      "Five steps, about a minute: pick a source, open W2W in Figma, hand it the page, set the options, import. Learn every import option and when to change it.",
    canonical: `${SITE_URL}/how-it-works`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "How It Works", url: "/how-it-works" },
      ]),
    ],
  },
  "/pricing": {
    title: "Pricing — Web2Wireframe Free & Pro Plans",
    description:
      "Free plan: 10 imports per month. Pro Monthly: $16 (30 days). Pro Yearly: $144 (365 days, save 25%). Unlimited imports, full colors, fonts, and styles.",
    canonical: `${SITE_URL}/pricing`,
    ogType: "product",
    jsonLd: [
      productSchema,
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Pricing", url: "/pricing" },
      ]),
    ],
  },
  "/docs": {
    title: "Documentation — Web2Wireframe",
    description:
      "Get started with Web2Wireframe. Documentation for the Figma plugin, browser extension, import methods, and pricing.",
    canonical: `${SITE_URL}/docs`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Docs", url: "/docs" },
      ]),
    ],
  },
  "/support": {
    title: "Support — Web2Wireframe",
    description:
      "Need help with Web2Wireframe? Contact our support team or browse the FAQ for answers to common questions about imports, billing, and Pro features.",
    canonical: `${SITE_URL}/support`,
    ogType: "article",
    jsonLd: [
      faqSchema(SUPPORT_FAQ),
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Support", url: "/support" },
      ]),
    ],
  },
  "/terms": {
    title: "Terms & Conditions — Web2Wireframe",
    description:
      "Web2Wireframe terms of service. Read the legal terms for using our Figma plugin, browser extension, and website.",
    canonical: `${SITE_URL}/terms`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Terms", url: "/terms" },
      ]),
    ],
  },
  "/privacy": {
    title: "Privacy Policy — Web2Wireframe",
    description:
      "How Web2Wireframe handles your data. Privacy policy for the Figma plugin, browser extension, and payment processing via Flitt.",
    canonical: `${SITE_URL}/privacy`,
    ogType: "article",
    jsonLd: [
      breadcrumbSchema([
        { name: "Home", url: "/" },
        { name: "Privacy", url: "/privacy" },
      ]),
    ],
  },
  // Session-driven pages — real titles for the tab/history, but noindex:
  // they render per-user state and have no value in the index (robots.txt
  // also disallows them).
  "/signin": {
    title: "Sign in — Web2Wireframe",
    description:
      "Sign in with Figma to see your Web2Wireframe plan and import quota. Same account as the plugin — no password.",
    canonical: `${SITE_URL}/signin`,
    ogType: "website",
    noindex: true,
  },
  "/checkout": {
    title: "Checkout — Web2Wireframe Pro",
    description:
      "Upgrade to Web2Wireframe Pro. One-time payment, no auto-renewal — handled securely by Flitt.",
    canonical: `${SITE_URL}/checkout`,
    ogType: "website",
    noindex: true,
  },
  ...buildLandingSeoEntries(),
  // S-C3: spread the 16 generated docs entries here so a missed lookup
  // falls back to the home page only when the route truly isn't a docs page.
  ...buildDocsSeoEntries(),
};

export function getSeoConfig(route: string): SeoConfig {
  return seoConfig[route] ?? seoConfig["/"];
}
