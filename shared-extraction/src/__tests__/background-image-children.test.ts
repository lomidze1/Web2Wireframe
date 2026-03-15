/**
 * Background-Image with Children Tests
 *
 * Elements with `background-image: url(...)` that have children should be
 * rendered as frames (not placeholders), preserving their child elements.
 * Only childless background-image elements should become placeholders.
 *
 * Bug: All elements with `background-image: url()` were marked as `isMedia`,
 * which forced `type: "placeholder"` — causing children to be lost during rendering.
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";

// ============================================================================
// Helpers
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

function buildTree(nodes: ParsedSnapshotNode[]) {
  const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
  nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

  return buildElementTree(nodes, nodesByBackendId, new Map(), {
    viewportWidth: 1440,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("background-image with children", () => {
  it("div with background-image url() + element children → type 'frame'", () => {
    const nodes: ParsedSnapshotNode[] = [
      // body
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      // hero section with background image
      makeNode(1, "header", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        "background-image": "url(https://example.com/hero.jpg)",
      }),
      // child: heading
      makeNode(2, "h1", 1, { x: 100, y: 100, width: 600, height: 60 }, {}, {
        textContent: "Welcome to Our Site",
      }),
      // child: button
      makeNode(3, "div", 1, { x: 100, y: 200, width: 200, height: 50 }, {
        "background-color": "rgb(255, 107, 74)",
      }, {
        textContent: "Get Started",
      }),
    ];

    const result = buildTree(nodes);

    // Find the header element (first child of body)
    const header = result.children[0];
    expect(header).toBeDefined();
    expect(header.type).toBe("frame");
    expect(header.isPlaceholder).toBeFalsy();
    expect(header.children.length).toBeGreaterThan(0);

    // Note: IMAGE_PLACEHOLDER in fills requires matchedStyles data;
    // fill conversion is tested separately in style-parsers.test.ts
  });

  it("div with background-image url() + NO children → type 'placeholder'", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      // Decorative background image with no children
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 300 }, {
        "background-image": "url(https://example.com/decorative.jpg)",
      }),
    ];

    const result = buildTree(nodes);
    const bgDiv = result.children[0];

    expect(bgDiv).toBeDefined();
    expect(bgDiv.type).toBe("placeholder");
    expect(bgDiv.isPlaceholder).toBe(true);
  });

  it("<img> tag → always type 'placeholder' (unchanged)", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "img", 0, { x: 100, y: 100, width: 400, height: 300 }, {}, {
        attributes: { src: "photo.jpg", alt: "Photo" },
      }),
    ];

    const result = buildTree(nodes);
    const img = result.children[0];

    expect(img).toBeDefined();
    expect(img.type).toBe("placeholder");
    expect(img.isPlaceholder).toBe(true);
  });

  it("div with background linear-gradient (no url) → type 'frame' (unchanged)", () => {
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
    const gradientDiv = result.children[0];

    expect(gradientDiv).toBeDefined();
    expect(gradientDiv.type).toBe("frame");
    expect(gradientDiv.isPlaceholder).toBeFalsy();
    expect(gradientDiv.children.length).toBeGreaterThan(0);
  });

  it("section with background-image url() + nested children → type 'frame'", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      // Section with bg image
      makeNode(1, "section", 0, { x: 0, y: 0, width: 1440, height: 500 }, {
        "background-image": "url(https://example.com/section-bg.jpg)",
      }),
      // Container div
      makeNode(2, "div", 1, { x: 100, y: 50, width: 1200, height: 400 }),
      // Text inside container
      makeNode(3, "h2", 2, { x: 100, y: 50, width: 500, height: 40 }, {}, {
        textContent: "Section Title",
      }),
    ];

    const result = buildTree(nodes);
    const section = result.children[0];

    expect(section).toBeDefined();
    expect(section.type).toBe("frame");
    expect(section.isPlaceholder).toBeFalsy();
    // Should have children (the container div)
    expect(section.children.length).toBeGreaterThan(0);
  });

  it("div with background-image url() + only <br> children → type 'placeholder'", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 400, height: 300 }, {
        "background-image": "url(icon.png)",
      }),
      // Only a <br> child (not a real element child)
      makeNode(2, "br", 1, { x: 0, y: 0, width: 0, height: 0 }),
    ];

    const result = buildTree(nodes);
    const bgDiv = result.children[0];

    expect(bgDiv).toBeDefined();
    expect(bgDiv.type).toBe("placeholder");
    expect(bgDiv.isPlaceholder).toBe(true);
  });
});

// ============================================================================
// Grid children sizing: images in CSS Grid should get FILL + layoutGrow
// ============================================================================

describe("grid children sizing", () => {
  it("img inside grid parent → placeholder with layoutGrow=1 and layoutSizingHorizontal='FILL'", () => {
    const nodes: ParsedSnapshotNode[] = [
      // body
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      // grid container (display: grid, 2 columns)
      makeNode(1, "div", 0, { x: 170, y: 100, width: 1100, height: 357 }, {
        display: "grid",
        "grid-template-columns": "535px 535px",
        gap: "30px",
        "align-items": "center",
      }),
      // text div (first grid child)
      makeNode(2, "div", 1, { x: 170, y: 100, width: 535, height: 200 }, {}, {
        textContent: "About This Concept",
      }),
      // img (second grid child)
      makeNode(3, "img", 1, { x: 735, y: 100, width: 535, height: 357 }, {}, {
        attributes: { src: "photo.jpg", alt: "Photo" },
      }),
    ];

    const result = buildTree(nodes);
    const gridContainer = result.children[0];
    expect(gridContainer).toBeDefined();
    expect(gridContainer.layoutMode).toBe("HORIZONTAL");

    // Find the img placeholder (second child of grid)
    const imgChild = gridContainer.children.find(c => c.type === "placeholder");
    expect(imgChild).toBeDefined();
    expect(imgChild!.layoutGrow).toBe(1);
    expect(imgChild!.layoutSizingHorizontal).toBe("FILL");
  });

  it("div inside grid parent → frame with layoutGrow=1 and layoutSizingHorizontal='FILL'", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      // grid container
      makeNode(1, "div", 0, { x: 170, y: 100, width: 1100, height: 400 }, {
        display: "grid",
        "grid-template-columns": "535px 535px",
        gap: "30px",
        "align-items": "stretch",
      }),
      // first grid child
      makeNode(2, "div", 1, { x: 170, y: 100, width: 535, height: 400 }, {
        "background-color": "rgb(200, 200, 200)",
      }),
      // second grid child
      makeNode(3, "div", 1, { x: 735, y: 100, width: 535, height: 400 }, {
        "background-color": "rgb(100, 100, 100)",
      }),
    ];

    const result = buildTree(nodes);
    const gridContainer = result.children[0];

    for (const child of gridContainer.children) {
      expect(child.layoutGrow).toBe(1);
      expect(child.layoutSizingHorizontal).toBe("FILL");
    }
  });

  it("non-grid child retains FIXED sizing (regression)", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      // flex container (NOT grid)
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {
        display: "flex",
        "flex-direction": "row",
      }),
      // flex child without flex-grow
      makeNode(2, "div", 1, { x: 0, y: 0, width: 200, height: 400 }, {
        "background-color": "rgb(200, 200, 200)",
      }),
    ];

    const result = buildTree(nodes);
    const flexContainer = result.children[0];
    const child = flexContainer.children[0];

    expect(child.layoutGrow).toBeUndefined();
    expect(child.layoutSizingHorizontal).toBe("FIXED");
  });
});
