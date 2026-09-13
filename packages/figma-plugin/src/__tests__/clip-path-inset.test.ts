/**
 * `clip-path: inset(...)` parsing.
 *
 * An inventory of the two real captures on disk (stripe.com — 358 nodes with a
 * clip-path — and iwm.org.uk — none) found that 100% of the values are
 * `inset()`. No `polygon()`, `circle()`, `ellipse()`, `path()` or `url(#id)`
 * occurs, so an axis-aligned rounded rectangle is the whole problem: Figma
 * expresses it natively with `clipsContent` + `cornerRadius` and no vector mask
 * is needed.
 *
 * The cases below are the fifteen distinct values stripe.com actually ships,
 * plus the shapes we must decline. Declining means returning `null`, which
 * leaves the node exactly as it renders today — an unclipped rectangle.
 */
import { describe, it, expect } from "vitest";
import { parseInsetClipPath } from "../rendering/clipPath";

describe("parseInsetClipPath — shapes we decline", () => {
  it.each([
    ["none", "none"],
    ["empty", ""],
    ["undefined", undefined],
    ["polygon", "polygon(50% 0%, 100% 100%, 0% 100%)"],
    ["circle", "circle(50% at 50% 50%)"],
    ["ellipse", "ellipse(25% 40% at 50% 50%)"],
    ["path", "path('M 0 0 L 100 0 L 50 100 Z')"],
    ["url reference", "url(#clip-a)"],
    ["box keyword", "border-box"],
    ["unsupported unit", "inset(1em)"],
    ["calc", "inset(calc(1px + 2%))"],
    ["var", "inset(var(--x))"],
    ["no arguments", "inset()"],
  ])("returns null for %s", (_label, value) => {
    expect(parseInsetClipPath(value, 400, 300)).toBeNull();
  });
});

describe("parseInsetClipPath — stripe.com's real values", () => {
  it("inset(0px round 6px): rounding only, no clipping", () => {
    const clip = parseInsetClipPath("inset(0px round 6px)", 400, 300);
    expect(clip).toMatchObject({
      top: 0, right: 0, bottom: 0, left: 0,
      radius: 6,
      fullyClipped: false,
      isNoOp: false, // the radius alone is worth applying
    });
  });

  it("inset(0px 0px 100%): bottom inset eats the whole box", () => {
    const clip = parseInsetClipPath("inset(0px 0px 100%)", 400, 300);
    expect(clip?.bottom).toBe(300);
    expect(clip?.fullyClipped).toBe(true);
  });

  it("inset(0px 0px 0%): a no-op", () => {
    expect(parseInsetClipPath("inset(0px 0px 0%)", 400, 300)).toMatchObject({
      isNoOp: true,
      fullyClipped: false,
    });
  });

  it.each([
    ["inset(0px -60px)"],
    ["inset(0px 0px -77px)"],
  ])("%s: negative insets grow the region, so they clip nothing", (value) => {
    const clip = parseInsetClipPath(value, 400, 300);
    expect(clip).toMatchObject({
      top: 0, right: 0, bottom: 0, left: 0,
      isNoOp: true,
      fullyClipped: false,
    });
  });

  it("inset(6px 3.5503px round 5px): real inset plus rounding", () => {
    expect(parseInsetClipPath("inset(6px 3.5503px round 5px)", 400, 300)).toMatchObject({
      top: 6, right: 3.5503, bottom: 6, left: 3.5503,
      radius: 5,
      isNoOp: false,
      fullyClipped: false,
    });
  });

  it("inset(0px 5px 0px 0px): four values in top/right/bottom/left order", () => {
    expect(parseInsetClipPath("inset(0px 5px 0px 0px)", 400, 300)).toMatchObject({
      top: 0, right: 5, bottom: 0, left: 0,
    });
  });

  it("inset(0px round 2px) keeps its radius on a tiny box", () => {
    expect(parseInsetClipPath("inset(0px round 2px)", 24, 24)?.radius).toBe(2);
  });
});

describe("parseInsetClipPath — percentage resolution", () => {
  it("resolves left/right against width and top/bottom against height", () => {
    // 10% 25% → top/bottom = 10% of 300, left/right = 25% of 400.
    expect(parseInsetClipPath("inset(10% 25%)", 400, 300)).toMatchObject({
      top: 30, right: 100, bottom: 30, left: 100,
    });
  });

  it("stripe's 99.7418% bottom inset still fully clips", () => {
    expect(parseInsetClipPath("inset(0px 0px 99.7418%)", 400, 300)?.fullyClipped).toBe(true);
  });

  it("a horizontal inset can fully clip too", () => {
    expect(parseInsetClipPath("inset(0px 50%)", 400, 300)?.fullyClipped).toBe(true);
  });
});

describe("parseInsetClipPath — shorthand expansion", () => {
  it("one value applies to all four sides", () => {
    expect(parseInsetClipPath("inset(4px)", 400, 300)).toMatchObject({
      top: 4, right: 4, bottom: 4, left: 4,
    });
  });

  it("three values are top / left-right / bottom", () => {
    expect(parseInsetClipPath("inset(1px 2px 3px)", 400, 300)).toMatchObject({
      top: 1, right: 2, bottom: 3, left: 2,
    });
  });

  it("more than four values is not valid CSS", () => {
    expect(parseInsetClipPath("inset(1px 2px 3px 4px 5px)", 400, 300)).toBeNull();
  });
});

describe("parseInsetClipPath — degenerate boxes", () => {
  it("inset(0px) on a zero-size box is a no-op, not a full clip", () => {
    // Guarding this matters: `fullyClipped` drops the node, and a zero-width
    // wrapper carrying `inset(0px)` paints its overflowing children just fine.
    expect(parseInsetClipPath("inset(0px)", 0, 0)).toMatchObject({
      isNoOp: true,
      fullyClipped: false,
    });
  });

  it("a percentage radius is dropped, the insets survive", () => {
    // Percentage border-radii resolve per-axis; Figma has one number per
    // corner. Rather than guess, keep the clipping and skip the rounding.
    expect(parseInsetClipPath("inset(4px round 50%)", 400, 300)).toMatchObject({
      top: 4, radius: null, isNoOp: false,
    });
  });
});
