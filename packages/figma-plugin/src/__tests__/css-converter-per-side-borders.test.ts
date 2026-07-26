/**
 * Per-side border extraction tests for css-converter.ts (Path A — w2w content
 * script capture flow). Mirrors shared/per-side-borders.test.ts but exercises
 * the full `convertW2WToWireframe` pipeline end-to-end so we also cover the
 * FRAME → WireframeNode plumbing.
 *
 * Covers the Apple.com footer bug: `#ac-globalfooter .ac-gf-sosumi` has
 * `border-bottom: 1px solid ...` — the resulting WireframeNode must have a
 * single stroke with `sides.bottom === true`.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeFrame(styles: Record<string, string>): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 200, height: 50,
    quad: [0, 0, 200, 0, 200, 50, 0, 50],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block", ...styles },
    children: [],
  };
}

function convert(styles: Record<string, string>) {
   
  return convertW2WToWireframe(makeFrame(styles) as any, {
    layoutMode: "absolute",
    interactionMode: "none",
  });
}

describe("css-converter parseStrokes — per-side borders", () => {
  it("renders single bottom stroke for border-bottom-only (Apple.com sosumi)", () => {
    const node = convert({
      borderTopWidth: "0px",
      borderTopColor: "rgb(0, 0, 0)",
      borderTopStyle: "none",
      borderRightWidth: "0px",
      borderRightColor: "rgb(0, 0, 0)",
      borderRightStyle: "none",
      borderBottomWidth: "1px",
      borderBottomColor: "rgb(134, 134, 134)",
      borderBottomStyle: "solid",
      borderLeftWidth: "0px",
      borderLeftColor: "rgb(0, 0, 0)",
      borderLeftStyle: "none",
    });
    expect(node.strokes).toBeDefined();
    expect(node.strokes).toHaveLength(1);
    const stroke = node.strokes![0];
    expect(stroke.weight).toBe(1);
    expect(stroke.style).toBe("SOLID");
    expect(stroke.sides).toEqual({
      top: false, right: false, bottom: true, left: false,
    });
  });

  it("collapses 4 identical sides into single all-sides stroke", () => {
    const node = convert({
      borderTopWidth: "2px",
      borderTopColor: "rgb(255, 0, 0)",
      borderTopStyle: "solid",
      borderRightWidth: "2px",
      borderRightColor: "rgb(255, 0, 0)",
      borderRightStyle: "solid",
      borderBottomWidth: "2px",
      borderBottomColor: "rgb(255, 0, 0)",
      borderBottomStyle: "solid",
      borderLeftWidth: "2px",
      borderLeftColor: "rgb(255, 0, 0)",
      borderLeftStyle: "solid",
    });
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes![0].weight).toBe(2);
    expect(node.strokes![0].sides).toEqual({
      top: true, right: true, bottom: true, left: true,
    });
  });

  it("produces 4 strokes when each side has a different width", () => {
    const node = convert({
      borderTopWidth: "1px",
      borderTopColor: "rgb(0, 0, 0)",
      borderTopStyle: "solid",
      borderRightWidth: "2px",
      borderRightColor: "rgb(0, 0, 0)",
      borderRightStyle: "solid",
      borderBottomWidth: "3px",
      borderBottomColor: "rgb(0, 0, 0)",
      borderBottomStyle: "solid",
      borderLeftWidth: "4px",
      borderLeftColor: "rgb(0, 0, 0)",
      borderLeftStyle: "solid",
    });
    expect(node.strokes).toHaveLength(4);
    expect(node.strokes!.find((s) => s.sides?.top)?.weight).toBe(1);
    expect(node.strokes!.find((s) => s.sides?.right)?.weight).toBe(2);
    expect(node.strokes!.find((s) => s.sides?.bottom)?.weight).toBe(3);
    expect(node.strokes!.find((s) => s.sides?.left)?.weight).toBe(4);
  });

  it("produces 2 strokes for top+bottom only", () => {
    const node = convert({
      borderTopWidth: "1px",
      borderTopColor: "rgb(0, 0, 0)",
      borderTopStyle: "solid",
      borderRightStyle: "none",
      borderBottomWidth: "2px",
      borderBottomColor: "rgb(0, 0, 0)",
      borderBottomStyle: "solid",
      borderLeftStyle: "none",
    });
    expect(node.strokes).toHaveLength(2);
    const top = node.strokes!.find((s) => s.sides?.top);
    const bottom = node.strokes!.find((s) => s.sides?.bottom);
    expect(top?.weight).toBe(1);
    expect(bottom?.weight).toBe(2);
  });

  it("skips sides with style:none even if width>0", () => {
    const node = convert({
      borderBottomWidth: "1px",
      borderBottomColor: "rgb(0, 0, 0)",
      borderBottomStyle: "none",
    });
    expect(node.strokes ?? []).toEqual([]);
  });

  it("skips sides with style:hidden", () => {
    const node = convert({
      borderBottomWidth: "1px",
      borderBottomColor: "rgb(0, 0, 0)",
      borderBottomStyle: "hidden",
    });
    expect(node.strokes ?? []).toEqual([]);
  });

  it("keeps transparent sides as zero-opacity strokes (h2d parity, 2026-07-21)", () => {
    // Transparent borders still occupy CSS layout space (nicepage gutter:
    // `border: 10px solid transparent`). They render as zero-opacity strokes
    // so the website's truth stays inspectable; invisibleBorderInsets() adds
    // the layout space as padding.
    const node = convert({
      borderBottomWidth: "1px",
      borderBottomColor: "rgba(0, 0, 0, 0)",
      borderBottomStyle: "solid",
    });
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes![0].color.a).toBe(0);
    expect(node.strokes![0].weight).toBe(1);
    expect(node.strokes![0].sides?.bottom).toBe(true);
    expect(node.padding?.bottom).toBe(1);
  });

  it("falls back to shorthand borderWidth/borderColor/borderStyle when no per-side", () => {
    const node = convert({
      borderWidth: "1px",
      borderColor: "rgb(0, 0, 255)",
      borderStyle: "solid",
    });
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes![0].weight).toBe(1);
    expect(node.strokes![0].sides).toEqual({
      top: true, right: true, bottom: true, left: true,
    });
  });

  it("maps dashed and dotted styles per side", () => {
    const node = convert({
      borderBottomWidth: "1px",
      borderBottomColor: "rgb(0, 0, 0)",
      borderBottomStyle: "dashed",
    });
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes![0].style).toBe("DASHED");
  });

  it("uses currentColor (s.color) fallback when border color missing", () => {
    const node = convert({
      color: "rgb(200, 100, 50)",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      // borderBottomColor intentionally omitted
    });
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes![0].color.r).toBeCloseTo(200 / 255, 2);
    expect(node.strokes![0].color.g).toBeCloseTo(100 / 255, 2);
  });

  it("renders border-bottom from Apple.com .ac-gf-footer-shop real data shape", () => {
    // Regression test for the real-world bug: previously `CSS_PROPERTIES`
    // in browser-extension/src/content/styles.ts only captured per-side
    // *Style* (borderBottomStyle etc.), not per-side Width or Color.
    // Result: parseStrokes got undefined width/color and skipped the stroke.
    // Fix: add borderTopWidth/RightWidth/BottomWidth/LeftWidth and
    //      borderTopColor/RightColor/BottomColor/LeftColor to CSS_PROPERTIES.
    const node = convert({
      color: "rgb(29, 29, 31)",
      // Shorthand reflects non-uniform state (getComputedStyle returns "" or "0px")
      borderWidth: "0px",
      borderStyle: "none",
      borderColor: "rgb(29, 29, 31)",
      // Per-side (after the CSS_PROPERTIES fix, these are now captured)
      borderTopWidth: "0px",
      borderTopColor: "rgb(29, 29, 31)",
      borderTopStyle: "none",
      borderRightWidth: "0px",
      borderRightColor: "rgb(29, 29, 31)",
      borderRightStyle: "none",
      borderBottomWidth: "1px",
      borderBottomColor: "rgba(0, 0, 0, 0.16)",
      borderBottomStyle: "solid",
      borderLeftWidth: "0px",
      borderLeftColor: "rgb(29, 29, 31)",
      borderLeftStyle: "none",
    });
    expect(node.strokes).toBeDefined();
    expect(node.strokes).toHaveLength(1);
    const stroke = node.strokes![0];
    expect(stroke.weight).toBe(1);
    expect(stroke.style).toBe("SOLID");
    expect(stroke.sides).toEqual({
      top: false, right: false, bottom: true, left: false,
    });
    expect(stroke.color.a).toBeCloseTo(0.16, 2);
  });
});
