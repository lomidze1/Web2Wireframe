/**
 * Batch A of the import-report warnings: the losses a designer notices first.
 *
 * Every one of these paths already kept the import alive with a fallback — a
 * grey box for a missing image, a single stacked column for a failed grid, an
 * empty frame for an iframe — and none of them told anyone. Each warning here
 * is pinned twice: it fires when the output really differs from the page,
 * and it stays quiet when it doesn't. A report that cries wolf gets ignored.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let idCounter = 0;
let gridThrows = false;
let createTextThrows = false;

function makeFrame(): Record<string, unknown> {
  const frame: Record<string, unknown> = {
    id: `9:${++idCounter}`,
    name: "",
    fills: [] as unknown[],
    strokes: [] as unknown[],
    effects: [] as unknown[],
    children: [] as unknown[],
    clipsContent: false,
    cornerRadius: 0,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    resize: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
    setPluginData: vi.fn(),
    getPluginData: vi.fn(() => ""),
  };
  let layoutMode = "NONE";
  Object.defineProperty(frame, "layoutMode", {
    get: () => layoutMode,
    set: (v: string) => {
      if (v === "GRID" && gridThrows) throw new Error("Grid API unavailable");
      layoutMode = v;
    },
    enumerable: true,
  });
  return frame;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => makeFrame()),
  createImage: vi.fn(() => ({ hash: "mock-image-hash" })),
  createNodeFromSvg: vi.fn(() => ({ ...makeFrame(), resize: vi.fn() })),
  createRectangle: vi.fn(() => makeFrame()),
  createEllipse: vi.fn(() => makeFrame()),
  createLine: vi.fn(() => makeFrame()),
  createVector: vi.fn(() => makeFrame()),
  createPolygon: vi.fn(() => ({ ...makeFrame(), pointCount: 3 })),
  createStar: vi.fn(() => makeFrame()),
  createText: vi.fn(() => {
    if (createTextThrows) throw new Error("createText failed");
    return { ...makeFrame(), characters: "", fontName: {}, fontSize: 14 };
  }),
  group: vi.fn((nodes: unknown[]) => ({ ...makeFrame(), children: nodes })),
  loadFontAsync: vi.fn(async () => {}),
  currentPage: { appendChild: vi.fn() },
  mixed: Symbol("figma.mixed"),
});

import { createNodeInFigma } from "../rendering/nodes";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode, RenderContext, ImportWarning } from "../types";

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
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
    assetsMap: new Map(),
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

function makeNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "n-1", name: "Box", type: "frame", tag: "div",
    x: 0, y: 0, width: 600, height: 400,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#000", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, isPlaceholder: false, textContent: "",
    fontSize: 14, fontWeight: 400, fontFamily: "Inter",
    textAlign: "left", lineHeight: 1.5, letterSpacing: 0,
    children: [],
    ...overrides,
  } as WireframeNode;
}

const warningsOf = (context: RenderContext): ImportWarning[] =>
  context.renderStats?.warnings ?? [];

const QUAD = [0, 0, 600, 0, 600, 400, 0, 400];

function box(tag: string, styles: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  return {
    type: "FRAME", tag, classList: [], attr: {},
    x: 0, y: 0, width: 600, height: 400, quad: QUAD,
    styles: { display: "block", ...styles },
    children: [],
    ...extra,
  };
}

/** Convert a one-child scene and return the child's WireframeNode. */
function convertChild(child: Record<string, unknown>): WireframeNode {
  const scene = box("div", {}, { children: [child] });
  const wf = convertW2WToWireframe(scene as never, { layoutMode: "absolute" });
  return wf.children![0];
}

beforeEach(() => {
  idCounter = 0;
  gridThrows = false;
  createTextThrows = false;
});

// ---------------------------------------------------------------------------
// Converter-level detection → node.pendingWarnings
// ---------------------------------------------------------------------------

describe("CSS filter functions Figma can't draw", () => {
  it("flags each unsupported function (the white-logo recipe)", () => {
    const node = convertChild(
      box("img", { filter: "brightness(0) invert(1)" }, { $url: "https://x.com/logo.png" }),
    );
    const messages = (node.pendingWarnings ?? []).map((w) => w.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('"brightness()"');
    expect(messages[1]).toContain('"invert()"');
  });

  it("stays quiet for supported functions and identity values", () => {
    const node = convertChild(
      box(
        "img",
        {
          filter:
            "blur(4px) drop-shadow(rgba(0, 0, 0, 0.5) 0px 1px 2px) grayscale(1) " +
            "brightness(1) saturate(100%) hue-rotate(0deg) invert(0)",
        },
        { $url: "https://x.com/logo.png" },
      ),
    );
    expect(node.pendingWarnings).toBeUndefined();
  });
});

describe("embedded content", () => {
  it("flags an <iframe> as left empty", () => {
    const node = convertChild(box("iframe"));
    expect(node.pendingWarnings).toHaveLength(1);
    expect(node.pendingWarnings![0].category).toBe("image");
    expect(node.pendingWarnings![0].message).toMatch(/iframe/i);
  });

  it("ignores a tracking-pixel iframe nobody would miss", () => {
    const node = convertChild(box("iframe", {}, { width: 1, height: 1, quad: [0, 0, 1, 0, 1, 1, 0, 1] }));
    expect(node.pendingWarnings).toBeUndefined();
  });

  it("flags a <canvas> whose bitmap was never captured — real-assets only", () => {
    const node = convertChild(box("canvas"));
    expect(node.pendingWarnings).toHaveLength(1);
    expect(node.pendingWarnings![0].message).toMatch(/canvas/i);
    expect(node.pendingWarnings![0].realAssetsOnly).toBe(true);
  });

  it("stays quiet for a <canvas> that did ship its bitmap", () => {
    const node = convertChild(
      box("canvas", {}, { $url: "data:image/png;base64,iVBORw0KGgo=" }),
    );
    expect(node.pendingWarnings).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Render-level emission
// ---------------------------------------------------------------------------

describe("pendingWarnings reach the report with a layer to click", () => {
  it("emits each pending warning against the created node", async () => {
    const context = makeContext();
    const created = await createNodeInFigma(
      makeNode({ name: "Map", pendingWarnings: [{ category: "image", message: "Embedded" }] }),
      context,
    );
    const warnings = warningsOf(context);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe("Embedded");
    expect(warnings[0].nodeId).toBe((created as unknown as { id: string }).id);
  });

  it("drops a real-assets-only warning in placeholders mode", async () => {
    const context = makeContext({ assetMode: "placeholders" });
    await createNodeInFigma(
      makeNode({
        pendingWarnings: [{ category: "image", message: "Canvas", realAssetsOnly: true }],
      }),
      context,
    );
    expect(warningsOf(context)).toHaveLength(0);
  });
});

describe("image that never arrived", () => {
  const img = () =>
    makeNode({
      name: "Hero photo", type: "placeholder", isPlaceholder: true, tag: "img",
      imageUrl: "https://stripe.com/img/hero.png",
    });

  it("warns when real assets were asked for and the image is missing", async () => {
    const context = makeContext();
    await createNodeInFigma(img(), context);
    const warnings = warningsOf(context);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].category).toBe("image");
    expect(warnings[0].message).toMatch(/couldn't be loaded/);
    expect(warnings[0].nodeId).toBeDefined();
  });

  it("stays quiet in placeholders mode — the grey box IS the design", async () => {
    const context = makeContext({ assetMode: "placeholders" });
    await createNodeInFigma(img(), context);
    expect(warningsOf(context)).toHaveLength(0);
  });

  it("stays quiet when the image is in the assets map", async () => {
    const context = makeContext({
      assetsMap: new Map([
        ["https://stripe.com/img/hero.png", "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"],
      ]),
    });
    await createNodeInFigma(img(), context);
    expect(warningsOf(context)).toHaveLength(0);
  });
});

describe("CSS grid fallback", () => {
  const grid = () => makeNode({ name: "Features", layoutMode: "GRID" });

  it("warns when the Grid API fails and the grid is stacked into one column", async () => {
    gridThrows = true;
    const context = makeContext({ layoutMode: "autoLayout" });
    await createNodeInFigma(grid(), context);
    const layout = warningsOf(context).filter((w) => w.category === "layout");
    expect(layout).toHaveLength(1);
    expect(layout[0].message).toMatch(/grid/i);
    expect(layout[0].nodeId).toBeDefined();
  });

  it("stays quiet when the grid applies", async () => {
    const context = makeContext({ layoutMode: "autoLayout" });
    await createNodeInFigma(grid(), context);
    expect(warningsOf(context).filter((w) => w.category === "layout")).toHaveLength(0);
  });
});

describe("a frame's own text", () => {
  const withText = () => makeNode({ name: "Price", textContent: "$16 / month" });

  it("warns when the text node can't be created — the text is gone", async () => {
    createTextThrows = true;
    const context = makeContext();
    await createNodeInFigma(withText(), context);
    const typo = warningsOf(context).filter((w) => w.category === "typography");
    expect(typo).toHaveLength(1);
    expect(typo[0].message).toMatch(/Text couldn't be rendered/);
    expect(typo[0].layerName).toBe("Price");
  });

  it("stays quiet when the text renders", async () => {
    const context = makeContext();
    await createNodeInFigma(withText(), context);
    expect(warningsOf(context).filter((w) => w.category === "typography")).toHaveLength(0);
  });
});
