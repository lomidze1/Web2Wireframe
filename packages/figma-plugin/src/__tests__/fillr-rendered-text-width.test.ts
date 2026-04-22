/**
 * FILLR rendered-text-width support.
 *
 * Bug (pricing page): a `<p>` element with `width: 100%` (e.g. 1114px) but
 * real text content that only spans half the width (e.g. 556px) produces a
 * FILLR wireframe line that stretches across the FULL element width, far
 * past where the real text ended.
 *
 * Root cause: FILLR rendering used `node.width` (the element's CSS width),
 * not the rendered text's actual bounding-box width. The content script
 * already captures per-line TEXT widths — we just weren't propagating them.
 *
 * Fix: css-converter now stores `renderedTextWidth` = max width across the
 * coalesced text children; FILLR uses it to clamp `originalWidth` when it is
 * narrower than the element, so the wireframe line matches the real text's
 * visual span.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Figma API mocks (for integration tests further down)
// ---------------------------------------------------------------------------

interface MockText {
  type: "TEXT";
  name: string;
  width: number;
  height: number;
  characters: string;
  fontName: unknown;
  fontSize: number;
  textAutoResize: string;
  textAlignHorizontal: string;
  fills: unknown[];
  resize(w: number, h: number): void;
}

function createMockTextNode(): MockText {
  return {
    type: "TEXT",
    name: "",
    width: 100,
    height: 20,
    characters: "",
    fontName: { family: "Inter", style: "Regular" },
    fontSize: 16,
    textAutoResize: "NONE",
    textAlignHorizontal: "LEFT",
    fills: [],
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
  };
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => ({
    type: "FRAME",
    name: "",
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    children: [],
    layoutMode: "NONE",
    resize: vi.fn(),
    appendChild: vi.fn(),
  })),
  createText: vi.fn(() => createMockTextNode()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { resolveFillrTargetWidth, createTextNode } from "../rendering/text";
import type { WireframeNode, RenderContext } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 1114,
    height: 26,
    quad: [0, 0, 1114, 0, 1114, 26, 0, 26],
    tag: "p",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function makeText(
  value: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "TEXT",
    x: 0,
    y: 0,
    width: 556,
    height: 25.59,
    quad: [0, 0, 556, 0, 556, 25.59, 0, 25.59],
    value,
    font: "400 18px Inter",
    ...overrides,
  };
}

function findTextNode(node: WireframeNode, tag: string): WireframeNode | null {
  if (node.tag === tag && node.type === "text") return node;
  for (const child of node.children || []) {
    const found = findTextNode(child, tag);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("css-converter — renderedTextWidth propagation", () => {
  it("stores rendered text width on coalesced <p> (single-line fits less than element)", () => {
    const pFrame = makeFrame({
      children: [makeText("Start free, then unlock images, assets, and multi-page captures with Pro.", { width: 556 })],
    });

    const wireframe = convertW2WToWireframe(pFrame as never, {
      layoutMode: "autoLayout",
    });

    const textNode = findTextNode(wireframe as WireframeNode, "p");
    expect(textNode).not.toBeNull();
    expect(textNode!.width).toBe(1114); // element width preserved
    expect(textNode!.renderedTextWidth).toBe(556); // rendered text width captured
  });

  it("uses max width across multiple per-line TEXT children", () => {
    const pFrame = makeFrame({
      width: 800,
      height: 52,
      children: [
        makeText("first line of wrapped text", { width: 700, y: 0 }),
        makeText("second shorter", { width: 320, y: 26 }),
      ],
    });

    const wireframe = convertW2WToWireframe(pFrame as never, {
      layoutMode: "autoLayout",
    });

    const textNode = findTextNode(wireframe as WireframeNode, "p");
    expect(textNode).not.toBeNull();
    expect(textNode!.renderedTextWidth).toBe(700); // widest line wins
  });

  it("does NOT set renderedTextWidth when frame has no text children", () => {
    const pFrame = makeFrame({
      tag: "div",
      children: [],
    });

    const wireframe = convertW2WToWireframe(pFrame as never, {
      layoutMode: "autoLayout",
    });

    // div with no children stays a frame
    expect((wireframe as WireframeNode).renderedTextWidth).toBeUndefined();
  });

  it("does NOT overwrite element width — renderedTextWidth is additive", () => {
    const pFrame = makeFrame({
      width: 1114,
      children: [makeText("short", { width: 50 })],
    });

    const wireframe = convertW2WToWireframe(pFrame as never, {
      layoutMode: "autoLayout",
    });

    const textNode = findTextNode(wireframe as WireframeNode, "p");
    expect(textNode!.width).toBe(1114); // element width still there
    expect(textNode!.renderedTextWidth).toBe(50); // new field, no overwrite
  });
});

describe("text.ts — resolveFillrTargetWidth", () => {
  it("prefers renderedTextWidth when narrower than element width", () => {
    // Pricing-page scenario: <p width=1114> with text that only spans 556px
    expect(resolveFillrTargetWidth(1114, 556)).toBe(556);
  });

  it("clamps renderedTextWidth to element width when larger (overflow guard)", () => {
    // Text overflowing its container (rare, but possible)
    expect(resolveFillrTargetWidth(800, 1200)).toBe(800);
  });

  it("falls back to element width when renderedTextWidth is undefined", () => {
    expect(resolveFillrTargetWidth(1114, undefined)).toBe(1114);
  });

  it("falls back to element width when renderedTextWidth is 0", () => {
    expect(resolveFillrTargetWidth(1114, 0)).toBe(1114);
  });

  it("falls back to 100px minimum when element width is 0 or null", () => {
    // Mirrors original FILLR behavior: `Math.max(node.width || 100, 1)`.
    expect(resolveFillrTargetWidth(0, undefined)).toBe(100);
  });

  it("returns renderedTextWidth equal to element width unchanged", () => {
    expect(resolveFillrTargetWidth(500, 500)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Integration: FILLR rendering keeps FRAME width = elementWidth so native
// textAlignHorizontal (center/left/right) can position the trimmed content.
// ---------------------------------------------------------------------------

function makeTextWireframeNode(overrides?: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test",
    name: "text",
    type: "text",
    tag: "h2",
    x: 0,
    y: 0,
    width: 1440,
    height: 29,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "Questions about billing or purchases?",
    fontSize: 24,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "center",
    lineHeight: 29,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

function makeFillrContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      text: "#000000",
      background: "#FFFFFF",
      secondary: "#888888",
      surface: "#CCCCCC",
      accent: "#0066CC",
    },
    fontFamily: "Inter",
    fontMode: "lines",
    colorMode: "plugin",
    textMode: "original",
    assetMode: "placeholders",
    layoutMode: "absolute",
    variableMode: "direct",
    interactionMode: "none",
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
    ...overrides,
  } as unknown as RenderContext;
}

describe("FILLR rendering — frame width preserves elementWidth for alignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("centered <h2>: FRAME stays at elementWidth (1440), not renderedTextWidth (535)", async () => {
    const node = makeTextWireframeNode({
      width: 1440,
      renderedTextWidth: 535,
      textAlign: "center",
    });

    const textNode = (await createTextNode(
      node,
      "Inter",
      makeFillrContext(),
    )) as unknown as MockText;

    expect(textNode).not.toBeNull();
    // Frame must span the full element width so Figma's native
    // textAlignHorizontal centers the trimmed FILLR content within it.
    expect(textNode.width).toBe(1440);
    expect(textNode.textAlignHorizontal).toBe("CENTER");
  });

  it("left-aligned <p>: FRAME stays at elementWidth; content aligns left", async () => {
    const node = makeTextWireframeNode({
      tag: "p",
      width: 1114,
      renderedTextWidth: 556,
      textAlign: "left",
    });

    const textNode = (await createTextNode(
      node,
      "Inter",
      makeFillrContext(),
    )) as unknown as MockText;

    expect(textNode).not.toBeNull();
    expect(textNode.width).toBe(1114);
    expect(textNode.textAlignHorizontal).toBe("LEFT");
  });

  it("right-aligned: FRAME stays at elementWidth; content aligns right", async () => {
    const node = makeTextWireframeNode({
      width: 1000,
      renderedTextWidth: 400,
      textAlign: "right",
    });

    const textNode = (await createTextNode(
      node,
      "Inter",
      makeFillrContext(),
    )) as unknown as MockText;

    expect(textNode).not.toBeNull();
    expect(textNode.width).toBe(1000);
    expect(textNode.textAlignHorizontal).toBe("RIGHT");
  });

  it("no renderedTextWidth: falls back to elementWidth (unchanged legacy behavior)", async () => {
    const node = makeTextWireframeNode({
      width: 800,
      textAlign: "left",
      // renderedTextWidth intentionally undefined
    });

    const textNode = (await createTextNode(
      node,
      "Inter",
      makeFillrContext(),
    )) as unknown as MockText;

    expect(textNode).not.toBeNull();
    expect(textNode.width).toBe(800);
  });
});
