/**
 * Unit tests for layout utilities
 * Tests pure functions that don't depend on Figma API
 */
import { describe, it, expect } from "vitest";
import {
  getBorderRadius,
  getCornerRadii,
  cssJustifyToFigma,
  cssAlignToFigma,
  cssAlignSelfToFigma,
  applyTextAlignFallback,
  needsMarginWrapper,
  getSizingMode,
} from "../rendering/layout";

// ============================================================================
// getBorderRadius
// ============================================================================

describe("getBorderRadius", () => {
  it("returns 0 for undefined", () => {
    expect(getBorderRadius(undefined)).toBe(0);
  });

  it("returns number as-is", () => {
    expect(getBorderRadius(8)).toBe(8);
    expect(getBorderRadius(0)).toBe(0);
  });

  it("returns max corner radius from object", () => {
    expect(
      getBorderRadius({
        topLeft: 4,
        topRight: 8,
        bottomRight: 12,
        bottomLeft: 6,
      })
    ).toBe(12);
  });

  it("handles partial corner values", () => {
    expect(
      getBorderRadius({
        topLeft: 0,
        topRight: 0,
        bottomRight: 0,
        bottomLeft: 0,
      })
    ).toBe(0);
  });
});

// ============================================================================
// getCornerRadii
// ============================================================================

describe("getCornerRadii", () => {
  it("returns all zeros for undefined", () => {
    expect(getCornerRadii(undefined)).toEqual({
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    });
  });

  it("expands number to all corners", () => {
    expect(getCornerRadii(8)).toEqual({
      topLeft: 8,
      topRight: 8,
      bottomRight: 8,
      bottomLeft: 8,
    });
  });

  it("returns object as-is", () => {
    const radii = {
      topLeft: 4,
      topRight: 8,
      bottomRight: 12,
      bottomLeft: 6,
    };
    expect(getCornerRadii(radii)).toEqual(radii);
  });
});

// ============================================================================
// cssJustifyToFigma
// ============================================================================

describe("cssJustifyToFigma", () => {
  it("returns MIN for start values", () => {
    expect(cssJustifyToFigma("flex-start")).toBe("MIN");
    expect(cssJustifyToFigma("start")).toBe("MIN");
    expect(cssJustifyToFigma("left")).toBe("MIN");
    expect(cssJustifyToFigma("normal")).toBe("MIN");
  });

  it("returns MAX for end values", () => {
    expect(cssJustifyToFigma("flex-end")).toBe("MAX");
    expect(cssJustifyToFigma("end")).toBe("MAX");
    expect(cssJustifyToFigma("right")).toBe("MAX");
  });

  it("returns CENTER for center", () => {
    expect(cssJustifyToFigma("center")).toBe("CENTER");
  });

  it("returns SPACE_BETWEEN for spacing values", () => {
    expect(cssJustifyToFigma("space-between")).toBe("SPACE_BETWEEN");
    expect(cssJustifyToFigma("space-around")).toBe("SPACE_BETWEEN");
    expect(cssJustifyToFigma("space-evenly")).toBe("SPACE_BETWEEN");
  });

  it("returns MIN for undefined or unknown", () => {
    expect(cssJustifyToFigma(undefined)).toBe("MIN");
    expect(cssJustifyToFigma("unknown")).toBe("MIN");
  });
});

// ============================================================================
// cssAlignToFigma
// ============================================================================

describe("cssAlignToFigma", () => {
  it("returns MIN for start values", () => {
    expect(cssAlignToFigma("flex-start")).toBe("MIN");
    expect(cssAlignToFigma("start")).toBe("MIN");
    expect(cssAlignToFigma("self-start")).toBe("MIN");
    expect(cssAlignToFigma("stretch")).toBe("MIN");
    expect(cssAlignToFigma("normal")).toBe("MIN");
  });

  it("returns MAX for end values", () => {
    expect(cssAlignToFigma("flex-end")).toBe("MAX");
    expect(cssAlignToFigma("end")).toBe("MAX");
    expect(cssAlignToFigma("self-end")).toBe("MAX");
  });

  it("returns CENTER for center", () => {
    expect(cssAlignToFigma("center")).toBe("CENTER");
  });

  it("returns BASELINE for baseline", () => {
    expect(cssAlignToFigma("baseline")).toBe("BASELINE");
  });

  it("returns MIN for undefined or unknown", () => {
    expect(cssAlignToFigma(undefined)).toBe("MIN");
    expect(cssAlignToFigma("unknown")).toBe("MIN");
  });
});

// ============================================================================
// cssAlignSelfToFigma
// ============================================================================

describe("cssAlignSelfToFigma", () => {
  it("returns INHERIT for auto or undefined", () => {
    expect(cssAlignSelfToFigma(undefined, "MIN")).toBe("INHERIT");
    expect(cssAlignSelfToFigma("auto", "MIN")).toBe("INHERIT");
  });

  it("returns MIN for start values", () => {
    expect(cssAlignSelfToFigma("flex-start", "CENTER")).toBe("MIN");
    expect(cssAlignSelfToFigma("start", "CENTER")).toBe("MIN");
    expect(cssAlignSelfToFigma("self-start", "CENTER")).toBe("MIN");
  });

  it("returns MAX for end values", () => {
    expect(cssAlignSelfToFigma("flex-end", "CENTER")).toBe("MAX");
    expect(cssAlignSelfToFigma("end", "CENTER")).toBe("MAX");
    expect(cssAlignSelfToFigma("self-end", "CENTER")).toBe("MAX");
  });

  it("returns CENTER for center", () => {
    expect(cssAlignSelfToFigma("center", "MIN")).toBe("CENTER");
  });

  it("returns STRETCH for stretch", () => {
    expect(cssAlignSelfToFigma("stretch", "MIN")).toBe("STRETCH");
  });

  it("returns INHERIT for unknown", () => {
    expect(cssAlignSelfToFigma("unknown", "MIN")).toBe("INHERIT");
  });
});

// ============================================================================
// needsMarginWrapper
// ============================================================================

describe("needsMarginWrapper", () => {
  it("returns false for undefined margin", () => {
    expect(needsMarginWrapper(undefined)).toBe(false);
  });

  it("returns false for all zero margins", () => {
    expect(needsMarginWrapper({ top: 0, right: 0, bottom: 0, left: 0 })).toBe(
      false
    );
  });

  it("returns true if any margin is positive", () => {
    expect(needsMarginWrapper({ top: 10, right: 0, bottom: 0, left: 0 })).toBe(
      true
    );
    expect(needsMarginWrapper({ top: 0, right: 10, bottom: 0, left: 0 })).toBe(
      true
    );
    expect(needsMarginWrapper({ top: 0, right: 0, bottom: 10, left: 0 })).toBe(
      true
    );
    expect(needsMarginWrapper({ top: 0, right: 0, bottom: 0, left: 10 })).toBe(
      true
    );
  });
});

// ============================================================================
// getSizingMode
// ============================================================================

describe("getSizingMode", () => {
  it("returns explicit layoutSizingHorizontal when set", () => {
    const node = {
      type: "frame" as const,
      width: 100,
      height: 100,
      layoutSizingHorizontal: "FILL" as const,
    };
    expect(getSizingMode(node as any, "horizontal")).toBe("FILL");
  });

  it("returns explicit layoutSizingVertical when set", () => {
    const node = {
      type: "frame" as const,
      width: 100,
      height: 100,
      layoutSizingVertical: "HUG" as const,
    };
    expect(getSizingMode(node as any, "vertical")).toBe("HUG");
  });

  it("returns HUG for text elements by default", () => {
    const textNode = { type: "text" as const, width: 100, height: 20 };
    expect(getSizingMode(textNode as any, "horizontal")).toBe("HUG");
    expect(getSizingMode(textNode as any, "vertical")).toBe("HUG");
  });

  it("returns FIXED for frame elements by default", () => {
    const frameNode = { type: "frame" as const, width: 100, height: 100 };
    expect(getSizingMode(frameNode as any, "horizontal")).toBe("FIXED");
    expect(getSizingMode(frameNode as any, "vertical")).toBe("FIXED");
  });
});

// ============================================================================
// applyTextAlignFallback
// ============================================================================

describe("applyTextAlignFallback", () => {
  function createMockFrame(
    layoutMode: "VERTICAL" | "HORIZONTAL",
    primaryAxisAlignItems: string = "MIN",
    counterAxisAlignItems: string = "MIN"
  ) {
    return {
      layoutMode,
      primaryAxisAlignItems,
      counterAxisAlignItems,
    } as unknown as FrameNode;
  }

  it("sets counterAxisAlignItems to CENTER for VERTICAL frame with text-align: center", () => {
    const frame = createMockFrame("VERTICAL");
    applyTextAlignFallback(frame, "center", undefined, undefined);
    expect(frame.counterAxisAlignItems).toBe("CENTER");
    expect(frame.primaryAxisAlignItems).toBe("MIN"); // unchanged
  });

  it("sets counterAxisAlignItems to MAX for VERTICAL frame with text-align: right", () => {
    const frame = createMockFrame("VERTICAL");
    applyTextAlignFallback(frame, "right", undefined, undefined);
    expect(frame.counterAxisAlignItems).toBe("MAX");
  });

  it("sets primaryAxisAlignItems to CENTER for HORIZONTAL frame with text-align: center", () => {
    const frame = createMockFrame("HORIZONTAL");
    applyTextAlignFallback(frame, "center", undefined, undefined);
    expect(frame.primaryAxisAlignItems).toBe("CENTER");
    expect(frame.counterAxisAlignItems).toBe("MIN"); // unchanged
  });

  it("does not override when alignItems is set (VERTICAL)", () => {
    const frame = createMockFrame("VERTICAL");
    applyTextAlignFallback(frame, "center", undefined, "flex-start");
    expect(frame.counterAxisAlignItems).toBe("MIN"); // unchanged
  });

  it("does not override when justifyContent is set (HORIZONTAL)", () => {
    const frame = createMockFrame("HORIZONTAL");
    applyTextAlignFallback(frame, "center", "flex-start", undefined);
    expect(frame.primaryAxisAlignItems).toBe("MIN"); // unchanged
  });

  it("does nothing for text-align: left or start", () => {
    const frame = createMockFrame("VERTICAL");
    applyTextAlignFallback(frame, "left", undefined, undefined);
    expect(frame.counterAxisAlignItems).toBe("MIN");

    applyTextAlignFallback(frame, "start", undefined, undefined);
    expect(frame.counterAxisAlignItems).toBe("MIN");
  });

  it("does nothing for undefined textAlign", () => {
    const frame = createMockFrame("VERTICAL");
    applyTextAlignFallback(frame, undefined, undefined, undefined);
    expect(frame.counterAxisAlignItems).toBe("MIN");
    expect(frame.primaryAxisAlignItems).toBe("MIN");
  });
});
