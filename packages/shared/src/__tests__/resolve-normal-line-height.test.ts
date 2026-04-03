import { describe, it, expect } from "vitest";
import { resolveNormalLineHeight } from "../tree-builder";

describe("resolveNormalLineHeight", () => {
  it("single-line text: returns textBoundsHeight / 1", () => {
    const result = resolveNormalLineHeight("normal", 16, 19.2, 1);
    expect(result).toBe(19.2);
  });

  it("multi-line text: returns textBoundsHeight / lineCount", () => {
    const result = resolveNormalLineHeight("normal", 16, 38.4, 2);
    expect(result).toBe(19.2);
  });

  it("no textBounds (null): falls back to fontSize * 1.2", () => {
    const result = resolveNormalLineHeight("normal", 16, null, 1);
    expect(result).toBe(19.2);
  });

  it("zero browserLineCount: falls back to fontSize * 1.2", () => {
    const result = resolveNormalLineHeight("normal", 16, 19.2, 0);
    expect(result).toBe(19.2);
  });

  it("already a pixel number: returns unchanged", () => {
    const result = resolveNormalLineHeight(24, 16, 19.2, 1);
    expect(result).toBe(24);
  });

  it("already a pixel string (e.g. '24px'): returns unchanged", () => {
    const result = resolveNormalLineHeight("24px", 16, 19.2, 1);
    expect(result).toBe("24px");
  });

  it("percentage string: returns unchanged", () => {
    const result = resolveNormalLineHeight("150%", 16, 19.2, 1);
    expect(result).toBe("150%");
  });

  it("unreasonably small textBounds (< fontSize): falls back to fontSize * 1.2", () => {
    // textBoundsHeight / lineCount = 5 < fontSize 16 → sanity check fails
    const result = resolveNormalLineHeight("normal", 16, 5, 1);
    expect(result).toBe(19.2);
  });

  it("unreasonably large textBounds (> 3× fontSize): falls back to fontSize * 1.2", () => {
    // textBoundsHeight / lineCount = 100 > 3 × 16 = 48 → sanity check fails
    const result = resolveNormalLineHeight("normal", 16, 100, 1);
    expect(result).toBe(19.2);
  });

  it("rounds to 2 decimal places", () => {
    // 25.59 / 1 = 25.59 (already 2 decimals)
    const result = resolveNormalLineHeight("normal", 18, 25.59, 1);
    expect(result).toBe(25.59);
  });

  it("fallback also rounds to 2 decimal places", () => {
    // 13 * 1.2 = 15.6
    const result = resolveNormalLineHeight("normal", 13, null, 0);
    expect(result).toBe(15.6);
  });
});
