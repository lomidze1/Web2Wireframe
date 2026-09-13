/**
 * stripe.com regression: an out-of-flow backdrop with `z-index: 0` must paint
 * BEHIND an in-flow sibling that carries a HIGHER z-index.
 *
 * `section.stats-section` holds, in DOM order:
 *   [__border (absolute, z 2), __active-indicator (absolute, z 3),
 *    .section-container (RELATIVE, z 1), .section-background (absolute, z 0)]
 *
 * CSS paints them 0 → 1 → 2 → 3, so the gradient backdrop sits at the very
 * bottom. `isBehindSiblings` only recognised `z < 0`, and the z-index of a
 * `position: relative` child was never read at all, so the backdrop stayed
 * after the container and Figma painted the opaque 1440x977 gradient over the
 * entire section — every heading, stat and chart vanished behind it.
 *
 * The floor is deliberately narrow: it only engages when EVERY in-flow sibling
 * is CSS-positioned and numerically stacked. A z-index on a `static` child has
 * no effect in CSS (telex.ge's header), and a mix of positioned and static
 * in-flow siblings has no single correct answer under auto layout, where
 * "before all in-flow" and "after all in-flow" are the only two slots.
 */
import { describe, it, expect } from "vitest";

import { sortChildrenForStacking } from "../rendering/nodes";
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

const names = (children: WireframeNode[]): string[] => children.map((c) => c.name!);

describe("sortChildrenForStacking honours the in-flow positioned z-index floor", () => {
  it("stripe.com stats: the z-index:0 backdrop paints under the relative z-index:1 container", () => {
    const section = [
      makeNode("span.stats-section__border", { position: "absolute", zIndex: 2 }),
      makeNode("span.stats-section__active-indicator-container", {
        position: "absolute",
        zIndex: 3,
      }),
      makeNode("div.section-container", { position: "relative", zIndex: 1 }),
      makeNode("div.section-background", { position: "absolute", zIndex: 0 }),
    ];

    expect(names(sortChildrenForStacking(section, "VERTICAL"))).toEqual([
      "div.section-background",
      "div.section-container",
      "span.stats-section__border",
      "span.stats-section__active-indicator-container",
    ]);
  });

  it("a z-index on a STATIC in-flow child sets no floor (it has no CSS effect)", () => {
    // telex.ge: `div.tygh-header` is static with z-index:5. Nothing may move.
    const children = [
      makeNode("div.tygh-header", { zIndex: 5 }),
      makeNode("div.tygh-content"),
      makeNode("backdrop", { position: "absolute", zIndex: 0 }),
    ];

    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "div.tygh-header",
      "div.tygh-content",
      "backdrop",
    ]);
  });

  it("a mix of positioned and static in-flow siblings leaves the floor off", () => {
    const children = [
      makeNode("static-flow"),
      makeNode("rel-z5", { position: "relative", zIndex: 5 }),
      makeNode("backdrop", { position: "absolute", zIndex: 1 }),
    ];

    // `backdrop` still qualifies for the existing positive-z front rule, which
    // is the better of the two available slots when no single answer exists.
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "static-flow",
      "rel-z5",
      "backdrop",
    ]);
  });

  it("an out-of-flow child ABOVE the floor still goes to the front", () => {
    const children = [
      makeNode("div.section-container", { position: "relative", zIndex: 1 }),
      makeNode("overlay", { position: "absolute", zIndex: 2 }),
    ];

    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "div.section-container",
      "overlay",
    ]);
  });

  it("an in-flow positioned child WITHOUT a numeric z-index sets no floor", () => {
    const children = [
      makeNode("rel-auto", { position: "relative" }),
      makeNode("backdrop", { position: "absolute", zIndex: 0 }),
    ];

    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "rel-auto",
      "backdrop",
    ]);
  });

  it("the floor uses the LOWEST in-flow z-index, so a backdrop under all of them moves", () => {
    const children = [
      makeNode("rel-z3", { position: "relative", zIndex: 3 }),
      makeNode("rel-z1", { position: "relative", zIndex: 1 }),
      makeNode("backdrop", { position: "absolute", zIndex: 0 }),
    ];

    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "backdrop",
      "rel-z3",
      "rel-z1",
    ]);
  });

  it("absolute mode (NONE) is untouched — it already runs a full z-index sort", () => {
    const children = [
      makeNode("div.section-container", { position: "relative", zIndex: 1 }),
      makeNode("div.section-background", { position: "absolute", zIndex: 0 }),
    ];

    expect(names(sortChildrenForStacking(children, "NONE"))).toEqual([
      "div.section-background",
      "div.section-container",
    ]);
  });
});
