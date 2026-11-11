import { seoConfig } from "./config";
import { SITE_URL } from "./types";

/**
 * Sitemap generation from the SSG route list.
 *
 * The sitemap used to be a hand-written `public/sitemap.xml`, which drifted
 * from the real routes and froze every `lastmod` at the day it was written.
 * Building it from the same `staticRoutes` array that drives prerendering
 * means the two can no longer disagree.
 */

interface RouteWeight {
  changefreq: string;
  priority: string;
}

/**
 * First matching rule wins, so the specific `/docs/<topic>/<page>` pattern
 * has to be tested before the bare `/docs` one.
 */
const WEIGHT_RULES: Array<[RegExp, RouteWeight]> = [
  [/^\/$/, { changefreq: "weekly", priority: "1.0" }],
  [/^\/(terms|privacy)$/, { changefreq: "yearly", priority: "0.3" }],
  [/^\/support$/, { changefreq: "monthly", priority: "0.6" }],
  [/^\/docs\/.+/, { changefreq: "monthly", priority: "0.7" }],
  [/^\/docs$/, { changefreq: "weekly", priority: "0.8" }],
];

// Marketing and keyword landing pages — the pages we actually want ranking.
const DEFAULT_WEIGHT: RouteWeight = { changefreq: "monthly", priority: "0.9" };

function weightFor(route: string): RouteWeight {
  for (const [pattern, weight] of WEIGHT_RULES) {
    if (pattern.test(route)) return weight;
  }
  return DEFAULT_WEIGHT;
}

/**
 * Renders a sitemap for `routes`, skipping any route the SEO config marks
 * `noindex` — listing a noindex URL is a contradictory signal to Google.
 *
 * @param lastmod ISO date (YYYY-MM-DD) stamped on every entry.
 */
export function buildSitemap(routes: string[], lastmod: string): string {
  const indexable = [...new Set(routes)].filter(
    (route) => !seoConfig[route]?.noindex,
  );

  const entries = indexable.map((route) => {
    const { changefreq, priority } = weightFor(route);
    return [
      "  <url>",
      `    <loc>${SITE_URL}${route}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}
