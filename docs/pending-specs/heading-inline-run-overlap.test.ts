/**
 * stripe.com's section heading paints two text runs on top of each other.
 *
 * The source is one flowing heading — a bold lead-in followed by a lighter
 * continuation that wraps onto three lines:
 *
 *   <h2>Flexible solutions for every business model.</h2> Grow your business
 *   with a comprehensive set of payments and financial tools…
 *
 * An inline box's rect is the union of its line boxes, so BOTH runs report the
 * block's own origin: the h2 at (0, -3) 593.23x40 and the continuation at
 * (0, -3) 776.54x110.38. The block is layoutMode NONE — correctly, since
 * `inlineChildrenOverflowParent` refuses a single-row auto-layout for runs
 * needing 1363px inside 856px — so both children keep their captured x/y and
 * Figma stacks one directly over the other. In the imported file they sit at
 * exactly (-726, -6801) apiece and the heading is unreadable.
 *
 * h2d does not hit this because it joins the runs into ONE text node carrying
 * per-range styling. Three separate links in our chain each prevent that:
 *
 *   1. the whitespace between the runs survives as a 6.09x40 empty frame —
 *      `isUseless` (treeSimplify.ts) only drops unpainted boxes below the
 *      0.5px SLIVER, while h2d drops every one of them;
 *   2. that extra child leaves the h2 frame with TWO children, so
 *      `collapseSingleChildFrames` (which requires exactly one) never folds it
 *      away and the runs never become siblings;
 *   3. even as siblings `rowSeparator` (textRunMerge.ts) would refuse them —
 *      the continuation is 110.38 tall against 40 (HEIGHT_TOLERANCE is 1) and
 *      its union rect starts 587px LEFT of where the first run ends, far below
 *      ROW_MIN_GAP.
 *
 * The scene below is the real capture's geometry; it reproduces the imported
 * tree node for node.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

type Raw = Record<string, unknown>;

function frame(
  o: Raw & { x: number; y: number; width: number; height: number },
): Raw {
  const { x, y, width, height } = o;
  return {
    type: "FRAME",
    tag: "div",
    classList: [],
    attr: {},
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    styles: { display: "block" },
    children: [],
    ...o,
  };
}

function text(
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Raw {
  return {
    type: "TEXT",
    x,
    y,
    width,
    height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    value,
    font: "Sohne 500",
  };
}

const LEAD = "Flexible solutions for every business model.";
const REST =
  "Grow your business with a comprehensive set of payments and financial tools—designed to work individually or together.";

const INLINE = { display: "inline", fontSize: "35px", lineHeight: "40px" };

/** The heading block exactly as the content script captures it. */
function headingBlock(): Raw {
  return frame({
    x: 0,
    y: 0,
    width: 856,
    height: 105.56,
    tag: "div",
    styles: { display: "block", fontSize: "35px", lineHeight: "40px" },
    children: [
      frame({
        x: 0,
        y: -3,
        width: 593.23,
        height: 40,
        tag: "h2",
        styles: INLINE,
        children: [
          text(LEAD, 0, -3, 587.34, 40),
          // The space between the two runs — an inline box with no ink.
          frame({
            x: 587.34,
            y: -3,
            width: 6.09,
            height: 40,
            tag: "span",
            styles: INLINE,
            children: [],
          }),
        ],
      }),
      text(REST, 0, -3, 776.54, 110.38),
    ],
  });
}

function convert(): WireframeNode {
  return convertW2WToWireframe(headingBlock() as never, { layoutMode: "autoLayout" });
}

/** Every node in the tree, root first. */
function flatten(n: WireframeNode): WireframeNode[] {
  return [n, ...(n.children ?? []).flatMap(flatten)];
}

function inFlow(n: WireframeNode): boolean {
  return n.position !== "absolute" && n.position !== "fixed";
}

/** All the text a subtree renders, in document order. */
function textOf(n: WireframeNode): string {
  if (n.type === "text") return n.textContent ?? "";
  return (n.children ?? []).map(textOf).join("");
}

describe("stripe.com section heading — two inline runs, one origin", () => {
  it("does not stack two in-flow siblings on the same spot", () => {
    const root = convert();

    for (const node of flatten(root)) {
      const kids = (node.children ?? []).filter(inFlow);
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i];
          const b = kids[j];
          const overlapX =
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const overlapY =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          const overlaps = overlapX > 0.5 && overlapY > 0.5;

          expect(
            overlaps,
            `"${a.name}" and "${b.name}" overlap by ${overlapX.toFixed(2)}x${overlapY.toFixed(2)}px inside "${node.name}"`,
          ).toBe(false);
        }
      }
    }
  });

  it("drops the whitespace-only inline box between the runs", () => {
    const root = convert();

    const empties = flatten(root).filter(
      (n) => n.type !== "text" && (n.children?.length ?? 0) === 0 && textOf(n) === "",
    );

    expect(empties.map((n) => `${n.name} ${n.width}x${n.height}`)).toEqual([]);
  });

  it("joins the lead-in and the continuation into one text node", () => {
    const root = convert();
    const texts = flatten(root).filter((n) => n.type === "text");

    expect(texts).toHaveLength(1);
    expect(texts[0].textContent).toBe(`${LEAD} ${REST}`);
  });

  it("keeps every character of both runs", () => {
    // A safety net independent of how the runs are joined: whatever shape the
    // fix takes, and whatever separator it picks, no glyph may be dropped.
    const rendered = textOf(convert());

    expect(rendered).toContain(LEAD);
    expect(rendered).toContain(REST);
    expect(rendered.indexOf(LEAD)).toBeLessThan(rendered.indexOf(REST));
  });
});
