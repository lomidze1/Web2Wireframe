/**
 * Per-range decoration detail (h2d main-rawbundle:17258-17265 parity).
 *
 * We already set decoration STYLE and COLOR at node level; a dotted or tinted
 * underline on ONE run inside a paragraph was flattened to the node's.
 *
 * h2d's guard is mirrored: the style/colour setters run only where the range
 * is an UNDERLINE. Figma throws on a strikethrough or an undecorated range.
 *
 * NOT covered — thickness and offset: `text-decoration-thickness` and
 * `text-underline-offset` are not in the live extension's capture list
 * (packages/browser-extension/src/content/styles.ts), and Chrome's computed
 * `text-decoration` shorthand carries only line/style/colour. There is no data
 * to feed those two setters until the extension ships the properties.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, RenderContext, TextSegment } from "../types";

function createMockTextNode() {
  let _characters = "";
  return {
    type: "TEXT",
    name: "",
    width: 400,
    height: 20,
    fills: [] as unknown[],
    effects: [] as unknown[],
    hyperlink: null as unknown,
    fontSize: 14,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    textAlignHorizontal: "LEFT",
    lineHeight: { unit: "AUTO" } as unknown,
    letterSpacing: { value: 0, unit: "PIXELS" } as unknown,
    textCase: "ORIGINAL" as string,
    textTruncation: undefined as string | undefined,
    textDecoration: "NONE",
    textDecorationStyle: "SOLID",
    textDecorationColor: undefined as unknown,
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
    setRangeHyperlink: vi.fn(),
    setRangeLetterSpacing: vi.fn(),
    setRangeLineHeight: vi.fn(),
    setRangeTextCase: vi.fn(),
    setRangeTextDecorationStyle: vi.fn(),
    setRangeTextDecorationColor: vi.fn(),
  };
}

let mockNode: ReturnType<typeof createMockTextNode>;

beforeEach(() => {
  mockNode = createMockTextNode();
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => mockNode),
    loadFontAsync: vi.fn(async () => undefined),
  };
});

import { createTextNode } from "../rendering/text";

function segment(text: string, extra: Partial<TextSegment> = {}): TextSegment {
  return {
    text,
    color: "#333333",
    fontWeight: 400,
    fontSize: 16,
    fontFamily: "Inter",
    ...extra,
  };
}

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "t1",
    name: "Text",
    type: "text",
    tag: "p",
    x: 0, y: 0, width: 400, height: 24,
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
    textContent: "",
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

function callsFor(fn: { mock: { calls: unknown[][] } }, chars: string) {
  return fn.mock.calls.map((c) => [chars.slice(c[0] as number, c[1] as number), c[2]]);
}

describe("per-range decoration style", () => {
  it("applies a dotted underline to just its run", async () => {
    const node = makeNode({
      styledSegments: [
        segment("solid ", { textDecoration: "underline" }),
        segment("dotted", { textDecoration: "underline", textDecorationStyle: "DOTTED" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(callsFor(mockNode.setRangeTextDecorationStyle, textNode!.characters)).toEqual([
      ["dotted", "DOTTED"],
    ]);
  });

  it("applies a wavy underline", async () => {
    const node = makeNode({
      styledSegments: [
        segment("plain "),
        segment("wavy", { textDecoration: "underline", textDecorationStyle: "WAVY" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(callsFor(mockNode.setRangeTextDecorationStyle, textNode!.characters)).toEqual([
      ["wavy", "WAVY"],
    ]);
  });

  it("skips a run matching the node-level style", async () => {
    const node = makeNode({
      textDecorationStyle: "DOTTED",
      styledSegments: [
        segment("a", { textDecoration: "underline", textDecorationStyle: "DOTTED" }),
        segment("b", { textDecoration: "underline", textDecorationStyle: "DOTTED" }),
      ],
    });
    await createTextNode(node, "Inter", makeContext());
    expect(mockNode.setRangeTextDecorationStyle).not.toHaveBeenCalled();
  });
});

describe("per-range decoration colour", () => {
  it("applies a tinted underline to just its run", async () => {
    const node = makeNode({
      styledSegments: [
        segment("plain "),
        segment("tinted", {
          textDecoration: "underline",
          textDecorationColor: "rgb(255, 0, 0)",
        }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    const calls = callsFor(mockNode.setRangeTextDecorationColor, textNode!.characters);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("tinted");
    expect(calls[0][1]).toEqual({
      value: { type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 },
    });
  });
});

describe("h2d's UNDERLINE-only guard", () => {
  it("never touches a strikethrough run — Figma throws there", async () => {
    const node = makeNode({
      styledSegments: [
        segment("plain "),
        segment("struck", {
          textDecoration: "line-through",
          textDecorationStyle: "WAVY",
          textDecorationColor: "rgb(255, 0, 0)",
        }),
      ],
    });
    await createTextNode(node, "Inter", makeContext());
    expect(mockNode.setRangeTextDecorationStyle).not.toHaveBeenCalled();
    expect(mockNode.setRangeTextDecorationColor).not.toHaveBeenCalled();
  });

  it("never touches an undecorated run", async () => {
    const node = makeNode({
      styledSegments: [
        segment("plain "),
        segment("bare", { textDecorationStyle: "DOTTED", textDecorationColor: "rgb(255,0,0)" }),
      ],
    });
    await createTextNode(node, "Inter", makeContext());
    expect(mockNode.setRangeTextDecorationStyle).not.toHaveBeenCalled();
    expect(mockNode.setRangeTextDecorationColor).not.toHaveBeenCalled();
  });
});

describe("safety", () => {
  it("degrades to a no-op on a Figma build without the setters", async () => {
    const partial = mockNode as unknown as Record<string, unknown>;
    delete partial.setRangeTextDecorationStyle;
    delete partial.setRangeTextDecorationColor;
    const node = makeNode({
      styledSegments: [
        segment("a"),
        segment("b", {
          textDecoration: "underline",
          textDecorationStyle: "DOTTED",
          textDecorationColor: "rgb(255,0,0)",
        }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode).not.toBeNull();
  });

  it("survives a setter that throws", async () => {
    mockNode.setRangeTextDecorationStyle = vi.fn(() => {
      throw new Error("Unsupported on this text node");
    });
    const node = makeNode({
      styledSegments: [
        segment("a"),
        segment("b", { textDecoration: "underline", textDecorationStyle: "WAVY" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode).not.toBeNull();
  });
});
