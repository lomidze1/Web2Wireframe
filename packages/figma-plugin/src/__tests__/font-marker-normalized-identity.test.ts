/**
 * A font that resolved is not a font that is missing.
 *
 * `createTextNode` stamps the `w2w_original_font` marker (and records a
 * substitution warning) whenever the family it drew with differs from the one
 * the marker names — compared as raw strings. Figma renders the same typeface
 * under a spelling of its own: stripe.com's Söhne installs as "S?hne VF" (the
 * ö mangled), and its real SFNT name is "Söhne VF". The run draws correctly
 * with "S?hne VF", the strings differ, and the layer is filed as "still
 * showing Inter" — 386 of them on one import, every one of them already right.
 *
 * Normalized, the two spellings are one font (`shnevf`). Same for a family
 * that only differs by spacing: "SourceCodePro" vs the installed
 * "Source Code Pro".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

const SOHNE_MANGLED = "S?hne VF";

let installedFonts: Map<string, string[]>;

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

function createMockTextNode() {
  let _fontName: { family: string; style: string } = { family: "Inter", style: "Regular" };
  const data: Record<string, string> = {};
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
    setPluginData: (key: string, value: string) => { data[key] = value; },
    getPluginData: (key: string) => data[key] ?? "",
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
    ["Inter", ["Regular", "Bold", "Medium", "Light"]],
    [SOHNE_MANGLED, ["Buch", "Leicht", "Halbfett"]],
    ["Source Code Pro", ["Regular", "Medium", "Bold"]],
  ]);

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`The font "${font.family} ${font.style}" could not be loaded`);
      }
    }),
    listAvailableFontsAsync: vi.fn(async () =>
      Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        [...styles].sort().map((style) => ({ fontName: { family, style } })),
      ),
    ),
  };
});

function makeNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "t", name: "t", type: "text", tag: "p",
    x: 0, y: 0, width: 200, height: 24,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#333", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, textContent: "Enable any billing model", fontSize: 28,
    fontWeight: 400, fontFamily: "sohne-var", textAlign: "left",
    lineHeight: 32, letterSpacing: 0,
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
    fontRealNames: { "sohne-var": "Söhne VF" },
    ...overrides,
  };
}

describe("no pending marker when the resolved family IS the wanted font", () => {
  it("leaves no marker when Figma's spelling only differs by a mangled character", async () => {
    const warnings: Array<{ category: string; message: string }> = [];
    const textNode = await createTextNode(
      makeNode(),
      "Inter",
      makeContext({ warnings } as Partial<RenderContext>),
    );

    expect(textNode!.fontName.family).toBe(SOHNE_MANGLED);
    // The run already shows the font the page asked for.
    expect(textNode!.getPluginData("w2w_original_font")).toBe("");
    expect(textNode!.getPluginData("w2w_original_cut")).toBe("");
  });

  it("leaves no marker when the installed family only differs by spacing", async () => {
    const textNode = await createTextNode(
      makeNode({ fontFamily: "SourceCodePro", fontWeight: 500 }),
      "Inter",
      makeContext({ fontRealNames: {} }),
    );

    expect(textNode!.fontName.family).toBe("Source Code Pro");
    expect(textNode!.getPluginData("w2w_original_font")).toBe("");
  });

  it("still marks a family that genuinely fell back to Inter", async () => {
    const textNode = await createTextNode(
      makeNode({ fontFamily: "Ghost Face" }),
      "Inter",
      makeContext({ fontRealNames: {} }),
    );

    expect(textNode!.fontName.family).toBe("Inter");
    expect(textNode!.getPluginData("w2w_original_font")).toBe("Ghost Face");
  });

  it("does not stamp a cut marker for a variable family drawn at a near weight", async () => {
    // Söhne is one VF file; Figma exposes "Buch" and nothing at 300, so a
    // weight-300 run legitimately draws Buch. Marking it pending would promise
    // a Re-apply that no install can ever satisfy.
    const textNode = await createTextNode(
      makeNode({ fontWeight: 300 }),
      "Inter",
      makeContext({
        fontDeclaredCuts: { "sohne-var": [{ weight: 1, italic: false }, { weight: 1000, italic: false }] },
        fontVariableFamilies: ["sohne-var"],
      } as Partial<RenderContext>),
    );

    expect(textNode!.fontName.family).toBe(SOHNE_MANGLED);
    expect(textNode!.getPluginData("w2w_original_cut")).toBe("");
    expect(textNode!.getPluginData("w2w_original_font")).toBe("");
  });
});
