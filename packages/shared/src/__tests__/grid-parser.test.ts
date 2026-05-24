/**
 * Tests for CSS Grid template parser.
 * Converts CSS computed grid-template-columns/rows to Figma GridTrackSize[].
 */
import { describe, it, expect } from "vitest";
import {
  parseGridTemplate,
  parseTrackValue,
  getGridSpan,
  parseGridLineIndex,
} from "../grid-parser";

describe("parseTrackValue", () => {
  it("parses fr units", () => {
    expect(parseTrackValue("1fr")).toEqual({ type: "FLEX", value: 1 });
    expect(parseTrackValue("2fr")).toEqual({ type: "FLEX", value: 2 });
    expect(parseTrackValue("0.5fr")).toEqual({ type: "FLEX", value: 0.5 });
  });

  it("parses px values", () => {
    expect(parseTrackValue("200px")).toEqual({ type: "FIXED", value: 200 });
    expect(parseTrackValue("56px")).toEqual({ type: "FIXED", value: 56 });
    // 0px is not valid for FIXED tracks in Figma, falls back to FLEX
    expect(parseTrackValue("0px")).toEqual({ type: "FLEX", value: 1 });
  });

  it("parses auto as FLEX", () => {
    expect(parseTrackValue("auto")).toEqual({ type: "FLEX", value: 1 });
  });

  it("parses minmax using max value (fr)", () => {
    expect(parseTrackValue("minmax(0px, 1fr)")).toEqual({ type: "FLEX", value: 1 });
  });

  it("parses minmax using max value (px)", () => {
    expect(parseTrackValue("minmax(100px, 300px)")).toEqual({ type: "FIXED", value: 300 });
  });

  it("parses minmax with auto max as FLEX", () => {
    expect(parseTrackValue("minmax(200px, auto)")).toEqual({ type: "FLEX", value: 1 });
  });

  it("parses fit-content", () => {
    expect(parseTrackValue("fit-content(200px)")).toEqual({ type: "FIXED", value: 200 });
  });

  it("parses percentage values as FIXED (assuming 1440px container)", () => {
    // Percentages in computed styles are already resolved to px
    // but if raw percent comes through, treat as FLEX fallback
    expect(parseTrackValue("50%")).toEqual({ type: "FLEX", value: 1 });
  });

  it("parses bare numbers as px", () => {
    expect(parseTrackValue("200")).toEqual({ type: "FIXED", value: 200 });
  });
});

describe("parseGridTemplate", () => {
  // Basic values
  it("parses single fr unit", () => {
    expect(parseGridTemplate("1fr")).toEqual([{ type: "FLEX", value: 1 }]);
  });

  it("parses multiple fr units", () => {
    expect(parseGridTemplate("1fr 2fr 1fr")).toEqual([
      { type: "FLEX", value: 1 },
      { type: "FLEX", value: 2 },
      { type: "FLEX", value: 1 },
    ]);
  });

  it("parses px values", () => {
    expect(parseGridTemplate("200px 300px")).toEqual([
      { type: "FIXED", value: 200 },
      { type: "FIXED", value: 300 },
    ]);
  });

  it("parses mixed units", () => {
    expect(parseGridTemplate("56px 1fr 52px")).toEqual([
      { type: "FIXED", value: 56 },
      { type: "FLEX", value: 1 },
      { type: "FIXED", value: 52 },
    ]);
  });

  // repeat()
  it("expands repeat(N, val)", () => {
    expect(parseGridTemplate("repeat(3, 1fr)")).toEqual([
      { type: "FLEX", value: 1 },
      { type: "FLEX", value: 1 },
      { type: "FLEX", value: 1 },
    ]);
  });

  it("expands repeat with px", () => {
    expect(parseGridTemplate("repeat(4, 250px)")).toEqual([
      { type: "FIXED", value: 250 },
      { type: "FIXED", value: 250 },
      { type: "FIXED", value: 250 },
      { type: "FIXED", value: 250 },
    ]);
  });

  it("handles repeat mixed with other values", () => {
    expect(parseGridTemplate("100px repeat(2, 1fr) 100px")).toEqual([
      { type: "FIXED", value: 100 },
      { type: "FLEX", value: 1 },
      { type: "FLEX", value: 1 },
      { type: "FIXED", value: 100 },
    ]);
  });

  it("handles repeat with multiple track values", () => {
    expect(parseGridTemplate("repeat(2, 100px 1fr)")).toEqual([
      { type: "FIXED", value: 100 },
      { type: "FLEX", value: 1 },
      { type: "FIXED", value: 100 },
      { type: "FLEX", value: 1 },
    ]);
  });

  // auto
  it("parses auto as FLEX", () => {
    expect(parseGridTemplate("auto")).toEqual([{ type: "FLEX", value: 1 }]);
  });

  it("parses auto auto auto", () => {
    const result = parseGridTemplate("auto auto auto");
    expect(result).toHaveLength(3);
    expect(result.every((t) => t.type === "FLEX")).toBe(true);
  });

  // minmax
  it("parses minmax in template", () => {
    expect(parseGridTemplate("minmax(0px, 1fr) minmax(0px, 1fr) minmax(0px, 1fr)")).toEqual([
      { type: "FLEX", value: 1 },
      { type: "FLEX", value: 1 },
      { type: "FLEX", value: 1 },
    ]);
  });

  // Edge cases
  it("returns empty for 'none'", () => {
    expect(parseGridTemplate("none")).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(parseGridTemplate("")).toEqual([]);
  });

  it("returns empty for undefined", () => {
    expect(parseGridTemplate(undefined as unknown as string)).toEqual([]);
  });

  it("returns empty for null", () => {
    expect(parseGridTemplate(null as unknown as string)).toEqual([]);
  });

  // Real-world computed values (already resolved by browser)
  it("parses resolved auto-fill (4 fixed columns)", () => {
    const result = parseGridTemplate("250px 250px 250px 250px");
    expect(result).toHaveLength(4);
    expect(result.every((t) => t.type === "FIXED" && t.value === 250)).toBe(true);
  });

  it("parses Tesla layout: 211px 211px 211px", () => {
    expect(parseGridTemplate("211px 211px 211px")).toEqual([
      { type: "FIXED", value: 211 },
      { type: "FIXED", value: 211 },
      { type: "FIXED", value: 211 },
    ]);
  });

  it("parses Tesla full-page layout: 56px 1fr 52px", () => {
    expect(parseGridTemplate("56px 1fr 52px")).toEqual([
      { type: "FIXED", value: 56 },
      { type: "FLEX", value: 1 },
      { type: "FIXED", value: 52 },
    ]);
  });

  // Computed values with sub-pixel precision
  it("handles sub-pixel px values", () => {
    expect(parseGridTemplate("339.07px 339.07px 339.07px")).toEqual([
      { type: "FIXED", value: 339.07 },
      { type: "FIXED", value: 339.07 },
      { type: "FIXED", value: 339.07 },
    ]);
  });

  // Named grid lines (should be ignored, only values matter)
  it("ignores named grid lines in brackets", () => {
    expect(parseGridTemplate("[start] 1fr [middle] 1fr [end]")).toEqual([
      { type: "FLEX", value: 1 },
      { type: "FLEX", value: 1 },
    ]);
  });
});

describe("getGridSpan", () => {
  it("computes span from start and end", () => {
    expect(getGridSpan(1, 3)).toBe(2);
    expect(getGridSpan(2, 4)).toBe(2);
    expect(getGridSpan(1, 4)).toBe(3);
  });

  it("returns 1 when start equals end", () => {
    expect(getGridSpan(1, 1)).toBe(1);
  });

  it("returns 1 for undefined values", () => {
    expect(getGridSpan(undefined, undefined)).toBe(1);
    expect(getGridSpan(1, undefined)).toBe(1);
    expect(getGridSpan(undefined, 3)).toBe(1);
  });

  it("returns 1 for auto (0) values", () => {
    expect(getGridSpan(0, 0)).toBe(1);
  });
});

describe("parseGridLineIndex", () => {
  it("parses '1' to 0-based index 0", () => {
    expect(parseGridLineIndex("1")).toBe(0);
  });

  it("parses '3' to 0-based index 2", () => {
    expect(parseGridLineIndex("3")).toBe(2);
  });

  it("returns -1 for 'auto'", () => {
    expect(parseGridLineIndex("auto")).toBe(-1);
  });

  it("returns -1 for undefined", () => {
    expect(parseGridLineIndex(undefined)).toBe(-1);
  });

  it("returns -1 for empty string", () => {
    expect(parseGridLineIndex("")).toBe(-1);
  });
});
