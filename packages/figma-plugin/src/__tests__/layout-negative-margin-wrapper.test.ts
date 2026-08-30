/**
 * Negative CSS margins must survive as GEOMETRY, not be clamped away.
 *
 * The "bleed out of a padded container" idiom is everywhere on stripe.com —
 * 17 of its 2164 styled nodes carry a negative margin, and they all follow the
 * same shape: a child measured WIDER than its parent (1264 inside 1234) with
 * `margin: 0 -15px`, or pulled upward with `margin-top: -60px`.
 *
 * Half of that already works: css-converter's `hasNegativeInlineMargin` gate
 * keeps such a child FIXED so its 1264px width is not snapped back to the
 * parent. The other half was missing — `needsMarginWrapper` only fired on
 * `> 0` and `createMarginWrapper` did `Math.max(0, margin.left)`, because
 * Figma rejects negative padding. So the child kept its bleed WIDTH but lost
 * its bleed OFFSET: it sat flush at x=0 and spilled 30px past the right edge
 * instead of straddling both edges evenly.
 *
 * h2d solves it positionally: a `:margin` frame with layoutMode NONE, sized to
 * the margin box, holding the child at the (possibly negative) margin offset.
 * Same arithmetic as the padding wrapper — just expressed as position, which
 * is the only form Figma will accept below zero.
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
  children: MockNode[];
  layoutMode: string;
  clipsContent: boolean;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  primaryAxisAlignItems: string;
  counterAxisAlignItems: string;
  itemSpacing: number;
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
    children: [],
    layoutMode: "NONE",
    clipsContent: false,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    itemSpacing: 0,
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
  mixed: Symbol("figma.mixed"),
});

import { createMarginWrapper, needsMarginWrapper } from "../rendering/layout";
import type { WireframeNode } from "../types";

type Sides = { top: number; right: number; bottom: number; left: number };

function makeChild(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: "child",
    name: "div.stats-section__stats-menu",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 1264,
    height: 182.78,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    children: [],
    ...overrides,
  } as WireframeNode;
}

/** A rendered child frame carrying its browser-measured size. */
function makeChildNode(width = 1264, height = 182.78): MockNode {
  const node = createMockFrameNode();
  node.type = "FRAME";
  node.width = width;
  node.height = height;
  return node;
}

describe("needsMarginWrapper with negative margins", () => {
  it("fires on a negative side, not just a positive one", () => {
    expect(needsMarginWrapper({ top: 0, right: -15, bottom: 0, left: -15 })).toBe(true);
    expect(needsMarginWrapper({ top: -60, right: 0, bottom: 0, left: 0 })).toBe(true);
    expect(needsMarginWrapper({ top: 0, right: 0, bottom: -12, left: 0 })).toBe(true);
  });

  it("still returns false when every side is exactly zero", () => {
    expect(needsMarginWrapper({ top: 0, right: 0, bottom: 0, left: 0 })).toBe(false);
    expect(needsMarginWrapper(undefined)).toBe(false);
  });
});

describe("createMarginWrapper — negative margins become position", () => {
  it("stripe.com stats menu: `margin: 0 -15px` centres the 1264px bleed in a 1234px slot", () => {
    const margin: Sides = { top: 0, right: -15, bottom: 0, left: -15 };
    const childNode = makeChildNode();
    const wrapper = createMarginWrapper(
      makeChild({ margin }),
      childNode as never,
      "VERTICAL",
    ) as unknown as MockNode;

    // Wrapper occupies the margin box — exactly the parent's content width.
    expect(wrapper.width).toBeCloseTo(1234, 2);
    expect(wrapper.height).toBeCloseTo(182.78, 2);
    // Positional, not padded: Figma has no negative padding.
    expect(wrapper.layoutMode).toBe("NONE");
    expect(wrapper.paddingLeft).toBe(0);
    expect(wrapper.paddingRight).toBe(0);
    // The child keeps its measured bleed size and straddles both edges.
    expect(childNode.x).toBeCloseTo(-15, 2);
    expect(childNode.y).toBeCloseTo(0, 2);
    expect(childNode.width).toBeCloseTo(1264, 2);
    expect(childNode.height).toBeCloseTo(182.78, 2);
    // The bleed must remain visible.
    expect(wrapper.clipsContent).toBe(false);
  });

  it("divider-container: `margin: -60px -16px` pulls the child up as well as out", () => {
    const margin: Sides = { top: -60, right: -16, bottom: -60, left: -16 };
    const childNode = makeChildNode(1264, 300);
    const wrapper = createMarginWrapper(
      makeChild({ margin, width: 1264, height: 300 }),
      childNode as never,
      "VERTICAL",
    ) as unknown as MockNode;

    expect(wrapper.width).toBeCloseTo(1232, 2);
    expect(wrapper.height).toBeCloseTo(180, 2); // 300 - 60 - 60
    expect(childNode.x).toBeCloseTo(-16, 2);
    expect(childNode.y).toBeCloseTo(-60, 2);
  });

  it("mixed signs use the same margin-box arithmetic", () => {
    const margin: Sides = { top: 20, right: -16, bottom: 0, left: -16 };
    const childNode = makeChildNode(1264, 100);
    const wrapper = createMarginWrapper(
      makeChild({ margin, width: 1264, height: 100 }),
      childNode as never,
      "VERTICAL",
    ) as unknown as MockNode;

    expect(wrapper.width).toBeCloseTo(1232, 2);
    expect(wrapper.height).toBeCloseTo(120, 2);
    expect(childNode.x).toBeCloseTo(-16, 2);
    expect(childNode.y).toBeCloseTo(20, 2);
  });

  it("positive-only margins keep the existing padding wrapper untouched", () => {
    const margin: Sides = { top: 10, right: 10, bottom: 10, left: 10 };
    const childNode = makeChildNode(200, 100);
    const wrapper = createMarginWrapper(
      makeChild({ margin, width: 200, height: 100 }),
      childNode as never,
      "VERTICAL",
    ) as unknown as MockNode;

    expect(wrapper.layoutMode).toBe("VERTICAL");
    expect(wrapper.paddingTop).toBe(10);
    expect(wrapper.paddingLeft).toBe(10);
    // The child is laid out by the wrapper, not positioned inside it.
    expect(childNode.x).toBe(0);
    expect(childNode.y).toBe(0);
  });

  it("divider-container: a margin box of exactly zero collapses out of flow", () => {
    // stripe.com's `div.divider-container` is 1264x120 with `margin: -60px
    // -16px`, and its parent measures 0px tall — the browser really does give
    // it zero vertical space while it paints 60px either side of that line.
    // Declining here would leave the worst case unfixed: today those five
    // nodes each occupy 120px they should not and sit 60px too low.
    const margin: Sides = { top: -60, right: -16, bottom: -60, left: -16 };
    const childNode = makeChildNode(1264, 120);
    const wrapper = createMarginWrapper(
      makeChild({ margin, width: 1264, height: 120 }),
      childNode as never,
      "VERTICAL",
    ) as unknown as MockNode;

    expect(wrapper).not.toBeNull();
    expect(wrapper.width).toBeCloseTo(1232, 2);
    // Figma's floor for a frame dimension, standing in for zero.
    expect(wrapper.height).toBeLessThanOrEqual(0.01);
    expect(childNode.x).toBeCloseTo(-16, 2);
    expect(childNode.y).toBeCloseTo(-60, 2);
  });

  it("declines to build a wrapper whose margin box would go negative", () => {
    // A bleed wider than the element itself has no sane margin box; falling
    // back to today's behaviour beats handing Figma a zero-width frame.
    const margin: Sides = { top: 0, right: -700, bottom: 0, left: -700 };
    const childNode = makeChildNode(1264, 182.78);
    const wrapper = createMarginWrapper(
      makeChild({ margin }),
      childNode as never,
      "VERTICAL",
    );

    expect(wrapper).toBeNull();
  });
});
