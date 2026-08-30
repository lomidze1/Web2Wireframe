/**
 * Per-range letterSpacing / textCase / lineHeight (h2d `lh`+`q5` parity).
 *
 * A `<span style="letter-spacing:.1em">` or a small-caps `<abbr>` inside a
 * paragraph used to flatten to the node-level value: only fills, fontName,
 * fontSize and the decoration line-kind were applied per range.
 *
 * These setters run AFTER the node-level assignments and after the deferred
 * TextStyle links — both of those cover every character and would otherwise
 * overwrite the ranges.
 *
 * `text-transform: capitalize` is deliberately NOT handled here: it stays
 * baked into the string, because Figma's TITLE case lowercases inner capitals
 * ("iPhone" → "Iphone"). Only UPPER and LOWER ride textCase.
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

/** Text covered by a recorded range call, plus its value. */
function callsFor(fn: { mock: { calls: unknown[][] } }, chars: string) {
  return fn.mock.calls.map((c) => [chars.slice(c[0] as number, c[1] as number), c[2]]);
}

describe("per-range letterSpacing", () => {
  it("applies a run whose tracking differs from the node", async () => {
    const node = makeNode({
      letterSpacing: 0,
      styledSegments: [
        segment("Normal "),
        segment("TRACKED", { letterSpacing: 1.6 }),
        segment(" normal"),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(callsFor(mockNode.setRangeLetterSpacing, textNode!.characters)).toEqual([
      ["TRACKED", { value: 1.6, unit: "PIXELS" }],
    ]);
  });

  it("skips a run that matches the node-level value", async () => {
    const node = makeNode({
      letterSpacing: 1.6,
      styledSegments: [
        segment("a", { letterSpacing: 1.6 }),
        segment("b", { letterSpacing: 1.6 }),
      ],
    });
    await createTextNode(node, "Inter", makeContext());
    expect(mockNode.setRangeLetterSpacing).not.toHaveBeenCalled();
  });
});

describe("per-range textCase", () => {
  it("applies UPPER to a run the node does not uppercase", async () => {
    const node = makeNode({
      styledSegments: [
        segment("read the "),
        segment("terms", { textCase: "UPPER" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(callsFor(mockNode.setRangeTextCase, textNode!.characters)).toEqual([
      ["terms", "UPPER"],
    ]);
  });

  it("resets a run that opts OUT of the node's uppercase", async () => {
    const node = makeNode({
      textCase: "UPPER",
      styledSegments: [
        segment("SHOUTING "),
        segment("quiet", { textCase: "ORIGINAL" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(callsFor(mockNode.setRangeTextCase, textNode!.characters)).toEqual([
      ["quiet", "ORIGINAL"],
    ]);
  });

  it("skips runs that inherit the node's case", async () => {
    const node = makeNode({
      textCase: "UPPER",
      styledSegments: [
        segment("a", { textCase: "UPPER" }),
        segment("b", { textCase: "UPPER" }),
      ],
    });
    await createTextNode(node, "Inter", makeContext());
    expect(mockNode.setRangeTextCase).not.toHaveBeenCalled();
  });

  it("falls back to UPPER when the font rejects SMALL_CAPS", async () => {
    mockNode.setRangeTextCase = vi.fn((_s: number, _e: number, value: string) => {
      if (value === "SMALL_CAPS") throw new Error("Cannot set SMALL_CAPS on this font");
    });
    const node = makeNode({
      styledSegments: [
        segment("as "),
        segment("html", { textCase: "SMALL_CAPS" as TextSegment["textCase"] }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    const calls = callsFor(mockNode.setRangeTextCase, textNode!.characters);
    expect(calls).toEqual([
      ["html", "SMALL_CAPS"],
      ["html", "UPPER"],
    ]);
  });
});

describe("per-range lineHeight", () => {
  it("applies a run whose line-height differs from the node", async () => {
    const node = makeNode({
      lineHeight: 24,
      styledSegments: [
        segment("body copy "),
        segment("tight", { lineHeight: "16px" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(callsFor(mockNode.setRangeLineHeight, textNode!.characters)).toEqual([
      ["tight", { value: 16, unit: "PIXELS" }],
    ]);
  });

  it("skips a run that matches the node", async () => {
    const node = makeNode({
      lineHeight: 24,
      styledSegments: [
        segment("a", { lineHeight: 24 }),
        segment("b", { lineHeight: "24px" }),
      ],
    });
    await createTextNode(node, "Inter", makeContext());
    expect(mockNode.setRangeLineHeight).not.toHaveBeenCalled();
  });
});

describe("safety", () => {
  it("degrades to a no-op on a Figma build without the setters", async () => {
    const partial = mockNode as unknown as Record<string, unknown>;
    delete partial.setRangeLetterSpacing;
    delete partial.setRangeTextCase;
    delete partial.setRangeLineHeight;
    const node = makeNode({
      styledSegments: [
        segment("a", { letterSpacing: 2, textCase: "UPPER", lineHeight: "10px" }),
        segment("b"),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode).not.toBeNull();
  });

  it("never calls a setter past the end of the string", async () => {
    const node = makeNode({
      styledSegments: [
        segment("short"),
        segment("run", { letterSpacing: 3 }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext());
    const len = textNode!.characters.length;
    for (const call of mockNode.setRangeLetterSpacing.mock.calls) {
      expect(call[1] as number).toBeLessThanOrEqual(len);
      expect(call[0] as number).toBeGreaterThanOrEqual(0);
    }
  });
});
