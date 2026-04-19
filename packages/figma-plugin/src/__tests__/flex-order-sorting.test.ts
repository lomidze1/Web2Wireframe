/**
 * Tests for CSS `order` property support in flex layout rendering.
 *
 * CSS `order` controls the visual order of flex children — elements with
 * lower order values appear first. Default order is 0. Elements with the
 * same order value preserve their DOM (source) order.
 *
 * Real-world case: Apple.com `.endless-entertainment` uses `order` to
 * visually place the dotnav below gallery images despite appearing before
 * them in the DOM.
 */
import { describe, it, expect } from "vitest";
import { sortByFlexOrder, sortChildrenForStacking } from "../rendering/nodes";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(name: string, overrides?: Partial<WireframeNode>): WireframeNode {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x: 0, y: 0, width: 100, height: 50,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Arial",
    textAlign: "left",
    lineHeight: 1.2,
    letterSpacing: 0,
    children: [],
    isPlaceholder: false,
    ...overrides,
  } as WireframeNode;
}

function makeW2WFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sortByFlexOrder
// ---------------------------------------------------------------------------

describe("sortByFlexOrder", () => {
  it("preserves DOM order when no children have cssOrder", () => {
    const children = [makeNode("A"), makeNode("B"), makeNode("C")];
    const result = sortByFlexOrder(children, "VERTICAL");
    expect(result.map(c => c.name)).toEqual(["A", "B", "C"]);
  });

  it("sorts children by cssOrder (ascending)", () => {
    const children = [
      makeNode("A", { cssOrder: 3 }),
      makeNode("B", { cssOrder: 1 }),
      makeNode("C", { cssOrder: 2 }),
    ];
    const result = sortByFlexOrder(children, "HORIZONTAL");
    expect(result.map(c => c.name)).toEqual(["B", "C", "A"]);
  });

  it("preserves DOM order for children with same cssOrder (stable sort)", () => {
    const children = [
      makeNode("A", { cssOrder: 1 }),
      makeNode("B", { cssOrder: 1 }),
      makeNode("C", { cssOrder: 1 }),
    ];
    const result = sortByFlexOrder(children, "VERTICAL");
    expect(result.map(c => c.name)).toEqual(["A", "B", "C"]);
  });

  it("treats missing cssOrder as 0 (default)", () => {
    const children = [
      makeNode("headline"),              // no cssOrder → 0
      makeNode("dotnav", { cssOrder: 2 }), // order: 2 → moves after gallery
      makeNode("gallery"),               // no cssOrder → 0
    ];
    const result = sortByFlexOrder(children, "VERTICAL");
    // headline(0) and gallery(0) keep DOM order, dotnav(2) moves to end
    expect(result.map(c => c.name)).toEqual(["headline", "gallery", "dotnav"]);
  });

  it("handles negative cssOrder values", () => {
    const children = [
      makeNode("A"),                       // 0
      makeNode("B", { cssOrder: -1 }),     // -1 → first
      makeNode("C", { cssOrder: 1 }),      // 1 → last
    ];
    const result = sortByFlexOrder(children, "HORIZONTAL");
    expect(result.map(c => c.name)).toEqual(["B", "A", "C"]);
  });

  it("does NOT sort in GRID layout mode", () => {
    const children = [
      makeNode("A", { cssOrder: 3 }),
      makeNode("B", { cssOrder: 1 }),
    ];
    const result = sortByFlexOrder(children, "GRID");
    expect(result.map(c => c.name)).toEqual(["A", "B"]);
  });

  it("does NOT sort in NONE (absolute) layout mode", () => {
    const children = [
      makeNode("A", { cssOrder: 3 }),
      makeNode("B", { cssOrder: 1 }),
    ];
    const result = sortByFlexOrder(children, "NONE");
    expect(result.map(c => c.name)).toEqual(["A", "B"]);
  });

  it("Apple.com dotnav pattern: order moves dotnav below galleries", () => {
    const children = [
      makeNode("media-gallery-headline-container"),
      makeNode("media-gallery-dotnav", { cssOrder: 1 }),
      makeNode("tv-media-gallery"),
      makeNode("fam-media-gallery"),
    ];
    const result = sortByFlexOrder(children, "VERTICAL");
    expect(result.map(c => c.name)).toEqual([
      "media-gallery-headline-container", // order 0 (default)
      "tv-media-gallery",                  // order 0 (default)
      "fam-media-gallery",                 // order 0 (default)
      "media-gallery-dotnav",              // order 1 → last
    ]);
  });
});

// ---------------------------------------------------------------------------
// css-converter: cssOrder mapping
// ---------------------------------------------------------------------------

describe("css-converter: cssOrder mapping", () => {
  it("maps numeric order from W2W styles", () => {
    const node = makeW2WFrame({ styles: { order: "2" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.cssOrder).toBe(2);
  });

  it("omits cssOrder when '0' (default)", () => {
    const node = makeW2WFrame({ styles: { order: "0" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.cssOrder).toBeUndefined();
  });

  it("omits cssOrder when not present", () => {
    const node = makeW2WFrame({ styles: {} });
    const result = convertW2WToWireframe(node as any);
    expect(result.cssOrder).toBeUndefined();
  });

  it("maps negative order values", () => {
    const node = makeW2WFrame({ styles: { order: "-1" } });
    const result = convertW2WToWireframe(node as any);
    expect(result.cssOrder).toBe(-1);
  });
});
