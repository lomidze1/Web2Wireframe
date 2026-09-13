/**
 * A row has to spread along its own axis, not just share one band.
 *
 * `geometryFormsSingleRow` used to check the cross axis only — "is every child
 * inside the tallest child's vertical band?" — which a stack of coincident
 * children passes trivially. stripe.com's crossfade carousel is exactly that:
 * eight slides, `display: flex` in CSS, but each one translated back so all
 * eight render in the same box. Believing the CSS turned a 1232px container
 * into a 9856px auto-layout row.
 *
 * The measured geometry is the authority, the same way
 * `geometrySupportsVerticalStack` already treats the vertical axis.
 */

import { describe, it, expect } from "vitest";
import { geometryFormsSingleRow } from "../rendering/nodes";
import type { WireframeNode } from "../types";

function child(
  x: number,
  y: number,
  width: number,
  height: number,
  overrides: Partial<WireframeNode> = {},
): WireframeNode {
  return { x, y, width, height, ...overrides } as WireframeNode;
}

describe("geometryFormsSingleRow", () => {
  it("rejects a crossfade deck whose slides all sit in the same box", () => {
    const slides = Array.from({ length: 8 }, () => child(104, 12167.84, 1232, 75));

    expect(geometryFormsSingleRow(slides)).toBe(false);
  });

  it("accepts children laid out side by side", () => {
    const buttons = [
      child(0, 0, 100, 40),
      child(110, 0, 100, 40),
      child(220, 0, 100, 40),
      child(330, 0, 100, 40),
    ];

    expect(geometryFormsSingleRow(buttons)).toBe(true);
  });

  it("accepts a row that overlaps a little — stacked avatars keep their layout", () => {
    // Four 40px avatars pulled together by a -8px margin: they touch, but the
    // row still spreads, and Figma can rebuild it with a negative itemSpacing.
    const avatars = [
      child(0, 0, 40, 40),
      child(32, 0, 40, 40),
      child(64, 0, 40, 40),
      child(96, 0, 40, 40),
    ];

    expect(geometryFormsSingleRow(avatars)).toBe(true);
  });

  it("accepts a pair where one child covers half of the other", () => {
    // Half-overlap is still a spread: union 150 against a summed 200.
    expect(geometryFormsSingleRow([child(0, 0, 100, 40), child(50, 0, 100, 40)])).toBe(true);
  });

  it("treats one child, or none, as a row", () => {
    expect(geometryFormsSingleRow([])).toBe(true);
    expect(geometryFormsSingleRow([child(0, 0, 100, 40)])).toBe(true);
  });

  it("ignores out-of-flow and zero-size children when judging the spread", () => {
    const children = [
      child(0, 0, 100, 40),
      child(110, 0, 100, 40),
      // Parked on top of the first child, but absolute — not part of the row.
      child(0, 0, 100, 40, { position: "absolute" }),
      child(0, 0, 0, 0),
    ];

    expect(geometryFormsSingleRow(children)).toBe(true);
  });

  it("still rejects children spread across two vertical bands", () => {
    const grid = [
      child(0, 0, 100, 40),
      child(110, 0, 100, 40),
      child(0, 50, 100, 40),
      child(110, 50, 100, 40),
    ];

    expect(geometryFormsSingleRow(grid)).toBe(false);
  });

  it("rejects a deck even when the slides are not pixel-identical", () => {
    // Same idea as the carousel, with a pixel of capture wobble.
    const slides = [
      child(104, 100, 1232, 75),
      child(104.4, 100.2, 1231.6, 75),
      child(103.8, 99.8, 1232.2, 75),
    ];

    expect(geometryFormsSingleRow(slides)).toBe(false);
  });
});
