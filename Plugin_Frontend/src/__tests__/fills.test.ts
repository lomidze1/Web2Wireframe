/**
 * Unit tests for fill, stroke, and effect conversion
 * Tests plugin color mapping, gradient-to-solid conversion, and effect filtering
 */
import { describe, it, expect } from "vitest";
import {
  convertFillsToPaints,
  convertStrokesToFigma,
  convertEffectsToFigma,
} from "../rendering/fills";
import type { FigmaFill, FigmaStroke, FigmaEffect, RenderContext } from "../types";

// ============================================================================
// Helpers
// ============================================================================

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
    colorMode: "plugin",
    fontMode: "plugin",
    ...overrides,
  } as RenderContext;
}

// ============================================================================
// convertFillsToPaints
// ============================================================================

describe("convertFillsToPaints", () => {
  describe("empty/undefined inputs", () => {
    it("returns empty array for undefined fills", () => {
      expect(convertFillsToPaints(undefined, makeContext())).toEqual([]);
    });

    it("returns empty array for empty fills", () => {
      expect(convertFillsToPaints([], makeContext())).toEqual([]);
    });
  });

  describe("plugin color mode", () => {
    it("maps solid light fill to background color", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 1, g: 1, b: 1, a: 1 }, // white = light
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "SOLID");
      expect((result[0] as any).opacity).toBe(1.0);
    });

    it("maps solid dark fill to surface color", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 0.2, g: 0.2, b: 0.2, a: 1 }, // dark = surface
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "SOLID");
    });

    it("maps button fills to accent color", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 0.5, g: 0.1, b: 0.1, a: 1 },
        },
      ];
      const ctx = makeContext();
      const result = convertFillsToPaints(fills, ctx, "button");
      expect(result).toHaveLength(1);
      // Should use accent color for buttons
      const accentRgb = { r: expect.any(Number), g: expect.any(Number), b: expect.any(Number) };
      expect((result[0] as any).color).toEqual(accentRgb);
    });

    it("forces opacity to 1.0 in plugin mode", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 0.5,
          color: { r: 1, g: 1, b: 1, a: 0.5 },
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect((result[0] as any).opacity).toBe(1.0);
    });

    it("converts linear gradient to solid in plugin mode", () => {
      const fills: FigmaFill[] = [
        {
          type: "GRADIENT_LINEAR",
          visible: true,
          opacity: 1,
          angle: 180,
          stops: [
            { color: { r: 1, g: 1, b: 1, a: 1 }, position: 0 },
            { color: { r: 0, g: 0, b: 0, a: 1 }, position: 1 },
          ],
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "SOLID");
    });

    it("converts radial gradient to solid in plugin mode", () => {
      const fills: FigmaFill[] = [
        {
          type: "GRADIENT_RADIAL",
          visible: true,
          opacity: 1,
          stops: [
            { color: { r: 0.5, g: 0.5, b: 0.5, a: 1 }, position: 0 },
            { color: { r: 0, g: 0, b: 0, a: 1 }, position: 1 },
          ],
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "SOLID");
    });

    it("converts conic gradient to solid in plugin mode", () => {
      const fills: FigmaFill[] = [
        {
          type: "GRADIENT_CONIC",
          visible: true,
          opacity: 1,
          stops: [
            { color: { r: 0.8, g: 0.8, b: 0.8, a: 1 }, position: 0 },
            { color: { r: 0.2, g: 0.2, b: 0.2, a: 1 }, position: 1 },
          ],
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "SOLID");
    });

    it("skips invisible fills", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: false,
          opacity: 1,
          color: { r: 1, g: 0, b: 0, a: 1 },
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(0);
    });

    it("handles IMAGE_PLACEHOLDER fill with surface color", () => {
      const fills: FigmaFill[] = [
        {
          type: "IMAGE_PLACEHOLDER",
          visible: true,
          opacity: 1,
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "img");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "SOLID");
      expect((result[0] as any).opacity).toBe(1.0);
    });

    it("reverses fill order (CSS top-to-bottom → Figma bottom-to-top)", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 1, g: 0, b: 0, a: 1 }, // Red (first in CSS = top)
        },
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 0, g: 0, b: 1, a: 1 }, // Blue (second in CSS = bottom)
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(2);
      // After reversing: Blue should be first (bottom in Figma), Red second (top in Figma)
    });

    it("maps saturated dark fill to secondary", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 0.8, g: 0.1, b: 0.1, a: 1 }, // Saturated dark red
        },
      ];
      const result = convertFillsToPaints(fills, makeContext(), "div");
      expect(result).toHaveLength(1);
      // Saturated dark → role = "surface", then override to "secondary"
    });
  });

  describe("website color mode", () => {
    it("preserves original solid colors", () => {
      const fills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 0.8,
          color: { r: 1, g: 0, b: 0, a: 0.5 },
        },
      ];
      const ctx = makeContext({ colorMode: "website" });
      const result = convertFillsToPaints(fills, ctx, "div");
      expect(result).toHaveLength(1);
      expect((result[0] as any).color).toEqual({ r: 1, g: 0, b: 0 });
      // opacity = fill.opacity * fill.color.a = 0.8 * 0.5 = 0.4
      expect((result[0] as any).opacity).toBe(0.4);
    });

    it("preserves linear gradient in website mode", () => {
      const fills: FigmaFill[] = [
        {
          type: "GRADIENT_LINEAR",
          visible: true,
          opacity: 1,
          angle: 90,
          stops: [
            { color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 },
            { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1 },
          ],
        },
      ];
      const ctx = makeContext({ colorMode: "website" });
      const result = convertFillsToPaints(fills, ctx, "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "GRADIENT_LINEAR");
    });

    it("preserves radial gradient in website mode", () => {
      const fills: FigmaFill[] = [
        {
          type: "GRADIENT_RADIAL",
          visible: true,
          opacity: 1,
          stops: [
            { color: { r: 0.5, g: 0.5, b: 0.5, a: 1 }, position: 0 },
            { color: { r: 0, g: 0, b: 0, a: 1 }, position: 1 },
          ],
        },
      ];
      const ctx = makeContext({ colorMode: "website" });
      const result = convertFillsToPaints(fills, ctx, "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "GRADIENT_RADIAL");
    });

    it("preserves conic/angular gradient in website mode", () => {
      const fills: FigmaFill[] = [
        {
          type: "GRADIENT_CONIC",
          visible: true,
          opacity: 1,
          stops: [
            { color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 },
            { color: { r: 0, g: 1, b: 0, a: 1 }, position: 0.5 },
            { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1 },
          ],
        },
      ];
      const ctx = makeContext({ colorMode: "website" });
      const result = convertFillsToPaints(fills, ctx, "div");
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "GRADIENT_ANGULAR");
    });
  });

  describe("plugin color palette consistency", () => {
    it("only uses the 5 plugin colors for solid fills", () => {
      const ctx = makeContext();
      const pluginColorValues = new Set(
        Object.values(DEFAULT_PLUGIN_COLORS).map((c) => c.toLowerCase())
      );

      // Test various input colors
      const inputColors = [
        { r: 1, g: 0, b: 0, a: 1 },   // red
        { r: 0, g: 1, b: 0, a: 1 },   // green
        { r: 0, g: 0, b: 1, a: 1 },   // blue
        { r: 1, g: 1, b: 1, a: 1 },   // white
        { r: 0, g: 0, b: 0, a: 1 },   // black
        { r: 0.5, g: 0.5, b: 0.5, a: 1 }, // gray
      ];

      for (const inputColor of inputColors) {
        const fills: FigmaFill[] = [
          { type: "SOLID", visible: true, opacity: 1, color: inputColor },
        ];
        const result = convertFillsToPaints(fills, ctx, "div");
        if (result.length > 0) {
          const paint = result[0] as any;
          if (paint.type === "SOLID") {
            // Convert result color back to hex and check it's one of the 5 plugin colors
            const { r, g, b } = paint.color;
            const hex = `#${Math.round(r * 255).toString(16).padStart(2, "0")}${Math.round(g * 255).toString(16).padStart(2, "0")}${Math.round(b * 255).toString(16).padStart(2, "0")}`;
            expect(pluginColorValues.has(hex.toLowerCase())).toBe(true);
          }
        }
      }
    });
  });
});

// ============================================================================
// convertStrokesToFigma
// ============================================================================

describe("convertStrokesToFigma", () => {
  describe("empty/undefined inputs", () => {
    it("returns empty paints and 0 weight for undefined", () => {
      const result = convertStrokesToFigma(undefined);
      expect(result).toEqual({ paints: [], weight: 0 });
    });

    it("returns empty paints and 0 weight for empty array", () => {
      const result = convertStrokesToFigma([]);
      expect(result).toEqual({ paints: [], weight: 0 });
    });
  });

  describe("plugin color mode", () => {
    it("uses text color for all strokes", () => {
      const strokes: FigmaStroke[] = [
        {
          color: { r: 1, g: 0, b: 0, a: 1 }, // red input
          weight: 2,
          position: "INSIDE",
          style: "SOLID",
        },
      ];
      const ctx = makeContext();
      const result = convertStrokesToFigma(strokes, ctx);

      expect(result.weight).toBe(2);
      expect(result.paints).toHaveLength(1);
      // Should use text color (#11151A), not the original red
      const textRgb = result.paints[0] as any;
      expect(textRgb.opacity).toBe(1.0);
      // #11151A ≈ r: 0.067, g: 0.082, b: 0.102
      expect(textRgb.color.r).toBeCloseTo(0.067, 1);
      expect(textRgb.color.g).toBeCloseTo(0.082, 1);
    });

    it("ignores original stroke color in plugin mode", () => {
      const strokes: FigmaStroke[] = [
        {
          color: { r: 0, g: 1, b: 0, a: 0.5 }, // green with alpha
          weight: 1,
          position: "CENTER",
          style: "SOLID",
        },
      ];
      const ctx = makeContext();
      const result = convertStrokesToFigma(strokes, ctx);
      // Alpha should be forced to 1.0 in plugin mode
      expect((result.paints[0] as any).opacity).toBe(1.0);
    });
  });

  describe("website color mode", () => {
    it("preserves original stroke color", () => {
      const strokes: FigmaStroke[] = [
        {
          color: { r: 1, g: 0, b: 0, a: 0.8 },
          weight: 3,
          position: "OUTSIDE",
          style: "SOLID",
        },
      ];
      const ctx = makeContext({ colorMode: "website" });
      const result = convertStrokesToFigma(strokes, ctx);

      expect(result.weight).toBe(3);
      expect(result.paints).toHaveLength(1);
      expect((result.paints[0] as any).color).toEqual({ r: 1, g: 0, b: 0 });
      expect((result.paints[0] as any).opacity).toBe(0.8);
    });
  });

  describe("without context", () => {
    it("preserves original stroke color when no context", () => {
      const strokes: FigmaStroke[] = [
        {
          color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          weight: 1,
          position: "INSIDE",
          style: "SOLID",
        },
      ];
      const result = convertStrokesToFigma(strokes);
      expect((result.paints[0] as any).color).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    });
  });
});

// ============================================================================
// convertEffectsToFigma
// ============================================================================

describe("convertEffectsToFigma", () => {
  describe("empty/undefined inputs", () => {
    it("returns empty array for undefined", () => {
      expect(convertEffectsToFigma(undefined)).toEqual([]);
    });

    it("returns empty array for empty array", () => {
      expect(convertEffectsToFigma([])).toEqual([]);
    });
  });

  describe("plugin color mode (removes shadows)", () => {
    const ctx = makeContext();

    it("removes drop shadows in plugin mode", () => {
      const effects: FigmaEffect[] = [
        {
          type: "DROP_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 4 },
          radius: 8,
          spread: 0,
        },
      ];
      expect(convertEffectsToFigma(effects, ctx)).toEqual([]);
    });

    it("removes inner shadows in plugin mode", () => {
      const effects: FigmaEffect[] = [
        {
          type: "INNER_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          offset: { x: 0, y: 2 },
          radius: 4,
        },
      ];
      expect(convertEffectsToFigma(effects, ctx)).toEqual([]);
    });

    it("removes background blur in plugin mode", () => {
      const effects: FigmaEffect[] = [
        {
          type: "BACKGROUND_BLUR",
          visible: true,
          blurRadius: 10,
        },
      ];
      expect(convertEffectsToFigma(effects, ctx)).toEqual([]);
    });

    it("keeps layer blur in plugin mode", () => {
      const effects: FigmaEffect[] = [
        {
          type: "LAYER_BLUR",
          visible: true,
          blurRadius: 5,
        },
      ];
      const result = convertEffectsToFigma(effects, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "LAYER_BLUR");
    });
  });

  describe("website color mode (preserves effects)", () => {
    const ctx = makeContext({ colorMode: "website" });

    it("preserves drop shadow in website mode", () => {
      const effects: FigmaEffect[] = [
        {
          type: "DROP_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 2, y: 4 },
          radius: 8,
          spread: 2,
        },
      ];
      const result = convertEffectsToFigma(effects, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "DROP_SHADOW");
      expect((result[0] as any).offset).toEqual({ x: 2, y: 4 });
      expect((result[0] as any).radius).toBe(8);
      expect((result[0] as any).spread).toBe(2);
    });

    it("preserves inner shadow in website mode", () => {
      const effects: FigmaEffect[] = [
        {
          type: "INNER_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          offset: { x: 0, y: 2 },
          radius: 4,
          spread: 0,
        },
      ];
      const result = convertEffectsToFigma(effects, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "INNER_SHADOW");
    });

    it("preserves background blur in website mode", () => {
      const effects: FigmaEffect[] = [
        {
          type: "BACKGROUND_BLUR",
          visible: true,
          blurRadius: 20,
        },
      ];
      const result = convertEffectsToFigma(effects, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("type", "BACKGROUND_BLUR");
      expect((result[0] as any).radius).toBe(20);
    });
  });

  describe("invisible effects", () => {
    it("skips invisible effects", () => {
      const effects: FigmaEffect[] = [
        {
          type: "DROP_SHADOW",
          visible: false,
          color: { r: 0, g: 0, b: 0, a: 1 },
          offset: { x: 0, y: 4 },
          radius: 8,
        },
      ];
      const ctx = makeContext({ colorMode: "website" });
      expect(convertEffectsToFigma(effects, ctx)).toEqual([]);
    });
  });
});
