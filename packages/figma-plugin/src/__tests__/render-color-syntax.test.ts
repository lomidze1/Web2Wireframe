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
