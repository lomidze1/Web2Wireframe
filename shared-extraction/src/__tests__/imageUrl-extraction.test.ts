/**
 * imageUrl Extraction Tests — Phase 1
 *
 * Tests for extracting imageUrl from DOM elements (img src, video poster,
 * background-image url) and including imageUrl in IMAGE_PLACEHOLDER fills.
 *
 * These tests are written BEFORE implementation (TDD).
 * They will fail until Phase 1 code changes are applied.
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import { parseBackgroundToFills } from "../style-parsers";
import type { ParsedSnapshotNode } from "../snapshot";

// ============================================================================
// Helpers (same pattern as background-image-children.test.ts)
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
// A. tree-builder — imageUrl extraction
// ============================================================================

describe("tree-builder imageUrl extraction", () => {
  it("<img src='...'> → imageUrl from src attribute", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { src: "https://example.com/photo.jpg", alt: "Photo" },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.type).toBe("placeholder");
    expect(img.imageUrl).toBe("https://example.com/photo.jpg");
  });

  it("<img data-src='...'> → imageUrl from data-src (lazy-load)", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { "data-src": "https://example.com/lazy.jpg" },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/lazy.jpg");
  });

  it("<img src='...' data-src='...'> → src wins over data-src", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: {
          src: "https://example.com/loaded.jpg",
          "data-src": "https://example.com/original.jpg",
        },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/loaded.jpg");
  });

  it("<video poster='...'> → imageUrl from poster attribute", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "video", 0, { x: 0, y: 0, width: 640, height: 360 }, {}, {
        attributes: { poster: "https://example.com/thumb.jpg" },
      }),
    ];

    const result = buildTree(nodes);
    const video = result.children[0];

    expect(video).toBeDefined();
    expect(video.type).toBe("placeholder");
    expect(video.imageUrl).toBe("https://example.com/thumb.jpg");
  });

  it("<video> without poster → no imageUrl", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "video", 0, { x: 0, y: 0, width: 640, height: 360 }, {}, {
        attributes: { src: "video.mp4" },
      }),
    ];

    const result = buildTree(nodes);
    const video = result.children[0];

    expect(video).toBeDefined();
    expect(video.imageUrl).toBeUndefined();
  });

  it("background-image: url('...') → imageUrl from CSS", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "url(https://example.com/bg.png)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    expect(div.imageUrl).toBe("https://example.com/bg.png");
  });

  it("background-image: url('data:...') → imageUrl preserves data URI", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 200, height: 200 }, {
        "background-image": `url(${dataUri})`,
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    expect(div.imageUrl).toBe(dataUri);
  });

  it("background-image: none → no imageUrl", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 300, height: 300 }, {
        "background-image": "none",
        "background-color": "rgb(200, 200, 200)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    expect(div.imageUrl).toBeUndefined();
  });

  it("background-image: linear-gradient(...) → no imageUrl (gradient ≠ image)", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "linear-gradient(120deg, rgb(14, 27, 49), rgb(57, 160, 237))",
      }),
      makeNode(2, "h1", 1, { x: 100, y: 100, width: 600, height: 60 }, {}, {
        textContent: "Gradient Hero",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    expect(div.imageUrl).toBeUndefined();
  });

  it("plain <div> without image → no imageUrl", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 300, height: 200 }, {
        "background-color": "rgb(100, 100, 100)",
      }),
    ];

    const result = buildTree(nodes);
    const div = result.children[0];

    expect(div).toBeDefined();
    expect(div.imageUrl).toBeUndefined();
  });

  it("<img src=''> (empty src) → no imageUrl", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { src: "", alt: "Broken" },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBeUndefined();
  });
});

// ============================================================================
// B. style-parsers — imageUrl in IMAGE_PLACEHOLDER fill
// ============================================================================

describe("style-parsers IMAGE_PLACEHOLDER imageUrl", () => {
  it("url('image.png') → fill has imageUrl", () => {
    const fills = parseBackgroundToFills("url('image.png')", null);

    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("IMAGE_PLACEHOLDER");
    expect(fills[0].imageUrl).toBe("image.png");
  });

  it("url with quotes → imageUrl is cleaned (no quotes)", () => {
    const fills = parseBackgroundToFills('url("https://example.com/photo.jpg")', null);

    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("IMAGE_PLACEHOLDER");
    expect(fills[0].imageUrl).toBe("https://example.com/photo.jpg");
  });

  it("multiple backgrounds with url() → first fill gets imageUrl", () => {
    const fills = parseBackgroundToFills(
      "url('bg.jpg'), linear-gradient(red, blue)",
      null
    );

    expect(fills).toHaveLength(2);
    expect(fills[0].type).toBe("IMAGE_PLACEHOLDER");
    expect(fills[0].imageUrl).toBe("bg.jpg");
    expect(fills[1].type).toBe("GRADIENT_LINEAR");
    expect(fills[1].imageUrl).toBeUndefined();
  });

  it("gradient only → no imageUrl on fill", () => {
    const fills = parseBackgroundToFills(
      "linear-gradient(red, blue)",
      null
    );

    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[0].imageUrl).toBeUndefined();
  });
});

// ============================================================================
// C. Relative URL resolution integration tests
// ============================================================================

describe("tree-builder imageUrl relative URL resolution", () => {
  const DOC_URL = "https://example.com/pages/about";

  it("<img src='/images/hero.jpg'> + documentURL → absolute URL", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { src: "/images/hero.jpg", alt: "Hero" },
      }),
    ];

    const result = buildTree(nodes, DOC_URL);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/images/hero.jpg");
  });

  it("<img src='images/photo.jpg'> + documentURL → absolute URL", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { src: "images/photo.jpg" },
      }),
    ];

    const result = buildTree(nodes, DOC_URL);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/pages/images/photo.jpg");
  });

  it("<video poster='/thumb.jpg'> + documentURL → absolute URL", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "video", 0, { x: 0, y: 0, width: 640, height: 360 }, {}, {
        attributes: { poster: "/thumb.jpg" },
      }),
    ];

    const result = buildTree(nodes, DOC_URL);
    const video = result.children[0];

    expect(video).toBeDefined();
    expect(video.imageUrl).toBe("https://example.com/thumb.jpg");
  });

  it("<img data-src='/lazy.jpg'> + documentURL → absolute URL", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { "data-src": "/lazy.jpg" },
      }),
    ];

    const result = buildTree(nodes, DOC_URL);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://example.com/lazy.jpg");
  });

  it("absolute URL + documentURL → unchanged", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { src: "https://cdn.example.com/photo.jpg" },
      }),
    ];

    const result = buildTree(nodes, DOC_URL);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("https://cdn.example.com/photo.jpg");
  });

  it("data: URI + documentURL → unchanged", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 200, height: 200 }, {}, {
        attributes: { src: dataUri },
      }),
    ];

    const result = buildTree(nodes, DOC_URL);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe(dataUri);
  });

  it("no documentURL → relative URL as-is (backward compat)", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { src: "/images/hero.jpg" },
      }),
    ];

    const result = buildTree(nodes); // no documentURL
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.imageUrl).toBe("/images/hero.jpg");
  });
});
