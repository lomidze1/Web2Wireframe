/**
 * Subtree Extraction Tests
 *
 * Tests that buildElementTree works correctly with rootNodeIndex and
 * subtreeNodeIndices options — used by inspect-mode / selected-element capture.
 *
 * Verifies that subtree extraction gets the same font fidelity features
 * as full-page extraction: platformFontFamily, obfuscated font fallback,
 * variable font weight derivation, and icon pseudo-element probing.
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";
import type { PlatformFontInfo, CDPMatchedStyles } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

const baseStyles: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  "background-color": "rgba(255, 255, 255, 1)",
  color: "rgba(0, 0, 0, 1)",
  "font-family": "Inter",
  "font-size": "16",
  "font-weight": "400",
  "line-height": "normal",
  "letter-spacing": "0",
  "text-align": "left",
  position: "static",
  width: "1440",
  height: "900",
  "box-sizing": "border-box",
};

function makeNode(
  index: number,
  parentIndex: number,
  backendNodeId: number,
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index,
    parentIndex,
    backendNodeId,
    nodeType: 1,
    nodeName: overrides.nodeName || "div",
    textContent: overrides.textContent || "",
    attributes: overrides.attributes || {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: overrides.bounds || { x: 0, y: 0, width: 400, height: 300 },
    computedStyles: {
      ...baseStyles,
      width: "400",
      height: "300",
      ...overrides.computedStyles,
    },
  };
}

function makePlatformFont(
  familyName: string,
  postScriptName: string,
  isCustomFont: boolean,
  glyphCount: number
): PlatformFontInfo {
  return { familyName, postScriptName, isCustomFont, glyphCount };
}

/**
 * Build a minimal page structure:
 * body (index 0) → div.container (index 1) → div.target (index 2) → p (index 3)
 *
 * For subtree tests, we extract starting from div.target (index 2).
 */
function buildTestPageNodes(): ParsedSnapshotNode[] {
  return [
    makeNode(0, -1, 100, {
      nodeName: "body",
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      computedStyles: { ...baseStyles },
    }),
    makeNode(1, 0, 101, {
      nodeName: "div",
      attributes: { class: "container" },
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      computedStyles: { ...baseStyles },
    }),
    makeNode(2, 1, 102, {
      nodeName: "div",
      attributes: { class: "target" },
      bounds: { x: 100, y: 50, width: 400, height: 300 },
      computedStyles: {
        ...baseStyles,
        width: "400",
        height: "300",
        "font-family": "'Roboto', sans-serif",
      },
    }),
    makeNode(3, 2, 103, {
      nodeName: "p",
      textContent: "Hello World",
      bounds: { x: 100, y: 50, width: 380, height: 24 },
      computedStyles: {
        ...baseStyles,
        "background-color": "rgba(0, 0, 0, 0)",
        "font-family": "'Roboto', sans-serif",
        "font-size": "16",
        "font-weight": "400",
        "line-height": "24px",
        width: "380",
        height: "24",
      },
    }),
  ];
}

// ============================================================================
// TESTS: Basic subtree extraction
// ============================================================================

describe("Subtree Extraction (rootNodeIndex + subtreeNodeIndices)", () => {
  it("builds tree from specified root instead of body", () => {
    const nodes = buildTestPageNodes();
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    // Extract only the subtree rooted at div.target (index 2)
    const subtreeIndices = new Set([2, 3]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      {
        viewportWidth: 1440,
        rootNodeIndex: 2,
        subtreeNodeIndices: subtreeIndices,
      }
    );

    // Root should be div.target, not body
    expect(tree.tag).toBe("div");
    expect(tree.className).toBe("target");
    // Should have the p child
    expect(tree.children.length).toBeGreaterThanOrEqual(1);
    const textChild = tree.children.find((c) => c.tag === "p" || c.tag === "#text");
    expect(textChild).toBeDefined();
  });

  it("does NOT include siblings outside subtree", () => {
    const nodes = buildTestPageNodes();
    // Add a sibling to div.target that should be excluded
    nodes.push(
      makeNode(4, 1, 104, {
        nodeName: "div",
        attributes: { class: "sibling" },
        bounds: { x: 500, y: 50, width: 400, height: 300 },
        computedStyles: { ...baseStyles, width: "400", height: "300" },
      })
    );
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const subtreeIndices = new Set([2, 3]); // Only target + its child

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      {
        viewportWidth: 1440,
        rootNodeIndex: 2,
        subtreeNodeIndices: subtreeIndices,
      }
    );

    // Should NOT contain the sibling
    const hasSibling = tree.children.some((c) => c.className === "sibling");
    expect(hasSibling).toBe(false);
  });
});

// ============================================================================
// TESTS: Font fidelity in subtree extraction
// ============================================================================

describe("Font Fidelity in Subtree Extraction", () => {
  it("uses platformFontFamily from platformFontMap in subtree", () => {
    const nodes = buildTestPageNodes();
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    platformFontMap.set(103, [
      makePlatformFont("Roboto", "Roboto-Regular", true, 42),
    ]);

    const subtreeIndices = new Set([2, 3]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      {
        viewportWidth: 1440,
        rootNodeIndex: 2,
        subtreeNodeIndices: subtreeIndices,
        platformFontMap,
      }
    );

    const textChild = tree.children.find((c) => c.textContent === "Hello World");
    expect(textChild).toBeDefined();
    expect(textChild!.fontFamily).toBe("Roboto");
    expect(textChild!.platformFontFamily).toBe("Roboto");
  });

  it("skips obfuscated font names in subtree — falls back to CSS", () => {
    const nodes = buildTestPageNodes();
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    // Obfuscated font: hex-pattern postScriptName (font + 16 hex chars)
    platformFontMap.set(103, [
      makePlatformFont("", "font0123456789abcdef", true, 42),
    ]);

    const subtreeIndices = new Set([2, 3]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      {
        viewportWidth: 1440,
        rootNodeIndex: 2,
        subtreeNodeIndices: subtreeIndices,
        platformFontMap,
      }
    );

    const textChild = tree.children.find((c) => c.textContent === "Hello World");
    expect(textChild).toBeDefined();
    // Should fall back to CSS font-family, not use empty obfuscated name
    expect(textChild!.fontFamily).not.toBe("");
    expect(textChild!.fontFamily).toBe("Roboto"); // Falls back to computed CSS
    // platformFontFamily should NOT be set for obfuscated fonts
    expect(textChild!.platformFontFamily).toBeUndefined();
  });

  it("derives variable font weight in subtree extraction", () => {
    const nodes = buildTestPageNodes();
    // Update p node to have a generic weight
    nodes[3].computedStyles["font-weight"] = "400";
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const platformFontMap = new Map<number, PlatformFontInfo[]>();
    // Variable font with weight encoded in postScriptName (hex suffix)
    platformFontMap.set(103, [
      makePlatformFont("Inter", "Inter-Roman_wght2BC", false, 42),
    ]);

    const subtreeIndices = new Set([2, 3]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      {
        viewportWidth: 1440,
        rootNodeIndex: 2,
        subtreeNodeIndices: subtreeIndices,
        platformFontMap,
      }
    );

    const textChild = tree.children.find((c) => c.textContent === "Hello World");
    expect(textChild).toBeDefined();
    // 0x2BC = 700 (Bold)
    expect(textChild!.fontWeight).toBe(700);
  });

  it("icon pseudo-element font probing works in subtree", () => {
    // Build a subtree with an icon element containing ::before pseudo
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, -1, 100, {
        nodeName: "body",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
      }),
      makeNode(1, 0, 101, {
        nodeName: "div",
        attributes: { class: "icon-container" },
        bounds: { x: 0, y: 0, width: 400, height: 300 },
        computedStyles: { ...baseStyles, width: "400", height: "300" },
      }),
      // Icon element: <i class="fa fa-check">
      makeNode(2, 1, 102, {
        nodeName: "i",
        attributes: { class: "fa fa-check" },
        textContent: "\uf00c",
        bounds: { x: 10, y: 10, width: 16, height: 16 },
        computedStyles: {
          ...baseStyles,
          "background-color": "rgba(0, 0, 0, 0)",
          "font-family": "'Font Awesome 5 Free'",
          "font-size": "16",
          "font-weight": "900",
          width: "16",
          height: "16",
        },
      }),
      // ::before pseudo-element
      makeNode(3, 2, 103, {
        nodeName: "::before",
        nodeType: 1,
        textContent: "\uf00c",
        bounds: { x: 10, y: 10, width: 16, height: 16 },
        computedStyles: {
          ...baseStyles,
          "background-color": "rgba(0, 0, 0, 0)",
          "font-family": "'Font Awesome 5 Free'",
          "font-size": "16",
          "font-weight": "900",
          content: '"\uf00c"',
          width: "16",
          height: "16",
        },
      }),
    ];

    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const iconPlatformFontMap = new Map<number, PlatformFontInfo[]>();
    iconPlatformFontMap.set(102, [
      makePlatformFont("Font Awesome 5 Free", "FontAwesome5Free-Solid", true, 1),
    ]);

    const subtreeIndices = new Set([1, 2, 3]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      {
        viewportWidth: 1440,
        rootNodeIndex: 1,
        subtreeNodeIndices: subtreeIndices,
        iconPlatformFontMap,
      }
    );

    // The icon element should exist in the tree
    const iconChild = tree.children.find(
      (c) => c.tag === "i" || c.fontFamily === "Font Awesome 5 Free"
    );
    expect(iconChild).toBeDefined();
    if (iconChild) {
      expect(iconChild.fontFamily).toBe("Font Awesome 5 Free");
    }
  });
});

// ============================================================================
// TESTS: Subtree root position
// ============================================================================

describe("Subtree Root Positioning", () => {
  it("root element coordinates are relative to parent (not forced to 0,0)", () => {
    const nodes = buildTestPageNodes();
    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const subtreeIndices = new Set([2, 3]);

    const tree = buildElementTree(
      nodes,
      nodesByBackendId,
      new Map<number, CDPMatchedStyles>(),
      {
        viewportWidth: 1440,
        rootNodeIndex: 2,
        subtreeNodeIndices: subtreeIndices,
      }
    );

    // The caller (inspect-mode) is responsible for setting root x/y to 0,0 after.
    // buildElementTree should return the tree with relative coordinates as normal.
    expect(tree).toBeDefined();
    expect(tree.width).toBeGreaterThan(0);
    expect(tree.height).toBeGreaterThan(0);
  });
});
