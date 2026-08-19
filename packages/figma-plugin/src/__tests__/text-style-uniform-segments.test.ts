/**
 * TextStyle linking for uniform multi-segment nodes (2026-08-08 audit).
 *
 * linkTextStyleIfApplicable used to bail on `segments.length !== 1`. But the
 * converter emits one segment PER VISUAL LINE, so every multi-line paragraph
 * — same font, same size, same weight on all lines — silently lost its
 * TextStyle link and duplicated raw properties instead. Only true per-range
 * variation (a bold word, a different size) must keep direct properties.
 */
import { describe, it, expect } from "vitest";
import { segmentsShareUniformTypography } from "../rendering/text";
import type { TextSegment, WireframeNode } from "../types";

const nodeDefaults = { fontWeight: 400, fontSize: 16, fontFamily: "Inter" } as WireframeNode;

function seg(overrides: Partial<TextSegment> = {}): TextSegment {
  return {
    text: "line",
    color: "rgb(0, 0, 0)",
    fontWeight: 400,
    fontSize: 16,
    fontFamily: "Inter",
    ...overrides,
  } as TextSegment;
}

describe("segmentsShareUniformTypography", () => {
  it("single segment is uniform", () => {
    expect(segmentsShareUniformTypography([seg()], nodeDefaults)).toBe(true);
  });

  it("multi-line paragraph (identical typography per line) is uniform", () => {
    expect(
      segmentsShareUniformTypography([seg(), seg({ text: "line two" }), seg({ text: "line three" })], nodeDefaults),
    ).toBe(true);
  });

  it("differing colors do NOT break uniformity (color is a fill, not typography)", () => {
    expect(
      segmentsShareUniformTypography([seg(), seg({ color: "rgb(255, 0, 0)" })], nodeDefaults),
    ).toBe(true);
  });

  it("a bold word breaks uniformity", () => {
    expect(
      segmentsShareUniformTypography([seg(), seg({ fontWeight: 700 })], nodeDefaults),
    ).toBe(false);
  });

  it("a different family breaks uniformity", () => {
    expect(
      segmentsShareUniformTypography([seg(), seg({ fontFamily: "Georgia" })], nodeDefaults),
    ).toBe(false);
  });

  it("mixed decoration breaks uniformity (style link resets decoration once)", () => {
    expect(
      segmentsShareUniformTypography([seg(), seg({ textDecoration: "underline" })], nodeDefaults),
    ).toBe(false);
  });

  it("segment weight falling back to the node weight matches an explicit equal weight", () => {
    expect(
      segmentsShareUniformTypography(
        [seg({ fontWeight: undefined as unknown as number }), seg({ fontWeight: 400 })],
        nodeDefaults,
      ),
    ).toBe(true);
  });
});
