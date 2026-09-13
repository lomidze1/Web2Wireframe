/**
 * Defect 5 (h2d parity): the gradient `at` parser only matched numeric
 * pairs, so:
 *   • keyword centers (`at top left`) silently fell back to dead-center
 *   • `at 20px 30px` divided the bare number by 100 (20px read as 20%)
 *   • the explicit two-value radius form (`radial-gradient(100px 50px at …)`)
 *     was ignored entirely
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { calculateRadialGradientTransform } from "../rendering/gradients";
import type { FigmaFill } from "../types";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 200,
    height: 300,
    quad: [0, 0, 200, 0, 200, 300, 0, 300],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function gradientFill(backgroundImage: string): FigmaFill | undefined {
  const result = convertW2WToWireframe(
    makeFrame({ styles: { display: "block", backgroundImage } }),
    undefined,
  );
  return (result.fills as FigmaFill[] | undefined)?.find((f) =>
    f.type.startsWith("GRADIENT"),
  );
}

describe("keyword centers", () => {
  it("at top left → (0, 0)", () => {
    const fill = gradientFill(
      "radial-gradient(circle at top left, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.center).toEqual({ x: 0, y: 0 });
  });

  it("at right bottom → (1, 1)", () => {
    const fill = gradientFill(
      "radial-gradient(at right bottom, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.center).toEqual({ x: 1, y: 1 });
  });

  it("at left center → (0, 0.5)", () => {
    const fill = gradientFill(
      "radial-gradient(at left center, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.center).toEqual({ x: 0, y: 0.5 });
  });

  it("single keyword at top → (0.5, 0)", () => {
    const fill = gradientFill(
      "radial-gradient(at top, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.center).toEqual({ x: 0.5, y: 0 });
  });
});

describe("length centers resolve against the element box", () => {
  it("at 20px 30px on a 200x300 box → (0.1, 0.1)", () => {
    const fill = gradientFill(
      "radial-gradient(at 20px 30px, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.center?.x).toBeCloseTo(0.1, 5);
    expect(fill?.center?.y).toBeCloseTo(0.1, 5);
  });

  it("percentages still work: at 20% 30% → (0.2, 0.3)", () => {
    const fill = gradientFill(
      "radial-gradient(at 20% 30%, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.center?.x).toBeCloseTo(0.2, 5);
    expect(fill?.center?.y).toBeCloseTo(0.3, 5);
  });

  it("conic gradients get the same center parsing: at 20px 30px", () => {
    const fill = gradientFill(
      "conic-gradient(from 90deg at 20px 30px, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.type).toBe("GRADIENT_CONIC");
    expect(fill?.center?.x).toBeCloseTo(0.1, 5);
    expect(fill?.center?.y).toBeCloseTo(0.1, 5);
  });

  it("conic keyword center: at top left", () => {
    const fill = gradientFill(
      "conic-gradient(at top left, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.center).toEqual({ x: 0, y: 0 });
  });
});

describe("explicit radius", () => {
  it("radial-gradient(100px 50px at 20% 30%, …) carries radius {100, 50}", () => {
    const fill = gradientFill(
      "radial-gradient(100px 50px at 20% 30%, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.radius).toEqual({ x: 100, y: 50 });
    expect(fill?.center?.x).toBeCloseTo(0.2, 5);
    // Stops must not be polluted by the radius prefix.
    expect(fill?.stops).toHaveLength(2);
  });

  it("single-value radius is a circle: radial-gradient(80px at center, …)", () => {
    const fill = gradientFill(
      "radial-gradient(80px at center, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(fill?.radius).toEqual({ x: 80, y: 80 });
  });

  it("calculateRadialGradientTransform uses the explicit radii over the size keyword", () => {
    const transform = calculateRadialGradientTransform({
      type: "GRADIENT_RADIAL",
      visible: true,
      opacity: 1,
      center: { x: 0.5, y: 0.5 },
      radius: { x: 100, y: 50 },
      elementWidth: 200,
      elementHeight: 100,
    } as FigmaFill);
    // scaleX = 100/200 = 0.5, scaleY = 50/100 = 0.5, centered.
    expect(transform[0][0]).toBeCloseTo(0.5, 5);
    expect(transform[1][1]).toBeCloseTo(0.5, 5);
    expect(transform[0][2]).toBeCloseTo(0.25, 5);
    expect(transform[1][2]).toBeCloseTo(0.25, 5);
  });
});
