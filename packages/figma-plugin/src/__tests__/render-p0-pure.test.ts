/**
 * P0 render-fidelity fixes — pure-function level.
 *
 * A1: `fill.angle || 180` treated angle 0 (`to top` / `0deg`) as "unset" and
 *     rendered every top-pointing linear gradient upside-down (180° default).
 * A3: `border-radius: 50%` was read with parseFloat → 50px instead of being
 *     resolved against the element box (a 200×200 avatar got r=50, not 100).
 * A6: 3-digit (#fff) and 4-digit (#f00c) hex fell through to the light-gray
 *     fallback in colors.ts.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("figma", {
  createFrame: vi.fn(),
  mixed: Symbol("figma.mixed"),
});

import { convertFillsToPaints } from "../rendering/fills";
import { calculateLinearGradientTransform } from "../rendering/gradients";
import { hexToFigmaRGB, cssColorToFigmaRGB } from "../rendering/colors";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaFill, RenderContext, WireframeNode } from "../types";

function websiteContext(): RenderContext {
  return {
    layoutMode: "autoLayout",
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "none",
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
  } as unknown as RenderContext;
}

function linearFill(angle: number | undefined): FigmaFill {
  return {
    type: "GRADIENT_LINEAR",
    visible: true,
    opacity: 1,
    angle,
    elementWidth: 100,
    elementHeight: 100,
    stops: [
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
  } as unknown as FigmaFill;
}

describe("A1: linear-gradient angle 0 (to top)", () => {
  it("renders angle 0 with the 0° transform, not the 180° default", () => {
    const paints = convertFillsToPaints([linearFill(0)], websiteContext());
    expect(paints).toHaveLength(1);
    const paint = paints[0] as GradientPaint;
    expect(paint.type).toBe("GRADIENT_LINEAR");
    expect(paint.gradientTransform).toEqual(
      calculateLinearGradientTransform(0, 100, 100)
    );
    expect(paint.gradientTransform).not.toEqual(
      calculateLinearGradientTransform(180, 100, 100)
    );
  });

  it("still defaults a missing angle to 180 (to bottom)", () => {
    const paints = convertFillsToPaints([linearFill(undefined)], websiteContext());
    const paint = paints[0] as GradientPaint;
    expect(paint.gradientTransform).toEqual(
      calculateLinearGradientTransform(180, 100, 100)
    );
  });
});

describe("A6: short hex colors", () => {
  it("expands 3-digit hex (#fff, #f00)", () => {
    expect(hexToFigmaRGB("#fff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToFigmaRGB("#f00")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("expands 4-digit hex with alpha (#f00c)", () => {
    const parsed = cssColorToFigmaRGB("#f00c");
    expect(parsed).not.toBeNull();
    expect(parsed!.color).toEqual({ r: 1, g: 0, b: 0 });
    expect(parsed!.opacity).toBeCloseTo(0.8, 2);
  });

  it("keeps 6/8-digit behavior unchanged", () => {
    expect(hexToFigmaRGB("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
    const withAlpha = cssColorToFigmaRGB("#ff000080");
    expect(withAlpha!.opacity).toBeCloseTo(0x80 / 255, 3);
  });
});

// ---------------------------------------------------------------------------
// A3: percentage border-radius resolved against the element box
// ---------------------------------------------------------------------------

function makeW2WFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 200, height: 200,
    quad: [0, 0, 200, 0, 200, 200, 0, 200],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

describe("A3: percentage border-radius", () => {
  it("resolves border-radius: 50% on a 200×200 box to a full circle (100px)", () => {
    const tree = makeW2WFrame({
      children: [
        makeW2WFrame({
          classList: ["avatar"],
          styles: {
            display: "block",
            borderTopLeftRadius: "50%",
            borderTopRightRadius: "50%",
            borderBottomRightRadius: "50%",
            borderBottomLeftRadius: "50%",
            backgroundColor: "rgb(10, 20, 30)",
          },
        }),
      ],
    });
    const wf = convertW2WToWireframe(tree as never, {
      layoutMode: "autoLayout",
    }) as WireframeNode;
    const avatar = wf.children![0];
    expect(avatar.borderRadius).toBe(100);
  });

  it("resolves 50% against the smaller dimension on a non-square box", () => {
    const tree = makeW2WFrame({
      children: [
        makeW2WFrame({
          width: 300,
          height: 100,
          quad: [0, 0, 300, 0, 300, 100, 0, 100],
          styles: {
            display: "block",
            borderTopLeftRadius: "50%",
            borderTopRightRadius: "50%",
            borderBottomRightRadius: "50%",
            borderBottomLeftRadius: "50%",
          },
        }),
      ],
    });
    const wf = convertW2WToWireframe(tree as never, {
      layoutMode: "autoLayout",
    }) as WireframeNode;
    expect(wf.children![0].borderRadius).toBe(50);
  });

  it("keeps plain px radii untouched", () => {
    const tree = makeW2WFrame({
      children: [
        makeW2WFrame({
          styles: {
            display: "block",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
            borderBottomRightRadius: "0px",
            borderBottomLeftRadius: "0px",
          },
        }),
      ],
    });
    const wf = convertW2WToWireframe(tree as never, {
      layoutMode: "autoLayout",
    }) as WireframeNode;
    expect(wf.children![0].borderRadius).toEqual({
      topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0,
    });
  });
});
