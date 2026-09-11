/**
 * `parseBoxShadow` only knew `rgb()`/`rgba()`/hex/bare-word colors. Chrome
 * serializes any color authored outside sRGB as `oklab(...)` — which Tailwind
 * v4 produces everywhere — so the color was never stripped from the shadow
 * string and its own numbers were read as the shadow's metrics:
 *
 *   oklab(0.188081 0.0016512 -0.00579907 / 0.05) 0px 0px 0px 1px
 *   → numbers = [0.188081, 0.0016512, -0.00579907, 0.05, 0, 0, 0, 1]
 *   → blur = -0.0058 → `radius` negative
 *
 * Figma rejects a negative radius ("Number must be greater than or equal to 0
 * at [2].radius"), the per-child try/catch swallows the throw, and the whole
 * element disappears — 79 images lost in one clerk.com import.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaEffect } from "../types";

function effectsFor(boxShadow: string): FigmaEffect[] {
  const result = convertW2WToWireframe(
    {
      type: "FRAME",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      quad: [0, 0, 200, 0, 200, 100, 0, 100],
      tag: "div",
      classList: [],
      attr: {},
      styles: { display: "block", boxShadow },
      children: [],
    } as never,
    undefined,
  );
  return (result.effects as FigmaEffect[] | undefined) ?? [];
}

/** The literal computed value Chrome reports for clerk.com's shadowed images. */
const CLERK_SHADOW =
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
  "oklab(0.188081 0.0016512 -0.00579907 / 0.05) 0px 0px 0px 1px, " +
  "rgba(0, 0, 0, 0.08) 0px 5px 15px 0px, " +
  "rgba(25, 28, 33, 0.2) 0px 15px 35px -5px";

describe("box-shadow with a modern color function", () => {
  it("never emits a negative radius (the clerk.com fatal)", () => {
    for (const e of effectsFor(CLERK_SHADOW)) {
      expect(e.radius).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the three painting shadows and drops the fully transparent ones", () => {
    // Figma paints array-last on top, so source order reverses.
    expect(effectsFor(CLERK_SHADOW).map((e) => e.radius)).toEqual([35, 15, 0]);
  });

  it("reads the oklab shadow's own metrics, not the numbers inside the color", () => {
    const ring = effectsFor(CLERK_SHADOW)[2];
    expect(ring.offset).toEqual({ x: 0, y: 0 });
    expect(ring.radius).toBe(0);
    expect(ring.spread).toBe(1);
  });

  it("resolves the oklab color instead of falling back to 25% black", () => {
    const ring = effectsFor(CLERK_SHADOW)[2];
    // oklab(0.188081 0.0016512 -0.00579907) ≈ rgb(0.075, 0.075, 0.086)
    expect(ring.color.r).toBeCloseTo(0.075, 2);
    expect(ring.color.g).toBeCloseTo(0.075, 2);
    expect(ring.color.b).toBeCloseTo(0.086, 2);
    expect(ring.color.a).toBeCloseTo(0.05, 3);
  });

  it("handles a color-mix() color without splitting on its inner comma", () => {
    const effects = effectsFor(
      "color-mix(in oklab, rgb(255, 0, 0) 50%, rgb(0, 0, 255)) 0px 2px 6px 0px",
    );
    expect(effects).toHaveLength(1);
    expect(effects[0].radius).toBe(6);
    expect(effects[0].offset).toEqual({ x: 0, y: 2 });
  });

  it("still parses a plain rgba() shadow unchanged", () => {
    const effects = effectsFor("rgba(0, 0, 0, 0.5) 1px 2px 3px 4px");
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      offset: { x: 1, y: 2 },
      radius: 3,
      spread: 4,
    });
    expect(effects[0].color.a).toBeCloseTo(0.5, 2);
  });
});
