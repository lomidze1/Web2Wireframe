/**
 * Unit tests for nodes utilities
 * Tests pure functions that don't depend on Figma API
 */
import { describe, it, expect } from "vitest";
import { getOuterFrameHeight } from "../rendering/nodes";

// ============================================================================
// getOuterFrameHeight
// ============================================================================

describe("getOuterFrameHeight", () => {
  it("uses tree height when available (sub-pixel precision)", () => {
    expect(getOuterFrameHeight(1416.27, 1419)).toBe(1416.27);
  });

  it("falls back to viewportHeight when tree height is undefined", () => {
    expect(getOuterFrameHeight(undefined, 1419)).toBe(1419);
  });

  it("falls back to viewportHeight when tree height is 0", () => {
    expect(getOuterFrameHeight(0, 1419)).toBe(1419);
  });

  it("clamps to 15000px maximum", () => {
    expect(getOuterFrameHeight(20000, 20000)).toBe(15000);
  });

  it("clamps viewportHeight fallback to 15000px", () => {
    expect(getOuterFrameHeight(undefined, 18000)).toBe(15000);
  });

  it("preserves exact sub-pixel value", () => {
    expect(getOuterFrameHeight(842.5, 843)).toBe(842.5);
  });

  it("handles small heights", () => {
    expect(getOuterFrameHeight(100, 200)).toBe(100);
  });

  it("handles tree height equal to viewportHeight", () => {
    expect(getOuterFrameHeight(1024, 1024)).toBe(1024);
  });
});
