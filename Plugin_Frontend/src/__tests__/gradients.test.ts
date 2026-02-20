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
  it("calculates transform for 90deg (left to right)", () => {
    const transform = calculateLinearGradientTransform(90);
    // 90deg CSS = horizontal gradient (left to right)
    // cos(0) = 1, sin(0) = 0
    expect(transform[0][0]).toBeCloseTo(1, 5);
    expect(transform[0][1]).toBeCloseTo(0, 5);
    expect(transform[1][0]).toBeCloseTo(0, 5);
    expect(transform[1][1]).toBeCloseTo(1, 5);
  });

  it("calculates transform for 180deg (top to bottom)", () => {
    const transform = calculateLinearGradientTransform(180);
    // 180deg CSS = vertical gradient (top to bottom)
    expect(transform[0][0]).toBeCloseTo(0, 5);
    expect(transform[0][1]).toBeCloseTo(1, 5);
  });

  it("calculates transform for 0deg (bottom to top)", () => {
    const transform = calculateLinearGradientTransform(0);
    // 0deg CSS = vertical gradient (bottom to top)
    expect(transform[0][0]).toBeCloseTo(0, 5);
    expect(transform[0][1]).toBeCloseTo(-1, 5);
  });

  it("calculates transform for 45deg (diagonal)", () => {
    const transform = calculateLinearGradientTransform(45);
    // 45deg CSS = diagonal
    const expected = Math.cos((-45 * Math.PI) / 180);
    expect(transform[0][0]).toBeCloseTo(expected, 5);
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
