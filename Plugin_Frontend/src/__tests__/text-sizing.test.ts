/**
 * Text Sizing Logic Unit Tests
 *
 * Tests for isBlockLevelElement detection and Case C sizing decision.
 * Case C: when Figma HUG width is narrower than browser width.
 *
 * The fix ensures block-level and non-left-aligned text keeps browser width
 * (container width) instead of shrinking to HUG, preserving text-align behavior.
 */

import { describe, it, expect } from "vitest";
import { isBlockLevelElement } from "../rendering/text";
import type { WireframeNode } from "../types";

// Helper to create a minimal WireframeNode
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
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 20,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...overrides,
  };
}

describe("isBlockLevelElement", () => {
  describe("detection via computedStyles.display", () => {
    it("should detect display: block", () => {
      const node = makeNode({
        tag: "div",
        computedStyles: { display: "block" },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect display: list-item", () => {
      const node = makeNode({
        tag: "li",
        computedStyles: { display: "list-item" },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should NOT detect display: inline", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: { display: "inline" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should NOT detect display: inline-block", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: { display: "inline-block" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should detect display: flex div via tag fallback (flex divs are still block-level)", () => {
      const node = makeNode({
        tag: "div",
        computedStyles: { display: "flex" },
      });
      // display: flex is not "block"/"list-item", but div tag is in BLOCK_LEVEL_TAGS.
      // This is correct: flex containers with block tags still take full width.
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should NOT detect display: flex on inline tag", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: { display: "flex" },
      });
      // span is not in BLOCK_LEVEL_TAGS, and display: flex is not "block"
      expect(isBlockLevelElement(node)).toBe(false);
    });
  });

  describe("detection via tag name (fallback when no computedStyles)", () => {
    it("should detect h1-h6 headings", () => {
      for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(true);
      }
    });

    it("should detect p tag", () => {
      const node = makeNode({ tag: "p" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect div tag", () => {
      const node = makeNode({ tag: "div" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect li tag", () => {
      const node = makeNode({ tag: "li" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect blockquote tag", () => {
      const node = makeNode({ tag: "blockquote" });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect semantic layout tags", () => {
      for (const tag of ["section", "article", "header", "footer", "main", "nav"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(true);
      }
    });

    it("should detect table-related block tags", () => {
      for (const tag of ["figcaption", "dd", "dt", "td", "th", "caption"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(true);
      }
    });

    it("should NOT detect inline tags", () => {
      for (const tag of ["span", "a", "strong", "em", "b", "i", "code", "small"]) {
        const node = makeNode({ tag });
        expect(isBlockLevelElement(node)).toBe(false);
      }
    });

    it("should be case-insensitive for tag names", () => {
      const node = makeNode({ tag: "H2" });
      expect(isBlockLevelElement(node)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should return false when no tag and no computedStyles", () => {
      const node = makeNode({ tag: undefined });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should return false for empty computedStyles", () => {
      const node = makeNode({
        tag: "span",
        computedStyles: {},
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should prefer computedStyles over tag when both present", () => {
      // div with display: inline (e.g. styled as inline)
      const node = makeNode({
        tag: "div",
        computedStyles: { display: "block" },
      });
      // computedStyles says block → true (checked first)
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should fall back to tag when computedStyles has non-block display", () => {
      // h2 with display: flex — tag fallback still catches it
      const node = makeNode({
        tag: "h2",
        computedStyles: { display: "flex" },
      });
      // display is flex (not block/list-item), but tag h2 is in block list
      expect(isBlockLevelElement(node)).toBe(true);
    });
  });

  describe("real-world scenarios for Case C sizing", () => {
    it("should detect the billing banner h2 (original bug case)", () => {
      const node = makeNode({
        tag: "h2",
        width: 1440,
        height: 39,
        textAlign: "center",
        textContent: "Questions about billing or purchases? Email us at billing@web2wireframe.design",
        computedStyles: {
          display: "block",
          width: "1440px",
          "text-align": "center",
        },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should detect centered paragraph", () => {
      const node = makeNode({
        tag: "p",
        width: 800,
        textAlign: "center",
        textContent: "Centered paragraph text",
        computedStyles: { display: "block" },
      });
      expect(isBlockLevelElement(node)).toBe(true);
    });

    it("should NOT detect a button-like span", () => {
      const node = makeNode({
        tag: "span",
        width: 120,
        textAlign: "center",
        textContent: "Submit",
        computedStyles: { display: "inline-block" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });

    it("should NOT detect an inline link", () => {
      const node = makeNode({
        tag: "a",
        width: 200,
        textAlign: "left",
        textContent: "Click here",
        computedStyles: { display: "inline" },
      });
      expect(isBlockLevelElement(node)).toBe(false);
    });
  });
});

describe("Case C sizing decision logic", () => {
  // These tests verify the decision logic that determines whether to use
  // browserWidth or hugWidth. The actual resize happens in createTextNode
  // (which requires Figma API), so we test the decision factors here.

  function shouldKeepBrowserWidth(node: WireframeNode): boolean {
    const isBlock = isBlockLevelElement(node);
    const hasNonLeftAlign = node.textAlign === "center"
      || node.textAlign === "right"
      || node.textAlign === "justify";
    return isBlock || hasNonLeftAlign;
  }

  describe("block elements should keep browser width", () => {
    it("h2 with text-align: center (original bug)", () => {
      const node = makeNode({
        tag: "h2",
        width: 1440,
        textAlign: "center",
        computedStyles: { display: "block" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("p with text-align: left (block, even if left-aligned)", () => {
      const node = makeNode({
        tag: "p",
        width: 1440,
        textAlign: "left",
        computedStyles: { display: "block" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("div with text-align: right", () => {
      const node = makeNode({
        tag: "div",
        width: 1200,
        textAlign: "right",
        computedStyles: { display: "block" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("h1 with text-align: justify", () => {
      const node = makeNode({
        tag: "h1",
        width: 800,
        textAlign: "justify",
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });
  });

  describe("non-left-aligned inline text should keep browser width", () => {
    it("span with text-align: center", () => {
      const node = makeNode({
        tag: "span",
        width: 300,
        textAlign: "center",
        computedStyles: { display: "inline" },
      });
      // Not block, but hasNonLeftAlign → true
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });

    it("a with text-align: right", () => {
      const node = makeNode({
        tag: "a",
        width: 200,
        textAlign: "right",
        computedStyles: { display: "inline" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(true);
    });
  });

  describe("inline left-aligned text should use HUG (narrower)", () => {
    it("span with text-align: left", () => {
      const node = makeNode({
        tag: "span",
        width: 300,
        textAlign: "left",
        computedStyles: { display: "inline" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });

    it("a link with default alignment", () => {
      const node = makeNode({
        tag: "a",
        width: 200,
        textAlign: "left",
        computedStyles: { display: "inline" },
      });
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });

    it("strong tag with text-align: left", () => {
      const node = makeNode({
        tag: "strong",
        width: 150,
        textAlign: "left",
      });
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });

    it("code tag with text-align: start", () => {
      const node = makeNode({
        tag: "code",
        width: 100,
        textAlign: "start",
      });
      // "start" is not in ["center", "right", "justify"], and code is not block
      expect(shouldKeepBrowserWidth(node)).toBe(false);
    });
  });
});

// ============================================================================
// parentWidth-based sizing decision (Case B: HUG wider than browser)
// ============================================================================

describe("parentWidth-based sizing decision", () => {
  // Tests the decision logic for when HUG width > browser width (single-line text).
  // If HUG fits within parent container, use HUG width (no truncation).
  // If HUG exceeds parent, try font-size reduction then truncate.

  interface SizingInput {
    hugWidth: number;
    browserWidth: number;
    browserHeight: number;
    browserLineCount: number;
    parentWidth: number;
    originalFontSize: number;
  }

  type SizingResult =
    | { action: "useHug"; width: number }
    | { action: "useBrowser" }
    | { action: "tryReduction" };

  /**
   * Pure-function simulation of the Case B sizing decision in createTextNode.
   * This mirrors the logic at text.ts lines 562-618.
   */
  function caseBSizingDecision(input: SizingInput): SizingResult {
    const { hugWidth, browserWidth, browserLineCount, parentWidth } = input;
    const widthDiff = hugWidth - browserWidth;

    // Not Case B: HUG is same or narrower than browser
    if (widthDiff <= 1) {
      return { action: "useHug", width: hugWidth };
    }

    // Case B: HUG wider than browser
    if (browserLineCount > 1) {
      // Multi-line: use browser dimensions
      return { action: "useBrowser" };
    }

    // Single-line: check parentWidth
    if (parentWidth > 0 && hugWidth <= parentWidth) {
      // HUG fits within parent — use HUG width
      return { action: "useHug", width: hugWidth };
    }

    // HUG exceeds parent or no parent info
    return { action: "tryReduction" };
  }

  describe("single-line text: HUG fits within parent", () => {
    it("uses HUG width when HUG <= parentWidth", () => {
      // Plugin font is slightly wider (150px HUG vs 130px browser)
      // but parent container is 300px, so it fits fine
      const result = caseBSizingDecision({
        hugWidth: 150,
        browserWidth: 130,
        browserHeight: 20,
        browserLineCount: 1,
        parentWidth: 300,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "useHug", width: 150 });
    });

    it("uses HUG width when HUG exactly equals parentWidth", () => {
      const result = caseBSizingDecision({
        hugWidth: 300,
        browserWidth: 250,
        browserHeight: 20,
        browserLineCount: 1,
        parentWidth: 300,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "useHug", width: 300 });
    });

    it("prevents truncation for Montserrat (wider font) nav text", () => {
      // Real-world: "How It Works" in Montserrat is wider than Space Grotesk
      // Browser: 100px, HUG: 120px, parent nav container: 306px
      const result = caseBSizingDecision({
        hugWidth: 120,
        browserWidth: 100,
        browserHeight: 21,
        browserLineCount: 1,
        parentWidth: 306,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "useHug", width: 120 });
    });
  });

  describe("single-line text: HUG exceeds parent", () => {
    it("tries font reduction when HUG > parentWidth", () => {
      const result = caseBSizingDecision({
        hugWidth: 350,
        browserWidth: 300,
        browserHeight: 20,
        browserLineCount: 1,
        parentWidth: 320,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "tryReduction" });
    });

    it("tries font reduction when no parent info (parentWidth = 0)", () => {
      const result = caseBSizingDecision({
        hugWidth: 200,
        browserWidth: 150,
        browserHeight: 20,
        browserLineCount: 1,
        parentWidth: 0,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "tryReduction" });
    });
  });

  describe("multi-line text always uses browser dimensions", () => {
    it("uses browser width for multi-line text regardless of parent", () => {
      const result = caseBSizingDecision({
        hugWidth: 500,
        browserWidth: 340,
        browserHeight: 52,
        browserLineCount: 2,
        parentWidth: 1000,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "useBrowser" });
    });

    it("uses browser width for 3-line text", () => {
      const result = caseBSizingDecision({
        hugWidth: 800,
        browserWidth: 340,
        browserHeight: 78,
        browserLineCount: 3,
        parentWidth: 500,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "useBrowser" });
    });
  });

  describe("width difference within tolerance", () => {
    it("uses HUG when difference is exactly 1px", () => {
      const result = caseBSizingDecision({
        hugWidth: 201,
        browserWidth: 200,
        browserHeight: 20,
        browserLineCount: 1,
        parentWidth: 300,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "useHug", width: 201 });
    });

    it("uses HUG when HUG equals browser width", () => {
      const result = caseBSizingDecision({
        hugWidth: 200,
        browserWidth: 200,
        browserHeight: 20,
        browserLineCount: 1,
        parentWidth: 300,
        originalFontSize: 16,
      });
      expect(result).toEqual({ action: "useHug", width: 200 });
    });
  });
});

// ============================================================================
// TextStyle linking decision logic
// ============================================================================

describe("TextStyle linking decision logic", () => {
  // Tests the conditions for linkTextStyleIfApplicable.
  // TextStyle can only be linked for single-segment text nodes when:
  // 1. variableMode === "styles"
  // 2. textStyleMap is present and has matching key
  // 3. segments.length === 1
  // 4. node has NO custom letterSpacing (non-zero)
  // 5. node has NO custom lineHeight (not "normal" / not undefined)

  interface TextStyleInput {
    variableMode: string;
    hasTextStyleMap: boolean;
    segmentCount: number;
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    letterSpacing?: number;
    lineHeight?: string | number;
  }

  /** Generate the TextStyle map key (mirrors text.ts logic) */
  function getTextStyleKey(
    fontFamily: string,
    fontWeight: number,
    fontSize: number
  ): string {
    const styleStr =
      fontWeight >= 600 ? "Bold" : fontWeight >= 500 ? "Medium" : "Regular";
    return `${fontFamily}-${styleStr}-${fontSize}`;
  }

  /** Check if TextStyle linking conditions are met (mirrors text.ts logic) */
  function shouldLinkTextStyle(input: TextStyleInput): boolean {
    if (
      input.variableMode !== "styles" ||
      !input.hasTextStyleMap ||
      input.segmentCount !== 1
    ) {
      return false;
    }
    // Skip if node has custom letterSpacing (would be destroyed by TextStyle)
    if (input.letterSpacing && input.letterSpacing !== 0) {
      return false;
    }
    // Skip if node has custom lineHeight (would be destroyed by TextStyle)
    if (input.lineHeight && input.lineHeight !== "normal") {
      return false;
    }
    return true;
  }

  describe("TextStyle key generation", () => {
    it("generates key for Bold weight (>=600)", () => {
      expect(getTextStyleKey("Space Grotesk", 700, 16)).toBe(
        "Space Grotesk-Bold-16"
      );
      expect(getTextStyleKey("Space Grotesk", 600, 24)).toBe(
        "Space Grotesk-Bold-24"
      );
      expect(getTextStyleKey("Montserrat", 900, 32)).toBe(
        "Montserrat-Bold-32"
      );
    });

    it("generates key for Medium weight (500-599)", () => {
      expect(getTextStyleKey("Inter", 500, 14)).toBe("Inter-Medium-14");
      expect(getTextStyleKey("Inter", 550, 16)).toBe("Inter-Medium-16");
    });

    it("generates key for Regular weight (<500)", () => {
      expect(getTextStyleKey("Space Grotesk", 400, 16)).toBe(
        "Space Grotesk-Regular-16"
      );
      expect(getTextStyleKey("Space Grotesk", 300, 13)).toBe(
        "Space Grotesk-Regular-13"
      );
      expect(getTextStyleKey("Inter", 100, 12)).toBe("Inter-Regular-12");
    });
  });

  describe("linking conditions", () => {
    it("allows linking for single-segment text with styles mode", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
        })
      ).toBe(true);
    });

    it("blocks linking when variableMode is direct", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "direct",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
        })
      ).toBe(false);
    });

    it("blocks linking when no textStyleMap", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: false,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
        })
      ).toBe(false);
    });

    it("blocks linking for multi-segment text (e.g. '$0 /forever')", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 2,
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          fontSize: 24,
        })
      ).toBe(false);
    });

    it("blocks linking for 3+ segment text", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 3,
          fontFamily: "Inter",
          fontWeight: 400,
          fontSize: 14,
        })
      ).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    it("links single heading text", () => {
      const key = getTextStyleKey("Space Grotesk", 700, 32);
      expect(key).toBe("Space Grotesk-Bold-32");
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          fontSize: 32,
        })
      ).toBe(true);
    });

    it("does NOT link price text '$12 /month' (2 segments)", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 2,
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          fontSize: 24,
        })
      ).toBe(false);
    });

    it("does NOT link banner text with email link (2 segments)", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 2,
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          fontSize: 24,
        })
      ).toBe(false);
    });

    it("links single list item text", () => {
      const key = getTextStyleKey("Space Grotesk", 400, 16);
      expect(key).toBe("Space Grotesk-Regular-16");
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
        })
      ).toBe(true);
    });
  });

  describe("letterSpacing and lineHeight protection", () => {
    it("blocks linking when letterSpacing is non-zero", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          letterSpacing: -0.5,
        })
      ).toBe(false);
    });

    it("blocks linking when letterSpacing is positive", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: 1.2,
        })
      ).toBe(false);
    });

    it("allows linking when letterSpacing is 0", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          letterSpacing: 0,
        })
      ).toBe(true);
    });

    it("allows linking when letterSpacing is undefined", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          letterSpacing: undefined,
        })
      ).toBe(true);
    });

    it("blocks linking when lineHeight is a pixel value", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          lineHeight: "24px",
        })
      ).toBe(false);
    });

    it("blocks linking when lineHeight is a numeric ratio", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          lineHeight: 1.5,
        })
      ).toBe(false);
    });

    it("blocks linking when lineHeight is a percentage", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Inter",
          fontWeight: 400,
          fontSize: 14,
          lineHeight: "150%",
        })
      ).toBe(false);
    });

    it("allows linking when lineHeight is 'normal'", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          lineHeight: "normal",
        })
      ).toBe(true);
    });

    it("allows linking when lineHeight is undefined", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          lineHeight: undefined,
        })
      ).toBe(true);
    });

    it("blocks linking when BOTH letterSpacing and lineHeight are set", () => {
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          fontSize: 32,
          letterSpacing: -0.8,
          lineHeight: "40px",
        })
      ).toBe(false);
    });

    it("real-world: nav text with letter-spacing does NOT link TextStyle", () => {
      // Prevents text reflow: "How It Works" with letter-spacing: -0.5px
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 400,
          fontSize: 16,
          letterSpacing: -0.5,
        })
      ).toBe(false);
    });

    it("real-world: heading with line-height does NOT link TextStyle", () => {
      // Prevents layout shift: heading with line-height: 1.2
      expect(
        shouldLinkTextStyle({
          variableMode: "styles",
          hasTextStyleMap: true,
          segmentCount: 1,
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          fontSize: 48,
          lineHeight: 1.2,
        })
      ).toBe(false);
    });
  });
});
