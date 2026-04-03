/**
 * Pseudo-Element Icon Font Extraction Tests
 *
 * Tests that ::before/::after pseudo-elements with icon fonts (Font Awesome,
 * Material Icons, etc.) are extracted as text content for their parent element.
 * Without this, icon elements like <i class="fa-solid fa-image"></i> render
 * as empty frames in Figma instead of text nodes with icon glyphs.
 */

import { describe, it, expect } from "vitest";
import { isIconFont, extractPseudoIconContent } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";

// ============================================================================
// Helpers
// ============================================================================

function makeNode(
  overrides: Partial<ParsedSnapshotNode> & { index: number }
): ParsedSnapshotNode {
  return {
    backendNodeId: overrides.index,
    nodeType: 1,
    nodeName: "",
    parentIndex: -1,
    attributes: {},
    bounds: null,
    computedStyles: {},
    textContent: "",
    isClickable: false,
    needsMatchedStyles: false,
    ...overrides,
  };
}

function buildChildrenMap(nodes: ParsedSnapshotNode[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentIndex >= 0) {
      if (!map.has(node.parentIndex)) {
        map.set(node.parentIndex, []);
      }
      map.get(node.parentIndex)!.push(node.index);
    }
  }
  return map;
}

// ============================================================================
// isIconFont()
// ============================================================================

describe("isIconFont", () => {
  describe("detects known icon fonts", () => {
    it("Font Awesome 6 Free", () => {
      expect(isIconFont("Font Awesome 6 Free")).toBe(true);
    });

    it("Font Awesome 6 Brands", () => {
      expect(isIconFont("Font Awesome 6 Brands")).toBe(true);
    });

    it("Font Awesome 5 Free", () => {
      expect(isIconFont("Font Awesome 5 Free")).toBe(true);
    });

    it("Font Awesome 5 Brands", () => {
      expect(isIconFont("Font Awesome 5 Brands")).toBe(true);
    });

    it("FontAwesome (legacy)", () => {
      expect(isIconFont("FontAwesome")).toBe(true);
    });

    it("Material Icons", () => {
      expect(isIconFont("Material Icons")).toBe(true);
    });

    it("Material Icons Outlined", () => {
      expect(isIconFont("Material Icons Outlined")).toBe(true);
    });

    it("Material Symbols Outlined", () => {
      expect(isIconFont("Material Symbols Outlined")).toBe(true);
    });

    it("Material Symbols Rounded", () => {
      expect(isIconFont("Material Symbols Rounded")).toBe(true);
    });

    it("bootstrap-icons", () => {
      expect(isIconFont("bootstrap-icons")).toBe(true);
    });

    it("remixicon", () => {
      expect(isIconFont("remixicon")).toBe(true);
    });

    it("IcoMoon", () => {
      expect(isIconFont("IcoMoon")).toBe(true);
    });

    it("Ionicons", () => {
      expect(isIconFont("Ionicons")).toBe(true);
    });
  });

  describe("case insensitive", () => {
    it("lowercase", () => {
      expect(isIconFont("font awesome 6 free")).toBe(true);
    });

    it("uppercase", () => {
      expect(isIconFont("FONT AWESOME 6 FREE")).toBe(true);
    });

    it("mixed case", () => {
      expect(isIconFont("Material ICONS")).toBe(true);
    });
  });

  describe("handles quotes", () => {
    it("single quotes", () => {
      expect(isIconFont("'Font Awesome 6 Free'")).toBe(true);
    });

    it("double quotes", () => {
      expect(isIconFont('"Font Awesome 6 Free"')).toBe(true);
    });
  });

  describe("rejects non-icon fonts", () => {
    it("Arial", () => {
      expect(isIconFont("Arial")).toBe(false);
    });

    it("Inter", () => {
      expect(isIconFont("Inter")).toBe(false);
    });

    it("Roboto", () => {
      expect(isIconFont("Roboto")).toBe(false);
    });

    it("Helvetica", () => {
      expect(isIconFont("Helvetica")).toBe(false);
    });

    it("Times New Roman", () => {
      expect(isIconFont("Times New Roman")).toBe(false);
    });

    it("empty string", () => {
      expect(isIconFont("")).toBe(false);
    });

    it("serif", () => {
      expect(isIconFont("serif")).toBe(false);
    });

    it("monospace", () => {
      expect(isIconFont("monospace")).toBe(false);
    });
  });
});

// ============================================================================
// extractPseudoIconContent()
// ============================================================================

describe("extractPseudoIconContent", () => {
  describe("basic extraction", () => {
    it("extracts FA icon from ::before child", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          attributes: { class: "fa-solid fa-image" },
          computedStyles: { display: "inline-block" },
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf03e",
          computedStyles: {
            "font-family": '"Font Awesome 6 Free"',
            "font-size": "16px",
            "font-weight": "900",
            "color": "rgb(0, 0, 0)",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("\uf03e");
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
      expect(result!.fontWeight).toBe(900);
      expect(result!.fontSize).toBe(16);
      expect(result!.tag).toBe("::before");
    });

    it("extracts Material icon from ::after child", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "span",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::after",
          parentIndex: 0,
          textContent: "\ue87c",
          computedStyles: {
            "font-family": "Material Icons",
            "font-size": "24px",
            "font-weight": "400",
            "color": "rgb(51, 51, 51)",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("\ue87c");
      expect(result!.fontFamily).toBe("Material Icons");
      expect(result!.fontSize).toBe(24);
      expect(result!.tag).toBe("::after");
    });

    it("works for <span> parent (not just <i>)", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "span",
          attributes: { class: "icon" },
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf007",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
            "font-size": "14px",
            "font-weight": "400",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    });
  });

  describe("returns null when not applicable", () => {
    it("returns null for non-icon font ::before", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "p",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\u2022", // bullet
          computedStyles: {
            "font-family": "Arial",
            "font-size": "16px",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      expect(extractPseudoIconContent(0, nodes, childrenMap)).toBeNull();
    });

    it("returns null when no pseudo-element children", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      expect(extractPseudoIconContent(0, nodes, childrenMap)).toBeNull();
    });

    it("returns null for empty textContent", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
            "font-size": "16px",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      expect(extractPseudoIconContent(0, nodes, childrenMap)).toBeNull();
    });

    it("returns null for whitespace-only textContent", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "   ",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
            "font-size": "16px",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      expect(extractPseudoIconContent(0, nodes, childrenMap)).toBeNull();
    });

    it("returns null for ::marker (only ::before/::after)", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "li",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::marker",
          parentIndex: 0,
          textContent: "\uf00c",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
            "font-size": "16px",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      expect(extractPseudoIconContent(0, nodes, childrenMap)).toBeNull();
    });

    it("returns null when no font-family in pseudo-element styles", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf03e",
          computedStyles: {
            "font-size": "16px",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      expect(extractPseudoIconContent(0, nodes, childrenMap)).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("prefers ::before over ::after when both exist", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf03e",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
            "font-size": "16px",
            "font-weight": "900",
          },
        }),
        makeNode({
          index: 2,
          nodeType: -1,
          nodeName: "::after",
          parentIndex: 0,
          textContent: "\uf007",
          computedStyles: {
            "font-family": "Material Icons",
            "font-size": "24px",
            "font-weight": "400",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.tag).toBe("::before");
      expect(result!.text).toBe("\uf03e");
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    });

    it("parses font-family with fallbacks (comma-separated)", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf03e",
          computedStyles: {
            "font-family": '"Font Awesome 6 Free", Helvetica, sans-serif',
            "font-size": "16px",
            "font-weight": "900",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
      expect(result!.fontFamilyList).toEqual([
        "Font Awesome 6 Free",
        "Helvetica",
        "sans-serif",
      ]);
    });

    it("falls back to parent font-family when pseudo-element font-family is missing", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          attributes: { class: "fa-solid fa-pen-ruler" },
          computedStyles: {
            "font-family": '"Font Awesome 6 Free", Helvetica, sans-serif',
          },
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf5ae",
          computedStyles: {
            "font-size": "16px",
            "font-weight": "900",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
      expect(result!.fontFamilyList).toEqual([
        "Font Awesome 6 Free",
        "Helvetica",
        "sans-serif",
      ]);
    });

    it("uses platform icon font when fa-* class hint exists but pseudo styles omit font-family", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          attributes: { class: "fa-solid fa-pen-ruler" },
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf5ae",
          computedStyles: {
            "font-size": "16px",
            "font-weight": "900",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);
      const iconPlatformFontMap = new Map<number, Array<{
        familyName: string;
        postScriptName: string;
        isCustomFont: boolean;
        glyphCount: number;
      }>>();
      iconPlatformFontMap.set(0, [
        {
          familyName: "Font Awesome 6 Free",
          postScriptName: "FontAwesome6Free-Solid",
          isCustomFont: true,
          glyphCount: 1,
        },
      ]);
      const result = extractPseudoIconContent(0, nodes, childrenMap, iconPlatformFontMap);

      expect(result).not.toBeNull();
      expect(result!.text).toBe("\uf5ae");
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    });

    it("extracts fontSize, fontWeight, color from pseudo-element styles", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf5ad",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
            "font-size": "20px",
            "font-weight": "900",
            "color": "rgb(59, 130, 246)",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.fontSize).toBe(20);
      expect(result!.fontWeight).toBe(900);
      expect(result!.color).not.toBeNull();
    });

    it("defaults fontSize to 16 and fontWeight to 400 when missing", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf03e",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.fontSize).toBe(16);
      expect(result!.fontWeight).toBe(400);
    });

    it("falls back to ::after when ::before has non-icon font", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "span",
          computedStyles: {},
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: '"',
          computedStyles: {
            "font-family": "Georgia",
            "font-size": "24px",
          },
        }),
        makeNode({
          index: 2,
          nodeType: -1,
          nodeName: "::after",
          parentIndex: 0,
          textContent: "\uf007",
          computedStyles: {
            "font-family": "Font Awesome 6 Free",
            "font-size": "16px",
            "font-weight": "900",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.tag).toBe("::after");
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    });
  });

  // ==========================================================================
  // Problem 2: extractPseudoIconContent must work even when parent has textContent
  // DOMSnapshot layout.text can include ::before glyph in parent's textContent,
  // making aggregatedText non-empty and blocking icon extraction.
  // ==========================================================================

  describe("works regardless of parent textContent (aggregatedText gate fix)", () => {
    it("extracts icon when parent node has textContent from layout.text glyph", () => {
      // Simulates: <i class="fa-solid fa-image"> where DOMSnapshot puts
      // the ::before glyph ("\uf03e") into parent <i>'s layout.text
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          attributes: { class: "fa-solid fa-image" },
          textContent: "\uf03e", // ← layout.text includes pseudo glyph!
          computedStyles: { display: "inline-block" },
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf03e",
          computedStyles: {
            "font-family": '"Font Awesome 6 Free"',
            "font-size": "16px",
            "font-weight": "900",
            "color": "rgb(0, 0, 0)",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      // extractPseudoIconContent itself should always work —
      // it's the caller's gate that needs fixing, but the function
      // must return valid data regardless of parent's textContent
      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("\uf03e");
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
      expect(result!.fontWeight).toBe(900);
    });

    it("extracts icon with pseudoType-parsed nodeName (real CDP format)", () => {
      // In real CDP data, pseudo-element's nodeName might be "i" (parent's name)
      // until parseSnapshot() sets it to "::before" via pseudoType RareStringData.
      // After the parseSnapshot fix, nodeName should be "::before".
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          attributes: { class: "fa-solid fa-pen-ruler" },
          textContent: "\uf5ae", // layout.text has glyph
          computedStyles: {
            display: "inline-block",
            "font-family": '"Font Awesome 6 Free"',
          },
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before", // After parseSnapshot pseudoType fix
          parentIndex: 0,
          textContent: "\uf5ae",
          computedStyles: {
            "font-family": '"Font Awesome 6 Free"',
            "font-size": "14px",
            "font-weight": "900",
            "color": "rgb(100, 100, 100)",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("\uf5ae");
      expect(result!.fontFamily).toBe("Font Awesome 6 Free");
      expect(result!.tag).toBe("::before");
    });

    it("extracts icon for fa-brands variant", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          attributes: { class: "fa-brands fa-github" },
          textContent: "\uf09b",
          computedStyles: { display: "inline-block" },
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf09b",
          computedStyles: {
            "font-family": '"Font Awesome 6 Brands"',
            "font-size": "24px",
            "font-weight": "400",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.fontFamily).toBe("Font Awesome 6 Brands");
    });

    it("extracts icon for fa-sharp variant", () => {
      const nodes = [
        makeNode({
          index: 0,
          nodeType: 1,
          nodeName: "i",
          attributes: { class: "fa-sharp fa-solid fa-house" },
          textContent: "\uf015",
          computedStyles: { display: "inline-block" },
        }),
        makeNode({
          index: 1,
          nodeType: -1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "\uf015",
          computedStyles: {
            "font-family": '"Font Awesome 6 Sharp"',
            "font-size": "16px",
            "font-weight": "900",
          },
        }),
      ];
      const childrenMap = buildChildrenMap(nodes);

      const result = extractPseudoIconContent(0, nodes, childrenMap);
      expect(result).not.toBeNull();
      expect(result!.fontFamily).toBe("Font Awesome 6 Sharp");
    });
  });
});
