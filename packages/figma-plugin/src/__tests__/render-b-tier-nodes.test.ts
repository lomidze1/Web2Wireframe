/**
 * B4 — application side in nodes.ts: cssMinWidth / cssMinHeight /
 * cssMaxHeight land as native Figma minWidth / minHeight / maxHeight on
 * auto-layout children (cssMaxWidth already worked).
 */
import { describe, it, expect, vi } from "vitest";

interface MockFrame {
  type: string;
  name: string;
  width: number;
  height: number;
  fills: unknown[];
  children: MockFrame[];
  layoutMode: string;
  layoutSizingHorizontal: string;
  layoutSizingVertical: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resize(w: number, h: number): void;
  appendChild(child: MockFrame): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
}

function createMockFrameNode(): MockFrame {
  return {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [] as unknown[], strokes: [] as unknown[], effects: [] as unknown[],
    dashPattern: [] as number[],
    children: [] as MockFrame[],
    layoutMode: "NONE",
    layoutWrap: "NO_WRAP",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    // Real FrameNodes always expose these (null/undefined until set) — the
    // renderer feature-detects them with the `in` operator.
    minWidth: undefined as number | undefined,
    minHeight: undefined as number | undefined,
    maxWidth: undefined as number | undefined,
    maxHeight: undefined as number | undefined,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    itemSpacing: 0,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    clipsContent: true,
    opacity: 1,
    visible: true,
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) {
      (this as unknown as { _pluginData: Record<string, string> })._pluginData[key] = value;
    },
    getPluginData(key: string) {
      return (this as unknown as { _pluginData: Record<string, string> })._pluginData[key] ?? "";
    },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild(child: MockFrame) { this.children.push(child); },
  } as unknown as MockFrame;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT" })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext, WireframeNode } from "../types";

function makeNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "n1",
    name: "node",
    type: "frame",
    tag: "div",
    x: 0, y: 0, width: 400, height: 200,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "rgb(0, 0, 0)",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Arial",
    textAlign: "left",
    lineHeight: "normal",
    letterSpacing: 0,
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

describe("B4: native min/max sizes on auto-layout children", () => {
  it("applies minWidth / minHeight / maxHeight from the wireframe node", async () => {
    const parent = makeNode({
      id: "p", name: "parent", layoutMode: "VERTICAL",
      children: [
        makeNode({
          id: "c", name: "hero",
          width: 400, height: 500,
          cssMinWidth: 220,
          cssMinHeight: 480,
          cssMaxHeight: 600,
        }),
      ],
    });
    const frame = (await createNodeInFigma(parent, mockContext(), 0)) as unknown as MockFrame;
    const hero = frame.children[0];
    expect(hero.minWidth).toBe(220);
    expect(hero.minHeight).toBe(480);
    expect(hero.maxHeight).toBe(600);
  });

  it("leaves min/max unset when the node carries none", async () => {
    const parent = makeNode({
      id: "p", name: "parent", layoutMode: "VERTICAL",
      children: [makeNode({ id: "c", name: "plain" })],
    });
    const frame = (await createNodeInFigma(parent, mockContext(), 0)) as unknown as MockFrame;
    const child = frame.children[0];
    expect(child.minWidth).toBeUndefined();
    expect(child.minHeight).toBeUndefined();
    expect(child.maxHeight).toBeUndefined();
  });
});
