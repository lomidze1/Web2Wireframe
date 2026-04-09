/**
 * Pseudo-Element Absolute Positioning Tests
 *
 * Tests that ::before/::after pseudo-elements with `position: absolute`
 * preserve their CSS position value through buildElementTree, so that
 * the Figma rendering layer can set `layoutPositioning = "ABSOLUTE"`.
 *
 * Bug: BUG-002 — bullet "•" with `position: absolute; left: 0` was
 * rendered in auto-layout flow instead of absolute positioning because
 * createSyntheticTextChild hardcoded `position: "relative"`.
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";

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
};

function makeNode(
  index: number,
  nodeName: string,
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index,
    parentIndex: -1,
    backendNodeId: 100 + index,
    nodeType: 1,
    nodeName,
    textContent: "",
    attributes: {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    computedStyles: { ...baseStyles },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("Pseudo-element absolute positioning (BUG-002)", () => {
  it("::before with position:absolute preserves absolute position", () => {
    // Setup: <body> > <li> > ::before (position: absolute)
    const body = makeNode(0, "body");
    const li = makeNode(1, "li", {
      parentIndex: 0,
      bounds: { x: 0, y: 0, width: 400, height: 24 },
      textContent: "Colors: plugin only",
      computedStyles: {
        ...baseStyles,
        display: "list-item",
        position: "relative",
        "padding-left": "20px",
        "background-color": "rgba(0, 0, 0, 0)",
      },
    });
    const beforePseudo = makeNode(2, "::before", {
      parentIndex: 1,
      bounds: { x: 0, y: 0, width: 10, height: 24 },
      textContent: "\u2022", // bullet •
      computedStyles: {
        ...baseStyles,
        display: "inline",
        position: "absolute",
        left: "0px",
        color: "rgba(59, 130, 246, 1)",
        "background-color": "rgba(0, 0, 0, 0)",
        "font-family": "Inter",
        "font-size": "16",
      },
    });

    const nodes = [body, li, beforePseudo];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    // Find the ::before child — it should be a child of the <li> element
    const liElement = tree.children[0];
    expect(liElement).toBeDefined();
    expect(liElement.tag).toBe("li");

    // Find the pseudo-element text child (tagged as ::before)
    const beforeChild = liElement.children.find((c) => c.tag === "::before");
    expect(beforeChild).toBeDefined();
    expect(beforeChild!.position).toBe("absolute");
    expect(beforeChild!.textContent).toBe("\u2022");
  });

  it("::before with position:relative keeps relative position (default)", () => {
    const body = makeNode(0, "body");
    const li = makeNode(1, "li", {
      parentIndex: 0,
      bounds: { x: 0, y: 0, width: 400, height: 24 },
      textContent: "Item text",
      computedStyles: {
        ...baseStyles,
        display: "list-item",
        "background-color": "rgba(0, 0, 0, 0)",
      },
    });
    const beforePseudo = makeNode(2, "::before", {
      parentIndex: 1,
      bounds: { x: 0, y: 0, width: 10, height: 24 },
      textContent: "\u2022",
      computedStyles: {
        ...baseStyles,
        display: "inline",
        position: "relative",
        color: "rgba(0, 0, 0, 1)",
        "background-color": "rgba(0, 0, 0, 0)",
      },
    });

    const nodes = [body, li, beforePseudo];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    const liElement = tree.children[0];
    const beforeChild = liElement?.children.find((c) => c.tag === "::before");
    expect(beforeChild).toBeDefined();
    expect(beforeChild!.position).toBe("relative");
  });

  it("::after with position:fixed preserves fixed position", () => {
    const body = makeNode(0, "body");
    const div = makeNode(1, "div", {
      parentIndex: 0,
      bounds: { x: 0, y: 0, width: 400, height: 24 },
      textContent: "",
      computedStyles: {
        ...baseStyles,
        "background-color": "rgba(0, 0, 0, 0)",
      },
    });
    const afterPseudo = makeNode(2, "::after", {
      parentIndex: 1,
      bounds: { x: 100, y: 50, width: 20, height: 20 },
      textContent: "X",
      computedStyles: {
        ...baseStyles,
        display: "inline",
        position: "fixed",
        color: "rgba(255, 0, 0, 1)",
        "background-color": "rgba(0, 0, 0, 0)",
      },
    });

    const nodes = [body, div, afterPseudo];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    const divElement = tree.children[0];
    const afterChild = divElement?.children.find((c) => c.tag === "::after");
    expect(afterChild).toBeDefined();
    expect(afterChild!.position).toBe("fixed");
  });

  it("::before with position:static gets default relative", () => {
    const body = makeNode(0, "body");
    const li = makeNode(1, "li", {
      parentIndex: 0,
      bounds: { x: 0, y: 0, width: 400, height: 24 },
      textContent: "Item",
      computedStyles: {
        ...baseStyles,
        display: "list-item",
        "background-color": "rgba(0, 0, 0, 0)",
      },
    });
    const beforePseudo = makeNode(2, "::before", {
      parentIndex: 1,
      bounds: { x: 0, y: 0, width: 10, height: 24 },
      textContent: "-",
      computedStyles: {
        ...baseStyles,
        display: "inline",
        position: "static",
        "background-color": "rgba(0, 0, 0, 0)",
      },
    });

    const nodes = [body, li, beforePseudo];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    const liElement = tree.children[0];
    const beforeChild = liElement?.children.find((c) => c.tag === "::before");
    expect(beforeChild).toBeDefined();
    // static should default to "relative" (the createSyntheticTextChild default)
    expect(beforeChild!.position).toBe("relative");
  });
});
