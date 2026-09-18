/**
 * CSS `filter` color functions baked into Figma paints.
 *
 * Figma has no subtree filter, so a logo turned white with `filter: invert(1)`
 * (notion.com, komplice.com — user import reports 2026-09-16) rendered black on
 * a dark section. The renderer now applies the Filter Effects color math to
 * every SOLID/gradient paint, stroke, shadow and text run under the element.
 * Raster IMAGE paints can't be recolored this way: grayscale/saturate map onto
 * Figma's saturation adjustment, anything else is reported.
 */
import { describe, it, expect, vi } from "vitest";
import {
  parseColorFilter,
  applyColorFilter,
  bakeColorFilter,
} from "../rendering/cssFilter";

const close = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThan(0.002);

describe("parseColorFilter", () => {
  it("keeps color functions in order and drops the rest", () => {
    const ops = parseColorFilter("blur(4px) brightness(0) drop-shadow(0 0 2px red) invert(100%) url(#f)");
    expect(ops.map((o) => o.name)).toEqual(["brightness", "invert"]);
    expect(ops[1].amount).toBe(1);
  });

  it("drops identity functions and returns nothing for none", () => {
    expect(parseColorFilter("invert(0) brightness(1) saturate(100%)")).toEqual([]);
    expect(parseColorFilter("none")).toEqual([]);
    expect(parseColorFilter("")).toEqual([]);
  });

  it("reads angles for hue-rotate", () => {
    close(parseColorFilter("hue-rotate(0.5turn)")[0].amount, 180);
    close(parseColorFilter("hue-rotate(3.14159rad)")[0].amount, 180);
  });

  it("uses the CSS default when the argument is omitted", () => {
    expect(parseColorFilter("invert()")[0].amount).toBe(1);
    expect(parseColorFilter("grayscale()")[0].amount).toBe(1);
  });
});

describe("applyColorFilter", () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const red = { r: 1, g: 0, b: 0, a: 1 };

  it("invert(1) turns black white", () => {
    expect(applyColorFilter(black, parseColorFilter("invert(1)"))).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("brightness(0) invert(1) turns any color white", () => {
    expect(applyColorFilter({ r: 0.2, g: 0.6, b: 0.9, a: 1 }, parseColorFilter("brightness(0) invert(1)")))
      .toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("invert(0.5) lands on mid gray", () => {
    const c = applyColorFilter(black, parseColorFilter("invert(50%)"));
    close(c.r, 0.5);
  });

  it("grayscale(1) uses the spec luminance weights", () => {
    const c = applyColorFilter(red, parseColorFilter("grayscale(1)"));
    close(c.r, 0.2126);
    close(c.g, 0.2126);
    close(c.b, 0.2126);
  });

  it("saturate(0) matches the saturate matrix", () => {
    const c = applyColorFilter(red, parseColorFilter("saturate(0)"));
    close(c.r, 0.213);
    close(c.g, 0.213);
  });

  it("sepia(1) on white", () => {
    const c = applyColorFilter({ r: 1, g: 1, b: 1, a: 1 }, parseColorFilter("sepia(1)"));
    expect(c.r).toBe(1); // .393+.769+.189 > 1 → clamped
    close(c.b, 0.937);
  });

  it("contrast clamps per step", () => {
    const c = applyColorFilter({ r: 0.75, g: 0.25, b: 0.5, a: 1 }, parseColorFilter("contrast(3)"));
    expect(c.r).toBe(1);
    expect(c.g).toBe(0);
    close(c.b, 0.5);
  });

  it("hue-rotate(360deg) is a no-op", () => {
    const c = applyColorFilter({ r: 0.3, g: 0.5, b: 0.7, a: 1 }, parseColorFilter("hue-rotate(360deg)"));
    close(c.r, 0.3);
    close(c.g, 0.5);
    close(c.b, 0.7);
  });

  it("opacity() scales alpha only", () => {
    expect(applyColorFilter({ r: 0.2, g: 0.2, b: 0.2, a: 0.8 }, parseColorFilter("opacity(0.5)")))
      .toEqual({ r: 0.2, g: 0.2, b: 0.2, a: 0.4 });
  });
});

// ============================================================================
// bakeColorFilter — walks a created Figma subtree
// ============================================================================

type Anyish = Record<string, unknown>;

function solid(r: number, g: number, b: number, opacity = 1) {
  return { type: "SOLID", color: { r, g, b }, opacity, visible: true };
}

describe("bakeColorFilter", () => {
  it("recolors fills, strokes, gradients, shadows and descendants", () => {
    const vector: Anyish = { type: "VECTOR", fills: [solid(0, 0, 0)], strokes: [solid(0, 0, 0)] };
    const frame: Anyish = {
      type: "FRAME",
      fills: [{
        type: "GRADIENT_LINEAR",
        gradientTransform: [[1, 0, 0], [0, 1, 0]],
        gradientStops: [
          { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 1, g: 1, b: 1, a: 0.5 } },
        ],
      }],
      strokes: [],
      effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 2 }, radius: 4, visible: true, blendMode: "NORMAL" }],
      children: [vector],
    };

    const result = bakeColorFilter(frame as unknown as SceneNode, parseColorFilter("invert(1)"));

    expect((vector.fills as Anyish[])[0]).toMatchObject({ color: { r: 1, g: 1, b: 1 } });
    expect((vector.strokes as Anyish[])[0]).toMatchObject({ color: { r: 1, g: 1, b: 1 } });
    const stops = ((frame.fills as Anyish[])[0].gradientStops as Anyish[]);
    expect(stops[0].color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(stops[1].color).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect((frame.effects as Anyish[])[0].color).toEqual({ r: 1, g: 1, b: 1, a: 0.25 });
    expect(result.unbakedImages).toBe(0);
  });

  it("recolors mixed text runs range by range", () => {
    const setRangeFills = vi.fn();
    const text: Anyish = {
      type: "TEXT",
      fills: Symbol("mixed"),
      characters: "ab",
      getStyledTextSegments: () => [
        { start: 0, end: 1, fills: [solid(0, 0, 0)] },
        { start: 1, end: 2, fills: [solid(1, 1, 1)] },
      ],
      setRangeFills,
    };
    bakeColorFilter(text as unknown as SceneNode, parseColorFilter("invert(1)"));
    expect(setRangeFills).toHaveBeenCalledWith(0, 1, [expect.objectContaining({ color: { r: 1, g: 1, b: 1 } })]);
    expect(setRangeFills).toHaveBeenCalledWith(1, 2, [expect.objectContaining({ color: { r: 0, g: 0, b: 0 } })]);
  });

  it("maps grayscale onto an image's saturation and counts other image filters", () => {
    const img = { type: "IMAGE", imageHash: "h", scaleMode: "FILL" };
    const gray: Anyish = { type: "RECTANGLE", fills: [{ ...img }] };
    const inverted: Anyish = { type: "RECTANGLE", fills: [{ ...img }] };

    const g = bakeColorFilter(gray as unknown as SceneNode, parseColorFilter("grayscale(1)"));
    expect((gray.fills as Anyish[])[0].filters).toEqual({ saturation: -1 });
    expect(g.unbakedImages).toBe(0);

    const i = bakeColorFilter(inverted as unknown as SceneNode, parseColorFilter("invert(1)"));
    expect((inverted.fills as Anyish[])[0].filters).toBeUndefined();
    expect(i.unbakedImages).toBe(1);
  });

  it("does not stack grayscale onto an image that already carries it", () => {
    const node: Anyish = {
      type: "FRAME",
      fills: [{ type: "IMAGE", imageHash: "h", scaleMode: "FILL", filters: { saturation: -0.5 } }],
    };
    bakeColorFilter(node as unknown as SceneNode, parseColorFilter("grayscale(0.5)"));
    expect((node.fills as Anyish[])[0].filters).toEqual({ saturation: -0.5 });
  });

  it("applies opacity() to the node, not to each paint", () => {
    const node: Anyish = { type: "FRAME", opacity: 0.8, fills: [solid(0.2, 0.2, 0.2)] };
    bakeColorFilter(node as unknown as SceneNode, parseColorFilter("opacity(0.5)"));
    close(node.opacity as number, 0.4);
    expect((node.fills as Anyish[])[0]).toMatchObject({ opacity: 1 });
  });
});
