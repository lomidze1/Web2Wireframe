/**
 * A scaling transform makes the CSS length stop describing the painted box.
 *
 * getSizing upgrades a FIXED flex child to FILL when its CSS pixel length
 * matches the parent's content box on the cross axis — the signature of a
 * `height: 100%` the browser already resolved. But `transform: scaleY(n)` keeps
 * the CSS height and paints something else entirely, so that comparison reads
 * "this child fills the cross axis" for a child that fills 5% of it.
 *
 * stripe.com's usage chart is the measured case: `.billing-plan-graphic__chart`
 * is a 306x149 row, and each of its 31 bars declares `height: 149px` while
 * painting 7..149px through `scaleY(var(--bar-target-scale))`. Every bar was
 * upgraded to FILL and Figma stretched all 31 back to a flat 149px wall.
 *
 * The measured height is the truth here, so a scaled axis keeps FIXED.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function findNode(
  node: unknown,
  predicate: (n: WireframeNode) => boolean,
): WireframeNode | null {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== "object") continue;
    const obj = cur as WireframeNode;
    if (predicate(obj)) return obj;
    if (Array.isArray(obj.children)) stack.push(...obj.children);
  }
  return null;
}

/** The chart row, with one bar whose painted height comes from a transform. */
function chart(opts: { paintedHeight: number; transform: string }) {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 306,
    height: 149,
    quad: [0, 0, 306, 0, 306, 149, 0, 149],
    tag: "div",
    classList: ["billing-plan-graphic__chart"],
    attr: {},
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-end",
    },
    children: [
      {
        type: "FRAME",
        // The browser-measured rect: `getBoundingClientRect` already applied
        // the transform, so this is what the bar actually paints.
        x: 38.81,
        y: 149 - opts.paintedHeight,
        width: 4.27,
        height: opts.paintedHeight,
        quad: [0, 0, 1, 0, 1, 1, 0, 1],
        tag: "section",
        classList: ["billing-plan-graphic__bar"],
        attr: {},
        styles: {
          display: "block",
          width: "4.28px",
          height: "149px",
          transformOrigin: "50% 100%",
          transform: opts.transform,
        },
        children: [],
      },
    ],
  };
}

const bar = (tree: Record<string, unknown>): WireframeNode =>
  findNode(convertW2WToWireframe(tree as never, {}), (n) => n.tag === "section")!;

describe("cross-axis FILL upgrade vs a scaling transform", () => {
  it("keeps a scaleY-collapsed bar at its measured height", () => {
    const n = bar(chart({ paintedHeight: 7, transform: "matrix(1, 0, 0, 0.0469799, 0, 0)" }));

    expect(n.layoutSizingVertical).toBe("FIXED");
    expect(n.height).toBeCloseTo(7, 2);
  });

  it("holds for a bar that is scaled but still tall", () => {
    // 113px of 149 — well clear of the +/-2px tolerance on its own, but the
    // guard must not depend on the gap being large.
    const n = bar(chart({ paintedHeight: 113, transform: "matrix(1, 0, 0, 0.7583892, 0, 0)" }));

    expect(n.layoutSizingVertical).toBe("FIXED");
    expect(n.height).toBeCloseTo(113, 2);
  });

  it("still upgrades a full-height bar — scaleY(1) changes nothing", () => {
    const n = bar(chart({ paintedHeight: 149, transform: "matrix(1, 0, 0, 1, 0, 0)" }));

    expect(n.layoutSizingVertical).toBe("FILL");
  });

  it("still upgrades when there is no transform at all", () => {
    const n = bar(chart({ paintedHeight: 149, transform: "none" }));

    expect(n.layoutSizingVertical).toBe("FILL");
  });

  it("a translate-only transform does not block the upgrade", () => {
    // Translation is baked into the measured x/y, so it never contradicts the
    // declared length the way a scale does.
    const n = bar(chart({ paintedHeight: 149, transform: "matrix(1, 0, 0, 1, 0, -12)" }));

    expect(n.layoutSizingVertical).toBe("FILL");
  });
});
