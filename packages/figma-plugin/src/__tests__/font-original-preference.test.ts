/**
 * "Use original fonts" flow — installed originals must render directly.
 *
 * apple.com regression: SF Pro Text was already installed, yet after the
 * modal's "Use original fonts" choice EVERY node of that family rendered
 * Inter (the choice maps the family to Inter for the marker+rebind route).
 * When the original family — under its CSS name or its real SFNT name — is
 * already loadable for the node's weight, it must be applied immediately:
 * no Inter round-trip, no marker, no Re-apply needed.
 *
 * Also: icon fonts (SF Pro Icons ships in the download ZIP) are installable,
 * so they now get rebind markers too.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

let installedFonts: Map<string, string[]> = new Map();
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
      if (!isInstalled(v.family, v.style)) throw new Error(`unloaded: ${v.family} ${v.style}`);
      _fontName = v;
    },
  });
  return node;
}

beforeEach(() => {
  installedFonts = new Map([["Inter", ["Regular", "Bold", "Semi Bold", "Medium", "Light"]]]);
  pluginData = new Map();

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
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
    id: "t", name: "t", type: "text", tag: "p",
    x: 0, y: 0, width: 200, height: 24,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#333", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, textContent: "Hello", fontSize: 16, fontWeight: 400,
    fontFamily: "Inter", textAlign: "left", lineHeight: 24, letterSpacing: 0,
    isPlaceholder: false, children: [], browserLineCount: 1,
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

describe("mapped-away original preference (Step 0)", () => {
  it("renders the installed original family directly instead of Inter, with no marker", async () => {
    installedFonts.set("SF Pro Text", ["Regular", "Semibold", "Light"]);

    const node = makeNode({ fontFamily: "SF Pro Text", fontWeight: 400 });
    const context = makeContext({
      fontMapping: { "SF Pro Text": "Inter" },
      originalFontNames: { "SF Pro Text": "SF Pro Text" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("SF Pro Text");
    expect(pluginData.get("w2w_original_font")).toBeUndefined();
  });

  it("renders the real (SFNT) name when only that is installed", async () => {
    installedFonts.set("PPCirka-Light", ["Regular"]);

    const node = makeNode({ fontFamily: "PSC", fontWeight: 400 });
    const context = makeContext({
      fontMapping: { "PSC": "Inter" },
      originalFontNames: { "PSC": "PPCirka-Light" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("PPCirka-Light");
  });

  it("keeps the original family on its nearest installed cut when the weight is absent", async () => {
    installedFonts.set("SF Pro Display", ["Regular"]); // no Semibold cut

    const node = makeNode({ fontFamily: "SF Pro Display", fontWeight: 600 });
    const context = makeContext({
      fontMapping: { "SF Pro Display": "Inter" },
      originalFontNames: { "SF Pro Display": "SF Pro Display" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    // "Use original fonts" means the original family — a near cut of the real
    // typeface beats a perfect cut of Inter. No marker: the family IS correct;
    // only the exact weight is pending, which a re-import resolves.
    expect(textNode!.fontName.family).toBe("SF Pro Display");
    expect(textNode!.fontName.style).toBe("Regular");
    expect(pluginData.get("w2w_original_font")).toBeUndefined();
  });

  it("uninstalled original still takes the Inter + marker route", async () => {
    const node = makeNode({ fontFamily: "Ghost Font", fontWeight: 400 });
    const context = makeContext({
      fontMapping: { "Ghost Font": "Inter" },
      originalFontNames: { "Ghost Font": "Ghost Font" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Inter");
    expect(pluginData.get("w2w_original_font")).toBe("Ghost Font");
  });
});

describe("icon fonts get rebind markers", () => {
  it("missing icon font renders Inter and stamps the icon family as marker", async () => {
    const node = makeNode({ fontFamily: "SF Pro Icons", fontWeight: 300, textContent: "" });
    const context = makeContext({
      fontMapping: { "SF Pro Icons": "Inter" },
      originalFontNames: { "SF Pro Icons": "SF Pro Icons" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("Inter");
    expect(pluginData.get("w2w_original_font")).toBe("SF Pro Icons");
  });

  it("installed icon font renders directly (no marker)", async () => {
    installedFonts.set("SF Pro Icons", ["Light", "Regular"]);

    const node = makeNode({ fontFamily: "SF Pro Icons", fontWeight: 300, textContent: "" });
    const context = makeContext({
      fontMapping: { "SF Pro Icons": "Inter" },
      originalFontNames: { "SF Pro Icons": "SF Pro Icons" },
    });

    const textNode = await createTextNode(node, "Inter", context);

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe("SF Pro Icons");
    expect(pluginData.get("w2w_original_font")).toBeUndefined();
  });
});
