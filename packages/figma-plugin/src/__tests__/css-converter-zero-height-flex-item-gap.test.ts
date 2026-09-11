/**
 * A zero-height flex item still owns a gap slot — the measured spacing must
 * not read straight through it.
 *
 * `inFlowChildren()` (the input to measuredItemSpacing) keeps only children
 * taller/wider than 0.5px, so a 0-height sibling is invisible to the
 * measurement while it is still very much present in the render: `isUseless`
 * keeps any node with surviving children, and nodes.ts floors a 0-height
 * frame to 1px because Figma refuses to create one.
 *
 * stripe.com's `<section class="section-row section-row-gap">` is built on
 * exactly that item — `.divider-wrapper` is 1232x0 with nothing but an
 * absolutely positioned decoration inside, and its only job is to eat two of
 * the container's 80px gaps so the two sections read 160px apart:
 *
 *   [0] section        761.55
 *   [1] divider          0     ← measured through
 *   [2] section       1024.23
 *   [3] divider          0     ← measured through
 *   [4] section       1531.09      gap: 80px, total 3636.87
 *
 * Measuring section→section yields 160, which beats the declared 80 by far
 * more than the 0.51px epsilon. The renderer then lays out all five children
 * with 160 between each — 320px of empty space the browser never had, and the
 * frame overflows its own measured height.
 */
import { describe, it, expect } from "vitest";

import {
  convertW2WToWireframe,
  measuredItemSpacing,
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

const COLUMN: Styles = { display: "flex", flexDirection: "column" };

/** Live geometry of stripe.com's `.section-row.section-row-gap`. */
const CSS_GAP = 80;
const SECTIONS = [761.55, 1024.23, 1531.09];
const TOTAL = 3636.87;

/**
 * `.divider-wrapper` — 1232x0, no paint, holding only the absolutely
 * positioned decoration that keeps it from being dropped as useless.
 */
function divider(y: number) {
  return w2wFrame({ position: "relative" }, { x: 0, y, width: 1232, height: 0 }, [
    w2wFrame(
      { position: "absolute", overflow: "hidden" },
      { x: -16, y: y - 60, width: 1264, height: 120 },
    ),
  ]);
}

function sectionRow() {
  return w2wFrame(
    { ...COLUMN, gap: "80px", rowGap: "80px" },
    { x: 0, y: 0, width: 1232, height: TOTAL },
    [
      w2wFrame({}, { x: 0, y: 0, width: 1232, height: SECTIONS[0] }),
      divider(841.55),
      w2wFrame({}, { x: 0, y: 921.55, width: 1232, height: SECTIONS[1] }),
      divider(2025.77),
      w2wFrame({}, { x: 0, y: 2105.77, width: 1232, height: SECTIONS[2] }),
    ],
  );
}

function convert(): WireframeNode {
  return convertW2WToWireframe(sectionRow() as never, {
    layoutMode: "autoLayout",
  });
}

describe("zero-height flex item owns a gap slot", () => {
  it("keeps the CSS gap instead of measuring through the dividers", () => {
    expect(convert().itemSpacing).toBe(CSS_GAP);
  });

  it("keeps the dividers as children — they are what the gap belongs to", () => {
    expect(convert().children).toHaveLength(5);
  });

  it("reproduces the browser's total height", () => {
    const out = convert();
    const flow = out.children.reduce((sum, c) => sum + c.height, 0);
    const gaps = out.itemSpacing * (out.children.length - 1);
    expect(flow + gaps).toBeCloseTo(TOTAL, 1);
  });

  it("measuredItemSpacing refuses the row it cannot see whole", () => {
    const kids = convert().children;
    expect(measuredItemSpacing(kids, "VERTICAL")).toBeNull();
  });

  it("still measures a row whose children are all visible", () => {
    const out = convertW2WToWireframe(
      w2wFrame(
        { ...COLUMN, rowGap: "8px" },
        { x: 0, y: 0, width: 400, height: 260 },
        [
          w2wFrame({}, { x: 0, y: 0, width: 400, height: 80 }),
          w2wFrame({}, { x: 0, y: 120, width: 400, height: 80 }),
          w2wFrame({}, { x: 0, y: 240, width: 400, height: 20 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.itemSpacing).toBe(40);
  });
});

/**
 * The other half of the same rule: a phantom is NOT a gap slot.
 *
 * The guard bails whenever any in-flow child is too small to measure — but the
 * justification ("isUseless keeps any node with surviving children") only
 * holds for the divider above. `treeSimplify` DELETES a childless sliver
 * outright, and it runs after this measurement, so an empty `<div class="clear">`
 * left the whole row on its CSS `gap`. Where that gap is 0 and the real
 * spacing comes from margins, the row collapses on top of itself.
 */
describe("a childless sliver is not a gap slot", () => {
  /** Three 100px cards, 20px apart, with a hairline `<div>` between two of
   *  them. The CSS gap is 0 — the spacing is real, measured geometry. */
  function rowWithEmptyDiv() {
    return w2wFrame(
      { display: "flex", flexDirection: "row", gap: "0px", columnGap: "0px" },
      { x: 0, y: 0, width: 500, height: 100 },
      [
        w2wFrame({}, { x: 0, y: 0, width: 100, height: 100 }),
        w2wFrame({}, { x: 120, y: 0, width: 100, height: 100 }),
        // The phantom: 0.3px tall and childless, so `isUseless` deletes it
        // outright a moment later. It owns no gap because it is not there.
        w2wFrame({}, { x: 220, y: 0, width: 20, height: 0.3 }),
        w2wFrame({}, { x: 240, y: 0, width: 100, height: 100 }),
      ],
    );
  }

  function convertRow(): WireframeNode {
    return convertW2WToWireframe(rowWithEmptyDiv() as never, {
      layoutMode: "autoLayout",
    });
  }

  it("measures the real 20px spacing rather than falling back to gap: 0", () => {
    expect(convertRow().itemSpacing).toBe(20);
  });

  it("drops the phantom from the rendered tree", () => {
    // The reason it owns no gap: it is not there any more.
    expect(convertRow().children).toHaveLength(3);
  });

  it("still refuses when the zero-size child has children of its own", () => {
    // The divider case above, in a row: that one survives and does own a gap.
    const out = convertW2WToWireframe(
      w2wFrame(
        { display: "flex", flexDirection: "row", gap: "0px", columnGap: "0px" },
        { x: 0, y: 0, width: 500, height: 100 },
        [
          w2wFrame({}, { x: 0, y: 0, width: 100, height: 100 }),
          w2wFrame({ position: "relative" }, { x: 120, y: 0, width: 0, height: 100 }, [
            w2wFrame(
              { position: "absolute" },
              { x: 110, y: -10, width: 20, height: 120 },
            ),
          ]),
          w2wFrame({}, { x: 140, y: 0, width: 100, height: 100 }),
        ],
      ) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.itemSpacing).toBe(0);
  });
});

