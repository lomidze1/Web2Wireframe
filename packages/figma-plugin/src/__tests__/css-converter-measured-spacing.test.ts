/**
 * Defect 4 (h2d parity): itemSpacing and padding derived from MEASURED child
 * rects, with the CSS value substituted only when it provably reproduces the
 * same geometry (h2d `Kh` for gaps, `Yh`/`Nh` for edges, `W8`/`Zh` for the
 * round-CSS-number substitution; global epsilon 0.51px).
 *
 * Previously `itemSpacing = parseFloat(rowGap|columnGap)` and the four
 * paddings came straight from CSS — never checked against where the children
 * actually are. Whenever the real spacing differed from the declared `gap`
 * (space-around, flex-grow, per-child margins, collapsed margins), the error
 * accumulated down the child list.
 *
 * Measured values are NET of adjacent child margins: the renderer's margin
 * wrappers (layout.ts) and `collapseMarginWrappers` re-add margins, so the
 * gap attributable to itemSpacing excludes them.
 */
import { describe, it, expect } from "vitest";

import {
  convertW2WToWireframe,
  measuredItemSpacing,
  measuredPadding,
  reconcileWithCss,
} from "../rendering/css-converter";
import type { WireframeNode } from "../types";

type Styles = Record<string, string | number>;

function w2wFrame(
  styles: Styles,
  geo: { x: number; y: number; width: number; height: number },
  children: unknown[] = [],
) {
  return {
    type: "FRAME",
    tag: "div",
    classList: [],
    attr: {},
    ...geo,
    quad: [
      geo.x, geo.y,
      geo.x + geo.width, geo.y,
      geo.x + geo.width, geo.y + geo.height,
      geo.x, geo.y + geo.height,
    ],
    styles,
    children,
  };
}

const ROW: Styles = { display: "flex", flexDirection: "row" };
const COLUMN: Styles = { display: "flex", flexDirection: "column" };

describe("measured itemSpacing (Kh)", () => {
  it("space-around row with gap:0 — itemSpacing = smallest real gap, edge gaps become padding", () => {
    // 600px row, three 100px children distributed space-around:
    // edges 50px, inter-item gaps 100px.
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...ROW, justifyContent: "space-around", gap: "0px" },
        { x: 0, y: 0, width: 600, height: 100 },
        [
          w2wFrame({}, { x: 50, y: 10, width: 100, height: 80 }),
          w2wFrame({}, { x: 250, y: 10, width: 100, height: 80 }),
          w2wFrame({}, { x: 450, y: 10, width: 100, height: 80 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.layoutMode).toBe("HORIZONTAL");
    expect(out.itemSpacing).toBe(100);
    expect(out.padding.left).toBe(50);
    expect(out.padding.right).toBe(50);
    expect(out.padding.top).toBe(10);
    expect(out.padding.bottom).toBe(10);
  });

  it("substitutes the round CSS number when it reproduces the measured gap (W8/Zh, 0.51px)", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...COLUMN, rowGap: "24px" },
        { x: 0, y: 0, width: 400, height: 200 },
        [
          w2wFrame({}, { x: 0, y: 0, width: 400, height: 50 }),
          w2wFrame({}, { x: 0, y: 73.7, width: 400, height: 50 }),
          w2wFrame({}, { x: 0, y: 147.4, width: 400, height: 52.6 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    // measured gaps 23.7 — within 0.51 of the declared 24, keep the CSS value
    expect(out.itemSpacing).toBe(24);
  });

  it("writes the measured gap when CSS disagrees beyond tolerance", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...COLUMN, rowGap: "8px" },
        { x: 0, y: 0, width: 400, height: 200 },
        [
          w2wFrame({}, { x: 0, y: 0, width: 400, height: 50 }),
          w2wFrame({}, { x: 0, y: 82, width: 400, height: 50 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.itemSpacing).toBe(32);
  });

  it("ignores pairs touching a flex-grow child (not rigid)", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...ROW, gap: "0px" },
        { x: 0, y: 0, width: 540, height: 60 },
        [
          w2wFrame({}, { x: 0, y: 0, width: 100, height: 60 }),
          w2wFrame({ flexGrow: 1 }, { x: 110, y: 0, width: 200, height: 60 }),
          w2wFrame({}, { x: 320, y: 0, width: 100, height: 60 }),
          w2wFrame({}, { x: 430, y: 0, width: 100, height: 60 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    // Only the (child3, child4) pair is rigid–rigid: gap = 430 − 420 = 10.
    expect(out.itemSpacing).toBe(10);
  });

  it("nets out adjacent child margins from the measured gap", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...COLUMN, rowGap: "0px" },
        { x: 0, y: 0, width: 400, height: 200 },
        [
          w2wFrame({ marginBottom: "20px" }, { x: 0, y: 0, width: 400, height: 50 }),
          w2wFrame({ marginTop: "10px" }, { x: 0, y: 80, width: 400, height: 50 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    // raw gap 30 − (20 + 10) margins = 0 attributable to itemSpacing at
    // measure time; collapseMarginWrappers then folds the margins back in
    // (0 + 20 + 10 → 30) and clears them. Without the netting the fold would
    // double-count: 30 + 30 → 60 vs the captured 30px distance.
    expect(out.itemSpacing).toBe(30);
    expect(out.children[0].margin).toBeUndefined();
    expect(out.children[1].margin).toBeUndefined();
  });

  it("leaves wrapped rows on their CSS values (multi-line geometry)", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...ROW, flexWrap: "wrap", gap: "13.6px", rowGap: "13.6px", columnGap: "13.6px" },
        { x: 0, y: 0, width: 300, height: 200 },
        [
          w2wFrame({}, { x: 0, y: 0, width: 140, height: 90 }),
          w2wFrame({}, { x: 160, y: 0, width: 140, height: 90 }),
          w2wFrame({}, { x: 0, y: 110, width: 140, height: 90 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.itemSpacing).toBe(13.6);
  });

  it("absolute mode stays untouched (itemSpacing 0)", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...ROW, gap: "16px" },
        { x: 0, y: 0, width: 600, height: 100 },
        [
          w2wFrame({}, { x: 50, y: 10, width: 100, height: 80 }),
          w2wFrame({}, { x: 250, y: 10, width: 100, height: 80 }),
        ],
      ) as never,
      { layoutMode: "absolute" },
    );

    expect(out.itemSpacing).toBe(0);
  });
});

describe("measured padding on block containers (cross axis only)", () => {
  /**
   * stripe.com section: `padding: 0 16px` on a 1440px <section> whose 1266px
   * child self-centers with `margin: 0 auto`. The browser puts 87px on each
   * side ((1440-1266)/2); taking the CSS 16px parked the whole block at the
   * left edge with 158px of dead space on the right.
   *
   * A block container is layoutMode NONE in the converter and only becomes
   * VERTICAL auto-layout in the renderer, so the measured reconciliation that
   * already handles flex containers never reached it.
   */
  it("takes the measured side insets when a block child self-centers", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { display: "block", paddingLeft: "16px", paddingRight: "16px" },
        { x: 0, y: 0, width: 1440, height: 800 },
        [w2wFrame({}, { x: 87, y: 0, width: 1266, height: 800 })],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding.left).toBe(87);
    expect(out.padding.right).toBe(87);
  });

  it("leaves the block main axis on its CSS values (margin-collapse owns it)", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { display: "block", paddingTop: "12px", paddingBottom: "12px", paddingLeft: "16px", paddingRight: "16px" },
        { x: 0, y: 0, width: 1440, height: 800 },
        // Child inset 87px horizontally AND 40px vertically.
        [w2wFrame({}, { x: 87, y: 40, width: 1266, height: 720 })],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding.left).toBe(87);
    expect(out.padding.right).toBe(87);
    // Vertical stays on CSS — measured 40px is NOT adopted.
    expect(out.padding.top).toBe(12);
    expect(out.padding.bottom).toBe(12);
  });

  it("keeps the CSS inset when the block child already agrees with it", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { display: "block", paddingLeft: "16px", paddingRight: "16px" },
        { x: 0, y: 0, width: 1440, height: 800 },
        [w2wFrame({}, { x: 16, y: 0, width: 1408, height: 800 })],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding.left).toBe(16);
    expect(out.padding.right).toBe(16);
  });

  it("ignores asymmetric side insets — those are a row, not centring", () => {
    // Three cells at x=20/140/260 in a 400px block: left inset 20, right 40.
    // Calling that padding would misdescribe a row; `geometryRows` owns this
    // case, and geometry-horizontal-row.test.ts pins it to the CSS values.
    const out = convertW2WToWireframe(
      w2wFrame(
        { display: "block" },
        { x: 0, y: 0, width: 400, height: 30 },
        [
          w2wFrame({ display: "block" }, { x: 20, y: 0, width: 100, height: 30 }),
          w2wFrame({ display: "block" }, { x: 140, y: 0, width: 100, height: 30 }),
          w2wFrame({ display: "block" }, { x: 260, y: 0, width: 100, height: 30 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("does not adopt a side inset an absolutely positioned child creates", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { display: "block", paddingLeft: "16px", paddingRight: "16px" },
        { x: 0, y: 0, width: 1440, height: 800 },
        [
          w2wFrame({}, { x: 16, y: 0, width: 1408, height: 800 }),
          w2wFrame({ position: "absolute" }, { x: 600, y: 0, width: 200, height: 200 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding.left).toBe(16);
    expect(out.padding.right).toBe(16);
  });
});

describe("measured padding (Yh/Nh edges)", () => {
  it("keeps the round CSS padding when it matches within tolerance", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...COLUMN, paddingTop: "24px", paddingLeft: "24px" },
        { x: 0, y: 0, width: 400, height: 200 },
        [w2wFrame({}, { x: 23.8, y: 23.8, width: 352.4, height: 152.4 })],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding.top).toBe(24);
    expect(out.padding.left).toBe(24);
  });

  it("writes the measured inset when CSS says 0 but children sit at 32px", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...COLUMN },
        { x: 0, y: 0, width: 400, height: 200 },
        [w2wFrame({}, { x: 32, y: 32, width: 336, height: 136 })],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding.top).toBe(32);
    expect(out.padding.left).toBe(32);
    expect(out.padding.right).toBe(32);
    expect(out.padding.bottom).toBe(32);
  });

  it("keeps the CSS side when a child overhangs the frame (negative measured inset)", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...COLUMN, paddingLeft: "16px" },
        { x: 0, y: 0, width: 400, height: 100 },
        [w2wFrame({}, { x: -20, y: 0, width: 440, height: 100 })],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.padding.left).toBe(16);
  });
});

describe("pure helpers", () => {
  const child = (over: Partial<WireframeNode>): WireframeNode =>
    ({
      id: "c",
      name: "c",
      type: "frame",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [],
      ...over,
    }) as unknown as WireframeNode;

  it("measuredItemSpacing returns null when overlap makes geometry inconsistent", () => {
    const kids = [
      child({ y: 0, height: 100 }),
      child({ y: 60, height: 100 }),
    ];
    expect(measuredItemSpacing(kids, "VERTICAL")).toBeNull();
  });

  it("measuredItemSpacing excludes out-of-flow children", () => {
    const kids = [
      child({ y: 0, height: 50 }),
      child({ y: 0, height: 300, position: "absolute" }),
      child({ y: 62, height: 50 }),
    ];
    expect(measuredItemSpacing(kids, "VERTICAL")).toBe(12);
  });

  it("measuredPadding returns null with no in-flow children", () => {
    expect(measuredPadding(100, 100, [child({ position: "absolute" })])).toBeNull();
  });

  it("reconcileWithCss keeps CSS within 0.51 and measured beyond it", () => {
    expect(reconcileWithCss(23.7, 24)).toBe(24);
    expect(reconcileWithCss(23.4, 24)).toBe(23.4);
  });
});
