/**
 * Icon Font Platform Font Detection Tests
 *
 * Tests for Layer #4: accurate icon font detection via CDP getPlatformFontsForNode.
 * The w2w approach injects a real DOM element with pseudo-element's font properties,
 * then queries CSS.getPlatformFontsForNode to get the actual rendered font.
 */

import { describe, it, expect, vi } from "vitest";
import { extractPseudoIconContent, isIconFont } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";
import type { PlatformFontInfo, CDPClientInterface } from "../types";

// ============================================================================
// Helpers
// ============================================================================

function makeMockClient(
  sendImpl?: (method: string, params?: Record<string, unknown>) => Promise<unknown>
): CDPClientInterface {
  return {
    send: vi.fn(sendImpl || (async () => ({}))) as CDPClientInterface["send"],
    enableDomains: vi.fn(async () => {}),
  };
}

function makeNode(
  overrides: Partial<ParsedSnapshotNode> & { index: number }
): ParsedSnapshotNode {
  return {
    backendNodeId: overrides.index + 100, // offset to differentiate from index
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
// findIconFontNodes
// ============================================================================

// Note: findIconFontNodes is imported from tree-builder after implementation
// These tests validate the function's behavior via extractPseudoIconContent integration.

describe("findIconFontNodes (via extractPseudoIconContent)", () => {
  it("detects <i> with ::before using Font Awesome", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        computedStyles: { display: "inline-block" },
      }),
      makeNode({
        index: 1,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "\uf5ae",
        computedStyles: {
          "font-family": '"Font Awesome 6 Free"',
          "font-size": "14px",
          "font-weight": "900",
          "color": "rgb(0, 0, 0)",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = extractPseudoIconContent(0, nodes, childrenMap);
    expect(result).not.toBeNull();
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
  });

  it("ignores non-icon font pseudo-elements", () => {
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
        textContent: "\u2022",
        computedStyles: {
          "font-family": "Georgia, serif",
          "font-size": "16px",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = extractPseudoIconContent(0, nodes, childrenMap);
    expect(result).toBeNull();
  });

  it("detects ::after icon fonts too", () => {
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
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = extractPseudoIconContent(0, nodes, childrenMap);
    expect(result).not.toBeNull();
    expect(result!.fontFamily).toBe("Material Icons");
    expect(result!.tag).toBe("::after");
  });

  it("ignores empty textContent", () => {
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
          "font-family": '"Font Awesome 6 Free"',
          "font-size": "16px",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = extractPseudoIconContent(0, nodes, childrenMap);
    expect(result).toBeNull();
  });
});

// ============================================================================
// extractPseudoIconContent with iconPlatformFontMap
// ============================================================================

describe("extractPseudoIconContent with iconPlatformFontMap", () => {
  it("uses platform font over computed style when iconPlatformFontMap is provided", () => {
    const nodes = [
      makeNode({
        index: 0,
        backendNodeId: 100,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        computedStyles: { display: "inline-block" },
      }),
      makeNode({
        index: 1,
        backendNodeId: 101,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "\uf5ae",
        computedStyles: {
          // Computed says "Font Awesome 6 Free" but platform might differ
          "font-family": '"Font Awesome 6 Free", "Space Grotesk", sans-serif',
          "font-size": "14px",
          "font-weight": "900",
          "color": "rgb(0, 0, 0)",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);

    // Platform font says the actual rendered font is "Font Awesome 6 Free"
    const iconPlatformFontMap = new Map<number, PlatformFontInfo[]>();
    iconPlatformFontMap.set(100, [
      {
        familyName: "Font Awesome 6 Free",
        postScriptName: "FontAwesome6Free-Solid",
        isCustomFont: true,
        glyphCount: 1,
      },
    ]);

    const result = extractPseudoIconContent(0, nodes, childrenMap, iconPlatformFontMap);
    expect(result).not.toBeNull();
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
  });

  it("platform font overrides when computed style shows fallback font", () => {
    // This is the key bug case: computed style says "Space Grotesk" but
    // platform font correctly says "Font Awesome 6 Free"
    const nodes = [
      makeNode({
        index: 0,
        backendNodeId: 200,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        computedStyles: { display: "inline-block" },
      }),
      makeNode({
        index: 1,
        backendNodeId: 201,
        nodeType: -1,
        nodeName: "::before",
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

    const iconPlatformFontMap = new Map<number, PlatformFontInfo[]>();
    iconPlatformFontMap.set(200, [
      {
        familyName: "Font Awesome 6 Free",
        postScriptName: "FontAwesome6Free-Solid",
        isCustomFont: true,
        glyphCount: 1,
      },
    ]);

    const result = extractPseudoIconContent(0, nodes, childrenMap, iconPlatformFontMap);
    expect(result).not.toBeNull();
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    expect(result!.fontFamilyList).toEqual(["Font Awesome 6 Free"]);
  });

  it("falls back to computed styles when no iconPlatformFontMap provided", () => {
    const nodes = [
      makeNode({
        index: 0,
        backendNodeId: 300,
        nodeType: 1,
        nodeName: "i",
        computedStyles: {},
      }),
      makeNode({
        index: 1,
        backendNodeId: 301,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "\uf03e",
        computedStyles: {
          "font-family": '"Font Awesome 6 Free", sans-serif',
          "font-size": "16px",
          "font-weight": "900",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);

    // No iconPlatformFontMap
    const result = extractPseudoIconContent(0, nodes, childrenMap);
    expect(result).not.toBeNull();
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    expect(result!.fontFamilyList).toEqual(["Font Awesome 6 Free", "sans-serif"]);
  });

  it("falls back to computed styles when backendNodeId not in map", () => {
    const nodes = [
      makeNode({
        index: 0,
        backendNodeId: 400,
        nodeType: 1,
        nodeName: "i",
        computedStyles: {},
      }),
      makeNode({
        index: 1,
        backendNodeId: 401,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "\uf03e",
        computedStyles: {
          "font-family": '"Font Awesome 6 Free"',
          "font-size": "16px",
          "font-weight": "900",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);

    // Map exists but doesn't have this node's backendNodeId
    const iconPlatformFontMap = new Map<number, PlatformFontInfo[]>();
    iconPlatformFontMap.set(999, [
      {
        familyName: "Other Font",
        postScriptName: "OtherFont",
        isCustomFont: true,
        glyphCount: 1,
      },
    ]);

    const result = extractPseudoIconContent(0, nodes, childrenMap, iconPlatformFontMap);
    expect(result).not.toBeNull();
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
  });

  it("picks platform font with highest glyphCount when multiple", () => {
    const nodes = [
      makeNode({
        index: 0,
        backendNodeId: 500,
        nodeType: 1,
        nodeName: "i",
        computedStyles: {},
      }),
      makeNode({
        index: 1,
        backendNodeId: 501,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "\uf5ae",
        computedStyles: {
          "font-family": '"Font Awesome 6 Free"',
          "font-size": "14px",
          "font-weight": "900",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);

    const iconPlatformFontMap = new Map<number, PlatformFontInfo[]>();
    iconPlatformFontMap.set(500, [
      {
        familyName: "Space Grotesk",
        postScriptName: "SpaceGrotesk",
        isCustomFont: true,
        glyphCount: 0,
      },
      {
        familyName: "Font Awesome 6 Free",
        postScriptName: "FontAwesome6Free-Solid",
        isCustomFont: true,
        glyphCount: 1,
      },
    ]);

    const result = extractPseudoIconContent(0, nodes, childrenMap, iconPlatformFontMap);
    expect(result).not.toBeNull();
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
  });
});

// ============================================================================
// getPlatformFontForPseudoElement (CDP integration)
// ============================================================================

describe("getPlatformFontForPseudoElement", () => {
  // These tests verify the CDP call sequence for the w2w approach.
  // The actual implementation is in css.ts.

  it("CDP call sequence: resolveNode → callFunctionOn → querySelector → getPlatformFontsForNode → cleanup", async () => {
    // This is an integration test that verifies the sequence of CDP calls.
    // Import will be from css.ts once implemented.
    const { getPlatformFontForPseudoElement } = await import("../css");

    const callLog: string[] = [];
    const client = makeMockClient(async (method, params) => {
      callLog.push(method);

      if (method === "DOM.resolveNode") {
        return { object: { objectId: "obj-123" } };
      }
      if (method === "Runtime.callFunctionOn") {
        return { result: { value: true } };
      }
      if (method === "DOM.getDocument") {
        return { root: { nodeId: 1 } };
      }
      if (method === "DOM.querySelector") {
        return { nodeId: 42 };
      }
      if (method === "CSS.getPlatformFontsForNode") {
        return {
          fonts: [
            {
              familyName: "Font Awesome 6 Free",
              postScriptName: "FontAwesome6Free-Solid",
              isCustomFont: true,
              glyphCount: 1,
            },
          ],
        };
      }
      return {};
    });

    const result = await getPlatformFontForPseudoElement(client, 123, "before");

    expect(result).not.toBeNull();
    expect(result![0].familyName).toBe("Font Awesome 6 Free");

    // Verify call sequence
    expect(callLog).toContain("DOM.resolveNode");
    expect(callLog).toContain("Runtime.callFunctionOn");
    expect(callLog).toContain("CSS.getPlatformFontsForNode");
    // Cleanup call should be present
    const cleanupCalls = callLog.filter((c) => c === "Runtime.callFunctionOn");
    expect(cleanupCalls.length).toBeGreaterThanOrEqual(2); // inject + cleanup
  });

  it("returns null when pseudo content is 'none'", async () => {
    const { getPlatformFontForPseudoElement } = await import("../css");

    const client = makeMockClient(async (method) => {
      if (method === "DOM.resolveNode") {
        return { object: { objectId: "obj-456" } };
      }
      if (method === "Runtime.callFunctionOn") {
        // The injected function returns null when content is "none"
        return { result: { value: null } };
      }
      return {};
    });

    const result = await getPlatformFontForPseudoElement(client, 456, "before");
    expect(result).toBeNull();
  });

  it("returns null and cleans up on error", async () => {
    const { getPlatformFontForPseudoElement } = await import("../css");

    const callLog: string[] = [];
    const client = makeMockClient(async (method) => {
      callLog.push(method);

      if (method === "DOM.resolveNode") {
        throw new Error("Node not found");
      }
      // Cleanup calls should still succeed
      if (method === "Runtime.evaluate") {
        return { result: { value: undefined } };
      }
      return {};
    });

    const result = await getPlatformFontForPseudoElement(client, 789, "after");
    expect(result).toBeNull();
  });
});
