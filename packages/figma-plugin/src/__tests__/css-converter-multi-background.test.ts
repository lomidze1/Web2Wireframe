/**
 * Multi-layer background split in css-converter
 *
 * W-05 body background bug: web2wireframe.design's body has
 *   background:
 *     radial-gradient(circle at 20% 20%, rgba(59,130,246,0.08), transparent 28%),
 *     radial-gradient(circle at 80% 10%, rgba(36,109,255,0.08), transparent 25%),
 *     var(--bg);
 * Computed style is split as:
 *   backgroundImage = "radial-gradient(...), radial-gradient(...)"  (2 layers)
 *   backgroundColor = "#F7F8FB"                                      (the var(--bg))
 *
 * Root cause: css-converter.parseFills called parseGradientToFill on the WHOLE
 * backgroundImage string. parseGradientToFill uses greedy regex
 * /radial-gradient\((.+)\)/ which swallows from the first `radial-gradient(`
 * through the LAST `)`, corrupting multi-layer CSS into a single fill with
 * mangled stops (observed: 4 stops at positions 0%, 10%, 67%, 25%).
 *
 * Fix: split backgroundImage by commas (respecting parens/quotes) first, then
 * parse each layer into its own FigmaFill. Preserve CSS order (first layer =
 * fills[0] = top paint, which matches Figma's fills-array convention).
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
    width: 1440,
    height: 1384,
    quad: [0, 0, 1440, 0, 1440, 1384, 0, 1384],
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

describe("css-converter — multi-layer background split", () => {
  // -------------------------------------------------------------------------
  // 1. Body-like double radial + solid var(--bg) = 3 fills
  // -------------------------------------------------------------------------
  it("splits two radial-gradients into separate RADIAL fills, each with correct 2 stops", () => {
    const body = makeFrame({
      tag: "body",
      width: 1440,
      height: 1384,
      quad: [0, 0, 1440, 0, 1440, 1384, 0, 1384],
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.08), transparent 28%), radial-gradient(circle at 80% 10%, rgba(36, 109, 255, 0.08), transparent 25%)",
        backgroundColor: "rgb(247, 248, 251)",
      },
    });

    const result = convertW2WToWireframe(body as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);

    expect(fills.length).toBe(3);
    expect(fills[0].type).toBe("GRADIENT_RADIAL");
    expect(fills[0].stops?.length).toBe(2);
    expect(fills[1].type).toBe("GRADIENT_RADIAL");
    expect(fills[1].stops?.length).toBe(2);
    expect(fills[2].type).toBe("SOLID");
  });

  // -------------------------------------------------------------------------
  // 2. Double linear
  // -------------------------------------------------------------------------
  it("splits two linear-gradients into separate LINEAR fills", () => {
    const node = makeFrame({
      width: 400,
      height: 300,
      quad: [0, 0, 400, 0, 400, 300, 0, 300],
      styles: {
        display: "block",
        backgroundImage:
          "linear-gradient(0deg, rgb(255, 0, 0), rgb(255, 0, 0)), linear-gradient(0deg, rgb(0, 0, 255), rgb(0, 0, 255))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);

    expect(fills.length).toBe(2);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[1].type).toBe("GRADIENT_LINEAR");
  });

  // -------------------------------------------------------------------------
  // 3. Mixed linear + radial preserves CSS order
  // -------------------------------------------------------------------------
  it("preserves CSS layer order — first layer → fills[0] (top paint)", () => {
    const node = makeFrame({
      width: 500,
      height: 500,
      quad: [0, 0, 500, 0, 500, 500, 0, 500],
      styles: {
        display: "block",
        backgroundImage:
          "linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255)), radial-gradient(circle, rgb(0, 255, 0), rgb(255, 255, 0))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);

    expect(fills.length).toBe(2);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[1].type).toBe("GRADIENT_RADIAL");
  });

  // -------------------------------------------------------------------------
  // 4. Regression guard — single gradient unchanged
  // -------------------------------------------------------------------------
  it("keeps single-layer gradient behavior intact (regression guard)", () => {
    const node = makeFrame({
      width: 375,
      height: 600,
      quad: [0, 0, 375, 0, 375, 600, 0, 600],
      styles: {
        display: "block",
        backgroundImage:
          "linear-gradient(145deg, rgba(36, 109, 255, 0.14), rgba(255, 255, 255, 0.65))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);

    expect(fills.length).toBe(1);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[0].elementWidth).toBe(375);
    expect(fills[0].elementHeight).toBe(600);
  });

  // -------------------------------------------------------------------------
  // 5. url() layers still produce IMAGE_PLACEHOLDER alongside gradients
  // -------------------------------------------------------------------------
  it("handles url() layer alongside gradient layer", () => {
    const node = makeFrame({
      width: 600,
      height: 400,
      quad: [0, 0, 600, 0, 600, 400, 0, 400],
      styles: {
        display: "block",
        backgroundImage:
          "linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255)), url(https://example.com/bg.jpg)",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fills = getFills(result);

    expect(fills.length).toBe(2);
    expect(fills[0].type).toBe("GRADIENT_LINEAR");
    expect(fills[1].type).toBe("IMAGE_PLACEHOLDER");
    expect(fills[1].imageUrl).toBe("https://example.com/bg.jpg");
  });
});
