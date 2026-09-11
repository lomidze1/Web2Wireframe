/**
 * The silent failure points now feed the import report.
 *
 * Each of these paths already had a fallback that kept the import alive —
 * Inter instead of the site's font, a grey box instead of the image, a grey
 * box instead of the SVG. What none of them had was a way to tell the user
 * it happened, or on which layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import { createRealImage } from "../rendering/realImages";
import { convertFillsToPaints } from "../rendering/fills";
import { resetFontCacheForTests } from "../rendering/fontLoader";
import type { WireframeNode, RenderContext } from "../types";

let installedFonts: Map<string, string[]>;
/** Families Figma refuses to APPLY even though they load (broken font file). */
let rejectOnSet: Set<string>;

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

function createMockTextNode() {
  let _fontName = { family: "Inter", style: "Regular" };
  const node: Record<string, unknown> = {
    id: "101:5",
    name: "Hero heading",
    characters: "",
    fontSize: 14,
    fills: [],
    textAutoResize: "NONE",
    width: 200,
    height: 24,
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
      if (rejectOnSet.has(v.family) || !isInstalled(v.family, v.style)) {
        throw new Error(`unloaded: ${v.family} ${v.style}`);
      }
      _fontName = v;
    },
  });
  return node;
}

let frameCounter = 0;
function createMockFrame() {
  const frame: Record<string, unknown> = {
    id: `200:${++frameCounter}`,
    type: "FRAME",
    name: "",
    width: 100,
    height: 100,
    fills: [],
    children: [] as unknown[],
    layoutMode: "NONE",
    clipsContent: false,
    cornerRadius: 0,
    resize(w: number, h: number) { frame.width = w; frame.height = h; },
    appendChild(child: unknown) { (frame.children as unknown[]).push(child); },
    remove: vi.fn(),
    setPluginData: vi.fn(),
    getPluginData: vi.fn(() => ""),
  };
  return frame;
}

/** Context with a live warnings sink. */
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
    renderStats: {
      hoverCacheHits: 0,
      hoverCacheMisses: 0,
      emptyPseudoSkipped: 0,
      pseudoErrors: 0,
      droppedNodes: [],
      warnings: [],
    },
    ...overrides,
  } as unknown as RenderContext;
}

function makeTextNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "t", name: "Hero heading", type: "text", tag: "h1",
    x: 0, y: 0, width: 200, height: 24,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#333", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, textContent: "Design faster", fontSize: 28, fontWeight: 400,
    fontFamily: "Söhne", textAlign: "left", lineHeight: 32, letterSpacing: 0,
    isPlaceholder: false, children: [], browserLineCount: 1,
    ...overrides,
  } as WireframeNode;
}

function makeImageNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "i", name: "Product photo", type: "image", tag: "img",
    x: 0, y: 0, width: 300, height: 200,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: null, borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, isPlaceholder: false, children: [],
    ...overrides,
  } as unknown as WireframeNode;
}

beforeEach(() => {
  frameCounter = 0;
  rejectOnSet = new Set();
  installedFonts = new Map([["Inter", ["Regular", "Bold", "Semi Bold", "Medium", "Light"]]]);

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    createFrame: vi.fn(() => createMockFrame()),
    createImage: vi.fn(() => {
      throw new Error("Image type not supported");
    }),
    createNodeFromSvg: vi.fn(() => {
      throw new Error("Invalid SVG");
    }),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
    }),
    listAvailableFontsAsync: vi.fn(async () =>
      Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        [...styles].sort().map((style) => ({ fontName: { family, style } })),
      ),
    ),
  };
});

describe("typography warnings", () => {
  it("records the substituted family, with the text layer to click", async () => {
    const context = makeContext();
    const textNode = await createTextNode(makeTextNode(), "Inter", context);

    expect(textNode!.fontName.family).toBe("Inter");

    const warnings = context.renderStats!.warnings!;
    const typo = warnings.filter((w) => w.category === "typography");
    expect(typo).toHaveLength(1);
    expect(typo[0].message).toContain("Söhne");
    expect(typo[0].message).toContain("Inter");
    expect(typo[0].nodeId).toBe("101:5");
    expect(typo[0].layerName).toBe("Hero heading");
  });

  it("stays quiet when the requested family was actually used", async () => {
    installedFonts.set("Söhne", ["Regular"]);
    const context = makeContext();
    await createTextNode(makeTextNode(), "Inter", context);

    expect(
      context.renderStats!.warnings!.filter((w) => w.category === "typography"),
    ).toHaveLength(0);
  });
});

describe("image warnings", () => {
  it("records an image warning when the raster data cannot be decoded", async () => {
    const context = makeContext();
    await createRealImage(makeImageNode(), "data:image/png;base64,!!!notbase64!!!", context);

    const warnings = context.renderStats!.warnings!;
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("image");
    expect(warnings[0].layerName).toBe("Product photo");
    expect(warnings[0].nodeId).toBe("200:1");
  });

  it("records an svg warning — not an image one — when the SVG is invalid", async () => {
    const context = makeContext();
    await createRealImage(
      makeImageNode({ name: "Logo" }),
      "data:image/svg+xml;charset=utf-8,<svg><broken",
      context,
    );

    const warnings = context.renderStats!.warnings!;
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("svg");
    expect(warnings[0].layerName).toBe("Logo");
  });

  it("stays quiet when the image decodes fine", async () => {
    (globalThis as Record<string, unknown>).figma = {
      ...(globalThis as Record<string, { figma: unknown }> as unknown as { figma: Record<string, unknown> }).figma,
    };
    const figmaMock = (globalThis as unknown as { figma: Record<string, unknown> }).figma;
    figmaMock.createImage = vi.fn(() => ({ hash: "abc" }));

    const context = makeContext();
    // 1x1 transparent GIF.
    await createRealImage(
      makeImageNode(),
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      context,
    );

    expect(context.renderStats!.warnings).toHaveLength(0);
  });
});

describe("background-image warnings", () => {
  it("records an image warning when a background image cannot be decoded", () => {
    const context = makeContext({
      assetsMap: new Map([["hero.png", "data:image/png;base64,!!!notbase64!!!"]]),
    } as Partial<RenderContext>);

    const paints = convertFillsToPaints(
      [
        {
          type: "IMAGE_PLACEHOLDER",
          imageUrl: "hero.png",
          visible: true,
          opacity: 1,
        },
      ] as never,
      context,
      "div",
      undefined,
      { id: "300:9", name: "Hero banner" },
    );

    // Rendering output is unchanged: still the solid surface fallback.
    expect(paints).toHaveLength(1);
    expect((paints[0] as { type: string }).type).toBe("SOLID");

    const warnings = context.renderStats!.warnings!;
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("image");
    expect(warnings[0].nodeId).toBe("300:9");
    expect(warnings[0].layerName).toBe("Hero banner");
  });
});

describe("background-image that never arrived", () => {
  const missing = () =>
    [{ type: "IMAGE_PLACEHOLDER", imageUrl: "https://x.com/hero.jpg", visible: true, opacity: 1 }] as never;

  it("warns when real assets were asked for and the image is missing", () => {
    const context = makeContext({ assetMode: "realAssets", assetsMap: new Map() } as Partial<RenderContext>);
    const paints = convertFillsToPaints(missing(), context, "div", undefined, {
      id: "300:10",
      name: "Hero banner",
    });

    expect((paints[0] as { type: string }).type).toBe("SOLID");
    const warnings = context.renderStats!.warnings!;
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("image");
    expect(warnings[0].message).toMatch(/couldn't be loaded/);
    expect(warnings[0].nodeId).toBe("300:10");
  });

  it("stays quiet in placeholders mode — the solid fill IS the design", () => {
    const context = makeContext({ assetMode: "placeholders" } as Partial<RenderContext>);
    convertFillsToPaints(missing(), context, "div", undefined, { id: "300:11", name: "Hero" });
    expect(context.renderStats!.warnings).toHaveLength(0);
  });
});

describe("font that loads but won't apply", () => {
  it("reports the Inter fallback instead of claiming the requested family", async () => {
    resetFontCacheForTests();
    installedFonts.set("Söhne", ["Regular"]);
    rejectOnSet.add("Söhne");

    const context = makeContext();
    const textNode = await createTextNode(makeTextNode(), "Inter", context);

    expect(textNode!.fontName.family).toBe("Inter");
    const typo = context.renderStats!.warnings!.filter((w) => w.category === "typography");
    expect(typo).toHaveLength(1);
    expect(typo[0].message).toContain("Söhne");
    expect(typo[0].message).toContain('"Inter"');
  });
});
