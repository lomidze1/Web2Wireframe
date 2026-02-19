/**
 * Style Parsers Unit Tests
 *
 * Tests for CSS to Figma conversion functions
 */

import { describe, it, expect } from "vitest";
import {
  parseColorToFigma,
  parseBackgroundToFills,
  parseBoxShadowToEffects,
  parseBackdropFilterToEffects,
  parseBordersToStrokes,
  resolveCSSVariables,
} from "../style-parsers";

describe("parseColorToFigma", () => {
  it("should parse hex colors", () => {
    const result = parseColorToFigma("#FF0000");
    expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("should parse shorthand hex colors", () => {
    const result = parseColorToFigma("#F00");
    expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("should parse hex colors with alpha", () => {
    const result = parseColorToFigma("#FF000080");
    expect(result).not.toBeNull();
    expect(result!.r).toBeCloseTo(1, 2);
    expect(result!.a).toBeCloseTo(0.5, 1);
  });

  it("should parse rgb colors", () => {
    const result = parseColorToFigma("rgb(255, 128, 0)");
    expect(result).not.toBeNull();
    expect(result!.r).toBeCloseTo(1, 2);
    expect(result!.g).toBeCloseTo(0.5, 1);
    expect(result!.b).toBe(0);
    expect(result!.a).toBe(1);
  });

  it("should parse rgba colors", () => {
    const result = parseColorToFigma("rgba(255, 0, 0, 0.5)");
    expect(result).not.toBeNull();
    expect(result!.r).toBe(1);
    expect(result!.a).toBe(0.5);
  });

  it("should return null for transparent", () => {
    expect(parseColorToFigma("transparent")).toBeNull();
    expect(parseColorToFigma("rgba(0, 0, 0, 0)")).toBeNull();
  });

  it("should return transparent when allowTransparent is true", () => {
    const result = parseColorToFigma("transparent", true);
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("should parse named colors", () => {
    expect(parseColorToFigma("white")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColorToFigma("black")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColorToFigma("red")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("should return null for invalid colors", () => {
    expect(parseColorToFigma(null)).toBeNull();
    expect(parseColorToFigma(undefined)).toBeNull();
    expect(parseColorToFigma("none")).toBeNull();
  });
});

describe("parseBackgroundToFills", () => {
  it("should parse solid color background", () => {
    const fills = parseBackgroundToFills(null, "#FF0000");
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("SOLID");
    expect(fills[0].color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("should parse linear gradient", () => {
    const fills = parseBackgroundToFills(
      "linear-gradient(90deg, red, blue)",
      null
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[0].angle).toBe(90);
    expect(fills[0].stops).toHaveLength(2);
  });

  it("should parse linear gradient with to direction", () => {
    const fills = parseBackgroundToFills(
      "linear-gradient(to right, #000, #fff)",
      null
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[0].angle).toBe(90);
  });

  it("should parse radial gradient", () => {
    const fills = parseBackgroundToFills(
      "radial-gradient(circle at 50% 50%, red, blue)",
      null
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("GRADIENT_RADIAL");
    expect(fills[0].center).toEqual({ x: 0.5, y: 0.5 });
    expect(fills[0].shape).toBe("circle");
  });

  it("should parse multiple backgrounds", () => {
    const fills = parseBackgroundToFills(
      "linear-gradient(red, blue), linear-gradient(green, yellow)",
      null
    );
    expect(fills).toHaveLength(2);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[1].type).toBe("GRADIENT_LINEAR");
  });

  it("should handle url() as image placeholder", () => {
    const fills = parseBackgroundToFills(
      "url('image.png')",
      null
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("IMAGE_PLACEHOLDER");
  });

  it("should resolve CSS variables", () => {
    const variables = new Map([["--primary", "#0000FF"]]);
    const fills = parseBackgroundToFills(
      "var(--primary)",
      null,
      variables
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("SOLID");
    expect(fills[0].color).toEqual({ r: 0, g: 0, b: 1, a: 1 });
  });

  it("should handle gradient with transparent stops", () => {
    const fills = parseBackgroundToFills(
      "linear-gradient(transparent, #FF0000)",
      null
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].stops).toHaveLength(2);
    // First stop should use red's RGB with alpha 0
    expect(fills[0].stops![0].color.a).toBe(0);
    expect(fills[0].stops![0].color.r).toBe(1);
  });
});

describe("parseBoxShadowToEffects", () => {
  it("should parse simple drop shadow", () => {
    const effects = parseBoxShadowToEffects("2px 4px 6px rgba(0,0,0,0.5)");
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("DROP_SHADOW");
    expect(effects[0].offset).toEqual({ x: 2, y: 4 });
    expect(effects[0].radius).toBe(6);
  });

  it("should parse inset shadow", () => {
    const effects = parseBoxShadowToEffects("inset 0 2px 4px #000");
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("INNER_SHADOW");
  });

  it("should parse shadow with spread", () => {
    const effects = parseBoxShadowToEffects("0 4px 8px 2px rgba(0,0,0,0.25)");
    expect(effects).toHaveLength(1);
    expect(effects[0].spread).toBe(2);
  });

  it("should parse multiple shadows", () => {
    const effects = parseBoxShadowToEffects(
      "0 2px 4px #000, 0 4px 8px #333"
    );
    expect(effects).toHaveLength(2);
  });

  it("should return empty array for none", () => {
    expect(parseBoxShadowToEffects("none")).toEqual([]);
    expect(parseBoxShadowToEffects(null)).toEqual([]);
  });
});

describe("parseBackdropFilterToEffects", () => {
  it("should parse blur filter", () => {
    const effects = parseBackdropFilterToEffects("blur(10px)");
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("BACKGROUND_BLUR");
    expect(effects[0].blurRadius).toBe(10);
  });

  it("should parse blur without px unit", () => {
    const effects = parseBackdropFilterToEffects("blur(8)");
    expect(effects).toHaveLength(1);
    expect(effects[0].blurRadius).toBe(8);
  });

  it("should return empty array for none", () => {
    expect(parseBackdropFilterToEffects("none")).toEqual([]);
    expect(parseBackdropFilterToEffects(null)).toEqual([]);
  });
});

describe("parseBordersToStrokes", () => {
  it("should parse shorthand border", () => {
    const strokes = parseBordersToStrokes(
      "2",
      "#FF0000",
      "solid",
      null, null, null, null
    );
    expect(strokes).toHaveLength(1);
    expect(strokes[0].weight).toBe(2);
    expect(strokes[0].color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(strokes[0].style).toBe("SOLID");
  });

  it("should parse dashed border", () => {
    const strokes = parseBordersToStrokes(
      "1",
      "#000",
      "dashed",
      null, null, null, null
    );
    expect(strokes).toHaveLength(1);
    expect(strokes[0].style).toBe("DASHED");
  });

  it("should parse individual borders", () => {
    const strokes = parseBordersToStrokes(
      null, null, null,
      "1px solid red",
      null,
      "2px solid blue",
      null
    );
    expect(strokes).toHaveLength(2);
    expect(strokes[0].sides?.top).toBe(true);
    expect(strokes[1].sides?.bottom).toBe(true);
  });

  it("should return empty array for zero width", () => {
    const strokes = parseBordersToStrokes("0", "#000", "solid");
    expect(strokes).toEqual([]);
  });
});

describe("resolveCSSVariables", () => {
  it("should resolve simple variable", () => {
    const variables = new Map([["--color", "red"]]);
    expect(resolveCSSVariables("var(--color)", variables)).toBe("red");
  });

  it("should resolve variable with fallback", () => {
    const variables = new Map<string, string>();
    expect(resolveCSSVariables("var(--unknown, blue)", variables)).toBe("blue");
  });

  it("should keep original if not resolved", () => {
    const variables = new Map<string, string>();
    expect(resolveCSSVariables("var(--unknown)", variables)).toBe("var(--unknown)");
  });

  it("should resolve nested in gradient", () => {
    const variables = new Map([["--start", "#FF0000"], ["--end", "#0000FF"]]);
    const result = resolveCSSVariables(
      "linear-gradient(var(--start), var(--end))",
      variables
    );
    expect(result).toBe("linear-gradient(#FF0000, #0000FF)");
  });

  it("should return value unchanged if no var()", () => {
    const variables = new Map<string, string>();
    expect(resolveCSSVariables("#FF0000", variables)).toBe("#FF0000");
  });
});
