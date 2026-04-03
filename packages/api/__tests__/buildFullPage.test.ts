import { describe, it, expect } from "vitest";
import { buildFullPage } from "../src/lib/htmlExtractor.js";

describe("buildFullPage", () => {
  describe("HTML fragment wrapping", () => {
    it("wraps a simple fragment in a full HTML document", () => {
      const result = buildFullPage("<h1>Hello</h1>", "");
      expect(result).toContain("<!DOCTYPE html>");
      expect(result).toContain("<html>");
      expect(result).toContain("<body><h1>Hello</h1></body>");
    });

    it("adds CSS in <style> tag when wrapping fragment", () => {
      const result = buildFullPage("<p>Test</p>", "p { color: red; }");
      expect(result).toContain("<!DOCTYPE html>");
      expect(result).toContain("<style>p { color: red; }</style>");
      expect(result).toContain("<body><p>Test</p></body>");
    });

    it("does not add <style> tag when CSS is empty", () => {
      const result = buildFullPage("<div>No CSS</div>", "");
      expect(result).not.toContain("<style>");
    });
  });

  describe("full HTML document handling", () => {
    it("injects CSS into existing <head>", () => {
      const html = "<!DOCTYPE html><html><head><title>Test</title></head><body><p>Hi</p></body></html>";
      const result = buildFullPage(html, "p { color: blue; }");
      expect(result).toContain("<head><style>p { color: blue; }</style><title>Test</title></head>");
    });

    it("returns document as-is when no CSS provided", () => {
      const html = "<!DOCTYPE html><html><head></head><body><p>Hi</p></body></html>";
      const result = buildFullPage(html, "");
      expect(result).toBe(html);
    });

    it("detects <html> tag without <!DOCTYPE>", () => {
      const html = "<html><head></head><body><p>Hi</p></body></html>";
      const result = buildFullPage(html, "body { margin: 0; }");
      expect(result).toContain("<style>body { margin: 0; }</style>");
      // Should NOT wrap in another <html>
      expect(result).not.toContain("<!DOCTYPE html>");
    });

    it("creates <head> when full doc has no <head> but has <body>", () => {
      const html = "<!DOCTYPE html><html><body><p>No head</p></body></html>";
      const result = buildFullPage(html, ".test { color: green; }");
      expect(result).toContain("<head><style>.test { color: green; }</style></head>");
      expect(result).toContain("<body>");
    });
  });

  describe("CSS in both HTML and CSS input", () => {
    it("preserves inline <style> in HTML and adds CSS input separately", () => {
      const html = '<html><head><style>h1 { font-size: 24px; }</style></head><body><h1>Test</h1></body></html>';
      const css = "h1 { color: red; }";
      const result = buildFullPage(html, css);
      // CSS input injected at start of <head>
      expect(result).toContain("<style>h1 { color: red; }</style>");
      // Original <style> still present
      expect(result).toContain("<style>h1 { font-size: 24px; }</style>");
    });
  });

  describe("edge cases", () => {
    it("handles null/undefined CSS gracefully", () => {
      const result = buildFullPage("<div>Test</div>", null as any);
      expect(result).toContain("<body><div>Test</div></body>");
      expect(result).not.toContain("<style>");
    });

    it("handles empty string CSS", () => {
      const result = buildFullPage("<div>Test</div>", "");
      expect(result).not.toContain("<style>");
    });
  });

  describe("additional edge cases", () => {
    it("preserves CSS with @media queries", () => {
      const css = "@media (max-width: 768px) { .nav { display: none; } }";
      const result = buildFullPage("<nav class='nav'>Menu</nav>", css);
      expect(result).toContain(`<style>${css}</style>`);
    });

    it("preserves CSS with special characters (quotes, backslashes)", () => {
      const css = '.icon::before { content: "\\2022"; font-family: "Helvetica Neue"; }';
      const result = buildFullPage("<span class='icon'></span>", css);
      expect(result).toContain(`<style>${css}</style>`);
    });

    it("injects CSS into head with attributes", () => {
      const html = '<!DOCTYPE html><html><head lang="en"><title>T</title></head><body>Hi</body></html>';
      const result = buildFullPage(html, "body { margin: 0; }");
      expect(result).toContain('<head lang="en"><style>body { margin: 0; }</style>');
    });

    it("detects lowercase doctype as full document", () => {
      const html = "<!doctype html><html><head></head><body>X</body></html>";
      const result = buildFullPage(html, "p { color: red; }");
      // Should inject into existing <head>, NOT wrap in another document
      expect(result).toContain("<style>p { color: red; }</style>");
      expect(result).not.toContain("<body><!doctype");
    });

    it("handles undefined cssCode (not null, not empty)", () => {
      const result = buildFullPage("<div>X</div>", undefined as any);
      expect(result).toContain("<body><div>X</div></body>");
      expect(result).not.toContain("<style>");
    });

    it("wraps fragment with undefined CSS without style tag", () => {
      const result = buildFullPage("<p>Hi</p>", undefined as any);
      expect(result).toContain("<!DOCTYPE html>");
      expect(result).toContain("<body><p>Hi</p></body>");
      expect(result).not.toContain("<style>");
    });

    it("preserves existing inline style in fragment when no external CSS", () => {
      const html = '<div><style>.x { color: red; }</style><p>Hi</p></div>';
      const result = buildFullPage(html, "");
      expect(result).toContain('<style>.x { color: red; }</style>');
      expect(result).toContain("<body>");
    });
  });
});
