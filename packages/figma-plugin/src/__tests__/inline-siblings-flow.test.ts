/**
 * Inline siblings that overflow their parent are a text flow, not a row.
 *
 * The "all children are inline → HORIZONTAL auto-layout" rule was written for
 * genuine rows (nav links, inline-block chips). But `display: inline` elements
 * also wrap: when their widths add up past the parent, the browser broke them
 * across lines and no row ever existed.
 *
 * stripe.com's section heading is the case that exposed it. `.section-title`
 * is an 856px block holding two `display: inline` children:
 *
 *   h2  593×40   dx=0 dy=-3   "Flexible solutions for every business model."
 *   p   776×110  dx=0 dy=-3   "Grow your business with a comprehensive set…"
 *
 * Both start at the same origin — that is what an inline box's rect is: the
 * union of its line boxes. Laid out as a row they need 1369px in an 856px
 * frame, so the paragraph was crushed into a narrow column overlapping the
 * heading.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function frame(
  tag: string,
  width: number,
  height: number,
  styles: Record<string, unknown>,
  children: unknown[] = [],
  x = 0,
  y = 0,
) {
  return {
    type: "FRAME",
    x, y, width, height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    tag,
    classList: [],
    attr: {},
    styles,
    children,
  };
}

const text = (value: string, width: number, height: number, x = 0, y = 0) => ({
  type: "TEXT",
  x, y, width, height,
  quad: [x, y, x + width, y, x + width, y + height, x, y + height],
  value,
});

/** A `display: block` container holding inline-level children. */
function titleBlock(parentWidth: number, kids: Array<{ tag: string; w: number; h: number; display: string }>) {
  return frame("div", parentWidth, 106, { display: "block" },
    kids.map((k) => frame(k.tag, k.w, k.h, { display: k.display }, [text("x", k.w, k.h)])),
  );
}

const convert = (tree: Record<string, unknown>) =>
  convertW2WToWireframe(tree as never, {}) as WireframeNode;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("inline siblings wider than their parent", () => {
  it("do not become a HORIZONTAL row", () => {
    // stripe.com's real numbers: 593 + 776 = 1369 in an 856px block.
    const root = convert(titleBlock(856, [
      { tag: "h2", w: 593, h: 40, display: "inline" },
      { tag: "p", w: 776, h: 110, display: "inline" },
    ]));
    expect(root.layoutMode).not.toBe("HORIZONTAL");
  });

  it("keeps each child at its measured width", () => {
    const root = convert(titleBlock(856, [
      { tag: "h2", w: 593, h: 40, display: "inline" },
      { tag: "p", w: 776, h: 110, display: "inline" },
    ]));
    const widths = (root.children ?? []).map((c) => Math.round(c.width));
    expect(widths).toContain(593);
    expect(widths).toContain(776);
  });

  // ⬇️ regression guards — real rows must keep behaving as rows
  it("inline children that FIT stay a HORIZONTAL row", () => {
    const root = convert(titleBlock(856, [
      { tag: "span", w: 300, h: 20, display: "inline" },
      { tag: "span", w: 400, h: 20, display: "inline" },
    ]));
    expect(root.layoutMode).toBe("HORIZONTAL");
  });

  it("inline-block children that FIT stay a HORIZONTAL row", () => {
    const root = convert(titleBlock(900, [
      { tag: "div", w: 200, h: 40, display: "inline-block" },
      { tag: "div", w: 200, h: 40, display: "inline-block" },
      { tag: "div", w: 200, h: 40, display: "inline-block" },
    ]));
    expect(root.layoutMode).toBe("HORIZONTAL");
  });

  it("a single inline child wider than the parent is still not a row", () => {
    // One wrapped paragraph: nothing to lay beside it.
    const root = convert(titleBlock(400, [
      { tag: "p", w: 776, h: 110, display: "inline" },
    ]));
    expect(root.layoutMode).not.toBe("HORIZONTAL");
  });
});
