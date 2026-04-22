/**
 * css-converter gradient dimension propagation
 *
 * Bug (W-05 Pro card): web2wireframe.design pricing page's Pro card used
 *   background: linear-gradient(145deg, rgba(36,109,255,.14), var(--glass-bg))
 * on a 375x600 box. Figma rendered it with a pure-rotation gradient transform
 * (no aspect-ratio compensation), making the handle far shorter than the CSS
 * spec requires — the color transition compressed into a smaller distance and
 * the card appeared more saturated/darker than the real site.
 *
 * Root cause: css-converter's parseGradientToFill / parseLinearGradient /
 * parseRadialGradient dropped the element dimensions passed into parseFills.
 * Downstream, fills.ts's calculateLinearGradientTransform saw undefined dims
 * and fell back to pure rotation. Radial had an equivalent bug — a hardcoded
 * 100x100 fallback in calculateRadialGradientTransform.
 *
 * Fix: plumb width/height through all three functions and populate
 * elementWidth/elementHeight on returned FigmaFill objects.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaFill } from "../types";

type Tree = Record<string, unknown>;

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    quad: [0, 0, 100, 0, 100, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function getFills(result: Tree): FigmaFill[] {
  const fills = result.fills as FigmaFill[] | undefined;
  return fills ?? [];
}

describe("css-converter — gradient element dimensions propagation", () => {
  // -------------------------------------------------------------------------
  // 1. Linear gradient — Pro card (375x600)
  // -------------------------------------------------------------------------
  it("linear-gradient fill carries elementWidth/elementHeight matching the node box", () => {
    const proCard = makeFrame({
      tag: "div",
      classList: ["_card_wflxa_31", "_highlight_wflxa_43"],
      width: 375,
      height: 600,
      quad: [0, 0, 375, 0, 375, 600, 0, 600],
      styles: {
        display: "block",
        backgroundImage:
          "linear-gradient(145deg, rgba(36, 109, 255, 0.14), rgba(255, 255, 255, 0.65))",
      },
    });

    const result = convertW2WToWireframe(proCard as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);
    const gradientFill = fills.find((f) => f.type === "GRADIENT_LINEAR");

    expect(gradientFill).toBeDefined();
    expect(gradientFill!.elementWidth).toBe(375);
    expect(gradientFill!.elementHeight).toBe(600);
  });

  // -------------------------------------------------------------------------
  // 2. Radial gradient — full-page body background (1440x1384)
  // -------------------------------------------------------------------------
  it("radial-gradient fill carries elementWidth/elementHeight matching the node box", () => {
    const body = makeFrame({
      tag: "div",
      classList: ["body-bg"],
      width: 1440,
      height: 1384,
      quad: [0, 0, 1440, 0, 1440, 1384, 0, 1384],
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.08), rgba(255, 255, 255, 0))",
      },
    });

    const result = convertW2WToWireframe(body as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);
    const gradientFill = fills.find((f) => f.type === "GRADIENT_RADIAL");

    expect(gradientFill).toBeDefined();
    expect(gradientFill!.elementWidth).toBe(1440);
    expect(gradientFill!.elementHeight).toBe(1384);
  });

  // -------------------------------------------------------------------------
  // 3. Preserves stops/angle (sanity — no regression on existing behavior)
  // -------------------------------------------------------------------------
  it("linear-gradient preserves angle and stops while adding dims", () => {
    const node = makeFrame({
      width: 200,
      height: 300,
      quad: [0, 0, 200, 0, 200, 300, 0, 300],
      styles: {
        display: "block",
        backgroundImage:
          "linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);
    const g = fills.find((f) => f.type === "GRADIENT_LINEAR");

    expect(g).toBeDefined();
    expect(g!.angle).toBe(90);
    expect(g!.stops).toBeDefined();
    expect(g!.stops!.length).toBeGreaterThanOrEqual(2);
    expect(g!.elementWidth).toBe(200);
    expect(g!.elementHeight).toBe(300);
  });

  // -------------------------------------------------------------------------
  // 4. Edge case — dims should not be lost for non-square small boxes
  // -------------------------------------------------------------------------
  it("linear-gradient on narrow box keeps true dims (not falling back to zero/undefined)", () => {
    const node = makeFrame({
      width: 50,
      height: 800,
      quad: [0, 0, 50, 0, 50, 800, 0, 800],
      styles: {
        display: "block",
        backgroundImage:
          "linear-gradient(180deg, rgb(0, 0, 0), rgb(255, 255, 255))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);
    const g = fills.find((f) => f.type === "GRADIENT_LINEAR");

    expect(g).toBeDefined();
    expect(g!.elementWidth).toBe(50);
    expect(g!.elementHeight).toBe(800);
    // Guard against silent 100x100 fallback (the old radial bug)
    expect(g!.elementWidth).not.toBe(100);
    expect(g!.elementHeight).not.toBe(100);
  });
});
