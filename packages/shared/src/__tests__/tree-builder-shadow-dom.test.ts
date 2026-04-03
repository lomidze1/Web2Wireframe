/**
 * Tree Builder — Shadow DOM Handling Tests (Layer #6)
 *
 * Verifies that buildElementTree correctly handles:
 * - Custom elements (tag names with hyphens) as frame containers
 * - Shadow hosts (nodes with shadowRootType) are traversed, not skipped
 * - Shadow children (from DOMSnapshot pierce:true) appear in the tree
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
  width: "400",
  height: "300",
  "box-sizing": "border-box",
};

function makeNode(
  index: number,
  parentIndex: number,
  backendNodeId: number,
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index,
    parentIndex,
    backendNodeId,
    nodeType: 1,
    nodeName: overrides.nodeName || "div",
    textContent: overrides.textContent || "",
    attributes: overrides.attributes || {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: overrides.bounds || { x: 0, y: 0, width: 400, height: 300 },
    computedStyles: {
      ...baseStyles,
      ...overrides.computedStyles,
    },
    shadowRootType: overrides.shadowRootType,
    contentDocumentIndex: overrides.contentDocumentIndex,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("buildElementTree — shadow DOM handling", () => {
  it("traverses custom element (my-component) as a frame container", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 1, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeNode(1, 0, 2, {
        nodeName: "my-component",
        shadowRootType: "open",
        bounds: { x: 0, y: 0, width: 800, height: 400 },
        computedStyles: { ...baseStyles, width: "800", height: "400" },
      }),
      makeNode(2, 1, 3, {
        nodeName: "div",
        bounds: { x: 10, y: 10, width: 780, height: 380 },
        computedStyles: { ...baseStyles, width: "780", height: "380" },
      }),
    ];

    const nodesByBackendId = new Map(nodes.map(n => [n.backendNodeId, n]));
    const matchedStylesMap = new Map();

    const tree = buildElementTree(nodes, nodesByBackendId, matchedStylesMap, {
      viewportWidth: 1440,
    });

    // my-component should be a frame, not skipped
    expect(tree.children.length).toBeGreaterThanOrEqual(1);
    const component = tree.children[0];
    expect(component).toBeDefined();
    expect(component.tag).toBe("my-component");
    expect(component.type).toBe("frame");

    // Its shadow child (div) should be traversed
    expect(component.children.length).toBeGreaterThanOrEqual(1);
    expect(component.children[0].tag).toBe("div");
  });

  it("traverses shadow host with closed shadow root", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 1, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeNode(1, 0, 2, {
        nodeName: "my-widget",
        shadowRootType: "closed",
        bounds: { x: 0, y: 0, width: 600, height: 200 },
        computedStyles: { ...baseStyles, width: "600", height: "200" },
      }),
      makeNode(2, 1, 3, {
        nodeName: "span",
        bounds: { x: 5, y: 5, width: 100, height: 30 },
        computedStyles: { ...baseStyles, width: "100", height: "30" },
      }),
    ];

    const nodesByBackendId = new Map(nodes.map(n => [n.backendNodeId, n]));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    const widget = tree.children[0];
    expect(widget).toBeDefined();
    expect(widget.tag).toBe("my-widget");
    // Closed shadow root with pierce:true still returns children
    expect(widget.children.length).toBeGreaterThanOrEqual(1);
  });

  it("handles nested custom elements", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 1, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeNode(1, 0, 2, {
        nodeName: "my-app",
        shadowRootType: "open",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeNode(2, 1, 3, {
        nodeName: "my-header",
        shadowRootType: "open",
        bounds: { x: 0, y: 0, width: 1440, height: 80 },
        computedStyles: { ...baseStyles, width: "1440", height: "80" },
      }),
      makeNode(3, 2, 4, {
        nodeName: "nav",
        bounds: { x: 10, y: 10, width: 1420, height: 60 },
        computedStyles: { ...baseStyles, width: "1420", height: "60" },
      }),
    ];

    const nodesByBackendId = new Map(nodes.map(n => [n.backendNodeId, n]));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    // my-app → my-header → nav
    const app = tree.children[0];
    expect(app.tag).toBe("my-app");
    expect(app.children.length).toBeGreaterThanOrEqual(1);

    const header = app.children[0];
    expect(header.tag).toBe("my-header");
    expect(header.children.length).toBeGreaterThanOrEqual(1);
    expect(header.children[0].tag).toBe("nav");
  });
});
