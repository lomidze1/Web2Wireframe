/**
 * P0 render-fidelity fixes — nodes.ts level.
 *
 * A2: per-corner border radii were collapsed to Math.max() of the four
 *     corners (tabs / `rounded-t-lg` cards lost their flat bottom corners).
 * A4: `counterAxisAlignItems = "BASELINE"` on a non-HORIZONTAL frame and
 *     `layoutWrap = "WRAP"` on a HUG-width frame both throw in Figma — and
 *     the parent's per-child try/catch swallowed the throw, silently
 *     deleting the whole subtree.
 * A5: those swallowed throws were invisible in prod (logger is a no-op) —
 *     renderStats.droppedNodes now records every lost child.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockFrame {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  effects: unknown[];
  dashPattern: number[];
  children: MockFrame[];
  layoutMode: string;
  layoutSizingHorizontal: string;
  layoutSizingVertical: string;
  primaryAxisAlignItems: string;
  counterAxisAlignItems?: string;
  layoutWrap?: string;
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
  itemSpacing: number;
  counterAxisSpacing?: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  clipsContent: boolean;
  opacity: number;
  visible: boolean;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockFrame): void;
}

function createMockFrameNode(): MockFrame {
  const node = {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [] as unknown[], strokes: [] as unknown[], effects: [] as unknown[],
    dashPattern: [] as number[],
    children: [] as MockFrame[],
    layoutMode: "NONE",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    primaryAxisAlignItems: "MIN",
    itemSpacing: 0,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    clipsContent: true,
    opacity: 1,
    visible: true,
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) { this._pluginData[key] = value; },
    getPluginData(key: string) { return this._pluginData[key] ?? ""; },
    resize(w: number, h: number) {
      // Mirror Figma: resizing to a non-finite value throws.
      if (!Number.isFinite(w) || !Number.isFinite(h)) {
        throw new Error(`in resize: Expected number, got ${w}x${h}`);
      }
      this.width = w;
      this.height = h;
    },
    appendChild(child: MockFrame) { this.children.push(child); },
  } as unknown as MockFrame;

  // Mirror Figma: BASELINE is only valid on HORIZONTAL auto-layout frames.
  let counterAlign = "MIN";
  Object.defineProperty(node, "counterAxisAlignItems", {
    get: () => counterAlign,
    set: (value: string) => {
      if (value === "BASELINE" && node.layoutMode !== "HORIZONTAL") {
        throw new Error(
          "in set_counterAxisAlignItems: BASELINE requires layoutMode === HORIZONTAL",
        );
      }
      counterAlign = value;
    },
  });

  // Mirror Figma: WRAP requires HORIZONTAL layout and a non-AUTO primary axis.
  let wrap = "NO_WRAP";
  Object.defineProperty(node, "layoutWrap", {
    get: () => wrap,
    set: (value: string) => {
      if (value === "WRAP" && node.layoutMode !== "HORIZONTAL") {
        throw new Error(
          "in set_layoutWrap: Can only set layoutWrap = WRAP on nodes with layoutMode === HORIZONTAL",
        );
      }
      if (value === "WRAP" && node.layoutSizingHorizontal === "HUG") {
        throw new Error(
          "in set_layoutWrap: Cannot set layoutWrap = WRAP when primaryAxisSizingMode is AUTO",
        );
      }
      wrap = value;
    },
  });

  return node;
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
    x: 0, y: 0, width: 200, height: 100,
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
    renderStats: {
      hoverCacheHits: 0,
      hoverCacheMisses: 0,
      emptyPseudoSkipped: 0,
      pseudoErrors: 0,
      droppedNodes: [],
    },
  } as unknown as RenderContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A2: per-corner border radius", () => {
  it("applies asymmetric radii per corner instead of Math.max on all four", async () => {
    const node = makeNode({
      borderRadius: { topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 },
    });
    const frame = (await createNodeInFigma(node, mockContext(), 0)) as unknown as MockFrame;
    expect(frame).not.toBeNull();
    expect(frame.topLeftRadius).toBe(8);
    expect(frame.topRightRadius).toBe(8);
    expect(frame.bottomRightRadius).toBe(0);
    expect(frame.bottomLeftRadius).toBe(0);
    // The old collapse set cornerRadius=8 on all corners — must not happen.
    expect(frame.cornerRadius).toBeUndefined();
  });

  it("still uses uniform cornerRadius when all corners are equal", async () => {
    const node = makeNode({ borderRadius: 12 });
    const frame = (await createNodeInFigma(node, mockContext(), 0)) as unknown as MockFrame;
    expect(frame.cornerRadius).toBe(12);
  });

  it("clamps each corner to half the smaller dimension", async () => {
    const node = makeNode({
      width: 100, height: 40,
      borderRadius: { topLeft: 999, topRight: 4, bottomRight: 4, bottomLeft: 999 },
    });
    const frame = (await createNodeInFigma(node, mockContext(), 0)) as unknown as MockFrame;
    expect(frame.topLeftRadius).toBe(20);
    expect(frame.bottomLeftRadius).toBe(20);
    expect(frame.topRightRadius).toBe(4);
  });
});

describe("A4: BASELINE / WRAP guards", () => {
  it("survives align-items:baseline on a VERTICAL (block) container", async () => {
    const parent = makeNode({
      id: "p", name: "parent",
      children: [
        makeNode({
          id: "c1", name: "baseline-container",
          layoutMode: "NONE", // block → renders as VERTICAL in autoLayout mode
          alignItems: "baseline",
          children: [
            makeNode({ id: "gc", name: "grandchild", width: 50, height: 20 }),
          ],
        }),
      ],
    });
    const frame = (await createNodeInFigma(parent, mockContext(), 0)) as unknown as MockFrame;
    expect(frame).not.toBeNull();
    // The subtree must survive — this used to throw and delete it.
    expect(frame.children).toHaveLength(1);
    const container = frame.children[0];
    expect(container.name).toBe("baseline-container");
    expect(container.children.length).toBeGreaterThanOrEqual(1);
    expect(container.counterAxisAlignItems).not.toBe("BASELINE");
  });

  it("still applies BASELINE on a HORIZONTAL flex row", async () => {
    const node = makeNode({
      layoutMode: "HORIZONTAL",
      alignItems: "baseline",
      children: [makeNode({ id: "c", name: "cell", width: 50, height: 20 })],
    });
    const frame = (await createNodeInFigma(node, mockContext(), 0)) as unknown as MockFrame;
    expect(frame.counterAxisAlignItems).toBe("BASELINE");
  });

  it("survives flex-wrap:wrap on a HUG-width horizontal row", async () => {
    const parent = makeNode({
      id: "p", name: "parent",
      children: [
        makeNode({
          id: "c1", name: "hug-wrap-row",
          layoutMode: "HORIZONTAL",
          flexWrap: "wrap",
          layoutSizingHorizontal: "HUG",
          children: [
            makeNode({ id: "gc", name: "chip", width: 50, height: 20 }),
          ],
        }),
      ],
    });
    const frame = (await createNodeInFigma(parent, mockContext(), 0)) as unknown as MockFrame;
    expect(frame.children).toHaveLength(1);
    const row = frame.children[0];
    expect(row.name).toBe("hug-wrap-row");
    expect(row.children.length).toBeGreaterThanOrEqual(1);
    expect(row.layoutWrap).not.toBe("WRAP");
  });
});

describe("A5: dropped-node telemetry", () => {
  it("records a dropped child in renderStats.droppedNodes and keeps siblings", async () => {
    const context = mockContext();
    const parent = makeNode({
      id: "p", name: "parent",
      children: [
        makeNode({ id: "bad", name: "broken-child", width: Number.NaN }),
        makeNode({ id: "ok", name: "healthy-child" }),
      ],
    });
    const frame = (await createNodeInFigma(parent, context, 0)) as unknown as MockFrame;
    expect(frame).not.toBeNull();
    // Healthy sibling still renders.
    expect(frame.children.some((c) => c.name === "healthy-child")).toBe(true);
    // The broken child is recorded.
    const dropped = (context.renderStats as { droppedNodes?: { name: string; error: string }[] })
      .droppedNodes;
    expect(dropped).toBeDefined();
    expect(dropped!.length).toBe(1);
    expect(dropped![0].name).toBe("broken-child");
    expect(dropped![0].error).toContain("resize");
  });
});
