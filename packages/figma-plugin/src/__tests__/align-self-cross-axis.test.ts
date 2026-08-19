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
  it("copies align-self onto the child node", () => {
    const w2w = makeW2WFrame({
      styles: { display: "flex" },
      children: [
        makeW2WFrame({ styles: { alignSelf: "flex-end" } }),
        makeW2WFrame({ x: 100, styles: { alignSelf: "flex-start" } }),
      ],
    });
    const node = convertW2WToWireframe(w2w as never);
    expect(node.children[0].alignSelf).toBe("flex-end");
    expect(node.children[1].alignSelf).toBe("flex-start");
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

  it("maps center to INHERIT — Figma centers via counterAxisAlignItems", () => {
    expect(resolveChildLayoutAlign(cssAlignSelfToFigma("center", "MIN"), undefined)).toBe("INHERIT");
  });

  it("returns null when there is nothing to apply", () => {
    expect(resolveChildLayoutAlign("INHERIT", undefined)).toBeNull();
  });
});
