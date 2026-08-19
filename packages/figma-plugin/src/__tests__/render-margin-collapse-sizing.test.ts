/**
 * Margin collapse must not change SIZING, only layer count.
 *
 * `applyChildInAutoLayout` (nodes.ts) branches on whether a `:margin` wrapper
 * exists — with a wrapper the wrapper carries the parent-facing sizing and the
 * child FILLs it (createMarginWrapper, layout.ts); without one the child
 * carries it directly. Collapsing a margin flips which branch runs, so every
 * sizing shape that mattered in past regressions is rendered BOTH ways here and
 * the parent-facing result compared.
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
  children: MockNode[];
  characters?: string;
  textAutoResize?: string;
  layoutMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  layoutAlign?: string;
  layoutGrow?: number;
  maxWidth?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
}

function baseNode(type: string): MockNode {
  const data: Record<string, string> = {};
  return {
    type,
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
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
    maxWidth: undefined,
    minWidth: undefined,
    minHeight: undefined,
    maxHeight: undefined,
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
      this.children.push(child);
    },
    setPluginData(key: string, value: string) {
      data[key] = value;
    },
    getPluginData(key: string) {
      return data[key] ?? "";
    },
  } as unknown as MockNode;
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
import { collapseMarginWrappers } from "../rendering/marginCollapse";
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
    width: 200,
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

function context(over: Partial<RenderContext> = {}): RenderContext {
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
    ...over,
  } as unknown as RenderContext;
}

/**
 * Render `tree` twice: as-is (wrapper path) and after collapseMarginWrappers
 * (no-wrapper path). Returns the node each variant appends to the parent —
 * the wrapper in the first case, the bare child in the second.
 */
async function renderBothWays(
  tree: WireframeNode,
  ctx: RenderContext = context(),
  index = 0
): Promise<{ wrapped: MockNode; collapsed: MockNode; collapsedParent: MockNode }> {
  const withWrapper = structuredClone(tree);
  const withoutWrapper = structuredClone(tree);
  collapseMarginWrappers(withoutWrapper);

  const a = (await createNodeInFigma(withWrapper, ctx, 0)) as unknown as MockNode;
  const b = (await createNodeInFigma(withoutWrapper, ctx, 0)) as unknown as MockNode;

  expect(a.children[index].name).toMatch(/:margin$/);
  expect(b.children[index].name).not.toMatch(/:margin$/);

  return {
    wrapped: a.children[index],
    collapsed: b.children[index],
    collapsedParent: b,
  };
}

const sizingOf = (n: MockNode) => ({
  h: n.layoutSizingHorizontal,
  v: n.layoutSizingVertical,
});

describe("margin collapse keeps parent-facing sizing identical", () => {
  it("FRAME child that FILLs a vertical parent", async () => {
    const tree = makeNode({
      name: "parent",
      layoutMode: "VERTICAL",
      layoutSizingHorizontal: "FIXED",
      children: [
        makeNode({
          name: "card",
          layoutMode: "VERTICAL",
          layoutSizingHorizontal: "FILL",
          layoutSizingVertical: "HUG",
          margin: { top: 16, right: 0, bottom: 0, left: 0 },
        }),
      ],
    });

    const { wrapped, collapsed, collapsedParent } = await renderBothWays(tree);

    expect(sizingOf(collapsed)).toEqual(sizingOf(wrapped));
    // The 16px used to live in the wrapper's padding; now it is the parent's.
    expect(collapsedParent.paddingTop).toBe(16);
    expect(wrapped.paddingTop).toBe(16);
  });

  it("FRAME child with FIXED width in a horizontal row (telex.ge float columns)", async () => {
    const tree = makeNode({
      name: "row",
      layoutMode: "HORIZONTAL",
      children: [
        makeNode({ name: "col1", width: 281, layoutSizingHorizontal: "FIXED" }),
        makeNode({
          name: "col2",
          width: 281,
          layoutSizingHorizontal: "FIXED",
          margin: { top: 0, right: 0, bottom: 0, left: 25.5 },
        }),
      ],
    });

    const { wrapped, collapsed, collapsedParent } = await renderBothWays(
      tree,
      context(),
      1
    );

    // The FIXED column must not shrink to its content in either variant.
    const wrappedInner = wrapped.children[0];
    expect(wrappedInner.layoutSizingHorizontal).toBe("FIXED");
    expect(collapsed.layoutSizingHorizontal).toBe("FIXED");
    expect(collapsed.width).toBe(wrappedInner.width);
    expect(collapsedParent.itemSpacing).toBe(25.5);
  });

  it("single-line TEXT that HUGs its natural width (apple.com tile subhead)", async () => {
    const tree = makeNode({
      name: "tile",
      layoutMode: "VERTICAL",
      children: [
        makeNode({
          name: "subhead",
          type: "text",
          tag: "p",
          textContent: "Amazing Mac. Surprising price.",
          browserLineCount: 1,
          layoutSizingHorizontal: "HUG",
          margin: { top: 0, right: 0, bottom: 12, left: 0 },
        }),
      ],
    });

    const { wrapped, collapsed } = await renderBothWays(tree);

    const wrappedText = wrapped.children[0];
    expect(wrappedText.layoutSizingHorizontal).toBe("HUG");
    expect(wrappedText.textAutoResize).toBe("WIDTH_AND_HEIGHT");
    expect(collapsed.layoutSizingHorizontal).toBe("HUG");
    expect(collapsed.textAutoResize).toBe("WIDTH_AND_HEIGHT");
  });

  it("multi-line TEXT with a FIXED capture width keeps its wrap width", async () => {
    const tree = makeNode({
      name: "card",
      layoutMode: "VERTICAL",
      children: [
        makeNode({
          name: "quote",
          type: "text",
          tag: "p",
          width: 373,
          textContent: "a long quote that wrapped across several lines",
          browserLineCount: 4,
          layoutSizingHorizontal: "FIXED",
          margin: { top: 0, right: 0, bottom: 20, left: 0 },
        }),
      ],
    });

    const { wrapped, collapsed } = await renderBothWays(tree);

    const wrappedText = wrapped.children[0];
    expect(wrappedText.layoutSizingHorizontal).toBe("FIXED");
    expect(wrappedText.textAutoResize).toBe("HEIGHT");
    expect(collapsed.layoutSizingHorizontal).toBe("FIXED");
    expect(collapsed.textAutoResize).toBe("HEIGHT");
    expect(collapsed.width).toBe(wrappedText.width);
  });

  it("semantic textMode keeps FIXED dimensions so truncation still works", async () => {
    const tree = makeNode({
      name: "card",
      layoutMode: "VERTICAL",
      children: [
        makeNode({
          name: "label",
          type: "text",
          tag: "p",
          width: 200,
          textContent: "Some placeholder copy",
          margin: { top: 8, right: 0, bottom: 8, left: 0 },
        }),
      ],
    });

    const { wrapped, collapsed } = await renderBothWays(
      tree,
      context({ textMode: "semantic" } as Partial<RenderContext>)
    );

    const wrappedText = wrapped.children[0];
    expect(sizingOf(wrappedText)).toEqual({ h: "FIXED", v: "FIXED" });
    expect(sizingOf(collapsed)).toEqual({ h: "FIXED", v: "FIXED" });
  });

  it("cssMaxWidth stays anchored to the same content box", async () => {
    const tree = makeNode({
      name: "col",
      layoutMode: "VERTICAL",
      children: [
        makeNode({
          name: "blurb",
          type: "text",
          tag: "p",
          width: 265,
          textContent: "constrained paragraph",
          browserLineCount: 2,
          cssMaxWidth: 265,
          margin: { top: 0, right: 10, bottom: 0, left: 10 },
        }),
      ],
    });

    const { wrapped, collapsed, collapsedParent } = await renderBothWays(tree);

    // Wrapper carried maxWidth INCLUDING the side margins; after the collapse
    // those 20px live in the parent's padding, so the bare child's own
    // maxWidth describes the same content box.
    expect(wrapped.maxWidth).toBe(285);
    expect(collapsed.maxWidth).toBe(265);
    expect(collapsedParent.paddingLeft).toBe(10);
    expect(collapsedParent.paddingRight).toBe(10);
  });
});
