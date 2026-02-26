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
  extractCSSVariableName,
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

  it("should set cssVariable on fills created from bare var() layers", () => {
    const variables = new Map([["--bg", "#F7F8FB"]]);
    const fills = parseBackgroundToFills(
      "var(--bg)",
      null,
      variables
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("SOLID");
    expect(fills[0].cssVariable).toBe("--bg");
  });

  it("should set cssVariable on the var() layer in a multi-layer background", () => {
    const variables = new Map([["--bg", "#F7F8FB"]]);
    const fills = parseBackgroundToFills(
      "radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.08), transparent 28%), radial-gradient(circle at 80% 10%, rgba(36, 109, 255, 0.08), transparent 25%), var(--bg)",
      null,
      variables
    );
    expect(fills).toHaveLength(3);
    // First two radial gradients: no cssVariable
    expect(fills[0].type).toBe("GRADIENT_RADIAL");
    expect(fills[0].cssVariable).toBeUndefined();
    expect(fills[1].type).toBe("GRADIENT_RADIAL");
    expect(fills[1].cssVariable).toBeUndefined();
    // Third layer (from var(--bg)): cssVariable set
    expect(fills[2].type).toBe("SOLID");
    expect(fills[2].cssVariable).toBe("--bg");
  });

  it("should set cssVariable when var() resolves to a gradient", () => {
    const variables = new Map([["--gradient-bg", "linear-gradient(180deg, #FF0000, #0000FF)"]]);
    const fills = parseBackgroundToFills(
      "var(--gradient-bg)",
      null,
      variables
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[0].cssVariable).toBe("--gradient-bg");
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

// ============================================================================
// extractCSSVariableName
// ============================================================================

describe("extractCSSVariableName", () => {
  describe("valid single var() references", () => {
    it("should extract simple variable name", () => {
      expect(extractCSSVariableName("var(--primary)")).toBe("--primary");
    });

    it("should extract variable with hyphens", () => {
      expect(extractCSSVariableName("var(--bg-color-primary)")).toBe("--bg-color-primary");
    });

    it("should extract variable with underscores", () => {
      expect(extractCSSVariableName("var(--text_color)")).toBe("--text_color");
    });

    it("should extract variable with numbers", () => {
      expect(extractCSSVariableName("var(--color-100)")).toBe("--color-100");
    });

    it("should extract variable with fallback value", () => {
      expect(extractCSSVariableName("var(--primary, #3b82f6)")).toBe("--primary");
    });

    it("should return null for fallback with nested parens (strict regex)", () => {
      // rgb(255, 0, 0) contains ')' which breaks the simple regex — by design
      expect(extractCSSVariableName("var(--bg, rgb(255, 0, 0))")).toBeNull();
    });

    it("should extract variable with simple hex fallback", () => {
      expect(extractCSSVariableName("var(--bg, #fff)")).toBe("--bg");
    });

    it("should handle whitespace around variable name", () => {
      expect(extractCSSVariableName("var(  --primary  )")).toBe("--primary");
    });

    it("should handle leading/trailing whitespace in value", () => {
      expect(extractCSSVariableName("  var(--primary)  ")).toBe("--primary");
    });
  });

  describe("returns null for non-variable values", () => {
    it("should return null for plain hex color", () => {
      expect(extractCSSVariableName("#3b82f6")).toBeNull();
    });

    it("should return null for rgb color", () => {
      expect(extractCSSVariableName("rgb(59, 130, 246)")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(extractCSSVariableName("")).toBeNull();
    });

    it("should return null for null-like values", () => {
      expect(extractCSSVariableName(null as unknown as string)).toBeNull();
      expect(extractCSSVariableName(undefined as unknown as string)).toBeNull();
    });

    it("should return null for 'none'", () => {
      expect(extractCSSVariableName("none")).toBeNull();
    });

    it("should return null for named color", () => {
      expect(extractCSSVariableName("red")).toBeNull();
    });
  });

  describe("rejects complex values containing var()", () => {
    it("should return null for gradient with var() inside", () => {
      expect(extractCSSVariableName("linear-gradient(var(--start), var(--end))")).toBeNull();
    });

    it("should return null for calc() with var()", () => {
      expect(extractCSSVariableName("calc(var(--spacing) * 2)")).toBeNull();
    });

    it("should return null for var() with prefix text", () => {
      expect(extractCSSVariableName("1px solid var(--border-color)")).toBeNull();
    });

    it("should return null for multiple var() references", () => {
      expect(extractCSSVariableName("var(--a) var(--b)")).toBeNull();
    });

    it("should return null for var() inside url()", () => {
      expect(extractCSSVariableName("url(var(--image))")).toBeNull();
    });
  });
});
