/**
 * Multi-Background Image + currentSrc Tests
 *
 * Tests for Layer #3 enhancements:
 * - Multiple url() in background-image → primary + additional URLs
 * - img[currentSrc] prioritized over img[src]
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";

// ============================================================================
// Helpers (same pattern as imageUrl-extraction.test.ts)
// ============================================================================

const BASE_COMPUTED_STYLES: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  overflow: "visible",
  position: "static",
  "background-color": "rgba(0, 0, 0, 0)",
  "background-image": "none",
  "border-top-width": "0px",
  "border-right-width": "0px",
  "border-bottom-width": "0px",
  "border-left-width": "0px",
  "border-top-style": "none",
  "border-right-style": "none",
  "border-bottom-style": "none",
  "border-left-style": "none",
  "padding-top": "0px",
  "padding-right": "0px",
  "padding-bottom": "0px",
  "padding-left": "0px",
  "margin-top": "0px",
  "margin-right": "0px",
  "margin-bottom": "0px",
  "margin-left": "0px",
  "font-size": "16px",
  "font-weight": "400",
  "line-height": "normal",
  "letter-spacing": "normal",
  "text-align": "start",
  color: "rgb(0, 0, 0)",
  "box-shadow": "none",
  "border-radius": "0px",
  "border-top-left-radius": "0px",
  "border-top-right-radius": "0px",
  "border-bottom-left-radius": "0px",
  "border-bottom-right-radius": "0px",
};

function makeNode(
  index: number,
  tag: string,
  parentIndex: number,
  bounds: { x: number; y: number; width: number; height: number },
  computedStyles: Record<string, string> = {},
  overrides?: Partial<ParsedSnapshotNode>
): ParsedSnapshotNode {
  return {
    index,
    backendNodeId: index + 1,
    nodeType: 1,
    nodeName: tag,
    parentIndex,
    attributes: {},
    bounds,
    computedStyles: { ...BASE_COMPUTED_STYLES, ...computedStyles },
    textContent: "",
    isClickable: false,
    needsMatchedStyles: false,
    ...overrides,
  };
}

function buildTree(nodes: ParsedSnapshotNode[], documentURL?: string) {
  const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
  nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

  return buildElementTree(nodes, nodesByBackendId, new Map(), {
    viewportWidth: 1440,
    documentURL,
  });
}

// ============================================================================
// currentSrc priority
// ============================================================================

describe("img currentSrc priority", () => {
  it("img[currentSrc] is prioritized over img[src]", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: {
          src: "https://example.com/original.jpg",
          currentsrc: "https://example.com/responsive-2x.jpg",
        },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/responsive-2x.jpg");
  });

  it("img[src] is used as fallback when no currentSrc", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: {
          src: "https://example.com/photo.jpg",
        },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/photo.jpg");
  });

  it("img[data-src] fallback when no src and no currentSrc", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: {
          "data-src": "https://example.com/lazy.jpg",
        },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/lazy.jpg");
  });
});

// ============================================================================
// Multi-background image
// ============================================================================

describe("multi-background image extraction", () => {
  it("single url() → one imageUrl", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "url(https://example.com/hero.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    expect(div.imageUrl).toBe("https://example.com/hero.jpg");
  });

  it("multiple url() → primary imageUrl is first url()", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "url(https://example.com/overlay.png), url(https://example.com/bg.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    expect(div.imageUrl).toBe("https://example.com/overlay.png");
  });

  it("mixed gradient + url() → extracts url, ignores gradient", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(https://example.com/bg.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    // The url() should be extracted even with gradients
    expect(div.imageUrl).toBe("https://example.com/bg.jpg");
  });
});

// ============================================================================
// additionalImageUrls — multiple background layers
// ============================================================================

describe("additionalImageUrls extraction", () => {
  it("2 url() → imageUrl = first, additionalImageUrls = [second]", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "url(https://example.com/overlay.png), url(https://example.com/bg.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div.imageUrl).toBe("https://example.com/overlay.png");
    expect(div.additionalImageUrls).toEqual(["https://example.com/bg.jpg"]);
  });

  it("3 url() → imageUrl = first, additionalImageUrls = [second, third]", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "url(https://example.com/top.png), url(https://example.com/mid.png), url(https://example.com/base.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div.imageUrl).toBe("https://example.com/top.png");
    expect(div.additionalImageUrls).toEqual([
      "https://example.com/mid.png",
      "https://example.com/base.jpg",
    ]);
  });

  it("gradient + 2 url() → imageUrl = first url, additionalImageUrls = [second url]", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "linear-gradient(to bottom, rgba(0,0,0,0.3), transparent), url(https://example.com/overlay.png), url(https://example.com/bg.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div.imageUrl).toBe("https://example.com/overlay.png");
    expect(div.additionalImageUrls).toEqual(["https://example.com/bg.jpg"]);
  });

  it("single url() → additionalImageUrls undefined", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "url(https://example.com/hero.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div.imageUrl).toBe("https://example.com/hero.jpg");
    expect(div.additionalImageUrls).toBeUndefined();
  });

  it("gradient + single url() → additionalImageUrls undefined", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(https://example.com/bg.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div.imageUrl).toBe("https://example.com/bg.jpg");
    expect(div.additionalImageUrls).toBeUndefined();
  });
});
