/**
 * A HORIZONTAL container must not flatten multi-row content into one line.
 *
 * Figma's HORIZONTAL auto-layout has exactly one row unless `layoutWrap: WRAP`
 * applies. When the captured children occupy several visual rows and WRAP is
 * unavailable, packing them onto one line squeezes every child and leaves the
 * captured height empty — stripe.com's bento lost 1510px of its 1834px that way.
 *
 * h2d derives the axis from geometry (`U8`) and calls HORIZONTAL only when every
 * child sits inside the tallest child's vertical span; otherwise it aborts to
 * plain x/y placement. `geometryFormsSingleRow` is that predicate, and the gate
 * mirrors the existing `noneStackRejected` / `isColumnWrap` bails.
 *
 * The gate deliberately stands down when WRAP *will* apply: with measured widths
 * intact (see layout-grow-fit.test.ts) Figma's own wrapping reproduces the rows
 * and the result stays editable — better than falling back to absolute.
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
  layoutMode?: string;
  layoutWrap?: string;
  layoutGrow?: number;
  layoutSizingHorizontal?: string;
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
  createNodeInFigma,
  geometryFormsSingleRow,
  wrapFitsChildren,
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

/** stripe.com's bento: 2 + 3 + 1 cards on three rows inside a 1232×1834 box. */
function bentoCards(): WireframeNode[] {
  return [
    makeNode("c1", { x: 0, y: 0, width: 816, height: 676, layoutGrow: 1 }),
    makeNode("c2", { x: 832, y: 0, width: 400, height: 676, layoutGrow: 1 }),
    makeNode("c3", { x: 0, y: 692, width: 400, height: 676, layoutGrow: 1 }),
    makeNode("c4", { x: 416, y: 692, width: 400, height: 676, layoutGrow: 1 }),
    makeNode("c5", { x: 832, y: 692, width: 400, height: 676, layoutGrow: 1 }),
    makeNode("c6", { x: 0, y: 1384, width: 1232, height: 450, layoutGrow: 1 }),
  ];
}

describe("geometryFormsSingleRow", () => {
  it("accepts children sharing one horizontal band", () => {
    const children = [
      makeNode("a", { x: 0, y: 0, width: 200, height: 100 }),
      makeNode("b", { x: 216, y: 20, width: 200, height: 60 }),
      makeNode("c", { x: 432, y: 0, width: 200, height: 100 }),
    ];
    expect(geometryFormsSingleRow(children)).toBe(true);
  });

  it("rejects the stripe.com bento — three rows", () => {
    expect(geometryFormsSingleRow(bentoCards())).toBe(false);
  });

  it("rejects a two-row wrap even when the rows touch", () => {
    const children = [
      makeNode("a", { x: 0, y: 0, width: 400, height: 100 }),
      makeNode("b", { x: 416, y: 0, width: 400, height: 100 }),
      makeNode("c", { x: 0, y: 100, width: 400, height: 100 }),
    ];
    expect(geometryFormsSingleRow(children)).toBe(false);
  });

  it("ignores out-of-flow children", () => {
    const children = [
      makeNode("a", { x: 0, y: 0, width: 200, height: 100 }),
      makeNode("b", { x: 216, y: 0, width: 200, height: 100 }),
      makeNode("badge", { x: 0, y: 400, width: 20, height: 20, position: "absolute" }),
    ];
    expect(geometryFormsSingleRow(children)).toBe(true);
  });

  it("ignores zero-size children", () => {
    const children = [
      makeNode("a", { x: 0, y: 0, width: 200, height: 100 }),
      makeNode("spacer", { x: 0, y: 900, width: 0, height: 0 }),
      makeNode("b", { x: 216, y: 0, width: 200, height: 100 }),
    ];
    expect(geometryFormsSingleRow(children)).toBe(true);
  });

  it("accepts fewer than two in-flow children", () => {
    expect(geometryFormsSingleRow([])).toBe(true);
    expect(geometryFormsSingleRow([makeNode("only", { y: 40, height: 60 })])).toBe(true);
  });

  it("tolerates sub-pixel overhang (0.51px epsilon)", () => {
    const children = [
      makeNode("tall", { x: 0, y: 0, width: 200, height: 100 }),
      makeNode("nudged", { x: 216, y: -0.4, width: 200, height: 100.4 }),
    ];
    expect(geometryFormsSingleRow(children)).toBe(true);
  });
});

describe("createNodeInFigma — multi-row HORIZONTAL containers", () => {
  it("drops auto-layout and keeps captured x/y when WRAP is unavailable", async () => {
    // No flexWrap: Figma cannot wrap, so one row would flatten all three.
    const container = makeNode("bento", {
      layoutMode: "HORIZONTAL",
      width: 1232,
      height: 1834,
      children: bentoCards(),
    });

    const frame = (await createNodeInFigma(container, mockContext, 0)) as unknown as MockNode;

    expect(frame.layoutMode).toBe("NONE");
    expect(frame.children.map((c) => c.x)).toEqual([0, 832, 0, 416, 832, 0]);
    expect(frame.children.map((c) => c.y)).toEqual([0, 0, 692, 692, 692, 1384]);
  });

  it("keeps auto-layout when flex-wrap can reproduce the rows", async () => {
    const container = makeNode("bento", {
      layoutMode: "HORIZONTAL",
      flexWrap: "wrap",
      width: 1232,
      height: 1834,
      itemSpacing: 16,
      children: bentoCards(),
    });

    const frame = (await createNodeInFigma(container, mockContext, 0)) as unknown as MockNode;

    expect(frame.layoutMode).toBe("HORIZONTAL");
    expect(frame.layoutWrap).toBe("WRAP");
  });

  it("leaves a genuine single row on auto-layout", async () => {
    const container = makeNode("row", {
      layoutMode: "HORIZONTAL",
      width: 1232,
      height: 100,
      itemSpacing: 16,
      children: [
        makeNode("a", { x: 0, y: 0, width: 400, height: 100 }),
        makeNode("b", { x: 416, y: 0, width: 400, height: 100 }),
        makeNode("c", { x: 832, y: 0, width: 400, height: 100 }),
      ],
    });

    const frame = (await createNodeInFigma(container, mockContext, 0)) as unknown as MockNode;

    expect(frame.layoutMode).toBe("HORIZONTAL");
  });
});

const await0 = (n: WireframeNode) => createNodeInFigma(n, mockContext, 0);

describe("wrapFitsChildren", () => {
  it("accepts children that all fit the container", () => {
    expect(wrapFitsChildren(1232, bentoCards())).toBe(true);
  });

  it("rejects a container narrower than its widest child", () => {
    // stripe.com: the `width: 100%` card measures 1232 but the row came out
    // 1230, so Figma's WRAP cannot reproduce the captured 2 + 3 + 1 bands.
    expect(wrapFitsChildren(1230, bentoCards())).toBe(false);
  });

  it("ignores out-of-flow children", () => {
    const children = [
      makeNode("a", { x: 0, y: 0, width: 400, height: 100 }),
      makeNode("overlay", { x: 0, y: 0, width: 4000, height: 100, position: "absolute" }),
    ];
    expect(wrapFitsChildren(400, children)).toBe(true);
  });

  it("tolerates sub-pixel overhang", () => {
    const children = [makeNode("a", { x: 0, y: 0, width: 400.4, height: 100 })];
    expect(wrapFitsChildren(400, children)).toBe(true);
  });
});

describe("createNodeInFigma — WRAP only wins when it can reproduce the rows", () => {
  it("falls back to captured x/y when the widest child overflows the row", async () => {
    const container = makeNode("bento", {
      layoutMode: "HORIZONTAL",
      flexWrap: "wrap",
      width: 1230, // 2px short of the 1232 its width:100% child measures
      height: 1834,
      itemSpacing: 16,
      children: bentoCards(),
    });

    const frame = (await await0(container)) as unknown as MockNode;
    expect(frame.layoutMode).toBe("NONE");
    expect(frame.children.map((c) => c.y)).toEqual([0, 0, 692, 692, 692, 1384]);
  });
});

describe("createNodeInFigma — layoutGrow exact-fit gate", () => {
  it("withholds layoutGrow when the measured children overflow the container", async () => {
    // flexWrap present so the row-band veto stands down and this isolates grow.
    const container = makeNode("bento", {
      layoutMode: "HORIZONTAL",
      flexWrap: "wrap",
      width: 1232,
      height: 1834,
      itemSpacing: 16,
      children: bentoCards(),
    });

    const frame = (await createNodeInFigma(container, mockContext, 0)) as unknown as MockNode;

    expect(frame.children).toHaveLength(6);
    for (const child of frame.children) {
      expect(child.layoutGrow).not.toBe(1);
      expect(child.layoutSizingHorizontal).not.toBe("FILL");
    }
  });

  it("still grows a row whose measured children fill the container exactly", async () => {
    const container = makeNode("row", {
      layoutMode: "HORIZONTAL",
      width: 1232,
      height: 100,
      itemSpacing: 16,
      children: [
        makeNode("a", { x: 0, y: 0, width: 400, height: 100, layoutGrow: 1 }),
        makeNode("b", { x: 416, y: 0, width: 400, height: 100, layoutGrow: 1 }),
        makeNode("c", { x: 832, y: 0, width: 400, height: 100, layoutGrow: 1 }),
      ],
    });

    const frame = (await createNodeInFigma(container, mockContext, 0)) as unknown as MockNode;

    expect(frame.children.map((c) => c.layoutGrow)).toEqual([1, 1, 1]);
  });
});
