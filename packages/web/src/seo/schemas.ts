import type { JsonLd } from "./types";
import { SITE_URL, SITE_NAME } from "./types";

export const organizationSchema: JsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  description:
    "Convert any website into editable Figma wireframes instantly using our Figma plugin.",
  sameAs: [
    "https://www.figma.com/@glinc",
    "https://www.figma.com/community/plugin/1646327864971730293",
  ],
};

export const softwareApplicationSchema: JsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web, Figma",
  description:
    "A Figma plugin that converts any website into editable wireframes. Capture layouts, structure, and styles instantly.",
  // W2W is free since 2026-11-07: one Free offer, no paid plans.
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "Every import method and setting included",
    },
  ],
  url: SITE_URL,
  // S-C1: `aggregateRating` removed — Google guidelines forbid self-authored /
  // single-review ratings (manual penalty risk; rich results would be dropped
  // sitewide). Restore ONLY with real, verifiable Figma Community reviews and
  // matching `Review` items, not a bare aggregate.
};

/**
 * S-H5: `WebSite` schema with `potentialAction: SearchAction` declares the
 * sitelinks search box to Google. On branded queries (e.g. "Web2Wireframe"),
 * Google may render the site result with an inline search input that
 * deep-links back into `/docs?q={user input}`. The DoksSidebar already has
 * a client-side search (see `DoksSidebar.tsx`); seeding it from `?q=` is a
 * follow-up — the schema declaration is sufficient for Google to surface
 * the feature.
 *
 * Wire this into the Home page's `seoConfig` (not every page) — Google
 * expects the WebSite schema on a single canonical document per site.
 */
export const websiteSchema: JsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/docs?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export const breadcrumbSchema = (
  items: Array<{ name: string; url: string }>,
): JsonLd => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, idx) => ({
    "@type": "ListItem",
    position: idx + 1,
    name: item.name,
    item: item.url.startsWith("http") ? item.url : `${SITE_URL}${item.url}`,
  })),
});

export const faqSchema = (
  qa: Array<{ question: string; answer: string }>,
): JsonLd => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: qa.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
});
