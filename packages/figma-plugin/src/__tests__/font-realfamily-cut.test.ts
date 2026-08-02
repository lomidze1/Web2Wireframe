/**
 * Cut-level font resolution when the file is installed under the family's REAL
 * (SFNT) name, plus the cut-level rebind marker.
 *
 * web2wireframe.design: the page asks for "Space Grotesk" 600, but the
 * downloaded file registers in Figma as "Space Grotesk Light" / "SemiBold"
 * (fontsource static instances carry the variable font's default-instance name
 * in their typographic-family record). Two things must follow:
 *
 *   1. the node renders that real family's exact cut instead of collapsing to
 *      the CSS family's nearest weight — and stamps NO marker, because nothing
 *      is pending;
 *   2. when no installed family can supply the cut, the node keeps its own
 *      family on the nearest weight and stamps a CUT marker, so installing the
 *      downloaded file later is actionable via "Re-apply fonts". Without a
 *      declared @font-face at that weight there's nothing to install, so no
 *      marker is stamped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import { ORIGINAL_CUT_PLUGIN_KEY } from "../rendering/rebindFonts";
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

const SG_DECLARED = {
  "Space Grotesk": [
    { weight: 400, italic: false },
    { weight: 600, italic: false },
    { weight: 700, italic: false },
  ],
};

describe("real-family cut rescue", () => {
  it("renders the real family's exact cut when the CSS family lacks it", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);
    installedFonts.set("Space Grotesk Light", ["SemiBold"]);

    const node = makeNode({ fontFamily: "Space Grotesk", fontWeight: 600 });
    const textNode = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { "Space Grotesk": "Space Grotesk Light" },
      fontDeclaredCuts: SG_DECLARED,
    }));

    expect(textNode!.fontName).toEqual({ family: "Space Grotesk Light", style: "SemiBold" });
    // Nothing is pending — the user already sees the weight they asked for.
    expect(pluginData.get("w2w_original_font")).toBeUndefined();
    expect(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)).toBeUndefined();
  });

  it("keeps the CSS family when it ships the cut itself", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "SemiBold"]);
    installedFonts.set("Space Grotesk Light", ["SemiBold"]);

    const node = makeNode({ fontFamily: "Space Grotesk", fontWeight: 600 });
    const textNode = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { "Space Grotesk": "Space Grotesk Light" },
      fontDeclaredCuts: SG_DECLARED,
    }));

    expect(textNode!.fontName).toEqual({ family: "Space Grotesk", style: "SemiBold" });
  });

  it("leaves other weights on the CSS family (no wholesale rename)", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);
    installedFonts.set("Space Grotesk Light", ["SemiBold"]);

    const node = makeNode({ fontFamily: "Space Grotesk", fontWeight: 400 });
    const textNode = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { "Space Grotesk": "Space Grotesk Light" },
      fontDeclaredCuts: SG_DECLARED,
    }));

    expect(textNode!.fontName).toEqual({ family: "Space Grotesk", style: "Regular" });
  });
});

describe("cut-level rebind marker", () => {
  it("stamps the pending cut when no installed family supplies it", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);

    const node = makeNode({ fontFamily: "Space Grotesk", fontWeight: 600 });
    const textNode = await createTextNode(node, "Inter", makeContext({
      fontDeclaredCuts: SG_DECLARED,
    }));

    // Nearest cut of the correct family still renders …
    expect(textNode!.fontName.family).toBe("Space Grotesk");
    // … and the exact cut the page wanted is recorded for Re-apply.
    expect(JSON.parse(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)!)).toEqual({
      families: ["Space Grotesk"],
      weight: 600,
      italic: false,
    });
    // The family itself is fine — no family-level marker.
    expect(pluginData.get("w2w_original_font")).toBeUndefined();
  });

  it("records the real family first so a post-install rebind can find it", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);

    const node = makeNode({ fontFamily: "Space Grotesk", fontWeight: 600 });
    await createTextNode(node, "Inter", makeContext({
      fontRealNames: { "Space Grotesk": "Space Grotesk Light" },
      fontDeclaredCuts: SG_DECLARED,
    }));

    expect(JSON.parse(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)!).families).toEqual([
      "Space Grotesk Light",
      "Space Grotesk",
    ]);
  });

  it("stays silent when no @font-face declares that cut", async () => {
    installedFonts.set("BPG Nino Mtavruli", ["Regular"]);

    const node = makeNode({ fontFamily: "BPG Nino Mtavruli", fontWeight: 700 });
    await createTextNode(node, "Inter", makeContext({
      // telex.ge fakes bold from a single 400 file — nothing to download.
      fontDeclaredCuts: { "BPG Nino Mtavruli": [{ weight: 400, italic: false }] },
    }));

    expect(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)).toBeUndefined();
  });

  it("stays silent without declared-cut information at all", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);

    const node = makeNode({ fontFamily: "Space Grotesk", fontWeight: 600 });
    await createTextNode(node, "Inter", makeContext({}));

    expect(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)).toBeUndefined();
  });

  it("stays silent when the rendered cut already matches", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "SemiBold"]);

    const node = makeNode({ fontFamily: "Space Grotesk", fontWeight: 600 });
    await createTextNode(node, "Inter", makeContext({
      fontDeclaredCuts: SG_DECLARED,
    }));

    expect(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)).toBeUndefined();
  });

  it("defers to the family-level marker when the family itself is substituted", async () => {
    const node = makeNode({ fontFamily: "Ghost Font", fontWeight: 600 });
    await createTextNode(node, "Inter", makeContext({
      fontMapping: { "Ghost Font": "Inter" },
      originalFontNames: { "Ghost Font": "Ghost Font" },
      fontDeclaredCuts: { "Ghost Font": [{ weight: 600, italic: false }] },
    }));

    expect(pluginData.get("w2w_original_font")).toBe("Ghost Font");
    expect(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)).toBeUndefined();
  });
});
