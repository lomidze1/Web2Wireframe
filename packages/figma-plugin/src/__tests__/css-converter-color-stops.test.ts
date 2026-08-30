/**
 * Defect 2 (h2d parity): color-stop positioning must follow the CSS
 * algorithm (h2d `bj` app.js:35870 / `sj` :35929 / `pj` :36669):
 *   • first stop defaults to 0, last to 1
 *   • unpositioned stops interpolate between the nearest ANCHORED neighbours
 *     (was: i/(n−1) spread over the whole list)
 *   • a running max clamp enforces monotonicity
 *   • px positions resolve against the gradient line length
 *     (was: normalized by the largest px value among the stops)
 *   • a double-position stop (`red 0 50%`) expands into two stops
 *   • a bare color hint (`red, 40%, blue`) becomes a real stop carrying the
 *     averaged RGBA of its neighbours
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaFill } from "../types";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    quad: [0, 0, 400, 0, 400, 400, 0, 400],
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

describe("unpositioned stops interpolate between anchored neighbours", () => {
  it("linear-gradient(red, blue 20%, green, yellow) puts green at 0.60", () => {
    const fill = gradientFill(
      "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255) 20%, rgb(0, 128, 0), rgb(255, 255, 0))",
    );
    expect(fill).toBeDefined();
    const positions = fill!.stops!.map((s) => s.position);
    expect(positions[0]).toBeCloseTo(0, 5);
    expect(positions[1]).toBeCloseTo(0.2, 5);
    expect(positions[2]).toBeCloseTo(0.6, 5); // midway between 0.2 and 1
    expect(positions[3]).toBeCloseTo(1, 5);
  });

  it("a run of unpositioned stops distributes evenly between its anchors", () => {
    const fill = gradientFill(
      "linear-gradient(rgb(255, 0, 0) 10%, rgb(0, 0, 255), rgb(0, 128, 0), rgb(255, 255, 0) 70%)",
    );
    const positions = fill!.stops!.map((s) => s.position);
    expect(positions).toHaveLength(4);
    expect(positions[1]).toBeCloseTo(0.3, 5);
    expect(positions[2]).toBeCloseTo(0.5, 5);
  });
});

describe("monotonic clamp", () => {
  it("a stop positioned before its predecessor clamps to the running max", () => {
    const fill = gradientFill(
      "linear-gradient(rgb(255, 0, 0) 50%, rgb(0, 0, 255) 20%, rgb(0, 128, 0))",
    );
    const positions = fill!.stops!.map((s) => s.position);
    expect(positions[0]).toBeCloseTo(0.5, 5);
    expect(positions[1]).toBeCloseTo(0.5, 5); // clamped up from 0.2
    expect(positions[2]).toBeCloseTo(1, 5);
  });
});

describe("px positions resolve against the gradient line length", () => {
  it("#000 0 40px, #fff 40px on a 400px box puts the hard edge at 10%", () => {
    // Default direction (to bottom) on a 400x400 box → line length 400.
    const fill = gradientFill(
      "linear-gradient(rgb(0, 0, 0) 0px 40px, rgb(255, 255, 255) 40px)",
    );
    expect(fill).toBeDefined();
    const stops = fill!.stops!;
    expect(stops).toHaveLength(3); // double-position expands
    expect(stops[0].position).toBeCloseTo(0, 5);
    expect(stops[1].position).toBeCloseTo(0.1, 5);
    expect(stops[2].position).toBeCloseTo(0.1, 5);
  });

  it("px on an angled gradient uses |W·sinθ| + |H·cosθ|", () => {
    // 90deg on 400x400 → line length 400 → 100px = 0.25.
    const fill = gradientFill(
      "linear-gradient(90deg, rgb(255, 0, 0) 100px, rgb(0, 0, 255))",
    );
    expect(fill!.stops![0].position).toBeCloseTo(0.25, 5);
  });
});

describe("double-position stops (hard stripes)", () => {
  it("red 0 50%, blue 50% 100% expands to four stops", () => {
    const fill = gradientFill(
      "linear-gradient(rgb(255, 0, 0) 0% 50%, rgb(0, 0, 255) 50% 100%)",
    );
    expect(fill).toBeDefined();
    const stops = fill!.stops!;
    expect(stops).toHaveLength(4);
    expect(stops.map((s) => s.position)).toEqual([0, 0.5, 0.5, 1]);
    expect(stops[0].color.r).toBeCloseTo(1, 3);
    expect(stops[1].color.r).toBeCloseTo(1, 3);
    expect(stops[2].color.b).toBeCloseTo(1, 3);
    expect(stops[3].color.b).toBeCloseTo(1, 3);
  });
});

describe("color hints", () => {
  it("red, 40%, blue inserts an averaged stop at 0.4", () => {
    const fill = gradientFill(
      "linear-gradient(rgb(255, 0, 0), 40%, rgb(0, 0, 255))",
    );
    expect(fill).toBeDefined();
    const stops = fill!.stops!;
    expect(stops).toHaveLength(3);
    expect(stops[1].position).toBeCloseTo(0.4, 5);
    expect(stops[1].color.r).toBeCloseTo(0.5, 3);
    expect(stops[1].color.b).toBeCloseTo(0.5, 3);
  });
});

describe("existing behavior preserved", () => {
  it("evenly-spaced unanchored lists are unchanged", () => {
    const fill = gradientFill(
      "linear-gradient(rgb(255, 0, 0), rgb(0, 128, 0), rgb(0, 0, 255))",
    );
    expect(fill!.stops!.map((s) => s.position)).toEqual([0, 0.5, 1]);
  });

  it("transparent stops still inherit the neighbour's RGB with alpha 0", () => {
    const fill = gradientFill(
      "linear-gradient(rgb(255, 0, 0), rgba(0, 0, 0, 0))",
    );
    const last = fill!.stops![1];
    expect(last.color.a).toBe(0);
    expect(last.color.r).toBeCloseTo(1, 3);
  });
});
