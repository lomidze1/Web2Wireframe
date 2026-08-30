/**
 * Defect 4 (h2d parity): per-side border colors. `strokes[0]` used to supply
 * the color for ALL sides, so `border-top: 1px solid blue` +
 * `border-bottom: 2px solid red` rendered both sides red.
 *
 * Port of h2d's two-color approach (`uD` app.js:46135, `mD` :46646,
 * `CD` :47261):
 *   • exactly two visible sides with two colors → GRADIENT_LINEAR with both
 *     stops at position 0 (hard split along the border edge / miter line)
 *   • four sides where exactly one differs (or three sides with an equal
 *     opposite pair) → GRADIENT_DIAMOND with stops at 0.9999999 / 1,
 *     reproducing the 45° miter joins
 *   • three or more distinct colors → first color + a logged warning
 *     (h2d logs "Unsupported mixed border colors"), never silent
 */
import { describe, it, expect, vi } from "vitest";
import { convertStrokesToFigma } from "../rendering/fills";
import type { FigmaStroke, RenderContext } from "../types";
import { logger } from "../utils/logger";

const DEFAULT_PLUGIN_COLORS = {
  text: "#11151A",
  background: "#F1F2F0",
  secondary: "#1f3a5f",
  surface: "#f5f5f5",
  accent: "#3b82f6",
};

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: DEFAULT_PLUGIN_COLORS,
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "absolute",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "plugin",
    ...overrides,
  } as RenderContext;
}

const RED = { r: 1, g: 0, b: 0, a: 1 };
const BLUE = { r: 0, g: 0, b: 1, a: 1 };
const GRAY = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

function sideStroke(
  side: "top" | "right" | "bottom" | "left",
  color: { r: number; g: number; b: number; a: number },
  weight: number,
): FigmaStroke {
  return {
    color,
    weight,
    position: "INSIDE",
    style: "SOLID",
    sides: {
      top: side === "top",
      right: side === "right",
      bottom: side === "bottom",
      left: side === "left",
    },
  };
}

describe("two-color borders — opposite pair (hard-split linear)", () => {
  it("top blue 1px + bottom red 2px on a 100x100 box → GRADIENT_LINEAR, both stops at 0", () => {
    const result = convertStrokesToFigma(
      [sideStroke("top", BLUE, 1), sideStroke("bottom", RED, 2)],
      makeContext(),
      100,
      100,
    );
    expect(result.paints).toHaveLength(1);
    const paint = result.paints[0] as GradientPaint;
    expect(paint.type).toBe("GRADIENT_LINEAR");
    expect(paint.gradientStops).toHaveLength(2);
    expect(paint.gradientStops[0].position).toBe(0);
    expect(paint.gradientStops[1].position).toBe(0);
    // start = bottom color (gradient < 0 side), end = top color.
    expect(paint.gradientStops[0].color.r).toBeCloseTo(1, 5);
    expect(paint.gradientStops[1].color.b).toBeCloseTo(1, 5);
    // M = translate(0,0.5) · rotateDeg(90) · translate(−0.5, w_bottom/H − 1):
    // gradient position = 0.98 − y → only the bottom 2px strip goes negative
    // (red), everything above the split is blue.
    const t = paint.gradientTransform;
    expect(t[0][0]).toBeCloseTo(0, 5);
    expect(t[0][1]).toBeCloseTo(-1, 5);
    expect(t[0][2]).toBeCloseTo(0.98, 5);
    expect(t[1][0]).toBeCloseTo(1, 5);
    expect(t[1][1]).toBeCloseTo(0, 5);
    expect(t[1][2]).toBeCloseTo(0, 5);
  });

  it("left red + right blue → split at the left border's inner edge", () => {
    const result = convertStrokesToFigma(
      [sideStroke("left", RED, 10), sideStroke("right", BLUE, 10)],
      makeContext(),
      100,
      100,
    );
    const paint = result.paints[0] as GradientPaint;
    expect(paint.type).toBe("GRADIENT_LINEAR");
    // M = translate(−w_left/W, 0) → gradient position = x − 0.1.
    const t = paint.gradientTransform;
    expect(t[0][0]).toBeCloseTo(1, 5);
    expect(t[0][2]).toBeCloseTo(-0.1, 5);
    // start = left color, end = right color.
    expect(paint.gradientStops[0].color.r).toBeCloseTo(1, 5);
    expect(paint.gradientStops[1].color.b).toBeCloseTo(1, 5);
  });
});

describe("two-color borders — adjacent pair (miter-angle linear)", () => {
  it("top red + left blue (equal weights) → split along the 45° corner diagonal", () => {
    const result = convertStrokesToFigma(
      [sideStroke("top", RED, 1), sideStroke("left", BLUE, 1)],
      makeContext(),
      100,
      100,
    );
    const paint = result.paints[0] as GradientPaint;
    expect(paint.type).toBe("GRADIENT_LINEAR");
    // M = translate(0,0.5) · rotate(atan2(1,1)) · scale(1, h/w):
    // gradient position = cos45·(x − y) — the top-left miter diagonal.
    const t = paint.gradientTransform;
    const c = Math.SQRT1_2;
    expect(t[0][0]).toBeCloseTo(c, 5);
    expect(t[0][1]).toBeCloseTo(-c, 5);
    expect(t[0][2]).toBeCloseTo(0, 5);
    // start = left color (below the diagonal), end = top color.
    expect(paint.gradientStops[0].color.b).toBeCloseTo(1, 5);
    expect(paint.gradientStops[1].color.r).toBeCloseTo(1, 5);
  });
});

describe("one side differs — GRADIENT_DIAMOND (miter joins)", () => {
  it("gray border with a red bottom on a tall box → diamond with stops 0.9999999 / 1", () => {
    const result = convertStrokesToFigma(
      [
        sideStroke("top", GRAY, 2),
        sideStroke("right", GRAY, 2),
        sideStroke("bottom", RED, 2),
        sideStroke("left", GRAY, 2),
      ],
      makeContext(),
      100,
      300,
    );
    expect(result.paints).toHaveLength(1);
    const paint = result.paints[0] as GradientPaint;
    expect(paint.type).toBe("GRADIENT_DIAMOND");
    expect(paint.gradientStops[0].position).toBeCloseTo(0.9999999, 7);
    expect(paint.gradientStops[1].position).toBe(1);
    // Inside the diamond = the differing side's color; outside = the common.
    expect(paint.gradientStops[0].color.r).toBeCloseTo(1, 5);
    expect(paint.gradientStops[1].color.r).toBeCloseTo(0.5, 5);
    // q=0 (opposite of bottom): M = translate(0,−0.5) · scaleAt(1, 3, 0.5, 1)
    // → the box's bottom-center maps to the diamond center and the bottom
    // corners land exactly on the diamond edge (position 1).
    const t = paint.gradientTransform;
    expect(t[0][0]).toBeCloseTo(1, 5);
    expect(t[1][1]).toBeCloseTo(3, 5);
    expect(t[1][2]).toBeCloseTo(-2.5, 5);
  });

  it("three sides with an equal opposite pair (caret-like) also gets the diamond", () => {
    const result = convertStrokesToFigma(
      [
        sideStroke("right", GRAY, 2),
        sideStroke("bottom", RED, 2),
        sideStroke("left", GRAY, 2),
      ],
      makeContext(),
      100,
      300,
    );
    const paint = result.paints[0] as GradientPaint;
    expect(paint.type).toBe("GRADIENT_DIAMOND");
    expect(paint.gradientStops[0].color.r).toBeCloseTo(1, 5);
    expect(paint.gradientStops[1].color.r).toBeCloseTo(0.5, 5);
  });
});

describe("fallbacks", () => {
  it("three distinct colors fall back to the first color and log a warning", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const result = convertStrokesToFigma(
      [
        sideStroke("top", RED, 1),
        sideStroke("right", BLUE, 1),
        sideStroke("bottom", GRAY, 1),
      ],
      makeContext(),
      100,
      100,
    );
    expect(result.paints).toHaveLength(1);
    const paint = result.paints[0] as SolidPaint;
    expect(paint.type).toBe("SOLID");
    expect(paint.color.r).toBeCloseTo(1, 5);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unsupported mixed border colors"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("without frame dimensions the current single-color behavior is unchanged", () => {
    const result = convertStrokesToFigma(
      [sideStroke("top", BLUE, 1), sideStroke("bottom", RED, 2)],
      makeContext(),
    );
    expect((result.paints[0] as SolidPaint).type).toBe("SOLID");
  });

  it("plugin-colors mode keeps the uniform text-color stroke", () => {
    const result = convertStrokesToFigma(
      [sideStroke("top", BLUE, 1), sideStroke("bottom", RED, 2)],
      makeContext({ colorMode: "plugin" } as Partial<RenderContext>),
      100,
      100,
    );
    expect((result.paints[0] as SolidPaint).type).toBe("SOLID");
  });

  it("a single distinct color keeps the solid stroke even with per-side weights", () => {
    const result = convertStrokesToFigma(
      [sideStroke("top", RED, 1), sideStroke("bottom", RED, 3)],
      makeContext(),
      100,
      100,
    );
    expect((result.paints[0] as SolidPaint).type).toBe("SOLID");
    expect(result.individualWeights).toEqual({ top: 1, right: 0, bottom: 3, left: 0 });
  });
});
