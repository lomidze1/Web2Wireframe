/**
 * DOM flow order must survive z-index in auto-layout rendering.
 *
 * telex.ge regression: `#tygh_main_container` is a plain block (converter
 * layoutMode "NONE") whose children are [header (z-index:5), content, footer].
 * In global autoLayout mode the renderer stacks such containers as VERTICAL
 * auto-layout — children are placed by FLOW order. The stacking sort used to
 * receive `node.layoutMode` ("NONE") and z-index-sorted the children as if
 * they were absolutely positioned, pushing the header to the page BOTTOM.
 *
 * The sort must receive the layout mode the frame will ACTUALLY use:
 * - autoLayout context → auto-layout (no z-index reordering)
 * - absolute context → NONE (z-index reordering is correct there)
 */
import { describe, it, expect, vi } from "vitest";

// Figma API mock — minimal surface for createNodeInFigma (see sticky-to-fixed).
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
  effects?: unknown[];
  opacity?: number;
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
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT", appendChild() {} })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import {
  effectiveStackingLayoutMode,
  sortChildrenForStacking,
  createNodeInFigma,
} from "../rendering/nodes";
import type { WireframeNode, RenderContext } from "../types";

function makeNode(name: string, overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 1440,
    height: 100,
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
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 1.2,
    letterSpacing: 0,
    children: [],
    isPlaceholder: false,
    ...overrides,
  } as WireframeNode;
}

const mockContext = {
  fontsToLoad: new Set(),
  layoutMode: "autoLayout",
  colorMode: "website",
  textMode: "original",
  fontMode: "original",
  assetMode: "placeholders",
  interactionMode: "none",
  variableMode: "none",
  pluginColors: { text: "#000", primary: "#000", secondary: "#888", background: "#FFF" },
  pluginFont: { family: "Inter", weight: 400 },
  colorStyleMap: new Map(),
  textStyleMap: new Map(),
  variableValueMap: new Map(),
} as unknown as RenderContext;

describe("effectiveStackingLayoutMode", () => {
  it("returns GRID when grid layout was applied", () => {
    expect(effectiveStackingLayoutMode(true, true, "NONE")).toBe("GRID");
  });

  it("returns NONE in absolute mode (no auto layout)", () => {
    expect(effectiveStackingLayoutMode(false, false, "VERTICAL")).toBe("NONE");
    expect(effectiveStackingLayoutMode(false, false, "NONE")).toBe("NONE");
  });

  it("maps block containers (NONE) to VERTICAL under auto layout", () => {
    expect(effectiveStackingLayoutMode(false, true, "NONE")).toBe("VERTICAL");
    expect(effectiveStackingLayoutMode(false, true, undefined)).toBe("VERTICAL");
  });

  it("keeps the node's own flex direction under auto layout", () => {
    expect(effectiveStackingLayoutMode(false, true, "HORIZONTAL")).toBe("HORIZONTAL");
    expect(effectiveStackingLayoutMode(false, true, "VERTICAL")).toBe("VERTICAL");
  });
});

describe("sortChildrenForStacking flow-order preservation", () => {
  const makeFlowChildren = () => [
    makeNode("header", { zIndex: 5 }),
    makeNode("content"),
    makeNode("footer"),
  ];

  it("does NOT reorder flow children by z-index in VERTICAL auto-layout", () => {
    const result = sortChildrenForStacking(makeFlowChildren(), "VERTICAL");
    expect(result.map((c) => c.name)).toEqual(["header", "content", "footer"]);
  });

  it("still z-index-sorts in absolute mode (NONE)", () => {
    const result = sortChildrenForStacking(makeFlowChildren(), "NONE");
    expect(result.map((c) => c.name)).toEqual(["content", "footer", "header"]);
  });
});

describe("createNodeInFigma keeps DOM order for block containers in autoLayout mode", () => {
  it("telex.ge regression: header (z-index:5) stays FIRST child", async () => {
    const container = makeNode("div#tygh_main_container", {
      layoutMode: "NONE", // plain display:block container
      height: 9600,
      children: [
        makeNode("div.tygh-header", { zIndex: 5, height: 140 }),
        makeNode("div.tygh-content", { height: 9200 }),
        makeNode("div#tygh_footer", { height: 260 }),
      ],
    });

    const rendered = (await createNodeInFigma(container, mockContext, 0)) as unknown as {
      children: Array<{ name: string }>;
    } | null;

    expect(rendered).not.toBeNull();
    expect(rendered!.children.map((c) => c.name)).toEqual([
      "div.tygh-header",
      "div.tygh-content",
      "div#tygh_footer",
    ]);
  });
});
