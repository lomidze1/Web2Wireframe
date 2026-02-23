/**
 * Unit tests for style linking logic
 * Tests linkFillStyleIfAvailable, linkStrokeStyleIfAvailable, and paint key helpers
 *
 * Key behaviors tested:
 * - Only links when variableMode === "styles"
 * - Semi-transparent fills use compound keys (#hex@NN) for matching
 * - Gradient fills link via sourceFills parameter
 * - Opaque fills still match simple hex keys
 * - Does not link when no matching style exists
 * - paintKeyFromFigmaFill / paintKeyFromPaint produce consistent keys
 */
import { describe, it, expect } from "vitest";
import {
  linkFillStyleIfAvailable,
  linkStrokeStyleIfAvailable,
  paintKeyFromFigmaFill,
  paintKeyFromPaint,
} from "../rendering/styles";
import type { RenderContext, FigmaFill } from "../types";

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
    variableMode: "styles",
    layoutMode: "absolute",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    ...overrides,
  } as RenderContext;
}

/**
 * Create a mock FrameNode with fills and tracking for fillStyleId assignment
 */
function makeMockFrame(overrides?: {
  fills?: any[];
  strokes?: any[];
}): any {
  return {
    fills: overrides?.fills || [],
    strokes: overrides?.strokes || [],
    fillStyleId: "",
    strokeStyleId: "",
  };
}

/** Create a mock PaintStyle */
function makeMockStyle(id: string): any {
  return { id, name: `Style-${id}` };
}

// ============================================================================
// paintKeyFromFigmaFill
// ============================================================================

describe("paintKeyFromFigmaFill", () => {
  it("returns hex key for opaque solid fill", () => {
    const fill: FigmaFill = {
      type: "SOLID",
      visible: true,
      opacity: 1,
      color: { r: 1, g: 0, b: 0, a: 1 },
    };
    expect(paintKeyFromFigmaFill(fill)).toBe("#ff0000");
  });

  it("returns compound key for semi-transparent solid fill", () => {
    const fill: FigmaFill = {
      type: "SOLID",
      visible: true,
      opacity: 0.12,
      color: { r: 0.231, g: 0.51, b: 0.965, a: 1 },
    };
    // opacity=0.12, alpha=1 → effective=0.12 → 12%
    expect(paintKeyFromFigmaFill(fill)).toBe("#3b82f6@12");
  });

  it("includes color alpha in effective opacity", () => {
    const fill: FigmaFill = {
      type: "SOLID",
      visible: true,
      opacity: 0.5,
      color: { r: 1, g: 1, b: 1, a: 0.7 },
    };
    // effective = 0.5 * 0.7 = 0.35 → 35%
    expect(paintKeyFromFigmaFill(fill)).toBe("#ffffff@35");
  });

  it("returns hex key when effective opacity >= 0.99", () => {
    const fill: FigmaFill = {
      type: "SOLID",
      visible: true,
      opacity: 1,
      color: { r: 0, g: 0, b: 0, a: 0.995 },
    };
    // effective = 1 * 0.995 ≈ 1.00 → rounds to 100 which is >= 99
    expect(paintKeyFromFigmaFill(fill)).toBe("#000000");
  });

  it("returns empty for invisible fill", () => {
    const fill: FigmaFill = {
      type: "SOLID",
      visible: false,
      opacity: 1,
      color: { r: 1, g: 0, b: 0, a: 1 },
    };
    expect(paintKeyFromFigmaFill(fill)).toBe("");
  });

  it("returns gradient key for linear gradient", () => {
    const fill: FigmaFill = {
      type: "GRADIENT_LINEAR",
      visible: true,
      opacity: 1,
      angle: 180,
      stops: [
        { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
        { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
      ],
    };
    const key = paintKeyFromFigmaFill(fill);
    expect(key).toContain("GRADIENT_LINEAR");
    expect(key).toContain("180");
    expect(key).toContain("0,0,0,100@0");
    expect(key).toContain("255,255,255,100@1000");
  });

  it("returns different keys for same gradient at different angles", () => {
    const fill1: FigmaFill = {
      type: "GRADIENT_LINEAR",
      visible: true,
      opacity: 1,
      angle: 90,
      stops: [
        { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
        { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
      ],
    };
    const fill2: FigmaFill = {
      type: "GRADIENT_LINEAR",
      visible: true,
      opacity: 1,
      angle: 180,
      stops: [
        { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
        { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
      ],
    };
    expect(paintKeyFromFigmaFill(fill1)).not.toBe(paintKeyFromFigmaFill(fill2));
  });

  it("returns gradient key for radial gradient", () => {
    const fill: FigmaFill = {
      type: "GRADIENT_RADIAL",
      visible: true,
      opacity: 1,
      stops: [
        { color: { r: 0.231, g: 0.51, b: 0.965, a: 1 }, position: 0 },
        { color: { r: 0, g: 0, b: 0, a: 0 }, position: 1 },
      ],
    };
    const key = paintKeyFromFigmaFill(fill);
    expect(key).toContain("GRADIENT_RADIAL");
  });

  it("returns empty for IMAGE_PLACEHOLDER (skipped by convention)", () => {
    const fill: FigmaFill = {
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
    };
    expect(paintKeyFromFigmaFill(fill)).toBe("");
  });
});

// ============================================================================
// paintKeyFromPaint
// ============================================================================

describe("paintKeyFromPaint", () => {
  it("returns hex key for opaque solid paint", () => {
    const paint = { type: "SOLID" as const, color: { r: 1, g: 0, b: 0 }, opacity: 1 };
    expect(paintKeyFromPaint(paint)).toBe("#ff0000");
  });

  it("returns compound key for semi-transparent paint", () => {
    const paint = { type: "SOLID" as const, color: { r: 1, g: 0, b: 0 }, opacity: 0.5 };
    expect(paintKeyFromPaint(paint)).toBe("#ff0000@50");
  });

  it("treats undefined opacity as 1.0", () => {
    const paint = { type: "SOLID" as const, color: { r: 1, g: 0, b: 0 } };
    expect(paintKeyFromPaint(paint as any)).toBe("#ff0000");
  });

  it("returns empty for gradient paint (needs sourceFills)", () => {
    const paint = {
      type: "GRADIENT_LINEAR" as const,
      gradientStops: [],
      gradientTransform: [[1, 0, 0], [0, 1, 0]] as any,
    };
    expect(paintKeyFromPaint(paint as any)).toBe("");
  });

  it("produces consistent key with paintKeyFromFigmaFill for opaque solid", () => {
    const figmaFill: FigmaFill = {
      type: "SOLID",
      visible: true,
      opacity: 1,
      color: { r: 0.898, g: 0.906, b: 0.922, a: 1 },
    };
    const paint = {
      type: "SOLID" as const,
      color: { r: 0.898, g: 0.906, b: 0.922 },
      opacity: 1,
    };
    expect(paintKeyFromFigmaFill(figmaFill)).toBe(paintKeyFromPaint(paint));
  });

  it("produces consistent key with paintKeyFromFigmaFill for semi-transparent", () => {
    const figmaFill: FigmaFill = {
      type: "SOLID",
      visible: true,
      opacity: 0.35,
      color: { r: 1, g: 1, b: 1, a: 1 },
    };
    // convertStrokesToFigma produces: opacity = stroke.color.a = 0.35
    // But for fills: opacity = fill.opacity * fill.color.a = 0.35 * 1 = 0.35
    const paint = {
      type: "SOLID" as const,
      color: { r: 1, g: 1, b: 1 },
      opacity: 0.35,
    };
    expect(paintKeyFromFigmaFill(figmaFill)).toBe(paintKeyFromPaint(paint));
  });
});

// ============================================================================
// linkFillStyleIfAvailable
// ============================================================================

describe("linkFillStyleIfAvailable", () => {
  describe("skips linking when conditions not met", () => {
    it("skips when variableMode is not 'styles'", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      });
      const ctx = makeContext({ variableMode: "direct" });
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("");
    });

    it("skips when fills is empty", () => {
      const frame = makeMockFrame({ fills: [] });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("");
    });

    it("skips when fill type is not SOLID and no sourceFills", () => {
      const frame = makeMockFrame({
        fills: [
          {
            type: "GRADIENT_LINEAR",
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
          },
        ],
      });
      const ctx = makeContext();

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("");
    });
  });

  describe("semi-transparent fill handling (compound keys)", () => {
    it("does NOT link semi-transparent fill to opaque-only map (no compound key)", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.5 }],
      });
      const ctx = makeContext();
      // Only opaque key in map — semi-transparent fill uses #ff0000@50, no match
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("");
    });

    it("links semi-transparent fill when compound key exists in map", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.12 }],
      });
      const ctx = makeContext();
      // Compound key matches the fill's effective opacity
      ctx.colorStyleMap.set("#ff0000@12", makeMockStyle("red-12-style"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("red-12-style");
    });

    it("links 8% opacity fill to compound key", () => {
      const frame = makeMockFrame({
        fills: [
          { type: "SOLID", color: { r: 0.047, g: 0.051, b: 0.071 }, opacity: 0.08 },
        ],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#0c0d12@8", makeMockStyle("btn-bg-style"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("btn-bg-style");
    });

    it("links 35% opacity fill to compound key", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.35 }],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ffffff@35", makeMockStyle("white-35-style"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("white-35-style");
    });

    it("skips linking for opacity 0.98 (just below threshold) with only opaque key", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.98 }],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("");
    });
  });

  describe("opaque fill linking (backward compatible)", () => {
    it("links fill with opacity 1.0 (fully opaque)", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("style-1");
    });

    it("links fill with opacity undefined (defaults to opaque in Figma)", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("style-1");
    });

    it("links fill with opacity 0.99 (at threshold)", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.99 }],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("style-1");
    });

    it("does not link when fill color has no matching style", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#0000ff", makeMockStyle("blue-style"));

      linkFillStyleIfAvailable(frame, ctx);
      expect(frame.fillStyleId).toBe("");
    });
  });

  describe("sourceFills-based linking (gradients + semi-transparent)", () => {
    it("links gradient fill via sourceFills parameter", () => {
      // Frame has a gradient fill (can't derive key from Paint)
      const frame = makeMockFrame({
        fills: [
          {
            type: "GRADIENT_LINEAR",
            gradientStops: [
              { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [0, -1, 1],
              [1, 0, 0],
            ],
          },
        ],
      });

      // Source fills from the wireframe tree
      const sourceFills: FigmaFill[] = [
        {
          type: "GRADIENT_LINEAR",
          visible: true,
          opacity: 1,
          angle: 180,
          stops: [
            { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
            { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
          ],
        },
      ];

      const ctx = makeContext();
      // Key derived from paintKeyFromFigmaFill
      const gradientKey = paintKeyFromFigmaFill(sourceFills[0]);
      ctx.colorStyleMap.set(gradientKey, makeMockStyle("gradient-style"));

      linkFillStyleIfAvailable(frame, ctx, sourceFills);
      expect(frame.fillStyleId).toBe("gradient-style");
    });

    it("links semi-transparent fill via sourceFills", () => {
      const frame = makeMockFrame({
        fills: [
          { type: "SOLID", color: { r: 0.231, g: 0.51, b: 0.965 }, opacity: 0.25 },
        ],
      });
      const sourceFills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 0.25,
          color: { r: 0.231, g: 0.51, b: 0.965, a: 1 },
        },
      ];
      const ctx = makeContext();
      ctx.colorStyleMap.set("#3b82f6@25", makeMockStyle("accent-25-style"));

      linkFillStyleIfAvailable(frame, ctx, sourceFills);
      expect(frame.fillStyleId).toBe("accent-25-style");
    });

    it("sourceFills takes priority over Paint fallback", () => {
      const frame = makeMockFrame({
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      });
      const sourceFills: FigmaFill[] = [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: 1, g: 0, b: 0, a: 1 },
        },
      ];
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("source-style"));

      linkFillStyleIfAvailable(frame, ctx, sourceFills);
      expect(frame.fillStyleId).toBe("source-style");
    });
  });
});

// ============================================================================
// linkStrokeStyleIfAvailable
// ============================================================================

describe("linkStrokeStyleIfAvailable", () => {
  describe("skips linking when conditions not met", () => {
    it("skips when variableMode is not 'styles'", () => {
      const frame = makeMockFrame({
        strokes: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      });
      const ctx = makeContext({ variableMode: "direct" });
      ctx.colorStyleMap.set("#ff0000", makeMockStyle("style-1"));

      linkStrokeStyleIfAvailable(frame, ctx);
      expect(frame.strokeStyleId).toBe("");
    });

    it("skips when strokes is empty", () => {
      const frame = makeMockFrame({ strokes: [] });
      const ctx = makeContext();

      linkStrokeStyleIfAvailable(frame, ctx);
      expect(frame.strokeStyleId).toBe("");
    });
  });

  describe("semi-transparent stroke handling (compound keys)", () => {
    it("does NOT link semi-transparent stroke to opaque-only key", () => {
      const frame = makeMockFrame({
        strokes: [
          { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.35 },
        ],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ffffff", makeMockStyle("white-style"));

      linkStrokeStyleIfAvailable(frame, ctx);
      expect(frame.strokeStyleId).toBe("");
    });

    it("links semi-transparent stroke when compound key exists", () => {
      const frame = makeMockFrame({
        strokes: [
          { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.35 },
        ],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#ffffff@35", makeMockStyle("white-35-style"));

      linkStrokeStyleIfAvailable(frame, ctx);
      expect(frame.strokeStyleId).toBe("white-35-style");
    });

    it("links 25% opacity stroke to compound key", () => {
      const frame = makeMockFrame({
        strokes: [
          { type: "SOLID", color: { r: 0.231, g: 0.51, b: 0.965 }, opacity: 0.25 },
        ],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#3b82f6@25", makeMockStyle("accent-25-stroke"));

      linkStrokeStyleIfAvailable(frame, ctx);
      expect(frame.strokeStyleId).toBe("accent-25-stroke");
    });

    it("links stroke with opacity 1.0 (solid border)", () => {
      const frame = makeMockFrame({
        strokes: [
          { type: "SOLID", color: { r: 0.898, g: 0.906, b: 0.922 }, opacity: 1 },
        ],
      });
      const ctx = makeContext();
      ctx.colorStyleMap.set("#e5e7eb", makeMockStyle("border-style"));

      linkStrokeStyleIfAvailable(frame, ctx);
      expect(frame.strokeStyleId).toBe("border-style");
    });
  });
});
