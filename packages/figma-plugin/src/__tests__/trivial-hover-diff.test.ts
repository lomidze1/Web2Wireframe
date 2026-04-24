/**
 * Tests for trivial-hover-diff filtering (h2d-parity, Batch 1 + 3).
 *
 * Problem: apple.com-style image cards have `a.tile-link:hover {
 * text-decoration-line: none }` — produces a captured diff whose only
 * change is cosmetic (no visible delta since the base also has no
 * underline). Our old code fell through to a synthetic `opacity: 0.8`
 * fallback → ghost hover variants with false 80% opacity on every
 * hero/tile card. h2d correctly ignores these.
 *
 * New rule:
 *   - Empty diff         → no hover variant
 *   - Cursor-only diff   → no hover variant (marker-only)
 *   - text-decoration-line: none (sole change) → no hover variant
 *   - opacity: 1 (base is 1) → no hover variant
 *   - Real visual diff   → hover variant as before
 *
 * Interactive elements with no real hover get `needsCursorPointer: true`
 * so nodes.ts can attach a self-referencing ON_HOVER reaction — cursor
 * turns into pointer in Figma Preview without a ghost ComponentSet.
 */
import { describe, it, expect } from "vitest";
import { isTrivialHoverDiff } from "../rendering/trivialHoverDiff";

describe("isTrivialHoverDiff", () => {
  it("returns true for empty diff", () => {
    expect(isTrivialHoverDiff({})).toBe(true);
  });

  it("returns true for cursor-only diff", () => {
    expect(isTrivialHoverDiff({ cursor: "pointer" })).toBe(true);
  });

  it("returns true for pointer-events-only diff", () => {
    expect(isTrivialHoverDiff({ "pointer-events": "none" })).toBe(true);
  });

  it("returns true for user-select-only diff", () => {
    expect(isTrivialHoverDiff({ "user-select": "none" })).toBe(true);
  });

  it("returns true when sole change is text-decoration-line: none", () => {
    // apple.com tile-link case: base + hover both have no underline.
    expect(isTrivialHoverDiff({ "text-decoration-line": "none" })).toBe(true);
  });

  it("returns true when sole change is opacity: 1 (no visible delta)", () => {
    expect(isTrivialHoverDiff({ opacity: "1" })).toBe(true);
  });

  it("returns true for a mix of ONLY trivial props", () => {
    expect(
      isTrivialHoverDiff({
        cursor: "pointer",
        "pointer-events": "all",
        "user-select": "none",
      }),
    ).toBe(true);
  });

  it("returns false when opacity changes to < 1", () => {
    expect(isTrivialHoverDiff({ opacity: "0.8" })).toBe(false);
  });

  it("returns false when background-color changes", () => {
    expect(isTrivialHoverDiff({ "background-color": "#ff0000" })).toBe(false);
  });

  it("returns false when text-decoration-line becomes underline", () => {
    expect(isTrivialHoverDiff({ "text-decoration-line": "underline" })).toBe(
      false,
    );
  });

  it("returns false when color changes", () => {
    expect(isTrivialHoverDiff({ color: "rgb(0, 0, 255)" })).toBe(false);
  });

  it("returns false when transform has a meaningful translate", () => {
    expect(isTrivialHoverDiff({ transform: "translateY(-2px)" })).toBe(false);
  });

  it("returns false for a mix of trivial + real change", () => {
    // Real change wins — don't discard the whole diff.
    expect(
      isTrivialHoverDiff({
        cursor: "pointer",
        "background-color": "#ff0000",
      }),
    ).toBe(false);
  });
});
