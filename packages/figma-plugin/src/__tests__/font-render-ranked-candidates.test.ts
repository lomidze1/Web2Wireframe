/**
 * The RENDERER must walk ranked candidates, not trust the single best match.
 *
 * Measured on stripe.com: one typeface sits in Figma under two spellings that
 * share a normalized key — the loadable "S?hne VF" (Figma mangles the ö) and a
 * "Söhne VF" that `listAvailableFontsAsync` reports but `loadFontAsync`
 * refuses. Asking the index for the best cut at weight 300 returns the phantom
 * "Söhne VF"/Light; when its load throws, giving up drops the run to Inter
 * even though "S?hne VF"/Buch was one place further down the list.
 *
 * The rebind path already walks the list (rebindFonts `loadFontWithFallback`).
 * One import produced 34 runs resolved to "S?hne VF" and 26 dropped to Inter —
 * this is those 26.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

/** The loadable install: mangled family, German named instances. */
const SOHNE_MANGLED = "S?hne VF";
const SOHNE_STYLES = ["Buch", "Leicht", "Extraleicht", "Halbfett", "Fett"];

let installedFonts: Map<string, string[]>;
/** Listed by Figma, refused by loadFontAsync. */
let unloadableFamilies: Set<string>;

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

function isLoadable(family: string, style: string): boolean {
  return isInstalled(family, style) && !unloadableFamilies.has(family);
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
      if (!isLoadable(v.family, v.style)) throw new Error(`unloaded: ${v.family} ${v.style}`);
      _fontName = v;
    },
  });
  return node;
}

beforeEach(() => {
  installedFonts = new Map([
    ["Inter", ["Regular", "Bold", "Semi Bold", "Medium", "Light"]],
    [SOHNE_MANGLED, [...SOHNE_STYLES]],
  ]);
  unloadableFamilies = new Set();

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isLoadable(font.family, font.style)) {
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

/** Add the phantom twin Figma also lists for this typeface. */
function installPhantomSohne(): void {
  installedFonts.set("Söhne VF", ["Light", "Regular"]);
  unloadableFamilies.add("Söhne VF");
}

function makeNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "t", name: "t", type: "text", tag: "p",
    x: 0, y: 0, width: 200, height: 24,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#333", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, textContent: "Financial infrastructure", fontSize: 28,
    fontWeight: 300, fontFamily: "sohne-var", textAlign: "left",
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

describe("renderer walks ranked font candidates", () => {
  it("skips a listed-but-unloadable family instead of dropping to Inter", async () => {
    installPhantomSohne();

    const textNode = await createTextNode(makeNode(), "Inter", makeContext());

    expect(textNode).not.toBeNull();
    expect(textNode!.fontName.family).toBe(SOHNE_MANGLED);
    expect(isLoadable(textNode!.fontName.family, textNode!.fontName.style)).toBe(true);
  });

  it("resolves the same run when no phantom is present (regression)", async () => {
    const textNode = await createTextNode(makeNode(), "Inter", makeContext());

    expect(textNode!.fontName.family).toBe(SOHNE_MANGLED);
  });

  it("still falls back to Inter when the family is genuinely absent", async () => {
    const textNode = await createTextNode(
      makeNode({ fontFamily: "Nothing Installed" }),
      "Inter",
      makeContext({ fontRealNames: {} }),
    );

    expect(textNode!.fontName.family).toBe("Inter");
  });
});
