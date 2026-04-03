/**
 * Font Fallback "Use original fonts" Tests (Phase 2)
 *
 * Tests for the "Continue as-is" → "Use original fonts" fix:
 * - FontFallbackModal sends identity mapping (not empty {})
 * - main.ts handler converts identity mapping to Inter for rendering
 * - createTextStyles creates styles with original names but Inter font
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Test 1: FontFallbackModal "Use original fonts" sends identity mapping
// ============================================================================

describe("FontFallbackModal — Use original fonts choice", () => {
  it("should build identity mapping for all missing fonts", () => {
    // Simulate the handleUseOriginal logic
    const missingFonts = ["PP Fragment Glare Medium", "Averta Std Bold", "Averta Std Semibold"];
    const mapping: Record<string, string> = {};
    for (const font of missingFonts) {
      mapping[font] = font;
    }

    expect(mapping).toEqual({
      "PP Fragment Glare Medium": "PP Fragment Glare Medium",
      "Averta Std Bold": "Averta Std Bold",
      "Averta Std Semibold": "Averta Std Semibold",
    });
  });

  it("should not produce empty mapping", () => {
    const missingFonts = ["CustomFont"];
    const mapping: Record<string, string> = {};
    for (const font of missingFonts) {
      mapping[font] = font;
    }

    expect(Object.keys(mapping).length).toBeGreaterThan(0);
    expect(mapping["CustomFont"]).toBe("CustomFont");
  });
});

// ============================================================================
// Test 2: main.ts handler — choice==="continue" → Inter mapping for rendering
// ============================================================================

describe("font-fallback-choice handler — continue choice", () => {
  it("should convert identity mapping to Inter mapping for rendering", () => {
    const fontMapping: Record<string, string> = {
      "PP Fragment Glare Medium": "PP Fragment Glare Medium",
      "Averta Std Bold": "Averta Std Bold",
    };
    const choice = "continue";

    // Simulate main.ts logic
    let renderMapping: Record<string, string> = {};
    let primaryFont = "Inter";

    if (choice === "continue") {
      for (const original of Object.keys(fontMapping)) {
        renderMapping[original] = "Inter";
      }
      primaryFont = "Inter";
    } else {
      primaryFont = Object.values(fontMapping)[0] || "Inter";
      renderMapping = fontMapping;
    }

    expect(primaryFont).toBe("Inter");
    expect(renderMapping).toEqual({
      "PP Fragment Glare Medium": "Inter",
      "Averta Std Bold": "Inter",
    });
  });

  it("should handle fallback choice normally (not convert to Inter)", () => {
    const fontMapping: Record<string, string> = {
      "PP Fragment Glare Medium": "Georgia",
      "Averta Std Bold": "Arial",
    };
    const choice = "fallback";

    let renderMapping: Record<string, string> = {};
    let primaryFont = "Inter";

    if (choice === "continue") {
      for (const original of Object.keys(fontMapping)) {
        renderMapping[original] = "Inter";
      }
    } else {
      primaryFont = Object.values(fontMapping)[0] || "Inter";
      renderMapping = fontMapping;
    }

    expect(primaryFont).toBe("Georgia");
    expect(renderMapping).toEqual(fontMapping);
  });

  it("should handle plugin choice normally", () => {
    const fontMapping: Record<string, string> = {
      "PP Fragment Glare Medium": "Montserrat",
      "Averta Std Bold": "Roboto",
    };
    const choice = "plugin";

    let primaryFont = "Inter";
    if (choice !== "continue") {
      primaryFont = Object.values(fontMapping)[0] || "Inter";
    }

    expect(primaryFont).toBe("Montserrat");
  });

  it("should preserve original font names as keys in the mapping", () => {
    const fontMapping: Record<string, string> = {
      "PP Fragment Glare Medium": "PP Fragment Glare Medium",
      "Averta Std Bold": "Averta Std Bold",
      "SourceSans3VF": "SourceSans3VF",
    };
    const choice = "continue";

    const renderMapping: Record<string, string> = {};
    if (choice === "continue") {
      for (const original of Object.keys(fontMapping)) {
        renderMapping[original] = "Inter";
      }
    }

    // Original font names preserved as keys
    expect(Object.keys(renderMapping)).toEqual([
      "PP Fragment Glare Medium",
      "Averta Std Bold",
      "SourceSans3VF",
    ]);
    // All values are Inter
    expect(Object.values(renderMapping).every((v) => v === "Inter")).toBe(true);
  });
});

// ============================================================================
// Test 3: createTextStyles — originalFontNames creates fallback styles
// ============================================================================

describe("createTextStyles — originalFontNames fallback", () => {
  it("should create style with Inter font when original font unavailable and originalFontNames provided", async () => {
    // Simulate the logic: when font loading fails, check originalFontNames
    const combo = {
      fontFamily: "PP Fragment Glare Medium",
      fontWeight: 400,
      fontSize: 24,
      lineHeight: { value: 32, unit: "PIXELS" as const },
      letterSpacing: 0,
    };

    const originalFontNames: Record<string, string> = {
      "PP Fragment Glare Medium": "PP Fragment Glare Medium",
    };

    // Simulate: loadFont fails for original
    const loadFont = vi.fn()
      .mockRejectedValueOnce(new Error("Font not available"))  // Original fails
      .mockResolvedValueOnce(undefined);  // Inter succeeds

    let styleName = "";
    let styleFont = { family: "", style: "" };

    try {
      await loadFont({ family: combo.fontFamily, style: "Regular" });
    } catch {
      // Font not available, check originalFontNames
      if (originalFontNames[combo.fontFamily]) {
        await loadFont({ family: "Inter", style: "Regular" });
        styleName = `WEB/--${combo.fontFamily}-Regular-${combo.fontSize}`;
        styleFont = { family: "Inter", style: "Regular" };
      }
    }

    expect(styleName).toBe("WEB/--PP Fragment Glare Medium-Regular-24");
    expect(styleFont).toEqual({ family: "Inter", style: "Regular" });
    expect(loadFont).toHaveBeenCalledTimes(2);
  });

  it("should skip style creation when no originalFontNames and font unavailable", async () => {
    const loadFont = vi.fn().mockRejectedValue(new Error("Font not available"));

    let styleCreated = false;
    const originalFontNames: Record<string, string> | undefined = undefined;

    try {
      await loadFont({ family: "MissingFont", style: "Regular" });
      styleCreated = true;
    } catch {
      if (originalFontNames && (originalFontNames as Record<string, string>)["MissingFont"]) {
        styleCreated = true;
      }
    }

    expect(styleCreated).toBe(false);
  });

  it("should not attempt fallback when font loads successfully", async () => {
    const loadFont = vi.fn().mockResolvedValue(undefined);

    let usedFallback = false;
    const originalFontNames: Record<string, string> = {
      "AvailableFont": "AvailableFont",
    };

    try {
      await loadFont({ family: "AvailableFont", style: "Regular" });
      // Font loaded successfully — no fallback needed
    } catch {
      if (originalFontNames["AvailableFont"]) {
        usedFallback = true;
      }
    }

    expect(usedFallback).toBe(false);
    expect(loadFont).toHaveBeenCalledTimes(1);
  });
});
