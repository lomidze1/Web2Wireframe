/**
 * Defect 3 (h2d parity): a box-shadow on a node with NO background has
 * nothing for Figma to cast from — the shadow silently disappears (every
 * shadow attached to a transparent wrapper).
 *
 * Port of h2d's guard (`yD` app.js:47021): when a frame ends up with a
 * DROP_SHADOW / INNER_SHADOW effect and an empty fills array, inject a
 * single nearly-invisible solid fill — rgba(255, 255, 255, 0.002) — so
 * Figma rasterizes something to cast from. Never touch a frame that
 * already has any fill.
 */
import { describe, it, expect, vi } from "vitest";

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  effects: unknown[];
  children: MockNode[];
  layoutMode: string;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

function createMockFrameNode(): MockNode {
  return {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [], effects: [], children: [],
    layoutMode: "NONE",
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) { this._pluginData[key] = value; },
    getPluginData(key: string) { return this._pluginData[key] ?? ""; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild(child: MockNode) { this.children.push(child); },
  };
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT", appendChild() {} })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext, WireframeNode, FigmaEffect } from "../types";

function makeNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "n1",
    name: "shadow-wrapper",
    type: "frame",
    tag: "div",
    x: 0, y: 0, width: 200, height: 100,
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
    children: [],
    ...overrides,
  } as WireframeNode;
}

function mockContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    fontsToLoad: new Set(),
    layoutMode: "autoLayout",
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "none",
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
    pluginFont: { family: "Inter", weight: 400 },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
    ...overrides,
  } as unknown as RenderContext;
}

const dropShadow: FigmaEffect = {
  type: "DROP_SHADOW",
  visible: true,
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  offset: { x: 0, y: 4 },
  radius: 8,
  spread: 0,
};

describe("ghost fill under shadows (h2d yD port)", () => {
  it("drop shadow on a fill-less frame injects one nearly-invisible white fill", async () => {
    const frame = (await createNodeInFigma(
      makeNode({ effects: [dropShadow] }),
      mockContext(),
    )) as unknown as MockNode;
    expect(frame).not.toBeNull();
    expect(frame.fills).toHaveLength(1);
    const fill = frame.fills[0] as SolidPaint;
    expect(fill.type).toBe("SOLID");
    expect(fill.color).toEqual({ r: 1, g: 1, b: 1 });
    expect(fill.opacity).toBeCloseTo(0.002, 6);
  });

  it("inner shadow on a fill-less frame also gets the ghost fill", async () => {
    const frame = (await createNodeInFigma(
      makeNode({
        effects: [{
          type: "INNER_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.3 },
          offset: { x: 0, y: 2 },
          radius: 4,
        }],
      }),
      mockContext(),
    )) as unknown as MockNode;
    expect(frame.fills).toHaveLength(1);
    expect((frame.fills[0] as SolidPaint).opacity).toBeCloseTo(0.002, 6);
  });

  it("a frame that already has a fill is untouched", async () => {
    const frame = (await createNodeInFigma(
      makeNode({
        effects: [dropShadow],
        fills: [{
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
        }],
      }),
      mockContext(),
    )) as unknown as MockNode;
    expect(frame.fills).toHaveLength(1);
    expect((frame.fills[0] as SolidPaint).opacity).not.toBeCloseTo(0.002, 6);
  });

  it("blur-only effects do not trigger the ghost fill", async () => {
    const frame = (await createNodeInFigma(
      makeNode({
        effects: [{ type: "LAYER_BLUR", visible: true, blurRadius: 10 }],
      }),
      mockContext(),
    )) as unknown as MockNode;
    expect(frame.fills).toHaveLength(0);
  });

  it("plugin-colors mode strips shadows, so no ghost fill either", async () => {
    const frame = (await createNodeInFigma(
      makeNode({ effects: [dropShadow] }),
      mockContext({ colorMode: "plugin" } as Partial<RenderContext>),
    )) as unknown as MockNode;
    expect(frame.fills).toHaveLength(0);
  });
});
