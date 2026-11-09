import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AppRoutes, { staticRoutes } from "./AppRoutes";
import { getSeoConfig } from "./seo/config";
import { renderHead } from "./seo/render";

/**
 * Web2Wireframe is free since 2026-11-07 (docs/plans/WEB-free-update.md).
 * Guard: no prerendered page — body or <head>/JSON-LD — may advertise a price,
 * a paid plan, checkout, or the removed Screenshot import.
 */

const BANNED: Array<[string, RegExp]> = [
  ["price $16/$144/$12", /\$\s?(16|144|12)\b/],
  ["Pro plan", /\bPro\b/],
  ["Get Pro / upgrade to Pro", /get pro|upgrade to pro/i],
  ["checkout", /checkout/i],
  ["monthly import allowance", /imports? (a|per) month|free imports?/i],
  ["Flitt (payment provider)", /flitt/i],
  ["screenshot import", /screenshot/i],
];

// Same tree as entry-server.tsx, with react-router-dom's router (vitest loads
// "react-router" and "react-router-dom" as separate instances).
const render = (url: string) =>
  renderToString(
    <MemoryRouter initialEntries={[url]}>
      <Header />
      <main id="main">
        <AppRoutes />
      </main>
      <Footer />
    </MemoryRouter>,
  );

// Plain-English uses of the word, not the removed feature.
const ALLOWED_PHRASES = [/not a screenshot/gi, /saving screenshots/gi, /download screenshots/gi];

const visibleText = (html: string) =>
  ALLOWED_PHRASES.reduce((t, re) => t.replace(re, " "), html)
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** Each banned phrase found, with a little context: "label | …context…". */
const hits = (text: string): string[] =>
  BANNED.flatMap(([label, re]) => {
    const all = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    return [...text.matchAll(all)].map(
      (m) => `${label} | ${text.slice(Math.max(0, m.index - 25), m.index + 25).replace(/\s+/g, " ")}`,
    );
  });

describe("free mode — every prerendered page", () => {
  for (const route of staticRoutes) {
    it(`${route}: body has no pricing, Pro, checkout or screenshot copy`, () => {
      expect(hits(visibleText(render(route)))).toEqual([]);
    });

    it(`${route}: <head> and JSON-LD have no pricing, Pro or screenshot`, () => {
      expect(hits(renderHead(getSeoConfig(route)))).toEqual([]);
    });
  }

  it("removed pages are not prerendered", () => {
    for (const gone of ["/checkout", "/account", "/signin", "/renew", "/screenshot-to-figma"]) {
      expect(staticRoutes).not.toContain(gone);
    }
    expect(staticRoutes.some((r) => r.startsWith("/docs/pricing"))).toBe(false);
  });

  it("the only offer in structured data is Free at $0", () => {
    const head = renderHead(getSeoConfig("/"));
    const prices = [...head.matchAll(/"price":\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(prices).toEqual(["0"]);
  });
});

describe("free mode — old payment/account URLs redirect (vercel.json)", () => {
  const cfg = JSON.parse(readFileSync(resolve(__dirname, "../vercel.json"), "utf8")) as {
    redirects?: Array<{ source: string; destination: string; permanent?: boolean }>;
  };
  const dest = (source: string) => cfg.redirects?.find((r) => r.source === source);

  it.each([
    ["/checkout", "/pricing"],
    ["/checkout/:path*", "/pricing"],
    ["/renew", "/pricing"],
    ["/account", "/pricing"],
    ["/signin", "/"],
    ["/screenshot-to-figma", "/website-to-figma"],
    ["/docs/pricing/:path*", "/pricing"],
    ["/docs/import-methods/screenshot-import", "/docs"],
  ])("%s → %s (permanent)", (source, destination) => {
    expect(dest(source)?.destination).toBe(destination);
    expect(dest(source)?.permanent).toBe(true);
  });
});
