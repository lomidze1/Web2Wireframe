/**
 * Tests that a negative horizontal margin keeps the element's measured width.
 *
 * A negative side margin exists to make a row WIDER than (or offset from) its
 * container — the classic "bleed" gutter, `margin: 0 -6px`. Giving such an
 * element Figma's FILL sizing snaps it back to the parent's width and throws
 * the bleed away, along with every child position that depended on it.
 *
 * Real-world case: iwm.org.uk `ul.branch-showcase__list` measures 1273px
 * inside a 1261px parent (`margin: 0 -6px`). It imported at 1261px, so the
 * whole "Our Museums" mosaic sat 12px narrow.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 1261, height: 400,
    quad: [0, 0, 1261, 0, 1261, 400, 0, 400],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

const firstChild = (n: WireframeNode) => n.children[0];

describe("convertW2WToWireframe — negative horizontal margins", () => {
  it("keeps the measured width of a bleeding row", () => {
    const parent = frame({
      styles: { display: "block" },
      children: [
        frame({
          tag: "ul",
          classList: ["branch-showcase__list"],
          x: -6, width: 1273,
          styles: { display: "flex", width: "auto", marginLeft: "-6px", marginRight: "-6px" },
        }),
      ],
    });
    const node = convertW2WToWireframe(parent as never);
    expect(firstChild(node).layoutSizingHorizontal).toBe("FIXED");
    expect(Math.round(firstChild(node).width)).toBe(1273);
  });

  it("applies to a single negative side margin too", () => {
    const parent = frame({
      styles: { display: "block" },
      children: [
        frame({ tag: "div", x: -20, width: 1281, styles: { display: "block", marginLeft: "-20px" } }),
      ],
    });
    const node = convertW2WToWireframe(parent as never);
    expect(firstChild(node).layoutSizingHorizontal).toBe("FIXED");
  });

  it("leaves ordinary block children on FILL", () => {
    const parent = frame({
      styles: { display: "block" },
      children: [frame({ tag: "div", styles: { display: "block" } })],
    });
    const node = convertW2WToWireframe(parent as never);
    expect(firstChild(node).layoutSizingHorizontal).toBe("FILL");
  });

  it("leaves positive margins on FILL", () => {
    const parent = frame({
      styles: { display: "block" },
      children: [
        frame({ tag: "div", width: 1221, styles: { display: "block", marginLeft: "20px", marginRight: "20px" } }),
      ],
    });
    const node = convertW2WToWireframe(parent as never);
    expect(firstChild(node).layoutSizingHorizontal).toBe("FILL");
  });
});
