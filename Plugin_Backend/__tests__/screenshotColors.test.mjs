import { describe, it, expect } from "vitest";
import {
  validateExtractedColors,
  SCREENSHOT_SYSTEM_PROMPT,
} from "../lib/aiGenerator.js";

// ============================================================================
// validateExtractedColors
// ============================================================================

describe("validateExtractedColors", () => {
  const VALID_COLORS = {
    text: "#1C2F3A",
    background: "#FFFFFF",
    secondary: "#E0E0E0",
    surface: "#F5F5F5",
    accent: "#F4A261",
  };

  it("returns valid:true for a correct 5-key object", () => {
    const result = validateExtractedColors(VALID_COLORS);
    expect(result.valid).toBe(true);
    expect(result.colors).toEqual(VALID_COLORS);
  });

  it("returns valid:false when a key is missing", () => {
    const { accent, ...missing } = VALID_COLORS;
    const result = validateExtractedColors(missing);
    expect(result.valid).toBe(false);
    expect(result.colors).toBeNull();
  });

  it("returns valid:false for invalid hex values (e.g. 'red')", () => {
    const result = validateExtractedColors({ ...VALID_COLORS, accent: "red" });
    expect(result.valid).toBe(false);
    expect(result.colors).toBeNull();
  });

  it("returns valid:false for null/undefined input", () => {
    expect(validateExtractedColors(null).valid).toBe(false);
    expect(validateExtractedColors(undefined).valid).toBe(false);
    expect(validateExtractedColors(null).colors).toBeNull();
    expect(validateExtractedColors(undefined).colors).toBeNull();
  });

  it("strips extra keys — output has only the 5 expected keys", () => {
    const withExtras = { ...VALID_COLORS, border: "#CCCCCC", primary: "#000000" };
    const result = validateExtractedColors(withExtras);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.colors)).toHaveLength(5);
    expect(result.colors).toEqual(VALID_COLORS);
  });
});

// ============================================================================
// SCREENSHOT_SYSTEM_PROMPT contains extractedColors
// ============================================================================

describe("SCREENSHOT_SYSTEM_PROMPT", () => {
  it("contains 'extractedColors' instruction", () => {
    expect(SCREENSHOT_SYSTEM_PROMPT).toContain("extractedColors");
  });
});
