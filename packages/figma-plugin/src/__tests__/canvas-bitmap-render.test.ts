/**
 * A `<canvas>` ships its own bitmap, and it has to reach the page.
 *
 * The content script exports every canvas as a data URL and puts it straight
 * into the node's `$url` — there is no network resource behind it, so it is
 * the payload, not a pointer to one. Everything downstream, though, was built
 * for pointers: the extension's asset harvest looks each `$url` up in the CDP
 * resource map, a `data:` URL is never in it, so the canvas never lands in
 * `frame.assets` — and the renderer's gate is `assetsMap.has(node.imageUrl)`.
 *
 * Net effect before this: up to 12 MB per canvas was serialized into the tree,
 * POSTed, held in `pendingCDPImports` and pulled by the plugin, and then drawn
 * as a grey placeholder box. Every byte wasted.
 *
 * The fix is here rather than in the harvest on purpose: putting the bitmap in
 * `frame.assets` would store it a SECOND time (once as the map's key, once as
 * its value) on a payload already close to the API's 50 MB body limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createImageMock = vi.fn(() => ({ hash: "mock-image-hash" }));
const createNodeFromSvgMock = vi.fn(() => ({ name: "", resize: vi.fn(), width: 24, height: 24 }));

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
    remove: vi.fn(),
    setPluginData: vi.fn(),
    getPluginData: vi.fn(() => ""),
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
  createText: vi.fn(() => ({ ...makeFrame(), characters: "", fontName: {}, fontSize: 14 })),
  group: vi.fn((nodes: unknown[]) => ({ ...makeFrame(), children: nodes })),
  loadFontAsync: vi.fn(async () => {}),
  currentPage: { appendChild: vi.fn() },
  mixed: Symbol("figma.mixed"),
});

import { createNodeInFigma } from "../rendering/nodes";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode, RenderContext } from "../types";

/** A 1×1 PNG — small, but a real data URL of the shape a canvas exports. */
const CANVAS_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      text: "#11151A", background: "#F1F2F0", secondary: "#1f3a5f",
      surface: "#f5f5f5", accent: "#3b82f6",
    },
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
    // Deliberately EMPTY: the canvas is never in it, and that is the point.
    assetsMap: new Map(),
    ...overrides,
  } as RenderContext;
}

function makeNode(overrides?: Partial<WireframeNode>): WireframeNode {
  return {
    id: "canvas-1", name: "Canvas", type: "placeholder", tag: "canvas",
    x: 0, y: 0, width: 600, height: 400,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#000", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, isPlaceholder: true, textContent: "",
    fontSize: 14, fontWeight: 400, fontFamily: "Inter",
    textAlign: "left", lineHeight: 1.5, letterSpacing: 0,
    children: [],
    ...overrides,
  } as WireframeNode;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canvas bitmaps carry their own payload", () => {
  it("converts a <canvas> with a data URL into a placeholder that keeps it", () => {
    const scene = {
      type: "FRAME", tag: "div", classList: [], attr: {},
      x: 0, y: 0, width: 600, height: 400,
      quad: [0, 0, 600, 0, 600, 400, 0, 400],
      styles: { display: "block" },
      children: [
        {
          type: "FRAME", tag: "canvas", classList: ["chart"], attr: {},
          x: 0, y: 0, width: 600, height: 400,
          quad: [0, 0, 600, 0, 600, 400, 0, 400],
          styles: { display: "block" },
          children: [],
          $url: CANVAS_PNG,
        },
      ],
    };

    const wf = convertW2WToWireframe(scene as never, { layoutMode: "absolute" });
    const canvas = wf.children![0];

    expect(canvas.type).toBe("placeholder");
    expect(canvas.imageUrl).toBe(CANVAS_PNG);
  });

  it("paints the bitmap even though the assets map has never heard of it", async () => {
    await createNodeInFigma(makeNode({ imageUrl: CANVAS_PNG }), makeContext());

    expect(createImageMock).toHaveBeenCalled();
  });

  it("still draws a placeholder for a URL that really is missing", async () => {
    // The negative control. A remote image absent from the map is a genuine
    // miss — the whole point of the gate — and must stay a placeholder.
    await createNodeInFigma(
      makeNode({ tag: "img", imageUrl: "https://stripe.com/img/hero.png" }),
      makeContext(),
    );

    expect(createImageMock).not.toHaveBeenCalled();
  });

  it("honours placeholders mode — a canvas is an image like any other", async () => {
    await createNodeInFigma(
      makeNode({ imageUrl: CANVAS_PNG }),
      makeContext({ assetMode: "placeholders" }),
    );

    expect(createImageMock).not.toHaveBeenCalled();
  });

  it("prefers the assets map when it does hold the url", async () => {
    // A data URL that IS in the map (screenshot crops put one there) must go
    // on using the map's value, not the key.
    const mapped = new Map([[CANVAS_PNG, CANVAS_PNG]]);
    await createNodeInFigma(
      makeNode({ imageUrl: CANVAS_PNG }),
      makeContext({ assetsMap: mapped }),
    );

    expect(createImageMock).toHaveBeenCalled();
  });

  it("does not try to rasterize an SVG data URL through createImage", async () => {
    // `figma.createImage` throws on SVG; realImages routes those to
    // createNodeFromSvg instead. Pinned because the new branch widens what
    // reaches that function.
    const svgUrl = "data:image/svg+xml;base64,PHN2Zy8+";
    await createNodeInFigma(makeNode({ tag: "img", imageUrl: svgUrl }), makeContext());

    expect(createImageMock).not.toHaveBeenCalled();
  });
});
