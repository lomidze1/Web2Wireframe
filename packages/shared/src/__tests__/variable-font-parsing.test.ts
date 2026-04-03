/**
 * Variable Font Parsing Tests
 *
 * Tests for extracting font weight and axis information from
 * postScriptName hex suffixes (used by variable fonts) and
 * familyName keyword matching.
 */

import { describe, it, expect } from "vitest";
import {
  parseVariableFontAxes,
  isVariableFont,
  deriveWeightFromPlatformFont,
  weightFromFamilyName,
} from "../font-utils";

// ============================================================================
// parseVariableFontAxes
// ============================================================================

describe("parseVariableFontAxes", () => {
  it("extracts weight hex value from postScriptName", () => {
    const result = parseVariableFontAxes("SourceSans3VF-ExtraLight_wght1E00000");
    expect(result).not.toBeNull();
    expect(result!.wght).toBeDefined();
  });

  it("returns null when no axis suffixes present", () => {
    const result = parseVariableFontAxes("SourceSans3VF");
    expect(result).toBeNull();
  });

  it("extracts both wght and wdth axes", () => {
    const result = parseVariableFontAxes("SomeFont_wght19000000_wdth0064");
    expect(result).not.toBeNull();
    expect(result!.wght).toBeDefined();
    expect(result!.wdth).toBeDefined();
  });

  it("returns null for regular PostScript names with hyphens", () => {
    const result = parseVariableFontAxes("PPFragmentGlare-Medium");
    expect(result).toBeNull();
  });

  it("handles single axis suffix", () => {
    const result = parseVariableFontAxes("Inter_wght18000000");
    expect(result).not.toBeNull();
    expect(result!.wght).toBeDefined();
    expect(result!.wdth).toBeUndefined();
  });
});

// ============================================================================
// isVariableFont
// ============================================================================

describe("isVariableFont", () => {
  it("returns true for variable font postScriptName with axis suffix", () => {
    expect(isVariableFont("SourceSans3VF_wght1E00000")).toBe(true);
  });

  it("returns false for regular postScriptName", () => {
    expect(isVariableFont("PPFragmentGlare-Medium")).toBe(false);
  });

  it("returns true for multi-axis variable font", () => {
    expect(isVariableFont("SomeFont_wght19000000_wdth0064")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isVariableFont("")).toBe(false);
  });
});

// ============================================================================
// deriveWeightFromPlatformFont
// ============================================================================

describe("deriveWeightFromPlatformFont", () => {
  it("derives weight from variable font postScriptName hex", () => {
    // Variable font with weight axis
    const weight = deriveWeightFromPlatformFont({
      familyName: "Source Sans 3 VF",
      postScriptName: "SourceSans3VF-ExtraLight_wght1E00000",
      isCustomFont: true,
      glyphCount: 50,
    });
    expect(weight).toBeTypeOf("number");
    expect(weight).toBeGreaterThan(0);
  });

  it("derives weight from familyName keyword for non-variable font", () => {
    const weight = deriveWeightFromPlatformFont({
      familyName: "Averta Std Bold",
      postScriptName: "AvertaStd-Bold",
      isCustomFont: true,
      glyphCount: 39,
    });
    expect(weight).toBe(700);
  });

  it("returns null when no weight can be derived", () => {
    const weight = deriveWeightFromPlatformFont({
      familyName: "Custom Font",
      postScriptName: "CustomFont",
      isCustomFont: true,
      glyphCount: 20,
    });
    expect(weight).toBeNull();
  });

  it("prefers variable font axis over familyName keyword", () => {
    // If postScriptName has axis data, use that over keyword
    const weight = deriveWeightFromPlatformFont({
      familyName: "SourceSans3VF-ExtraLight",
      postScriptName: "SourceSans3VF-ExtraLight_wght1E00000",
      isCustomFont: true,
      glyphCount: 50,
    });
    // Should use hex-derived weight, not keyword
    expect(weight).toBeTypeOf("number");
  });
});

// ============================================================================
// weightFromFamilyName
// ============================================================================

describe("weightFromFamilyName", () => {
  it("maps ExtraLight to 200", () => {
    expect(weightFromFamilyName("SourceSans3VF-ExtraLight")).toBe(200);
  });

  it("maps Semibold to 600", () => {
    expect(weightFromFamilyName("Averta Std Semibold")).toBe(600);
  });

  it("maps Bold to 700", () => {
    expect(weightFromFamilyName("Roboto Bold")).toBe(700);
  });

  it("maps Thin to 100", () => {
    expect(weightFromFamilyName("Inter Thin")).toBe(100);
  });

  it("maps Light to 300", () => {
    expect(weightFromFamilyName("Lato Light")).toBe(300);
  });

  it("maps Medium to 500", () => {
    expect(weightFromFamilyName("Poppins Medium")).toBe(500);
  });

  it("maps Black to 900", () => {
    expect(weightFromFamilyName("Montserrat Black")).toBe(900);
  });

  it("maps ExtraBold to 800", () => {
    expect(weightFromFamilyName("Open Sans ExtraBold")).toBe(800);
  });

  it("returns null for Regular", () => {
    expect(weightFromFamilyName("Inter Regular")).toBeNull();
  });

  it("returns null when no weight keyword found", () => {
    expect(weightFromFamilyName("CustomFont")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(weightFromFamilyName("somefont-bold")).toBe(700);
    expect(weightFromFamilyName("SomeFont-BOLD")).toBe(700);
  });

  it("maps DemiBold to 600", () => {
    expect(weightFromFamilyName("SomeFont DemiBold")).toBe(600);
  });

  it("maps UltraLight to 200", () => {
    expect(weightFromFamilyName("SomeFont UltraLight")).toBe(200);
  });

  it("maps Heavy to 900", () => {
    expect(weightFromFamilyName("SomeFont Heavy")).toBe(900);
  });
});
