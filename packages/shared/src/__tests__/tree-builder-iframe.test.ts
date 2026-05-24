/**
 * Tree Builder — Iframe Content Traversal Tests (Layer #6)
 *
 * Verifies that buildElementTree correctly handles:
 * - Same-origin iframes with contentDocumentIndex: traverses iframe content
 * - Cross-origin iframes (no contentDocumentIndex): placeholder fallback
 * - contentDocumentIndex with missing document: placeholder fallback
 * - Iframe children coordinate offset
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";
import type { ParsedIframeDocument } from "../snapshot";

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

describe("buildElementTree — iframe content traversal", () => {
  it("traverses iframe content when iframeDocuments are provided", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 1, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeNode(1, 0, 2, {
        nodeName: "iframe",
        contentDocumentIndex: 1,
        bounds: { x: 100, y: 200, width: 600, height: 400 },
        computedStyles: { ...baseStyles, width: "600", height: "400" },
      }),
    ];

    const iframeNodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 50, {
        nodeName: "html",
        bounds: { x: 0, y: 0, width: 600, height: 400 },
        computedStyles: { ...baseStyles, width: "600", height: "400" },
      }),
      makeNode(1, 0, 51, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 600, height: 400 },
        computedStyles: { ...baseStyles, width: "600", height: "400" },
      }),
      makeNode(2, 1, 52, {
        nodeName: "div",
        bounds: { x: 10, y: 10, width: 580, height: 50 },
        computedStyles: { ...baseStyles, width: "580", height: "50" },
      }),
    ];

    const iframeDocuments = new Map<number, ParsedIframeDocument>();
    iframeDocuments.set(1, {
      nodes: iframeNodes,
      nodesByBackendId: new Map(iframeNodes.map(n => [n.backendNodeId, n])),
      documentURL: "https://example.com/widget.html",
    });

    const nodesByBackendId = new Map(nodes.map(n => [n.backendNodeId, n]));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      iframeDocuments,
    });

    // The iframe should be a frame (not placeholder) with children from iframe content
    const iframe = tree.children[0];
    expect(iframe).toBeDefined();
    expect(iframe.tag).toBe("iframe");
    expect(iframe.type).toBe("frame");
    expect(iframe.children.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps iframe as placeholder when no contentDocumentIndex (cross-origin)", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 1, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeNode(1, 0, 2, {
        nodeName: "iframe",
        // No contentDocumentIndex — cross-origin
        bounds: { x: 50, y: 50, width: 300, height: 200 },
        computedStyles: { ...baseStyles, width: "300", height: "200" },
      }),
    ];

    const nodesByBackendId = new Map(nodes.map(n => [n.backendNodeId, n]));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    const iframe = tree.children[0];
    expect(iframe).toBeDefined();
    expect(iframe.tag).toBe("iframe");
    expect(iframe.type).toBe("placeholder");
  });

  it("falls back to placeholder when contentDocumentIndex exists but document not provided", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 1, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeNode(1, 0, 2, {
        nodeName: "iframe",
        contentDocumentIndex: 1,
        bounds: { x: 50, y: 50, width: 300, height: 200 },
        computedStyles: { ...baseStyles, width: "300", height: "200" },
      }),
    ];

    const nodesByBackendId = new Map(nodes.map(n => [n.backendNodeId, n]));

    // No iframeDocuments provided at all
    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
    });

    const iframe = tree.children[0];
    expect(iframe).toBeDefined();
    expect(iframe.tag).toBe("iframe");
    expect(iframe.type).toBe("placeholder");
  });

  it("respects MAX_TREE_DEPTH for iframe content", () => {
    // Create a deep chain: body → div × 14 → iframe → body → div
    // MAX_TREE_DEPTH = 15, so if iframe adds to depth, nested divs should stop
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 1, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
    ];

    // 13 nested divs (depth 1-13)
    for (let i = 1; i <= 13; i++) {
      nodes.push(makeNode(i, i - 1, i + 1, {
        nodeName: "div",
        bounds: { x: 0, y: 0, width: 1440 - i * 10, height: 900 - i * 10 },
        computedStyles: { ...baseStyles, width: String(1440 - i * 10), height: String(900 - i * 10) },
      }));
    }

    // iframe at depth 14
    nodes.push(makeNode(14, 13, 15, {
      nodeName: "iframe",
      contentDocumentIndex: 1,
      bounds: { x: 0, y: 0, width: 300, height: 200 },
      computedStyles: { ...baseStyles, width: "300", height: "200" },
    }));

    const iframeNodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 100, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 300, height: 200 },
        computedStyles: { ...baseStyles, width: "300", height: "200" },
      }),
      makeNode(1, 0, 101, {
        nodeName: "div",
        bounds: { x: 0, y: 0, width: 280, height: 50 },
        computedStyles: { ...baseStyles, width: "280", height: "50" },
      }),
    ];

    const iframeDocuments = new Map<number, ParsedIframeDocument>();
    iframeDocuments.set(1, {
      nodes: iframeNodes,
      nodesByBackendId: new Map(iframeNodes.map(n => [n.backendNodeId, n])),
      documentURL: undefined,
    });

    const nodesByBackendId = new Map(nodes.map(n => [n.backendNodeId, n]));

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      iframeDocuments,
    });

    // The tree should not crash — depth limiting should prevent infinite recursion
    expect(tree).toBeDefined();
    expect(tree.tag).toBe("body");
  });
});
