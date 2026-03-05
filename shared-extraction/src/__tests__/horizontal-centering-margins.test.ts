/**
 * Horizontal centering margin logic tests
 *
 * When an element has `margin: 0 auto` (horizontallyCentered = true),
 * left/right margins are centering artifacts and should be excluded
 * from the margin object. This prevents unnecessary margin wrappers
 * and fixes the double-spacing / width inflation bugs.
 */

import { describe, it, expect } from "vitest";

/**
 * Extracted logic from tree-builder.ts for testability.
 * Computes effective margin, stripping L/R for centered elements.
 */
function computeEffectiveMargin(
  computedStyles: Record<string, string>,
  horizontallyCentered: boolean
): { top: number; right: number; bottom: number; left: number } | undefined {
  const marginTopVal = parseFloat(computedStyles["margin-top"]) || 0;
  const marginRightVal = parseFloat(computedStyles["margin-right"]) || 0;
  const marginBottomVal = parseFloat(computedStyles["margin-bottom"]) || 0;
  const marginLeftVal = parseFloat(computedStyles["margin-left"]) || 0;

  const effectiveMarginRight = horizontallyCentered ? 0 : marginRightVal;
  const effectiveMarginLeft = horizontallyCentered ? 0 : marginLeftVal;

  return marginTopVal > 0 ||
    effectiveMarginRight > 0 ||
    marginBottomVal > 0 ||
    effectiveMarginLeft > 0
    ? {
        top: marginTopVal,
        right: effectiveMarginRight,
        bottom: marginBottomVal,
        left: effectiveMarginLeft,
      }
    : undefined;
}

/**
 * Fallback centering detection from computed margins
 * (used when matchedStyles is unavailable, e.g. JSON import).
 */
function detectCenteringFromComputedMargins(
  computedStyles: Record<string, string>
): boolean {
  const compML = parseFloat(computedStyles["margin-left"]) || 0;
  const compMR = parseFloat(computedStyles["margin-right"]) || 0;
  return compML > 0 && compMR > 0 && Math.abs(compML - compMR) < 2;
}

describe("computeEffectiveMargin", () => {
  // =========================================================================
  // margin: 0 auto → L/R stripped, no margin object
  // =========================================================================
  it("margin: 0 auto → undefined (all margins zeroed out)", () => {
    const result = computeEffectiveMargin(
      {
        "margin-top": "0px",
        "margin-right": "130px",
        "margin-bottom": "0px",
        "margin-left": "130px",
      },
      true // horizontallyCentered
    );
    expect(result).toBeUndefined();
  });

  // =========================================================================
  // margin: 20px auto → keeps top/bottom only
  // =========================================================================
  it("margin: 20px auto → keeps top/bottom, strips L/R", () => {
    const result = computeEffectiveMargin(
      {
        "margin-top": "20px",
        "margin-right": "130px",
        "margin-bottom": "20px",
        "margin-left": "130px",
      },
      true
    );
    expect(result).toEqual({
      top: 20,
      right: 0,
      bottom: 20,
      left: 0,
    });
  });

  // =========================================================================
  // Non-centered → all margins preserved
  // =========================================================================
  it("non-centered element → all margins preserved", () => {
    const result = computeEffectiveMargin(
      {
        "margin-top": "10px",
        "margin-right": "20px",
        "margin-bottom": "30px",
        "margin-left": "40px",
      },
      false
    );
    expect(result).toEqual({
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
    });
  });

  // =========================================================================
  // All zeros → undefined
  // =========================================================================
  it("all margins zero → undefined", () => {
    const result = computeEffectiveMargin(
      {
        "margin-top": "0px",
        "margin-right": "0px",
        "margin-bottom": "0px",
        "margin-left": "0px",
      },
      false
    );
    expect(result).toBeUndefined();
  });

  // =========================================================================
  // Centered with only top margin → preserves top
  // =========================================================================
  it("centered with top margin only → preserves top", () => {
    const result = computeEffectiveMargin(
      {
        "margin-top": "40px",
        "margin-right": "130px",
        "margin-bottom": "0px",
        "margin-left": "130px",
      },
      true
    );
    expect(result).toEqual({
      top: 40,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  // =========================================================================
  // Non-centered with only left margin → preserved
  // =========================================================================
  it("non-centered with only left margin → preserved", () => {
    const result = computeEffectiveMargin(
      {
        "margin-top": "0px",
        "margin-right": "0px",
        "margin-bottom": "0px",
        "margin-left": "16px",
      },
      false
    );
    expect(result).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 16,
    });
  });
});

describe("detectCenteringFromComputedMargins", () => {
  // =========================================================================
  // Equal L/R margins → centered
  // =========================================================================
  it("equal left/right margins → detected as centered", () => {
    expect(
      detectCenteringFromComputedMargins({
        "margin-left": "130px",
        "margin-right": "130px",
      })
    ).toBe(true);
  });

  // =========================================================================
  // Nearly equal (within 2px tolerance) → centered
  // =========================================================================
  it("nearly equal margins (within 2px) → detected as centered", () => {
    expect(
      detectCenteringFromComputedMargins({
        "margin-left": "130.5px",
        "margin-right": "129.5px",
      })
    ).toBe(true);
  });

  // =========================================================================
  // Zero margins → not centered
  // =========================================================================
  it("zero margins → not centered", () => {
    expect(
      detectCenteringFromComputedMargins({
        "margin-left": "0px",
        "margin-right": "0px",
      })
    ).toBe(false);
  });

  // =========================================================================
  // Asymmetric margins → not centered
  // =========================================================================
  it("asymmetric margins → not centered", () => {
    expect(
      detectCenteringFromComputedMargins({
        "margin-left": "20px",
        "margin-right": "0px",
      })
    ).toBe(false);
  });

  // =========================================================================
  // Large difference → not centered
  // =========================================================================
  it("large margin difference → not centered", () => {
    expect(
      detectCenteringFromComputedMargins({
        "margin-left": "100px",
        "margin-right": "50px",
      })
    ).toBe(false);
  });
});
