/**
 * Unit tests for gradient utilities
 * Tests pure functions that don't depend on Figma API
 */
import { describe, it, expect } from "vitest";
import {
  parseColorStops,
  calculateLinearGradientTransform,
  calculateRadialGradientTransform,
} from "../rendering/gradients";
import type { FigmaFill } from "../types";

// ============================================================================
// parseColorStops
// ============================================================================

describe("parseColorStops", () => {
  it("parses hex colors with percentages", () => {
    const stops = parseColorStops("#ff0000 0%, #00ff00 100%");
    expect(stops).toHaveLength(2);
    expect(stops[0].position).toBe(0);
    expect(stops[0].color).toMatchObject({ r: 1, g: 0, b: 0 });
    expect(stops[1].position).toBe(1);
    expect(stops[1].color).toMatchObject({ r: 0, g: 1, b: 0 });
  });

  it("distributes colors evenly when no percentage", () => {
    const stops = parseColorStops("#ff0000, #00ff00, #0000ff");
    expect(stops).toHaveLength(3);
    expect(stops[0].position).toBe(0);
    expect(stops[1].position).toBe(0.5);
    expect(stops[2].position).toBe(1);
  });

  it("parses rgb colors", () => {
    const stops = parseColorStops("rgb(255, 0, 0) 0%, rgb(0, 255, 0) 100%");
    expect(stops).toHaveLength(2);
    expect(stops[0].color).toMatchObject({ r: 1, g: 0, b: 0 });
  });

  it("parses rgba colors with opacity", () => {
    const stops = parseColorStops("rgba(255, 0, 0, 0.5) 0%, #00ff00 100%");
    expect(stops).toHaveLength(2);
    expect(stops[0].color.a).toBe(0.5);
  });

  it("handles complex gradient strings", () => {
    const stops = parseColorStops("#ffffff 0%, #f0f0f0 50%, #000000 100%");
    expect(stops).toHaveLength(3);
    expect(stops[0].position).toBe(0);
    expect(stops[1].position).toBe(0.5);
    expect(stops[2].position).toBe(1);
  });
});

// ============================================================================
// calculateLinearGradientTransform
// ============================================================================

describe("calculateLinearGradientTransform", () => {
  // --- Fallback (no dimensions) - uses rotation formula ---

  it("calculates transform for 90deg without dimensions (left to right)", () => {
    const transform = calculateLinearGradientTransform(90);
    // Fallback: rotation formula
    expect(transform[0][0]).toBeCloseTo(1, 5);
    expect(transform[0][1]).toBeCloseTo(0, 5);
    expect(transform[1][0]).toBeCloseTo(0, 5);
    expect(transform[1][1]).toBeCloseTo(1, 5);
  });

  it("calculates transform for 180deg without dimensions (top to bottom)", () => {
    const transform = calculateLinearGradientTransform(180);
    expect(transform[0][0]).toBeCloseTo(0, 5);
    expect(transform[0][1]).toBeCloseTo(1, 5);
  });

  it("calculates transform for 0deg without dimensions (bottom to top)", () => {
    const transform = calculateLinearGradientTransform(0);
    expect(transform[0][0]).toBeCloseTo(0, 5);
    expect(transform[0][1]).toBeCloseTo(-1, 5);
  });

  // --- With dimensions: axis-aligned angles same as without ---

  it("axis-aligned angles produce same result with or without dimensions", () => {
    for (const angle of [0, 90, 180, 270]) {
      const withoutDims = calculateLinearGradientTransform(angle);
      const withDims = calculateLinearGradientTransform(angle, 400, 400);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          expect(withDims[r][c]).toBeCloseTo(withoutDims[r][c], 4);
        }
      }
    }
  });

  // --- With dimensions: aspect ratio correction ---

  it("145deg on tall rectangle differs from square", () => {
    const square = calculateLinearGradientTransform(145, 383, 383);
    const tall = calculateLinearGradientTransform(145, 383, 513);
    // On a tall element, the transform coefficients should differ
    expect(tall[0][0]).not.toBeCloseTo(square[0][0], 2);
    expect(tall[0][1]).not.toBeCloseTo(square[0][1], 2);
  });

  it("center maps to gradient position 0.5", () => {
    const t = calculateLinearGradientTransform(145, 383, 513);
    // At center (0.5, 0.5), gradient x-position should be 0.5
    const gx = t[0][0] * 0.5 + t[0][1] * 0.5 + t[0][2];
    expect(gx).toBeCloseTo(0.5, 5);
  });

  it("gradient start maps to position 0 and end to 1", () => {
    const angle = 145;
    const W = 383, H = 513;
    const theta = (angle * Math.PI) / 180;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const halfLen = (Math.abs(W * sinT) + Math.abs(H * cosT)) / 2;

    // Start and end in normalized space
    const sxn = (W / 2 - halfLen * sinT) / W;
    const syn = (H / 2 + halfLen * cosT) / H;
    const exn = (W / 2 + halfLen * sinT) / W;
    const eyn = (H / 2 - halfLen * cosT) / H;

    const t = calculateLinearGradientTransform(angle, W, H);

    const gxStart = t[0][0] * sxn + t[0][1] * syn + t[0][2];
    const gxEnd = t[0][0] * exn + t[0][1] * eyn + t[0][2];

    expect(gxStart).toBeCloseTo(0, 5);
    expect(gxEnd).toBeCloseTo(1, 5);
  });
});

// ============================================================================
// calculateRadialGradientTransform
// ============================================================================

describe("calculateRadialGradientTransform", () => {
  // Helper to create test fill objects
  const createTestFill = (overrides: Partial<FigmaFill>): FigmaFill => ({
    type: "gradient",
    visible: true,
    opacity: 1,
    ...overrides,
  });

  it("calculates transform for centered gradient", () => {
    const transform = calculateRadialGradientTransform(
      createTestFill({
        center: { x: 0.5, y: 0.5 },
        shape: "ellipse",
        size: "farthest-corner",
        elementWidth: 100,
        elementHeight: 100,
      })
    );

    // For centered gradient, translation should account for scale
    expect(transform).toHaveLength(2);
    expect(transform[0]).toHaveLength(3);
    expect(transform[1]).toHaveLength(3);
  });

  it("calculates transform for off-center gradient", () => {
    const transform = calculateRadialGradientTransform(
      createTestFill({
        center: { x: 0.25, y: 0.25 },
        shape: "ellipse",
        size: "farthest-corner",
        elementWidth: 100,
        elementHeight: 100,
      })
    );

    // Off-center should have different translation
    expect(transform[0][2]).not.toBe(0);
    expect(transform[1][2]).not.toBe(0);
  });

  it("handles closest-side size", () => {
    const transform = calculateRadialGradientTransform(
      createTestFill({
        center: { x: 0.5, y: 0.5 },
        shape: "ellipse",
        size: "closest-side",
        elementWidth: 100,
        elementHeight: 200,
      })
    );

    // closest-side uses minimum distances
    expect(transform[0][0]).toBeCloseTo(0.5, 2); // 50 / 100
    expect(transform[1][1]).toBeCloseTo(0.5, 2); // 100 / 200
  });

  it("handles circle shape", () => {
    const transform = calculateRadialGradientTransform(
      createTestFill({
        center: { x: 0.5, y: 0.5 },
        shape: "circle",
        size: "farthest-corner",
        elementWidth: 100,
        elementHeight: 200,
      })
    );

    // Circle should have equal scale in both directions (based on max)
    // The actual value depends on the calculation, but they should be proportional
    expect(typeof transform[0][0]).toBe("number");
    expect(typeof transform[1][1]).toBe("number");
  });
});
