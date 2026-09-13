import { describe, it, expect } from "vitest";
import { collapseMarginWrappers } from "../rendering/marginCollapse";
import { needsMarginWrapper } from "../rendering/layout";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Sides = { top: number; right: number; bottom: number; left: number };

const sides = (v: Partial<Sides> = {}): Sides => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  ...v,
});

let seq = 0;

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

// ---------------------------------------------------------------------------
// Spacing model — the exactness oracle
//
// Describes every gap the CURRENT wrapper implementation renders for a parent:
// a `{name}:margin` frame carries the child's margin as padding (negatives
// clamped to 0 — see createMarginWrapper in layout.ts), so the rendered
// spacing is fully determined by the parent's padding/itemSpacing plus the
// per-child margins. A collapse is only admissible when this model is
// bit-identical before and after.
// ---------------------------------------------------------------------------

const clamp = (v: number | undefined): number => Math.max(0, v || 0);

function spacingModel(parent: WireframeNode): {
  leading: number;
  gaps: number[];
  trailing: number;
  crossStart: number[];
  crossEnd: number[];
} {
  const kids = parent.children.filter(
    (c) => c.position !== "absolute" && c.position !== "fixed"
  );
  const horizontal = parent.layoutMode === "HORIZONTAL";
  const m = (c: WireframeNode) => c.margin;
  const mainStart = (c: WireframeNode) =>
    clamp(horizontal ? m(c)?.left : m(c)?.top);
  const mainEnd = (c: WireframeNode) =>
    clamp(horizontal ? m(c)?.right : m(c)?.bottom);
  const crossStartOf = (c: WireframeNode) =>
    clamp(horizontal ? m(c)?.top : m(c)?.left);
  const crossEndOf = (c: WireframeNode) =>
    clamp(horizontal ? m(c)?.bottom : m(c)?.right);
  const padMainStart = horizontal ? parent.padding.left : parent.padding.top;
  const padMainEnd = horizontal ? parent.padding.right : parent.padding.bottom;
  const padCrossStart = horizontal ? parent.padding.top : parent.padding.left;
  const padCrossEnd = horizontal ? parent.padding.bottom : parent.padding.right;

  const gaps: number[] = [];
  for (let i = 1; i < kids.length; i++) {
    gaps.push(parent.itemSpacing + mainEnd(kids[i - 1]) + mainStart(kids[i]));
  }
  return {
    leading: padMainStart + (kids.length ? mainStart(kids[0]) : 0),
    gaps,
    trailing: padMainEnd + (kids.length ? mainEnd(kids[kids.length - 1]) : 0),
    crossStart: kids.map((c) => padCrossStart + crossStartOf(c)),
    crossEnd: kids.map((c) => padCrossEnd + crossEndOf(c)),
  };
}

/** Snapshot the spacing model of every frame in the tree, keyed by node id. */
function modelTree(root: WireframeNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (n: WireframeNode): void => {
    out[n.id] = spacingModel(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

function countWrappers(root: WireframeNode): number {
  let n = 0;
  const walk = (p: WireframeNode): void => {
    for (const c of p.children) {
      if (
        c.position !== "absolute" &&
        c.position !== "fixed" &&
        needsMarginWrapper(c.margin)
      ) {
        n += 1;
      }
      walk(c);
    }
  };
  walk(root);
  return n;
}

/** Run the pass and assert it did not move anything. */
function collapseExactly(root: WireframeNode): void {
  const before = modelTree(root);
  collapseMarginWrappers(root);
  expect(modelTree(root)).toEqual(before);
}

// ---------------------------------------------------------------------------
// Rule 1 — sole flow child → parent padding
// ---------------------------------------------------------------------------

describe("collapseMarginWrappers — rule 1: sole child", () => {
  it("folds a sole child's margin into the parent's padding", () => {
    const child = node({ margin: sides({ top: 16, bottom: 24, left: 8, right: 4 }) });
    const parent = node({ padding: sides({ top: 10, left: 2 }), children: [child] });

    collapseExactly(parent);

    expect(child.margin).toBeUndefined();
    expect(parent.padding).toEqual({ top: 26, right: 4, bottom: 24, left: 10 });
    expect(countWrappers(parent)).toBe(0);
  });

  it("skips a parent whose child has any negative margin side", () => {
    // nodes.ts folds negative margins into the wrapper's maxWidth unclamped,
    // so collapsing would keep spacing exact but change the max width.
    const child = node({ margin: sides({ top: -12, bottom: 20 }) });
    const parent = node({ children: [child] });

    collapseExactly(parent);

    expect(parent.padding).toEqual(sides());
    expect(child.margin).toEqual(sides({ top: -12, bottom: 20 }));
  });

  it("a wholly negative margin survives collapse AND still earns a wrapper", () => {
    // Pins both halves of the bleed fix together, which is the only way to
    // pin either: `clearIfEmpty`'s `=== 0` guard is unreachable on its own
    // (the parent bails out above it), and `needsMarginWrapper`'s `!== 0` is
    // worthless if the margin has already been deleted by the time it runs.
    // stripe.com's `div.stats-section__stats-menu` is this exact node.
    const child = node({ margin: sides({ left: -15, right: -15 }) });
    const parent = node({ children: [child] });

    collapseExactly(parent);

    expect(child.margin).toEqual(sides({ left: -15, right: -15 }));
    expect(needsMarginWrapper(child.margin)).toBe(true);
  });

  it("works on a HORIZONTAL parent too", () => {
    const child = node({ margin: sides({ left: 12, right: 6 }) });
    const parent = node({ layoutMode: "HORIZONTAL", children: [child] });

    collapseExactly(parent);

    expect(parent.padding).toEqual({ top: 0, right: 6, bottom: 0, left: 12 });
  });

  it("treats an absolute sibling as not-in-flow, so the child still counts as sole", () => {
    const abs = node({ position: "absolute", margin: sides({ top: 9 }) });
    const child = node({ margin: sides({ top: 16 }) });
    const parent = node({ children: [abs, child] });

    collapseExactly(parent);

    expect(child.margin).toBeUndefined();
    expect(parent.padding.top).toBe(16);
    // The absolute child never had a wrapper, and keeps its margin untouched.
    expect(abs.margin).toEqual(sides({ top: 9 }));
  });

  it("recurses into nested parents", () => {
    const inner = node({ margin: sides({ left: 5 }) });
    const mid = node({ margin: sides({ top: 7 }), children: [inner] });
    const outer = node({ children: [mid] });

    collapseExactly(outer);

    expect(outer.padding.top).toBe(7);
    expect(mid.padding.left).toBe(5);
    expect(countWrappers(outer)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — vertical stack, uniform main-axis margin sum → itemSpacing
// ---------------------------------------------------------------------------

describe("collapseMarginWrappers — rule 2: vertical main axis", () => {
  it("folds a uniform margin-bottom stack into itemSpacing", () => {
    const kids = [
      node({ margin: sides({ bottom: 16 }) }),
      node({ margin: sides({ bottom: 16 }) }),
      node(),
    ];
    const parent = node({ children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(16);
    expect(countWrappers(parent)).toBe(0);
    expect(kids.every((k) => k.margin === undefined)).toBe(true);
  });

  it("adds to an existing CSS gap rather than replacing it", () => {
    const kids = [node({ margin: sides({ bottom: 10 }) }), node()];
    const parent = node({ itemSpacing: 8, children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(18);
  });

  it("sums adjacent bottom+top margins the way the wrapper pair does", () => {
    // The wrappers stack: prev's padding-bottom (6) then next's padding-top (4).
    const kids = [
      node({ margin: sides({ bottom: 6 }) }),
      node({ margin: sides({ top: 4, bottom: 6 }) }),
      node({ margin: sides({ top: 4 }) }),
    ];
    const parent = node({ children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(10);
    expect(countWrappers(parent)).toBe(0);
  });

  it("moves the first child's top and the last child's bottom into padding", () => {
    const kids = [
      node({ margin: sides({ top: 20, bottom: 12 }) }),
      node({ margin: sides({ bottom: 30 }) }),
    ];
    const parent = node({ padding: sides({ top: 5, bottom: 5 }), children: kids });

    collapseExactly(parent);

    expect(parent.padding.top).toBe(25);
    expect(parent.padding.bottom).toBe(35);
    expect(parent.itemSpacing).toBe(12);
  });

  it("keeps the wrappers when the gaps are not uniform", () => {
    // iwm.org.uk `div.teaser__content`: gaps of 16, 8, 16 — no single
    // itemSpacing can express that.
    const kids = [
      node(),
      node({ margin: sides({ top: 16, bottom: 8 }) }),
      node({ margin: sides({ bottom: 16 }) }),
      node(),
    ];
    const parent = node({ children: kids });
    const before = kids.map((k) => k.margin);

    collapseExactly(parent);

    expect(kids.map((k) => k.margin)).toEqual(before);
    expect(parent.itemSpacing).toBe(0);
  });

  it("keeps the wrappers when any sibling also carries a side margin", () => {
    const kids = [
      node({ margin: sides({ bottom: 16 }) }),
      node({ margin: sides({ left: 12 }) }),
    ];
    const parent = node({ children: kids });

    collapseExactly(parent);

    expect(kids[0].margin).toEqual(sides({ bottom: 16 }));
    expect(kids[1].margin).toEqual(sides({ left: 12 }));
  });

  it("applies to a block container (layoutMode NONE renders as VERTICAL)", () => {
    const kids = [node({ margin: sides({ bottom: 24 }) }), node()];
    const parent = node({ layoutMode: "NONE", children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(24);
  });

  it("ignores absolute siblings when testing uniformity", () => {
    const kids = [
      node({ margin: sides({ bottom: 16 }) }),
      node({ position: "absolute", margin: sides({ left: 99 }) }),
      node(),
    ];
    const parent = node({ children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(16);
    expect(kids[1].margin).toEqual(sides({ left: 99 }));
  });

  it("skips reversed flex parents — nodes.ts appends those children backwards", () => {
    const kids = [
      node({ margin: sides({ bottom: 16 }) }),
      node({ margin: sides({ top: 4 }) }),
    ];
    const parent = node({
      layoutMode: "VERTICAL",
      flexDirection: "column-reverse",
      children: kids,
    });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(0);
    expect(kids[0].margin).toEqual(sides({ bottom: 16 }));
  });

  it("skips parents whose children carry CSS order (sortByFlexOrder reorders them)", () => {
    const kids = [
      node({ margin: sides({ bottom: 16 }), cssOrder: 2 }),
      node({ margin: sides({ bottom: 16 }) }),
      node(),
    ];
    const parent = node({ layoutMode: "VERTICAL", children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(0);
    expect(kids[0].margin).toEqual(sides({ bottom: 16 }));
  });

  it("leaves the whole parent alone when a sibling has a negative margin", () => {
    const kids = [
      node({ margin: sides({ bottom: -8 }) }),
      node({ margin: sides({ top: 12 }) }),
      node({ margin: sides({ top: 12 }) }),
    ];
    const parent = node({ children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(0);
    expect(kids[1].margin).toEqual(sides({ top: 12 }));
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — horizontal row, uniform main-axis margin sum → itemSpacing
// ---------------------------------------------------------------------------

describe("collapseMarginWrappers — rule 3: horizontal main axis", () => {
  it("folds a uniform margin-left row into itemSpacing (telex.ge float columns)", () => {
    const kids = [
      node(),
      node({ margin: sides({ left: 25.5 }) }),
      node({ margin: sides({ left: 25.5 }) }),
      node({ margin: sides({ left: 25.5 }) }),
    ];
    const parent = node({ layoutMode: "HORIZONTAL", children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(25.5);
    expect(countWrappers(parent)).toBe(0);
  });

  it("moves the outer left/right margins into padding", () => {
    const kids = [
      node({ margin: sides({ left: 30, right: 10 }) }),
      node({ margin: sides({ left: 10, right: 40 }) }),
    ];
    const parent = node({ layoutMode: "HORIZONTAL", children: kids });

    collapseExactly(parent);

    expect(parent.padding.left).toBe(30);
    expect(parent.padding.right).toBe(40);
    expect(parent.itemSpacing).toBe(20);
  });

  it("keeps the wrappers on a non-uniform row", () => {
    const kids = [
      node({ margin: sides({ right: 48 }) }),
      node(),
      node({ margin: sides({ right: 12 }) }),
      node(),
    ];
    const parent = node({ layoutMode: "HORIZONTAL", children: kids });

    collapseExactly(parent);

    expect(parent.itemSpacing).toBe(0);
    expect(countWrappers(parent)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — uniform cross-axis margin → parent padding
// ---------------------------------------------------------------------------

describe("collapseMarginWrappers — rule 4: uniform cross axis", () => {
  it("folds an identical cross-axis margin into the parent's padding", () => {
    const kids = [
      node({ margin: sides({ top: 5, bottom: 5 }) }),
      node({ margin: sides({ top: 5, bottom: 5 }) }),
    ];
    const parent = node({ layoutMode: "HORIZONTAL", children: kids });

    collapseExactly(parent);

    expect(parent.padding.top).toBe(5);
    expect(parent.padding.bottom).toBe(5);
    expect(countWrappers(parent)).toBe(0);
  });

  it("unblocks the main-axis collapse (iwm.org.uk ul.navigation__menu)", () => {
    // 5 <li> sharing `margin: 5px 22px 5px 11px` — the cross-axis pair used to
    // veto the main-axis rule, so all five kept a wrapper.
    const kids = Array.from({ length: 5 }, () =>
      node({ margin: sides({ top: 5, right: 22, bottom: 5, left: 11 }) })
    );
    const parent = node({ layoutMode: "HORIZONTAL", children: kids });

    collapseExactly(parent);

    expect(parent.padding).toEqual({ top: 5, right: 22, bottom: 5, left: 11 });
    expect(parent.itemSpacing).toBe(33);
    expect(countWrappers(parent)).toBe(0);
  });

  it("does nothing when the siblings' cross-axis margins differ", () => {
    const kids = [
      node({ margin: sides({ top: 5, bottom: 5 }) }),
      node({ margin: sides({ top: 9, bottom: 5 }) }),
    ];
    const parent = node({ layoutMode: "HORIZONTAL", children: kids });

    collapseExactly(parent);

    expect(parent.padding.top).toBe(0);
    expect(countWrappers(parent)).toBe(2);
  });

  it("applies on the vertical axis too (uniform left/right in a column)", () => {
    const kids = [
      node({ margin: sides({ left: 12, right: 12 }) }),
      node({ margin: sides({ left: 12, right: 12 }) }),
    ];
    const parent = node({ layoutMode: "VERTICAL", children: kids });

    collapseExactly(parent);

    expect(parent.padding.left).toBe(12);
    expect(parent.padding.right).toBe(12);
    expect(countWrappers(parent)).toBe(0);
  });

  it("is order-independent, so reversed parents still get it", () => {
    const kids = [
      node({ margin: sides({ top: 6, bottom: 6 }) }),
      node({ margin: sides({ top: 6, bottom: 6 }) }),
    ];
    const parent = node({
      layoutMode: "HORIZONTAL",
      flexDirection: "row-reverse",
      children: kids,
    });

    collapseExactly(parent);

    expect(parent.padding.top).toBe(6);
    expect(countWrappers(parent)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("collapseMarginWrappers — guards", () => {
  it("leaves GRID parents alone (grid children never get wrappers today)", () => {
    const child = node({ margin: sides({ top: 16 }) });
    const parent = node({ layoutMode: "GRID", children: [child] });

    collapseMarginWrappers(parent);

    expect(child.margin).toEqual(sides({ top: 16 }));
    expect(parent.padding.top).toBe(0);
  });

  it("does not touch an absolutely-positioned child's margin", () => {
    const abs = node({ position: "fixed", margin: sides({ top: 16 }) });
    const parent = node({ children: [abs] });

    collapseMarginWrappers(parent);

    expect(abs.margin).toEqual(sides({ top: 16 }));
    expect(parent.padding.top).toBe(0);
  });

  it("is a no-op when no child has a margin", () => {
    const child = node();
    const parent = node({ padding: sides({ top: 4 }), children: [child] });

    collapseMarginWrappers(parent);

    expect(parent.padding).toEqual(sides({ top: 4 }));
    expect(child.margin).toBeUndefined();
  });

  it("drops an all-zero margin object instead of leaving a dead wrapper trigger", () => {
    const child = node({ margin: sides() });
    const parent = node({ children: [child] });

    collapseMarginWrappers(parent);

    expect(parent.padding).toEqual(sides());
  });
});

// ---------------------------------------------------------------------------
// Margin collapsing through a block parent
// ---------------------------------------------------------------------------

/**
 * glinc.io: `<div class="reveal"><header style="margin-bottom:52px">…</header></div>`.
 * CSS collapses the header's bottom margin THROUGH the block parent, so the
 * parent measures 218px — exactly its child — and the next sibling starts 52px
 * lower. Folding that 52 into the parent's padding therefore has nowhere to go:
 * a 218px-tall frame cannot also hold 52px of bottom padding, and the gap
 * simply disappeared.
 */
describe("collapseMarginWrappers — margin collapsing through a block parent", () => {
  it("hands a sole child's bottom margin to the parent when the parent's box has no room", () => {
    const child = node({ height: 218, margin: sides({ bottom: 52 }) });
    const parent = node({ layoutMode: "NONE", height: 218, children: [child] });

    collapseMarginWrappers(parent);

    expect(parent.padding.bottom).toBe(0);
    expect(child.margin).toBeUndefined();
    expect(parent.margin).toEqual(sides({ bottom: 52 }));
  });

  it("still folds into padding when the parent's box does have room", () => {
    const child = node({ height: 218, margin: sides({ bottom: 52 }) });
    const parent = node({ layoutMode: "NONE", height: 270, children: [child] });

    collapseMarginWrappers(parent);

    expect(parent.padding.bottom).toBe(52);
    expect(child.margin).toBeUndefined();
    expect(parent.margin).toBeUndefined();
  });

  it("the handed-up margin reaches the grandparent as itemSpacing", () => {
    const header = node({ height: 218, margin: sides({ bottom: 52 }) });
    const reveal = node({ layoutMode: "NONE", height: 218, y: 0, children: [header] });
    const list = node({ layoutMode: "GRID", height: 391, y: 270 });
    const container = node({
      layoutMode: "NONE",
      height: 661,
      children: [reveal, list],
    });

    collapseMarginWrappers(container);

    expect(reveal.padding.bottom).toBe(0);
    expect(container.itemSpacing).toBe(52);
    expect(reveal.margin).toBeUndefined();
  });

  it("leaves a flex parent alone — margins do not collapse in a flex container", () => {
    const child = node({ height: 218, margin: sides({ bottom: 52 }) });
    const parent = node({ layoutMode: "VERTICAL", height: 218, children: [child] });

    collapseMarginWrappers(parent);

    expect(parent.padding.bottom).toBe(52);
    expect(parent.margin).toBeUndefined();
  });
});
