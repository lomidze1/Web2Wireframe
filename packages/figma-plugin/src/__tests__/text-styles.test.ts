/**
 * TextStyle creation & linking tests
 *
 * Tests:
 * - collectTypographyFromTree collects styledSegments combos (Fix 1)
 * - Naming convention: W2W/-- prefix + collision-based lh (Fix 3)
 * - fontWeightToStyle mapping
 */

import { describe, it, expect } from "vitest";
import {
  collectTypographyFromTree,
  fontWeightToStyle,
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
 * Replicate the collision-based naming logic from createTextStyles.
 * This mirrors the exact algorithm used in styles.ts for generating display names.
 */
function buildTextStyleNames(
  combos: Map<string, TypographyCombo>,
  prefix: "W2W" | "WEB"
): Map<string, string> {
  const result = new Map<string, string>();

  // Detect lineHeight collisions
  const baseKeyLhMap = new Map<string, Set<string>>();
  for (const combo of combos.values()) {
    const s = fontWeightToStyle(combo.fontWeight);
    const ls = combo.letterSpacing !== 0 ? `ls${Math.round(combo.letterSpacing * 10)}` : "";
    const base = [combo.fontFamily, s, combo.fontSize, ls].filter(Boolean).join("-");
    const lh = lineHeightKeyStr(combo.lineHeight);
    if (!baseKeyLhMap.has(base)) baseKeyLhMap.set(base, new Set());
    baseKeyLhMap.get(base)!.add(lh);
  }
  const lhCollisionBases = new Set<string>();
  for (const [base, lhSet] of baseKeyLhMap) {
    if (lhSet.size > 1) lhCollisionBases.add(base);
  }

  for (const [key, combo] of combos) {
    const styleStr = fontWeightToStyle(combo.fontWeight);
    const lhKey = lineHeightKeyStr(combo.lineHeight);
    const lsKey = combo.letterSpacing !== 0 ? `ls${Math.round(combo.letterSpacing * 10)}` : "";
    const baseKey = [combo.fontFamily, styleStr, combo.fontSize, lsKey].filter(Boolean).join("-");
    const needsLh = lhCollisionBases.has(baseKey);
    const nameParts = [combo.fontFamily, styleStr, combo.fontSize];
    if (needsLh && lhKey) nameParts.push(lhKey);
    if (lsKey) nameParts.push(lsKey);
    result.set(key, `${prefix}/--${nameParts.join("-")}`);
  }

  return result;
}

// ============================================================================
// fontWeightToStyle
// ============================================================================

describe("fontWeightToStyle", () => {
  // CSS standard 9-step mapping. See font-weight-mapping.test.ts for full
  // coverage including the candidate fallback chain.
  it("maps light weights to Light/Thin", () => {
    expect(fontWeightToStyle(100)).toBe("Thin");
    expect(fontWeightToStyle(300)).toBe("Light");
  });

  it("maps Regular and Medium correctly", () => {
    expect(fontWeightToStyle(400)).toBe("Regular");
    expect(fontWeightToStyle(500)).toBe("Medium");
    expect(fontWeightToStyle(550)).toBe("Medium");
  });

  it("maps 600 to Semibold (CSS standard)", () => {
    expect(fontWeightToStyle(600)).toBe("Semibold");
  });

  it("maps 700 and above to Bold/ExtraBold/Black", () => {
    expect(fontWeightToStyle(700)).toBe("Bold");
    expect(fontWeightToStyle(800)).toBe("ExtraBold");
    expect(fontWeightToStyle(900)).toBe("Black");
  });
});

// ============================================================================
// collectTypographyFromTree — styledSegments (Fix 1)
// ============================================================================

describe("collectTypographyFromTree", () => {
  describe("node-level collection", () => {
    it("collects typography from a simple text node", () => {
      const node = makeNode({ fontSize: 16, fontWeight: 400, lineHeight: 24 });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      expect(combos.size).toBe(1);
      const key = "Montserrat-Regular-16-lh24";
      expect(combos.has(key)).toBe(true);
      expect(combos.get(key)!.fontFamily).toBe("Montserrat");
      expect(combos.get(key)!.fontSize).toBe(16);
    });

    it("uses plugin font family in plugin mode", () => {
      const node = makeNode({ fontFamily: "Inter", fontSize: 14, fontWeight: 700 });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      // Should use plugin font, not node's font
      const keys = Array.from(combos.keys());
      expect(keys[0]).toContain("Montserrat");
      expect(keys[0]).not.toContain("Inter");
    });

    it("uses website font family in website mode", () => {
      const node = makeNode({ fontFamily: "Inter", fontSize: 14, fontWeight: 700 });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "website");

      const keys = Array.from(combos.keys());
      expect(keys[0]).toContain("Inter");
    });
  });

  describe("styledSegments collection (Fix 1)", () => {
    it("collects combos from styledSegments with different font sizes", () => {
      // "$12 /month" — two segments with different sizes
      const node = makeNode({
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 40,
        styledSegments: [
          { text: "$12", color: "#333", fontWeight: 700, fontSize: 32 },
          { text: "/month", color: "#666", fontWeight: 400, fontSize: 16 },
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      // Should have: node-level (32px Bold) + segment (16px Regular)
      // Node-level and first segment share the same key
      expect(combos.size).toBe(2);
      expect(combos.has("Montserrat-Bold-32-lh40")).toBe(true);
      expect(combos.has("Montserrat-Regular-16-lh40")).toBe(true);
    });

    it("collects combos from styledSegments with different font weights", () => {
      const node = makeNode({
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 24,
        styledSegments: [
          { text: "Normal ", color: "#333", fontWeight: 400, fontSize: 16 },
          { text: "bold text", color: "#333", fontWeight: 700, fontSize: 16 },
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      expect(combos.has("Montserrat-Regular-16-lh24")).toBe(true);
      expect(combos.has("Montserrat-Bold-16-lh24")).toBe(true);
    });

    it("deduplicates segment combos that match node-level combo", () => {
      // All same font properties — should produce 1 combo, not 3
      const node = makeNode({
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 20,
        styledSegments: [
          { text: "Hello ", color: "#333", fontWeight: 400, fontSize: 14 },
          { text: "world", color: "#666", fontWeight: 400, fontSize: 14 },
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      expect(combos.size).toBe(1);
    });

    it("uses website font from segment in website mode", () => {
      const node = makeNode({
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 400,
        styledSegments: [
          { text: "Regular", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Inter" },
          { text: "Code", color: "#333", fontWeight: 400, fontSize: 14, fontFamily: "Fira Code" },
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Inter", "website");

      const keys = Array.from(combos.keys());
      const hasFiraCode = keys.some(k => k.includes("Fira Code"));
      expect(hasFiraCode).toBe(true);
    });

    it("uses node lineHeight for all segments (segments don't have lineHeight)", () => {
      const node = makeNode({
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 40,
        styledSegments: [
          { text: "$0", color: "#333", fontWeight: 700, fontSize: 32 },
          { text: "/forever", color: "#666", fontWeight: 400, fontSize: 16 },
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      // Both combos should use the node's lh40
      for (const combo of combos.values()) {
        expect(combo.lineHeight).toEqual({ value: 40, unit: "PIXELS" });
      }
    });

    it("real-world: pricing card '$12 /month' collects both segment combos", () => {
      const node = makeNode({
        fontSize: 48,
        fontWeight: 700,
        fontFamily: "Space Grotesk",
        lineHeight: 52,
        styledSegments: [
          { text: "$12", color: "#1a1a2e", fontWeight: 700, fontSize: 48 },
          { text: " /month", color: "#6b7280", fontWeight: 400, fontSize: 20 },
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      // Plugin mode: both use Montserrat
      expect(combos.has("Montserrat-Bold-48-lh52")).toBe(true);
      expect(combos.has("Montserrat-Regular-20-lh52")).toBe(true);
    });

    it("real-world: billing question with link collects segment combos", () => {
      const node = makeNode({
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 20,
        styledSegments: [
          { text: "Questions? Email us at ", color: "#333", fontWeight: 400, fontSize: 14 },
          { text: "billing@example.com", color: "#3b82f6", fontWeight: 400, fontSize: 14, isLink: true, textDecoration: "underline" as const },
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(node, combos, "Montserrat", "plugin");

      // Both segments have same font properties → 1 combo
      expect(combos.size).toBe(1);
      expect(combos.has("Montserrat-Regular-14-lh20")).toBe(true);
    });
  });

  describe("recursive collection", () => {
    it("collects from child nodes recursively", () => {
      const parent = makeNode({
        type: "frame",
        tag: "div",
        textContent: "",
        fontSize: undefined as unknown as number,
        children: [
          makeNode({ fontSize: 24, fontWeight: 700, lineHeight: 32 }),
          makeNode({ fontSize: 14, fontWeight: 400, lineHeight: 20 }),
        ],
      });
      const combos = new Map<string, TypographyCombo>();
      collectTypographyFromTree(parent, combos, "Montserrat", "plugin");

      expect(combos.size).toBe(2);
    });
  });
});

// ============================================================================
// Naming convention — -- prefix + collision-based lh (Fix 3)
// ============================================================================

describe("TextStyle naming convention", () => {
  describe("-- prefix", () => {
    it("generates names with W2W/-- prefix", () => {
      const combos = new Map<string, TypographyCombo>();
      combos.set("Montserrat-Bold-24-lh32", {
        fontFamily: "Montserrat",
        fontSize: 24,
        fontWeight: 700,
        lineHeight: { value: 32, unit: "PIXELS" },
        letterSpacing: 0,
      });
      const names = buildTextStyleNames(combos, "W2W");
      expect(names.get("Montserrat-Bold-24-lh32")).toBe("W2W/--Montserrat-Bold-24");
    });

    it("generates names with WEB/-- prefix for website mode", () => {
      const combos = new Map<string, TypographyCombo>();
      combos.set("Inter-Regular-16-lh24", {
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: { value: 24, unit: "PIXELS" },
        letterSpacing: 0,
      });
      const names = buildTextStyleNames(combos, "WEB");
      expect(names.get("Inter-Regular-16-lh24")).toBe("WEB/--Inter-Regular-16");
    });
  });

  describe("lh omitted when no collision", () => {
    it("omits lh when font+weight+size is unique", () => {
      const combos = new Map<string, TypographyCombo>();
      combos.set("Montserrat-Bold-24-lh32", {
        fontFamily: "Montserrat",
        fontSize: 24,
        fontWeight: 700,
        lineHeight: { value: 32, unit: "PIXELS" },
        letterSpacing: 0,
      });
      combos.set("Montserrat-Regular-16-lh24", {
        fontFamily: "Montserrat",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: { value: 24, unit: "PIXELS" },
        letterSpacing: 0,
      });
      const names = buildTextStyleNames(combos, "W2W");
      expect(names.get("Montserrat-Bold-24-lh32")).toBe("W2W/--Montserrat-Bold-24");
      expect(names.get("Montserrat-Regular-16-lh24")).toBe("W2W/--Montserrat-Regular-16");
    });
  });

  describe("lh included when collision detected", () => {
    it("includes lh when same font+weight+size has different lineHeights", () => {
      const combos = new Map<string, TypographyCombo>();
      // Inter-Regular-16 with lh24 (body text)
      combos.set("Inter-Regular-16-lh24", {
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: { value: 24, unit: "PIXELS" },
        letterSpacing: 0,
      });
      // Inter-Regular-16 with lh20 (heading subtitle)
      combos.set("Inter-Regular-16-lh20", {
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: { value: 20, unit: "PIXELS" },
        letterSpacing: 0,
      });
      const names = buildTextStyleNames(combos, "W2W");

      // Both should include lh to disambiguate
      expect(names.get("Inter-Regular-16-lh24")).toBe("W2W/--Inter-Regular-16-lh24");
      expect(names.get("Inter-Regular-16-lh20")).toBe("W2W/--Inter-Regular-16-lh20");
    });

    it("only adds lh to colliding combos, not all", () => {
      const combos = new Map<string, TypographyCombo>();
      // These collide (same base: Inter-Regular-16)
      combos.set("Inter-Regular-16-lh24", {
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: { value: 24, unit: "PIXELS" },
        letterSpacing: 0,
      });
      combos.set("Inter-Regular-16-lh20", {
        fontFamily: "Inter",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: { value: 20, unit: "PIXELS" },
        letterSpacing: 0,
      });
      // This does NOT collide (unique base: Inter-Bold-24)
      combos.set("Inter-Bold-24-lh32", {
        fontFamily: "Inter",
        fontSize: 24,
        fontWeight: 700,
        lineHeight: { value: 32, unit: "PIXELS" },
        letterSpacing: 0,
      });
      const names = buildTextStyleNames(combos, "W2W");

      // Colliding: include lh
      expect(names.get("Inter-Regular-16-lh24")).toBe("W2W/--Inter-Regular-16-lh24");
      expect(names.get("Inter-Regular-16-lh20")).toBe("W2W/--Inter-Regular-16-lh20");
      // Non-colliding: omit lh
      expect(names.get("Inter-Bold-24-lh32")).toBe("W2W/--Inter-Bold-24");
    });
  });

  describe("letterSpacing in names", () => {
    it("includes ls suffix when letterSpacing is non-zero", () => {
      const combos = new Map<string, TypographyCombo>();
      combos.set("Montserrat-Bold-14-lh20-ls5", {
        fontFamily: "Montserrat",
        fontSize: 14,
        fontWeight: 700,
        lineHeight: { value: 20, unit: "PIXELS" },
        letterSpacing: 0.5,
      });
      const names = buildTextStyleNames(combos, "W2W");
      expect(names.get("Montserrat-Bold-14-lh20-ls5")).toBe("W2W/--Montserrat-Bold-14-ls5");
    });
  });

  describe("AUTO lineHeight (no lh suffix)", () => {
    it("produces clean name when lineHeight is AUTO", () => {
      const combos = new Map<string, TypographyCombo>();
      combos.set("Montserrat-Regular-16", {
        fontFamily: "Montserrat",
        fontSize: 16,
        fontWeight: 400,
        lineHeight: { unit: "AUTO" },
        letterSpacing: 0,
      });
      const names = buildTextStyleNames(combos, "W2W");
      expect(names.get("Montserrat-Regular-16")).toBe("W2W/--Montserrat-Regular-16");
    });
  });
});
