/**
 * Text Node Extraction Tests
 *
 * Verifies text handling in the element tree:
 * - type=text parents (h1, h2, p, span, button) carry text directly — no duplicate children
 * - type=frame parents (li, a, div) get text from DOM text node children
 * - Icon font glyphs don't prevent text extraction
 * - Whitespace-only text nodes are skipped
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
  "background-color": "rgba(0, 0, 0, 0)",
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

describe("Text Node Extraction", () => {

  // -----------------------------------------------------------------------
  // 1. type=text parent carries text directly (no duplicate child)
  // -----------------------------------------------------------------------
  it("should have <p> as type=text with textContent, no duplicate text child", () => {
    // <body><p>Hello world</p></body>
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "p", {
        bounds: { x: 0, y: 0, width: 400, height: 24 },
        textContent: "Hello world",
        computedStyles: { ...baseStyles, width: "400", height: "24" },
      }),
      makeTextNode(2, 1, "Hello world"),
    ];

    const tree = buildTree(nodes);
    const p = tree.children[0];
    expect(p).toBeDefined();
    // p is type=text (leaf TEXT_TAG) — carries text directly
    expect(p.type).toBe("text");
    expect(p.textContent).toBe("Hello world");
    // No duplicate: text child should NOT exist
    expect(p.children.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 2. li + icon font (main bug fix)
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
  // 4. Link text — <a> is type=frame, text child is created
  // -----------------------------------------------------------------------
  it("should handle text in <a> element via text child", () => {
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
    const allElements = findAllElements(tree);
    const link = allElements.find(el => el.tag === "a");
    expect(link).toBeDefined();

    // <a> gets synthetic text child from pipeline (not DOM text node child)
    // Text should be present either on link or in its subtree
    const linkHasText = link!.textContent.includes("Click here") ||
      findTextChildren(link!).some(t => t.textContent.includes("Click here"));
    expect(linkHasText).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5. Button — type=text carries text directly (TEXT_TAG)
  // -----------------------------------------------------------------------
  it("should handle button text directly on element", () => {
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
    const allElements = findAllElements(tree);
    // "Submit" should be present somewhere in the tree
    const hasSubmit = allElements.some(el => el.textContent.includes("Submit"));
    expect(hasSubmit).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 6. No duplicate text — type=text parent + no text child
  // -----------------------------------------------------------------------
  it("should not create duplicate text for simple <p>", () => {
    // <body><p>Hello</p></body>
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

    // "Hello" should appear exactly once in the tree
    const withHello = allElements.filter(el => el.textContent.trim() === "Hello");
    expect(withHello.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 7. Mixed content — p has inline children, uses styledSegments
  // -----------------------------------------------------------------------
  it("should handle mixed text and element children via styledSegments", () => {
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
    const allElements = findAllElements(tree);

    // Full text "Hello bold world" should be present in the tree
    const fullText = allElements.map(el => el.textContent).join(" ");
    expect(fullText).toContain("Hello");
    expect(fullText).toContain("bold");
    expect(fullText).toContain("world");
  });

  // -----------------------------------------------------------------------
  // 8. Empty element — no text
  // -----------------------------------------------------------------------
  it("should not create text children for elements with no text", () => {
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
    expect(div.type).toBe("frame");
    expect(div.children.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 9. <li> text should not disappear with icon fonts
  // -----------------------------------------------------------------------
  it("should not lose <li> text when children have icon fonts", () => {
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

    const allText = findTextChildren(li);
    const sectionsText = allText.find(t => t.textContent.includes("6 Sections"));
    expect(sectionsText).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 10. Heading — type=text, carries text directly
  // -----------------------------------------------------------------------
  it("should extract heading text on element directly", () => {
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
    const h1 = tree.children[0];
    expect(h1.type).toBe("text");
    expect(h1.textContent).toBe("Welcome");
    // No duplicate child
    expect(h1.children.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 11. ::marker bullet as text child of <li>
  // -----------------------------------------------------------------------
  it("should include ::marker bullet as text child of <li>", () => {
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
        textContent: "\u2022 List item",
        computedStyles: {
          ...baseStyles,
          display: "list-item",
          width: "360",
          height: "24",
          "list-style-type": "disc",
          "padding-left": "0",
        },
      }),
      makeElementNode(3, 2, "::marker", {
        bounds: { x: 20, y: 0, width: 16, height: 24 },
        textContent: "\u2022",
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
    const allText = findTextChildren(li);

    const bulletChild = allText.find(t => t.textContent === "\u2022");
    expect(bulletChild).toBeDefined();

    const textChild = allText.find(t => t.textContent === "List item");
    expect(textChild).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 12. <a> with text node child (type=frame, gets text child)
  // -----------------------------------------------------------------------
  it("should create text child for <a> element (type=frame)", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "div", {
        bounds: { x: 0, y: 0, width: 400, height: 40 },
        computedStyles: { ...baseStyles, width: "400", height: "40" },
      }),
      makeElementNode(2, 1, "a", {
        bounds: { x: 0, y: 0, width: 100, height: 20 },
        textContent: "Link text",
        attributes: { href: "#" },
        computedStyles: { ...inlineStyles, width: "100", height: "20" },
      }),
      makeTextNode(3, 2, "Link text"),
    ];

    const tree = buildTree(nodes);
    const div = tree.children[0];
    const a = div.children[0];
    expect(a).toBeDefined();

    // <a> is excluded from TEXT_TAGS skip — text child should be created
    const textChildren = findTextChildren(a);
    const linkText = textChildren.find(t => t.textContent.includes("Link text"));
    expect(linkText).toBeDefined();
  });
});
