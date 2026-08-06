/**
 * C1: the text / image / placeholder branches return before the frame path's
 * decoration block, so those node types silently lost opacity, blend mode,
 * hidden-in-default, the position:fixed marker — and, for images, their
 * border and box-shadow entirely.
 *
 * Also covers the dash-pattern scale fix and the wrapper clipsContent
 * default (Figma frames clip by default; an invented text wrapper must not
 * cut off glyph descenders).
 */
import { describe, it, expect, vi } from "vitest";

function createMockFrameNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [] as unknown[],
    strokes: [] as unknown[],
    effects: [] as unknown[],
    dashPattern: [] as number[],
    strokeWeight: 0,
    strokeTopWeight: 0, strokeRightWeight: 0,
    strokeBottomWeight: 0, strokeLeftWeight: 0,
    children: [] as unknown[],
    layoutMode: "NONE",
    layoutWrap: "NO_WRAP",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    primaryAxisSizingMode: "FIXED",
    counterAxisSizingMode: "FIXED",
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    itemSpacing: 0,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    clipsContent: true,
    opacity: 1,
    blendMode: "PASS_THROUGH",
    visible: true,
    cornerRadius: undefined,
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) {
      (node._pluginData as Record<string, string>)[key] = value;
    },
    getPluginData(key: string) {
      return (node._pluginData as Record<string, string>)[key] ?? "";
    },
    resize(w: number, h: number) { node.width = w; node.height = h; },
    appendChild(child: unknown) { (node.children as unknown[]).push(child); },
    remove() { /* noop */ },
  };
  return node;
}

function createMockShape(type: string): Record<string, unknown> {
  return { ...createMockFrameNode(), type };
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT", characters: "" })),
  createRectangle: vi.fn(() => createMockShape("RECTANGLE")),
  createEllipse: vi.fn(() => createMockShape("ELLIPSE")),
  createPolygon: vi.fn(() => createMockShape("POLYGON")),
  createVector: vi.fn(() => createMockShape("VECTOR")),
  group: vi.fn((nodes: unknown[]) => ({ ...createMockShape("GROUP"), children: nodes })),
  createImage: vi.fn(() => ({ hash: "mock" })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { createNodeInFigma, dashPatternForStyle } from "../rendering/nodes";
import type { RenderContext, WireframeNode } from "../types";

function makeNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "n1", name: "node", type: "frame", tag: "div",
    x: 0, y: 0, width: 200, height: 100,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "rgb(0, 0, 0)", borderColor: null,
    borderWidth: 0, borderRadius: 0, opacity: 1,
    textContent: "", fontSize: 16, fontWeight: 400,
    fontFamily: "Arial", textAlign: "left",
    lineHeight: "normal", letterSpacing: 0,
    ...overrides,
  } as WireframeNode;
}

function mockContext(): RenderContext {
  return {
    layoutMode: "autoLayout",
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "none",
    fontsToLoad: new Set(),
    fontFamily: "Inter",
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
    pluginFont: { family: "Inter", weight: 400 },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
  } as unknown as RenderContext;
}

describe("dashPatternForStyle", () => {
  it("scales dashes with the stroke weight", () => {
    expect(dashPatternForStyle("DASHED", 1)).toEqual([3, 2]);
    expect(dashPatternForStyle("DASHED", 4)).toEqual([12, 8]);
    expect(dashPatternForStyle("DOTTED", 3)).toEqual([3, 3]);
    expect(dashPatternForStyle("SOLID", 2)).toEqual([]);
  });

  it("never produces a zero-length dash", () => {
    expect(dashPatternForStyle("DASHED", 0)).toEqual([3, 2]);
  });
});

describe("placeholder/image decorations", () => {
  it("applies border and shadow to an image placeholder", async () => {
    const node = makeNode({
      type: "placeholder",
      tag: "img",
      isPlaceholder: true,
      strokes: [{
        color: { r: 1, g: 0, b: 0, a: 1 },
        weight: 2,
        style: "SOLID",
        position: "INSIDE",
      }],
      effects: [{
        type: "DROP_SHADOW",
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.4 },
        offset: { x: 0, y: 2 },
        radius: 6,
        spread: 0,
      }],
    } as Partial<WireframeNode>);

    const frame = (await createNodeInFigma(node, mockContext(), 0)) as unknown as
      Record<string, unknown>;
    expect((frame.strokes as unknown[]).length).toBe(1);
    expect(frame.strokeWeight).toBe(2);
    expect((frame.effects as unknown[]).length).toBe(1);
  });

  it("applies opacity and the sticky marker to a placeholder", async () => {
    const node = makeNode({
      type: "placeholder",
      tag: "img",
      isPlaceholder: true,
      opacity: 0.5,
      position: "sticky",
      cssTop: 12,
    } as Partial<WireframeNode>);

    const frame = (await createNodeInFigma(node, mockContext(), 0)) as unknown as
      Record<string, unknown> & { getPluginData(k: string): string };
    expect(frame.opacity).toBeCloseTo(0.5, 3);
    expect(frame.getPluginData("w2w_position_fixed")).toBe("1");
    expect(frame.getPluginData("w2w_css_top")).toBe("12");
  });

  it("hides a hidden-in-default placeholder", async () => {
    const node = makeNode({
      type: "placeholder", tag: "img", isPlaceholder: true,
      isHiddenInDefault: true,
    } as Partial<WireframeNode>);
    const frame = (await createNodeInFigma(node, mockContext(), 0)) as unknown as
      Record<string, unknown>;
    expect(frame.visible).toBe(false);
  });
});

describe("text wrapper clipping", () => {
  it("does not clip a text padding wrapper by default", async () => {
    const node = makeNode({
      type: "text",
      tag: "p",
      textContent: "Hello",
      padding: { top: 8, right: 0, bottom: 0, left: 12 },
    });
    const wrapper = (await createNodeInFigma(node, mockContext(), 0)) as unknown as
      Record<string, unknown>;
    expect(wrapper.clipsContent).toBe(false);
  });

  it("still clips when CSS says overflow:hidden", async () => {
    const node = makeNode({
      type: "text",
      tag: "p",
      textContent: "Hello",
      overflow: "hidden",
      padding: { top: 8, right: 0, bottom: 0, left: 12 },
    });
    const wrapper = (await createNodeInFigma(node, mockContext(), 0)) as unknown as
      Record<string, unknown>;
    expect(wrapper.clipsContent).toBe(true);
  });
});
