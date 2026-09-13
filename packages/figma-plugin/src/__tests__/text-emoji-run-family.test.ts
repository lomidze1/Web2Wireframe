/**
 * An emoji run inside a text paragraph must still be drawn in the emoji font.
 *
 * `resolveFamilyCut` refuses an emoji family unless the RUN asked for one —
 * correctly, because an emoji font sitting in a CSS fallback stack must never
 * render a text run. But `runWantsEmoji` is computed once per NODE, from
 * `node.fontFamily`, while the segment loop asks the same helper about each
 * run's OWN family.
 *
 * So in `<p style="font-family: Inter">Ship it 🚀</p>` the rocket's measured
 * platform font is "Apple Color Emoji", the node's is Inter, and Step 1 returns
 * null before it ever looks. Steps 2, 2.5 and 3 do not apply, and the run lands
 * on the node font — the emoji renders as tofu in Inter.
 *
 * Before this change set Step 1 was a plain `tryLoad` ladder with no emoji
 * gate, so the run resolved. The gate is right; its granularity is not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

let installedFonts: Map<string, string[]>;
let rangeFontCalls: Array<{ start: number; end: number; font: { family: string; style: string } }>;

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

function createMockTextNode() {
  let _fontName = { family: "Inter", style: "Regular" };
  const node: Record<string, unknown> = {
    characters: "",
    fontSize: 16,
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
    setRangeFontName: vi.fn((start: number, end: number, font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) throw new Error(`unloaded: ${font.family}`);
      rangeFontCalls.push({ start, end, font });
    }),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
    setPluginData: vi.fn(),
    getPluginData: vi.fn(() => ""),
  };
  Object.defineProperty(node, "fontName", {
    get: () => _fontName,
    set: (v: { family: string; style: string }) => {
      if (!isInstalled(v.family, v.style)) throw new Error(`unloaded: ${v.family}`);
      _fontName = v;
    },
  });
  return node;
}

beforeEach(() => {
  installedFonts = new Map([
    ["Inter", ["Regular", "Medium", "Bold"]],
    ["Apple Color Emoji", ["Regular"]],
  ]);
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
    opacity: 1, textContent: "", fontSize: 16, fontWeight: 400,
    fontFamily: "Inter", textAlign: "left", lineHeight: 24, letterSpacing: 0,
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

/** The font a given run was drawn in. */
function fontOfRun(text: string, full: string): string | undefined {
  const start = full.indexOf(text);
  return rangeFontCalls.find((c) => c.start <= start && c.end >= start + text.length)
    ?.font.family;
}

describe("emoji runs inside a text paragraph", () => {
  it("draws the emoji run in the emoji font, not the paragraph's", async () => {
    const full = "Ship it 🚀";
    const node = makeNode({
      textContent: full,
      styledSegments: [
        { text: "Ship it ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Inter" },
        { text: "🚀", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Apple Color Emoji" },
      ],
    });

    await createTextNode(node, "Inter", makeContext());

    expect(fontOfRun("🚀", full)).toBe("Apple Color Emoji");
  });

  it("leaves the surrounding text on the paragraph's own font", async () => {
    // The other half of the partition: the emoji family must not leak onto a
    // text run just because it is installed.
    const full = "Ship it 🚀";
    const node = makeNode({
      textContent: full,
      styledSegments: [
        { text: "Ship it ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Inter" },
        { text: "🚀", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Apple Color Emoji" },
      ],
    });

    await createTextNode(node, "Inter", makeContext());

    expect(fontOfRun("Ship it ", full)).toBe("Inter");
  });

  it("never hands a text run to an emoji family from the fallback stack", async () => {
    // A run whose OWN family is an emoji font is the only case the gate opens
    // for. A text run asking for a missing family must fall to the node font,
    // never to the emoji one.
    const full = "Ship it";
    const node = makeNode({
      textContent: full,
      styledSegments: [
        { text: "Ship it", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Noto Color Emoji" },
      ],
      fontFamily: "Inter",
    });

    await createTextNode(node, "Inter", makeContext());

    expect(fontOfRun("Ship it", full)).not.toBe("Noto Color Emoji");
  });
});
