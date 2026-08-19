/**
 * Tests for CSS `flex-direction: row-reverse` / `column-reverse` support.
 *
 * Figma auto-layout has no reversed direction — it always lays children out
 * left-to-right (HORIZONTAL) or top-to-bottom (VERTICAL). To reproduce a
 * reversed flex container the children must be appended in reverse order and
 * the main-axis alignment flipped (main-start moves to the far edge).
 *
 * With `flex-wrap: wrap` a GLOBAL reverse is wrong: line breaking happens in
 * main-axis order, so reversing everything re-packs items into different
 * lines. Only the items WITHIN each line may be reversed.
 *
 * Real-world case: iwm.org.uk `ul.branch-showcase__list`
 * (`row-reverse` + `wrap`, 5 mosaic cards over 3 lines) imported mirrored —
 * IWM London jumped from the right edge to the left, and so did every card.
 */
import { describe, it, expect } from "vitest";
import { reverseFlexChildren } from "../rendering/nodes";
import { cssJustifyToFigma } from "../rendering/layout";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number
): WireframeNode {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x, y, width, height,
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
  } as WireframeNode;
}

const names = (nodes: WireframeNode[]) => nodes.map((n) => n.name);

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
// reverseFlexChildren
// ---------------------------------------------------------------------------

describe("reverseFlexChildren", () => {
  it("leaves children untouched for a normal row", () => {
    const kids = [makeNode("a", 0, 0, 50, 20), makeNode("b", 50, 0, 50, 20)];
    expect(names(reverseFlexChildren(kids, "HORIZONTAL", "row"))).toEqual(["a", "b"]);
  });

  it("leaves children untouched when flex-direction is absent", () => {
    const kids = [makeNode("a", 0, 0, 50, 20), makeNode("b", 50, 0, 50, 20)];
    expect(names(reverseFlexChildren(kids, "HORIZONTAL", undefined))).toEqual(["a", "b"]);
  });

  it("reverses a single-line row-reverse container", () => {
    // DOM order a,b,c laid out right-to-left: a is rightmost.
    const kids = [
      makeNode("a", 200, 0, 100, 20),
      makeNode("b", 100, 0, 100, 20),
      makeNode("c", 0, 0, 100, 20),
    ];
    expect(names(reverseFlexChildren(kids, "HORIZONTAL", "row-reverse"))).toEqual([
      "c", "b", "a",
    ]);
  });

  it("reverses within each wrapped line, keeping line order (iwm.org.uk mosaic)", () => {
    // ul.branch-showcase__list — container 1273 wide, main-start on the right.
    // line 1: London(637) Churchill(424) | line 2: North(531) Belfast(637) | line 3: Duxford(424)
    const kids = [
      makeNode("London", 637, 0, 637, 383),
      makeNode("Churchill", 212, 133, 424, 250),
      makeNode("North", 743, 383, 531, 317),
      makeNode("Belfast", 106, 383, 637, 383),
      makeNode("Duxford", 743, 701, 424, 250),
    ];
    expect(names(reverseFlexChildren(kids, "HORIZONTAL", "row-reverse"))).toEqual([
      "Churchill", "London", "Belfast", "North", "Duxford",
    ]);
  });

  it("does not merge lines that a global reverse would re-pack", () => {
    // A naive [...kids].reverse() would put Duxford and Belfast on one line
    // because 424 + 637 fits the 1273 container. Per-line reversal must not.
    const kids = [
      makeNode("London", 637, 0, 637, 383),
      makeNode("Churchill", 212, 133, 424, 250),
      makeNode("North", 743, 383, 531, 317),
      makeNode("Belfast", 106, 383, 637, 383),
      makeNode("Duxford", 743, 701, 424, 250),
    ];
    const out = names(reverseFlexChildren(kids, "HORIZONTAL", "row-reverse"));
    expect(out.indexOf("Belfast")).toBeGreaterThan(out.indexOf("London"));
    expect(out.indexOf("Duxford")).toBe(out.length - 1);
  });

  it("reverses a column-reverse container on the vertical axis", () => {
    const kids = [
      makeNode("a", 0, 200, 100, 100),
      makeNode("b", 0, 100, 100, 100),
      makeNode("c", 0, 0, 100, 100),
    ];
    expect(names(reverseFlexChildren(kids, "VERTICAL", "column-reverse"))).toEqual([
      "c", "b", "a",
    ]);
  });

  it("keeps zero-area children inside their line instead of splitting it", () => {
    const spacer = makeNode("spacer", 0, 0, 0, 0);
    const kids = [
      makeNode("a", 200, 0, 100, 20),
      spacer,
      makeNode("b", 100, 0, 100, 20),
    ];
    const out = names(reverseFlexChildren(kids, "HORIZONTAL", "row-reverse"));
    expect(out[0]).toBe("b");
    expect(out[out.length - 1]).toBe("a");
  });

  it("ignores GRID and NONE containers", () => {
    const kids = [makeNode("a", 200, 0, 100, 20), makeNode("b", 0, 0, 100, 20)];
    expect(names(reverseFlexChildren(kids, "GRID", "row-reverse"))).toEqual(["a", "b"]);
    expect(names(reverseFlexChildren(kids, "NONE", "row-reverse"))).toEqual(["a", "b"]);
  });

  it("is a no-op for fewer than two children", () => {
    const kids = [makeNode("only", 0, 0, 10, 10)];
    expect(names(reverseFlexChildren(kids, "HORIZONTAL", "row-reverse"))).toEqual(["only"]);
  });
});

// ---------------------------------------------------------------------------
// Main-axis alignment flip
// ---------------------------------------------------------------------------

describe("cssJustifyToFigma with reversed direction", () => {
  it("packs a reversed row to the far edge by default", () => {
    expect(cssJustifyToFigma("normal", true)).toBe("MAX");
    expect(cssJustifyToFigma("flex-start", true)).toBe("MAX");
    expect(cssJustifyToFigma(undefined, true)).toBe("MAX");
  });

  it("packs flex-end of a reversed row to the near edge", () => {
    expect(cssJustifyToFigma("flex-end", true)).toBe("MIN");
  });

  it("leaves center and space-between unchanged", () => {
    expect(cssJustifyToFigma("center", true)).toBe("CENTER");
    expect(cssJustifyToFigma("space-between", true)).toBe("SPACE_BETWEEN");
  });

  it("keeps the non-reversed mapping intact", () => {
    expect(cssJustifyToFigma("normal")).toBe("MIN");
    expect(cssJustifyToFigma("flex-end")).toBe("MAX");
    expect(cssJustifyToFigma("center")).toBe("CENTER");
  });
});

// ---------------------------------------------------------------------------
// css-converter carries flex-direction through
// ---------------------------------------------------------------------------

describe("convertW2WToWireframe — flexDirection", () => {
  it("keeps row-reverse on the wireframe node", () => {
    const w2w = makeW2WFrame({
      classList: ["list"],
      styles: { display: "flex", flexDirection: "row-reverse", flexWrap: "wrap" },
      children: [
        makeW2WFrame({ x: 50, y: 0, width: 50, height: 50 }),
        makeW2WFrame({ x: 0, y: 0, width: 50, height: 50 }),
      ],
    });
    const node = convertW2WToWireframe(w2w as never);
    expect(node.layoutMode).toBe("HORIZONTAL");
    expect(node.flexDirection).toBe("row-reverse");
  });

  it("keeps column-reverse and still reports a VERTICAL layout", () => {
    const w2w = makeW2WFrame({
      styles: { display: "flex", flexDirection: "column-reverse" },
      children: [makeW2WFrame(), makeW2WFrame({ y: 50 })],
    });
    const node = convertW2WToWireframe(w2w as never);
    expect(node.layoutMode).toBe("VERTICAL");
    expect(node.flexDirection).toBe("column-reverse");
  });
});
