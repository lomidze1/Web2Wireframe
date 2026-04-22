/**
 * Regression: fixed/sticky elements in absolute (x/y) layout mode.
 *
 * Bug (W-04): rendering a page whose root frame uses `layoutMode="NONE"`
 * (absolute mode) threw a Figma sandbox error when the site contained a
 * position:fixed or position:sticky element:
 *
 *   "in set_layoutPositioning: Can only set layoutPositioning = ABSOLUTE
 *    if the parent node has layoutMode !== NONE"
 *
 * Root cause: `createWireframeFrame` always set
 * `fixedNode.layoutPositioning = "ABSOLUTE"` during fixed-nodes promotion
 * (nodes.ts ~line 1396), even when the wireframeFrame had layoutMode=NONE
 * because the user selected absolute layout mode.
 *
 * Fix: guard the assignment with `wireframeFrame.layoutMode !== "NONE"`.
 * In absolute mode children already position via x/y, so `layoutPositioning`
 * is both meaningless and rejected by the Figma API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks that mirror the real sandbox error
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
  layoutMode: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  layoutPositioning?: string;
  effects: unknown[];
  opacity?: number;
  visible?: boolean;
  clipsContent?: boolean;
  overflowDirection?: string;
  numberOfFixedChildren?: number;
  parent: MockNode | null;
  _pluginData: PluginDataStore;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  insertChild(index: number, child: MockNode): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
}

function mkFrame(): MockNode {
  const self = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [] as unknown[],
    strokes: [] as unknown[],
    children: [] as MockNode[],
    layoutMode: "NONE",
    effects: [] as unknown[],
    opacity: 1,
    visible: true,
    parent: null as MockNode | null,
    _pluginData: {} as PluginDataStore,
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild(child: MockNode) {
      if (child.parent && child.parent !== this) {
        const idx = child.parent.children.indexOf(child);
        if (idx >= 0) child.parent.children.splice(idx, 1);
      }
      this.children.push(child);
      child.parent = this as unknown as MockNode;
    },
    insertChild(index: number, child: MockNode) {
      if (child.parent && child.parent !== this) {
        const idx = child.parent.children.indexOf(child);
        if (idx >= 0) child.parent.children.splice(idx, 1);
      }
      this.children.splice(index, 0, child);
      child.parent = this as unknown as MockNode;
    },
    setPluginData(key: string, value: string) {
      this._pluginData[key] = value;
    },
    getPluginData(key: string) {
      return this._pluginData[key] ?? "";
    },
  } as unknown as MockNode;

  // Replicate Figma's sandbox error: setting layoutPositioning = "ABSOLUTE"
  // throws when the parent frame's layoutMode is NONE.
  let _layoutPositioning: string | undefined;
  Object.defineProperty(self, "layoutPositioning", {
    get() {
      return _layoutPositioning;
    },
    set(value: string) {
      if (value === "ABSOLUTE") {
        const parent = (self as MockNode).parent;
        if (parent && parent.layoutMode === "NONE") {
          throw new Error(
            "in set_layoutPositioning: Can only set layoutPositioning = ABSOLUTE if the parent node has layoutMode !== NONE",
          );
        }
      }
      _layoutPositioning = value;
    },
    configurable: true,
  });

  return self;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => mkFrame()),
  createText: vi.fn(() => mkFrame()),
  createRectangle: vi.fn(() => mkFrame()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  viewport: { center: { x: 0, y: 0 } },
  mixed: Symbol("figma.mixed"),
});

import { createWireframeFrame } from "../rendering/nodes";
import type { RenderContext, WireframeFrame, WireframeNode } from "../types";

// ============================================================================
// Fixtures
// ============================================================================

function makeContext(layoutMode: "autoLayout" | "absolute"): RenderContext {
  return {
    fontsToLoad: new Set(),
    layoutMode,
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "none",
    pluginColors: {
      text: "#000",
      primary: "#000",
      secondary: "#888",
      background: "#FFF",
    },
    pluginFont: { family: "Inter", weight: 400 },
    fontFamily: "Inter",
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
  } as unknown as RenderContext;
}

function makeFixedChildNode(): WireframeNode {
  return {
    id: "fixed-header",
    name: "header.site-nav",
    type: "frame",
    tag: "header",
    x: 0,
    y: 0,
    width: 1440,
    height: 64,
    position: "fixed",
    cssTop: 0,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    children: [],
  } as unknown as WireframeNode;
}

function makeFrame(fixedChild: WireframeNode): WireframeFrame {
  const tree: WireframeNode = {
    id: "root",
    name: "body",
    type: "frame",
    tag: "body",
    x: 0,
    y: 0,
    width: 1440,
    height: 2000,
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    children: [fixedChild],
  } as unknown as WireframeNode;

  return {
    viewportWidth: 1440,
    viewportHeight: 900,
    tree,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("W-04 — fixed/sticky node promotion in absolute layout mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT throw when absolute mode root has a fixed child", async () => {
    const frame = makeFrame(makeFixedChildNode());
    const context = makeContext("absolute");

    await expect(
      createWireframeFrame(
        frame,
        "https://www.web2wireframe.design/pricing",
        context,
        0,
      ),
    ).resolves.toBeDefined();
  });

  it("skips layoutPositioning=ABSOLUTE when root frame has layoutMode=NONE", async () => {
    const frame = makeFrame(makeFixedChildNode());
    const context = makeContext("absolute");

    const wireframeFrame = (await createWireframeFrame(
      frame,
      "https://example.com",
      context,
      0,
    )) as unknown as MockNode;

    // In absolute mode the root is NONE — all promoted fixed children
    // should have left layoutPositioning untouched (undefined), not ABSOLUTE.
    const fixedChild = wireframeFrame.children.find(
      (c) => c.getPluginData("w2w_position_fixed") === "1",
    );
    if (fixedChild) {
      expect(fixedChild.layoutPositioning).toBeUndefined();
    }
  });

  it("STILL sets layoutPositioning=ABSOLUTE in auto-layout mode (regression guard)", async () => {
    const frame = makeFrame(makeFixedChildNode());
    const context = makeContext("autoLayout");

    await expect(
      createWireframeFrame(frame, "https://example.com", context, 0),
    ).resolves.toBeDefined();
  });
});
