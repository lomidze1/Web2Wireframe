/**
 * Font Resolution Tests
 *
 * Verifies that the font fallback popup choice is properly applied:
 * - Plugin mode: always uses plugin font (ignores node.fontFamily)
 * - Website mode: node font available → uses it
 * - Website mode: popup choice substitutes missing font
 * - Website mode: other node fonts are preserved
 * - Per-segment: segment font = missing → substituted
 * - Per-segment: segment font ≠ missing → preserved
 * - Final fallback: Inter when popup choice also fails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

// ============================================================================
// Figma API Mock
// ============================================================================

// Track which fonts were loaded
let loadedFonts: Array<{ family: string; style: string }> = [];
// Set of fonts that should fail to load
let unavailableFonts: Set<string> = new Set();

// Mock TextNode
function createMockTextNode() {
  let _characters = "";
  let _fontSize = 14;
  let _fontName: { family: string; style: string } = { family: "Inter", style: "Regular" };
  let _fills: unknown[] = [];
  let _textAutoResize = "NONE";
  let _width = 100;
  let _height = 20;
  let _textAlignH = "LEFT";
  let _lineHeight: unknown = { unit: "AUTO" };
  let _letterSpacing: unknown = { value: 0, unit: "PIXELS" };
  let _textTruncation: string | undefined;
  let _textDecoration = "NONE";
  let _fillStyleId = "";
  let _textStyleId = "";
  let _layoutSizingHorizontal = "FIXED";
  let _layoutSizingVertical = "FIXED";

  return {
    get characters() { return _characters; },
    set characters(v: string) { _characters = v; },
    get fontSize() { return _fontSize; },
    set fontSize(v: number) { _fontSize = v; },
    get fontName() { return _fontName; },
    set fontName(v: { family: string; style: string }) { _fontName = v; },
    get fills() { return _fills; },
    set fills(v: unknown[]) { _fills = v; },
    get textAutoResize() { return _textAutoResize; },
    set textAutoResize(v: string) { _textAutoResize = v; },
    get width() { return _width; },
    get height() { return _height; },
    resize(w: number, h: number) { _width = w; _height = h; },
    get textAlignHorizontal() { return _textAlignH; },
    set textAlignHorizontal(v: string) { _textAlignH = v; },
    get lineHeight() { return _lineHeight; },
    set lineHeight(v: unknown) { _lineHeight = v; },
    get letterSpacing() { return _letterSpacing; },
    set letterSpacing(v: unknown) { _letterSpacing = v; },
    get textTruncation() { return _textTruncation; },
    set textTruncation(v: string | undefined) { _textTruncation = v; },
    get textDecoration() { return _textDecoration; },
    set textDecoration(v: string) { _textDecoration = v; },
    get fillStyleId() { return _fillStyleId; },
    set fillStyleId(v: string) { _fillStyleId = v; },
    get textStyleId() { return _textStyleId; },
    set textStyleId(v: string) { _textStyleId = v; },
    get layoutSizingHorizontal() { return _layoutSizingHorizontal; },
    set layoutSizingHorizontal(v: string) { _layoutSizingHorizontal = v; },
    get layoutSizingVertical() { return _layoutSizingVertical; },
    set layoutSizingVertical(v: string) { _layoutSizingVertical = v; },
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
  };
}

// Install figma global mock
beforeEach(() => {
  loadedFonts = [];
  unavailableFonts = new Set();

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (unavailableFonts.has(font.family)) {
        throw new Error(`Font "${font.family}" not available`);
      }
      loadedFonts.push({ family: font.family, style: font.style });
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

function makeContext(overrides: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      main: "#1f3a5f",
      text: "#333333",
      accent: "#3b82f6",
      surface: "#f5f5f5",
      border: "#e0e0e0",
      background: "#ffffff",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Font resolution in createTextNode", () => {
  // Test 1: Plugin mode — always uses plugin font
  it("plugin mode: always uses plugin font, ignores node.fontFamily", async () => {
    const node = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const context = makeContext({
      fontMode: "plugin",
      fontFamily: "Montserrat",
    });

    const textNode = await createTextNode(node, "Montserrat", context);

    expect(textNode).not.toBeNull();
    // Should have loaded Montserrat, not Roboto
    expect(loadedFonts.some(f => f.family === "Montserrat")).toBe(true);
    expect(loadedFonts.some(f => f.family === "Roboto")).toBe(false);
    expect(textNode!.fontName.family).toBe("Montserrat");
  });

  // Test 2: Website mode — font available → uses node.fontFamily
  it("website mode: uses node.fontFamily when available", async () => {
    const node = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica",
    });

    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    // Should use Roboto (node font), not Helvetica (context font)
    expect(loadedFonts.some(f => f.family === "Roboto")).toBe(true);
    expect(textNode!.fontName.family).toBe("Roboto");
  });

  // Test 3: Website mode — popup "Use Helvetica" replaces missing PSA font
  it("website mode: popup choice replaces missing font", async () => {
    unavailableFonts.add("PSA");

    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica", // user chose Helvetica in popup
      missingFont: "PSA",       // PSA was the missing font
    });

    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    // PSA should be replaced by Helvetica (popup choice)
    expect(loadedFonts.some(f => f.family === "Helvetica")).toBe(true);
    expect(loadedFonts.every(f => f.family !== "PSA")).toBe(true);
    expect(textNode!.fontName.family).toBe("Helvetica");
  });

  // Test 4: Website mode — popup "Use ui-sans-serif" (currently passes through as-is)
  it("website mode: popup choice ui-sans-serif is used", async () => {
    unavailableFonts.add("CustomFont");

    const node = makeNode({ fontFamily: "CustomFont", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "ui-sans-serif",
      missingFont: "CustomFont",
    });

    const textNode = await createTextNode(node, "ui-sans-serif", context);

    expect(textNode).not.toBeNull();
    expect(loadedFonts.some(f => f.family === "ui-sans-serif")).toBe(true);
    expect(textNode!.fontName.family).toBe("ui-sans-serif");
  });

  // Test 5: Website mode — popup choice "Continue with PSA" → PSA fails → Inter fallback
  it("website mode: when popup continues with missing font, falls back to Inter", async () => {
    unavailableFonts.add("PSA");

    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "PSA", // user chose "continue with PSA"
      missingFont: "PSA",
    });

    const textNode = await createTextNode(node, "PSA", context);

    expect(textNode).not.toBeNull();
    // PSA is both fontFamily and missingFont → targetFont becomes PSA (popup choice = fontFamily)
    // But PSA is unavailable → falls through to Inter
    expect(textNode!.fontName.family).toBe("Inter");
  });

  // Test 6: Website mode — other node's font ≠ missing → preserved
  it("website mode: non-missing fonts on other nodes stay unchanged", async () => {
    const node = makeNode({ fontFamily: "Fira Code", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica", // popup chose Helvetica for missing PSA
      missingFont: "PSA",       // PSA was missing, but this node uses Fira Code
    });

    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    // Fira Code ≠ PSA, so it should NOT be replaced
    expect(loadedFonts.some(f => f.family === "Fira Code")).toBe(true);
    expect(textNode!.fontName.family).toBe("Fira Code");
  });

  // Test 7: Website mode — popup choice also unavailable → Inter
  it("website mode: when popup choice is also unavailable, falls back to Inter", async () => {
    unavailableFonts.add("PSA");
    unavailableFonts.add("Helvetica");

    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica",
      missingFont: "PSA",
    });

    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Inter");
  });

  // Test 8: Per-segment — segment font = missing font → substituted
  it("per-segment: segment with missing font is substituted with popup choice", async () => {
    unavailableFonts.add("PSA");

    const node = makeNode({
      fontFamily: "PSA",
      textContent: "",
      styledSegments: [
        { text: "Hello ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "PSA" },
        { text: "World", color: "#333", fontWeight: 700, fontSize: 16, fontFamily: "Roboto" },
      ],
    });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica",
      missingFont: "PSA",
    });

    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    // Node-level: PSA → Helvetica (popup choice)
    expect(textNode!.fontName.family).toBe("Helvetica");
    // Segment "World" with Roboto should attempt Roboto (different from missing PSA)
    const setRangeFontName = textNode!.setRangeFontName as ReturnType<typeof vi.fn>;
    const robotoCall = setRangeFontName.mock.calls.find(
      (c: [number, number, { family: string; style: string }]) => c[2].family === "Roboto"
    );
    expect(robotoCall).toBeDefined();
  });

  // Test 9: Per-segment — segment font ≠ missing font → preserved
  it("per-segment: segment with non-missing font stays unchanged", async () => {
    const node = makeNode({
      fontFamily: "Inter",
      textContent: "",
      styledSegments: [
        { text: "Normal ", color: "#333", fontWeight: 400, fontSize: 16 },
        { text: "Code", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Fira Code" },
      ],
    });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica",
      missingFont: "PSA", // Missing font is PSA, not Fira Code
    });

    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    // Fira Code ≠ PSA → should remain Fira Code
    const setRangeFontName = textNode!.setRangeFontName as ReturnType<typeof vi.fn>;
    const firaCall = setRangeFontName.mock.calls.find(
      (c: [number, number, { family: string; style: string }]) => c[2].family === "Fira Code"
    );
    expect(firaCall).toBeDefined();
  });
});

// ============================================================================
// Level 1: Multi-font mapping + CSS generic keyword resolution
// ============================================================================

describe("Level 1: CSS generic keyword resolution", () => {
  // L1-1: CSS generic font as node.fontFamily should resolve to mapped real font
  it("node with fontFamily='ui-sans-serif' resolves to Inter", async () => {
    unavailableFonts.add("ui-sans-serif");

    const node = makeNode({ fontFamily: "ui-sans-serif", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: { "ui-sans-serif": "Inter" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Inter");
  });

  // L1-2: CSS generic 'serif' should map to Georgia
  it("node with fontFamily='serif' resolves to Georgia", async () => {
    unavailableFonts.add("serif");

    const node = makeNode({ fontFamily: "serif", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Georgia",
      fontMapping: { "serif": "Georgia" },
    });

    const textNode = await createTextNode(node, "Georgia", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Georgia");
  });

  // L1-3: CSS generic 'monospace' should map to Courier
  it("node with fontFamily='monospace' resolves to Courier", async () => {
    unavailableFonts.add("monospace");

    const node = makeNode({ fontFamily: "monospace", textContent: "Code" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Courier",
      fontMapping: { "monospace": "Courier" },
    });

    const textNode = await createTextNode(node, "Courier", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Courier");
  });

  // L1-4: CSS generic in fallback chain — when primary fails, generic in list resolves
  it("fallback chain with CSS generics: CustomFont fails, ui-sans-serif in list resolves to Inter", async () => {
    unavailableFonts.add("CustomFont");
    unavailableFonts.add("ui-sans-serif");
    unavailableFonts.add("system-ui");
    unavailableFonts.add("sans-serif");

    const node = makeNode({
      fontFamily: "CustomFont",
      fontFamilyList: ["CustomFont", "ui-sans-serif", "system-ui", "sans-serif"],
      textContent: "Hello",
    });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: {
        "CustomFont": "Inter",
        "ui-sans-serif": "Inter",
        "system-ui": "Inter",
        "sans-serif": "Inter",
      },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    // Should end up with Inter (either via fontMapping or fallback chain)
    expect(textNode!.fontName.family).toBe("Inter");
  });
});

describe("Level 1: Multi-font mapping (fontMapping)", () => {
  // L1-5: Two nodes with different missing fonts, each mapped to different replacements
  it("multi-font: PSA→Helvetica and PSC→Georgia mapped independently", async () => {
    unavailableFonts.add("PSA");
    unavailableFonts.add("PSC");

    const contextBase = {
      fontMode: "website" as const,
      fontFamily: "Inter",
      fontMapping: { "PSA": "Helvetica", "PSC": "Georgia" },
    };

    // Node with PSA
    const nodePSA = makeNode({ fontFamily: "PSA", textContent: "Hello PSA" });
    const textNodePSA = await createTextNode(nodePSA, "Inter", makeContext(contextBase));
    expect(textNodePSA).not.toBeNull();
    expect(textNodePSA!.fontName.family).toBe("Helvetica");

    // Node with PSC
    const nodePSC = makeNode({ fontFamily: "PSC", textContent: "Hello PSC" });
    const textNodePSC = await createTextNode(nodePSC, "Inter", makeContext(contextBase));
    expect(textNodePSC).not.toBeNull();
    expect(textNodePSC!.fontName.family).toBe("Georgia");
  });

  // L1-6: Font NOT in mapping should stay unchanged
  it("multi-font: font not in mapping is preserved", async () => {
    const node = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: { "PSA": "Helvetica", "PSC": "Georgia" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    // Roboto is not in fontMapping → should use Roboto (available)
    expect(textNode!.fontName.family).toBe("Roboto");
  });

  // L1-7: Empty fontMapping — no substitution, backward compat
  it("empty fontMapping: no substitution occurs", async () => {
    const node = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: {},
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Roboto");
  });

  // L1-8: undefined fontMapping — backward compat with old missingFont
  it("undefined fontMapping: falls back to legacy missingFont behavior", async () => {
    unavailableFonts.add("PSA");

    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica",
      missingFont: "PSA",
      // no fontMapping — legacy path
    });

    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Helvetica");
  });
});

describe("Level 1: Per-segment multi-font mapping", () => {
  // L1-9: Segments with different missing fonts, each resolved via fontMapping
  it("per-segment: PSA and PSC segments mapped independently", async () => {
    unavailableFonts.add("PSA");
    unavailableFonts.add("PSC");

    const node = makeNode({
      fontFamily: "PSA",
      textContent: "",
      styledSegments: [
        { text: "Hello ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "PSA" },
        { text: "World", color: "#333", fontWeight: 700, fontSize: 16, fontFamily: "PSC" },
      ],
    });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: { "PSA": "Helvetica", "PSC": "Georgia" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    // Node-level: PSA → Helvetica (via fontMapping)
    expect(textNode!.fontName.family).toBe("Helvetica");

    // Segment "World" with PSC should be mapped to Georgia
    const setRangeFontName = textNode!.setRangeFontName as ReturnType<typeof vi.fn>;
    const georgiaCall = setRangeFontName.mock.calls.find(
      (c: [number, number, { family: string; style: string }]) => c[2].family === "Georgia"
    );
    expect(georgiaCall).toBeDefined();
  });

  // L1-10: Segment with font NOT in fontMapping stays unchanged
  it("per-segment: segment font not in mapping is preserved", async () => {
    unavailableFonts.add("PSA");

    const node = makeNode({
      fontFamily: "PSA",
      textContent: "",
      styledSegments: [
        { text: "Hello ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "PSA" },
        { text: "Code", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Fira Code" },
      ],
    });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      fontMapping: { "PSA": "Helvetica" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    const setRangeFontName = textNode!.setRangeFontName as ReturnType<typeof vi.fn>;
    // Fira Code is not in fontMapping → should stay Fira Code
    const firaCall = setRangeFontName.mock.calls.find(
      (c: [number, number, { family: string; style: string }]) => c[2].family === "Fira Code"
    );
    expect(firaCall).toBeDefined();
  });
});

describe("Level 1: Serif/Sans detection for smart defaults", () => {
  // L1-11: These tests verify the suggestFontReplacement utility function
  // (will be implemented in main.ts, but we test the logic here)

  // Helper that mirrors the planned suggestFontReplacement function
  function suggestFontReplacement(fontName: string): string {
    const lower = fontName.toLowerCase();
    if (lower.includes("serif") && !lower.includes("sans")) return "Georgia";
    if (lower.includes("mono") || lower.includes("code")) return "Courier";
    return "Inter";
  }

  it("sans-serif fonts default to Inter", () => {
    expect(suggestFontReplacement("PSA")).toBe("Inter");
    expect(suggestFontReplacement("Averta Std")).toBe("Inter");
    expect(suggestFontReplacement("CustomSans")).toBe("Inter");
  });

  it("serif fonts default to Georgia", () => {
    expect(suggestFontReplacement("PT Serif")).toBe("Georgia");
    expect(suggestFontReplacement("Playfair Serif Display")).toBe("Georgia");
    expect(suggestFontReplacement("MySerif")).toBe("Georgia");
  });

  it("'sans-serif' keyword does NOT match serif (contains 'sans')", () => {
    expect(suggestFontReplacement("sans-serif")).toBe("Inter");
  });

  it("mono/code fonts default to Courier", () => {
    expect(suggestFontReplacement("Fira Mono")).toBe("Courier");
    expect(suggestFontReplacement("Source Code Pro")).toBe("Courier");
    expect(suggestFontReplacement("JetBrains Mono")).toBe("Courier");
  });
});

describe("Level 1: No missing fonts — direct render", () => {
  // L1-12: When all fonts are available, fontMapping is empty/undefined, original fonts used
  it("all fonts available: no mapping applied, original fonts preserved", async () => {
    // Don't add anything to unavailableFonts
    const node = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Roboto",
      fontMapping: {},
    });

    const textNode = await createTextNode(node, "Roboto", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Roboto");
    // No substitution occurred
    expect(loadedFonts.every(f => f.family !== "Inter")).toBe(true);
  });
});

describe("Level 1: collectAllFonts utility", () => {
  // L1-13: This tests the tree-walking font collection function
  // (will be implemented in main.ts)

  // Helper that mirrors the planned collectAllFonts function
  function collectAllFonts(node: WireframeNode): Set<string> {
    const fonts = new Set<string>();
    if (node.fontFamily) fonts.add(node.fontFamily);
    if (node.fontFamilyList) node.fontFamilyList.forEach(f => fonts.add(f));
    if (node.styledSegments) {
      for (const seg of node.styledSegments) {
        if (seg.fontFamily) fonts.add(seg.fontFamily);
        if (seg.fontFamilyList) seg.fontFamilyList.forEach(f => fonts.add(f));
      }
    }
    if (node.children) {
      for (const child of node.children) {
        collectAllFonts(child).forEach(f => fonts.add(f));
      }
    }
    return fonts;
  }

  it("collects fonts from node, children, and segments", () => {
    const tree = makeNode({
      fontFamily: "PSA",
      fontFamilyList: ["PSA", "ui-sans-serif", "sans-serif"],
      children: [
        makeNode({
          fontFamily: "PSC",
          fontFamilyList: ["PSC", "system-ui"],
          styledSegments: [
            { text: "Link", color: "#333", fontWeight: 400, fontSize: 14, fontFamily: "PS1" },
          ],
        }),
        makeNode({
          fontFamily: "Inter",
          children: [
            makeNode({
              fontFamily: "SS3V",
              fontFamilyList: ["SS3V", "monospace"],
            }),
          ],
        }),
      ],
    });

    const fonts = collectAllFonts(tree);

    expect(fonts.has("PSA")).toBe(true);
    expect(fonts.has("PSC")).toBe(true);
    expect(fonts.has("PS1")).toBe(true);
    expect(fonts.has("SS3V")).toBe(true);
    expect(fonts.has("Inter")).toBe(true);
    expect(fonts.has("ui-sans-serif")).toBe(true);
    expect(fonts.has("sans-serif")).toBe(true);
    expect(fonts.has("system-ui")).toBe(true);
    expect(fonts.has("monospace")).toBe(true);
  });

  it("deduplicates fonts appearing in multiple nodes", () => {
    const tree = makeNode({
      fontFamily: "PSA",
      children: [
        makeNode({ fontFamily: "PSA" }),
        makeNode({ fontFamily: "PSA" }),
        makeNode({ fontFamily: "Inter" }),
      ],
    });

    const fonts = collectAllFonts(tree);
    expect(fonts.size).toBe(2); // PSA + Inter only
  });

  it("handles node with no fontFamily gracefully", () => {
    const tree = makeNode({
      fontFamily: "",
      children: [],
    });

    const fonts = collectAllFonts(tree);
    // Empty string gets added but that's fine, it will be filtered during font check
    expect(fonts.size).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Level 1: Plugin mode with fontMapping (per-font replacement)
// ============================================================================

describe("Level 1: Plugin mode with fontMapping", () => {
  // L1-14 (Test 28): Plugin mode + fontMapping — each font mapped to different plugin font
  it("plugin mode: fontMapping PSA→Poppins, PSC→Lato applied independently", async () => {
    // In plugin mode, ALL website fonts are "replaced" — but now with per-font mapping
    const contextBase = {
      fontMode: "plugin" as const,
      fontFamily: "Helvetica", // config default
      fontMapping: { "PSA": "Poppins", "PSC": "Lato" },
    };

    // Node with PSA → should become Poppins (not Helvetica)
    const nodePSA = makeNode({ fontFamily: "PSA", textContent: "Hello PSA" });
    const textNodePSA = await createTextNode(nodePSA, "Helvetica", makeContext(contextBase));
    expect(textNodePSA).not.toBeNull();
    expect(textNodePSA!.fontName.family).toBe("Poppins");

    // Node with PSC → should become Lato (not Helvetica)
    const nodePSC = makeNode({ fontFamily: "PSC", textContent: "Hello PSC" });
    const textNodePSC = await createTextNode(nodePSC, "Helvetica", makeContext(contextBase));
    expect(textNodePSC).not.toBeNull();
    expect(textNodePSC!.fontName.family).toBe("Lato");
  });

  // L1-15 (Test 29): Plugin mode + fontMapping all same — every font maps to config default
  it("plugin mode: fontMapping all to Helvetica (config default)", async () => {
    const context = makeContext({
      fontMode: "plugin",
      fontFamily: "Helvetica",
      fontMapping: {
        "PSA": "Helvetica",
        "PSC": "Helvetica",
        "SourceSans3VF": "Helvetica",
      },
    });

    const node = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const textNode = await createTextNode(node, "Helvetica", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Helvetica");
  });

  // L1-16 (Test 30): Plugin mode + no fontMapping (legacy) — all fonts become single plugin font
  it("plugin mode: no fontMapping (legacy) — all use plugin font", async () => {
    const context = makeContext({
      fontMode: "plugin",
      fontFamily: "Montserrat",
      // no fontMapping — legacy behavior
    });

    const node = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const textNode = await createTextNode(node, "Montserrat", context);

    expect(textNode).not.toBeNull();
    // Legacy plugin mode: ignores node font, uses plugin font
    expect(textNode!.fontName.family).toBe("Montserrat");
  });

  // L1-17 (Test 31): Plugin mode + partial mapping — unmapped fonts get config default
  it("plugin mode: unmapped fonts fall back to config default", async () => {
    const contextBase = {
      fontMode: "plugin" as const,
      fontFamily: "Helvetica", // config default
      fontMapping: {
        "PSA": "Poppins",
        "PSC": "Lato",
        // SourceSans3VF NOT in mapping → should get Helvetica (config default)
      },
    };

    // Mapped font → uses mapping
    const nodePSA = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const textNodePSA = await createTextNode(nodePSA, "Helvetica", makeContext(contextBase));
    expect(textNodePSA).not.toBeNull();
    expect(textNodePSA!.fontName.family).toBe("Poppins");

    // Unmapped font → config default (Helvetica)
    const nodeSource = makeNode({ fontFamily: "SourceSans3VF", textContent: "Hello" });
    const textNodeSource = await createTextNode(nodeSource, "Helvetica", makeContext(contextBase));
    expect(textNodeSource).not.toBeNull();
    expect(textNodeSource!.fontName.family).toBe("Helvetica");
  });
});

describe("Level 1: Website mode — plugin fonts choice", () => {
  // L1-18 (Test 32): Website mode, user chose "Plugin fonts" — fontMapping with plugin fonts
  it("website mode: 'plugin fonts' choice uses fontMapping with plugin fonts", async () => {
    unavailableFonts.add("PSA");
    unavailableFonts.add("PSC");

    // User chose "Plugin fonts" in the 3-choice popup, then mapped fonts
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Helvetica", // config plugin font
      fontMapping: {
        "PSA": "Helvetica",  // user kept default
        "PSC": "Poppins",    // user changed to Poppins
      },
    });

    const nodePSA = makeNode({ fontFamily: "PSA", textContent: "Hello" });
    const textNodePSA = await createTextNode(nodePSA, "Helvetica", context);
    expect(textNodePSA).not.toBeNull();
    expect(textNodePSA!.fontName.family).toBe("Helvetica");

    const nodePSC = makeNode({ fontFamily: "PSC", textContent: "World" });
    const textNodePSC = await createTextNode(nodePSC, "Helvetica", context);
    expect(textNodePSC).not.toBeNull();
    expect(textNodePSC!.fontName.family).toBe("Poppins");
  });

  // L1-19 (Test 33): Website mode, user chose "Continue as-is" — no mapping, original fonts
  it("website mode: 'continue as-is' uses original fonts, Inter fallback if unavailable", async () => {
    unavailableFonts.add("PSA");

    // "Continue as-is" = no fontMapping, no missingFont
    const context = makeContext({
      fontMode: "website",
      fontFamily: "Inter",
      // no fontMapping, no missingFont — continue as-is
    });

    // Available font → stays as-is
    const nodeRoboto = makeNode({ fontFamily: "Roboto", textContent: "Hello" });
    const textNodeRoboto = await createTextNode(nodeRoboto, "Inter", context);
    expect(textNodeRoboto).not.toBeNull();
    expect(textNodeRoboto!.fontName.family).toBe("Roboto");

    // Unavailable font → Inter fallback (loadFontAsync fails, falls to Inter)
    const nodePSA = makeNode({ fontFamily: "PSA", textContent: "World" });
    const textNodePSA = await createTextNode(nodePSA, "Inter", context);
    expect(textNodePSA).not.toBeNull();
    expect(textNodePSA!.fontName.family).toBe("Inter");
  });
});
