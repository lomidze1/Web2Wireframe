/**
 * End-to-end: a weight-400 node on a family with no Regular must render the
 * NEAREST cut (Light), not the alphabetically-first one (Black Italic).
 *
 * This is the apple.com `.typography-tile-subhead` case: font-weight 400,
 * font-family "SF Pro Display, …" — rendered as SF Pro Display Black Italic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

/** The user's real SF Pro Display install: no Regular cut anywhere. */
const SF_PRO_DISPLAY_STYLES = [
  "Black Italic",
  "Light",
  "Light Italic",
  "Thin",
  "Thin Italic",
  "Ultralight",
  "Ultralight Italic",
];

let installedFonts: Map<string, string[]> = new Map();

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

function createMockTextNode() {
  let _fontName: { family: string; style: string } = { family: "Inter", style: "Regular" };
  const node: Record<string, unknown> = {
    characters: "",
    fontSize: 14,
    fills: [],
    textAutoResize: "NONE",
    width: 100,
    height: 20,
    resize(w: number, h: number) { node.width = w; node.height = h; },
    textAlignHorizontal: "LEFT",
    lineHeight: { unit: "AUTO" },
    letterSpacing: { value: 0, unit: "PIXELS" },
    textDecoration: "NONE",
    fillStyleId: "",
    textStyleId: "",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
    setPluginData: vi.fn(),
    getPluginData: vi.fn(() => ""),
  };
  Object.defineProperty(node, "fontName", {
    get: () => _fontName,
    set: (v: { family: string; style: string }) => {
      if (!isInstalled(v.family, v.style)) throw new Error(`unloaded: ${v.family} ${v.style}`);
      _fontName = v;
    },
  });
  return node;
}

beforeEach(() => {
  installedFonts = new Map([
    ["Inter", ["Regular", "Bold", "Semi Bold", "Medium", "Light"]],
    ["SF Pro Display", [...SF_PRO_DISPLAY_STYLES]],
  ]);

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
    }),
    // Figma reports styles alphabetically — the order that used to decide the
    // outcome all by itself.
    listAvailableFontsAsync: vi.fn(async () =>
      Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        [...styles].sort().map((style) => ({ fontName: { family, style } })),
      ),
    ),
  };
});

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "t", name: "t", type: "text", tag: "p",
    x: 0, y: 0, width: 200, height: 24,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#333", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, textContent: "Now supercharged by M5.", fontSize: 28, fontWeight: 400,
    fontFamily: "SF Pro Display", textAlign: "left", lineHeight: 32, letterSpacing: 0,
    isPlaceholder: false, children: [], browserLineCount: 1,
    ...overrides,
  };
}

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    pluginColors: {
      main: "#1f3a5f", text: "#333333", accent: "#3b82f6",
      surface: "#f5f5f5", border: "#e0e0e0", background: "#ffffff",
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

describe("same-family rescue picks the nearest cut", () => {
  it("weight 400 with no Regular installed renders Light, not Black Italic", async () => {
    const textNode = await createTextNode(makeNode({}), "Inter", makeContext());

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("SF Pro Display");
    expect(textNode!.fontName.style).toBe("Light");
  });

  it("same rescue through the 'Use original fonts' path (Step 0)", async () => {
    const textNode = await createTextNode(
      makeNode({}),
      "Inter",
      makeContext({
        fontMapping: { "SF Pro Display": "Inter" },
        originalFontNames: { "SF Pro Display": "SF Pro Display" },
      }),
    );

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("SF Pro Display");
    expect(textNode!.fontName.style).toBe("Light");
  });

  it("an italic 400 node prefers Light Italic", async () => {
    const textNode = await createTextNode(
      makeNode({ fontStyle: "italic" }),
      "Inter",
      makeContext(),
    );

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.style).toBe("Light Italic");
  });

  it("an upright weight-900 node stays upright rather than taking Black Italic", async () => {
    // CSS Fonts Level 4 filters SLANT before weight: an upright run only takes
    // an italic cut when the family has no upright cut at all. This install
    // has three (Light, Thin, Ultralight), so the 900 run gets the nearest of
    // those — which is also what the browser rendered. The previous ranking
    // traded slant for weight ("right mass, wrong slant") and picked the one
    // italic in the family.
    const textNode = await createTextNode(
      makeNode({ fontWeight: 900 }),
      "Inter",
      makeContext(),
    );

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("SF Pro Display");
    expect(textNode!.fontName.style).toBe("Light");
  });

  it("an italic weight-900 node does take Black Italic", async () => {
    const textNode = await createTextNode(
      makeNode({ fontWeight: 900, fontStyle: "italic" }),
      "Inter",
      makeContext(),
    );

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.style).toBe("Black Italic");
  });
});
