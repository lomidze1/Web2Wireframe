/**
 * Level 2: Font System — Sandbox Logic Tests
 *
 * Tests for utility functions that will be extracted from main.ts:
 * - collectAllFonts: walks all frames' trees to find unique fonts
 * - checkFontsAvailability: checks each font against Figma, returns available/missing
 * - buildDefaultFontMapping: creates smart default mapping for missing fonts
 * - CSS generic font filtering
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode } from "../types";

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

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
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
// Import the utilities that will be created in src/utils/fontUtils.ts
// These imports will fail until implementation — that's the TDD red phase
// ============================================================================

import {
  collectAllFonts,
  checkFontsAvailability,
  buildDefaultFontMapping,
  CSS_GENERIC_FONTS,
} from "../utils/fontUtils";

// ============================================================================
// L2-1: collectAllFonts across multiple frames
// ============================================================================

describe("Level 2: collectAllFonts across frames", () => {
  it("L2-1: collects fonts from multiple frames' trees", () => {
    const frame1Tree = makeNode({
      fontFamily: "PSA",
      children: [
        makeNode({ fontFamily: "PSC", textContent: "Child 1" }),
        makeNode({
          fontFamily: "Inter",
          styledSegments: [
            { text: "seg", color: "#333", fontWeight: 400, fontSize: 14, fontFamily: "PS1" },
          ],
        }),
      ],
    });

    const frame2Tree = makeNode({
      fontFamily: "SS3V",
      children: [
        makeNode({ fontFamily: "Roboto", textContent: "Child 2" }),
      ],
    });

    const frames = [
      { viewport: { width: 1440, height: 900 }, tree: frame1Tree },
      { viewport: { width: 768, height: 1024 }, tree: frame2Tree },
    ];

    const fonts = collectAllFonts(frames);

    expect(fonts.has("PSA")).toBe(true);
    expect(fonts.has("PSC")).toBe(true);
    expect(fonts.has("PS1")).toBe(true);
    expect(fonts.has("Inter")).toBe(true);
    expect(fonts.has("SS3V")).toBe(true);
    expect(fonts.has("Roboto")).toBe(true);
    expect(fonts.size).toBe(6);
  });
});

// ============================================================================
// L2-2, L2-3: checkFontsAvailability
// ============================================================================

describe("Level 2: checkFontsAvailability", () => {
  it("L2-2: returns correct available/missing split when some fonts unavailable", async () => {
    unavailableFonts.add("PSA");
    unavailableFonts.add("PSC");

    const fonts = new Set(["PSA", "PSC", "Inter", "Roboto", "Arial"]);
    const result = await checkFontsAvailability(fonts);

    // Arial is skipped before the check (websafe/OS-bundled — no shippable
    // web font file), the same way CSS generics are in L2-4 below.
    expect(result.available.sort()).toEqual(["Inter", "Roboto"]);
    expect(result.missing.sort()).toEqual(["PSA", "PSC"]);
  });

  it("L2-3: returns all available when no fonts are missing", async () => {
    // No fonts in unavailableFonts set
    const fonts = new Set(["Inter", "Roboto", "Arial"]);
    const result = await checkFontsAvailability(fonts);

    // Arial is filtered out as websafe (see L2-2) — never missing either.
    expect(result.available.sort()).toEqual(["Inter", "Roboto"]);
    expect(result.missing).toEqual([]);
  });

  it("L2-4: filters out CSS generic keywords before checking availability", async () => {
    unavailableFonts.add("ui-sans-serif");
    unavailableFonts.add("system-ui");
    unavailableFonts.add("sans-serif");
    unavailableFonts.add("monospace");
    unavailableFonts.add("PSA");

    const fonts = new Set(["PSA", "Inter", "ui-sans-serif", "system-ui", "sans-serif", "monospace"]);
    const result = await checkFontsAvailability(fonts);

    // CSS generics should NOT appear in missing — they are filtered out
    expect(result.missing).toEqual(["PSA"]);
    // CSS generics should NOT appear in available either
    expect(result.available).toEqual(["Inter"]);
    // Verify CSS generics were never checked with loadFontAsync
    const loadCalls = (figma.loadFontAsync as ReturnType<typeof vi.fn>).mock.calls;
    const checkedFamilies = loadCalls.map((c: [{ family: string }]) => c[0].family);
    expect(checkedFamilies).not.toContain("ui-sans-serif");
    expect(checkedFamilies).not.toContain("system-ui");
    expect(checkedFamilies).not.toContain("sans-serif");
    expect(checkedFamilies).not.toContain("monospace");
  });
});

// ============================================================================
// L2-5: buildDefaultFontMapping
// ============================================================================

describe("Level 2: buildDefaultFontMapping", () => {
  it("L2-5: creates smart defaults — serif→Georgia, mono→Courier, others→pluginFont", () => {
    const missingFonts = ["PSA", "PT Serif", "Fira Mono", "CustomDisplay"];
    const pluginFont = "Montserrat";

    const mapping = buildDefaultFontMapping(missingFonts, pluginFont);

    // PSA — no serif/mono hint → pluginFont
    expect(mapping["PSA"]).toBe("Montserrat");
    // PT Serif — contains "serif" (not "sans") → Georgia
    expect(mapping["PT Serif"]).toBe("Georgia");
    // Fira Mono — contains "mono" → Courier
    expect(mapping["Fira Mono"]).toBe("Courier");
    // CustomDisplay — no hint → pluginFont
    expect(mapping["CustomDisplay"]).toBe("Montserrat");
  });

  it("L2-5b: uses provided pluginFont as default, not hardcoded", () => {
    const missingFonts = ["PSA"];
    const mapping = buildDefaultFontMapping(missingFonts, "Helvetica");
    expect(mapping["PSA"]).toBe("Helvetica");
  });
});

// ============================================================================
// L2-CSS: CSS_GENERIC_FONTS constant
// ============================================================================

describe("Level 2: CSS_GENERIC_FONTS constant", () => {
  it("includes standard CSS generic font families", () => {
    expect(CSS_GENERIC_FONTS).toContain("serif");
    expect(CSS_GENERIC_FONTS).toContain("sans-serif");
    expect(CSS_GENERIC_FONTS).toContain("monospace");
    expect(CSS_GENERIC_FONTS).toContain("system-ui");
    expect(CSS_GENERIC_FONTS).toContain("ui-sans-serif");
    expect(CSS_GENERIC_FONTS).toContain("ui-serif");
    expect(CSS_GENERIC_FONTS).toContain("ui-monospace");
    expect(CSS_GENERIC_FONTS).toContain("cursive");
    expect(CSS_GENERIC_FONTS).toContain("fantasy");
  });
});
