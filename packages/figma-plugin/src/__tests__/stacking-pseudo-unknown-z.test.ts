/**
 * chroniclehq.com: the carousel edge-fades were painted under the cards.
 *
 * `.side-gradients` draws its left and right fades with `::before` / `::after`,
 * both `position: absolute; z-index: 99`, over a `div.swiper` that is
 * `position: relative; z-index: 1`. CSS paints 1 → 99, so the fades sit on top.
 *
 * The capture never carried that 99: the extension copies ~30 computed styles
 * onto the span it injects to materialise a pseudo-element, and `zIndex` was
 * not among them. The pseudo therefore arrived with no z-index, `?? 0` guessed
 * zero, `inFlowPositionedZFloor` read the swiper's 1, and `0 < 1` classified
 * both fades as "behind" — `sortChildrenForStacking` moved them to the front of
 * the array, which in Figma is the BACK of the paint stack. The cards covered
 * them and the fades vanished.
 *
 * Published extension builds are frozen and will keep sending pseudo nodes with
 * no z-index, so the renderer has to treat `undefined` on a pseudo wrapper as
 * "unknown" rather than zero, and leave DOM order alone.
 *
 * The hero on the same page was never affected: its in-flow child is a plain
 * static `div`, so `inFlowPositionedZFloor` returns undefined, no floor exists,
 * and nothing gets buried.
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
    width: 1332,
    height: 468,
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

/** The quotes carousel exactly as chroniclehq.com captures it today. */
function quotesCarousel(zIndex?: number): WireframeNode[] {
  const pseudo = (name: string, className: string) =>
    makeNode(name, { position: "absolute", className, ...(zIndex === undefined ? {} : { zIndex }) });
  return [
    pseudo("span.__w2w-pseudo-before", "__w2w-pseudo-before"),
    makeNode("div.swiper", { position: "relative", zIndex: 1 }),
    pseudo("span.__w2w-pseudo-after", "__w2w-pseudo-after"),
  ];
}

describe("a pseudo-element whose z-index never reached the capture", () => {
  it("keeps DOM order instead of being buried under the in-flow floor", () => {
    expect(names(sortChildrenForStacking(quotesCarousel(), "VERTICAL"))).toEqual([
      "span.__w2w-pseudo-before",
      "div.swiper",
      "span.__w2w-pseudo-after",
    ]);
  });

  it("falls back to `auto` semantics in absolute mode, where only the capture can help", () => {
    // Absolute mode places children by z-index outright, and an unknown value
    // has to become something. Zero is the honest choice: it is what CSS does
    // with `z-index: auto`, and no guess the renderer makes can recover a 99 it
    // was never told about. Capturing the real value is what fixes this path —
    // see the `'zIndex'` entry in the extension's pseudo style list.
    expect(names(sortChildrenForStacking(quotesCarousel(), "NONE"))).toEqual([
      "span.__w2w-pseudo-before",
      "span.__w2w-pseudo-after",
      "div.swiper",
    ]);
  });

  it("puts the fades on top in absolute mode once the z-index is captured", () => {
    expect(names(sortChildrenForStacking(quotesCarousel(99), "NONE"))).toEqual([
      "div.swiper",
      "span.__w2w-pseudo-before",
      "span.__w2w-pseudo-after",
    ]);
  });

  it("paints the fades on top once the capture does carry their z-index", () => {
    expect(names(sortChildrenForStacking(quotesCarousel(99), "VERTICAL"))).toEqual([
      "div.swiper",
      "span.__w2w-pseudo-before",
      "span.__w2w-pseudo-after",
    ]);
  });

  it("still buries a pseudo that really is a backdrop", () => {
    const children = [
      makeNode("span.__w2w-pseudo-before", {
        position: "absolute",
        className: "__w2w-pseudo-before",
        zIndex: -1,
      }),
      makeNode("div.content", { position: "relative", zIndex: 1 }),
    ];
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "span.__w2w-pseudo-before",
      "div.content",
    ]);
  });

  it("leaves ordinary elements on the old guess — only pseudo wrappers are exempt", () => {
    // stripe.com's backdrop carries an explicit `z-index: 0`, so it is a
    // captured number and the floor still applies to it.
    const children = [
      makeNode("div.section-container", { position: "relative", zIndex: 1 }),
      makeNode("div.section-background", { position: "absolute", zIndex: 0 }),
    ];
    expect(names(sortChildrenForStacking(children, "VERTICAL"))).toEqual([
      "div.section-background",
      "div.section-container",
    ]);
  });
});
