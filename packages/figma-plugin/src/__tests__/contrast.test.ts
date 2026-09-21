import { describe, it, expect } from "vitest";
import {
  compositeOver,
  flattenStack,
  isLargeText,
  passesContrast,
  requiredRatio,
  wcagRatio,
  type RGBA,
} from "../utils/contrast";

const hex = (h: string, a = 1): RGBA => ({
  r: parseInt(h.slice(1, 3), 16) / 255,
  g: parseInt(h.slice(3, 5), 16) / 255,
  b: parseInt(h.slice(5, 7), 16) / 255,
  a,
});

const WHITE = hex("#ffffff");
const BLACK = hex("#000000");

describe("wcagRatio", () => {
  it("black on white is 21:1 and passes AA", () => {
    expect(wcagRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(passesContrast(BLACK, WHITE, requiredRatio(false, "AA"))).toBe(true);
  });

  it("light grey on white fails AA", () => {
    const grey = hex("#cccccc");
    expect(wcagRatio(grey, WHITE)).toBeCloseTo(1.61, 2);
    expect(passesContrast(grey, WHITE, requiredRatio(false, "AA"))).toBe(false);
  });

  it("is symmetric", () => {
    const c = hex("#336699");
    expect(wcagRatio(c, WHITE)).toBeCloseTo(wcagRatio(WHITE, c), 10);
  });

  it("composites a translucent foreground over the background first", () => {
    // 50% black over white ≈ #808080 → ~3.95:1
    expect(wcagRatio(hex("#000000", 0.5), WHITE)).toBeCloseTo(3.95, 1);
  });
});

describe("large text threshold (3:1)", () => {
  const grey = hex("#949494"); // ≈ 3.03:1 on white

  it("passes at 24px, fails at 16px", () => {
    expect(wcagRatio(grey, WHITE)).toBeGreaterThan(3);
    expect(wcagRatio(grey, WHITE)).toBeLessThan(4.5);
    expect(passesContrast(grey, WHITE, requiredRatio(isLargeText(24, 400), "AA"))).toBe(true);
    expect(passesContrast(grey, WHITE, requiredRatio(isLargeText(16, 400), "AA"))).toBe(false);
  });

  it("18.66px counts as large only when bold", () => {
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false);
  });

  it("required ratios per level", () => {
    expect(requiredRatio(false, "AA")).toBe(4.5);
    expect(requiredRatio(true, "AA")).toBe(3);
    expect(requiredRatio(false, "AAA")).toBe(7);
    expect(requiredRatio(true, "AAA")).toBe(4.5);
  });
});

describe("compositing", () => {
  it("opaque top wins", () => {
    expect(compositeOver(BLACK, WHITE)).toEqual(BLACK);
  });

  it("flattens a stack bottom-first", () => {
    const out = flattenStack([WHITE, hex("#000000", 0.5)]);
    expect(out.a).toBe(1);
    expect(out.r).toBeCloseTo(0.5, 5);
  });
});
