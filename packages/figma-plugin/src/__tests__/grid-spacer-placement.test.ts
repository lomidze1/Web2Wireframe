/**
 * Tests for planGridSlots — grid child placement via spacer cells.
 *
 * Figma's grid anchor index is read-only, so children are auto-placed
 * sequentially. To honor an explicit CSS `grid-column` / `grid-row`, empty
 * spacer cells (null markers) are inserted ahead of a positioned child so it
 * lands in the correct cell. This is the root-cause fix for centering grids
 * like paco.me (`grid-template-columns: 192px 640px 192px`, article on
 * `grid-column: 2`).
 */
import { describe, it, expect } from "vitest";
import { planGridSlots, sortGridChildren } from "../rendering/nodes";
import type { WireframeNode } from "../types";

function child(id: string, overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id,
    name: id,
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    children: [],
    ...overrides,
  } as WireframeNode;
}

describe("planGridSlots", () => {
  it("inserts one spacer before a child with grid-column: 2 (paco.me case)", () => {
    const article = child("article", { gridColumnStart: 2 });
    const slots = planGridSlots([article], 3);
    expect(slots).toEqual([null, article]);
  });

  it("inserts no spacers when all children are auto-placed", () => {
    const a = child("a");
    const b = child("b");
    const slots = planGridSlots([a, b], 3);
    expect(slots).toEqual([a, b]);
  });

  it("fills the gap between an auto child and a later explicit column", () => {
    const a = child("a"); // auto → cell 0
    const c = child("c", { gridColumnStart: 3 }); // col 3 → cell 2
    const slots = planGridSlots([a, c], 3);
    expect(slots).toEqual([a, null, c]);
  });

  it("honors an explicit row + column position (cell index = row*cols + col)", () => {
    const n = child("n", { gridColumnStart: 2, gridRowStart: 2 }); // (2-1)*3 + (2-1) = 4
    const slots = planGridSlots([n], 3);
    expect(slots).toEqual([null, null, null, null, n]);
  });

  it("accounts for column span so the next child is not pushed by extra spacers", () => {
    const a = child("a", { gridColumnStart: 1, gridColumnEnd: 3 }); // spans cells 0,1
    const b = child("b"); // auto → cell 2
    const slots = planGridSlots([a, b], 3);
    expect(slots).toEqual([a, b]);
  });

  it("wraps to the next row when the requested column is already behind the cursor", () => {
    // a fills cell 0 → cursor at (row0,col1). b requests col 1 (0-based col 0),
    // which is behind the cursor, so CSS auto-placement drops it to the next
    // row → cell 3. Spacers fill the trailing cells of row 0.
    const a = child("a");
    const b = child("b", { gridColumnStart: 1 });
    const slots = planGridSlots([a, b], 3);
    expect(slots).toEqual([a, null, null, b]);
  });

  it("keeps DOM order for column-only children when row is unknown", () => {
    // CSS grid auto-placement without an explicit row should
    // preserve DOM order; re-sorting by column alone caused the Apple promo
    // section to become left,left,left,right,right,right.
    const ipad = child("ipad", { gridColumnStart: 1 });
    const macbook = child("macbook", { gridColumnStart: 2 });
    const airpods = child("airpods", { gridColumnStart: 1 });
    const watch = child("watch", { gridColumnStart: 2 });

    const sorted = sortGridChildren([ipad, macbook, airpods, watch], "row");
    expect(sorted).toEqual([ipad, macbook, airpods, watch]);
  });

  it("does not create spacers for row-major column-only grid children", () => {
    // This is the general failure mode behind Apple promo cards
    // and any auto-placed grid where only the column is recoverable.
    const ipad = child("ipad", { gridColumnStart: 1 });
    const macbook = child("macbook", { gridColumnStart: 2 });
    const airpods = child("airpods", { gridColumnStart: 1 });
    const watch = child("watch", { gridColumnStart: 2 });
    const tradeIn = child("trade-in", { gridColumnStart: 1 });
    const card = child("card", { gridColumnStart: 2 });

    const sorted = sortGridChildren(
      [ipad, macbook, airpods, watch, tradeIn, card],
      "row",
    );
    const slots = planGridSlots(sorted, 2, "row");
    expect(slots).toEqual([ipad, macbook, airpods, watch, tradeIn, card]);
  });
});
