import { describe, it, expect } from "vitest";
import { getSeoConfig, seoConfig } from "./config";

describe("getSeoConfig", () => {
  it("returns the route-specific config for a known route", () => {
    const cfg = getSeoConfig("/pricing");
    expect(cfg.canonical).toBe("https://www.web2wireframe.design/pricing");
    expect(cfg.title).toMatch(/Free/);
  });

  it("falls back to the root config for an unknown route", () => {
    const cfg = getSeoConfig("/nonexistent-route");
    expect(cfg).toBe(seoConfig["/"]);
  });

  it("home / has Organization + SoftwareApplication JSON-LD", () => {
    const cfg = getSeoConfig("/");
    const types = (cfg.jsonLd ?? []).map((s) => s["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("SoftwareApplication");
  });

  it("pricing page has SoftwareApplication schema (no Product) + BreadcrumbList", () => {
    const cfg = getSeoConfig("/pricing");
    const types = (cfg.jsonLd ?? []).map((s) => s["@type"]);
    expect(types).toContain("SoftwareApplication");
    expect(types).not.toContain("Product");
    expect(types).toContain("BreadcrumbList");
  });

  it("support page has FAQPage schema", () => {
    const cfg = getSeoConfig("/support");
    const types = (cfg.jsonLd ?? []).map((s) => s["@type"]);
    expect(types).toContain("FAQPage");
  });

  it("every configured route has a canonical URL on the public domain", () => {
    for (const [, cfg] of Object.entries(seoConfig)) {
      expect(cfg.canonical).toMatch(/^https:\/\/www\.web2wireframe\.design/);
    }
  });

  it("every configured route has a non-empty title and description", () => {
    for (const [route, cfg] of Object.entries(seoConfig)) {
      expect(cfg.title, `title missing for ${route}`).toBeTruthy();
      expect(cfg.description, `description missing for ${route}`).toBeTruthy();
    }
  });
});
