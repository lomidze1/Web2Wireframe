/**
 * Lorem-Ipsum Line-Count Preservation
 *
 * In lorem ipsum mode, substituted text often renders WIDER than the original
 * (e.g. "Legal" 40.82px → "Lorem" 46.61px in Space Grotesk Bold), causing
 * unwanted wrapping in the Figma render. This test suite covers the
 * `trimLoremToFitLineCount()` helper which trims trailing alphabetic
 * characters until the rendered text fits in `browserLineCount` lines.
 *
 * Width / height / font / dimensions are NOT touched — only `characters`.
 */
import { describe, it, expect } from "vitest";
import { trimLoremToFitLineCount } from "../rendering/text";

// ============================================================================
// Mock TextNode — simulates Figma wrapping deterministically
// ============================================================================

interface MockTextNode {
  characters: string;
  height: number;
  // Internals (not part of Figma API)
  __width: number;        // current frame width
  __charWidthPx: number;  // simulated per-char width
  __lineHeightPx: number; // px per line
}

/**
 * Create a TextNode mock where height = ceil(textWidth / frameWidth) * lineHeight.
 * Setting `characters` recomputes `height` based on simulated wrapping.
 */
function makeMockTextNode(
  initialText: string,
  frameWidth: number,
  charWidthPx: number,
  lineHeightPx: number,
): MockTextNode {
  const recompute = (chars: string): number => {
    if (chars.length === 0) return 0;
    const textWidth = chars.length * charWidthPx;
    const lines = Math.max(1, Math.ceil(textWidth / frameWidth));
    return lines * lineHeightPx;
  };
  const node = {
    __width: frameWidth,
    __charWidthPx: charWidthPx,
    __lineHeightPx: lineHeightPx,
    characters: initialText,
    height: recompute(initialText),
  };
  Object.defineProperty(node, "characters", {
    get(this: MockTextNode) {
      return (this as unknown as { _chars: string })._chars;
    },
    set(this: MockTextNode, v: string) {
      (this as unknown as { _chars: string })._chars = v;
      this.height = recompute(v);
    },
    enumerable: true,
    configurable: true,
  });
  // Trigger setter to initialize
  node.characters = initialText;
  return node as MockTextNode;
}

// ============================================================================
// Tests — direct helper coverage
// ============================================================================

describe("trimLoremToFitLineCount — single-line target", () => {
  it("does NOT trim when text already fits on 1 line", () => {
    // "Lor" at 10px/char in 50px frame = 30px → 1 line ✅
    const node = makeMockTextNode("Lor", 50, 10, 20);
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters).toBe("Lor");
  });

  it("trims one char when text overflows by 1 char", () => {
    // "Lorem" at 10px/char in 42px frame = 50px → 2 lines ❌
    // After trim: "Lore" = 40px → 1 line ✅
    const node = makeMockTextNode("Lorem", 42, 10, 20);
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters).toBe("Lore");
  });

  it("trims multiple chars when text overflows by many", () => {
    // "Loremipsum" 100px in 25px frame = 4 lines ❌
    // After trims: ~"Lor" or "Lo" — should fit in 1 line (≤25px)
    const node = makeMockTextNode("Loremipsum", 25, 10, 20);
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters.length).toBeLessThanOrEqual(2);
    expect(node.height).toBeLessThanOrEqual(20 + 1); // 1 line + tolerance
  });
});

describe("trimLoremToFitLineCount — multi-line target", () => {
  it("does NOT trim when 3-line target accepts 3-line render", () => {
    // 9 chars × 10px = 90px in 30px frame = 3 lines ✅ (target = 3)
    const node = makeMockTextNode("Loremipsu", 30, 10, 20);
    trimLoremToFitLineCount(node, 3, 20);
    expect(node.characters).toBe("Loremipsu");
  });

  it("trims when render exceeds browserLineCount", () => {
    // 12 chars × 10px = 120px in 30px frame = 4 lines, target 3 ❌
    // After trim: should fit ≤3 lines
    const node = makeMockTextNode("Loremipsumdo", 30, 10, 20);
    trimLoremToFitLineCount(node, 3, 20);
    expect(node.height).toBeLessThanOrEqual(60 + 1); // 3 lines + tolerance
  });
});

describe("trimLoremToFitLineCount — edge cases", () => {
  it("preserves non-alphabetic trailing chars; trims alpha before them", () => {
    // "$loremip" — 8 chars × 10px = 80px in 42px = 2 lines ❌
    // Should trim from end-most alpha: "$lorem" then "$lore" then... until fits
    const node = makeMockTextNode("$loremip", 42, 10, 20);
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters.startsWith("$")).toBe(true); // "$" preserved
    expect(node.height).toBeLessThanOrEqual(20 + 1);
  });

  it("never reduces below 1 character", () => {
    // Impossible to fit: each char wider than frame
    const node = makeMockTextNode("Lorem", 5, 10, 20);
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters.length).toBeGreaterThanOrEqual(1);
  });

  it("stops when no alphabetic chars remain to trim", () => {
    // All-symbol input cannot be trimmed via alpha rule
    const node = makeMockTextNode("$$$$$$", 20, 10, 20);
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters).toBe("$$$$$$"); // unchanged
  });

  it("treats height equal to target as OK (no trim)", () => {
    // Exactly fits 1 line
    const node = makeMockTextNode("Lore", 40, 10, 20);
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters).toBe("Lore");
  });

  it("is idempotent — applying twice produces same result", () => {
    const node1 = makeMockTextNode("Loremipsum", 25, 10, 20);
    trimLoremToFitLineCount(node1, 1, 20);
    const firstResult = node1.characters;

    const node2 = makeMockTextNode(firstResult, 25, 10, 20);
    trimLoremToFitLineCount(node2, 1, 20);
    expect(node2.characters).toBe(firstResult);
  });

  it("handles browserLineCount of 1 with 1px height tolerance", () => {
    // height === lineHeightPx + 1 should still pass (tolerance band)
    const node = makeMockTextNode("Lorem", 50, 10, 20);
    // 50 chars width in 50px frame = exactly 1 line (50px width / 50px frame = 1.0)
    trimLoremToFitLineCount(node, 1, 20);
    expect(node.characters).toBe("Lorem"); // exactly fits, no trim
  });
});
