/**
 * stripe.com regression #03: `align-self: center` is dropped.
 *
 * "The backbone of global commerce" is centred in its 1234px row on the page
 * and flush left in our import. The capture carries the intent —
 * `h2.hds-heading.stats-section__title` has `align-self: center` — but the
 * per-child write in nodes.ts never survives: a Figma child's counter-axis
 * sizing and `layoutAlign` are one property, so the `layoutSizing*` write that
 * follows resets it. A whole 3321-node dump held zero MIN/CENTER/MAX.
 *
 * h2d never writes per-child alignment at all (`layoutAlign` in their sandbox
 * builder is only ever INHERIT or STRETCH). Their `H8`
 * (app.beautified.js:58150) wraps the child in a frame that spans the parent's
 * whole cross axis and centres it there:
 *
 *   h2.hds-heading:align-center  1234x116  VERTICAL  align-items: center
 *     └ h2.hds-heading           489x116   x = 372
 *
 * These tests pin both halves: the CSS decision (does this child need a
 * wrapper?) and the tree surgery (what does the wrapper look like?).
 */
import { describe, it, expect } from "vitest";

import { convertW2WToWireframe, resolveAlignSelfWrapper } from "../rendering/css-converter";
import { insertAlignWrappers } from "../rendering/alignWrappers";
import type { WireframeNode } from "../types";

/** The converter declares its own W2W types privately; borrow them here. */
type W2WFrame = Parameters<typeof resolveAlignSelfWrapper>[1] & { styles: W2WStyleBag };
type W2WStyleBag = Parameters<typeof resolveAlignSelfWrapper>[0];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function w2wFrame(
  styles: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): W2WFrame {
  const width = (overrides.width as number) ?? 100;
  const height = (overrides.height as number) ?? 50;
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width,
    height,
    quad: [0, 0, width, 0, width, height, 0, height],
    tag: "div",
    classList: [],
    attr: {},
    styles,
    children: [],
    ...overrides,
  } as unknown as W2WFrame;
}

/** A flex column with two in-flow children — h2d's `H8` precondition. */
function flexParent(
  parentStyles: Record<string, unknown>,
  childStyles: Record<string, unknown>,
): { parent: W2WFrame; child: W2WFrame } {
  const child = w2wFrame(childStyles, { width: 489, height: 116 });
  const sibling = w2wFrame({ display: "block" }, { width: 1234, height: 183, y: 196 });
  const parent = w2wFrame(parentStyles, {
    width: 1234,
    height: 378,
    children: [child, sibling],
  });
  return { parent, child };
}

function node(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: overrides.id ?? "n",
    name: overrides.name ?? "n",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
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
    lineHeight: "normal",
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  } as WireframeNode;
}

// ---------------------------------------------------------------------------
// 1. The CSS decision
// ---------------------------------------------------------------------------

describe("resolveAlignSelfWrapper", () => {
  it("wraps stripe.com's centred heading — parent declares no align-items", () => {
    const { parent, child } = flexParent(
      { display: "flex", flexDirection: "column" },
      { display: "block", alignSelf: "center" },
    );

    expect(resolveAlignSelfWrapper(child.styles, parent)).toBe("center");
  });

  it("wraps a start-aligned child inside a centring parent — stripe's 8 cards", () => {
    const { parent, child } = flexParent(
      { display: "flex", alignItems: "center" },
      { display: "block", alignSelf: "start" },
    );

    expect(resolveAlignSelfWrapper(child.styles, parent)).toBe("start");
  });

  it("does not wrap when align-self only spells the parent's align-items differently", () => {
    // `start` and `flex-start` are the same alignment; a raw string compare
    // would build a wrapper that changes nothing.
    const { parent, child } = flexParent(
      { display: "flex", alignItems: "flex-start" },
      { display: "block", alignSelf: "start" },
    );

    expect(resolveAlignSelfWrapper(child.styles, parent)).toBeUndefined();
  });

  it("treats a missing align-items as `normal`, which is not `center`", () => {
    const { parent, child } = flexParent(
      { display: "flex", alignItems: "normal" },
      { display: "block", alignSelf: "stretch" },
    );

    // stretch has a working path of its own — see the STRETCH case below.
    expect(resolveAlignSelfWrapper(child.styles, parent)).toBeUndefined();
  });

  it("ignores align-self outside a flex container — CSS does too", () => {
    for (const display of ["block", "grid", "inline-block", "table"]) {
      const { parent, child } = flexParent(
        { display },
        { display: "block", alignSelf: "center" },
      );

      expect(resolveAlignSelfWrapper(child.styles, parent)).toBeUndefined();
    }
  });

  it("accepts inline-flex", () => {
    const { parent, child } = flexParent(
      { display: "inline-flex" },
      { display: "block", alignSelf: "center" },
    );

    expect(resolveAlignSelfWrapper(child.styles, parent)).toBe("center");
  });

  it("skips a lone child — the parent's own align-items already centres it", () => {
    const child = w2wFrame({ display: "block", alignSelf: "center" }, { width: 489, height: 116 });
    const parent = w2wFrame({ display: "flex", flexDirection: "column" }, {
      width: 1234,
      height: 116,
      children: [child],
    });

    expect(resolveAlignSelfWrapper(child.styles, parent)).toBeUndefined();
  });

  it("counts an out-of-flow sibling out — h2d filters absolute/fixed first", () => {
    const child = w2wFrame({ display: "block", alignSelf: "center" }, { width: 489, height: 116 });
    const overlay = w2wFrame({ display: "block", position: "absolute" }, { width: 1234, height: 20 });
    const parent = w2wFrame({ display: "flex", flexDirection: "column" }, {
      width: 1234,
      height: 116,
      children: [child, overlay],
    });

    expect(resolveAlignSelfWrapper(child.styles, parent)).toBeUndefined();
  });

  it("never wraps an out-of-flow child — it is not in the layout at all", () => {
    const { parent, child } = flexParent(
      { display: "flex", flexDirection: "column" },
      { display: "block", alignSelf: "center", position: "absolute" },
    );

    expect(resolveAlignSelfWrapper(child.styles, parent)).toBeUndefined();
  });

  it("leaves stretch and baseline alone", () => {
    for (const alignSelf of ["stretch", "baseline", "auto"]) {
      const { parent, child } = flexParent(
        { display: "flex", alignItems: "center" },
        { display: "block", alignSelf },
      );

      expect(resolveAlignSelfWrapper(child.styles, parent)).toBeUndefined();
    }
  });

  it("returns undefined at the root, which has no parent", () => {
    const child = w2wFrame({ display: "block", alignSelf: "center" });

    expect(resolveAlignSelfWrapper(child.styles, null)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. The tree surgery
// ---------------------------------------------------------------------------

describe("insertAlignWrappers", () => {
  /** stripe.com's row: 1234px column, a 489px heading and a full-width menu. */
  const stripeRow = (): WireframeNode =>
    node({
      id: "row",
      name: "div.section-row",
      layoutMode: "VERTICAL",
      width: 1234,
      height: 378,
      children: [
        node({
          id: "h2",
          name: "h2.hds-heading",
          width: 489,
          height: 116,
          alignSelf: "center",
          alignSelfWrapper: "center",
        }),
        node({ id: "menu", name: "div.stats-menu", width: 1234, height: 183, y: 196 }),
      ],
    });

  it("spans the parent's full width and centres the child inside it", () => {
    const root = stripeRow();
    insertAlignWrappers(root);

    const wrapper = root.children[0];
    expect(wrapper.name).toBe("h2.hds-heading:align-center");
    expect(wrapper.width).toBe(1234);
    expect(wrapper.height).toBe(116);
    expect(wrapper.layoutMode).toBe("VERTICAL");
    expect(wrapper.alignItems).toBe("center");
    expect(wrapper.layoutAlign).toBe("STRETCH");
    expect(wrapper.layoutSizingHorizontal).toBe("FILL");
    expect(wrapper.layoutSizingVertical).toBe("HUG");
    expect(root.children[1].name).toBe("div.stats-menu");
  });

  it("paints nothing of its own", () => {
    const root = stripeRow();
    insertAlignWrappers(root);

    const wrapper = root.children[0];
    expect(wrapper.backgroundColor).toBeNull();
    expect(wrapper.backgroundGradient).toBeNull();
    expect(wrapper.borderWidth).toBe(0);
    expect(wrapper.opacity).toBe(1);
    expect(wrapper.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("re-bases the child and clears its align-self so it is not wrapped twice", () => {
    const root = stripeRow();
    root.children[0].y = 40;
    insertAlignWrappers(root);

    const wrapper = root.children[0];
    const child = wrapper.children[0];
    expect(wrapper.y).toBe(40);
    expect(child.name).toBe("h2.hds-heading");
    expect(child.x).toBe(0);
    expect(child.y).toBe(0);
    expect(child.alignSelf).toBeUndefined();
    expect(child.alignSelfWrapper).toBeUndefined();
  });

  it("starts the wrapper inside the parent's padding", () => {
    const root = stripeRow();
    root.padding = { top: 10, right: 32, bottom: 10, left: 16 };
    insertAlignWrappers(root);

    const wrapper = root.children[0];
    expect(wrapper.x).toBe(16);
    expect(wrapper.width).toBe(1234 - 16 - 32);
  });

  it("swaps the axes for a horizontal parent", () => {
    const root = node({
      id: "row",
      name: "nav",
      layoutMode: "HORIZONTAL",
      width: 1234,
      height: 76,
      children: [
        node({
          id: "cta",
          name: "div.cta",
          x: 900,
          width: 200,
          height: 40,
          alignSelf: "flex-end",
          alignSelfWrapper: "flex-end",
        }),
      ],
    });
    insertAlignWrappers(root);

    const wrapper = root.children[0];
    expect(wrapper.name).toBe("div.cta:align-flex-end");
    expect(wrapper.x).toBe(900);
    expect(wrapper.width).toBe(200);
    expect(wrapper.height).toBe(76);
    expect(wrapper.layoutSizingHorizontal).toBe("HUG");
    expect(wrapper.layoutSizingVertical).toBe("FILL");
    expect(wrapper.children[0].x).toBe(0);
  });

  it("leaves a tree without the marker untouched", () => {
    const root = stripeRow();
    delete root.children[0].alignSelfWrapper;
    const before = JSON.stringify(root);

    insertAlignWrappers(root);

    expect(JSON.stringify(root)).toBe(before);
  });

  it("is idempotent — a second pass adds nothing", () => {
    const root = stripeRow();
    insertAlignWrappers(root);
    const once = JSON.stringify(root);

    insertAlignWrappers(root);

    expect(JSON.stringify(root)).toBe(once);
  });

  it("wraps outside an existing :margin wrapper, not inside it", () => {
    const root = node({
      id: "row",
      name: "div.row",
      layoutMode: "VERTICAL",
      width: 1000,
      height: 200,
      children: [
        node({
          id: "m",
          name: "h2:margin",
          width: 400,
          height: 100,
          alignSelf: "center",
          alignSelfWrapper: "center",
          children: [node({ id: "h2", name: "h2", width: 400, height: 80, y: 10 })],
        }),
      ],
    });
    insertAlignWrappers(root);

    expect(root.children[0].name).toBe("h2:margin:align-center");
    expect(root.children[0].children[0].name).toBe("h2:margin");
    expect(root.children[0].children[0].children[0].name).toBe("h2");
  });

  it("reaches children at any depth", () => {
    const root = node({
      id: "root",
      name: "root",
      layoutMode: "VERTICAL",
      width: 800,
      height: 400,
      children: [
        node({
          id: "mid",
          name: "mid",
          layoutMode: "VERTICAL",
          width: 800,
          height: 400,
          children: [
            node({ id: "deep", name: "deep", width: 200, height: 50, alignSelfWrapper: "center" }),
          ],
        }),
      ],
    });
    insertAlignWrappers(root);

    expect(root.children[0].children[0].name).toBe("deep:align-center");
  });
});

// ---------------------------------------------------------------------------
// 3. End to end through the converter
// ---------------------------------------------------------------------------

describe("stripe.com's stats heading, end to end", () => {
  it("comes out of convertW2WToWireframe inside a full-width centring wrapper", () => {
    const heading = w2wFrame(
      { display: "block", alignSelf: "center", backgroundColor: "rgb(10, 10, 10)" },
      { tag: "h2", classList: ["hds-heading"], width: 489, height: 116, x: 372, y: 0 },
    );
    const menu = w2wFrame(
      { display: "block", backgroundColor: "rgb(20, 20, 20)" },
      { tag: "div", classList: ["stats-menu"], width: 1234, height: 183, x: 0, y: 196 },
    );
    const row = w2wFrame(
      { display: "flex", flexDirection: "column", backgroundColor: "rgb(30, 30, 30)" },
      {
        tag: "section",
        classList: ["section-row"],
        width: 1234,
        height: 379,
        children: [heading, menu],
      },
    );

    const tree = convertW2WToWireframe(row as never, { htmlLayerNames: true });

    const wrapper = tree.children.find((c) => c.name.endsWith(":align-center"));
    expect(wrapper).toBeDefined();
    expect(wrapper!.width).toBe(1234);
    expect(wrapper!.alignItems).toBe("center");
    expect(wrapper!.layoutAlign).toBe("STRETCH");
    expect(wrapper!.children).toHaveLength(1);
    expect(wrapper!.children[0].width).toBe(489);
  });
});
