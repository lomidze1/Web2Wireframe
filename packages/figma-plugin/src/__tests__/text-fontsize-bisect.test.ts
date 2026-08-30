/**
 * Binary-search fontSize fitting (h2d parity).
 *
 * h2d compares Figma's absoluteRenderBounds against the browser-captured box
 * after building every TEXT node and BISECTS fontSize (between fontSize/2 and
 * fontSize, converging to 0.2px) until the rendered ink fits
 * (main-rawbundle.beautified.js:17019-17187). Our previous ladder tried exactly
 * one `fontSize - 1` step and then truncated with an ellipsis — so where a
 * substituted font is 8% wider, h2d kept every word and we dropped some.
 *
 * `bisectFontSizeToFit` is the pure search: it probes a caller-supplied
 * `fits(fontSize)` predicate so tests can model font metrics without Figma.
 * `scaleSegmentRangeFontSizes` keeps mixed-size runs proportional when the
 * base fontSize is scaled.
 */

import { describe, it, expect } from "vitest";
import {
  bisectFontSizeToFit,
  scaleSegmentRangeFontSizes,
  protectTrailingSpaces,
  TEXT_RESIZE_SLACK,
} from "../rendering/text";

describe("bisectFontSizeToFit", () => {
  it("returns the original size when it already fits (single probe)", () => {
    let probes = 0;
    const result = bisectFontSizeToFit(16, () => {
      probes++;
      return true;
    });
    expect(result).toBe(16);
    expect(probes).toBe(1);
  });

  it("converges within 0.2px of the true threshold (linear width model)", () => {
    // width = 10 * fontSize, captured box 140px wide (+1px tolerance is the
    // caller's concern — model it directly: fits iff 10*fs <= 141).
    const threshold = 14.1;
    const fits = (fs: number): boolean => fs <= threshold;
    const result = bisectFontSizeToFit(16, fits);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThanOrEqual(threshold);
    expect(result!).toBeGreaterThanOrEqual(threshold - 0.2);
  });

  it("never probes more than 22 times", () => {
    let probes = 0;
    // Adversarial: only sizes below an unreachable-by-0.2 threshold fit.
    const result = bisectFontSizeToFit(100, (fs) => {
      probes++;
      return fs <= 50.000001;
    });
    expect(result).not.toBeNull();
    expect(probes).toBeLessThanOrEqual(22);
  });

  it("returns null when even the lower bound does not fit", () => {
    const result = bisectFontSizeToFit(16, () => false);
    expect(result).toBeNull();
  });

  it("clamps the lower bound at 8px for small fonts", () => {
    // orig 12 → floor is max(8, 6) = 8, so a fit at 8 must be found even
    // though 12/2 = 6 would also "fit" in the model.
    const probed: number[] = [];
    const result = bisectFontSizeToFit(12, (fs) => {
      probed.push(fs);
      return fs <= 8.05;
    });
    expect(result).not.toBeNull();
    expect(Math.min(...probed)).toBeGreaterThanOrEqual(8);
    expect(result!).toBeGreaterThanOrEqual(8);
  });

  it("uses fontSize/2 as the lower bound for large fonts", () => {
    const probed: number[] = [];
    bisectFontSizeToFit(40, (fs) => {
      probed.push(fs);
      return fs <= 21;
    });
    expect(Math.min(...probed)).toBeGreaterThanOrEqual(20);
  });

  it("never returns a size larger than the original", () => {
    const result = bisectFontSizeToFit(16, (fs) => fs <= 15);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThanOrEqual(16);
  });

  it("returns null for a non-finite original size (mixed-range symbol)", () => {
    // TextNode.fontSize is figma.mixed (a symbol coerced to NaN) when ranges
    // differ AND the base was never set — the search must bail to truncation.
    const result = bisectFontSizeToFit(NaN, () => true);
    expect(result).toBeNull();
  });

  it("returns null when the original is already at/below the 8px floor", () => {
    // orig 8 → lower bound 8 == orig; the only candidate already failed.
    const result = bisectFontSizeToFit(8, (fs) => fs < 8);
    expect(result).toBeNull();
  });
});

describe("scaleSegmentRangeFontSizes", () => {
  function fakeNode() {
    const calls: Array<{ start: number; end: number; size: number }> = [];
    return {
      calls,
      setRangeFontSize(start: number, end: number, size: number): void {
        calls.push({ start, end, size });
      },
    };
  }

  it("scales every range by the same factor", () => {
    const node = fakeNode();
    scaleSegmentRangeFontSizes(
      node,
      [
        { start: 0, end: 5, fontSize: 20 },
        { start: 5, end: 12, fontSize: 14 },
      ],
      0.9,
    );
    expect(node.calls).toEqual([
      { start: 0, end: 5, size: 18 },
      { start: 5, end: 12, size: 12.6 },
    ]);
  });

  it("never scales a range below the 8px floor", () => {
    const node = fakeNode();
    scaleSegmentRangeFontSizes(node, [{ start: 0, end: 3, fontSize: 10 }], 0.5);
    expect(node.calls).toEqual([{ start: 0, end: 3, size: 8 }]);
  });

  it("factor 1 restores the recorded sizes verbatim", () => {
    const node = fakeNode();
    scaleSegmentRangeFontSizes(node, [{ start: 2, end: 9, fontSize: 13.5 }], 1);
    expect(node.calls).toEqual([{ start: 2, end: 9, size: 13.5 }]);
  });

  it("does nothing for an empty range list", () => {
    const node = fakeNode();
    scaleSegmentRangeFontSizes(node, [], 0.8);
    expect(node.calls).toEqual([]);
  });
});

describe("protectTrailingSpaces", () => {
  // Figma collapses trailing U+0020 on width-hugging (WIDTH_AND_HEIGHT) text,
  // shrinking the box; h2d rewrites them to U+00A0
  // (main-rawbundle.beautified.js:17634-17637). Same-length replacement so
  // styled-range indices stay valid.
  it("rewrites a single trailing space to NBSP", () => {
    const node = { characters: "Hello " };
    protectTrailingSpaces(node);
    expect(node.characters).toBe("Hello\u00A0");
  });

  it("rewrites every space in a trailing run", () => {
    const node = { characters: "Hello   " };
    protectTrailingSpaces(node);
    expect(node.characters).toBe("Hello\u00A0\u00A0\u00A0");
  });

  it("leaves text without trailing spaces untouched", () => {
    const node = { characters: "Hello" };
    protectTrailingSpaces(node);
    expect(node.characters).toBe("Hello");
  });

  it("preserves internal spaces", () => {
    const node = { characters: "Hello world " };
    protectTrailingSpaces(node);
    expect(node.characters).toBe("Hello world\u00A0");
  });

  it("handles an all-space string", () => {
    const node = { characters: "  " };
    protectTrailingSpaces(node);
    expect(node.characters).toBe("\u00A0\u00A0");
  });

  it("never changes the string length (range indices survive)", () => {
    const node = { characters: "a b  " };
    protectTrailingSpaces(node);
    expect(node.characters.length).toBe(5);
  });
});

describe("TEXT_RESIZE_SLACK", () => {
  it("matches h2d's 0.2px slack", () => {
    expect(TEXT_RESIZE_SLACK).toBe(0.2);
  });
});
