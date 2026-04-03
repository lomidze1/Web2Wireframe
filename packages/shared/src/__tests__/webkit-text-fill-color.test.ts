/**
 * webkitTextFillColor Tests
 *
 * Verifies that -webkit-text-fill-color overrides CSS color
 * when they differ. This affects 689/695 nodes on Tesla.com.
 *
 * Note: resolveTextColor returns a parsed color string (hex) via parseColor(),
 * not a Figma {r,g,b,a} object.
 */

import { describe, it, expect } from "vitest";
import { resolveTextColor } from "../tree-builder";

describe("resolveTextColor", () => {
  it("should use -webkit-text-fill-color when different from color", () => {
    const result = resolveTextColor({
      "color": "rgb(0, 0, 0)",
      "-webkit-text-fill-color": "rgb(255, 0, 0)",
    });
    // Should pick the text-fill-color (red), not the CSS color (black)
    expect(result).toBe("#FF0000");
  });

  it("should fall back to color when -webkit-text-fill-color equals color", () => {
    const result = resolveTextColor({
      "color": "rgb(51, 51, 51)",
      "-webkit-text-fill-color": "rgb(51, 51, 51)",
    });
    expect(result).toBe("#333333");
  });

  it("should fall back to color when -webkit-text-fill-color is missing", () => {
    const result = resolveTextColor({
      "color": "rgb(0, 128, 255)",
    });
    expect(result).toBe("#0080FF");
  });

  it("should handle transparent -webkit-text-fill-color by falling back to color", () => {
    // rgba(0,0,0,0) is treated as transparent by parseColor → returns null
    // so we fall back to CSS color
    const result = resolveTextColor({
      "color": "rgb(100, 100, 100)",
      "-webkit-text-fill-color": "rgba(0, 0, 0, 0)",
    });
    // transparent text-fill-color falls back to color
    expect(result).toBe("#646464");
  });

  it("should return null when no color properties exist", () => {
    const result = resolveTextColor({});
    expect(result).toBeNull();
  });

  it("should use non-transparent -webkit-text-fill-color even when color is set", () => {
    const result = resolveTextColor({
      "color": "rgb(255, 255, 255)",
      "-webkit-text-fill-color": "rgb(0, 100, 200)",
    });
    expect(result).toBe("#0064C8");
  });
});
