/**
 * Tests for CSS `order` property extraction and sorting in tree-builder.
 *
 * The tree-builder extracts `cssOrder` from computedStyles and sorts
 * flex children (HORIZONTAL/VERTICAL) by order value, preserving DOM
 * order for equal values (stable sort).
 */
import { describe, it, expect } from "vitest";
import type { ExtractedElement } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(name: string, overrides?: Partial<ExtractedElement>): ExtractedElement {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x: 0, y: 0, width: 100, height: 50,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    boxShadow: null,
    fontFamily: "Arial",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: "left",
    textContent: "",
    opacity: 1,
    isPlaceholder: false,
    children: [],
    ...overrides,
  } as ExtractedElement;
}

/**
 * Replicates the flex order sorting logic from tree-builder.ts
 * to test independently of the full buildNode pipeline.
 */
function sortByFlexOrder(children: ExtractedElement[], layoutMode: string): ExtractedElement[] {
  if (layoutMode !== "HORIZONTAL" && layoutMode !== "VERTICAL") return children;
  if (children.length < 2) return children;
  const hasOrder = children.some(c => c.cssOrder != null);
  if (!hasOrder) return children;

  const stable = children.map((c, i) => ({ c, i }));
  stable.sort((a, b) => {
    const oa = a.c.cssOrder ?? 0;
    const ob = b.c.cssOrder ?? 0;
    return oa !== ob ? oa - ob : a.i - b.i;
  });
  return stable.map(s => s.c);
}

// ---------------------------------------------------------------------------
// cssOrder extraction
// ---------------------------------------------------------------------------

describe("cssOrder extraction", () => {
  it("parses non-zero order from computedStyles", () => {
    const orderStr = "2";
    const cssOrder = orderStr && orderStr !== "0" ? parseInt(orderStr) : undefined;
    expect(cssOrder).toBe(2);
  });

  it("returns undefined for order '0' (default)", () => {
    const orderStr = "0";
    const cssOrder = orderStr && orderStr !== "0" ? parseInt(orderStr) : undefined;
    expect(cssOrder).toBeUndefined();
  });

  it("returns undefined for missing order", () => {
    const orderStr = undefined;
    const cssOrder = orderStr && orderStr !== "0" ? parseInt(orderStr) : undefined;
    expect(cssOrder).toBeUndefined();
  });

  it("parses negative order values", () => {
    const orderStr = "-1";
    const cssOrder = orderStr && orderStr !== "0" ? parseInt(orderStr) : undefined;
    expect(cssOrder).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// flex order sorting in tree-builder
// ---------------------------------------------------------------------------

describe("flex order sorting", () => {
  it("sorts VERTICAL flex children by cssOrder", () => {
    const children = [
      makeElement("A", { cssOrder: 2 }),
      makeElement("B", { cssOrder: 0 }),
      makeElement("C", { cssOrder: 1 }),
    ];
    // B has cssOrder=0 which is same as default, but explicitly set
    // After sorting: B(0), C(1), A(2)
    const result = sortByFlexOrder(children, "VERTICAL");
    expect(result.map(c => c.name)).toEqual(["B", "C", "A"]);
  });

  it("sorts HORIZONTAL flex children by cssOrder", () => {
    const children = [
      makeElement("X", { cssOrder: 3 }),
      makeElement("Y", { cssOrder: 1 }),
    ];
    const result = sortByFlexOrder(children, "HORIZONTAL");
    expect(result.map(c => c.name)).toEqual(["Y", "X"]);
  });

  it("does NOT sort NONE (absolute) mode children", () => {
    const children = [
      makeElement("A", { cssOrder: 3 }),
      makeElement("B", { cssOrder: 1 }),
    ];
    const result = sortByFlexOrder(children, "NONE");
    expect(result.map(c => c.name)).toEqual(["A", "B"]);
  });

  it("does NOT sort GRID children (grid has its own sort)", () => {
    const children = [
      makeElement("A", { cssOrder: 3 }),
      makeElement("B", { cssOrder: 1 }),
    ];
    const result = sortByFlexOrder(children, "GRID");
    expect(result.map(c => c.name)).toEqual(["A", "B"]);
  });

  it("stable sort: preserves DOM order for equal cssOrder", () => {
    const children = [
      makeElement("first"),
      makeElement("second"),
      makeElement("third"),
      makeElement("last", { cssOrder: 1 }),
    ];
    const result = sortByFlexOrder(children, "VERTICAL");
    expect(result.map(c => c.name)).toEqual(["first", "second", "third", "last"]);
  });

  it("Apple.com dotnav pattern", () => {
    const children = [
      makeElement("headline"),
      makeElement("dotnav", { cssOrder: 1 }),
      makeElement("tv-gallery"),
      makeElement("fam-gallery"),
    ];
    const result = sortByFlexOrder(children, "VERTICAL");
    expect(result.map(c => c.name)).toEqual([
      "headline",
      "tv-gallery",
      "fam-gallery",
      "dotnav",
    ]);
  });
});
