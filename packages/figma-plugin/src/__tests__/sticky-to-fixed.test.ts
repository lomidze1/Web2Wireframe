/**
 * Tests for sticky → fixed coercion in nodes.ts.
 *
 * Modern sites (web2wireframe.design, stripe.com, most design systems) use
 * `position: sticky` for headers that stay pinned while scrolling. Figma
 * has no native sticky/scroll behavior, but it DOES have fixed children
 * via `overflowDirection="VERTICAL"` + `numberOfFixedChildren`. We coerce
 * both `sticky` and `fixed` into the same pluginData tag so the fixed
 * re-parenting path in `createWireframeFrame` handles them uniformly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks — minimal surface needed by createNodeInFigma
// ============================================================================

interface PluginDataStore {
  [key: string]: string;
}

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  children: MockNode[];
  layoutMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  effects?: unknown[];
  opacity?: number;
  _pluginData: PluginDataStore;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

function createMockFrameNode(): MockNode {
  const node: MockNode = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    children: [],
    layoutMode: "NONE",
    effects: [],
    opacity: 1,
    _pluginData: {},
    setPluginData(key, value) {
      this._pluginData[key] = value;
    },
    getPluginData(key) {
      return this._pluginData[key] ?? "";
    },
    resize(w, h) {
      this.width = w;
      this.height = h;
    },
    appendChild(child) {
      this.children.push(child);
    },
  };
  return node;
}

function createMockTextNode(): MockNode {
  return {
    ...createMockFrameNode(),
    type: "TEXT",
    appendChild() { /* noop */ },
  };
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => createMockTextNode()),
  createRectangle: vi.fn(() => createMockFrameNode()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  mixed: Symbol("figma.mixed"),
});

// Import AFTER figma mock
import { convertW2WToWireframe } from "../rendering/css-converter";
import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext } from "../types";

// ============================================================================
// Fixtures
// ============================================================================

function makeStickyHeader(overrides: Record<string, unknown> = {}) {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 1440, height: 64,
    quad: [0, 0, 1440, 0, 1440, 64, 0, 64],
    tag: "header",
    classList: ["site-header"],
    attr: {},
    styles: {
      display: "flex",
      position: "sticky",
      top: "0px",
      zIndex: "10",
      backgroundColor: "rgba(255, 255, 255, 1)",
      ...(overrides.styles as Record<string, unknown> || {}),
    },
    children: [],
    ...overrides,
  };
}

function makeFixedHeader(overrides: Record<string, unknown> = {}) {
  return {
    ...makeStickyHeader(overrides),
    styles: {
      display: "flex",
      position: "fixed",
      top: "0px",
      zIndex: "9999",
      backgroundColor: "rgba(255, 255, 255, 1)",
      ...(overrides.styles as Record<string, unknown> || {}),
    },
  };
}

const mockContext: RenderContext = {
   
  fontsToLoad: new Set() as any,
  layoutMode: "autoLayout",
  colorMode: "website",
  textMode: "original",
  fontMode: "original",
  assetMode: "placeholders",
  interactionMode: "none",
  variableMode: "none",
   
  pluginColors: { text: "#000", primary: "#000", secondary: "#888", background: "#FFF" } as any,
  pluginFont: { family: "Inter", weight: 400 },
   
  colorStyleMap: new Map() as any,
   
  textStyleMap: new Map() as any,
  variableValueMap: new Map(),
   
} as any;

// ============================================================================
// Tests
// ============================================================================

describe("sticky → fixed coercion (nodes.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tags position:sticky frames with w2w_position_fixed pluginData", async () => {
     
    const wireframe = convertW2WToWireframe(makeStickyHeader() as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });

    const created = await createNodeInFigma(wireframe, mockContext);
    expect(created).not.toBeNull();

    const frame = created as unknown as MockNode;
    expect(frame.getPluginData("w2w_position_fixed")).toBe("1");
  });

  it("tags position:fixed frames with w2w_position_fixed pluginData (regression)", async () => {
     
    const wireframe = convertW2WToWireframe(makeFixedHeader() as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });

    const created = await createNodeInFigma(wireframe, mockContext);
    expect(created).not.toBeNull();

    const frame = created as unknown as MockNode;
    expect(frame.getPluginData("w2w_position_fixed")).toBe("1");
  });

  it("does NOT tag position:static frames", async () => {
    const staticHeader = makeStickyHeader({
      styles: { position: "static" },
    });
     
    const wireframe = convertW2WToWireframe(staticHeader as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });

    const created = await createNodeInFigma(wireframe, mockContext);
    expect(created).not.toBeNull();

    const frame = created as unknown as MockNode;
    expect(frame.getPluginData("w2w_position_fixed")).toBe("");
  });

  it("does NOT tag position:relative frames", async () => {
    const relativeHeader = makeStickyHeader({
      styles: { position: "relative" },
    });
     
    const wireframe = convertW2WToWireframe(relativeHeader as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });

    const created = await createNodeInFigma(wireframe, mockContext);
    expect(created).not.toBeNull();

    const frame = created as unknown as MockNode;
    expect(frame.getPluginData("w2w_position_fixed")).toBe("");
  });

  it("FIX D: persists cssTop as pluginData for sticky/fixed", async () => {
    const header = makeStickyHeader({
      styles: { position: "sticky", top: "10px" },
    });
     
    const wireframe = convertW2WToWireframe(header as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });
    expect((wireframe as unknown as { cssTop?: number }).cssTop).toBe(10);

    const created = await createNodeInFigma(wireframe, mockContext);
    expect(created).not.toBeNull();
    const frame = created as unknown as MockNode;
    expect(frame.getPluginData("w2w_css_top")).toBe("10");
  });

  it("FIX D: no cssTop pluginData when CSS top is 'auto'", async () => {
    const header = makeStickyHeader({
      styles: { position: "sticky", top: "auto" },
    });
     
    const wireframe = convertW2WToWireframe(header as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });
    expect((wireframe as unknown as { cssTop?: number }).cssTop).toBeUndefined();

    const created = await createNodeInFigma(wireframe, mockContext);
    const frame = created as unknown as MockNode;
    expect(frame.getPluginData("w2w_css_top")).toBe("");
  });

  it("FIX D: cssTop=0 for explicit 'top: 0px'", async () => {
    const header = makeStickyHeader({
      styles: { position: "sticky", top: "0px" },
    });
     
    const wireframe = convertW2WToWireframe(header as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });
    expect((wireframe as unknown as { cssTop?: number }).cssTop).toBe(0);
  });

  it("does NOT tag sticky frames with opacity:0 (hidden overlay guard)", async () => {
    const hiddenSticky = makeStickyHeader({
      styles: { position: "sticky", opacity: "0" },
      opacity: 0,
    });
     
    const wireframe = convertW2WToWireframe(hiddenSticky as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });
    // Force opacity:0 on the wireframe node (sometimes css-converter strips it)
    (wireframe as unknown as { opacity?: number }).opacity = 0;

    const created = await createNodeInFigma(wireframe, mockContext);
    // Hidden overlays may still create a frame but should NOT have the tag.
    if (created) {
      const frame = created as unknown as MockNode;
      expect(frame.getPluginData("w2w_position_fixed")).toBe("");
    }
  });
});
