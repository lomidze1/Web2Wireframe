/**
 * Body Variable Extraction Tests
 *
 * Tests that CSS variable references are correctly extracted from bodyOriginalCSS
 * when matchedStyles is not available for the body element.
 *
 * Bug: Body/HTML element fills were missing cssVariable refs because the extraction
 * code only ran inside `if (matchedStyles)`, but body typically lacks matchedStyles.
 * Fix: Added `else if (tag === "body" && bodyOriginalCSS)` fallback.
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";

// ============================================================================
// Helpers
// ============================================================================

function makeBodyNode(
  computedStyles: Record<string, string>,
  overrides?: Partial<ParsedSnapshotNode>
): ParsedSnapshotNode {
  return {
    index: 0,
    backendNodeId: 1,
    nodeType: 1,
    nodeName: "body",
    parentIndex: -1,
    attributes: {},
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    computedStyles: {
      display: "block",
      visibility: "visible",
      opacity: "1",
      overflow: "visible",
      position: "static",
      "background-color": "rgb(17, 21, 26)",
      ...computedStyles,
    },
    textContent: "",
    isClickable: false,
    needsMatchedStyles: false,
    ...overrides,
  };
}

function makeChildNode(
  index: number,
  tag: string,
  computedStyles: Record<string, string>,
  overrides?: Partial<ParsedSnapshotNode>
): ParsedSnapshotNode {
  return {
    index,
    backendNodeId: index + 1,
    nodeType: 1,
    nodeName: tag,
    parentIndex: 0,
    attributes: {},
    bounds: { x: 0, y: 0, width: 1440, height: 100 },
    computedStyles: {
      display: "block",
      visibility: "visible",
      opacity: "1",
      overflow: "visible",
      position: "static",
      "background-color": "rgba(0, 0, 0, 0)",
      ...computedStyles,
    },
    textContent: tag === "p" ? "Hello" : "",
    isClickable: false,
    needsMatchedStyles: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("body CSS variable extraction", () => {
  it("extracts bgVariableRef from bodyOriginalCSS.background when matchedStyles is absent", () => {
    const bodyNode = makeBodyNode({
      "background-color": "rgb(17, 21, 26)",
    });
    const childNode = makeChildNode(1, "div", {
      "background-color": "rgba(0, 0, 0, 0)",
    });

    const nodes = [bodyNode, childNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const result = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      bodyOriginalCSS: {
        background: "var(--bg-dark)",
        backgroundImage: null,
        backgroundColor: null,
        selector: "body",
      },
    });

    // The root element (body) should have fills with cssVariable set
    expect(result.fills).toBeDefined();
    expect(result.fills!.length).toBeGreaterThan(0);
    expect(result.fills![0].cssVariable).toBe("--bg-dark");
  });

  it("extracts bgColorVariableRef from bodyOriginalCSS.backgroundColor", () => {
    const bodyNode = makeBodyNode({
      "background-color": "rgb(247, 248, 251)",
    });
    const childNode = makeChildNode(1, "div", {
      "background-color": "rgba(0, 0, 0, 0)",
    });

    const nodes = [bodyNode, childNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const result = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      bodyOriginalCSS: {
        background: null,
        backgroundImage: null,
        backgroundColor: "var(--surface-bg)",
        selector: "body",
      },
    });

    expect(result.fills).toBeDefined();
    expect(result.fills!.length).toBeGreaterThan(0);
    expect(result.fills![0].cssVariable).toBe("--surface-bg");
  });

  it("does not set cssVariable when bodyOriginalCSS has no var() references", () => {
    const bodyNode = makeBodyNode({
      "background-color": "rgb(255, 255, 255)",
    });
    const childNode = makeChildNode(1, "div", {
      "background-color": "rgba(0, 0, 0, 0)",
    });

    const nodes = [bodyNode, childNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const result = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      bodyOriginalCSS: {
        background: "#ffffff",
        backgroundImage: null,
        backgroundColor: "#ffffff",
        selector: "body",
      },
    });

    expect(result.fills).toBeDefined();
    if (result.fills!.length > 0) {
      expect(result.fills![0].cssVariable).toBeUndefined();
    }
  });

  it("does not set cssVariable when bodyOriginalCSS is null", () => {
    const bodyNode = makeBodyNode({
      "background-color": "rgb(17, 21, 26)",
    });
    const childNode = makeChildNode(1, "div", {
      "background-color": "rgba(0, 0, 0, 0)",
    });

    const nodes = [bodyNode, childNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const result = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      bodyOriginalCSS: null,
    });

    expect(result.fills).toBeDefined();
    if (result.fills!.length > 0) {
      expect(result.fills![0].cssVariable).toBeUndefined();
    }
  });

  it("prefers background shorthand var() over backgroundColor var()", () => {
    const bodyNode = makeBodyNode({
      "background-color": "rgb(17, 21, 26)",
    });
    const childNode = makeChildNode(1, "div", {
      "background-color": "rgba(0, 0, 0, 0)",
    });

    const nodes = [bodyNode, childNode];
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const result = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      bodyOriginalCSS: {
        background: "var(--bg-shorthand)",
        backgroundImage: null,
        backgroundColor: "var(--bg-color-prop)",
        selector: "body",
      },
    });

    expect(result.fills).toBeDefined();
    expect(result.fills!.length).toBeGreaterThan(0);
    // bgVariableRef (from background shorthand) takes priority over bgColorVariableRef
    expect(result.fills![0].cssVariable).toBe("--bg-shorthand");
  });
});
