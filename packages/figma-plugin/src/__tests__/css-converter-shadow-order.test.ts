/**
 * Defect 6 (h2d parity, `v8` app.js:46361): CSS paints the FIRST box-shadow
 * on top; Figma paints the LAST effect in the array on top. Pushing shadows
 * in source order therefore inverted the stacking of overlapping shadows.
 * Also: no-op shadows (zero metrics, alpha 0) wasted Figma's 8-effect limit.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaEffect } from "../types";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    quad: [0, 0, 200, 0, 200, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function effectsFor(boxShadow: string): FigmaEffect[] {
  const result = convertW2WToWireframe(
    makeFrame({ styles: { display: "block", boxShadow } }),
    undefined,
  );
  return (result.effects as FigmaEffect[] | undefined) ?? [];
}

describe("shadow stacking order", () => {
  it("the FIRST CSS shadow ends up LAST in the effects array (painted on top)", () => {
    const effects = effectsFor(
      "rgba(0, 0, 0, 0.5) 0px 1px 2px 0px, rgba(0, 0, 255, 0.5) 0px 4px 8px 0px",
    );
    expect(effects).toHaveLength(2);
    // Figma paints array-last on top; CSS paints source-first on top.
    expect(effects[0].radius).toBe(8); // second CSS shadow → bottom
    expect(effects[1].radius).toBe(2); // first CSS shadow → top
  });

  it("three shadows fully reverse", () => {
    const effects = effectsFor(
      "rgb(255, 0, 0) 0px 1px 0px 0px, rgb(0, 255, 0) 0px 2px 0px 0px, rgb(0, 0, 255) 0px 3px 0px 0px",
    );
    expect(effects.map((e) => e.offset!.y)).toEqual([3, 2, 1]);
  });
});

describe("no-op shadows are skipped", () => {
  it("0 0 0 0 with no spread adds nothing", () => {
    expect(effectsFor("rgba(0, 0, 0, 0.5) 0px 0px 0px 0px")).toHaveLength(0);
  });

  it("negative spread with zero offset/blur adds nothing", () => {
    expect(effectsFor("rgb(0, 0, 0) 0px 0px 0px -2px")).toHaveLength(0);
  });

  it("alpha-0 shadows add nothing", () => {
    expect(effectsFor("rgba(0, 0, 0, 0) 0px 4px 8px 0px")).toHaveLength(0);
  });

  it("a spread-only ring (0 0 0 3px) IS kept", () => {
    const effects = effectsFor("rgb(255, 0, 0) 0px 0px 0px 3px");
    expect(effects).toHaveLength(1);
    expect(effects[0].spread).toBe(3);
  });

  it("inset shadows with zero metrics are kept (h2d's rule targets non-inset only)", () => {
    const effects = effectsFor("rgba(0, 0, 0, 0.3) 0px 0px 0px 0px inset");
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe("INNER_SHADOW");
  });
});
