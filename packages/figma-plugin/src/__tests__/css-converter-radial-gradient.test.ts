/**
 * Radial gradient center/shape/size + transparent adjacent-color inference.
 *
 * W-05 body-background comparison vs h2d revealed that after the multi-layer
 * split fix, radial gradients still rendered wrong:
 *   • centers were all (0.5, 0.5) instead of CSS "at X% Y%"
 *   • transparent stops used rgba(0,0,0,0) → Figma interpolates RGB toward
 *     black while alpha fades → muddy/dark mid-gradient (h2d uses adjacent
 *     stop's RGB with alpha 0 for clean fade-out)
 *   • shape/size keywords (circle/ellipse/farthest-corner/etc.) were never
 *     parsed
 *
 * This test file guards each of those parsing/semantic bugs.
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
    width: 1000,
    height: 800,
    quad: [0, 0, 1000, 0, 1000, 800, 0, 800],
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

describe("css-converter — radial gradient center/shape/size", () => {
  it("parses 'at X% Y%' center correctly", () => {
    const node = makeFrame({
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(circle at 20% 20%, rgb(255, 0, 0), rgb(0, 0, 255))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fill = getFills(result).find((f) => f.type === "GRADIENT_RADIAL");
    expect(fill).toBeDefined();
    expect(fill!.center?.x).toBeCloseTo(0.2, 4);
    expect(fill!.center?.y).toBeCloseTo(0.2, 4);
  });

  it("captures shape keyword 'circle'", () => {
    const node = makeFrame({
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgb(255, 0, 0), rgb(0, 0, 255))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fill = getFills(result).find((f) => f.type === "GRADIENT_RADIAL");
    expect(fill).toBeDefined();
    expect(fill!.shape).toBe("circle");
  });

  it("defaults shape to 'ellipse' when not specified (CSS spec default)", () => {
    const node = makeFrame({
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(at 50% 50%, rgb(255, 0, 0), rgb(0, 0, 255))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fill = getFills(result).find((f) => f.type === "GRADIENT_RADIAL");
    expect(fill).toBeDefined();
    expect(fill!.shape).toBe("ellipse");
  });

  it("captures size keyword 'farthest-corner'", () => {
    const node = makeFrame({
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(circle farthest-corner at 50% 50%, rgb(255, 0, 0), rgb(0, 0, 255))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fill = getFills(result).find((f) => f.type === "GRADIENT_RADIAL");
    expect(fill).toBeDefined();
    expect(fill!.size).toBe("farthest-corner");
  });
});

describe("css-converter — transparent stop inherits adjacent color", () => {
  it("transparent at END inherits RGB of previous stop (alpha=0)", () => {
    const node = makeFrame({
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(circle, rgb(59, 130, 246), transparent)",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fill = getFills(result).find((f) => f.type === "GRADIENT_RADIAL");
    expect(fill).toBeDefined();
    expect(fill!.stops?.length).toBe(2);

    const secondStop = fill!.stops![1];
    // RGB should MATCH first stop (blue), not be black
    expect(secondStop.color.r).toBeCloseTo(59 / 255, 3);
    expect(secondStop.color.g).toBeCloseTo(130 / 255, 3);
    expect(secondStop.color.b).toBeCloseTo(246 / 255, 3);
    expect(secondStop.color.a).toBe(0);
  });

  it("transparent at START inherits RGB of next stop", () => {
    const node = makeFrame({
      styles: {
        display: "block",
        backgroundImage:
          "radial-gradient(circle, transparent, rgb(255, 0, 0))",
      },
    });

    const result = convertW2WToWireframe(node as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const fill = getFills(result).find((f) => f.type === "GRADIENT_RADIAL");
    expect(fill).toBeDefined();
    expect(fill!.stops?.length).toBe(2);

    const firstStop = fill!.stops![0];
    expect(firstStop.color.r).toBeCloseTo(1, 3);
    expect(firstStop.color.g).toBeCloseTo(0, 3);
    expect(firstStop.color.b).toBeCloseTo(0, 3);
    expect(firstStop.color.a).toBe(0);
  });
});

describe("css-converter — body-style double radial integration", () => {
  it("body background: 2 radials with correct centers and transparent-fade", () => {
    const body = makeFrame({
      tag: "div",
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
    const radials = fills.filter((f) => f.type === "GRADIENT_RADIAL");

    expect(radials.length).toBe(2);

    // Layer 1: circle at 20% 20%
    expect(radials[0].shape).toBe("circle");
    expect(radials[0].center?.x).toBeCloseTo(0.2, 4);
    expect(radials[0].center?.y).toBeCloseTo(0.2, 4);
    // Transparent stop should inherit RGB of the blue stop (not be black)
    const r1Stop2 = radials[0].stops![1];
    expect(r1Stop2.color.a).toBe(0);
    expect(r1Stop2.color.r).toBeCloseTo(59 / 255, 3);
    expect(r1Stop2.color.g).toBeCloseTo(130 / 255, 3);
    expect(r1Stop2.color.b).toBeCloseTo(246 / 255, 3);

    // Layer 2: circle at 80% 10%
    expect(radials[1].shape).toBe("circle");
    expect(radials[1].center?.x).toBeCloseTo(0.8, 4);
    expect(radials[1].center?.y).toBeCloseTo(0.1, 4);
    const r2Stop2 = radials[1].stops![1];
    expect(r2Stop2.color.a).toBe(0);
    expect(r2Stop2.color.r).toBeCloseTo(36 / 255, 3);
    expect(r2Stop2.color.g).toBeCloseTo(109 / 255, 3);
    expect(r2Stop2.color.b).toBeCloseTo(255 / 255, 3);
  });
});
