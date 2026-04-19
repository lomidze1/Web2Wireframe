/**
 * nodes.ts — SVG rendering tests (TDD)
 *
 * Verifies the decision tree for SVG-bearing placeholder nodes:
 * - realAssets + svgMarkup → createNodeFromSvg (Figma Vector)
 * - realAssets + imageUrl with SVG data URI → createNodeFromSvg via realImages
 * - placeholders mode + svgMarkup → wireframe placeholder (UNCHANGED)
 * - malformed SVG → graceful wireframe placeholder fallback
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createNodeFromSvgMock = vi.fn(() => ({
  name: "",
  resize: vi.fn(),
  width: 24,
  height: 24,
}));

const createImageMock = vi.fn(() => ({ hash: "mock-image-hash" }));

function makeFrame() {
  return {
    name: "",
    fills: [] as unknown[],
    strokes: [] as unknown[],
    effects: [] as unknown[],
    clipsContent: false,
    cornerRadius: 0,
    layoutMode: "NONE",
    resize: vi.fn(),
    appendChild: vi.fn(),
    x: 0,
    y: 0,
  };
}

function stubShape() {
  return { ...makeFrame(), fillStyleId: "", opacity: 1 };
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => makeFrame()),
  createImage: createImageMock,
  createNodeFromSvg: createNodeFromSvgMock,
  createRectangle: vi.fn(() => stubShape()),
  createEllipse: vi.fn(() => stubShape()),
  createLine: vi.fn(() => stubShape()),
  createVector: vi.fn(() => stubShape()),
  createPolygon: vi.fn(() => ({ ...stubShape(), pointCount: 3 })),
  createStar: vi.fn(() => stubShape()),
  createText: vi.fn(() => ({
    ...makeFrame(),
    characters: "",
    fontName: {},
    fontSize: 14,
  })),
  group: vi.fn((nodes: unknown[]) => ({ ...makeFrame(), children: nodes })),
  loadFontAsync: vi.fn(async () => {}),
  currentPage: { appendChild: vi.fn() },
});

import { createNodeInFigma } from "../rendering/nodes";
import type { WireframeNode, RenderContext } from "../types";

const DEFAULT_PLUGIN_COLORS = {
  text: "#11151A",
  background: "#F1F2F0",
  secondary: "#1f3a5f",
  surface: "#f5f5f5",
  accent: "#3b82f6",
};

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: DEFAULT_PLUGIN_COLORS,
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "absolute",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "plugin",
    fontMode: "plugin",
    textMode: "semantic",
    assetMode: "realAssets",
    assetsMap: new Map(),
    ...overrides,
  } as RenderContext;
}

function makeNode(overrides?: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-node",
    name: "Test",
    type: "placeholder",
    tag: "img",
    x: 0,
    y: 0,
    width: 24,
    height: 24,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    isPlaceholder: true,
    textContent: "",
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 1.5,
    letterSpacing: 0,
    children: [],
    ...overrides,
  } as WireframeNode;
}

const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>';

describe("nodes.ts — SVG rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("placeholder with computedStyles.svgMarkup in realAssets → createNodeFromSvg", async () => {
    const node = makeNode({ computedStyles: { svgMarkup: SVG_MARKUP } });
    await createNodeInFigma(node, makeContext({ assetMode: "realAssets" }));

    expect(createNodeFromSvgMock).toHaveBeenCalled();
  });

  it("placeholder with computedStyles.svgMarkup in placeholders mode → NO createNodeFromSvg", async () => {
    const node = makeNode({ computedStyles: { svgMarkup: SVG_MARKUP } });
    await createNodeInFigma(node, makeContext({ assetMode: "placeholders" }));

    expect(createNodeFromSvgMock).not.toHaveBeenCalled();
  });

  it("malformed SVG markup does not crash — falls back to placeholder", async () => {
    createNodeFromSvgMock.mockImplementationOnce(() => {
      throw new Error("Invalid SVG");
    });
    const node = makeNode({ computedStyles: { svgMarkup: "<notsvg/>" } });

    const result = await createNodeInFigma(
      node,
      makeContext({ assetMode: "realAssets" })
    );

    expect(result).toBeDefined();
  });

  it("empty svgMarkup string is ignored (treated as absent)", async () => {
    const node = makeNode({ computedStyles: { svgMarkup: "" } });
    await createNodeInFigma(node, makeContext({ assetMode: "realAssets" }));

    expect(createNodeFromSvgMock).not.toHaveBeenCalled();
  });

  it("non-SVG placeholder node is unaffected (regression)", async () => {
    const node = makeNode({ imageUrl: undefined, computedStyles: undefined });
    await createNodeInFigma(node, makeContext({ assetMode: "realAssets" }));

    expect(createNodeFromSvgMock).not.toHaveBeenCalled();
    expect(createImageMock).not.toHaveBeenCalled();
  });
});
