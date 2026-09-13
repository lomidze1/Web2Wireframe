/**
 * Paint-aware single-child collapse — h2d `h8` (app.js:39992) + the transplant
 * in `Oj` (app.js:40408).
 *
 * `<div class="card"><div class="card-inner">…</div></div>` — a painted parent
 * whose single child fills it exactly — is the most common redundant pattern on
 * real sites, and we used to keep both frames.
 *
 * ## What "visually neutral" means here, and how these tests prove it
 *
 * Figma paints a frame as `fills → strokes → children`, so before the merge the
 * order is `P.fills, P.strokes, C.fills, C.strokes, C.children` and after it is
 * `[P.fills … C.fills], merged.strokes, C.children`. Every collapse test below
 * asserts the survivor's absolute position, size, the full fills array IN
 * ORDER, strokes, opacity, corner radius, clipping and children — i.e. the
 * complete set of inputs to that paint order. A case where the order could not
 * be reproduced is asserted to NOT collapse.
 */
import { describe, it, expect } from "vitest";
import { collapseSingleChildFrames } from "../rendering/treeSimplify";
import type { WireframeNode, FigmaFill, FigmaStroke, FigmaEffect } from "../types";

let seq = 0;

const sides = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

function node(over: Partial<WireframeNode> = {}): WireframeNode {
  seq += 1;
  return {
    id: `n${seq}`,
    name: over.name ?? "",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 300,
    height: 200,
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

const fill = (r: number): FigmaFill => ({
  type: "SOLID",
  visible: true,
  opacity: 1,
  color: { r, g: 0, b: 0, a: 1 },
});

const stroke = (position: FigmaStroke["position"] = "INSIDE"): FigmaStroke => ({
  color: { r: 0, g: 0, b: 1, a: 1 },
  weight: 2,
  position,
  style: "SOLID",
});

const shadow = (): FigmaEffect => ({
  type: "DROP_SHADOW",
  visible: true,
  color: { r: 0, g: 0, b: 0, a: 0.2 },
  offset: { x: 0, y: 2 },
  radius: 4,
});

/** `root > card > inner` — the shape every test below starts from. */
function tree(
  cardOver: Partial<WireframeNode> = {},
  innerOver: Partial<WireframeNode> = {},
): { root: WireframeNode; card: WireframeNode; inner: WireframeNode } {
  const grandchild = node({ name: "grandchild", width: 100, height: 20 });
  const inner = node({
    name: "inner",
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    children: [grandchild],
    ...innerOver,
  });
  const card = node({
    name: "card",
    x: 40,
    y: 60,
    width: 300,
    height: 200,
    children: [inner],
    ...cardOver,
  });
  const root = node({ name: "root", width: 1000, height: 800, children: [card] });
  return { root, card, inner };
}

describe("single-child collapse: the collapsing cases", () => {
  it("1. painted card + filling frame child collapses, paint order preserved", () => {
    const { root, inner } = tree(
      { fills: [fill(1)], borderRadius: 12, opacity: 1 },
      { fills: [fill(0.5)], borderRadius: 12 },
    );

    expect(collapseSingleChildFrames(root)).toBe(true);
    expect(root.children).toHaveLength(1);

    const merged = root.children[0];
    expect(merged).toBe(inner);
    // Visual neutrality, in full:
    expect(merged.x).toBe(40); // 40 (card) + 0 (inner)
    expect(merged.y).toBe(60);
    expect(merged.width).toBe(300);
    expect(merged.height).toBe(200);
    expect(merged.fills).toEqual([fill(1), fill(0.5)]); // parent's BEHIND child's
    expect(merged.strokes).toBeUndefined();
    expect(merged.opacity).toBe(1);
    expect(merged.borderRadius).toBe(12);
    expect(merged.overflow).toBeUndefined();
    expect(merged.children.map((c) => c.name)).toEqual(["grandchild"]);
  });

  it("2. a child inset by 4px does NOT collapse", () => {
    const { root } = tree({ fills: [fill(1)] }, { x: 4, y: 4, width: 292, height: 192 });

    expect(collapseSingleChildFrames(root)).toBe(false);
    expect(root.children[0].name).toBe("card");
  });

  it("3. a text child and an image child never collapse", () => {
    const text = tree({ fills: [fill(1)] }, { type: "text", textContent: "Hi", children: [] });
    expect(collapseSingleChildFrames(text.root)).toBe(false);
    expect(text.root.children[0].name).toBe("card");

    const img = tree(
      { fills: [fill(1)] },
      { type: "placeholder", isPlaceholder: true, children: [] },
    );
    expect(collapseSingleChildFrames(img.root)).toBe(false);

    const svg = tree(
      { fills: [fill(1)] },
      { computedStyles: { svgMarkup: "<svg/>" }, children: [] },
    );
    expect(collapseSingleChildFrames(svg.root)).toBe(false);
  });

  it("4. a parent with two children does not collapse", () => {
    const { root, card } = tree({ fills: [fill(1)] });
    card.children.push(node({ name: "second", width: 300, height: 200 }));

    expect(collapseSingleChildFrames(root)).toBe(false);
    expect(root.children[0].name).toBe("card");
  });

  it("5. parent stroke + child fills does NOT collapse (paint order)", () => {
    const { root } = tree({ strokes: [stroke()] }, { fills: [fill(0.5)] });

    expect(collapseSingleChildFrames(root)).toBe(false);
    expect(root.children[0].name).toBe("card");
  });

  it("6. parent stroke + paintless child collapses, stroke transplanted", () => {
    const { root, inner } = tree(
      { strokes: [stroke()], borderColor: "#0000ff", borderWidth: 2, fills: [fill(1)] },
      {},
    );

    expect(collapseSingleChildFrames(root)).toBe(true);
    const merged = root.children[0];
    expect(merged).toBe(inner);
    expect(merged.strokes).toEqual([stroke()]);
    expect(merged.borderColor).toBe("#0000ff");
    expect(merged.borderWidth).toBe(2);
    expect(merged.fills).toEqual([fill(1)]);
    expect(merged.x).toBe(40);
    expect(merged.y).toBe(60);
  });

  it("6b. an OUTSIDE parent stroke does not collapse", () => {
    const { root } = tree({ strokes: [stroke("OUTSIDE")] }, {});
    expect(collapseSingleChildFrames(root)).toBe(false);
  });

  it("7. a parent with effects does not collapse", () => {
    const { root } = tree({ fills: [fill(1)], effects: [shadow()] }, {});

    expect(collapseSingleChildFrames(root)).toBe(false);
    expect(root.children[0].name).toBe("card");
  });

  it("8. differing radii do not collapse when both sides paint", () => {
    const { root } = tree(
      { fills: [fill(1)], borderRadius: 12 },
      { fills: [fill(0.5)], borderRadius: 0 },
    );

    expect(collapseSingleChildFrames(root)).toBe(false);
  });

  it("8b. differing radii DO collapse when the parent paints nothing and does not clip", () => {
    const { root, inner } = tree({ borderRadius: 12 }, { fills: [fill(0.5)], borderRadius: 4 });

    expect(collapseSingleChildFrames(root)).toBe(true);
    expect(root.children[0]).toBe(inner);
    expect(root.children[0].borderRadius).toBe(4); // the visible one survives
  });

  it("9. position fixed / sticky never collapses", () => {
    for (const position of ["fixed", "sticky"] as const) {
      const onParent = tree({ fills: [fill(1)], position }, {});
      expect(collapseSingleChildFrames(onParent.root)).toBe(false);

      const onChild = tree({ fills: [fill(1)] }, { position });
      expect(collapseSingleChildFrames(onChild.root)).toBe(false);
    }
  });

  it("10. hover identity on either side blocks the collapse", () => {
    const onParent = tree(
      { fills: [fill(1)], pseudoStateStyles: { hover: { opacity: "0.8" } } },
      {},
    );
    expect(collapseSingleChildFrames(onParent.root)).toBe(false);

    const onChild = tree(
      { fills: [fill(1)] },
      { pseudoStateStyles: { hover: { opacity: "0.8" } } },
    );
    expect(collapseSingleChildFrames(onChild.root)).toBe(false);

    const hiddenVariant = tree({ fills: [fill(1)] }, { isHiddenInDefault: true });
    expect(collapseSingleChildFrames(hiddenVariant.root)).toBe(false);
  });

  it("11. opacities multiply", () => {
    const { root } = tree({ fills: [fill(1)], opacity: 0.5 }, { opacity: 0.5 });

    expect(collapseSingleChildFrames(root)).toBe(true);
    expect(root.children[0].opacity).toBe(0.25);
  });

  it("12. a clipping parent hands its clip to the merged node", () => {
    const { root } = tree({ fills: [fill(1)], overflow: "hidden" }, {});

    expect(collapseSingleChildFrames(root)).toBe(true);
    expect(root.children[0].overflow).toBe("hidden");
  });

  it("13. the parent's outer-layout constraints survive on the merged node", () => {
    const { root } = tree(
      {
        fills: [fill(1)],
        layoutGrow: 1,
        layoutAlign: "STRETCH",
        layoutSizingHorizontal: "FILL",
        layoutSizingVertical: "HUG",
        gridColumnStart: 2,
        gridRowStart: 3,
        cssMaxWidth: 640,
        zIndex: 5,
        cssOrder: 2,
        alignSelf: "center",
        margin: { top: 8, right: 0, bottom: 8, left: 0 },
      },
      {
        layoutGrow: 0,
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "FIXED",
      },
    );

    expect(collapseSingleChildFrames(root)).toBe(true);
    const merged = root.children[0];
    expect(merged.layoutGrow).toBe(1);
    expect(merged.layoutAlign).toBe("STRETCH");
    expect(merged.layoutSizingHorizontal).toBe("FILL");
    expect(merged.layoutSizingVertical).toBe("HUG");
    expect(merged.gridColumnStart).toBe(2);
    expect(merged.gridRowStart).toBe(3);
    expect(merged.cssMaxWidth).toBe(640);
    expect(merged.zIndex).toBe(5);
    expect(merged.cssOrder).toBe(2);
    expect(merged.alignSelf).toBe("center");
    expect(merged.margin).toEqual({ top: 8, right: 0, bottom: 8, left: 0 });
  });

  it("13b. a margined CHILD blocks the collapse (nodes.ts would wrap it)", () => {
    const { root } = tree(
      { fills: [fill(1)] },
      { margin: { top: 0, right: 0, bottom: 12, left: 0 } },
    );

    expect(collapseSingleChildFrames(root)).toBe(false);
  });

  it("14. names chain the h2d way", () => {
    const { root } = tree({ name: "Section", fills: [fill(1)] }, { name: "Container" });

    expect(collapseSingleChildFrames(root)).toBe(true);
    expect(root.children[0].name).toBe("Section → Container");
  });

  it("14b. two empty names stay empty so stage-2 role naming still runs", () => {
    const { root } = tree({ name: "", fills: [fill(1)] }, { name: "" });

    expect(collapseSingleChildFrames(root)).toBe(true);
    expect(root.children[0].name).toBe("");
  });

  it("15. a mix-blend-mode on either side blocks the collapse", () => {
    const onParent = tree({ fills: [fill(1)], blendMode: "multiply" }, {});
    expect(collapseSingleChildFrames(onParent.root)).toBe(false);

    const onChild = tree({ fills: [fill(1)] }, { blendMode: "multiply" });
    expect(collapseSingleChildFrames(onChild.root)).toBe(false);
  });

  it("16. a transformed node never collapses", () => {
    // `transform` is only set for a non-identity matrix (parseCssTransform
    // early-outs on near-identity), so its presence alone is the signal.
    const rotated = {
      a: 0.99, b: 0.07, c: -0.07, d: 0.99,
      translateX: 0, translateY: 0,
      rotation: 4, scaleX: 1, scaleY: 1, skewX: 0,
    };

    const onParent = tree({ fills: [fill(1)], transform: rotated }, {});
    expect(collapseSingleChildFrames(onParent.root)).toBe(false);

    const onChild = tree({ fills: [fill(1)] }, { transform: rotated });
    expect(collapseSingleChildFrames(onChild.root)).toBe(false);
  });

  it("17. chains collapse bottom-up in one sweep (a > b > c, all filling)", () => {
    const leaf = node({ name: "leaf", width: 300, height: 200, children: [] });
    const c = node({ name: "c", width: 300, height: 200, children: [leaf] });
    const b = node({ name: "b", width: 300, height: 200, children: [c] });
    const a = node({ name: "a", x: 10, y: 20, width: 300, height: 200, children: [b] });
    const root = node({ name: "root", width: 1000, height: 800, children: [a] });

    expect(collapseSingleChildFrames(root)).toBe(true);
    // Each sweep folds every collapsible parent it meets; whatever survives is
    // handled by the fixpoint loop in simplifyTree.
    expect(root.children).toHaveLength(1);
    expect(root.children[0].x).toBe(10);
    expect(root.children[0].y).toBe(20);
  });

  it("18. the root itself is never folded away", () => {
    const only = node({ name: "only", width: 1000, height: 800 });
    const root = node({ name: "root", width: 1000, height: 800, children: [only] });

    expect(collapseSingleChildFrames(root)).toBe(false);
    expect(root.name).toBe("root");
    expect(root.children[0]).toBe(only);
  });
});
