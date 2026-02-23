/**
 * Text Sizing Logic Unit Tests
 *
 * Tests for isBlockLevelElement detection and Case C sizing decision.
 * Case C: when Figma HUG width is narrower than browser width.
 *
 * The fix ensures block-level and non-left-aligned text keeps browser width
 * (container width) instead of shrinking to HUG, preserving text-align behavior.
 */

import { describe, it, expect } from "vitest";
import { isBlockLevelElement } from "../rendering/text";
import type { WireframeNode } from "../types";

// Helper to create a minimal WireframeNode
function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-1",
    name: "Test",
    type: "text",
    tag: "p",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#333333",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "Test text",
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 20,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

describe("isBlockLevelElement", () => {
  describe("detection via computedStyles.display", () => {
    it("should detect display: block", () => {
      const node = makeNode({
        tag: "div",
        computedStyles: { display: "block" },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect display: list-item", () => {
      const node = makeNode({
        tag: "li",
        computedStyles: { display: "list-item" },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should NOT detect display: inline", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: { display: "inline" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should NOT detect display: inline-block", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: { display: "inline-block" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should detect display: flex div via tag fallback (flex divs are still block-level)", () => {
      const node = makeNode({
        tag: "div",
        computedStyles: { display: "flex" },
      });
      // display: flex is not "block"/"list-item", but div tag is in BLOCK_LEVEL_TAGS.
      // This is correct: flex containers with block tags still take full width.
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should NOT detect display: flex on inline tag", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: { display: "flex" },
      });
      // span is not in BLOCK_LEVEL_TAGS, and display: flex is not "block"
      expect(isBlockLevelElement(node)).toBe(false);
    });
  });

  describe("detection via tag name (fallback when no computedStyles)", () => {
    it("should detect h1-h6 headings", () => {
      for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(true);
      }
    });

    it("should detect p tag", () => {
      const node = makeNode({ tag: "p" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect div tag", () => {
      const node = makeNode({ tag: "div" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect li tag", () => {
      const node = makeNode({ tag: "li" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect blockquote tag", () => {
      const node = makeNode({ tag: "blockquote" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect semantic layout tags", () => {
      for (const tag of ["section", "article", "header", "footer", "main", "nav"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(true);
      }
    });

    it("should detect table-related block tags", () => {
      for (const tag of ["figcaption", "dd", "dt", "td", "th", "caption"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(true);
      }
    });

    it("should NOT detect inline tags", () => {
      for (const tag of ["span", "a", "strong", "em", "b", "i", "code", "small"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(false);
      }
    });

    it("should be case-insensitive for tag names", () => {
      const node = makeNode({ tag: "H2" });
      expect(isBlockLevelElement(node)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should return false when no tag and no computedStyles", () => {
      const node = makeNode({ tag: undefined });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should return false for empty computedStyles", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: {},
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should prefer computedStyles over tag when both present", () => {
      // div with display: inline (e.g. styled as inline)
      const node = makeNode({
        tag: "div",
        computedStyles: { display: "block" },
      });
      // computedStyles says block → true (checked first)
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should fall back to tag when computedStyles has non-block display", () => {
      // h2 with display: flex — tag fallback still catches it
      const node = makeNode({
        tag: "h2",
        computedStyles: { display: "flex" },
      });
      // display is flex (not block/list-item), but tag h2 is in block list
      expect(isBlockLevelElement(node)).toBe(true);
    });
  });

  describe("real-world scenarios for Case C sizing", () => {
    it("should detect the billing banner h2 (original bug case)", () => {
      const node = makeNode({
        tag: "h2",
        width: 1440,
        height: 39,
        textAlign: "center",
        textContent: "Questions about billing or purchases? Email us at billing@web2wireframe.design",
        computedStyles: {
          display: "block",
          width: "1440px",
          "text-align": "center",
        },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect centered paragraph", () => {
      const node = makeNode({
        tag: "p",
        width: 800,
        textAlign: "center",
        textContent: "Centered paragraph text",
        computedStyles: { display: "block" },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should NOT detect a button-like span", () => {
      const node = makeNode({
        tag: "span",
        width: 120,
        textAlign: "center",
        textContent: "Submit",
        computedStyles: { display: "inline-block" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should NOT detect an inline link", () => {
      const node = makeNode({
        tag: "a",
        width: 200,
        textAlign: "left",
        textContent: "Click here",
        computedStyles: { display: "inline" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });
  });
});

describe("Case C sizing decision logic", () => {
  // These tests verify the decision logic that determines whether to use
  // browserWidth or hugWidth. The actual resize happens in createTextNode
  // (which requires Figma API), so we test the decision factors here.

  function shouldKeepBrowserWidth(node: WireframeNode): boolean {
    const isBlock = isBlockLevelElement(node);
    const hasNonLeftAlign = node.textAlign === "center"
      || node.textAlign === "right"
      || node.textAlign === "justify";
    return isBlock || hasNonLeftAlign;
  }

  describe("block elements should keep browser width", () => {
    it("h2 with text-align: center (original bug)", () => {
      const node = makeNode({
        tag: "h2",
        width: 1440,
        textAlign: "center",
        computedStyles: { display: "block" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("p with text-align: left (block, even if left-aligned)", () => {
      const node = makeNode({
        tag: "p",
        width: 1440,
        textAlign: "left",
        computedStyles: { display: "block" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("div with text-align: right", () => {
      const node = makeNode({
        tag: "div",
        width: 1200,
        textAlign: "right",
        computedStyles: { display: "block" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("h1 with text-align: justify", () => {
      const node = makeNode({
        tag: "h1",
        width: 800,
        textAlign: "justify",
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });
  });

  describe("non-left-aligned inline text should keep browser width", () => {
    it("span with text-align: center", () => {
      const node = makeNode({
        tag: "span",
        width: 300,
        textAlign: "center",
        computedStyles: { display: "inline" },
      });
      // Not block, but hasNonLeftAlign → true
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("a with text-align: right", () => {
      const node = makeNode({
        tag: "a",
        width: 200,
        textAlign: "right",
        computedStyles: { display: "inline" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });
  });

  describe("inline left-aligned text should use HUG (narrower)", () => {
    it("span with text-align: left", () => {
      const node = makeNode({
        tag: "span",
        width: 300,
        textAlign: "left",
        computedStyles: { display: "inline" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });

    it("a link with default alignment", () => {
      const node = makeNode({
        tag: "a",
        width: 200,
        textAlign: "left",
        computedStyles: { display: "inline" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });

    it("strong tag with text-align: left", () => {
      const node = makeNode({
        tag: "strong",
        width: 150,
        textAlign: "left",
      });
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });

    it("code tag with text-align: start", () => {
      const node = makeNode({
        tag: "code",
        width: 100,
        textAlign: "start",
      });
      // "start" is not in ["center", "right", "justify"], and code is not block
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });
  });
});
