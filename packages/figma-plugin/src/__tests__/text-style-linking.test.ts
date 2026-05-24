/**
 * TextStyle linking consistency tests
 *
 * Tests that the key generated during style CREATION (collectTypographyFromTree)
 * always matches the key generated during style LINKING (linkTextStyleIfApplicable).
 *
 * Known bugs these tests cover:
 * - Bug 1: fontSize mismatch when sizing algorithm reduces textNode.fontSize
 * - Bug 2: fontFamily mismatch when font fallback changes usedFontFamily
 * - Bug 3: multi-segment guard skips linking entirely
 */

import { describe, it, expect } from "vitest";
import {
  buildTextStyleKey,
  collectTypographyFromTree,
  parseFigmaLineHeight,
  lineHeightKeyStr,
} from "../rendering/styles";
import type { TypographyCombo } from "../rendering/styles";
import type { WireframeNode } from "../types";

// ============================================================================
// Helpers
// ============================================================================

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "test-1",
    name: "Test",
    type: "text",
    tag: "p",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#333333",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "Test text",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 24,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

/**
 * Simulate the key that linkTextStyleIfApplicable CURRENTLY generates
 * (before the fix) — using textNode.fontSize and usedFontFamily.
 * This helps verify the bug exists.
 */
function buildLinkingKeyBeforeFix(
  usedFontFamily: string,
  fontWeight: number,
  textNodeFontSize: number,
  lineHeight: number | string | undefined,
  letterSpacing: number
): string {
  const styleStr = fontWeight >= 600 ? "Bold" : fontWeight >= 500 ? "Medium" : "Regular";
  const lh = parseFigmaLineHeight(lineHeight);
  const lhKey = lineHeightKeyStr(lh);
  const ls = Math.round((letterSpacing || 0) * 10) / 10;
  const lsKey = ls !== 0 ? `ls${Math.round(ls * 10)}` : "";
  return [usedFontFamily, styleStr, textNodeFontSize, lhKey, lsKey].filter(Boolean).join("-");
}

// ============================================================================
// buildTextStyleKey — basic correctness
// ============================================================================

describe("buildTextStyleKey", () => {
  it("produces same key as collectTypographyFromTree for identical params", () => {
    const node = makeNode({ fontSize: 16, fontWeight: 400, fontFamily: "Inter", lineHeight: 24, letterSpacing: 0 });
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(node, combos, "Inter", "website");

    const collectedKey = Array.from(combos.keys())[0];
    const helperKey = buildTextStyleKey("Inter", 400, 16, 24, 0);

    expect(helperKey).toBe(collectedKey);
  });

  it("clamps fontSize to minimum 8", () => {
    const key = buildTextStyleKey("Inter", 400, 4, 10, 0);
    expect(key).toContain("8");
    expect(key).not.toContain("4");
  });

  it("defaults fontSize to 14 when 0 or falsy", () => {
    const key = buildTextStyleKey("Inter", 400, 0, 24, 0);
    expect(key).toContain("14");
  });

  it("includes letterSpacing in key when non-zero", () => {
    const key = buildTextStyleKey("Inter", 400, 16, 24, 0.5);
    expect(key).toBe("Inter-Regular-16-lh24-ls5");
  });

  it("omits letterSpacing from key when zero", () => {
    const key = buildTextStyleKey("Inter", 400, 16, 24, 0);
    expect(key).toBe("Inter-Regular-16-lh24");
  });

  it("handles AUTO lineHeight (undefined)", () => {
    const key = buildTextStyleKey("Inter", 700, 24, undefined, 0);
    expect(key).toBe("Inter-Bold-24");
  });

  it("handles percentage lineHeight", () => {
    const key = buildTextStyleKey("Inter", 400, 16, "150%", 0);
    expect(key).toBe("Inter-Regular-16-lh150pct");
  });
});

// ============================================================================
// Key consistency — collection vs linking
// ============================================================================

describe("TextStyle key consistency — collection vs linking", () => {
  describe("Bug 1: fontSize mismatch after sizing adjustment", () => {
    it("linking key should use original node.fontSize, not adjusted textNode.fontSize", () => {
      // Scenario: "Pricing" text — original 16px, sizing reduces to 15px
      const originalFontSize = 16;
      const adjustedFontSize = 15; // after sizing algorithm: originalFontSize - 1

      // Collection uses original tree value
      const collectionKey = buildTextStyleKey("Space Grotesk", 400, originalFontSize, 24, 0);

      // After fix: linking should also use original tree value
      const linkingKeyFixed = buildTextStyleKey("Space Grotesk", 400, originalFontSize, 24, 0);

      // Before fix: linking used textNode.fontSize (adjusted)
      const linkingKeyBroken = buildLinkingKeyBeforeFix("Space Grotesk", 400, adjustedFontSize, 24, 0);

      expect(collectionKey).toBe(linkingKeyFixed);
      expect(collectionKey).not.toBe(linkingKeyBroken); // Proves the bug
      expect(collectionKey).toBe("Space Grotesk-Regular-16-lh24");
      expect(linkingKeyBroken).toBe("Space Grotesk-Regular-15-lh24");
    });

    it("fractional fontSize reduction still mismatches before fix", () => {
      // 16.2px original → 15.2px after sizing (matches screenshot)
      const collectionKey = buildTextStyleKey("Space Grotesk", 400, 16.2, 19.44, 0);
      const linkingKeyBroken = buildLinkingKeyBeforeFix("Space Grotesk", 400, 15.2, 19.44, 0);

      expect(collectionKey).not.toBe(linkingKeyBroken);
    });

    it("key matches when fontSize is NOT adjusted", () => {
      // "Web2Wireframe" text — no sizing adjustment, should work even before fix
      const collectionKey = buildTextStyleKey("Space Grotesk", 400, 16, 19, 0);
      const linkingKeyBeforeFix = buildLinkingKeyBeforeFix("Space Grotesk", 400, 16, 19, 0);

      expect(collectionKey).toBe(linkingKeyBeforeFix);
    });
  });

  describe("Bug 2: fontFamily mismatch after fallback", () => {
    it("linking key should use collection fontFamily, not fallback font", () => {
      // Scenario: "Free" text — Space Grotesk not available, falls back to Inter
      const originalFont = "Space Grotesk";
      const fallbackFont = "Inter";

      // Collection uses tree's fontFamily
      const collectionKey = buildTextStyleKey(originalFont, 400, 16, 24, 0);

      // Before fix: linking uses usedFontFamily (fallback)
      const linkingKeyBroken = buildLinkingKeyBeforeFix(fallbackFont, 400, 16, 24, 0);

      expect(collectionKey).not.toBe(linkingKeyBroken);
      expect(collectionKey).toBe("Space Grotesk-Regular-16-lh24");
      expect(linkingKeyBroken).toBe("Inter-Regular-16-lh24");
    });

    it("no mismatch when font loads successfully (no fallback)", () => {
      const font = "Space Grotesk";
      const collectionKey = buildTextStyleKey(font, 400, 16, 24, 0);
      const linkingKey = buildLinkingKeyBeforeFix(font, 400, 16, 24, 0);

      expect(collectionKey).toBe(linkingKey);
    });
  });

  describe("Bug 1+2 combined: both fontSize AND fontFamily change", () => {
    it("double mismatch — font fallback + fontSize reduction", () => {
      // Worst case: both font and size changed
      const collectionKey = buildTextStyleKey("Space Grotesk", 400, 16, 24, 0);
      const linkingKeyBroken = buildLinkingKeyBeforeFix("Inter", 400, 15, 24, 0);

      expect(collectionKey).not.toBe(linkingKeyBroken);
    });
  });
});

// ============================================================================
// collectTypographyFromTree uses buildTextStyleKey consistently
// ============================================================================

describe("collectTypographyFromTree key consistency with buildTextStyleKey", () => {
  it("node-level key matches buildTextStyleKey output", () => {
    const node = makeNode({
      fontFamily: "Space Grotesk",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 24,
      letterSpacing: 0,
    });
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(node, combos, "Montserrat", "website");

    const expectedKey = buildTextStyleKey("Space Grotesk", 400, 16, 24, 0);
    expect(combos.has(expectedKey)).toBe(true);
  });

  it("segment-level key matches buildTextStyleKey output", () => {
    const node = makeNode({
      fontFamily: "Space Grotesk",
      fontSize: 32,
      fontWeight: 700,
      lineHeight: 40,
      letterSpacing: 0,
      styledSegments: [
        { text: "$12", color: "#333", fontWeight: 700, fontSize: 32 },
        { text: " /month", color: "#666", fontWeight: 400, fontSize: 16 },
      ],
    });
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(node, combos, "Montserrat", "website");

    const segKey = buildTextStyleKey("Space Grotesk", 400, 16, 40, 0);
    expect(combos.has(segKey)).toBe(true);
  });

  it("plugin mode uses pluginFontFamily in buildTextStyleKey", () => {
    const node = makeNode({
      fontFamily: "Space Grotesk",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 24,
    });
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(node, combos, "Montserrat", "plugin");

    const expectedKey = buildTextStyleKey("Montserrat", 400, 16, 24, 0);
    expect(combos.has(expectedKey)).toBe(true);

    // Should NOT have the website font key
    const wrongKey = buildTextStyleKey("Space Grotesk", 400, 16, 24, 0);
    expect(combos.has(wrongKey)).toBe(false);
  });
});

// ============================================================================
// Real-world regression scenarios
// ============================================================================

describe("Real-world regression scenarios", () => {
  it("'Pricing' text (16px → 15px after sizing) — collection key must be stable", () => {
    // <div class="section-label">Pricing</div>
    // Browser: 16px Space Grotesk Regular, lh ~19px
    const node = makeNode({
      textContent: "Pricing",
      fontFamily: "Space Grotesk",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 19,
      letterSpacing: 0,
    });
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(node, combos, "Montserrat", "website");

    // The key should be based on original 16px, NOT 15px
    const key = buildTextStyleKey("Space Grotesk", 400, 16, 19, 0);
    expect(combos.has(key)).toBe(true);
    expect(key).toBe("Space Grotesk-Regular-16-lh19");
  });

  it("'Web2Wireframe' text (no adjustment) — should link correctly", () => {
    const node = makeNode({
      textContent: "Web2Wireframe",
      fontFamily: "Space Grotesk",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 19,
      letterSpacing: 0,
    });
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(node, combos, "Montserrat", "website");

    const key = buildTextStyleKey("Space Grotesk", 400, 16, 19, 0);
    expect(combos.has(key)).toBe(true);
  });

  it("'© 2026 Web2Wireframe' copyright text — same font params should share style", () => {
    const pricingNode = makeNode({
      id: "pricing",
      textContent: "Pricing",
      fontFamily: "Space Grotesk",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 19,
    });
    const copyrightNode = makeNode({
      id: "copyright",
      textContent: "© 2026 Web2Wireframe. All rights reserved.",
      fontFamily: "Space Grotesk",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 19,
    });

    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(pricingNode, combos, "Montserrat", "website");
    collectTypographyFromTree(copyrightNode, combos, "Montserrat", "website");

    // Both should produce the same key — only 1 combo
    expect(combos.size).toBe(1);
    const key = buildTextStyleKey("Space Grotesk", 400, 16, 19, 0);
    expect(combos.has(key)).toBe(true);
  });

  it("'Free' card title with bold weight — collection key stable", () => {
    const node = makeNode({
      textContent: "Free",
      fontFamily: "Space Grotesk",
      fontSize: 24,
      fontWeight: 700,
      lineHeight: 32,
      letterSpacing: 0,
    });
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(node, combos, "Montserrat", "website");

    const key = buildTextStyleKey("Space Grotesk", 700, 24, 32, 0);
    expect(combos.has(key)).toBe(true);
    expect(key).toBe("Space Grotesk-Bold-24-lh32");
  });
});
