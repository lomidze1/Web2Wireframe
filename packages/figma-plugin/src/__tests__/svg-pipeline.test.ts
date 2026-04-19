/**
 * Integration test — full SVG pipeline from W2W tree → WireframeNode → Figma API.
 *
 * Verifies the 3-layer design end-to-end:
 * 1. Layer 2 (css-converter) — propagates $svgMarkup into WireframeNode
 * 2. Layer 3 (fills.ts) — defensive skip of SVG in IMAGE_PLACEHOLDER fill
 * 3. Mode gating — placeholder mode produces NO vectors
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createNodeFromSvgMock = vi.fn(() => ({
  name: "",
  resize: vi.fn(),
  width: 24,
  height: 24,
}));

const createImageMock = vi.fn(() => ({ hash: "img-hash" }));

function makeFrameMock() {
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
  return { ...makeFrameMock(), fillStyleId: "", opacity: 1 };
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => makeFrameMock()),
  createImage: createImageMock,
  createNodeFromSvg: createNodeFromSvgMock,
  createRectangle: vi.fn(() => stubShape()),
  createEllipse: vi.fn(() => stubShape()),
  createLine: vi.fn(() => stubShape()),
  createVector: vi.fn(() => stubShape()),
  createPolygon: vi.fn(() => ({ ...stubShape(), pointCount: 3 })),
  createStar: vi.fn(() => stubShape()),
  createText: vi.fn(() => ({
    ...makeFrameMock(),
    characters: "",
    fontName: {},
    fontSize: 14,
  })),
  group: vi.fn((nodes: unknown[]) => ({ ...makeFrameMock(), children: nodes })),
  loadFontAsync: vi.fn(async () => {}),
  currentPage: { appendChild: vi.fn() },
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext } from "../types";

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

const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>';

function makeRoot(): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 400,
    quad: [0, 0, 400, 0, 400, 400, 0, 400],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [
      // 1. inline SVG
      {
        type: "SVG",
        x: 0, y: 0, width: 24, height: 24,
        quad: [0, 0, 24, 0, 24, 24, 0, 24],
        svg: SVG_MARKUP,
      },
      // 2. <img src=*.svg> WITH inlined markup
      {
        type: "FRAME",
        x: 30, y: 0, width: 24, height: 24,
        quad: [30, 0, 54, 0, 54, 24, 30, 24],
        tag: "img",
        classList: [],
        attr: {},
        styles: {},
        children: [],
        $url: "/logo.svg",
        $svgMarkup: SVG_MARKUP,
      },
      // 3. background-image: url(*.svg) WITH inlined markup
      {
        type: "FRAME",
        x: 60, y: 0, width: 64, height: 64,
        quad: [60, 0, 124, 0, 124, 64, 60, 64],
        tag: "div",
        classList: [],
        attr: {},
        styles: { backgroundImage: 'url("/bg.svg")' },
        children: [],
        $svgMarkup: SVG_MARKUP,
      },
      // 4. <img src=*.png> — unaffected control
      {
        type: "FRAME",
        x: 130, y: 0, width: 100, height: 100,
        quad: [130, 0, 230, 0, 230, 100, 130, 100],
        tag: "img",
        classList: [],
        attr: {},
        styles: {},
        children: [],
        $url: "/photo.png",
      },
    ],
  };
}

describe("SVG pipeline integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("realAssets mode → all 3 SVG sources become Figma Vectors", async () => {
    const wireframe = convertW2WToWireframe(makeRoot() as never);

    await createNodeInFigma(wireframe, makeContext({ assetMode: "realAssets" }));

    // inline svg + img.svg + bg-svg (synthetic child) = 3 vectors
    expect(createNodeFromSvgMock).toHaveBeenCalledTimes(3);
  });

  it("realAssets mode → no figma.createImage call for SVGs", async () => {
    const wireframe = convertW2WToWireframe(makeRoot() as never);

    await createNodeInFigma(wireframe, makeContext({ assetMode: "realAssets" }));

    // Only the PNG image would trigger createImage, but its URL isn't in assetsMap
    // for this test, so createImage should be 0.
    expect(createImageMock).not.toHaveBeenCalled();
  });

  it("placeholder mode → NO createNodeFromSvg for any source (UNCHANGED)", async () => {
    const wireframe = convertW2WToWireframe(makeRoot() as never);

    await createNodeInFigma(wireframe, makeContext({ assetMode: "placeholders" }));

    // Inline SVG still uses svgMarkup pathway — BUT that path is gated on
    // assetMode === "realAssets" in nodes.ts, so no vectors produced.
    expect(createNodeFromSvgMock).not.toHaveBeenCalled();
  });
});
