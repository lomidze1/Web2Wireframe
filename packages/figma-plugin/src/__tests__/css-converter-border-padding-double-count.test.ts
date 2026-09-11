/**
 * A visible border must NOT be folded into padding.
 *
 * Figma's INSIDE stroke already consumes its own weight before auto-layout
 * padding starts, so a frame that carries the border as a stroke AND adds the
 * border width to padding insets its content by `border + padding + border` —
 * one border width too many per side.
 *
 * stripe.com's `.section-container.modular-solutions-section` is exactly this
 * shape, measured live:
 *
 *   width 1266  border-left/right 1px solid #E5EDF5  padding 96px 16px
 *   → content box = 1266 − 1 − 1 − 16 − 16 = 1232
 *   → `.modular-solutions-bento` child = 1232 × 1834
 *
 * With padding 17 the frame offers only 1230px, the bento's widest row needs
 * 1232 (816 + 16 + 400), and Figma's WRAP breaks 3 rows into 4 — the section
 * grows from 1834px to 2526px. h2d emits padding 16 here and renders 3 rows.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { collapseMarginWrappers } from "../rendering/marginCollapse";
import type { WireframeNode } from "../types";

const BORDER = "rgb(229, 237, 245)";

/** Live values from stripe.com at a 1440px viewport. */
const SECTION_WIDTH = 1266;
const SECTION_HEIGHT = 2195.59;
const BORDER_WIDTH = 1;
const CSS_PADDING = 16;
const CONTENT_WIDTH = SECTION_WIDTH - 2 * BORDER_WIDTH - 2 * CSS_PADDING; // 1232
/** Border box left edge → first content pixel. */
const CONTENT_X = BORDER_WIDTH + CSS_PADDING; // 17

function child(
  tag: string,
  cls: string,
  width: number,
  height: number,
  y: number,
) {
  return {
    type: "FRAME",
    x: CONTENT_X,
    y,
    width,
    height,
    quad: [0, 0, 1, 0, 1, 1, 0, 1],
    tag,
    classList: [cls],
    attr: {},
    styles: {
      display: "block",
      width: `${width}px`,
      height: `${height}px`,
      marginTop: "0px",
      marginRight: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
    },
    children: [],
  };
}

/** `.section-container.section-row.modular-solutions-section` */
function modularSolutionsSection() {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: SECTION_WIDTH,
    height: SECTION_HEIGHT,
    quad: [0, 0, SECTION_WIDTH, 0, SECTION_WIDTH, SECTION_HEIGHT, 0, SECTION_HEIGHT],
    tag: "div",
    classList: ["section-container", "section-row", "modular-solutions-section"],
    attr: {},
    styles: {
      display: "flex",
      flexDirection: "column",
      gap: "64px",
      rowGap: "64px",
      boxSizing: "border-box",
      paddingTop: "96px",
      paddingRight: "16px",
      paddingBottom: "96px",
      paddingLeft: "16px",
      padding: "96px 16px",
      borderTopWidth: "0px",
      borderRightWidth: "1px",
      borderBottomWidth: "0px",
      borderLeftWidth: "1px",
      borderTopStyle: "none",
      borderRightStyle: "solid",
      borderBottomStyle: "none",
      borderLeftStyle: "solid",
      borderTopColor: BORDER,
      borderRightColor: BORDER,
      borderBottomColor: BORDER,
      borderLeftColor: BORDER,
    },
    children: [
      child("div", "section-title", 856, 105.59, 96),
      child("div", "modular-solutions-bento", CONTENT_WIDTH, 1834, 265.59),
    ],
  };
}

function convert(): WireframeNode {
  return convertW2WToWireframe(modularSolutionsSection() as never, {});
}

describe("visible border must not inflate padding", () => {
  it("keeps the CSS padding after conversion", () => {
    const section = convert();
    expect(section.padding.left).toBe(CSS_PADDING);
    expect(section.padding.right).toBe(CSS_PADDING);
  });

  it("keeps the CSS padding after margin-wrapper collapse", () => {
    const section = convert();
    collapseMarginWrappers(section);
    expect(section.padding.left).toBe(CSS_PADDING);
    expect(section.padding.right).toBe(CSS_PADDING);
  });

  it("leaves exactly the browser's content width for the bento row", () => {
    const section = convert();
    collapseMarginWrappers(section);
    const available =
      section.width -
      section.padding.left -
      section.padding.right -
      2 * BORDER_WIDTH; // Figma's INSIDE stroke takes its weight too
    expect(available).toBe(CONTENT_WIDTH);
  });

  it("still carries the border as a stroke, not as padding", () => {
    const section = convert();
    const left = section.strokes?.find((s) => s.sides?.left);
    expect(left?.weight).toBe(BORDER_WIDTH);
  });
});

/**
 * The discount reaches BOTH call sites and survives per-side border widths.
 *
 * The stripe scene above is a `display: flex` column with a uniform 1px border,
 * so it exercises only the flex reconcile branch with one number. The
 * block-container branch (`blockSelfCentred`, which reconciles the cross axis
 * only, and only when the two insets match) and asymmetric per-side borders are
 * separate arithmetic — a discount applied as one shared number instead of four
 * passes every test above.
 */
function borderedBlock(
  leftBorder: number,
  rightBorder: number,
  cssPadding: number,
  childWidth: number,
) {
  const WIDTH = 400;
  const HEIGHT = 300;
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: WIDTH,
    height: HEIGHT,
    quad: [0, 0, WIDTH, 0, WIDTH, HEIGHT, 0, HEIGHT],
    tag: "div",
    classList: ["card"],
    attr: {},
    styles: {
      display: "block",
      boxSizing: "border-box",
      paddingTop: `${cssPadding}px`,
      paddingRight: `${cssPadding}px`,
      paddingBottom: `${cssPadding}px`,
      paddingLeft: `${cssPadding}px`,
      borderTopWidth: "0px",
      borderRightWidth: `${rightBorder}px`,
      borderBottomWidth: "0px",
      borderLeftWidth: `${leftBorder}px`,
      borderTopStyle: "none",
      borderRightStyle: "solid",
      borderBottomStyle: "none",
      borderLeftStyle: "solid",
      borderTopColor: BORDER,
      borderRightColor: BORDER,
      borderBottomColor: BORDER,
      borderLeftColor: BORDER,
    },
    children: [
      {
        ...child("div", "card-body", childWidth, 200, cssPadding),
        // Border box left edge → first content pixel.
        x: leftBorder + cssPadding,
      },
    ],
  };
}

describe("border discount on a block container", () => {
  it("keeps the CSS padding on a symmetric border", () => {
    // 400 − 2·2 border − 2·20 padding = 356 of content.
    const block = convertW2WToWireframe(borderedBlock(2, 2, 20, 356) as never, {});
    expect(block.padding.left).toBe(20);
    expect(block.padding.right).toBe(20);
  });

  it("does not fold an asymmetric border into padding", () => {
    // 4px left, 1px right: measured insets are 24 and 21, and a single shared
    // discount would leave one side wrong by 3px whichever number it picked.
    const block = convertW2WToWireframe(borderedBlock(4, 1, 20, 355) as never, {});
    expect(block.padding.left).toBe(20);
    expect(block.padding.right).toBe(20);
  });

  it("carries each side's own weight as its own stroke", () => {
    const block = convertW2WToWireframe(borderedBlock(4, 1, 20, 355) as never, {});
    const left = block.strokes?.find((s) => s.sides?.left);
    const right = block.strokes?.find((s) => s.sides?.right);
    expect(left?.weight).toBe(4);
    expect(right?.weight).toBe(1);
  });

  it("leaves the browser's content width once Figma takes its stroke", () => {
    const block = convertW2WToWireframe(borderedBlock(4, 1, 20, 355) as never, {});
    const available =
      block.width - block.padding.left - block.padding.right - 4 - 1;
    expect(available).toBe(355);
  });
});
