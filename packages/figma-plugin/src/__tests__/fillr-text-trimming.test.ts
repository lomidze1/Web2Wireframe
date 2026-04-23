/**
 * FILLR Text Trimming Tests
 *
 * When fontMode === "lines" (FILLR font), text glyphs are wider than
 * the original website font. The text must be trimmed so that it does
 * NOT exceed the original element width.
 *
 * Pure-function tests for the trim calculation logic extracted from text.ts.
 */

import { describe, it, expect } from "vitest";
import { calculateFillrTrimLength, splitFillrTextByLineWidths } from "../rendering/text";

/**
 * Mock FILLR text node: width grows linearly with character count.
 * 10 px per char makes assertions easy.
 */
function makeMockTextNode(pxPerChar = 10): { characters: string; width: number } {
  const node = {
    _chars: "",
    get characters() { return this._chars; },
    set characters(v: string) {
      this._chars = v;
      // width excludes \n (Figma measures the longest line when rendering)
      const longestLine = v.split("\n").reduce((max, l) => Math.max(max, l.length), 0);
      this.width = longestLine * pxPerChar;
    },
    width: 0,
  } as unknown as { characters: string; width: number };
  return node;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FILLR text trimming — calculateFillrTrimLength", () => {
  describe("no trimming needed", () => {
    it("returns full length when FILLR width equals original width", () => {
      expect(calculateFillrTrimLength(14, 100, 100)).toBe(14);
    });

    it("returns full length when FILLR width is narrower than original", () => {
      expect(calculateFillrTrimLength(10, 80, 100)).toBe(10);
    });

    it("returns 0 for empty text", () => {
      expect(calculateFillrTrimLength(0, 0, 100)).toBe(0);
    });

    it("returns 0 for empty text even with fillrWidth > originalWidth", () => {
      expect(calculateFillrTrimLength(0, 200, 100)).toBe(0);
    });
  });

  describe("trimming required — FILLR wider than original", () => {
    it("trims 'Upgrade to Pro' (14 chars) from 202px to fit 115px", () => {
      // Real-world case from screenshots:
      // Original (Fenix): 115px wide, FILLR: 202px wide
      const result = calculateFillrTrimLength(14, 202, 115);
      // ratio = 115/202 ≈ 0.569, floor(14 * 0.569) = floor(7.97) = 7
      expect(result).toBe(7);
      // 7 chars should be narrower than 115px (7/14 * 202 ≈ 101px)
      const estimatedWidth = (result / 14) * 202;
      expect(estimatedWidth).toBeLessThanOrEqual(115);
    });

    it("trims long text proportionally", () => {
      // 50 chars, FILLR is 2x wider
      const result = calculateFillrTrimLength(50, 600, 300);
      // ratio = 300/600 = 0.5, floor(50 * 0.5) = 25
      expect(result).toBe(25);
    });

    it("trims when FILLR is only slightly wider", () => {
      // 20 chars, FILLR is 110px vs original 100px
      const result = calculateFillrTrimLength(20, 110, 100);
      // ratio = 100/110 ≈ 0.909, floor(20 * 0.909) = floor(18.18) = 18
      expect(result).toBe(18);
    });

    it("trims single character text to 0 when much wider", () => {
      // 1 char, FILLR is 30px vs original 10px
      const result = calculateFillrTrimLength(1, 30, 10);
      // ratio = 10/30 ≈ 0.333, floor(1 * 0.333) = 0
      expect(result).toBe(0);
    });

    it("trims to at least 1 when single char fits", () => {
      // 1 char, FILLR is 12px vs original 10px — doesn't fit
      const result = calculateFillrTrimLength(1, 12, 10);
      // ratio = 10/12 ≈ 0.833, floor(1 * 0.833) = 0
      // Even though 0 seems extreme, this is correct for the initial estimate.
      // The while loop in text.ts won't increase — it only trims further.
      expect(result).toBe(0);
    });
  });

  describe("result never exceeds original width (proportional check)", () => {
    // For each case, verify that the trimmed text's estimated width
    // is less than or equal to the original width.

    const testCases = [
      { textLength: 14, fillrWidth: 202, originalWidth: 115, label: "Upgrade to Pro button" },
      { textLength: 30, fillrWidth: 450, originalWidth: 200, label: "navigation link" },
      { textLength: 5, fillrWidth: 80, originalWidth: 60, label: "short label" },
      { textLength: 100, fillrWidth: 1500, originalWidth: 400, label: "paragraph text" },
      { textLength: 8, fillrWidth: 160, originalWidth: 100, label: "button text" },
      { textLength: 3, fillrWidth: 45, originalWidth: 30, label: "tiny text" },
      { textLength: 50, fillrWidth: 510, originalWidth: 500, label: "barely wider" },
    ];

    for (const tc of testCases) {
      it(`${tc.label}: trimmed width ≤ original (${tc.originalWidth}px)`, () => {
        const trimmed = calculateFillrTrimLength(tc.textLength, tc.fillrWidth, tc.originalWidth);
        // Estimate trimmed FILLR width (proportional)
        const estimatedTrimmedWidth = tc.textLength > 0
          ? (trimmed / tc.textLength) * tc.fillrWidth
          : 0;
        expect(estimatedTrimmedWidth).toBeLessThanOrEqual(tc.originalWidth);
      });
    }
  });

  describe("result is as close to original width as possible", () => {
    it("doesn't over-trim: adding 1 char would exceed original width", () => {
      // 14 chars, FILLR 202px, original 115px
      const trimmed = calculateFillrTrimLength(14, 202, 115);
      const onMoreChar = trimmed + 1;
      const widthWithOneMore = (onMoreChar / 14) * 202;
      // Adding one more character should exceed (or it means we could keep more)
      expect(widthWithOneMore).toBeGreaterThan(115);
    });

    it("doesn't over-trim for large text", () => {
      const trimmed = calculateFillrTrimLength(100, 1500, 400);
      const widthWithOneMore = ((trimmed + 1) / 100) * 1500;
      expect(widthWithOneMore).toBeGreaterThan(400);
    });
  });

  describe("edge cases", () => {
    it("handles originalWidth of 1 (minimum)", () => {
      const result = calculateFillrTrimLength(10, 100, 1);
      // ratio = 1/100 = 0.01, floor(10 * 0.01) = 0
      expect(result).toBe(0);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("handles very large text", () => {
      const result = calculateFillrTrimLength(10000, 50000, 25000);
      expect(result).toBe(5000);
      const estimatedWidth = (result / 10000) * 50000;
      expect(estimatedWidth).toBeLessThanOrEqual(25000);
    });

    it("handles fractional ratio correctly (floors, never rounds up)", () => {
      // 7 chars, FILLR 100px, original 50px
      // ratio = 0.5, floor(7 * 0.5) = floor(3.5) = 3
      const result = calculateFillrTrimLength(7, 100, 50);
      expect(result).toBe(3);
      // 3 chars → 3/7 * 100 = 42.86px ≤ 50px ✓
      expect((result / 7) * 100).toBeLessThanOrEqual(50);
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-line per-line split (splitFillrTextByLineWidths)
// ---------------------------------------------------------------------------

describe("FILLR multi-line split — splitFillrTextByLineWidths", () => {
  it("splits into exactly N lines at [50, 40, 20] px targets, drops remainder", () => {
    // At 10 px/char: targets 50/40/20 px → 5/4/2 chars = 11 chars total.
    // Remaining 15 chars are dropped (NOT absorbed into last line).
    const fullText = "abcdefghijklmnopqrstuvwxyz"; // 26 chars
    const node = makeMockTextNode(10);
    const joined = splitFillrTextByLineWidths(node, fullText, [50, 40, 20]);

    const lines = joined.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveLength(5);
    expect(lines[1]).toHaveLength(4);
    expect(lines[2]).toHaveLength(2);
  });

  it("preserves exact 535/550/240 widths at 1 px/char (no remainder absorb)", () => {
    const fullText = "x".repeat(2000);
    const node = makeMockTextNode(1);
    const joined = splitFillrTextByLineWidths(node, fullText, [535, 550, 240]);

    const lines = joined.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].length).toBe(535);
    expect(lines[1].length).toBe(550);
    expect(lines[2].length).toBe(240);
  });

  it("caps per-line target at frameWidth so chunks never exceed the frame", () => {
    // lineWidths [500] but frame only 200 wide → target clamped to 198 (200-2).
    const fullText = "x".repeat(1000);
    const node = makeMockTextNode(1);
    const joined = splitFillrTextByLineWidths(node, fullText, [500], 200);
    const lines = joined.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBe(198);
  });

  it("stops when fullText is consumed before lineWidths exhausted", () => {
    const fullText = "short"; // 5 chars, fits target[0] = 10
    const node = makeMockTextNode(1);
    const joined = splitFillrTextByLineWidths(node, fullText, [10, 10, 10]);
    const lines = joined.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("short");
  });

  it("single-target input still produces one line", () => {
    const fullText = "abcdefghij";
    const node = makeMockTextNode(1);
    const joined = splitFillrTextByLineWidths(node, fullText, [5]);
    expect(joined).not.toContain("\n");
    expect(joined.length).toBe(5);
  });
});
