/**
 * itemSpacing calculation from child positions
 *
 * When CSS gap is 0, the tree builder calculates effective spacing
 * from consecutive children's position gaps (which include CSS margins).
 */

import { describe, it, expect } from "vitest";
import type { ExtractedElement } from "../types";

/**
 * Extracted logic from tree-builder.ts for testability.
 * Calculates itemSpacing from child position gaps when CSS gap is 0.
 * Subtracts adjacent margins to avoid double-counting (margin wrappers re-add them).
 */
function calculateItemSpacingFromPositions(
  children: Pick<ExtractedElement, "x" | "y" | "width" | "height" | "margin">[],
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE",
  existingItemSpacing: number
): number {
  if (existingItemSpacing > 0 || children.length < 2) return existingItemSpacing;

  const isVertical = layoutMode !== "HORIZONTAL";
  const gaps: number[] = [];

  for (let i = 1; i < children.length; i++) {
    const prev = children[i - 1];
    const curr = children[i];

    let gap = isVertical
      ? curr.y - (prev.y + prev.height)
      : curr.x - (prev.x + prev.width);

    // Subtract adjacent margins (browser positions already include them)
    if (prev.margin || curr.margin) {
      const prevTrailing = isVertical
        ? (prev.margin?.bottom ?? 0)
        : (prev.margin?.right ?? 0);
      const currLeading = isVertical
        ? (curr.margin?.top ?? 0)
        : (curr.margin?.left ?? 0);
      gap -= (prevTrailing + currLeading);
    }

    if (gap > 0.5) gaps.push(gap);
  }

  if (gaps.length > 0) {
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    return Math.round(median);
  }

  return 0;
}

describe("calculateItemSpacingFromPositions", () => {
  // =========================================================================
  // Vertical layout: children stacked with uniform margins
  // =========================================================================
  it("vertical children with uniform 20px gap → itemSpacing = 20", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100 },
      { x: 0, y: 120, width: 300, height: 100 },
      { x: 0, y: 240, width: 300, height: 100 },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(20);
  });

  // =========================================================================
  // Horizontal layout: pricing cards with 24px gap
  // =========================================================================
  it("horizontal children with uniform 24px gap → itemSpacing = 24", () => {
    const children = [
      { x: 0, y: 0, width: 350, height: 500 },
      { x: 374, y: 0, width: 350, height: 500 },
      { x: 748, y: 0, width: 350, height: 500 },
    ];
    const result = calculateItemSpacingFromPositions(children, "HORIZONTAL", 0);
    expect(result).toBe(24);
  });

  // =========================================================================
  // CSS gap > 0 → don't override
  // =========================================================================
  it("existing CSS gap → preserves original itemSpacing", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100 },
      { x: 0, y: 130, width: 300, height: 100 },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 16);
    expect(result).toBe(16);
  });

  // =========================================================================
  // Single child → no spacing needed
  // =========================================================================
  it("single child → itemSpacing = 0", () => {
    const children = [{ x: 0, y: 0, width: 300, height: 100 }];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(0);
  });

  // =========================================================================
  // No children → itemSpacing = 0
  // =========================================================================
  it("no children → itemSpacing = 0", () => {
    const result = calculateItemSpacingFromPositions([], "VERTICAL", 0);
    expect(result).toBe(0);
  });

  // =========================================================================
  // Mixed gaps → uses median (middle value)
  // =========================================================================
  it("mixed gaps → uses median for robustness", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100 },   // gap: 16
      { x: 0, y: 116, width: 300, height: 100 },  // gap: 16
      { x: 0, y: 232, width: 300, height: 100 },  // gap: 40 (outlier)
      { x: 0, y: 372, width: 300, height: 100 },  // gap: 16
      { x: 0, y: 488, width: 300, height: 100 },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(16);
  });

  // =========================================================================
  // Sub-pixel gaps (< 0.5) are ignored
  // =========================================================================
  it("sub-pixel gaps → ignored, itemSpacing = 0", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100 },
      { x: 0, y: 100.3, width: 300, height: 100 },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(0);
  });

  // =========================================================================
  // NONE layout mode → treated as vertical
  // =========================================================================
  it("NONE layout mode → uses vertical gap calculation", () => {
    const children = [
      { x: 0, y: 0, width: 800, height: 200 },
      { x: 0, y: 232, width: 800, height: 200 },
    ];
    const result = calculateItemSpacingFromPositions(children, "NONE", 0);
    expect(result).toBe(32);
  });

  // =========================================================================
  // Overlapping children (negative gap) → no spacing
  // =========================================================================
  it("overlapping children → itemSpacing = 0", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100 },
      { x: 0, y: 90, width: 300, height: 100 }, // overlaps by 10px
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(0);
  });

  // =========================================================================
  // Fractional gap → rounded to nearest integer
  // =========================================================================
  it("fractional gap → rounds to nearest integer", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100 },
      { x: 0, y: 115.7, width: 300, height: 100 },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(16); // 15.7 rounds to 16
  });

  // =========================================================================
  // Margin subtraction: avoid double-counting with margin wrappers
  // =========================================================================
  it("vertical: subtracts adjacent margins from gap → pure spacing only", () => {
    // prev has margin-bottom: 20, curr has margin-top: 20
    // Position gap = 60px, but 40px is margins → true spacing = 20px
    const children = [
      { x: 0, y: 0, width: 300, height: 100, margin: { top: 0, right: 0, bottom: 20, left: 0 } },
      { x: 0, y: 160, width: 300, height: 100, margin: { top: 20, right: 0, bottom: 0, left: 0 } },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(20);
  });

  it("horizontal: subtracts adjacent margins from gap", () => {
    const children = [
      { x: 0, y: 0, width: 200, height: 100, margin: { top: 0, right: 16, bottom: 0, left: 0 } },
      { x: 232, y: 0, width: 200, height: 100, margin: { top: 0, right: 0, bottom: 0, left: 16 } },
    ];
    const result = calculateItemSpacingFromPositions(children, "HORIZONTAL", 0);
    expect(result).toBe(0); // 32 gap - 16 - 16 = 0
  });

  it("no margins → no subtraction (backward compatible)", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100 },
      { x: 0, y: 120, width: 300, height: 100 },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(20);
  });

  it("only prev has margin → only prev trailing subtracted", () => {
    const children = [
      { x: 0, y: 0, width: 300, height: 100, margin: { top: 0, right: 0, bottom: 10, left: 0 } },
      { x: 0, y: 130, width: 300, height: 100 },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(20); // 30 gap - 10 = 20
  });

  it("gap minus margins < 0.5 → no gap counted", () => {
    // Entire gap is margins, no real spacing
    const children = [
      { x: 0, y: 0, width: 300, height: 100, margin: { top: 0, right: 0, bottom: 20, left: 0 } },
      { x: 0, y: 140, width: 300, height: 100, margin: { top: 20, right: 0, bottom: 0, left: 0 } },
    ];
    const result = calculateItemSpacingFromPositions(children, "VERTICAL", 0);
    expect(result).toBe(0); // 40 - 20 - 20 = 0
  });
});
