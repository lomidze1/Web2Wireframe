/**
 * iwm.org.uk regression: an explicitly front-stacked overlay must paint LAST.
 *
 * `div.hero` holds [hero__nav (position:absolute, z-index:20), hero__media
 * (position:relative, z-index:-1)]. The browser paints the nav on top of the
 * hero photo; Figma paints the LAST child on top, so the photo covered the
 * entire header — logo, main menu and Search/Donate/Shop all vanished.
 *
 * `isBehindSiblings` already handles the mirror case (out-of-flow + negative
 * z-index → move to the front). Neither child qualified here: hero__media is
 * in flow, hero__nav carries a POSITIVE z-index. This file locks in the
 * missing half — out-of-flow + explicit positive z-index → move to the end —
 * plus the invariants that must survive it.
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

import { sortChildrenForStacking, createNodeInFigma } from "../rendering/nodes";
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

const names = (children: WireframeNode[]): string[] => children.map((c) => c.name!);

describe("sortChildrenForStacking sends positive-z out-of-flow children to the front", () => {
  it("iwm.org.uk: the absolute z-index:20 nav paints above the in-flow hero photo", () => {
    const hero = [
      makeNode("div.hero__nav", { position: "absolute", zIndex: 20, height: 138 }),
      makeNode("div.hero__media", { position: "relative", zIndex: -1, height: 675 }),
    ];
    expect(names(sortChildrenForStacking(hero, "VERTICAL"))).toEqual([
      "div.hero__media",
      "div.hero__nav",
    ]);
  });

  it("leaves an absolute child with no z-index in DOM order", () => {
    // z-index: auto is the overwhelming majority of absolute children —
    // reordering them all would churn every import's layer list.
    const children = [
      makeNode("dropdown", { position: "absolute" }),
      makeNode("content"),
    ];
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "dropdown",
      "content",
    ]);
  });

  it("telex.ge: an in-flow child with z-index:5 stays first", () => {
    // Moving an in-flow child would change where auto-layout PLACES it,
    // not just how it paints.
    const children = [
      makeNode("div.tygh-header", { zIndex: 5 }),
      makeNode("div.tygh-content"),
      makeNode("div#tygh_footer"),
    ];
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "div.tygh-header",
      "div.tygh-content",
      "div#tygh_footer",
    ]);
  });

  it("stacks several front overlays in ascending z-index, DOM order breaking ties", () => {
    const children = [
      makeNode("z10", { position: "absolute", zIndex: 10 }),
      makeNode("flow"),
      makeNode("z5", { position: "absolute", zIndex: 5 }),
      makeNode("z5b", { position: "fixed", zIndex: 5 }),
    ];
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "flow",
      "z5",
      "z5b",
      "z10",
    ]);
  });

  it("splits behind and front overlays around the in-flow children", () => {
    const children = [
      makeNode("front", { position: "absolute", zIndex: 9 }),
      makeNode("flow"),
      makeNode("behind", { position: "absolute", zIndex: -1 }),
    ];
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "behind",
      "flow",
      "front",
    ]);
  });

  it("keeps an absolute image-only background container at the back even with positive z", () => {
    // Step 1 (background-layer hoist) owns this decision; the front sort
    // must not drag the hoisted container back to the end.
    const children = [
      makeNode("content"),
      makeNode("bg", {
        position: "absolute",
        zIndex: 3,
        isPlaceholder: true,
        type: "placeholder",
      }),
    ];
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "bg",
      "content",
    ]);
  });

  it("absolute mode (NONE) keeps its full z-index sort", () => {
    const children = [
      makeNode("front", { position: "absolute", zIndex: 9 }),
      makeNode("flow", { zIndex: 2 }),
      makeNode("behind", { position: "absolute", zIndex: -1 }),
    ];
    expect(names(sortChildrenForStacking(children, "NONE"))).toEqual([
      "behind",
      "flow",
      "front",
    ]);
  });
});

describe("createNodeInFigma appends the front overlay last", () => {
  it("iwm.org.uk hero renders [media, nav] so the header stays visible", async () => {
    const hero = makeNode("div.hero", {
      layoutMode: "NONE", // display:block container → VERTICAL under autoLayout
      height: 675,
      children: [
        makeNode("div.hero__nav", { position: "absolute", zIndex: 20, height: 138 }),
        makeNode("div.hero__media", { position: "relative", zIndex: -1, height: 675 }),
      ],
    });

    const rendered = (await createNodeInFigma(hero, mockContext, 0)) as unknown as {
      children: Array<{ name: string }>;
    } | null;

    expect(rendered).not.toBeNull();
    expect(rendered!.children.map((c) => c.name)).toEqual([
      "div.hero__media",
      "div.hero__nav",
    ]);
  });
});
