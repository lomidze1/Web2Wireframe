/**
 * Per-Side Border Parsing Tests
 *
 * Covers the new `parseBordersToStrokes` per-side signature used by the
 * tree-builder to handle elements with `border-bottom`, `border-top`, etc.
 * (e.g. Apple.com's `#ac-globalfooter .ac-gf-sosumi` with `border-bottom: 1px solid`).
 */

import { describe, it, expect } from "vitest";
import { parseBordersToStrokes } from "../style-parsers";

describe("parseBordersToStrokes — per-side signature", () => {
  describe("uniform case (all 4 sides identical)", () => {
    it("collapses 4 identical sides into a single all-sides stroke", () => {
      const strokes = parseBordersToStrokes({
        top:    { width: "1px", color: "rgb(255, 0, 0)", style: "solid" },
        right:  { width: "1px", color: "rgb(255, 0, 0)", style: "solid" },
        bottom: { width: "1px", color: "rgb(255, 0, 0)", style: "solid" },
        left:   { width: "1px", color: "rgb(255, 0, 0)", style: "solid" },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].weight).toBe(1);
      expect(strokes[0].style).toBe("SOLID");
      expect(strokes[0].sides).toEqual({
        top: true, right: true, bottom: true, left: true,
      });
      expect(strokes[0].color.r).toBeCloseTo(1);
      expect(strokes[0].color.g).toBeCloseTo(0);
      expect(strokes[0].color.b).toBeCloseTo(0);
    });
  });

  describe("single-side borders (Apple.com case)", () => {
    it("produces only bottom stroke for border-bottom-only element", () => {
      const strokes = parseBordersToStrokes({
        top:    { width: "0px",  color: "rgb(0, 0, 0)",     style: "none" },
        right:  { width: "0px",  color: "rgb(0, 0, 0)",     style: "none" },
        bottom: { width: "1px",  color: "rgb(100, 100, 100)", style: "solid" },
        left:   { width: "0px",  color: "rgb(0, 0, 0)",     style: "none" },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].weight).toBe(1);
      expect(strokes[0].sides).toEqual({
        top: false, right: false, bottom: true, left: false,
      });
    });

    it("produces only top stroke for border-top-only element", () => {
      const strokes = parseBordersToStrokes({
        top:    { width: "3px", color: "rgb(0, 255, 0)", style: "solid" },
        right:  { width: "0px", color: "rgb(0, 0, 0)",   style: "none" },
        bottom: { width: "0px", color: "rgb(0, 0, 0)",   style: "none" },
        left:   { width: "0px", color: "rgb(0, 0, 0)",   style: "none" },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].sides?.top).toBe(true);
      expect(strokes[0].sides?.bottom).toBe(false);
      expect(strokes[0].weight).toBe(3);
    });

    it("produces only left stroke for border-left-only element", () => {
      const strokes = parseBordersToStrokes({
        top:    { width: "0px", color: "rgb(0, 0, 0)",   style: "none" },
        right:  { width: "0px", color: "rgb(0, 0, 0)",   style: "none" },
        bottom: { width: "0px", color: "rgb(0, 0, 0)",   style: "none" },
        left:   { width: "2px", color: "rgb(0, 0, 255)", style: "solid" },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].sides?.left).toBe(true);
      expect(strokes[0].weight).toBe(2);
    });
  });

  describe("mixed widths", () => {
    it("produces 2 strokes when top and bottom differ in width", () => {
      const strokes = parseBordersToStrokes({
        top:    { width: "1px", color: "rgb(0, 0, 0)", style: "solid" },
        right:  { width: "0px", color: "rgb(0, 0, 0)", style: "none" },
        bottom: { width: "2px", color: "rgb(0, 0, 0)", style: "solid" },
        left:   { width: "0px", color: "rgb(0, 0, 0)", style: "none" },
      });
      expect(strokes).toHaveLength(2);
      const top = strokes.find((s) => s.sides?.top);
      const bottom = strokes.find((s) => s.sides?.bottom);
      expect(top?.weight).toBe(1);
      expect(bottom?.weight).toBe(2);
    });

    it("produces 4 strokes when all sides have different widths", () => {
      const strokes = parseBordersToStrokes({
        top:    { width: "1px", color: "rgb(0, 0, 0)", style: "solid" },
        right:  { width: "2px", color: "rgb(0, 0, 0)", style: "solid" },
        bottom: { width: "3px", color: "rgb(0, 0, 0)", style: "solid" },
        left:   { width: "4px", color: "rgb(0, 0, 0)", style: "solid" },
      });
      expect(strokes).toHaveLength(4);
      expect(strokes.find((s) => s.sides?.top)?.weight).toBe(1);
      expect(strokes.find((s) => s.sides?.right)?.weight).toBe(2);
      expect(strokes.find((s) => s.sides?.bottom)?.weight).toBe(3);
      expect(strokes.find((s) => s.sides?.left)?.weight).toBe(4);
    });
  });

  describe("mixed styles", () => {
    it("produces non-uniform strokes when only style differs", () => {
      const strokes = parseBordersToStrokes({
        top:    { width: "1px", color: "rgb(0, 0, 0)", style: "solid" },
        right:  { width: "1px", color: "rgb(0, 0, 0)", style: "solid" },
        bottom: { width: "1px", color: "rgb(0, 0, 0)", style: "dashed" },
        left:   { width: "1px", color: "rgb(0, 0, 0)", style: "solid" },
      });
      // 4 strokes — one per side, since style differs
      expect(strokes).toHaveLength(4);
      const bottom = strokes.find((s) => s.sides?.bottom);
      expect(bottom?.style).toBe("DASHED");
    });

    it("maps dotted style", () => {
      const strokes = parseBordersToStrokes({
        bottom: { width: "1px", color: "rgb(0, 0, 0)", style: "dotted" },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].style).toBe("DOTTED");
    });
  });

  describe("style:none / hidden / width:0 filters", () => {
    it("skips sides with style:none", () => {
      const strokes = parseBordersToStrokes({
        top: { width: "1px", color: "rgb(0, 0, 0)", style: "none" },
      });
      expect(strokes).toEqual([]);
    });

    it("skips sides with style:hidden", () => {
      const strokes = parseBordersToStrokes({
        bottom: { width: "1px", color: "rgb(0, 0, 0)", style: "hidden" },
      });
      expect(strokes).toEqual([]);
    });

    it("skips sides with width 0", () => {
      const strokes = parseBordersToStrokes({
        top: { width: "0px", color: "rgb(255, 0, 0)", style: "solid" },
      });
      expect(strokes).toEqual([]);
    });

    it("skips sides with negative width", () => {
      const strokes = parseBordersToStrokes({
        top: { width: "-1px", color: "rgb(255, 0, 0)", style: "solid" },
      });
      expect(strokes).toEqual([]);
    });

    it("returns empty array when no sides provided", () => {
      expect(parseBordersToStrokes({})).toEqual([]);
      expect(parseBordersToStrokes(undefined)).toEqual([]);
    });
  });

  describe("transparent colors", () => {
    it("skips sides with alpha 0", () => {
      const strokes = parseBordersToStrokes({
        bottom: { width: "1px", color: "rgba(0, 0, 0, 0)", style: "solid" },
      });
      expect(strokes).toEqual([]);
    });

    it("keeps sides with alpha > 0", () => {
      const strokes = parseBordersToStrokes({
        bottom: { width: "1px", color: "rgba(0, 0, 0, 0.5)", style: "solid" },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].color.a).toBeCloseTo(0.5);
    });
  });

  describe("fractional widths", () => {
    it("preserves subpixel widths", () => {
      const strokes = parseBordersToStrokes({
        bottom: { width: "0.5px", color: "rgb(0, 0, 0)", style: "solid" },
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].weight).toBe(0.5);
    });
  });

  describe("CSS variable resolution", () => {
    it("resolves var() in border color via resolvedVariables map", () => {
      const variables = new Map([["--brand", "rgb(10, 20, 30)"]]);
      const strokes = parseBordersToStrokes(
        {
          bottom: { width: "1px", color: "var(--brand)", style: "solid" },
        },
        undefined,
        variables,
      );
      expect(strokes).toHaveLength(1);
      expect(strokes[0].color.r).toBeCloseTo(10 / 255);
      expect(strokes[0].color.g).toBeCloseTo(20 / 255);
      expect(strokes[0].color.b).toBeCloseTo(30 / 255);
    });
  });

  describe("fallback shorthand (no per-side)", () => {
    it("uses shorthand when per-side is empty", () => {
      const strokes = parseBordersToStrokes(undefined, {
        width: "2px",
        color: "rgb(0, 0, 0)",
        style: "solid",
      });
      expect(strokes).toHaveLength(1);
      expect(strokes[0].weight).toBe(2);
      expect(strokes[0].sides).toEqual({
        top: true, right: true, bottom: true, left: true,
      });
    });

    it("prefers per-side over shorthand when both present", () => {
      const strokes = parseBordersToStrokes(
        { bottom: { width: "3px", color: "rgb(0, 0, 0)", style: "solid" } },
        { width: "1px", color: "rgb(255, 0, 0)", style: "solid" },
      );
      expect(strokes).toHaveLength(1);
      expect(strokes[0].weight).toBe(3);
      expect(strokes[0].sides?.bottom).toBe(true);
      expect(strokes[0].sides?.top).toBe(false);
    });
  });

  describe("backward-compat shim (legacy positional signature)", () => {
    // The old 4 tests in style-parsers.test.ts use positional args —
    // verify the shim still works for existing callers.
    it("accepts legacy positional arguments for shorthand", () => {
       
      const strokes = (parseBordersToStrokes as any)(
        "2",
        "#FF0000",
        "solid",
        null,
        null,
        null,
        null,
      );
      expect(strokes).toHaveLength(1);
      expect(strokes[0].weight).toBe(2);
    });

    it("accepts legacy positional per-side shorthand strings", () => {
       
      const strokes = (parseBordersToStrokes as any)(
        null, null, null,
        "1px solid red",
        null,
        "2px solid blue",
        null,
      );
      expect(strokes).toHaveLength(2);
      const top = strokes.find((s: { sides?: { top?: boolean } }) => s.sides?.top);
      const bottom = strokes.find((s: { sides?: { bottom?: boolean } }) => s.sides?.bottom);
      expect(top?.weight).toBe(1);
      expect(bottom?.weight).toBe(2);
    });
  });
});
