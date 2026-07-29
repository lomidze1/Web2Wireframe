/**
 * stripe.com header regression (Area Selection / .w2w import).
 *
 * Stripe's <header> ends with an absolutely-positioned white <div> carrying
 * `z-index: -1` and the exact geometry of the <nav> it sits behind. The browser
 * paints it behind; Figma paints the LAST child on top, so the import rendered
 * as one solid bar with the whole navigation hidden underneath.
 *
 * Two independent defects kept the existing z-index sort from firing:
 *   1. The legacy Area Selection converter never lifted `z-index` out of
 *      `computedStyles`, so `node.zIndex` was always undefined.
 *   2. The sort bailed out entirely under auto-layout — correct for in-flow
 *      children (reordering them would break DOM order) but wrong for
 *      out-of-flow ones, which Figma positions with layoutPositioning
 *      "ABSOLUTE" and therefore does not lay out by child order.
 */
import { describe, it, expect, vi } from "vitest";
import {
  convertToWireframeNode,
  type ExtractedElement,
} from "../ui/shared/absoluteModeRenderer";

vi.stubGlobal("figma", {
  createFrame: vi.fn(),
  createText: vi.fn(),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { sortChildrenForStacking } from "../rendering/nodes";
import type { WireframeNode } from "../types";

const PLUGIN_COLORS = { text: "#000000", surface: "#F0F0F0" };

function makeElement(
  overrides: Partial<ExtractedElement> = {},
): ExtractedElement {
  return {
    id: "el",
    tag: "div",
    name: "div",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: null,
    borderColor: null,
    borderWidth: 0,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    fontFamily: "Inter",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: "normal",
    letterSpacing: 0,
    textAlign: "start",
    textContent: "",
    opacity: 1,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

function makeNode(
  name: string,
  overrides: Partial<WireframeNode> = {},
): WireframeNode {
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

describe("convertToWireframeNode lifts z-index out of computedStyles", () => {
  it("reads a negative z-index", () => {
    const node = convertToWireframeNode(
      makeElement({ computedStyles: { "z-index": "-1" } }),
      PLUGIN_COLORS,
    );
    expect(node.zIndex).toBe(-1);
  });

  it("reads a positive z-index", () => {
    const node = convertToWireframeNode(
      makeElement({ computedStyles: { "z-index": "5" } }),
      PLUGIN_COLORS,
    );
    expect(node.zIndex).toBe(5);
  });

  it("leaves zIndex undefined for `auto` and for missing styles", () => {
    expect(
      convertToWireframeNode(
        makeElement({ computedStyles: { "z-index": "auto" } }),
        PLUGIN_COLORS,
      ).zIndex,
    ).toBeUndefined();
    expect(
      convertToWireframeNode(makeElement(), PLUGIN_COLORS).zIndex,
    ).toBeUndefined();
  });

  it("carries z-index through nested children", () => {
    const node = convertToWireframeNode(
      makeElement({
        children: [
          makeElement({ id: "nav", name: "nav", tag: "nav" }),
          makeElement({
            id: "overlay",
            name: "overlay",
            position: "absolute",
            computedStyles: { "z-index": "-1" },
          }),
        ],
      }),
      PLUGIN_COLORS,
    );
    expect(node.children.map((c) => c.zIndex)).toEqual([undefined, -1]);
  });
});

describe("sortChildrenForStacking sends negative-z overlays to the back", () => {
  const stripeHeader = () => [
    makeNode("nav", { position: "relative" }),
    makeNode("overlay", { position: "absolute", zIndex: -1 }),
  ];

  it("hoists an absolute negative-z child in VERTICAL auto-layout", () => {
    const result = sortChildrenForStacking(stripeHeader(), "VERTICAL");
    expect(result.map((c) => c.name)).toEqual(["overlay", "nav"]);
  });

  it("hoists it in absolute mode too", () => {
    const result = sortChildrenForStacking(stripeHeader(), "NONE");
    expect(result.map((c) => c.name)).toEqual(["overlay", "nav"]);
  });

  it("keeps in-flow children in DOM order even when they carry z-index", () => {
    // telex.ge invariant: a relative header with z-index:5 must stay first,
    // because auto-layout lays children out in child order.
    const children = [
      makeNode("header", { position: "relative", zIndex: 5 }),
      makeNode("content"),
      makeNode("footer"),
    ];
    expect(
      sortChildrenForStacking(children, "VERTICAL").map((c) => c.name),
    ).toEqual(["header", "content", "footer"]);
  });

  it("leaves absolute children with positive z-index where they are", () => {
    const children = [
      makeNode("nav"),
      makeNode("dropdown", { position: "absolute", zIndex: 10 }),
    ];
    expect(
      sortChildrenForStacking(children, "VERTICAL").map((c) => c.name),
    ).toEqual(["nav", "dropdown"]);
  });

  it("stacks several negative-z overlays deepest-first", () => {
    // Painting runs in ascending z-index, so -2 belongs behind -1.
    const children = [
      makeNode("nav"),
      makeNode("overlayA", { position: "absolute", zIndex: -1 }),
      makeNode("overlayB", { position: "absolute", zIndex: -2 }),
    ];
    expect(
      sortChildrenForStacking(children, "VERTICAL").map((c) => c.name),
    ).toEqual(["overlayB", "overlayA", "nav"]);
  });

  it("treats position:fixed the same as absolute", () => {
    const children = [
      makeNode("nav"),
      makeNode("backdrop", { position: "fixed", zIndex: -1 }),
    ];
    expect(
      sortChildrenForStacking(children, "VERTICAL").map((c) => c.name),
    ).toEqual(["backdrop", "nav"]);
  });
});
