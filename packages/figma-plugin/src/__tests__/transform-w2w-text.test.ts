import { describe, it, expect } from "vitest";
import { transformW2WTreeText } from "../ui/shared/transformData";

// Helper to create W2W tree nodes
function frame(tag: string, children: any[], classList: string[] = []): any {
  return { type: "FRAME", tag, classList, children, x: 0, y: 0, width: 100, height: 20, quad: [] };
}

function text(value: string): any {
  return { type: "TEXT", value, x: 0, y: 0, width: 100, height: 20, quad: [], font: "400 16px Arial" };
}

function svg(): any {
  return { type: "SVG", svg: "<svg></svg>", x: 0, y: 0, width: 24, height: 24, quad: [] };
}

describe("transformW2WTreeText", () => {
  describe("semantic mode", () => {
    it("should replace h1 text with 'Page Title'", () => {
      const tree = frame("div", [
        frame("h1", [text("Welcome to Our Website")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Page Title");
    });

    it("should replace h2 text with 'Section Heading'", () => {
      const tree = frame("div", [
        frame("h2", [text("Features")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Section Heading");
    });

    it("should replace h3 text with 'Subsection Heading'", () => {
      const tree = frame("div", [
        frame("h3", [text("Getting Started")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Subsection Heading");
    });

    it("should replace p text with body paragraph", () => {
      const tree = frame("div", [
        frame("p", [text("This is a long paragraph about our product.")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Body text paragraph with sample content.");
    });

    it("should replace a text with 'Link'", () => {
      const tree = frame("nav", [
        frame("a", [text("Click here")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Link");
    });

    it("should replace button text with 'Button'", () => {
      const tree = frame("div", [
        frame("button", [text("Submit Now")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Button");
    });

    it("should replace li text with 'List item'", () => {
      const tree = frame("ul", [
        frame("li", [text("First item in list")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("List item");
    });

    it("should handle price pattern: $99 → $price", () => {
      const tree = frame("div", [
        frame("span", [text("$99")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("$price");
    });

    it("should handle price with period: $50 /month → $price /text", () => {
      const tree = frame("div", [
        frame("span", [text("$50 /month")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("$price /text");
    });

    it("should preserve short symbols (≤2 chars)", () => {
      const tree = frame("div", [
        frame("span", [text("©")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("©");
    });

    it("should handle pure numbers as price pattern", () => {
      const tree = frame("div", [
        frame("span", [text("123")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      // isPricePattern matches bare numbers → "$price"
      expect(tree.children[0].children[0].value).toBe("$price");
    });

    it("should preserve pure punctuation", () => {
      const tree = frame("div", [
        frame("span", [text("---")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("---");
    });

    it("should handle section-aware paragraph in footer", () => {
      const tree = frame("footer", [
        frame("p", [text("Contact us for more information")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Footer description text.");
    });

    it("should handle section-aware paragraph in header", () => {
      const tree = frame("header", [
        frame("p", [text("Welcome to our site")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Header description text.");
    });

    it("should handle section-aware paragraph in nav", () => {
      const tree = frame("nav", [
        frame("p", [text("Browse our categories")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Navigation description.");
    });

    it("should handle deeply nested tree", () => {
      const tree = frame("div", [
        frame("header", [
          frame("nav", [
            frame("a", [text("Home")]),
            frame("a", [text("About")]),
          ]),
        ]),
        frame("main", [
          frame("h1", [text("Welcome")]),
          frame("p", [text("Description here")]),
        ]),
        frame("footer", [
          frame("p", [text("Copyright info")]),
        ]),
      ]);
      transformW2WTreeText(tree, "semantic");

      // nav > a → "Link"
      expect(tree.children[0].children[0].children[0].children[0].value).toBe("Link");
      expect(tree.children[0].children[0].children[1].children[0].value).toBe("Link");
      // main > h1 → "Page Title"
      expect(tree.children[1].children[0].children[0].value).toBe("Page Title");
      // main > p → "Body text paragraph with sample content."
      expect(tree.children[1].children[1].children[0].value).toBe("Body text paragraph with sample content.");
      // footer > p → "Footer description text."
      expect(tree.children[2].children[0].children[0].value).toBe("Footer description text.");
    });

    it("should skip SVG nodes", () => {
      const tree = frame("div", [
        svg(),
        frame("h1", [text("Title")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      // SVG untouched
      expect(tree.children[0].type).toBe("SVG");
      // h1 still transformed
      expect(tree.children[1].children[0].value).toBe("Page Title");
    });

    it("should handle span text as 'Text'", () => {
      const tree = frame("div", [
        frame("span", [text("Some random text")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].children[0].value).toBe("Text");
    });
  });

  describe("lorem mode", () => {
    it("should replace text with lorem ipsum", () => {
      const tree = frame("div", [
        frame("h1", [text("Welcome")]),
      ]);
      transformW2WTreeText(tree, "lorem");
      // Should be same length, all letters replaced
      expect(tree.children[0].children[0].value).not.toBe("Welcome");
      expect(tree.children[0].children[0].value.length).toBe("Welcome".length);
    });

    it("should preserve symbols in lorem mode", () => {
      const tree = frame("div", [
        frame("span", [text("$12 /month")]),
      ]);
      transformW2WTreeText(tree, "lorem");
      // $ and / should be preserved
      expect(tree.children[0].children[0].value).toMatch(/^\$12 \/[a-z]+$/i);
    });
  });

  describe("website mode", () => {
    it("should not modify any text", () => {
      const tree = frame("div", [
        frame("h1", [text("Original Title")]),
        frame("p", [text("Original paragraph text")]),
      ]);
      transformW2WTreeText(tree, "website");
      expect(tree.children[0].children[0].value).toBe("Original Title");
      expect(tree.children[1].children[0].value).toBe("Original paragraph text");
    });
  });

  describe("edge cases", () => {
    it("should handle empty text", () => {
      const tree = frame("div", [
        frame("span", [text("")]),
      ]);
      transformW2WTreeText(tree, "semantic");
      // Empty text should remain empty (getSemanticPlaceholder handles this)
      expect(tree.children[0].children[0].value).toBe("");
    });

    it("should handle tree with no text nodes", () => {
      const tree = frame("div", [
        frame("div", []),
        svg(),
      ]);
      // Should not throw
      transformW2WTreeText(tree, "semantic");
    });

    it("should handle tree with only text nodes at root frame", () => {
      const tree = frame("h1", [text("Big Title")]);
      transformW2WTreeText(tree, "semantic");
      expect(tree.children[0].value).toBe("Page Title");
    });

    it("should mutate in place", () => {
      const textNode = text("Hello World");
      const tree = frame("h1", [textNode]);
      transformW2WTreeText(tree, "semantic");
      // Same reference, value changed
      expect(textNode.value).toBe("Page Title");
    });
  });
});
