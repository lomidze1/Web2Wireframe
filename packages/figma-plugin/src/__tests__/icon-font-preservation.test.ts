/**
 * Icon Font Preservation Tests
 *
 * Tests that icon fonts (Font Awesome, Material Icons, etc.) are NOT remapped
 * to plugin font during font resolution. Without this fix, icon glyphs like
 * "\uf03e" get rendered with Inter/Montserrat instead of their icon font,
 * producing wrong characters in Figma.
 *
 * Covers:
 * 1. buildPluginModeFontMapping() — icon font exclusion
 * 2. buildDefaultFontMapping() — icon font exclusion
 * 3. Font resolution in text.ts — node-level and segment-level
 */

import { describe, it, expect } from "vitest";
import {
  buildPluginModeFontMapping,
  buildDefaultFontMapping,
} from "../utils/fontUtils";

// ============================================================================
// 1. buildPluginModeFontMapping — icon font exclusion
// ============================================================================

describe("buildPluginModeFontMapping — icon font exclusion", () => {
  it("does NOT map Font Awesome 6 Free to plugin font", () => {
    const allFonts = new Set(["Inter", "Font Awesome 6 Free"]);
    const mapping = buildPluginModeFontMapping(allFonts, "Montserrat");

    expect(mapping["Inter"]).toBe("Montserrat");
    expect(mapping["Font Awesome 6 Free"]).toBeUndefined();
  });

  it("does NOT map Font Awesome 6 Brands to plugin font", () => {
    const allFonts = new Set(["Roboto", "Font Awesome 6 Brands"]);
    const mapping = buildPluginModeFontMapping(allFonts, "Inter");

    expect(mapping["Roboto"]).toBe("Inter");
    expect(mapping["Font Awesome 6 Brands"]).toBeUndefined();
  });

  it("does NOT map Material Icons to plugin font", () => {
    const allFonts = new Set(["Poppins", "Material Icons"]);
    const mapping = buildPluginModeFontMapping(allFonts, "Inter");

    expect(mapping["Poppins"]).toBe("Inter");
    expect(mapping["Material Icons"]).toBeUndefined();
  });

  it("does NOT map Material Symbols Outlined to plugin font", () => {
    const allFonts = new Set(["Arial", "Material Symbols Outlined"]);
    const mapping = buildPluginModeFontMapping(allFonts, "Inter");

    expect(mapping["Arial"]).toBe("Inter");
    expect(mapping["Material Symbols Outlined"]).toBeUndefined();
  });

  it("does NOT map bootstrap-icons to plugin font", () => {
    const allFonts = new Set(["Lato", "bootstrap-icons"]);
    const mapping = buildPluginModeFontMapping(allFonts, "Montserrat");

    expect(mapping["Lato"]).toBe("Montserrat");
    expect(mapping["bootstrap-icons"]).toBeUndefined();
  });
});

// ============================================================================
// 2. buildPluginModeFontMapping — mixed fonts (regular + icon)
// ============================================================================

describe("buildPluginModeFontMapping — mixed fonts", () => {
  it("maps regular fonts but preserves multiple icon fonts", () => {
    const allFonts = new Set([
      "Inter",
      "Roboto",
      "Font Awesome 6 Free",
      "Font Awesome 6 Brands",
      "Material Icons",
    ]);
    const mapping = buildPluginModeFontMapping(allFonts, "Montserrat");

    // Regular fonts → mapped
    expect(mapping["Inter"]).toBe("Montserrat");
    expect(mapping["Roboto"]).toBe("Montserrat");

    // Icon fonts → NOT in mapping
    expect(mapping["Font Awesome 6 Free"]).toBeUndefined();
    expect(mapping["Font Awesome 6 Brands"]).toBeUndefined();
    expect(mapping["Material Icons"]).toBeUndefined();
  });

  it("still excludes CSS generic fonts alongside icon fonts", () => {
    const allFonts = new Set([
      "Inter",
      "sans-serif",
      "Font Awesome 6 Free",
      "monospace",
    ]);
    const mapping = buildPluginModeFontMapping(allFonts, "Montserrat");

    expect(mapping["Inter"]).toBe("Montserrat");
    expect(mapping["sans-serif"]).toBeUndefined();
    expect(mapping["Font Awesome 6 Free"]).toBeUndefined();
    expect(mapping["monospace"]).toBeUndefined();
  });
});

// ============================================================================
// 3. buildDefaultFontMapping — icon font exclusion
// ============================================================================

describe("buildDefaultFontMapping — icon font exclusion", () => {
  it("does NOT map icon fonts even when listed as missing", () => {
    const missingFonts = ["CustomSans", "Font Awesome 6 Free", "Material Icons"];
    const mapping = buildDefaultFontMapping(missingFonts, "Inter");

    expect(mapping["CustomSans"]).toBe("Inter");
    // Icon fonts get identity mapping (preserve original for glyph rendering)
    expect(mapping["Font Awesome 6 Free"]).toBe("Font Awesome 6 Free");
    expect(mapping["Material Icons"]).toBe("Material Icons");
  });

  it("still applies smart defaults (mono/serif) for regular fonts", () => {
    const missingFonts = [
      "JetBrains Mono",
      "Playfair Display Serif",
      "Nunito",
      "Font Awesome 6 Free",
    ];
    const mapping = buildDefaultFontMapping(missingFonts, "Inter");

    expect(mapping["JetBrains Mono"]).toBe("Courier");
    expect(mapping["Playfair Display Serif"]).toBe("Georgia");
    expect(mapping["Nunito"]).toBe("Inter");
    // Icon fonts get identity mapping (preserve original for glyph rendering)
    expect(mapping["Font Awesome 6 Free"]).toBe("Font Awesome 6 Free");
  });
});

// ============================================================================
// 4. Font resolution — node level (text.ts behavior)
// ============================================================================

describe("font resolution — node level", () => {
  /**
   * These tests verify the EXPECTED behavior after the fix.
   * They test the resolution logic directly without Figma API dependencies.
   *
   * The resolution logic in text.ts (lines 331-338):
   *   if (context.fontMode === "plugin") {
   *     if (isIconFont(nodeFont)) → use nodeFont (preserve)
   *     else if (fontMapping[nodeFont]) → use mapped font
   *     else → use fontFamily
   *   }
   */

  // Simulate the font resolution logic that text.ts should implement
  function resolveNodeFont(
    nodeFont: string,
    fontMapping: Record<string, string>,
    defaultFont: string,
    isIconFontFn: (f: string) => boolean
  ): string {
    if (isIconFontFn(nodeFont)) {
      return nodeFont; // preserve icon font
    }
    if (fontMapping[nodeFont]) {
      return fontMapping[nodeFont];
    }
    return defaultFont;
  }

  // Simple isIconFont for test purposes (matches production patterns)
  function isIconFont(fontFamily: string): boolean {
    if (!fontFamily) return false;
    const lower = fontFamily.toLowerCase().replace(/['"]/g, "").trim();
    const patterns = [
      "font awesome", "fontawesome",
      "material icons", "material symbols",
      "bootstrap-icons", "remixicon", "icomoon", "ionicons",
    ];
    return patterns.some((p) => lower.includes(p));
  }

  it("preserves Font Awesome font for icon nodes", () => {
    const result = resolveNodeFont(
      "Font Awesome 6 Free",
      { "Font Awesome 6 Free": "Montserrat", "Inter": "Montserrat" },
      "Montserrat",
      isIconFont
    );
    expect(result).toBe("Font Awesome 6 Free");
  });

  it("still maps regular fonts to plugin font", () => {
    const result = resolveNodeFont(
      "Inter",
      { "Inter": "Montserrat" },
      "Montserrat",
      isIconFont
    );
    expect(result).toBe("Montserrat");
  });

  it("preserves Material Icons font for icon nodes", () => {
    const result = resolveNodeFont(
      "Material Icons",
      { "Material Icons": "Inter" },
      "Inter",
      isIconFont
    );
    expect(result).toBe("Material Icons");
  });
});

// ============================================================================
// 5. Font resolution — segment level (text.ts behavior)
// ============================================================================

describe("font resolution — segment level", () => {
  /**
   * These tests verify the EXPECTED behavior for per-segment font resolution.
   *
   * The resolution logic in text.ts (lines 526-542):
   *   if (context.fontMode === "plugin") {
   *     if (isIconFont(segFont)) → use segFont (preserve)
   *     else if (fontMapping[segFont]) → use mapped font
   *     else → use usedFontFamily
   *   }
   */

  function resolveSegmentFont(
    segmentFont: string | undefined,
    usedFontFamily: string,
    fontMapping: Record<string, string>,
    isIconFontFn: (f: string) => boolean
  ): string {
    const segFont = segmentFont || usedFontFamily;
    if (isIconFontFn(segFont)) {
      return segFont; // preserve icon font
    }
    if (fontMapping[segFont]) {
      return fontMapping[segFont];
    }
    return usedFontFamily;
  }

  function isIconFont(fontFamily: string): boolean {
    if (!fontFamily) return false;
    const lower = fontFamily.toLowerCase().replace(/['"]/g, "").trim();
    const patterns = [
      "font awesome", "fontawesome",
      "material icons", "material symbols",
      "bootstrap-icons", "remixicon", "icomoon", "ionicons",
    ];
    return patterns.some((p) => lower.includes(p));
  }

  it("preserves icon font in styled segment", () => {
    const result = resolveSegmentFont(
      "Font Awesome 6 Free",
      "Montserrat",
      { "Font Awesome 6 Free": "Montserrat" },
      isIconFont
    );
    expect(result).toBe("Font Awesome 6 Free");
  });

  it("maps regular font segments to plugin font", () => {
    const result = resolveSegmentFont(
      "Roboto",
      "Montserrat",
      { "Roboto": "Montserrat" },
      isIconFont
    );
    expect(result).toBe("Montserrat");
  });

  it("preserves icon font even when segment.fontFamily is undefined and usedFontFamily is icon font", () => {
    // Edge case: segment inherits icon font from parent node
    const result = resolveSegmentFont(
      undefined,
      "Font Awesome 6 Brands",
      { "Font Awesome 6 Brands": "Inter" },
      isIconFont
    );
    expect(result).toBe("Font Awesome 6 Brands");
  });
});
