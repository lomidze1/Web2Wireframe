/**
 * Unit tests for color utilities
 * Tests pure functions that don't depend on Figma API
 */
import { describe, it, expect } from "vitest";
import {
  hexToFigmaRGB,
  cssColorToFigmaRGB,
  figmaRGBToHex,
  normalizeColorForLookup,
  isLightColorValue,
  isSaturatedColor,
  colorsAreTooSimilar,
  isHighlightedElement,
  determineColorRole,
  getPluginColorForRole,
} from "../rendering/colors";

// ============================================================================
// hexToFigmaRGB
// ============================================================================

describe("hexToFigmaRGB", () => {
  it("converts 6-digit hex to RGB (0-1 range)", () => {
    expect(hexToFigmaRGB("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToFigmaRGB("#00ff00")).toEqual({ r: 0, g: 1, b: 0 });
    expect(hexToFigmaRGB("#0000ff")).toEqual({ r: 0, g: 0, b: 1 });
  });

  it("converts white and black correctly", () => {
    expect(hexToFigmaRGB("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToFigmaRGB("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("handles hex without # prefix", () => {
    expect(hexToFigmaRGB("ff0000")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("handles 8-digit hex (with alpha) by extracting RGB", () => {
    expect(hexToFigmaRGB("#ff0000ff")).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToFigmaRGB("#00ff0080")).toEqual({ r: 0, g: 1, b: 0 });
  });

  it("returns default gray for invalid/empty input", () => {
    expect(hexToFigmaRGB("")).toEqual({ r: 0.96, g: 0.96, b: 0.96 });
    expect(hexToFigmaRGB("transparent")).toEqual({ r: 0.96, g: 0.96, b: 0.96 });
    expect(hexToFigmaRGB("invalid")).toEqual({ r: 0.96, g: 0.96, b: 0.96 });
  });
});

// ============================================================================
// cssColorToFigmaRGB
// ============================================================================

describe("cssColorToFigmaRGB", () => {
  it("parses hex colors", () => {
    const result = cssColorToFigmaRGB("#ff0000");
    expect(result).toEqual({ color: { r: 1, g: 0, b: 0 }, opacity: 1 });
  });

  it("parses 8-digit hex with alpha", () => {
    const result = cssColorToFigmaRGB("#ff000080");
    expect(result?.color).toEqual({ r: 1, g: 0, b: 0 });
    expect(result?.opacity).toBeCloseTo(0.502, 2);
  });

  it("parses rgb() colors", () => {
    const result = cssColorToFigmaRGB("rgb(255, 0, 0)");
    expect(result).toEqual({ color: { r: 1, g: 0, b: 0 }, opacity: 1 });
  });

  it("parses rgba() colors", () => {
    const result = cssColorToFigmaRGB("rgba(255, 0, 0, 0.5)");
    expect(result?.color).toEqual({ r: 1, g: 0, b: 0 });
    expect(result?.opacity).toBe(0.5);
  });

  it("returns null for transparent or empty", () => {
    expect(cssColorToFigmaRGB("transparent")).toBeNull();
    expect(cssColorToFigmaRGB("")).toBeNull();
  });
});

// ============================================================================
// figmaRGBToHex
// ============================================================================

describe("figmaRGBToHex", () => {
  it("converts RGB (0-1) to hex", () => {
    expect(figmaRGBToHex({ r: 1, g: 0, b: 0 })).toBe("#ff0000");
    expect(figmaRGBToHex({ r: 0, g: 1, b: 0 })).toBe("#00ff00");
    expect(figmaRGBToHex({ r: 0, g: 0, b: 1 })).toBe("#0000ff");
  });

  it("converts white and black", () => {
    expect(figmaRGBToHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
    expect(figmaRGBToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("handles mid-range values", () => {
    expect(figmaRGBToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#808080");
  });
});

// ============================================================================
// normalizeColorForLookup
// ============================================================================

describe("normalizeColorForLookup", () => {
  it("lowercases and trims", () => {
    expect(normalizeColorForLookup("  #FF0000  ")).toBe("#ff0000");
  });

  it("expands 3-digit hex to 6-digit", () => {
    expect(normalizeColorForLookup("#f00")).toBe("#ff0000");
    expect(normalizeColorForLookup("#abc")).toBe("#aabbcc");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizeColorForLookup("")).toBe("");
  });
});

// ============================================================================
// isLightColorValue
// ============================================================================

describe("isLightColorValue", () => {
  it("identifies white as light", () => {
    expect(isLightColorValue({ r: 1, g: 1, b: 1 })).toBe(true);
  });

  it("identifies black as dark", () => {
    expect(isLightColorValue({ r: 0, g: 0, b: 0 })).toBe(false);
  });

  it("identifies light gray as light", () => {
    expect(isLightColorValue({ r: 0.8, g: 0.8, b: 0.8 })).toBe(true);
  });

  it("identifies dark gray as dark", () => {
    expect(isLightColorValue({ r: 0.2, g: 0.2, b: 0.2 })).toBe(false);
  });

  it("uses luminance formula (green weighted higher)", () => {
    // Pure green has higher luminance than pure red
    expect(isLightColorValue({ r: 0, g: 0.8, b: 0 })).toBe(false); // 0.587 * 0.8 = 0.47
    expect(isLightColorValue({ r: 0, g: 0.9, b: 0 })).toBe(true); // 0.587 * 0.9 = 0.53
  });
});

// ============================================================================
// isSaturatedColor
// ============================================================================

describe("isSaturatedColor", () => {
  it("identifies saturated colors", () => {
    expect(isSaturatedColor({ r: 1, g: 0, b: 0 })).toBe(true); // Pure red
    expect(isSaturatedColor({ r: 0, g: 0.5, b: 1 })).toBe(true); // Blue
  });

  it("identifies gray as not saturated", () => {
    expect(isSaturatedColor({ r: 0.5, g: 0.5, b: 0.5 })).toBe(false);
  });

  it("identifies black as not saturated", () => {
    expect(isSaturatedColor({ r: 0, g: 0, b: 0 })).toBe(false);
  });

  it("identifies white as not saturated", () => {
    expect(isSaturatedColor({ r: 1, g: 1, b: 1 })).toBe(false);
  });
});

// ============================================================================
// colorsAreTooSimilar
// ============================================================================

describe("colorsAreTooSimilar", () => {
  it("returns true for identical colors", () => {
    const color = { r: 0.5, g: 0.5, b: 0.5 };
    expect(colorsAreTooSimilar(color, color)).toBe(true);
  });

  it("returns true for very similar colors", () => {
    const color1 = { r: 0.5, g: 0.5, b: 0.5 };
    const color2 = { r: 0.51, g: 0.51, b: 0.51 };
    expect(colorsAreTooSimilar(color1, color2)).toBe(true);
  });

  it("returns false for different colors", () => {
    const color1 = { r: 0.5, g: 0.5, b: 0.5 };
    const color2 = { r: 1, g: 0, b: 0 };
    expect(colorsAreTooSimilar(color1, color2)).toBe(false);
  });

  it("returns false if either color is null", () => {
    expect(colorsAreTooSimilar(null, { r: 1, g: 0, b: 0 })).toBe(false);
    expect(colorsAreTooSimilar({ r: 1, g: 0, b: 0 }, null)).toBe(false);
  });

  it("respects custom tolerance", () => {
    const color1 = { r: 0.5, g: 0.5, b: 0.5 };
    const color2 = { r: 0.55, g: 0.55, b: 0.55 };
    expect(colorsAreTooSimilar(color1, color2, 0.1)).toBe(true);
    expect(colorsAreTooSimilar(color1, color2, 0.01)).toBe(false);
  });
});

// ============================================================================
// isHighlightedElement
// ============================================================================

describe("isHighlightedElement", () => {
  it("detects common highlight class names", () => {
    expect(isHighlightedElement("pricing-card active")).toBe(true);
    expect(isHighlightedElement("featured-plan")).toBe(true);
    expect(isHighlightedElement("popular")).toBe(true);
    expect(isHighlightedElement("highlighted")).toBe(true);
    expect(isHighlightedElement("selected-item")).toBe(true);
    expect(isHighlightedElement("primary-button")).toBe(true);
    expect(isHighlightedElement("recommended")).toBe(true);
    expect(isHighlightedElement("best-value")).toBe(true);
    expect(isHighlightedElement("pro-plan")).toBe(true);
    expect(isHighlightedElement("premium-tier")).toBe(true);
    expect(isHighlightedElement("enterprise")).toBe(true);
  });

  it("returns false for non-highlight classes", () => {
    expect(isHighlightedElement("card")).toBe(false);
    expect(isHighlightedElement("container")).toBe(false);
    expect(isHighlightedElement("button")).toBe(false);
  });

  it("returns false for empty/undefined", () => {
    expect(isHighlightedElement(undefined)).toBe(false);
    expect(isHighlightedElement("")).toBe(false);
  });
});

// ============================================================================
// determineColorRole
// ============================================================================

describe("determineColorRole", () => {
  it("returns text for stroke elements", () => {
    expect(determineColorRole("stroke", "div")).toBe("text");
  });

  it("returns text for text elements", () => {
    expect(determineColorRole("text", "p")).toBe("text");
    expect(determineColorRole("text", "h1")).toBe("text");
  });

  it("returns accent for buttons", () => {
    expect(determineColorRole("fill", "button")).toBe("accent");
    expect(determineColorRole("fill", "a")).toBe("accent");
  });

  it("returns background for header/footer", () => {
    expect(determineColorRole("fill", "header")).toBe("background");
    expect(determineColorRole("fill", "footer")).toBe("background");
  });

  it("handles light vs dark fill colors", () => {
    expect(determineColorRole("fill", "div", true)).toBe("background");
    expect(determineColorRole("fill", "div", false)).toBe("surface");
  });

  it("returns secondary for highlighted elements", () => {
    expect(determineColorRole("fill", "div", false, undefined, "featured")).toBe(
      "secondary"
    );
  });
});

// ============================================================================
// getPluginColorForRole
// ============================================================================

describe("getPluginColorForRole", () => {
  const pluginColors = {
    text: "#11151A",
    background: "#FFFFFF",
    secondary: "#1f3a5f",
    surface: "#f5f5f5",
    accent: "#3b82f6",
  };

  it("returns correct color for each role", () => {
    expect(getPluginColorForRole("text", pluginColors)).toBe("#11151A");
    expect(getPluginColorForRole("background", pluginColors)).toBe("#FFFFFF");
    expect(getPluginColorForRole("secondary", pluginColors)).toBe("#1f3a5f");
    expect(getPluginColorForRole("surface", pluginColors)).toBe("#f5f5f5");
    expect(getPluginColorForRole("accent", pluginColors)).toBe("#3b82f6");
  });

  it("falls back to surface for unknown role", () => {
    expect(getPluginColorForRole("unknown" as any, pluginColors)).toBe("#f5f5f5");
  });
});
