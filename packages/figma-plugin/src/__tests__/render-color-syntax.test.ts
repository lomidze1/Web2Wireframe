/**
 * Color parser extension: hsl()/hsla() and the modern space-separated
 * rgb(0 0 0 / 50%) syntax previously returned null → the fill silently
 * dropped (transparent element where the browser painted a color).
 * Exercised through the converter so we test the real path.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("figma", { createFrame: vi.fn(), mixed: Symbol("figma.mixed") });

import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function frameWithBg(backgroundColor: string): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 100, height: 100,
    quad: [0, 0, 100, 0, 100, 100, 0, 100],
    tag: "div", classList: [], attr: {},
    styles: { display: "block" },
    children: [{
      type: "FRAME",
      x: 0, y: 0, width: 100, height: 50,
      quad: [0, 0, 100, 0, 100, 50, 0, 50],
      tag: "div", classList: [], attr: {},
      styles: { display: "block", backgroundColor },
      children: [],
    }],
  };
}

function solidFillOf(bg: string) {
  const wf = convertW2WToWireframe(frameWithBg(bg) as never, {
    layoutMode: "autoLayout",
  }) as WireframeNode;
  return wf.children![0].fills?.find((f) => f.type === "SOLID");
}

describe("extended color syntax", () => {
  it("parses hsl()", () => {
    const fill = solidFillOf("hsl(0, 100%, 50%)"); // pure red
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(1, 2);
    expect(fill!.color!.g).toBeCloseTo(0, 2);
    expect(fill!.color!.b).toBeCloseTo(0, 2);
  });

  it("parses hsla() with alpha", () => {
    const fill = solidFillOf("hsla(120, 100%, 25%, 0.5)"); // dark green, 50%
    expect(fill).toBeDefined();
    expect(fill!.opacity).toBeCloseTo(0.5, 2);
    expect(fill!.color!.g).toBeCloseTo(0.5, 2);
  });

  it("parses space-separated rgb with slash alpha", () => {
    const fill = solidFillOf("rgb(255 0 0 / 50%)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(1, 2);
    expect(fill!.opacity).toBeCloseTo(0.5, 2);
  });

  it("still parses classic rgb()", () => {
    const fill = solidFillOf("rgb(0, 128, 255)");
    expect(fill).toBeDefined();
    expect(fill!.color!.b).toBeCloseTo(1, 2);
  });
});

/**
 * Chrome serializes any color authored outside sRGB as `oklab(...)`, and
 * `color(srgb …)` survives verbatim inside gradients. Tailwind v4 authors
 * everything in `oklch`, so on clerk.com alone 48 backgrounds, 30 borders and
 * 43 gradients came through these syntaxes — every one of them parsed to null
 * and dropped its paint.
 */
describe("modern color spaces", () => {
  it("parses oklch()", () => {
    const fill = solidFillOf("oklch(0.7 0.15 250)"); // sky blue
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(0.294, 2);
    expect(fill!.color!.g).toBeCloseTo(0.639, 2);
    expect(fill!.color!.b).toBeCloseTo(0.97, 2);
  });

  it("parses oklab() with slash alpha", () => {
    const fill = solidFillOf("oklab(0.188081 0.0016512 -0.00579907 / 0.05)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(0.075, 2);
    expect(fill!.opacity).toBeCloseTo(0.05, 3);
  });

  it("parses a percentage lightness", () => {
    // oklab(100% 0 0) is white.
    const fill = solidFillOf("oklab(100% 0 0)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(1, 2);
    expect(fill!.color!.g).toBeCloseTo(1, 2);
    expect(fill!.color!.b).toBeCloseTo(1, 2);
  });

  it("parses color(srgb …) with slash alpha", () => {
    const fill = solidFillOf("color(srgb 0.968627 0.968627 0.972549 / 0.4)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(0.9686, 3);
    expect(fill!.color!.b).toBeCloseTo(0.9725, 3);
    expect(fill!.opacity).toBeCloseTo(0.4, 2);
  });

  it("gamma-encodes color(srgb-linear …)", () => {
    // Mid-grey in linear light is ~0.5 encoded to ~0.735.
    const fill = solidFillOf("color(srgb-linear 0.5 0.5 0.5)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(0.735, 2);
  });
});

/**
 * The wide-gamut branches of `color()`. Only `srgb` and `srgb-linear` were
 * pinned, so the five-constant linear-P3 → linear-sRGB matrix, the deliberate
 * fall-through for spaces we do not convert, and the out-of-gamut clamp all
 * shipped unverified — a transposed matrix would shift every P3 color on the
 * page and no test would notice.
 */
describe("color() gamut handling", () => {
  it("maps pure display-p3 red onto sRGB red", () => {
    // P3 red is outside sRGB, so the matrix overshoots and the clamp brings it
    // back to 1 — the other two channels go negative and must land on 0, not
    // NaN (Math.pow of a negative), which is what the linear branch guards.
    const fill = solidFillOf("color(display-p3 1 0 0)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(1, 3);
    expect(fill!.color!.g).toBe(0);
    expect(fill!.color!.b).toBe(0);
  });

  it("maps pure display-p3 green onto sRGB green", () => {
    // Pins the SECOND matrix row independently: a transposed matrix passes the
    // red case above (row 1 and column 1 agree) but fails here.
    const fill = solidFillOf("color(display-p3 0 1 0)");
    expect(fill).toBeDefined();
    expect(fill!.color!.g).toBeCloseTo(1, 3);
    expect(fill!.color!.r).toBe(0);
    expect(fill!.color!.b).toBe(0);
  });

  it("leaves display-p3 white at white", () => {
    // Every row must sum to 1 for the white point to survive the round trip.
    const fill = solidFillOf("color(display-p3 1 1 1)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(1, 3);
    expect(fill!.color!.g).toBeCloseTo(1, 3);
    expect(fill!.color!.b).toBeCloseTo(1, 3);
  });

  it("reads an unconverted space as sRGB rather than dropping the paint", () => {
    // rec2020/prophoto/xyz have never shown up in a capture. The deliberate
    // choice is an approximate color over a transparent element.
    const fill = solidFillOf("color(rec2020 0.5 0.5 0.5 / 0.5)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBeCloseTo(0.5, 3);
    expect(fill!.color!.g).toBeCloseTo(0.5, 3);
    expect(fill!.color!.b).toBeCloseTo(0.5, 3);
    expect(fill!.opacity).toBeCloseTo(0.5, 3);
  });

  it("clamps out-of-gamut channels into the 0..1 Figma takes", () => {
    // Figma throws on a channel outside 0..1, so this is a crash guard, not a
    // fidelity one.
    const fill = solidFillOf("color(srgb -0.2 1.5 0.5)");
    expect(fill).toBeDefined();
    expect(fill!.color!.r).toBe(0);
    expect(fill!.color!.g).toBe(1);
    expect(fill!.color!.b).toBeCloseTo(0.5, 3);
  });
});

describe("oklch component forms", () => {
  it("resolves a percentage chroma against 0.4", () => {
    // CSS Color 4: 100% chroma == 0.4. Tailwind v4 emits both forms.
    const pct = solidFillOf("oklch(0.7 25% 200)");
    const abs = solidFillOf("oklch(0.7 0.1 200)");
    expect(pct).toBeDefined();
    expect(abs).toBeDefined();
    expect(pct!.color!.r).toBeCloseTo(abs!.color!.r, 5);
    expect(pct!.color!.g).toBeCloseTo(abs!.color!.g, 5);
    expect(pct!.color!.b).toBeCloseTo(abs!.color!.b, 5);
  });

  it("accepts a deg-suffixed hue", () => {
    const withDeg = solidFillOf("oklch(0.7 0.1 200deg)");
    const bare = solidFillOf("oklch(0.7 0.1 200)");
    expect(withDeg).toBeDefined();
    expect(withDeg!.color!.r).toBeCloseTo(bare!.color!.r, 5);
    expect(withDeg!.color!.b).toBeCloseTo(bare!.color!.b, 5);
  });

  it("agrees with the equivalent oklab() for the same color", () => {
    // oklch(0.7 0.1 200) → a = 0.1·cos(200°) = -0.09397, b = 0.1·sin(200°) = -0.03420
    const polar = solidFillOf("oklch(0.7 0.1 200)");
    const rect = solidFillOf("oklab(0.7 -0.09397 -0.03420)");
    expect(polar).toBeDefined();
    expect(rect).toBeDefined();
    expect(polar!.color!.r).toBeCloseTo(rect!.color!.r, 3);
    expect(polar!.color!.g).toBeCloseTo(rect!.color!.g, 3);
    expect(polar!.color!.b).toBeCloseTo(rect!.color!.b, 3);
  });
});
