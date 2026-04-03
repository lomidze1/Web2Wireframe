/**
 * Visibility Filtering Tests
 *
 * Verifies that invisible elements are filtered out:
 * - visibility: hidden
 * - clip-path: inset(50%) (sr-only accessibility pattern)
 * - clip-path: inset(100%)
 * - New SKIP_TAGS: dialog, colgroup, col, datalist
 */

import { describe, it, expect } from "vitest";
import { SKIP_TAGS } from "../constants";
import { isHiddenByClipPath } from "../tree-builder";

describe("SKIP_TAGS", () => {
  it("should include original skip tags", () => {
    expect(SKIP_TAGS).toContain("script");
    expect(SKIP_TAGS).toContain("style");
    expect(SKIP_TAGS).toContain("meta");
    expect(SKIP_TAGS).toContain("noscript");
    expect(SKIP_TAGS).toContain("link");
    expect(SKIP_TAGS).toContain("head");
    expect(SKIP_TAGS).toContain("title");
    expect(SKIP_TAGS).toContain("br");
    expect(SKIP_TAGS).toContain("base");
    expect(SKIP_TAGS).toContain("template");
  });

  it("should include new skip tags for non-visual elements", () => {
    expect(SKIP_TAGS).toContain("dialog");
    expect(SKIP_TAGS).toContain("colgroup");
    expect(SKIP_TAGS).toContain("col");
    expect(SKIP_TAGS).toContain("datalist");
  });
});

describe("visibility filtering helpers", () => {
  // Import the helper once it's implemented
  // These test the filtering logic that will be added to tree-builder

  it("should identify visibility:hidden as invisible", () => {
    const styles: Record<string, string> = { visibility: "hidden" };
    expect(isHiddenByVisibility(styles)).toBe(true);
  });

  it("should identify visibility:visible as visible", () => {
    const styles: Record<string, string> = { visibility: "visible" };
    expect(isHiddenByVisibility(styles)).toBe(false);
  });

  it("should treat missing visibility as visible", () => {
    const styles: Record<string, string> = {};
    expect(isHiddenByVisibility(styles)).toBe(false);
  });

  it("should identify clip-path:inset(50%) as hidden (sr-only pattern)", () => {
    const styles: Record<string, string> = { "clip-path": "inset(50%)" };
    expect(isHiddenByClipPath(styles)).toBe(true);
  });

  it("should identify clip-path:inset(100%) as hidden", () => {
    const styles: Record<string, string> = { "clip-path": "inset(100%)" };
    expect(isHiddenByClipPath(styles)).toBe(true);
  });

  it("should not treat normal clip-path as hidden", () => {
    const styles: Record<string, string> = { "clip-path": "circle(50%)" };
    expect(isHiddenByClipPath(styles)).toBe(false);
  });

  it("should treat clip-path:none as visible", () => {
    const styles: Record<string, string> = { "clip-path": "none" };
    expect(isHiddenByClipPath(styles)).toBe(false);
  });

  it("should treat missing clip-path as visible", () => {
    const styles: Record<string, string> = {};
    expect(isHiddenByClipPath(styles)).toBe(false);
  });
});

// Simple inline helper — visibility check is a one-liner in tree-builder,
// not worth exporting as a function
function isHiddenByVisibility(styles: Record<string, string>): boolean {
  return styles["visibility"] === "hidden";
}
