/**
 * Font resolution through `createTextNode` with the installed-font index in
 * play (changes 1, 2 and 4).
 *
 * These are the cases the old guess-and-catch ladder could not reach: a cut
 * that lives in the FAMILY name, and the spec's weight fallback direction.
 * Also pins the two properties that must not regress — Inter at the matched
 * weight as the last resort, and no thrown rejection escaping the text path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

let installedFonts: Map<string, string[]> = new Map();
let loadAttempts = 0;
let listCalls = 0;

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
      if (!isInstalled(v.family, v.style)) {
        throw new Error(`unloaded font: ${v.family} ${v.style}`);
      }
      _fontName = v;
    },
  });
  return node;
}

function installFigmaMock(): void {
  loadAttempts = 0;
  listCalls = 0;
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      loadAttempts++;
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
    }),
    listAvailableFontsAsync: vi.fn(async () => {
      listCalls++;
      return Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        styles.map((style) => ({ fontName: { family, style } })),
      );
    }),
  };
}

beforeEach(() => {
  installedFonts = new Map([["Inter", ["Regular", "Medium", "Semi Bold", "Bold", "Black"]]]);
  installFigmaMock();
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

describe("a cut that lives in the family name", () => {
  beforeEach(() => {
    // web2wireframe.design: the 600 cut installs as its own FAMILY.
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);
    installedFonts.set("Space Grotesk SemiBold", ["Regular"]);
    installFigmaMock();
  });

  it("a 600 run resolves to the SemiBold family, not the Bold cut", async () => {
    const t = await createTextNode(
      makeNode({ fontFamily: "Space Grotesk", fontWeight: 600 }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.family).toBe("Space Grotesk SemiBold");
    expect(t!.fontName.style).toBe("Regular");
  });

  it("a 400 run still uses the plain family", async () => {
    const t = await createTextNode(
      makeNode({ fontFamily: "Space Grotesk", fontWeight: 400 }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.family).toBe("Space Grotesk");
    expect(t!.fontName.style).toBe("Regular");
  });

  it("a 700 run takes the real Bold cut over the SemiBold family", async () => {
    const t = await createTextNode(
      makeNode({ fontFamily: "Space Grotesk", fontWeight: 700 }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.family).toBe("Space Grotesk");
    expect(t!.fontName.style).toBe("Bold");
  });
});

describe("spec weight fallback direction", () => {
  it("600 on a family without a Semibold ascends to Bold", async () => {
    installedFonts.set("Demo", ["Regular", "Medium", "Bold"]);
    installFigmaMock();
    const t = await createTextNode(
      makeNode({ fontFamily: "Demo", fontWeight: 600 }),
      "Inter",
      makeContext(),
    );
    // Was "Medium" before this change.
    expect(t!.fontName.style).toBe("Bold");
  });

  it("300 still descends", async () => {
    installedFonts.set("Demo", ["Thin", "Regular", "Bold"]);
    installFigmaMock();
    const t = await createTextNode(
      makeNode({ fontFamily: "Demo", fontWeight: 300 }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.style).toBe("Thin");
  });
});

describe("last resort", () => {
  it("falls back to Inter at the requested weight, never Inter Regular", async () => {
    const t = await createTextNode(
      makeNode({ fontFamily: "Nothing Installed", fontWeight: 700 }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.family).toBe("Inter");
    expect(t!.fontName.style).toBe("Bold");
  });

  it("always leaves a loaded font on the node", async () => {
    const t = await createTextNode(
      makeNode({ fontFamily: "Nothing Installed", fontWeight: 250 }),
      "Inter",
      makeContext(),
    );
    expect(t).not.toBeNull();
    expect(isInstalled(t!.fontName.family, t!.fontName.style)).toBe(true);
  });

  it("does not throw when listAvailableFontsAsync itself fails", async () => {
    (globalThis as Record<string, unknown>).figma = {
      ...(globalThis as unknown as { figma: Record<string, unknown> }).figma,
      listAvailableFontsAsync: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const t = await createTextNode(
      makeNode({ fontFamily: "Inter", fontWeight: 700 }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.family).toBe("Inter");
  });

  it("still resolves when listAvailableFontsAsync is absent (legacy ladder)", async () => {
    delete (globalThis as unknown as { figma: Record<string, unknown> }).figma
      .listAvailableFontsAsync;
    const t = await createTextNode(
      makeNode({ fontFamily: "Inter", fontWeight: 700 }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.style).toBe("Bold");
  });
});

describe("emoji partition", () => {
  it("an emoji family in the CSS stack never satisfies a text run", async () => {
    installedFonts.set("Apple Color Emoji", ["Regular"]);
    installFigmaMock();
    const t = await createTextNode(
      makeNode({
        fontFamily: "Some Missing Face",
        fontWeight: 400,
        fontFamilyList: ["Some Missing Face", "Apple Color Emoji"],
      }),
      "Inter",
      makeContext(),
    );
    expect(t!.fontName.family).not.toBe("Apple Color Emoji");
    expect(t!.fontName.family).toBe("Inter");
  });
});

describe("cost of resolution (change 4b)", () => {
  it("lists the installed fonts once across many text nodes", async () => {
    for (let i = 0; i < 5; i++) {
      await createTextNode(
        makeNode({ fontFamily: "Inter", fontWeight: 600 }),
        "Inter",
        makeContext(),
      );
    }
    expect(listCalls).toBe(1);
  });

  it("does not re-walk a guess ladder for every node", async () => {
    installedFonts.set("Demo", ["Regular"]);
    installFigmaMock();
    // A weight nothing ships: the old path threw ~20 rejections per node.
    for (let i = 0; i < 5; i++) {
      await createTextNode(
        makeNode({ fontFamily: "Demo", fontWeight: 900 }),
        "Inter",
        makeContext(),
      );
    }
    expect(loadAttempts).toBeLessThanOrEqual(10);
  });
});
