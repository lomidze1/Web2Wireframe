import { describe, it, expect } from "vitest";
import { buildSitemap } from "./sitemap";
import { seoConfig } from "./config";

const LASTMOD = "2026-08-26";

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

describe("buildSitemap", () => {
  it("emits a valid urlset document", () => {
    const xml = buildSitemap(["/"], LASTMOD);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("renders one <url> block per route with loc/lastmod/changefreq/priority", () => {
    const xml = buildSitemap(["/", "/pricing"], LASTMOD);
    expect(locs(xml)).toEqual([
      "https://www.web2wireframe.design/",
      "https://www.web2wireframe.design/pricing",
    ]);
    expect(xml.match(/<lastmod>2026-08-26<\/lastmod>/g)).toHaveLength(2);
    expect(xml).toContain("<changefreq>");
    expect(xml).toContain("<priority>");
  });

  // The bare domain 308-redirects to www, so a sitemap full of bare-domain
  // URLs would be a sitemap full of redirects. Every <loc> must be the host
  // that actually serves the page.
  it("emits only the www host — the one that serves, not the one that redirects", () => {
    const xml = buildSitemap(Object.keys(seoConfig), LASTMOD);
    for (const loc of locs(xml)) {
      expect(loc).toMatch(/^https:\/\/www\.web2wireframe\.design(\/|$)/);
    }
  });

  it("omits noindex routes so the sitemap never contradicts robots", () => {
    const xml = buildSitemap(["/", "/signin", "/checkout"], LASTMOD);
    expect(locs(xml)).toEqual(["https://www.web2wireframe.design/"]);
  });

  it("gives the home page top priority and legal pages the lowest", () => {
    const xml = buildSitemap(["/", "/terms"], LASTMOD);
    const [home, terms] = xml.split("<url>").slice(1);
    expect(home).toContain("<priority>1.0</priority>");
    expect(terms).toContain("<priority>0.3</priority>");
    expect(terms).toContain("<changefreq>yearly</changefreq>");
  });

  it("gives keyword landing pages a high priority", () => {
    const xml = buildSitemap(["/html-to-figma"], LASTMOD);
    expect(xml).toContain("<priority>0.9</priority>");
  });

  it("deduplicates repeated routes", () => {
    const xml = buildSitemap(["/pricing", "/pricing"], LASTMOD);
    expect(locs(xml)).toHaveLength(1);
  });
});
