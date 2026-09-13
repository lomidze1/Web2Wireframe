/**
 * Grid children that share a cell must not be handed to Figma's grid.
 *
 * Figma's Grid Auto Layout auto-places children into successive cells: the
 * renderer appends each child and sets only its row/column *span*, never an
 * explicit cell. Two children declaring the same `grid-area` — a deliberate
 * overlay — therefore land in two different cells and stop overlapping.
 *
 * stripe.com's hero is exactly that. Two `<h1>` elements occupy one cell:
 *
 *   h1  958×221  dx=104 dy=61  color rgb(129,184,26)
 *   h1  958×221  dx=104 dy=61  color rgba(0,14,255,.5)  mix-blend-mode: hard-light
 *
 * Blended they read as one dark heading. Placed in separate cells they became
 * two offset copies, one olive and one blue — and `hard-light` had nothing
 * underneath to blend with.
 *
 * Captured geometry is the arbiter, the same rule the float and inline
 * heuristics already follow: children that overlap were never in a grid we
 * can reproduce, so fall back to absolute placement, which carries the exact
 * coordinates.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function frame(
  tag: string,
  x: number, y: number, width: number, height: number,
  styles: Record<string, unknown>,
  children: unknown[] = [],
) {
  return {
    type: "FRAME",
    x, y, width, height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    tag,
    classList: [],
    attr: {},
    styles,
    children,
  };
}

const GRID_STYLES = {
  display: "grid",
  gridTemplateColumns: "88px 88px 88px 88px 88px 88px 88px 88px 88px 88px 88px 88px",
};

/** Hero grid holding two headings stacked in the same cell. */
function heroGrid() {
  return frame("div", 0, 0, 1232, 370, GRID_STYLES, [
    frame("h1", 104, 61, 958, 221, {
      display: "block", color: "rgb(129, 184, 26)", gridArea: "2 / 2 / auto / -2",
    }),
    frame("h1", 104, 61, 958, 221, {
      display: "block", color: "rgba(0, 14, 255, 0.5)",
      mixBlendMode: "hard-light", gridArea: "2 / 2 / auto / -2", zIndex: 2,
    }),
  ]);
}

/** A normal grid: three tiles side by side, no overlap. */
function tileGrid() {
  return frame("div", 0, 0, 900, 200, GRID_STYLES, [
    frame("div", 0, 0, 280, 200, { display: "block" }),
    frame("div", 300, 0, 280, 200, { display: "block" }),
    frame("div", 600, 0, 280, 200, { display: "block" }),
  ]);
}

const convert = (tree: Record<string, unknown>) =>
  convertW2WToWireframe(tree as never, {}) as WireframeNode;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("grid with overlapping children", () => {
  it("does not use GRID layout", () => {
    expect(convert(heroGrid()).layoutMode).not.toBe("GRID");
  });

  it("keeps both headings at the same position so they still overlay", () => {
    const kids = convert(heroGrid()).children ?? [];
    expect(kids).toHaveLength(2);
    expect(Math.round(kids[0].x)).toBe(Math.round(kids[1].x));
    expect(Math.round(kids[0].y)).toBe(Math.round(kids[1].y));
  });

  it("carries the blend mode through to the top layer", () => {
    const kids = convert(heroGrid()).children ?? [];
    expect(kids[1].blendMode).toBe("hard-light");
  });

  // ⬇️ regression guard — ordinary grids must stay grids
  it("a grid whose children do not overlap still uses GRID layout", () => {
    expect(convert(tileGrid()).layoutMode).toBe("GRID");
  });

  it("touching-but-not-overlapping tiles still use GRID layout", () => {
    const touching = frame("div", 0, 0, 900, 200, GRID_STYLES, [
      frame("div", 0, 0, 300, 200, { display: "block" }),
      frame("div", 300, 0, 300, 200, { display: "block" }),
    ]);
    expect(convert(touching).layoutMode).toBe("GRID");
  });
});
