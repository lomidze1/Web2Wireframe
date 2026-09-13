/**
 * Text metrics under a scaling CSS transform.
 *
 * A scaled element's captured box is the POST-transform AABB, so the node
 * renders at the scaled size — but `getComputedStyle().fontSize` is the
 * UNTRANSFORMED value, because CSS transforms do not change computed font-size.
 * Left alone, a `scale(1.5)` heading gets a 1.5x box with 1.0x glyphs.
 */
import { describe, it, expect, vi } from "vitest";
import { rescaleTextMetrics } from "../rendering/text";

type Range = { start: number; end: number; fontSize: number };

function stubText(overrides: Record<string, unknown> = {}) {
  const ranges: Range[] = [];
  return {
    characters: "Hello world",
    fontSize: 20 as number | symbol,
    lineHeight: { value: 30, unit: "PIXELS" } as unknown,
    letterSpacing: { value: 2, unit: "PIXELS" } as unknown,
    appliedRanges: ranges,
    getStyledTextSegments: vi.fn(() => [
      { start: 0, end: 11, fontSize: 20 },
    ]),
    setRangeFontSize: vi.fn((start: number, end: number, fontSize: number) => {
      ranges.push({ start, end, fontSize });
    }),
    ...overrides,
  };
}

/** Cast helper — the stub only implements the surface rescaleTextMetrics touches. */
const asText = (n: unknown) => n as unknown as TextNode;

describe("rescaleTextMetrics", () => {
  it("scales fontSize, PIXELS lineHeight and letterSpacing", () => {
    const t = stubText();
    rescaleTextMetrics(asText(t), 1.5, 1.5);

    expect(t.appliedRanges).toEqual([{ start: 0, end: 11, fontSize: 30 }]);
    expect(t.lineHeight).toEqual({ value: 45, unit: "PIXELS" });
    expect(t.letterSpacing).toEqual({ value: 3, unit: "PIXELS" });
  });

  it("uses the horizontal scale for glyphs and the vertical for line height", () => {
    const t = stubText();
    rescaleTextMetrics(asText(t), 2, 0.5);

    expect(t.appliedRanges[0].fontSize).toBeCloseTo(40, 6);
    expect(t.lineHeight).toEqual({ value: 15, unit: "PIXELS" });
    // letter-spacing is a horizontal metric
    expect(t.letterSpacing).toEqual({ value: 4, unit: "PIXELS" });
  });

  it("rescales EVERY range, keeping mixed runs proportional", () => {
    const t = stubText({
      getStyledTextSegments: vi.fn(() => [
        { start: 0, end: 5, fontSize: 20 },
        { start: 5, end: 11, fontSize: 40 },
      ]),
    });
    rescaleTextMetrics(asText(t), 1.5, 1.5);

    expect(t.appliedRanges).toEqual([
      { start: 0, end: 5, fontSize: 30 },
      { start: 5, end: 11, fontSize: 60 },
    ]);
  });

  it("leaves a range alone when its fontSize is missing rather than inventing one", () => {
    const t = stubText({
      getStyledTextSegments: vi.fn(() => [
        { start: 0, end: 5, fontSize: 20 },
        { start: 5, end: 11 }, // no fontSize
      ]),
    });
    rescaleTextMetrics(asText(t), 2, 2);

    expect(t.appliedRanges).toEqual([{ start: 0, end: 5, fontSize: 40 }]);
  });

  it("leaves relative units alone — they already track fontSize", () => {
    const t = stubText({
      lineHeight: { value: 150, unit: "PERCENT" },
      letterSpacing: { value: 5, unit: "PERCENT" },
    });
    rescaleTextMetrics(asText(t), 2, 2);

    expect(t.lineHeight).toEqual({ value: 150, unit: "PERCENT" });
    expect(t.letterSpacing).toEqual({ value: 5, unit: "PERCENT" });
  });

  it("leaves AUTO line height alone", () => {
    const t = stubText({ lineHeight: { unit: "AUTO" } });
    rescaleTextMetrics(asText(t), 2, 2);
    expect(t.lineHeight).toEqual({ unit: "AUTO" });
  });

  it("no-ops for a unit scale", () => {
    const t = stubText();
    rescaleTextMetrics(asText(t), 1, 1);
    expect(t.setRangeFontSize).not.toHaveBeenCalled();
    expect(t.lineHeight).toEqual({ value: 30, unit: "PIXELS" });
  });

  it("survives figma.mixed metrics without throwing", () => {
    const t = stubText({
      fontSize: Symbol("mixed"),
      lineHeight: Symbol("mixed"),
      letterSpacing: Symbol("mixed"),
      getStyledTextSegments: vi.fn(() => {
        throw new Error("segments unavailable");
      }),
    });
    expect(() => rescaleTextMetrics(asText(t), 1.5, 1.5)).not.toThrow();
  });

  it("never throws when a setter blows up", () => {
    const t = stubText({
      setRangeFontSize: vi.fn(() => {
        throw new Error("locked");
      }),
    });
    expect(() => rescaleTextMetrics(asText(t), 1.5, 1.5)).not.toThrow();
  });

  it("ignores a degenerate or non-finite scale", () => {
    const t = stubText();
    rescaleTextMetrics(asText(t), 0, 0);
    rescaleTextMetrics(asText(t), NaN, 2);
    expect(t.setRangeFontSize).not.toHaveBeenCalled();
  });

  it("keeps the 8px floor the rest of the text pipeline uses", () => {
    const t = stubText({
      getStyledTextSegments: vi.fn(() => [{ start: 0, end: 11, fontSize: 20 }]),
    });
    rescaleTextMetrics(asText(t), 0.1, 0.1);
    expect(t.appliedRanges[0].fontSize).toBe(8);
  });
});
