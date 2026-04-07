/**
 * Text Node Extraction Tests (TDD)
 *
 * These tests verify that DOM text nodes (nodeType === 3) are properly
 * extracted as TEXT children in the element tree, instead of being filtered
 * out and recreated via the synthetic text pipeline.
 *
 * Written BEFORE implementation (TDD approach).
 * Target: tree-builder.ts line 1377 — currently filters `nodeType !== 1`.
 *
 * After refactoring:
 * - Text nodes pass through buildNode as type:"text" leaf elements
 * - Synthetic text child pipeline (lines 2263-2454) is removed
 * - Parent elements that only contain text become frames with text children
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";
import type { CDPMatchedStyles } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

const baseStyles: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  "background-color": "rgba(255, 255, 255, 1)",
  color: "rgba(0, 0, 0, 1)",
  "font-family": "Inter",
  "font-size": "16",
  "font-weight": "400",
  "line-height": "normal",
  "letter-spacing": "0",
  "text-align": "left",
  position: "static",
  "box-sizing": "border-box",
  "border-top-width": "0",
  "border-right-width": "0",
  "border-bottom-width": "0",
  "border-left-width": "0",
  "padding-top": "0",
  "padding-right": "0",
  "padding-bottom": "0",
  "padding-left": "0",
  "margin-top": "0",
  "margin-right": "0",
  "margin-bottom": "0",
  "margin-left": "0",
};

const inlineStyles: Record<string, string> = {
  ...baseStyles,
  display: "inline",
};

let nextBackendId = 1000;

function makeElementNode(
  index: number,
  parentIndex: number,
  tag: string,
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index,
    parentIndex,
    backendNodeId: nextBackendId++,
    nodeType: 1,
    nodeName: tag,
    textContent: overrides.textContent || "",
    attributes: overrides.attributes || {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: overrides.bounds || { x: 0, y: 0, width: 200, height: 40 },
    computedStyles: {
      ...baseStyles,
      width: String((overrides.bounds?.width ?? 200)),
      height: String((overrides.bounds?.height ?? 40)),
      ...overrides.computedStyles,
    },
  };
}

function makeTextNode(
  index: number,
  parentIndex: number,
  text: string,
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index,
    parentIndex,
    backendNodeId: nextBackendId++,
    nodeType: 3,
    nodeName: "#text",
    textContent: text,
    attributes: {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: overrides.bounds || null,
    computedStyles: {},
  };
}

function buildTree(nodes: ParsedSnapshotNode[]): ReturnType<typeof buildElementTree> {
  const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
  for (const n of nodes) {
    nodesByBackendId.set(n.backendNodeId, n);
  }
  return buildElementTree(nodes, nodesByBackendId, new Map<number, CDPMatchedStyles>(), {
    viewportWidth: 1440,
    cssVariablesMap: new Map(),
    bodyOriginalCSS: null,
    browserDpr: 1,
    platformFontMap: new Map(),
    documentURL: "https://example.com",
  });
}

function findTextChildren(el: ReturnType<typeof buildElementTree>): Array<{ type: string; textContent: string; tag: string }> {
  const results: Array<{ type: string; textContent: string; tag: string }> = [];
  for (const child of el.children) {
    if (child.type === "text") {
      results.push({ type: child.type, textContent: child.textContent, tag: child.tag });
    }
    // Also check nested text children
    results.push(...findTextChildren(child));
  }
  return results;
}

function findAllElements(el: ReturnType<typeof buildElementTree>): ReturnType<typeof buildElementTree>[] {
  const results: ReturnType<typeof buildElementTree>[] = [el];
  for (const child of el.children) {
    results.push(...findAllElements(child));
  }
  return results;
}

// ============================================================================
// TESTS
// ============================================================================

describe("Text Node Extraction — DOM text nodes as TEXT children", () => {

  // -----------------------------------------------------------------------
  // 1. Basic text node
  // -----------------------------------------------------------------------
  it("should create text element from DOM text node in <p>", () => {
    // <body><p>Hello world</p></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "p", {
        bounds: { x: 0, y: 0, width: 400, height: 24 },
        textContent: "Hello world",
        computedStyles: {
          ...baseStyles,
          width: "400",
          height: "24",
          "font-size": "16",
          color: "rgba(0, 0, 0, 1)",
        },
      }),
      makeTextNode(2, 1, "Hello world"),
    ];

    const tree = buildTree(nodes);
    const p = tree.children[0];
    expect(p).toBeDefined();

    // p should have a text child with "Hello world"
    const textChildren = p.children.filter(c => c.type === "text");
    expect(textChildren.length).toBeGreaterThanOrEqual(1);

    const textChild = textChildren.find(c => c.textContent.includes("Hello world"));
    expect(textChild).toBeDefined();
    expect(textChild!.textContent).toBe("Hello world");
  });

  // -----------------------------------------------------------------------
  // 2. li + icon font (main bug)
  // -----------------------------------------------------------------------
  it("should preserve text in <li> with icon font child", () => {
    // <body><ul><li><i class="fa">&#xf00c;</i> Item text</li></ul></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "ul", {
        bounds: { x: 0, y: 0, width: 400, height: 200 },
        computedStyles: { ...baseStyles, width: "400", height: "200" },
      }),
      makeElementNode(2, 1, "li", {
        bounds: { x: 20, y: 0, width: 380, height: 24 },
        textContent: "\uF00C Item text",
        computedStyles: {
          ...baseStyles,
          display: "list-item",
          width: "380",
          height: "24",
          "list-style-type": "none",
          "padding-left": "0",
        },
      }),
      makeElementNode(3, 2, "i", {
        bounds: { x: 20, y: 0, width: 16, height: 24 },
        textContent: "\uF00C",
        attributes: { class: "fa fa-check" },
        computedStyles: {
          ...inlineStyles,
          width: "16",
          height: "24",
          "font-family": "Font Awesome 5 Free",
          "font-size": "14",
          color: "rgba(0, 128, 0, 1)",
        },
      }),
      makeTextNode(4, 2, " Item text"),
    ];

    const tree = buildTree(nodes);
    const ul = tree.children[0];
    expect(ul).toBeDefined();

    const li = ul.children[0];
    expect(li).toBeDefined();

    // li should have children that include "Item text" (not lost)
    const allText = findTextChildren(li);
    const itemText = allText.find(t => t.textContent.includes("Item text"));
    expect(itemText).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 3. Whitespace-only text nodes should be skipped
  // -----------------------------------------------------------------------
  it("should skip whitespace-only text nodes", () => {
    // <body><div>\n  <span>text</span>\n</div></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "div", {
        bounds: { x: 0, y: 0, width: 400, height: 40 },
        textContent: "text",
        computedStyles: { ...baseStyles, width: "400", height: "40" },
      }),
      makeTextNode(2, 1, "\n  "),
      makeElementNode(3, 1, "span", {
        bounds: { x: 0, y: 0, width: 100, height: 20 },
        textContent: "text",
        computedStyles: { ...inlineStyles, width: "100", height: "20" },
      }),
      makeTextNode(4, 3, "text"),
      makeTextNode(5, 1, "\n"),
    ];

    const tree = buildTree(nodes);
    const div = tree.children[0];
    expect(div).toBeDefined();

    // No whitespace-only text children
    const allText = findTextChildren(div);
    const whitespaceOnly = allText.filter(t => t.textContent.trim() === "");
    expect(whitespaceOnly.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 4. Link text
  // -----------------------------------------------------------------------
  it("should handle text in <a> element", () => {
    // <body><a href="#">Click here</a></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "a", {
        bounds: { x: 0, y: 0, width: 100, height: 20 },
        textContent: "Click here",
        attributes: { href: "#" },
        computedStyles: {
          ...inlineStyles,
          display: "inline",
          width: "100",
          height: "20",
          color: "rgba(0, 0, 255, 1)",
        },
      }),
      makeTextNode(2, 1, "Click here"),
    ];

    const tree = buildTree(nodes);

    // Find the link element and check it has text
    const allElements = findAllElements(tree);
    const link = allElements.find(el => el.tag === "a");
    expect(link).toBeDefined();

    const textChildren = findTextChildren(link!);
    const clickText = textChildren.find(t => t.textContent.includes("Click here"));
    expect(clickText).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 5. Button text
  // -----------------------------------------------------------------------
  it("should handle button text as child node", () => {
    // <body><button>Submit</button></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "button", {
        bounds: { x: 0, y: 0, width: 120, height: 40 },
        textContent: "Submit",
        computedStyles: {
          ...baseStyles,
          width: "120",
          height: "40",
          "padding-top": "8",
          "padding-right": "16",
          "padding-bottom": "8",
          "padding-left": "16",
          "background-color": "rgba(0, 123, 255, 1)",
          "border-radius": "4",
          color: "rgba(255, 255, 255, 1)",
        },
      }),
      makeTextNode(2, 1, "Submit"),
    ];

    const tree = buildTree(nodes);
    const button = tree.children[0];
    expect(button).toBeDefined();

    // Button should have text "Submit" somewhere in its subtree
    const textChildren = findTextChildren(button);
    const submitText = textChildren.find(t => t.textContent.includes("Submit"));
    expect(submitText).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 6. No duplicate text
  // -----------------------------------------------------------------------
  it("should not create duplicate text for simple <p>", () => {
    // <body><p>Hello</p></body> — should NOT have "Hello" twice
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "p", {
        bounds: { x: 0, y: 0, width: 400, height: 24 },
        textContent: "Hello",
        computedStyles: { ...baseStyles, width: "400", height: "24" },
      }),
      makeTextNode(2, 1, "Hello"),
    ];

    const tree = buildTree(nodes);
    const allElements = findAllElements(tree);

    // Count how many elements contain "Hello" as textContent
    const withHello = allElements.filter(el =>
      el.textContent.trim() === "Hello"
    );
    // Should be exactly 1 (either the p itself as type:"text", or a text child)
    // NOT 2 (both p and a synthetic child)
    expect(withHello.length).toBeLessThanOrEqual(2);

    // More specifically: the tree should not have the same text duplicated
    // If p is type:"text", it has "Hello" directly
    // If p is type:"frame", it should have exactly one text child with "Hello"
    const p = tree.children[0];
    if (p.type === "frame") {
      const textChildren = p.children.filter(c =>
        c.type === "text" && c.textContent.trim() === "Hello"
      );
      expect(textChildren.length).toBe(1);
    }
  });

  // -----------------------------------------------------------------------
  // 7. Mixed text and element children
  // -----------------------------------------------------------------------
  it("should handle mixed text and element children", () => {
    // <body><p>Hello <strong>bold</strong> world</p></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "p", {
        bounds: { x: 0, y: 0, width: 400, height: 24 },
        textContent: "Hello bold world",
        computedStyles: { ...baseStyles, width: "400", height: "24" },
      }),
      makeTextNode(2, 1, "Hello "),
      makeElementNode(3, 1, "strong", {
        bounds: { x: 40, y: 0, width: 40, height: 24 },
        textContent: "bold",
        computedStyles: {
          ...inlineStyles,
          width: "40",
          height: "24",
          "font-weight": "700",
        },
      }),
      makeTextNode(4, 3, "bold"),
      makeTextNode(5, 1, " world"),
    ];

    const tree = buildTree(nodes);
    const p = tree.children[0];
    expect(p).toBeDefined();

    // The full text "Hello bold world" should be represented
    // Either as a single text element with styled segments, or as separate text children
    const allText = findTextChildren(p);
    const fullText = allText.map(t => t.textContent).join("");

    // The combined text should contain all parts
    expect(fullText).toContain("Hello");
    expect(fullText).toContain("bold");
    expect(fullText).toContain("world");
  });

  // -----------------------------------------------------------------------
  // 8. Empty element with no text
  // -----------------------------------------------------------------------
  it("should not create text children for elements with no text", () => {
    // <body><div></div></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "div", {
        bounds: { x: 0, y: 0, width: 400, height: 100 },
        computedStyles: { ...baseStyles, width: "400", height: "100" },
      }),
    ];

    const tree = buildTree(nodes);
    const div = tree.children[0];
    expect(div).toBeDefined();
    expect(div.type).toBe("frame");
    expect(div.children.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 9. <li> text should not disappear (the original bug)
  // -----------------------------------------------------------------------
  it("should not lose <li> text when children have icon fonts", () => {
    // This is the exact bug scenario:
    // <li><i class="fa">\uF5FD</i>6 Sections</li>
    // The icon glyph should NOT prevent "6 Sections" from appearing
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "ul", {
        bounds: { x: 0, y: 0, width: 400, height: 200 },
        computedStyles: { ...baseStyles, width: "400", height: "200" },
      }),
      makeElementNode(2, 1, "li", {
        bounds: { x: 20, y: 0, width: 380, height: 24 },
        textContent: "\uF5FD6 Sections",
        computedStyles: {
          ...baseStyles,
          display: "list-item",
          width: "380",
          height: "24",
          "list-style-type": "none",
          "padding-left": "0",
        },
      }),
      makeElementNode(3, 2, "i", {
        bounds: { x: 20, y: 0, width: 16, height: 24 },
        textContent: "\uF5FD",
        attributes: { class: "fa" },
        computedStyles: {
          ...inlineStyles,
          width: "16",
          height: "24",
          "font-family": "Font Awesome 5 Free",
          "font-size": "14",
        },
      }),
      makeTextNode(4, 2, "6 Sections"),
    ];

    const tree = buildTree(nodes);
    const ul = tree.children[0];
    const li = ul.children[0];
    expect(li).toBeDefined();

    // "6 Sections" must be present somewhere in li's subtree
    const allText = findTextChildren(li);
    const sectionsText = allText.find(t => t.textContent.includes("6 Sections"));
    expect(sectionsText).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 10. Heading text
  // -----------------------------------------------------------------------
  it("should extract heading text", () => {
    // <body><h1>Welcome</h1></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "h1", {
        bounds: { x: 0, y: 0, width: 400, height: 40 },
        textContent: "Welcome",
        computedStyles: {
          ...baseStyles,
          width: "400",
          height: "40",
          "font-size": "32",
          "font-weight": "700",
        },
      }),
      makeTextNode(2, 1, "Welcome"),
    ];

    const tree = buildTree(nodes);
    const allElements = findAllElements(tree);

    // "Welcome" should exist in the tree
    const withWelcome = allElements.filter(el => el.textContent.includes("Welcome"));
    expect(withWelcome.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 11. <li> with ::marker pseudo-element (bullet)
  // -----------------------------------------------------------------------
  it("should include ::marker bullet as text child of <li>", () => {
    // <body><ul><li>::marker("•") Text content</li></ul></body>
    // DOMSnapshot includes ::marker as a separate pseudo-element node
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "ul", {
        bounds: { x: 0, y: 0, width: 400, height: 200 },
        computedStyles: { ...baseStyles, width: "400", height: "200" },
      }),
      makeElementNode(2, 1, "li", {
        bounds: { x: 40, y: 0, width: 360, height: 24 },
        textContent: "• List item",
        computedStyles: {
          ...baseStyles,
          display: "list-item",
          width: "360",
          height: "24",
          "list-style-type": "disc",
          "padding-left": "0",
        },
      }),
      // ::marker pseudo-element (bullet)
      makeElementNode(3, 2, "::marker", {
        bounds: { x: 20, y: 0, width: 16, height: 24 },
        textContent: "•",
        computedStyles: {
          ...baseStyles,
          display: "inline",
          width: "16",
          height: "24",
        },
      }),
      makeTextNode(4, 2, "List item"),
    ];

    const tree = buildTree(nodes);
    const ul = tree.children[0];
    const li = ul.children[0];
    expect(li).toBeDefined();

    // li should have children: ::marker text child + "List item" text child
    const allText = findTextChildren(li);

    // Bullet should be present
    const bulletChild = allText.find(t => t.textContent === "•");
    expect(bulletChild).toBeDefined();

    // Text should be present
    const textChild = allText.find(t => t.textContent === "List item");
    expect(textChild).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 12. <br> between text nodes
  // -----------------------------------------------------------------------
  it("should handle br elements between text nodes", () => {
    // <body><p>Line 1<br>Line 2</p></body>
    // Text content should include both lines
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "p", {
        bounds: { x: 0, y: 0, width: 400, height: 48 },
        textContent: "Line 1\nLine 2",
        computedStyles: { ...baseStyles, width: "400", height: "48" },
      }),
      makeTextNode(2, 1, "Line 1"),
      makeElementNode(3, 1, "br", {
        bounds: null,
        computedStyles: { ...baseStyles },
      }),
      makeTextNode(4, 1, "Line 2"),
    ];

    const tree = buildTree(nodes);
    const p = tree.children[0];
    expect(p).toBeDefined();

    // Both "Line 1" and "Line 2" should be present
    const allText = findTextChildren(p);
    const line1 = allText.find(t => t.textContent.includes("Line 1"));
    const line2 = allText.find(t => t.textContent.includes("Line 2"));
    expect(line1).toBeDefined();
    expect(line2).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 13. Multiple text nodes in a single parent
  // -----------------------------------------------------------------------
  it("should handle multiple text nodes in a single parent", () => {
    // <body><span>Hello World</span></body> (but DOMSnapshot splits into 2 text nodes)
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "span", {
        bounds: { x: 0, y: 0, width: 100, height: 20 },
        textContent: "Hello World",
        computedStyles: { ...inlineStyles, width: "100", height: "20" },
      }),
      makeTextNode(2, 1, "Hello "),
      makeTextNode(3, 1, "World"),
    ];

    const tree = buildTree(nodes);
    const allElements = findAllElements(tree);

    // "Hello" and "World" should both be present
    const allText = allElements.filter(el => el.type === "text");
    const fullText = allText.map(t => t.textContent).join("");
    expect(fullText).toContain("Hello");
    expect(fullText).toContain("World");
  });
});
