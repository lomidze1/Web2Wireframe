/**
 * Level 2: Font System — Message Protocol Tests
 *
 * Tests the contract between sandbox (main.ts) and UI (FontFallbackModal):
 * - `fonts-not-available` message format (sandbox → UI)
 * - `font-fallback-choice` message format (UI → sandbox)
 * - Plugin mode: no popup, automatic fontMapping
 *
 * These tests verify data shapes and transformation logic,
 * not actual postMessage calls (which require Figma sandbox).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, FontMapping } from "../types";

// ============================================================================
// Figma API Mock
// ============================================================================

let unavailableFonts: Set<string> = new Set();

beforeEach(() => {
  unavailableFonts = new Set();

  (globalThis as Record<string, unknown>).figma = {
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (unavailableFonts.has(font.family)) {
        throw new Error(`Font "${font.family}" not available`);
      }
    }),
  };
});

// ============================================================================
// Helpers
// ============================================================================

function _makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-1",
    name: "Test",
    type: "text",
    tag: "p",
    x: 0,
    y: 0,
    width: 200,
    height: 24,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#333333",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "Test text",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 24,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    browserLineCount: 1,
    ...overrides,
  };
}

// ============================================================================
// Import utilities from fontUtils (will be created during implementation)
// ============================================================================

import {
  checkFontsAvailability,
  buildFontsNotAvailableMessage,
  buildPluginModeFontMapping,
} from "../utils/fontUtils";

// ============================================================================
// L2-6: fonts-not-available message format
// ============================================================================

describe("Level 2: fonts-not-available message format", () => {
  it("L2-6: builds correct message with all missing fonts, defaults, and plugin options", async () => {
    unavailableFonts.add("PSA");
    unavailableFonts.add("PSC");
    unavailableFonts.add("SS3V");

    const allFonts = new Set(["PSA", "PSC", "SS3V", "Inter", "Roboto"]);
    const availability = await checkFontsAvailability(allFonts);
    const pluginFont = "Montserrat";
    const pluginFontOptions = ["Montserrat", "Inter", "Roboto", "Poppins", "Lato", "Helvetica"];

    const message = buildFontsNotAvailableMessage(
      availability.missing,
      pluginFont,
      pluginFontOptions
    );

    // Message should contain:
    expect(message.type).toBe("fonts-not-available");
    expect(message.data.missingFonts).toEqual(expect.arrayContaining(["PSA", "PSC", "SS3V"]));
    expect(message.data.missingFonts.length).toBe(3);
    // Default mapping: each missing font → smart default
    expect(message.data.defaultMapping).toEqual(
      expect.objectContaining({
        "PSA": expect.any(String),
        "PSC": expect.any(String),
        "SS3V": expect.any(String),
      })
    );
    // Plugin font options for dropdowns
    expect(message.data.pluginFontOptions).toEqual(pluginFontOptions);
    // Current plugin font
    expect(message.data.pluginFont).toBe("Montserrat");
  });
});

// ============================================================================
// L2-7: font-fallback-choice with fontMapping
// ============================================================================

describe("Level 2: font-fallback-choice with fontMapping", () => {
  it("L2-7: UI sends fontMapping instead of single chosenFont", () => {
    // Simulate what UI would send after user edits the popup
    const userMapping: FontMapping = {
      "PSA": "Inter",
      "PSC": "Lato",
      "SS3V": "Poppins",
    };

    const message = {
      type: "font-fallback-choice",
      data: {
        choice: "plugin" as const,
        fontMapping: userMapping,
      },
    };

    // Verify message shape
    expect(message.type).toBe("font-fallback-choice");
    expect(message.data.fontMapping).toBeDefined();
    expect(message.data.fontMapping["PSA"]).toBe("Inter");
    expect(message.data.fontMapping["PSC"]).toBe("Lato");
    expect(message.data.fontMapping["SS3V"]).toBe("Poppins");
    expect(message.data.choice).toBe("plugin");
  });

  it("L2-7b: 'fallback' choice sends CSS fallback chain mapping", () => {
    // When user chooses "Fallback fonts", each font maps to its CSS fallback
    const fallbackMapping: FontMapping = {
      "PSA": "Arial",      // PSA's CSS fallback chain: PSA, Arial, sans-serif
      "PSC": "Georgia",    // PSC's CSS fallback chain: PSC, Georgia, serif
    };

    const message = {
      type: "font-fallback-choice",
      data: {
        choice: "fallback" as const,
        fontMapping: fallbackMapping,
      },
    };

    expect(message.data.choice).toBe("fallback");
    expect(message.data.fontMapping["PSA"]).toBe("Arial");
    expect(message.data.fontMapping["PSC"]).toBe("Georgia");
  });

  it("L2-7c: 'continue' choice sends empty fontMapping", () => {
    // "Continue as-is" means no substitutions — let text.ts handle fallback
    const message = {
      type: "font-fallback-choice",
      data: {
        choice: "continue" as const,
        fontMapping: {} as FontMapping,
      },
    };

    expect(message.data.choice).toBe("continue");
    expect(Object.keys(message.data.fontMapping).length).toBe(0);
  });
});

// ============================================================================
// L2-8: Plugin mode — no popup, automatic fontMapping
// ============================================================================

describe("Level 2: Plugin mode — automatic fontMapping", () => {
  it("L2-8: builds fontMapping mapping all website fonts to pluginFont", () => {
    const allWebsiteFonts = new Set(["PSA", "PSC", "SS3V", "Inter"]);
    const pluginFont = "Montserrat";

    const mapping = buildPluginModeFontMapping(allWebsiteFonts, pluginFont);

    // Every website font should map to the plugin font
    expect(mapping["PSA"]).toBe("Montserrat");
    expect(mapping["PSC"]).toBe("Montserrat");
    expect(mapping["SS3V"]).toBe("Montserrat");
    expect(mapping["Inter"]).toBe("Montserrat");
  });

  it("L2-8b: plugin mode mapping excludes CSS generics", () => {
    const allFonts = new Set(["PSA", "ui-sans-serif", "sans-serif", "monospace"]);
    const pluginFont = "Roboto";

    const mapping = buildPluginModeFontMapping(allFonts, pluginFont);

    // Real fonts should be mapped
    expect(mapping["PSA"]).toBe("Roboto");
    // CSS generics should NOT be in the mapping (they'll be resolved by text.ts fallback)
    expect(mapping["ui-sans-serif"]).toBeUndefined();
    expect(mapping["sans-serif"]).toBeUndefined();
    expect(mapping["monospace"]).toBeUndefined();
  });
});
