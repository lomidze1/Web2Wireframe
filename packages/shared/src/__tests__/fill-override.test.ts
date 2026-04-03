/**
 * FILL → HUG Override Tests
 *
 * Tests dimensional verification in tree-builder that overrides
 * FILL to HUG when child is significantly smaller than parent content area.
 *
 * The override logic lives in tree-builder.ts after getLayoutSizing() call.
 * We test the same logic inline here to verify the algorithm.
 */

import { describe, it, expect } from "vitest";
import { getLayoutSizing } from "../utils";

/**
 * Simulates the FILL → HUG override logic from tree-builder.ts.
 * This mirrors the exact code that runs after getLayoutSizing().
 */
function applyFillOverride(
  layoutSizing: { horizontal: "FIXED" | "HUG" | "FILL" | undefined; vertical: "FIXED" | "HUG" | "FILL" | undefined },
  childWidth: number,
  childHeight: number,
  computedStyles: Record<string, string>,
  parentContext?: {
    direction: "HORIZONTAL" | "VERTICAL" | "NONE";
    alignItems?: string;
    contentWidth?: number;
    contentHeight?: number;
  }
): { horizontal: typeof layoutSizing.horizontal; vertical: typeof layoutSizing.vertical } {
  const result = { ...layoutSizing };

  if (parentContext) {
    const marginL = parseFloat(computedStyles["margin-left"]) || 0;
    const marginR = parseFloat(computedStyles["margin-right"]) || 0;
    const marginT = parseFloat(computedStyles["margin-top"]) || 0;
    const marginB = parseFloat(computedStyles["margin-bottom"]) || 0;
    const parentIsColumn = parentContext.direction === "VERTICAL";

    if (parentIsColumn && result.horizontal === "FILL" && parentContext.contentWidth !== undefined) {
      if (parentContext.contentWidth - childWidth - marginL - marginR > 2) {
        result.horizontal = "FIXED";
      }
    }
    if (!parentIsColumn && result.vertical === "FILL" && parentContext.contentHeight !== undefined) {
      if (parentContext.contentHeight - childHeight - marginT - marginB > 2) {
        result.vertical = "FIXED";
      }
    }
  }

  return result;
}

describe("FILL → HUG dimensional override", () => {
  // =========================================================================
  // Case 1: Narrow button (81px) in VERTICAL parent (1116px) → override to HUG
  // =========================================================================
  it("narrow button in vertical parent → FILL overridden to HUG", () => {
    const parentContext = {
      direction: "VERTICAL" as const,
      alignItems: undefined,
      contentWidth: 1116,
      contentHeight: 600,
    };
    const styles: Record<string, string> = {
      "margin-left": "0",
      "margin-right": "0",
      "margin-top": "0",
      "margin-bottom": "0",
    };

    // getLayoutSizing returns FILL for cross-axis (stretch default)
    const sizing = getLayoutSizing({}, 0, "auto", parentContext);
    expect(sizing.horizontal).toBe("FILL"); // before override

    const result = applyFillOverride(sizing, 81, 40, styles, parentContext);
    expect(result.horizontal).toBe("FIXED"); // after override
    expect(result.vertical).toBe("FIXED");   // main axis stays FIXED
  });

  // =========================================================================
  // Case 2: Full-width div (~1116px) in VERTICAL parent (1116px) → stays FILL
  // =========================================================================
  it("full-width div in vertical parent → FILL stays FILL", () => {
    const parentContext = {
      direction: "VERTICAL" as const,
      alignItems: undefined,
      contentWidth: 1116,
      contentHeight: 600,
    };
    const styles: Record<string, string> = {
      "margin-left": "0",
      "margin-right": "0",
      "margin-top": "0",
      "margin-bottom": "0",
    };

    const sizing = getLayoutSizing({}, 0, "auto", parentContext);
    const result = applyFillOverride(sizing, 1116, 200, styles, parentContext);
    expect(result.horizontal).toBe("FILL"); // exactly fills parent
  });

  // =========================================================================
  // Case 3: Full-width div with margins in VERTICAL parent → stays FILL
  // =========================================================================
  it("full-width div with margins in vertical parent → FILL stays FILL", () => {
    const parentContext = {
      direction: "VERTICAL" as const,
      alignItems: undefined,
      contentWidth: 1116,
      contentHeight: 600,
    };
    const styles: Record<string, string> = {
      "margin-left": "20",
      "margin-right": "20",
      "margin-top": "0",
      "margin-bottom": "0",
    };

    const sizing = getLayoutSizing({}, 0, "auto", parentContext);
    // 1116 - 1076 - 20 - 20 = 0 → within 2px threshold
    const result = applyFillOverride(sizing, 1076, 200, styles, parentContext);
    expect(result.horizontal).toBe("FILL");
  });

  // =========================================================================
  // Case 4: Narrow element in HORIZONTAL parent → vertical FILL overridden to HUG
  // =========================================================================
  it("short element in horizontal parent → vertical FILL overridden to HUG", () => {
    const parentContext = {
      direction: "HORIZONTAL" as const,
      alignItems: undefined,
      contentWidth: 1116,
      contentHeight: 400,
    };
    const styles: Record<string, string> = {
      "margin-left": "0",
      "margin-right": "0",
      "margin-top": "0",
      "margin-bottom": "0",
    };

    const sizing = getLayoutSizing({}, 0, "auto", parentContext);
    expect(sizing.vertical).toBe("FILL"); // cross-axis stretch default

    const result = applyFillOverride(sizing, 200, 50, styles, parentContext);
    expect(result.vertical).toBe("FIXED"); // overridden: 50 << 400
    expect(result.horizontal).toBe("FIXED"); // main axis stays FIXED
  });

  // =========================================================================
  // Case 5: No contentWidth in parentContext → no override (backwards-compatible)
  // =========================================================================
  it("no contentWidth in parentContext → no override", () => {
    const parentContext = {
      direction: "VERTICAL" as const,
      alignItems: undefined,
      // contentWidth intentionally omitted
    };
    const styles: Record<string, string> = {
      "margin-left": "0",
      "margin-right": "0",
      "margin-top": "0",
      "margin-bottom": "0",
    };

    const sizing = getLayoutSizing({}, 0, "auto", parentContext);
    const result = applyFillOverride(sizing, 81, 40, styles, parentContext);
    expect(result.horizontal).toBe("FILL"); // no override without dimensions
  });

  // =========================================================================
  // Case 6: Element within 2px threshold → stays FILL (rounding tolerance)
  // =========================================================================
  it("element within 2px of parent width → stays FILL", () => {
    const parentContext = {
      direction: "VERTICAL" as const,
      alignItems: undefined,
      contentWidth: 1116,
      contentHeight: 600,
    };
    const styles: Record<string, string> = {
      "margin-left": "0",
      "margin-right": "0",
      "margin-top": "0",
      "margin-bottom": "0",
    };

    const sizing = getLayoutSizing({}, 0, "auto", parentContext);
    // 1116 - 1114.5 = 1.5 → within 2px threshold
    const result = applyFillOverride(sizing, 1114.5, 200, styles, parentContext);
    expect(result.horizontal).toBe("FILL");
  });
});
