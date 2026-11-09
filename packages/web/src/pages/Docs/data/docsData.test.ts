import { describe, it, expect } from "vitest";
import { docsNavigation, getAllDocPages } from "./docsStructure";
import { docsArticles, getArticle, draftArticle } from "./docsArticles";
import { getDocsSearchIndex, searchDocs, getSearchItemRoute } from "./docsSearchIndex";
import { slugifyHeading } from "../utils/docsSearchUtils";
import { DOCS_PAGE_SEO } from "../../../seo/config";

const pages = getAllDocPages();

describe("structure", () => {
  it("has four topics and eleven pages (no pricing, no screenshot import)", () => {
    expect(docsNavigation).toHaveLength(4);
    expect(pages).toHaveLength(11);
  });

  it("gives every page a hub descriptor", () => {
    for (const page of pages) {
      expect(page.blurb.length).toBeGreaterThan(0);
    }
  });

  it("points every topic at one of its own pages", () => {
    for (const topic of docsNavigation) {
      const routes = topic.pages.map((p) => `/docs/${topic.id}/${p.path}`);
      expect(routes).toContain(topic.path);
    }
  });
});

describe("articles", () => {
  it("has a written article for every page — none in draft", () => {
    for (const page of pages) {
      const { isDraft } = getArticle(page.key);
      expect(isDraft, `${page.key} is missing an article`).toBe(false);
    }
  });

  it("falls back to the draft article for an unknown key", () => {
    const { article, isDraft } = getArticle("nope/nope");
    expect(isDraft).toBe(true);
    expect(article).toBe(draftArticle);
  });

  it("gives every section a unique, slug-shaped id", () => {
    for (const [key, article] of Object.entries(docsArticles)) {
      const ids = article.sections.map((s) => s.id);
      expect(new Set(ids).size, `${key} has duplicate section ids`).toBe(
        ids.length,
      );
      for (const id of ids) {
        expect(id).toBe(slugifyHeading(id));
      }
    }
  });

  it("gives every article a lead, a reading time and a date", () => {
    for (const [key, article] of Object.entries(docsArticles)) {
      expect(article.lead.length, key).toBeGreaterThan(10);
      expect(article.readingTime, key).toMatch(/min read/);
      expect(article.updated, key).toMatch(/^Updated /);
      expect(article.sections.length, key).toBeGreaterThan(0);
    }
  });

  it("gives every section at least one paragraph", () => {
    for (const [key, article] of Object.entries(docsArticles)) {
      for (const section of article.sections) {
        expect(section.paras.length, `${key}#${section.id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("prev / next", () => {
  it("walks the flattened page order", () => {
    const index = pages.findIndex((p) => p.key === "start/set-settings");
    expect(index).toBeGreaterThan(0);
    expect(pages[index - 1].key).toBe("start/getting-started");
    expect(pages[index + 1].key).toBe("start/fast-first-import");
  });

  it("starts and ends the sequence at the expected pages", () => {
    expect(pages[0].key).toBe("introduction/what-is");
    expect(pages[pages.length - 1].key).toBe("browser-extension/import-with-extension");
  });
});

describe("search index", () => {
  const index = getDocsSearchIndex();

  it("indexes every page plus every section", () => {
    const sectionCount = pages.reduce(
      (total, page) => total + (docsArticles[page.key]?.sections.length ?? 0),
      0,
    );
    expect(index).toHaveLength(pages.length + sectionCount);
  });

  it("normalises search text to lowercase", () => {
    for (const item of index) {
      expect(item.searchText).toBe(item.searchText.toLowerCase());
    }
  });

  it("finds the HTML import page", () => {
    const results = searchDocs("html");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.pagePath === "html-import")).toBe(true);
  });

  it("has no screenshot import page any more", () => {
    expect(searchDocs("screenshot").some((r) => r.pagePath === "screenshot-import")).toBe(false);
  });

  it("returns nothing for an empty query", () => {
    expect(searchDocs("   ")).toEqual([]);
  });

  it("routes section hits to an anchor", () => {
    const section = index.find((i) => i.headingId);
    expect(section).toBeDefined();
    expect(getSearchItemRoute(section!)).toContain("#");
  });
});

describe("seo coverage", () => {
  it("has a SEO entry for every docs page", () => {
    for (const page of pages) {
      expect(DOCS_PAGE_SEO[page.key], `${page.key} has no SEO entry`).toBeDefined();
    }
  });
});
