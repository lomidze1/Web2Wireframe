/**
 * Same-family installed-style rescue + Inter weight preservation.
 *
 * apple.com regression: the user has "SF Pro Display" installed with only a
 * couple of cuts. A weight-600 headline tries the Semibold/Medium/Bold
 * candidates, all fail, and the node silently drops to Inter Regular even
 * though the CORRECT family is sitting right there with a loadable cut.
 * CSS never falls to the next family for a missing weight — neither should
 * we. The rescue picks the closest installed cut of the same family before
 * ever considering fallback families or Inter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

// ============================================================================
// Figma API Mock — per (family, style) availability + listAvailableFontsAsync
// ============================================================================

let installedFonts: Map<string, string[]> = new Map();
let loadedFonts: Array<{ family: string; style: string }> = [];
let pluginData: Map<string, string> = new Map();

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
    setPluginData: vi.fn((k: string, v: string) => { pluginData.set(k, v); }),
    getPluginData: vi.fn((k: string) => pluginData.get(k) || ""),
  };
  Object.defineProperty(node, "fontName", {
    get: () => _fontName,
    set: (v: { family: string; style: string }) => {
      if (!isInstalled(v.family, v.style)) {
        throw new Error(`unloaded font: ${v.family} ${v.style}`);
      }
      _fontName = v;
    },
  });
  return node;
}

beforeEach(() => {
  installedFonts = new Map([["Inter", ["Regular", "Bold", "Semi Bold", "Medium", "Light"]]]);
  loadedFonts = [];
  pluginData = new Map();

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
      loadedFonts.push({ family: font.family, style: font.style });
    }),
    listAvailableFontsAsync: vi.fn(async () =>
      Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        styles.map((style) => ({ fontName: { family, style } })),
      ),
    ),
  };
});

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-1",
    name: "Test",
    type: "text",
    tag: "p",
    x: 0, y: 0, width: 200, height: 24,
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

// ============================================================================
// Same-family rescue
// ============================================================================

describe("same-family installed-style rescue", () => {
  it("weight 400 with only a Light cut installed keeps the family (Light), not Inter", async () => {
    installedFonts.set("SF Pro Text", ["Light"]);

    const node = makeNode({ fontFamily: "SF Pro Text", fontWeight: 400, textContent: "United Kingdom" });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("SF Pro Text");
    expect(textNode!.fontName.style).toBe("Light");
  });

  it("weight 600 with only Regular installed keeps the family (Regular), not Inter Semi Bold", async () => {
    installedFonts.set("SF Pro Display", ["Regular"]);

    const node = makeNode({ fontFamily: "SF Pro Display", fontWeight: 600, textContent: "AirPods Pro 3" });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("SF Pro Display");
    expect(textNode!.fontName.style).toBe("Regular");
  });

  it("non-standard cut names are rescued (Söhne 'Buch')", async () => {
    installedFonts.set("Copyright Klim Type Foundry", ["Buch"]);

    const node = makeNode({ fontFamily: "Copyright Klim Type Foundry", fontWeight: 400 });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Copyright Klim Type Foundry");
    expect(textNode!.fontName.style).toBe("Buch");
  });

  it("family truly absent → falls through to the CSS fallback chain", async () => {
    installedFonts.set("Helvetica Neue", ["Regular", "Bold"]);

    const node = makeNode({
      fontFamily: "Ghost Font",
      fontFamilyList: ["Ghost Font", "Helvetica Neue", "Arial"],
      fontWeight: 400,
    });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Helvetica Neue");
  });

  it("rescue prefers the weight-candidate cut when installed under a non-first candidate", async () => {
    // 600 candidates: Semibold, SemiBold, Semi Bold, ..., Medium, Bold —
    // "Semi Bold" IS loadable via Step 1, sanity-check no rescue regression.
    installedFonts.set("Test Grotesk", ["Semi Bold", "Regular"]);

    const node = makeNode({ fontFamily: "Test Grotesk", fontWeight: 600 });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Test Grotesk");
    expect(textNode!.fontName.style).toBe("Semi Bold");
  });

  it("works without listAvailableFontsAsync (older mocks/environments) — no crash", async () => {
    delete (globalThis as { figma?: { listAvailableFontsAsync?: unknown } }).figma!.listAvailableFontsAsync;

    const node = makeNode({ fontFamily: "Ghost Font", fontWeight: 400 });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Inter");
  });
});

// ============================================================================
// Inter final fallback preserves the requested weight
// ============================================================================

describe("Inter final fallback weight", () => {
  it("weight 700 falling to Inter uses Bold, not Regular", async () => {
    const node = makeNode({ fontFamily: "Ghost Font", fontWeight: 700 });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Inter");
    expect(textNode!.fontName.style).toBe("Bold");
  });

  it("weight 400 falling to Inter stays Regular", async () => {
    const node = makeNode({ fontFamily: "Ghost Font", fontWeight: 400 });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Inter");
    expect(textNode!.fontName.style).toBe("Regular");
  });
});

// ============================================================================
// Rebind marker without originalFontNames (no-modal substitution)
// ============================================================================

describe("rebind marker on substituted text without originalFontNames", () => {
  it("stamps the CSS family as marker when substitution happened with no modal", async () => {
    const node = makeNode({
      fontFamily: "Ghost Font",
      fontFamilyList: ["Ghost Font", "Helvetica Neue"],
      fontWeight: 400,
    });
    installedFonts.set("Helvetica Neue", ["Regular"]);

    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(pluginData.get("w2w_original_font")).toBe("Ghost Font");
  });

  it("same-family rescue (family kept, style substituted) does NOT stamp a marker", async () => {
    installedFonts.set("SF Pro Display", ["Regular"]);

    const node = makeNode({ fontFamily: "SF Pro Display", fontWeight: 600 });
    const textNode = await createTextNode(node, "Inter", makeContext({}));

    expect(textNode).not.toBeNull();
    expect(pluginData.get("w2w_original_font")).toBeUndefined();
  });

  it("originalFontNames value still wins when provided (real-name marker)", async () => {
    const node = makeNode({ fontFamily: "PSC", fontWeight: 400 });
    const textNode = await createTextNode(node, "Inter", makeContext({
      originalFontNames: { "PSC": "PPCirka-Light" },
    }));

    expect(textNode).not.toBeNull();
    expect(pluginData.get("w2w_original_font")).toBe("PPCirka-Light");
  });
});
