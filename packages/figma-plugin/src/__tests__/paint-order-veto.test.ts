/**
 * stripe.com regression: the nav disappeared behind the hero artwork.
 *
 * `<header>` is `position: relative; z-index: 2` and comes BEFORE `<main>` in
 * the DOM. CSS paints a positioned element with a positive z-index above every
 * in-flow non-positioned sibling (CSS 2.1 Appendix E), so on the page the nav
 * sits on top — but we gave the wrapper VERTICAL auto layout, where child order
 * IS layout order, and the hero image inside `<main>` covered `Pricing`,
 * `Guide me`, `Sign in` and `Contact sales`.
 *
 * Reordering inside auto layout is not the answer — that is what pushed
 * telex.ge's `z-index: 5` header to the bottom of the page. h2d drops auto
 * layout for such a container and places the children by their captured
 * coordinates, which makes the reorder free. This is that veto.
 */
import { describe, it, expect } from "vitest";

import { paintOrderNeedsReorder, sortChildrenForStacking } from "../rendering/nodes";
import type { WireframeNode } from "../types";

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
    children: [],
    ...overrides,
  } as WireframeNode;
}

/** stripe.com's page wrapper: header (relative, z 2), then main, then footer. */
const stripeWrapper = (): WireframeNode[] => [
  makeNode("header", { position: "relative", zIndex: 2, height: 76 }),
  makeNode("main", { y: 76, height: 13928 }),
  makeNode("footer", { y: 14004, height: 1102 }),
];

describe("paintOrderNeedsReorder", () => {
  it("vetoes a relative child that CSS paints above a later sibling", () => {
    expect(paintOrderNeedsReorder(stripeWrapper())).toBe(true);
  });

  it("vetoes a sticky child the same way", () => {
    const children = [
      makeNode("header", { position: "sticky", zIndex: 1, height: 76 }),
      makeNode("main", { y: 76, height: 900 }),
    ];

    expect(paintOrderNeedsReorder(children)).toBe(true);
  });

  it("does not veto when the lifted child is already last", () => {
    const children = [
      makeNode("main", { height: 900 }),
      makeNode("header", { position: "relative", zIndex: 2, y: 900, height: 76 }),
    ];

    expect(paintOrderNeedsReorder(children)).toBe(false);
  });

  it("does not veto for an out-of-flow child — order never moves it", () => {
    // Figma gives absolute children layoutPositioning ABSOLUTE, so their place
    // in the child list only affects paint; isInFrontOfSiblings handles them.
    const children = [
      makeNode("overlay", { position: "absolute", zIndex: 5 }),
      makeNode("main", { y: 76, height: 900 }),
    ];

    expect(paintOrderNeedsReorder(children)).toBe(false);
  });

  it("does not veto when every later sibling is out of flow", () => {
    const children = [
      makeNode("header", { position: "relative", zIndex: 2, height: 76 }),
      makeNode("overlay", { position: "absolute" }),
      makeNode("pinned", { position: "fixed" }),
    ];

    expect(paintOrderNeedsReorder(children)).toBe(false);
  });

  it("ignores a positioned child without an explicit positive z-index", () => {
    const auto = [
      makeNode("header", { position: "relative", height: 76 }),
      makeNode("main", { y: 76, height: 900 }),
    ];
    const zero = [
      makeNode("header", { position: "relative", zIndex: 0, height: 76 }),
      makeNode("main", { y: 76, height: 900 }),
    ];

    expect(paintOrderNeedsReorder(auto)).toBe(false);
    expect(paintOrderNeedsReorder(zero)).toBe(false);
  });

  it("ignores a z-index on a static child — CSS does too", () => {
    const children = [
      makeNode("header", { zIndex: 5, height: 76 }),
      makeNode("main", { y: 76, height: 900 }),
    ];

    expect(paintOrderNeedsReorder(children)).toBe(false);
  });

  it("leaves an ordinary stack alone", () => {
    const children = [
      makeNode("one", { height: 100 }),
      makeNode("two", { y: 100, height: 100 }),
      makeNode("three", { y: 200, height: 100 }),
    ];

    expect(paintOrderNeedsReorder(children)).toBe(false);
  });

  it("does not care about a single child", () => {
    expect(paintOrderNeedsReorder([makeNode("only", { position: "relative", zIndex: 2 })])).toBe(false);
  });
});

describe("the veto hands the reorder to the existing NONE-mode sort", () => {
  it("puts stripe.com's nav last, matching h2d's [main, footer, header]", () => {
    // What the frame becomes once the veto strips auto layout.
    const sorted = sortChildrenForStacking(stripeWrapper(), "NONE");

    expect(sorted.map((c) => c.name)).toEqual(["main", "footer", "header"]);
  });

  it("keeps the lifted child at its captured position — telex.ge regression", () => {
    // Reordering under auto layout moved telex.ge's header to the page bottom.
    // In NONE mode order is paint-only: y stays where the capture put it.
    const sorted = sortChildrenForStacking(
      [
        makeNode("header", { position: "relative", zIndex: 5, y: 0, height: 60 }),
        makeNode("content", { y: 60, height: 4000 }),
      ],
      "NONE",
    );

    expect(sorted.map((c) => c.name)).toEqual(["content", "header"]);
    expect(sorted.find((c) => c.name === "header")!.y).toBe(0);
  });
});
