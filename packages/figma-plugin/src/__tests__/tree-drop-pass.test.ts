/**
 * Drop pass — h2d `l8` (app.js:40341) parity.
 *
 * Deletes nodes that carry no information: zero-font text, degenerate boxes,
 * and painted-nothing childless frames. Runs bottom-up so a wrapper whose only
 * child was just dropped becomes eligible in the same sweep.
 *
 * Two narrowings from h2d (they place absolutely, so they can be looser):
 *   - a degenerate node with surviving children is kept — dropping it would
 *     delete its visible subtree;
 *   - a painted-nothing childless frame is dropped only when it is a sliver.
 *     An empty box at real size occupies flow space AND one itemSpacing gap
 *     in a Figma auto-layout parent, so removing it shifts every later
 *     sibling; out of flow it is safe to drop, but an unpainted fixed overlay
 *     is more often lost paint than genuine noise, so we keep it.
 */
import { describe, it, expect } from "vitest";
import { dropUselessNodes } from "../rendering/treeSimplify";
import type { WireframeNode, FigmaFill, FigmaStroke } from "../types";

let seq = 0;

const sides = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

function node(over: Partial<WireframeNode> = {}): WireframeNode {
  seq += 1;
  return {
    id: `n${seq}`,
    name: over.name || `n${seq}`,
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    padding: sides(),
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#000000",
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
    isPlaceholder: false,
    children: [],
    ...over,
  };
}

const solidFill = (): FigmaFill => ({
  type: "SOLID",
  visible: true,
  opacity: 1,
  color: { r: 1, g: 0, b: 0, a: 1 },
});

const stroke = (position: FigmaStroke["position"]): FigmaStroke => ({
  color: { r: 0, g: 0, b: 0, a: 1 },
  weight: 1,
  position,
  style: "SOLID",
});

const names = (n: WireframeNode): string[] => n.children.map((c) => c.name);

describe("drop pass: nodes that carry no information", () => {
  it("1. drops a TEXT node with fontSize 0", () => {
    const root = node({
      name: "root",
      children: [
        node({ name: "ghost", type: "text", fontSize: 0, textContent: "x" }),
        node({ name: "real", type: "text", fontSize: 14, textContent: "hi" }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(true);
    expect(names(root)).toEqual(["real"]);
  });

  it("2. drops a degenerate (0x0) childless empty div", () => {
    const root = node({
      name: "root",
      children: [node({ name: "zero", width: 0, height: 0 })],
    });

    expect(dropUselessNodes(root)).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it("3. keeps a degenerate wrapper that still has a painted child", () => {
    const root = node({
      name: "root",
      children: [
        node({
          name: "zero-wrapper",
          width: 0,
          height: 0,
          children: [node({ name: "painted", fills: [solidFill()] })],
        }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(false);
    expect(names(root)).toEqual(["zero-wrapper"]);
    expect(names(root.children[0])).toEqual(["painted"]);
  });

  it("4. keeps an empty div that paints (fills / legacy backgroundColor)", () => {
    const root = node({
      name: "root",
      children: [
        node({ name: "painted", fills: [solidFill()] }),
        node({ name: "legacy-bg", backgroundColor: "#ff0000" }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(false);
    expect(names(root)).toEqual(["painted", "legacy-bg"]);
  });

  it("5. keeps an empty frame that clips its content", () => {
    const root = node({
      name: "root",
      children: [
        // A sliver, so the clip guard is what saves it — not its size.
        node({ name: "clipper", width: 100, height: 0.2, overflow: "hidden" }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(false);
    expect(names(root)).toEqual(["clipper"]);
  });

  it("6. keeps a degenerate node carrying an OUTSIDE stroke", () => {
    const root = node({
      name: "root",
      children: [
        node({
          name: "outline",
          width: 0,
          height: 0,
          strokes: [stroke("OUTSIDE")],
        }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(false);
    expect(names(root)).toEqual(["outline"]);
  });

  it("7. keeps a paintless frame that carries textContent", () => {
    const root = node({
      name: "root",
      children: [
        node({ name: "li", width: 100, height: 0.2, textContent: "Item one" }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(false);
    expect(names(root)).toEqual(["li"]);
  });

  it("8. keeps paintless image / svg payload nodes", () => {
    const root = node({
      name: "root",
      children: [
        node({
          name: "img",
          type: "placeholder",
          isPlaceholder: true,
          width: 100,
          height: 0.2,
        }),
        node({
          name: "svg",
          width: 100,
          height: 0.2,
          computedStyles: { svgMarkup: "<svg/>" },
        }),
        node({ name: "bg-img", width: 100, height: 0.2, imageUrl: "a.png" }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(false);
    expect(names(root)).toEqual(["img", "svg", "bg-img"]);
  });

  it("9. keeps an empty box at real size, in flow or out of it", () => {
    // In flow: dropping it would remove its flow slot AND one itemSpacing gap,
    // shifting every later sibling.
    const inFlow = node({
      name: "root",
      children: [node({ name: "spacer", width: 100, height: 40 })],
    });
    expect(dropUselessNodes(inFlow)).toBe(false);
    expect(names(inFlow)).toEqual(["spacer"]);

    // Out of flow: h2d drops this one, we deliberately do not — an unpainted
    // fixed overlay is more often lost paint than genuine noise.
    const outOfFlow = node({
      name: "root",
      children: [
        node({ name: "overlay", width: 100, height: 40, position: "fixed" }),
      ],
    });
    expect(dropUselessNodes(outOfFlow)).toBe(false);
    expect(names(outOfFlow)).toEqual(["overlay"]);
  });

  it("9b. drops an in-flow sliver (sub-0.5px on one axis)", () => {
    const root = node({
      name: "root",
      children: [node({ name: "hairline", width: 100, height: 0.2 })],
    });

    expect(dropUselessNodes(root)).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it("10. cascades: a wrapper whose only child is dropped goes in the same sweep", () => {
    const root = node({
      name: "root",
      children: [
        node({
          name: "wrapper",
          width: 0,
          height: 0,
          children: [node({ name: "zero-leaf", width: 0, height: 0 })],
        }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it("11. never drops the root, however empty it is", () => {
    const root = node({ name: "root", width: 0, height: 0 });

    expect(dropUselessNodes(root)).toBe(false);
    expect(root.name).toBe("root");
  });

  it("12. keeps nodes that carry hover identity", () => {
    const root = node({
      name: "root",
      children: [
        node({
          name: "hover-target",
          width: 100,
          height: 0.2,
          pseudoStateStyles: { hover: { opacity: "0.5" } },
        }),
        node({ name: "hidden-variant", width: 100, height: 0.2, isHiddenInDefault: true }),
      ],
    });

    expect(dropUselessNodes(root)).toBe(false);
    expect(names(root)).toEqual(["hover-target", "hidden-variant"]);
  });
});
