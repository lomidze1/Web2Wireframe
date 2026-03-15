import { describe, it, expect } from "vitest";
import { validateHtml } from "../utils/validateHtml";

describe("validateHtml", () => {
  describe("valid HTML", () => {
    it("returns valid for empty string", () => {
      const result = validateHtml("");
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it("returns valid for whitespace-only string", () => {
      const result = validateHtml("   \n\t  ");
      expect(result.isValid).toBe(true);
    });

    it("returns valid for simple well-formed HTML", () => {
      const result = validateHtml("<div><p>Hello</p></div>");
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
    });

    it("returns valid for nested well-formed HTML", () => {
      const html = `
        <div class="container">
          <header>
            <h1>Title</h1>
            <nav><ul><li>Item</li></ul></nav>
          </header>
          <main>
            <p>Content</p>
          </main>
        </div>
      `;
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });

    it("rejects plain text without any HTML tags", () => {
      const result = validateHtml("Hello world, no tags here!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("No HTML tags found"))).toBe(true);
    });

    it("returns valid for full HTML document", () => {
      const html = `<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>`;
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });
  });

  describe("void elements", () => {
    it("does not flag void elements without closing tag", () => {
      const result = validateHtml("<div><br><hr><img src='test.png'><input type='text'></div>");
      expect(result.isValid).toBe(true);
    });

    it("does not flag self-closing void elements", () => {
      const result = validateHtml("<div><br /><hr /><img src='test.png' /></div>");
      expect(result.isValid).toBe(true);
    });

    it("handles all standard void elements", () => {
      const html = `
        <div>
          <area><base><br><col><embed><hr>
          <img src="x"><input><link><meta>
          <param><source><track><wbr>
        </div>
      `;
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });
  });

  describe("self-closing tags", () => {
    it("does not flag self-closing non-void tags", () => {
      const result = validateHtml("<div><span /><p /></div>");
      expect(result.isValid).toBe(true);
    });
  });

  describe("unclosed tags", () => {
    it("detects single unclosed tag", () => {
      const result = validateHtml("<div><p>Hello</div>");
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });

    it("detects multiple unclosed tags", () => {
      const result = validateHtml("<div><p><span>text</div>");
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(2);
    });

    it("detects tag opened but never closed", () => {
      const result = validateHtml("<div><p>Hello");
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });

    it("detects unclosed tag at root level", () => {
      const result = validateHtml("<div>Content");
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBe(1);
    });
  });

  describe("mismatched tags", () => {
    it("detects closing tag that does not match opening", () => {
      const result = validateHtml("<div>Hello</span>");
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });

    it("detects swapped closing tags", () => {
      const result = validateHtml("<div><span>text</div></span>");
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("missing closing brackets", () => {
    it("detects missing > on opening tag", () => {
      const result = validateHtml('<div class="foo"<p>Hello</p></div>');
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });

    it("detects missing > on tag before next tag", () => {
      const result = validateHtml("<h1>Title</h1\n<p>Content</p>");
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("script and style content ignored", () => {
    it("ignores tags inside script elements", () => {
      const html = '<div><script>var x = "<p>not a real tag</p>";</script></div>';
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });

    it("ignores tags inside style elements", () => {
      const html = "<div><style>.foo > .bar { color: red; }</style><p>Hello</p></div>";
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });
  });

  describe("HTML comments ignored", () => {
    it("ignores content inside comments", () => {
      const html = "<div><!-- <p>commented out</p> --><span>Visible</span></div>";
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });

    it("ignores multi-line comments", () => {
      const html = `<div>
        <!--
          <span>this is commented
          <div>also commented
        -->
        <p>Real content</p>
      </div>`;
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });
  });

  describe("real-world malformed HTML (user's example)", () => {
    it("detects errors in the user's actual malformed HTML", () => {
      const html = `
        <header class="hero">
          <div class="container"
            <h1>Simple Landing Page</h1
            <p>This is a minimal HTML and CSS example.</p>
            <a href="#" class="btn">Get Started</a>
          </div>
        </header>

        <section class="features">
          <div class="container">
            <div class="feature">
              <h3>Fast</h3>
              <p>Simple structure and clean layout.</p>
            </div>

            <div class="feature">
              <h3>Lightweight</h3>
              <p>Minimal CSS and HTML code.</p>
            <div>

            <div class="feature">
              <h3>Responsive</h3>
              <p>Works well on different screen sizes.</p>
            </div>
          </div>
        </section>
      `;
      const result = validateHtml(html);
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("error messages", () => {
    it("provides descriptive error messages for unclosed tags", () => {
      const result = validateHtml("<div><p>Hello");
      expect(result.errors.some((e) => e.toLowerCase().includes("unclosed"))).toBe(true);
    });

    it("provides descriptive error messages for mismatched tags", () => {
      const result = validateHtml("<div>Hello</span>");
      expect(result.errors.some((e) => e.toLowerCase().includes("mismatch"))).toBe(true);
    });
  });

  describe("CSS-in-HTML detection", () => {
    it("detects CSS code pasted in HTML field", () => {
      const css = `.header { color: red; background: blue; }`;
      const result = validateHtml(css);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes("css"))).toBe(true);
    });

    it("detects CSS with multiple selectors", () => {
      const css = `
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #4a6cf7; padding: 20px; }
        h1 { font-size: 24px; }
      `;
      const result = validateHtml(css);
      expect(result.isValid).toBe(false);
    });

    it("does not flag HTML that also contains CSS-like text", () => {
      const html = `<div class="container"><style>.foo { color: red; }</style><p>Hello</p></div>`;
      const result = validateHtml(html);
      expect(result.isValid).toBe(true);
    });

    it("detects CSS with @media rules", () => {
      const css = `@media (max-width: 768px) { .header { padding: 10px; } }`;
      const result = validateHtml(css);
      expect(result.isValid).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles attributes with angle brackets in values", () => {
      const result = validateHtml('<div data-info="a > b">Content</div>');
      expect(result.isValid).toBe(true);
    });

    it("handles single-quoted attributes", () => {
      const result = validateHtml("<div class='container'><p>Hello</p></div>");
      expect(result.isValid).toBe(true);
    });

    it("handles tags with many attributes", () => {
      const result = validateHtml('<input type="text" id="name" class="form-control" placeholder="Enter name" required>');
      expect(result.isValid).toBe(true);
    });

    it("handles case-insensitive tag matching", () => {
      const result = validateHtml("<DIV><p>Hello</p></div>");
      expect(result.isValid).toBe(true);
    });

    it("handles DOCTYPE declaration", () => {
      const result = validateHtml("<!DOCTYPE html><html><body></body></html>");
      expect(result.isValid).toBe(true);
    });
  });
});
