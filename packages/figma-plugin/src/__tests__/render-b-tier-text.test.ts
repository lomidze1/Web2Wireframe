/**
 * B5/B7 — application side in text.ts:
 *  - node.textShadowEffects → TextNode.effects (DROP_SHADOW on the glyphs,
 *    not on a wrapper box)
 *  - node.href → TextNode.hyperlink
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, RenderContext } from "../types";

function createMockTextNode() {
  let _characters = "";
  return {
    type: "TEXT",
    name: "",
    width: 100,
    height: 20,
    fills: [] as unknown[],
    effects: [] as unknown[],
    hyperlink: null as unknown,
    fontSize: 14,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    textAlignHorizontal: "LEFT",
    lineHeight: { unit: "AUTO" },
    letterSpacing: { value: 0, unit: "PIXELS" },
    textTruncation: undefined as string | undefined,
    textDecoration: "NONE",
    fillStyleId: "",
    textStyleId: "",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    get characters() { return _characters; },
    set characters(v: string) { _characters = v; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
  };
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
    loadFontAsync: vi.fn(async () => undefined),
  };
});

import { createTextNode } from "../rendering/text";

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "t1",
    name: "Text",
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
    textContent: "Hello world",
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
  } as WireframeNode;
}

function makeContext(): RenderContext {
  return {
    pluginColors: {
      text: "#333333", primary: "#000", secondary: "#888",
      background: "#ffffff", surface: "#f5f5f5", accent: "#3b82f6", border: "#e0e0e0",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    textMode: "original",
  } as unknown as RenderContext;
}

describe("B5: text-shadow applied to the TextNode itself", () => {
  it("sets DROP_SHADOW effects from node.textShadowEffects", async () => {
    const node = makeNode({
      textShadowEffects: [
        {
          type: "DROP_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.5 },
          offset: { x: 0, y: 2 },
          radius: 4,
          spread: 0,
        },
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode).not.toBeNull();
    const effects = textNode!.effects as readonly Effect[];
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe("DROP_SHADOW");
  });

  it("leaves effects empty without textShadowEffects", async () => {
    const textNode = await createTextNode(makeNode({}), "Inter", makeContext());
    expect((textNode!.effects as readonly Effect[]).length).toBe(0);
  });
});

describe("B7: hyperlink applied from node.href", () => {
  it("sets TextNode.hyperlink for a captured link URL", async () => {
    const node = makeNode({ href: "https://example.com/pricing" });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode!.hyperlink).toEqual({
      type: "URL",
      value: "https://example.com/pricing",
    });
  });

  it("leaves hyperlink unset without href", async () => {
    const textNode = await createTextNode(makeNode({}), "Inter", makeContext());
    expect(textNode!.hyperlink).toBeNull();
  });
});
