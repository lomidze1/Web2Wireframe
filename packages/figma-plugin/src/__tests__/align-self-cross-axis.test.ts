/**
 * Tests for CSS `align-self` on flex children (cross-axis alignment).
 *
 * Only `align-self: stretch` used to survive the conversion: the css-converter
 * never copied the raw value onto the wireframe node, so `cssAlignSelfToFigma`
 * always saw `undefined` and returned INHERIT. Every `flex-end` / `center`
 * child therefore rendered flush against the line's start edge.
 *
 * Real-world case: iwm.org.uk `.branch-showcase__item` — the Churchill War
 * Rooms card is `align-self: flex-end` and sits at the BOTTOM of its mosaic
 * line, level with the taller IWM London card. It imported top-aligned.
 */
import { describe, it, expect } from "vitest";
import { cssAlignSelfToFigma, resolveChildLayoutAlign } from "../rendering/layout";
import { convertW2WToWireframe } from "../rendering/css-converter";

function makeW2WFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// css-converter carries align-self through
// ---------------------------------------------------------------------------

describe("convertW2WToWireframe — alignSelf", () => {
  it("carries align-self through to a per-child cross-axis wrapper", () => {
    // The raw value used to be dropped in the converter; now it reaches
    // `alignWrappers.ts`, which spends it on a `:align-*` frame. Either way
    // this is the guard that the CSS value survives the conversion.
    const w2w = makeW2WFrame({
      styles: { display: "flex" },
      children: [
        makeW2WFrame({ styles: { alignSelf: "flex-end" } }),
        makeW2WFrame({ x: 100, styles: { alignSelf: "flex-start" } }),
      ],
    });
    const node = convertW2WToWireframe(w2w as never);
    expect(node.children[0].name.endsWith(":align-flex-end")).toBe(true);
    expect(node.children[0].alignItems).toBe("flex-end");
    expect(node.children[1].name.endsWith(":align-flex-start")).toBe(true);
    expect(node.children[1].alignItems).toBe("flex-start");
  });

  it("leaves alignSelf unset when CSS says auto", () => {
    const w2w = makeW2WFrame({
      styles: { display: "flex" },
      children: [makeW2WFrame({ styles: { alignSelf: "auto" } })],
    });
    const node = convertW2WToWireframe(w2w as never);
    expect(node.children[0].alignSelf).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveChildLayoutAlign
// ---------------------------------------------------------------------------

describe("resolveChildLayoutAlign", () => {
  it("aligns a flex-end child to the far edge of its line", () => {
    expect(resolveChildLayoutAlign(cssAlignSelfToFigma("flex-end", "MIN"), undefined)).toBe("MAX");
  });

  it("aligns a flex-start child to the near edge", () => {
    expect(resolveChildLayoutAlign(cssAlignSelfToFigma("flex-start", "MAX"), undefined)).toBe("MIN");
  });

  it("keeps stretch winning over everything", () => {
    expect(resolveChildLayoutAlign(cssAlignSelfToFigma("stretch", "MIN"), undefined)).toBe("STRETCH");
  });

  it("still honours a node-level STRETCH when align-self is absent", () => {
    expect(resolveChildLayoutAlign("INHERIT", "STRETCH")).toBe("STRETCH");
  });

  // `layoutAlign` does accept CENTER in the typings, but the value does not
  // stick: Figma stores a child's counter-axis sizing and its layoutAlign as
  // one property, so the `layoutSizing*` write nodes.ts makes right after
  // resets it. Measured on a live import — 3321 nodes, zero MIN/CENTER/MAX.
  // Centring is done by a `:align-center` wrapper instead (alignWrappers.ts),
  // which is also the only mechanism h2d uses.
  it("leaves centring to the wrapper, not to layoutAlign", () => {
    expect(resolveChildLayoutAlign(cssAlignSelfToFigma("center", "MIN"), undefined)).toBe("INHERIT");
  });

  it("still lets stretch win over center", () => {
    expect(resolveChildLayoutAlign("STRETCH", undefined)).toBe("STRETCH");
  });

  it("returns null when there is nothing to apply", () => {
    expect(resolveChildLayoutAlign("INHERIT", undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stripe.com — the centred section heading
// ---------------------------------------------------------------------------

describe("align-self: center survives the conversion", () => {
  it("puts the heading in a full-width centring wrapper", () => {
    // div.section-row (column flex) holds a narrow centred heading and a
    // full-width stats row. Only the heading carries align-self: center.
    const parent = makeW2WFrame({
      width: 1234,
      height: 378,
      quad: [0, 0, 1234, 0, 1234, 378, 0, 378],
      styles: { display: "flex", flexDirection: "column" },
      children: [
        makeW2WFrame({
          tag: "h2",
          x: 372, y: 0, width: 489, height: 116,
          quad: [372, 0, 861, 0, 861, 116, 372, 116],
          styles: { display: "block", alignSelf: "center", textAlign: "center" },
        }),
        makeW2WFrame({
          x: 0, y: 195, width: 1234, height: 183,
          quad: [0, 195, 1234, 195, 1234, 378, 0, 378],
          styles: { display: "block" },
        }),
      ],
    });

    const result = convertW2WToWireframe(parent as never);
    const wrapper = result.children[0];

    expect(wrapper.name.endsWith(":align-center")).toBe(true);
    expect(wrapper.width).toBe(1234);
    expect(wrapper.alignItems).toBe("center");
    expect(wrapper.layoutAlign).toBe("STRETCH");
    expect(wrapper.children[0].width).toBe(489);
  });
});
