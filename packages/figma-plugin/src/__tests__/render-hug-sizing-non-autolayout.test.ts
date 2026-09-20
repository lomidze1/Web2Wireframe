/**
 * A flex-grow / FILL child of a HUG row must not be given HUG unless it can
 * legally hold it.
 *
 * `applyChildInAutoLayout` turned FILL/grow into HUG whenever the parent hugs
 * its main axis, without checking the target. When the child frame has no
 * auto layout of its own (the renderer kept it NONE), Figma throws and the
 * per-child catch drops the whole subtree.
 *
 * chroniclehq.com (user import report 2026-09-16): "Could not be rendered —
 * skipped (in set_layoutSizingHorizontal: HUG can only be set on auto-layout
 * frames or text children of auto-layout frames)".
 */
import { describe, it, expect, vi } from "vitest";

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent: MockNode | null;
  children: MockNode[];
  layoutMode?: string;
  maxWidth?: number;
  minWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

const hasAutoLayout = (n: MockNode | null): boolean =>
  !!n && n.type !== "TEXT" && n.layoutMode !== undefined && n.layoutMode !== "NONE";

/** Every legal HUG write, as `name.axis` — lets tests see a HUG that a later
 *  pass overwrote. */
const hugWrites: string[] = [];

/**
 * Real Figma rule: HUG is legal only on an auto-layout frame, or on a TEXT
 * child of an auto-layout frame.
 */
function guardHug(node: MockNode): void {
  for (const key of ["layoutSizingHorizontal", "layoutSizingVertical"] as const) {
    let value = "FIXED";
    Object.defineProperty(node, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set(v: string) {
        if (
          v === "HUG" &&
          !hasAutoLayout(node) &&
          !(node.type === "TEXT" && hasAutoLayout(node.parent))
        ) {
          const axis = key === "layoutSizingHorizontal" ? "Horizontal" : "Vertical";
          throw new Error(
            `in set_layoutSizing${axis}: HUG can only be set on auto-layout frames or text children of auto-layout frames`
          );
        }
        if (v === "HUG") hugWrites.push(`${node.name}.${key}`);
        value = v;
      },
    });
  }
}

function baseNode(type: string): MockNode {
  const data: Record<string, string> = {};
  const node = {
    type,
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    parent: null,
    fills: [],
    strokes: [],
    effects: [],
    dashPattern: [],
    children: [],
    characters: "",
    fontSize: 16,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    layoutMode: "NONE",
    layoutWrap: "NO_WRAP",
    layoutAlign: "INHERIT",
    layoutGrow: 0,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    clipsContent: true,
    opacity: 1,
    visible: true,
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild(child: MockNode) {
      if (this.type === "TEXT") return;
      child.parent = this as unknown as MockNode;
      this.children.push(child);
    },
    setPluginData(key: string, value: string) {
      data[key] = value;
    },
    getPluginData(key: string) {
      return data[key] ?? "";
    },
  } as unknown as MockNode;
  guardHug(node);
  return node;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => baseNode("FRAME")),
  createText: vi.fn(() => baseNode("TEXT")),
  createRectangle: vi.fn(() => baseNode("RECTANGLE")),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "s", name: "", paints: [] })),
  mixed: Symbol("figma.mixed"),
});

import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext, WireframeNode } from "../types";

let seq = 0;

function makeNode(over: Partial<WireframeNode> = {}): WireframeNode {
  seq += 1;
  return {
    id: `n${seq}`,
    name: `n${seq}`,
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 600,
    height: 100,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "rgb(0,0,0)",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 20,
    letterSpacing: 0,
    children: [],
    ...over,
  } as WireframeNode;
}

type Stats = { droppedNodes: { name: string; error: string }[]; warnings: unknown[] };

function context(stats: Stats): RenderContext {
  return {
    layoutMode: "autoLayout",
    colorMode: "original",
    textMode: "original",
    fontMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "none",
    fontsToLoad: new Set(),
    pluginColors: {
      text: "#000",
      primary: "#000",
      secondary: "#888",
      background: "#FFF",
      surface: "#EEE",
      accent: "#00F",
      border: "#DDD",
    },
    pluginFont: { family: "Inter", weight: 400 },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
    renderStats: stats,
  } as unknown as RenderContext;
}

async function render(
  child: WireframeNode,
  parentLayout: "HORIZONTAL" | "VERTICAL" = "HORIZONTAL"
): Promise<{ parent: MockNode; stats: Stats }> {
  const stats: Stats = { droppedNodes: [], warnings: [] };
  const tree = makeNode({
    name: "div.hug-row",
    layoutMode: parentLayout,
    width: 400,
    height: 40,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    children: [child],
  });
  const parent = (await createNodeInFigma(tree, context(stats), 0)) as unknown as MockNode;
  return { parent, stats };
}

/** A negative margin puts the child in a NONE bleed wrapper (createBleedWrapper),
 *  and the wrapper becomes the sizing target. */
const BLEED = { top: 0, right: 0, bottom: 0, left: -8 };

describe("grow/FILL child of a HUG parent", () => {
  it("horizontal: a FILL child in a bleed wrapper is not dropped", async () => {
    const { parent, stats } = await render(
      makeNode({
        name: "div.fill",
        width: 120,
        height: 40,
        layoutSizingHorizontal: "FILL",
        margin: BLEED,
      })
    );

    expect(stats.droppedNodes).toEqual([]);
    expect(parent.children[0].children[0]?.name).toBe("div.fill");
  });

  it("vertical: a growing child in a bleed wrapper is not dropped", async () => {
    const { parent, stats } = await render(
      makeNode({
        name: "div.grow-v",
        width: 120,
        height: 40,
        layoutGrow: 1,
        margin: { top: -8, right: 0, bottom: 0, left: 0 },
      }),
      "VERTICAL"
    );

    expect(stats.droppedNodes).toEqual([]);
    expect(parent.children[0].children[0]?.name).toBe("div.grow-v");
  });

  it("regression: a FILL auto-layout child (no wrapper) still gets HUG", async () => {
    hugWrites.length = 0;
    const { stats } = await render(
      makeNode({ name: "div.fill-stack", width: 120, height: 40, layoutSizingHorizontal: "FILL" })
    );

    expect(stats.droppedNodes).toEqual([]);
    expect(hugWrites).toContain("div.fill-stack.layoutSizingHorizontal");
  });
});
