/**
 * Tests for convertStrokesToFigma — individual per-side weight flattening.
 *
 * Covers: uniform single stroke, non-uniform sides (Apple.com case), mixed
 * widths, mixed styles (first wins), plugin-colors mode override.
 */
import { describe, it, expect } from "vitest";
import { convertStrokesToFigma } from "../rendering/fills";
import type { FigmaStroke } from "../types";

const RED = { r: 1, g: 0, b: 0, a: 1 };
const GRAY = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

function uniformStroke(): FigmaStroke {
  return {
    color: RED,
    weight: 2,
    position: "INSIDE",
    style: "SOLID",
    sides: { top: true, right: true, bottom: true, left: true },
  };
}

describe("convertStrokesToFigma", () => {
  it("returns empty for undefined/empty input", () => {
    expect(convertStrokesToFigma(undefined).paints).toEqual([]);
    expect(convertStrokesToFigma([]).paints).toEqual([]);
  });

  it("uniform single all-sides stroke → weight set, no individualWeights", () => {
    const result = convertStrokesToFigma([uniformStroke()]);
    expect(result.paints).toHaveLength(1);
    expect(result.weight).toBe(2);
    expect(result.individualWeights).toBeUndefined();
    expect(result.style).toBe("SOLID");
  });

  it("Apple.com case: single bottom-only stroke → individualWeights with bottom=1, others=0", () => {
    const bottomStroke: FigmaStroke = {
      color: GRAY,
      weight: 1,
      position: "INSIDE",
      style: "SOLID",
      sides: { top: false, right: false, bottom: true, left: false },
    };
    const result = convertStrokesToFigma([bottomStroke]);
    expect(result.paints).toHaveLength(1);
    expect(result.individualWeights).toEqual({
      top: 0, right: 0, bottom: 1, left: 0,
    });
    expect(result.weight).toBe(1);
  });

  it("4 sides with different widths → individualWeights populated per side", () => {
    const strokes: FigmaStroke[] = [
      { color: RED, weight: 1, position: "INSIDE", style: "SOLID", sides: { top: true,  right: false, bottom: false, left: false } },
      { color: RED, weight: 2, position: "INSIDE", style: "SOLID", sides: { top: false, right: true,  bottom: false, left: false } },
      { color: RED, weight: 3, position: "INSIDE", style: "SOLID", sides: { top: false, right: false, bottom: true,  left: false } },
      { color: RED, weight: 4, position: "INSIDE", style: "SOLID", sides: { top: false, right: false, bottom: false, left: true  } },
    ];
    const result = convertStrokesToFigma(strokes);
    expect(result.individualWeights).toEqual({
      top: 1, right: 2, bottom: 3, left: 4,
    });
    expect(result.weight).toBe(4); // max
  });

  it("mixed styles across sides → first stroke's style wins", () => {
    const strokes: FigmaStroke[] = [
      { color: RED, weight: 1, position: "INSIDE", style: "DASHED", sides: { top: true, right: false, bottom: false, left: false } },
      { color: RED, weight: 1, position: "INSIDE", style: "SOLID",  sides: { top: false, right: false, bottom: true, left: false } },
    ];
    const result = convertStrokesToFigma(strokes);
    expect(result.style).toBe("DASHED");
  });

  it("mixed colors → first stroke's color wins (Figma single-paint limitation)", () => {
    const strokes: FigmaStroke[] = [
      { color: RED,  weight: 1, position: "INSIDE", style: "SOLID", sides: { top: true, right: false, bottom: false, left: false } },
      { color: GRAY, weight: 1, position: "INSIDE", style: "SOLID", sides: { top: false, right: false, bottom: true, left: false } },
    ];
    const result = convertStrokesToFigma(strokes);
    const paint = result.paints[0] as { type: string; color: { r: number; g: number; b: number } };
    expect(paint.color.r).toBeCloseTo(1);
    expect(paint.color.g).toBeCloseTo(0);
  });

  it("plugin-colors mode overrides stroke color with pluginColors.text", () => {
    const result = convertStrokesToFigma([uniformStroke()], {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      colorMode: "plugin",
      pluginColors: { text: "#11151A", primary: "#000", secondary: "#888", background: "#FFF" },
    } as unknown as Parameters<typeof convertStrokesToFigma>[1]);
    expect(result.paints).toHaveLength(1);
    // Red no longer present — replaced by plugin text color.
    const paint = result.paints[0] as { color: { r: number; g: number; b: number } };
    expect(paint.color.r).toBeLessThan(0.2);
  });

  it("uniform when all per-side weights equal, even without allSides flag", () => {
    const strokes: FigmaStroke[] = [
      { color: RED, weight: 2, position: "INSIDE", style: "SOLID", sides: { top: true,  right: false, bottom: false, left: false } },
      { color: RED, weight: 2, position: "INSIDE", style: "SOLID", sides: { top: false, right: true,  bottom: false, left: false } },
      { color: RED, weight: 2, position: "INSIDE", style: "SOLID", sides: { top: false, right: false, bottom: true,  left: false } },
      { color: RED, weight: 2, position: "INSIDE", style: "SOLID", sides: { top: false, right: false, bottom: false, left: true  } },
    ];
    const result = convertStrokesToFigma(strokes);
    expect(result.weight).toBe(2);
    expect(result.individualWeights).toBeUndefined();
  });
});
