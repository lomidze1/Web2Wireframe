import { describe, it, expect } from "vitest";
import { staticRoutes } from "../AppRoutes";
import { landingPages } from "../pages/Landing/landingData";
import { seoConfig } from "./config";
import { SITE_URL } from "./types";

/**
 * Guards the contract between the SSG route list and the SEO config.
 *
 * These exist because the two lists have silently drifted before: the 16 docs
 * sub-routes were in sitemap.xml but not in `staticRoutes`, so Googlebot got
 * an empty SPA shell carrying the home page's <title> on every one of them
 * (see the S-C3 note in AppRoutes.tsx). A missing entry is invisible in
 * review — `getSeoConfig` silently falls back to "/" — so it needs a test.
 */
describe("staticRoutes ↔ seoConfig", () => {
  it("every prerendered route has its own SEO entry, not the home fallback", () => {
    const missing = staticRoutes.filter((route) => !(route in seoConfig));
    expect(missing, `routes without a seoConfig entry: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("no two indexable routes share a <title>", () => {
    const seen = new Map<string, string>();
    for (const [route, cfg] of Object.entries(seoConfig)) {
      if (cfg.noindex) continue;
      const first = seen.get(cfg.title);
      expect(first, `duplicate title on ${route} and ${first}`).toBeUndefined();
      seen.set(cfg.title, route);
    }
  });

  it("no two indexable routes share a description", () => {
    const seen = new Map<string, string>();
    for (const [route, cfg] of Object.entries(seoConfig)) {
      if (cfg.noindex) continue;
      const first = seen.get(cfg.description);
      expect(first, `duplicate description on ${route} and ${first}`)
        .toBeUndefined();
      seen.set(cfg.description, route);
    }
  });

  // SITE_URL must stay on the host that actually serves the site. The bare
  // domain 308-redirects to www, so pointing canonicals at it would make
  // every canonical a redirect — the mismatch this test exists to prevent.
  it("every canonical is the www URL of its own route", () => {
    expect(SITE_URL).toBe("https://www.web2wireframe.design");
    for (const [route, cfg] of Object.entries(seoConfig)) {
      expect(cfg.canonical, `canonical mismatch on ${route}`).toBe(
        `${SITE_URL}${route}`,
      );
    }
  });

  it("keeps titles and descriptions inside Google's display limits", () => {
    for (const [route, cfg] of Object.entries(seoConfig)) {
      expect(cfg.title.length, `title too long on ${route}`).toBeLessThanOrEqual(
        70,
      );
      expect(
        cfg.description.length,
        `description too long on ${route}`,
      ).toBeLessThanOrEqual(320);
    }
  });
});

describe("keyword landing pages", () => {
  const LANDING_ROUTES = [
    "/html-to-figma",
    "/website-to-figma",
    "/figma-wireframe-plugin",
    "/figma-browser-extension",
  ];

  it("are all prerendered", () => {
    for (const route of LANDING_ROUTES) {
      expect(staticRoutes, `${route} missing from staticRoutes`).toContain(
        route,
      );
    }
  });

  it("each carries FAQPage + BreadcrumbList structured data", () => {
    for (const route of LANDING_ROUTES) {
      const types = (seoConfig[route]?.jsonLd ?? []).map((s) => s["@type"]);
      expect(types, `missing schema on ${route}`).toContain("FAQPage");
      expect(types, `missing breadcrumb on ${route}`).toContain(
        "BreadcrumbList",
      );
    }
  });

  it("leads its <title> with the phrase people actually search for", () => {
    expect(seoConfig["/html-to-figma"]?.title).toMatch(/^HTML to Figma/);
    expect(seoConfig["/website-to-figma"]?.title).toMatch(/^Website to Figma/);
    expect(seoConfig["/figma-wireframe-plugin"]?.title).toMatch(
      /^Figma Wireframe Plugin/,
    );
    expect(seoConfig["/figma-browser-extension"]?.title).toMatch(
      /^Figma Browser Extension/,
    );
  });

  it("cross-links every other landing page, so none is a dead end", () => {
    for (const page of landingPages) {
      const targets = page.related.map((r) => r.to).sort();
      const others = LANDING_ROUTES.filter((r) => r !== page.slug).sort();
      expect(targets, `related links wrong on ${page.slug}`).toEqual(others);
    }
  });
});

// /go/<source> pages are click counters that redirect to Figma — prerendering
// them would put redirect stubs into the sitemap and the search index.
describe("/go redirect links", () => {
  it("are never prerendered", () => {
    expect(staticRoutes.filter((route) => route.startsWith("/go"))).toEqual(
      [],
    );
  });
});
