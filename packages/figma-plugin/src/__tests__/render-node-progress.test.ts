/**
 * Real render progress.
 *
 * The frame-render band used to jump 30 → 85 in one silent leap, because
 * nothing between "start rendering" and "frame done" reported anything. Every
 * node the renderer creates passes through `createNodeInFigma`, so that single
 * funnel is where the counter belongs — with the tree's own node count
 * (`countNodes`, already used by the simplifier) as the denominator.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => makeMockFrame()),
  createText: vi.fn(() => ({ ...makeMockFrame(), type: "TEXT" })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

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
  opacity: number;
  children: MockNode[];
  layoutMode?: string;
  minWidth?: number | null;
  minHeight?: number | null;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

function makeMockFrame(): MockNode {
  return {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    effects: [],
    opacity: 1,
    children: [],
    layoutMode: "NONE",
    minWidth: null,
    minHeight: null,
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

import { createNodeInFigma } from "../rendering/nodes";
import { countNodes } from "../rendering/treeSimplify";
import {
  NODE_EMIT_EVERY,
  shouldEmitNodeProgress,
  nodeProgressPercent,
  NODE_BAND_START,
} from "../utils/importProgress";
import type { WireframeNode, RenderContext } from "../types";

function makeNode(name: string, overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: name,
    name,
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 400,
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

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    layoutMode: "absolute",
    colorMode: "website",
    textMode: "website",
    fontMode: "website",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "direct",
    fontFamily: "Inter",
    pluginColors: { text: "#000", primary: "#000", secondary: "#888", surface: "#FFF" },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
    cssVariables: [],
    ...overrides,
  } as unknown as RenderContext;
}

describe("countNodes", () => {
  it("counts the whole tree, root included", () => {
    const tree = makeNode("root", {
      children: [makeNode("a"), makeNode("b", { children: [makeNode("b1")] })],
    });
    expect(countNodes(tree)).toBe(4);
  });

  it("counts a leaf as one", () => {
    expect(countNodes(makeNode("only"))).toBe(1);
  });
});

describe("createNodeInFigma progress callback", () => {
  it("reports every node it renders", async () => {
    const onNodeRendered = vi.fn();
    const tree = makeNode("root", {
      children: [makeNode("a"), makeNode("b", { children: [makeNode("b1")] })],
    });

    await createNodeInFigma(tree, makeContext({ onNodeRendered }));

    expect(onNodeRendered).toHaveBeenCalledTimes(countNodes(tree));
  });

  it("renders fine without a callback (the sandbox may not attach one)", async () => {
    const tree = makeNode("root", { children: [makeNode("a")] });
    await expect(createNodeInFigma(tree, makeContext())).resolves.toBeTruthy();
  });
});

describe("shouldEmitNodeProgress", () => {
  it("throttles — one message per batch, not one per node", () => {
    let emitted = 0;
    for (let n = 1; n <= 1000; n++) if (shouldEmitNodeProgress(n)) emitted++;
    expect(emitted).toBe(1000 / NODE_EMIT_EVERY);
  });

  it("emits on the batch boundary", () => {
    expect(shouldEmitNodeProgress(NODE_EMIT_EVERY)).toBe(true);
    expect(shouldEmitNodeProgress(NODE_EMIT_EVERY - 1)).toBe(false);
  });
});

describe("nodeProgressPercent in the sandbox scale", () => {
  it("stays inside the frame band the milestones reserve for it", () => {
    // 25 is the "styles done" milestone, 85 the "frames done" one.
    expect(nodeProgressPercent(0, 500)).toBe(NODE_BAND_START);
    expect(nodeProgressPercent(500, 500)).toBeLessThan(85);
  });
});
