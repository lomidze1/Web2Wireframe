/**
 * Font names from a user's import reports (2026-09-16, 8 sites) that all
 * rendered in the plugin font:
 *
 * - notion.com "Inter Semi": the measured face "Inter Semi Bold" was split on
 *   its last word only, leaving family "Inter Semi" — never installed.
 * - crojungle.com "false": a literal `font-family: false` was taken as a family.
 * - clearstreet.io "sans-serif": a generic family reached the renderer as the
 *   family and fell through to the plugin font instead of a sans default.
 * - vaayu.tech "webflow-icons", komplice.com "FFIcons": icon fonts missing from
 *   the fixed name list were remapped, turning glyphs into tofu.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { createTextNode } from "../rendering/text";
import {
  isIconFont,
  isUsableMeasuredFamily,
  isValidFontName,
} from "../utils/fontUtils";
import type { WireframeNode, RenderContext } from "../types";

// ============================================================================
// css-converter helpers
// ============================================================================

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 100,
    quad: [0, 0, 400, 0, 400, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: "body", width: 1280, height: 800, styles: { height: "100%" }, children });
  return makeFrame({
    tag: "html", width: 1280, height: 800,
    styles: { height: "100%" },
    children: [body],
    isScrollingElt: true,
  });
}

function findNode(
  node: unknown,
  pred: (n: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (pred(obj)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findNode(c, pred);
    if (hit) return hit;
  }
  return null;
}

function convertText(value: string, fontFamily: string, font?: string): Record<string, unknown> | null {
  const p = makeFrame({
    tag: "p",
    styles: { display: "block", fontFamily },
    children: [{
      type: "TEXT", x: 0, y: 0, width: 200, height: 20,
      quad: [0, 0, 200, 0, 200, 20, 0, 20],
      value,
      ...(font ? { font } : {}),
    }],
  });
  const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
  return findNode(root, (n) => n.textContent === value);
}

describe("two-word weight suffix in a measured face name", () => {
  it('"Inter Semi Bold" → family Inter', () => {
    const node = convertText("Notion headline", "NotionInter, Inter, sans-serif", "Inter Semi Bold");
    expect(node?.fontFamily).toBe("Inter");
  });

  it('"Foo Extra Light" → family Foo', () => {
    const node = convertText("light text", "Foo, sans-serif", "Foo Extra Light");
    expect(node?.fontFamily).toBe("Foo");
  });

  // vaayu.tech: CSS `font-family: Tobias; font-style: italic` measured as
  // "Tobias Italic" — a family that does not exist, so the italic cuts never
  // reached the font ZIP and Re-apply searched for it forever.
  it('"Tobias Italic" → family Tobias', () => {
    const node = convertText("italic quote", "Tobias, Georgia, sans-serif", "Tobias Italic");
    expect(node?.fontFamily).toBe("Tobias");
  });

  it('"Tobias Light Italic" → family Tobias', () => {
    const node = convertText("light italic quote", "Tobias, Georgia, sans-serif", "Tobias Light Italic");
    expect(node?.fontFamily).toBe("Tobias");
  });

  it('regression: "Arial Bold" → family Arial', () => {
    const node = convertText("bold text", "Arial, sans-serif", "Arial Bold");
    expect(node?.fontFamily).toBe("Arial");
  });
});

describe("junk family values", () => {
  it('"false" is not a valid font name', () => {
    expect(isValidFontName("false")).toBe(false);
    expect(isValidFontName("undefined")).toBe(false);
    expect(isValidFontName("null")).toBe(false);
  });

  it('"false" is not a usable measured family', () => {
    expect(isUsableMeasuredFamily("false")).toBe(false);
  });

  it("a `false` stack entry is skipped for the next family", () => {
    const node = convertText("cro jungle", "false, Clash Grotesk, sans-serif");
    expect(node?.fontFamily).toBe("Clash Grotesk");
  });
});

describe("icon fonts outside the fixed name list", () => {
  it("recognises site icon fonts by name", () => {
    expect(isIconFont("webflow-icons")).toBe(true);
    expect(isIconFont("FFIcons")).toBe(true);
    expect(isIconFont("my_icon_font")).toBe(true);
  });

  it("does not flag text fonts that merely contain the letters", () => {
    expect(isIconFont("Lexicon")).toBe(false);
    expect(isIconFont("Iconic Sans")).toBe(false);
    expect(isIconFont("Silicon")).toBe(false);
  });
});

// ============================================================================
// Website-mode text rendering
// ============================================================================

let installedFonts: Map<string, string[]> = new Map();

function isInstalled(family: string, style: string): boolean {
  return !!installedFonts.get(family)?.includes(style);
}

function createMockTextNode() {
  let fontName = { family: "Inter", style: "Regular" };
  const node: Record<string, unknown> = {
    id: "text-1",
    name: "Test",
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
    get: () => fontName,
    set: (v: { family: string; style: string }) => {
      if (!isInstalled(v.family, v.style)) throw new Error(`unloaded font: ${v.family} ${v.style}`);
      fontName = v;
    },
  });
  return node;
}

beforeEach(() => {
  installedFonts = new Map([
    ["Inter", ["Regular", "Medium", "Semi Bold", "Bold"]],
    ["Montserrat", ["Regular", "Bold"]],
    ["webflow-icons", ["Regular"]],
  ]);
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
    id: "t1", name: "Test", type: "text", tag: "p",
    x: 0, y: 0, width: 200, height: 24,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#333333", borderColor: null, borderWidth: 0,
    borderRadius: 0, opacity: 1,
    textContent: "Hello", fontSize: 16, fontWeight: 400,
    fontFamily: "Inter", textAlign: "left", lineHeight: 24,
    letterSpacing: 0, isPlaceholder: false, children: [],
    browserLineCount: 1,
    ...overrides,
  };
}

type Stats = { warnings: { category: string; message: string }[] };

function makeContext(stats: Stats, overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    pluginColors: {
      main: "#1f3a5f", text: "#333333", accent: "#3b82f6",
      surface: "#f5f5f5", border: "#e0e0e0", background: "#ffffff",
    },
    fontFamily: "Montserrat",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    renderStats: stats,
    ...overrides,
  } as RenderContext;
}

describe("website mode: generic family", () => {
  it('"sans-serif" renders in Inter, not the plugin font, and is not reported', async () => {
    const stats: Stats = { warnings: [] };
    const t = await createTextNode(
      makeNode({ fontFamily: "sans-serif" }),
      "Montserrat",
      makeContext(stats),
    );
    expect(t!.fontName.family).toBe("Inter");
    expect(stats.warnings.filter((w) => w.category === "typography")).toEqual([]);
  });
});

describe("website mode: icon font is never remapped", () => {
  it("webflow-icons keeps its own family even when the modal mapped it", async () => {
    const stats: Stats = { warnings: [] };
    const t = await createTextNode(
      makeNode({ fontFamily: "webflow-icons", textContent: "" }),
      "Montserrat",
      makeContext(stats, { fontMapping: { "webflow-icons": "Montserrat" } }),
    );
    expect(t!.fontName.family).toBe("webflow-icons");
  });
});
