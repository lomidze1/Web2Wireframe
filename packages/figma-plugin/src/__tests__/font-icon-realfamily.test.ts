/**
 * Font lookup must always try the CSS-declared family AND the family's real
 * (SFNT) name — including for icon fonts.
 *
 * telex.ge declares `font-family: glyphs`, but the file's name table says
 * "icomoon", so that is the only family Figma ever registers. The availability
 * check already knows this (it probes `fontRealNames`) and reports the family
 * as present, so no download modal opens. The renderer used to stop at the CSS
 * name for icon runs — Step 0.5 is gated on `!isIcon`, and the same-family
 * rescue only tried the CSS name — so every glyph fell to Inter and stamped an
 * un-installable "glyphs" marker that Re-apply could never satisfy.
 *
 * `isIcon` may decide WHICH STYLES we try; it must never decide which family
 * NAMES we try.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import { ORIGINAL_CUT_PLUGIN_KEY } from "../rendering/rebindFonts";
import type { WireframeNode, RenderContext } from "../types";

/** A Private Use Area codepoint — what an icon-font glyph actually is. */
const PUA_GLYPH = "";

let installedFonts: Map<string, string[]> = new Map();
let pluginData: Map<string, string> = new Map();
let rangeFontCalls: Array<{ start: number; end: number; font: { family: string; style: string } }> = [];

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
    setRangeFontName: vi.fn((start: number, end: number, font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`unloaded: ${font.family} ${font.style}`);
      }
      rangeFontCalls.push({ start, end, font });
    }),
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
  rangeFontCalls = [];

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

describe("icon font resolved under its real (SFNT) family", () => {
  it("renders the real family instead of falling to Inter", async () => {
    // The user installed the ZIP's glyphs file; Font Book registers "icomoon".
    installedFonts.set("icomoon", ["Regular"]);

    const node = makeNode({
      fontFamily: "glyphs",
      textContent: PUA_GLYPH,
    });
    const textNode = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { glyphs: "icomoon" },
    }));

    expect(textNode!.fontName).toEqual({ family: "icomoon", style: "Regular" });
  });

  it("stamps no Re-apply marker — nothing is pending", async () => {
    installedFonts.set("icomoon", ["Regular"]);

    const node = makeNode({ fontFamily: "glyphs", textContent: PUA_GLYPH });
    await createTextNode(node, "Inter", makeContext({
      fontRealNames: { glyphs: "icomoon" },
    }));

    expect(pluginData.get("w2w_original_font")).toBeUndefined();
    expect(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)).toBeUndefined();
  });

  it("rebinds an inline icon RUN to the real family too", async () => {
    installedFonts.set("icomoon", ["Regular"]);

    const node = makeNode({
      fontFamily: "Inter",
      textContent: `Menu ${PUA_GLYPH}`,
      styledSegments: [
        { text: "Menu ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Inter" },
        { text: PUA_GLYPH, color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "glyphs" },
      ],
    } as Partial<WireframeNode>);
    await createTextNode(node, "Inter", makeContext({
      fontRealNames: { glyphs: "icomoon" },
    }));

    expect(rangeFontCalls.some((c) => c.font.family === "icomoon")).toBe(true);
    expect(pluginData.get("w2w_original_font_segments")).toBeUndefined();
  });

  it("still marks the CSS family when nothing installable exists", async () => {
    // No icomoon installed — the glyph really does fall to Inter, and the
    // marker must name something the download ZIP can supply.
    const node = makeNode({ fontFamily: "glyphs", textContent: PUA_GLYPH });
    const textNode = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { glyphs: "icomoon" },
    }));

    expect(textNode!.fontName.family).toBe("Inter");
    // The real name is what a later install registers under, so Re-apply must
    // target it rather than the CSS name that no font ever carries.
    expect(pluginData.get("w2w_original_font")).toBe("icomoon");
  });
});

describe("real-family rescue keeps the cut marker actionable", () => {
  it("renders the real family's nearest cut and records the wanted one", async () => {
    // CSS family absent entirely; the real family ships only Regular.
    installedFonts.set("Foo Display", ["Regular"]);

    const node = makeNode({ fontFamily: "Foo", fontWeight: 600, textContent: "Heading" });
    const textNode = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { Foo: "Foo Display" },
      fontDeclaredCuts: { Foo: [{ weight: 400, italic: false }, { weight: 600, italic: false }] },
    }));

    // Family is right (under its real name) — no family-level marker …
    expect(textNode!.fontName).toEqual({ family: "Foo Display", style: "Regular" });
    expect(pluginData.get("w2w_original_font")).toBeUndefined();
    // … but the 600 cut the page asked for is still pending.
    expect(JSON.parse(pluginData.get(ORIGINAL_CUT_PLUGIN_KEY)!)).toEqual({
      families: ["Foo Display", "Foo"],
      weight: 600,
      italic: false,
    });
  });
});
