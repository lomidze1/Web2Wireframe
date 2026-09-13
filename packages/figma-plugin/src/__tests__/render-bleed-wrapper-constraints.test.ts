/**
 * A child inside a bleed wrapper must not receive min/max constraints.
 *
 * A negative CSS margin puts the child in a `layoutMode: "NONE"` `:margin`
 * frame (createBleedWrapper, layout.ts). Figma only accepts maxWidth /
 * minWidth / minHeight / maxHeight on a node that has auto layout itself or
 * sits in an auto-layout parent — so `applyChildInAutoLayout` writing the CSS
 * max-width onto that child threw, and the per-child catch dropped it.
 *
 * apple.com: `p.tile-callout` has `max-width: 515px` and `margin: 9px 0 -3px`,
 * and the paragraph vanished with "set_maxWidth: Can only set maxWidth on auto
 * layout nodes and their children".
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
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

const CONSTRAINTS = ["maxWidth", "minWidth", "minHeight", "maxHeight"] as const;

const hasAutoLayout = (n: MockNode | null): boolean =>
  !!n && n.type !== "TEXT" && n.layoutMode !== undefined && n.layoutMode !== "NONE";

/** Real Figma rule: the node or its parent must be auto layout. */
function guardConstraints(node: MockNode): void {
  for (const key of CONSTRAINTS) {
    let value: number | undefined;
    Object.defineProperty(node, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set(v: number) {
        if (!hasAutoLayout(node) && !hasAutoLayout(node.parent)) {
          throw new Error(
            `set_${key}: Can only set ${key} on auto layout nodes and their children`
          );
        }
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
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
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
  guardConstraints(node);
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

async function render(child: WireframeNode): Promise<{ parent: MockNode; stats: Stats }> {
  const stats: Stats = { droppedNodes: [], warnings: [] };
  const tree = makeNode({ name: "tile-copy-wrapper", layoutMode: "VERTICAL", children: [child] });
  const parent = (await createNodeInFigma(tree, context(stats), 0)) as unknown as MockNode;
  return { parent, stats };
}

/** apple.com `p.tile-callout`: max-width 515px, margin 9px 0 -3px. */
function tileCallout(over: Partial<WireframeNode> = {}): WireframeNode {
  return makeNode({
    name: "p.tile-callout",
    type: "text",
    tag: "p",
    width: 515,
    height: 46,
    textContent: "Get up to 3% Daily Cash back with every purchase.",
    browserLineCount: 2,
    layoutSizingHorizontal: "FIXED",
    cssMaxWidth: 515,
    margin: { top: 9, right: 0, bottom: -3, left: 0 },
    ...over,
  });
}

describe("bleed-wrapped child — no illegal min/max constraint writes", () => {
  it("apple.com tile-callout: max-width + negative margin renders instead of being dropped", async () => {
    const { parent, stats } = await render(tileCallout());

    expect(stats.droppedNodes).toEqual([]);
    const wrapper = parent.children[0];
    expect(wrapper.name).toMatch(/:margin$/);
    expect(wrapper.layoutMode).toBe("NONE");
    expect(wrapper.children[0]?.type).toBe("TEXT");
    // The wrapper sits in the auto-layout parent, so it keeps the CSS cap.
    expect(wrapper.maxWidth).toBe(515);
  });

  it("min-width / min-height / max-height on a bleed-wrapped text do not drop it", async () => {
    // TEXT never has auto layout of its own, so inside the NONE wrapper every
    // one of these writes is illegal — a frame would not pin it, since the
    // renderer may give the frame auto layout and make the write legal.
    const { parent, stats } = await render(
      tileCallout({
        cssMaxWidth: undefined,
        cssMinWidth: 200,
        cssMinHeight: 40,
        cssMaxHeight: 400,
      })
    );

    expect(stats.droppedNodes).toEqual([]);
    expect(parent.children[0].name).toMatch(/:margin$/);
    expect(parent.children[0].children[0]?.type).toBe("TEXT");
  });
});

describe("regression — legal constraint writes are unchanged", () => {
  it("bleed-wrapped FRAME with its own auto layout still gets maxWidth", async () => {
    // Legal in Figma through the frame's own layout, even in a NONE wrapper —
    // a guard that only looks at the wrapper would strip it.
    const { parent, stats } = await render(
      makeNode({
        name: "div.bleed-stack",
        layoutMode: "VERTICAL",
        width: 300,
        height: 120,
        layoutSizingHorizontal: "FIXED",
        layoutSizingVertical: "FIXED",
        cssMaxWidth: 320,
        margin: { top: -10, right: 0, bottom: 0, left: 0 },
      })
    );

    expect(stats.droppedNodes).toEqual([]);
    const wrapper = parent.children[0];
    expect(wrapper.layoutMode).toBe("NONE");
    expect(wrapper.children[0].layoutMode).toBe("VERTICAL");
    expect(wrapper.children[0].maxWidth).toBe(320);
  });

  it("positive margin (auto-layout padding wrapper): the child still gets maxWidth", async () => {
    const { parent, stats } = await render(
      tileCallout({ margin: { top: 9, right: 0, bottom: 3, left: 0 } })
    );

    expect(stats.droppedNodes).toEqual([]);
    const wrapper = parent.children[0];
    expect(wrapper.layoutMode).toBe("VERTICAL");
    expect(wrapper.children[0].maxWidth).toBe(515);
  });

  it("no margin: the child sits in the auto-layout parent and gets maxWidth / min / max", async () => {
    const { parent, stats } = await render(
      makeNode({
        name: "div.card",
        width: 300,
        height: 120,
        layoutSizingHorizontal: "FIXED",
        layoutSizingVertical: "FIXED",
        cssMaxWidth: 320,
        cssMinWidth: 200,
        cssMinHeight: 80,
        cssMaxHeight: 400,
      })
    );

    expect(stats.droppedNodes).toEqual([]);
    const card = parent.children[0];
    expect(card.maxWidth).toBe(320);
    expect(card.minWidth).toBeGreaterThanOrEqual(200);
    expect(card.minHeight).toBeGreaterThanOrEqual(80);
    expect(card.maxHeight).toBe(400);
  });
});
