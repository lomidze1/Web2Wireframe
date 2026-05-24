/**
 * Runtime Pseudo-Element Extraction Tests
 *
 * Tests for the fallback mechanism that extracts pseudo-element icon content
 * via CDP Runtime (getComputedStyle) when DOMSnapshot doesn't include
 * the pseudo-element with layout data.
 *
 * This fixes the case where <i class="fa-solid fa-pen-ruler"></i> produces
 * no icon node because ::before isn't in the snapshot.
 */

import { describe, it, expect, vi } from "vitest";
import { extractPseudoIconContent, findIconClassElements } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";
import type { CDPClientInterface } from "../types";

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
    backendNodeId: overrides.index + 100,
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
// findIconClassElements
// ============================================================================

describe("findIconClassElements", () => {
  it("finds <i class='fa-solid fa-pen-ruler'> without ::before child in snapshot", () => {
    // No ::before child — snapshot didn't include it
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        bounds: { x: 0, y: 0, width: 22, height: 22 },
        computedStyles: { display: "inline-block" },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = findIconClassElements(nodes, childrenMap);
    expect(result).toHaveLength(1);
    expect(result[0].backendNodeId).toBe(100);
    expect(result[0].pseudoType).toBe("before");
  });

  it("skips elements that already have ::before child in snapshot", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        bounds: { x: 0, y: 0, width: 22, height: 22 },
      }),
      makeNode({
        index: 1,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "\uf5ae",
        computedStyles: {
          "font-family": '"Font Awesome 6 Free"',
          "font-weight": "900",
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = findIconClassElements(nodes, childrenMap);
    expect(result).toHaveLength(0);
  });

  it("skips elements with ::before child that has empty textContent", () => {
    // ::before exists in snapshot but has no layout data (empty textContent)
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        bounds: { x: 0, y: 0, width: 22, height: 22 },
      }),
      makeNode({
        index: 1,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "", // No layout data → empty
        computedStyles: {},
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = findIconClassElements(nodes, childrenMap);
    // Should find it because ::before has no useful content
    expect(result).toHaveLength(1);
  });

  it("finds material-icons elements", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "span",
        attributes: { class: "material-icons" },
        bounds: { x: 0, y: 0, width: 24, height: 24 },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = findIconClassElements(nodes, childrenMap);
    expect(result).toHaveLength(1);
  });

  it("ignores elements without icon class hints", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "div",
        attributes: { class: "regular-class card" },
        bounds: { x: 0, y: 0, width: 300, height: 200 },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = findIconClassElements(nodes, childrenMap);
    expect(result).toHaveLength(0);
  });

  it("ignores non-element nodes", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 3, // text node
        nodeName: "#text",
        attributes: { class: "fa-solid" },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const result = findIconClassElements(nodes, childrenMap);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// extractPseudoContentRuntime (CDP integration)
// ============================================================================

describe("extractPseudoContentRuntime", () => {
  it("extracts pseudo-element content via Runtime.callFunctionOn", async () => {
    const { extractPseudoContentRuntime } = await import("../css");

    const client = makeMockClient(async (method) => {
      if (method === "DOM.resolveNode") {
        return { object: { objectId: "obj-123" } };
      }
      if (method === "Runtime.callFunctionOn") {
        return {
          result: {
            value: {
              content: "\uf5ae",
              fontFamily: '"Font Awesome 6 Free"',
              fontSize: "22.4px",
              fontWeight: "900",
              fontStyle: "normal",
              color: "rgb(57, 160, 237)",
            },
          },
        };
      }
      return {};
    });

    const result = await extractPseudoContentRuntime(client, 123, "before");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("\uf5ae");
    expect(result!.fontFamily).toContain("Font Awesome");
    expect(result!.fontSize).toBe(22);
    expect(result!.fontWeight).toBe(900);
  });

  it("returns null when content is 'none'", async () => {
    const { extractPseudoContentRuntime } = await import("../css");

    const client = makeMockClient(async (method) => {
      if (method === "DOM.resolveNode") {
        return { object: { objectId: "obj-456" } };
      }
      if (method === "Runtime.callFunctionOn") {
        return { result: { value: null } };
      }
      return {};
    });

    const result = await extractPseudoContentRuntime(client, 456, "before");
    expect(result).toBeNull();
  });

  it("returns null on CDP error (graceful)", async () => {
    const { extractPseudoContentRuntime } = await import("../css");

    const client = makeMockClient(async () => {
      throw new Error("CDP connection lost");
    });

    const result = await extractPseudoContentRuntime(client, 789, "before");
    expect(result).toBeNull();
  });
});

// ============================================================================
// extractPseudoIconContent with runtimePseudoContentMap fallback
// ============================================================================

describe("extractPseudoIconContent with runtime fallback", () => {
  it("uses runtime data when snapshot has no ::before child", () => {
    // Node with NO pseudo-element children in snapshot
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        computedStyles: { display: "inline-block" },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);

    // Runtime data provides what the snapshot missed
    const runtimePseudoContentMap = new Map<number, {
      text: string;
      fontFamily: string;
      fontSize: number;
      fontWeight: number;
      color: string | null;
    }>();
    runtimePseudoContentMap.set(100, { // backendNodeId = index + 100
      text: "\uf5ae",
      fontFamily: "Font Awesome 6 Free",
      fontSize: 22,
      fontWeight: 900,
      color: "rgb(57, 160, 237)",
    });

    const result = extractPseudoIconContent(0, nodes, childrenMap, undefined, runtimePseudoContentMap);
    expect(result).not.toBeNull();
    expect(result!.text).toBe("\uf5ae");
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    expect(result!.fontWeight).toBe(900);
    expect(result!.tag).toBe("::before");
  });

  it("prefers snapshot data over runtime data when both exist", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-image" },
        computedStyles: {},
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

    // Runtime data exists but should NOT be used
    const runtimePseudoContentMap = new Map<number, {
      text: string;
      fontFamily: string;
      fontSize: number;
      fontWeight: number;
      color: string | null;
    }>();
    runtimePseudoContentMap.set(100, {
      text: "\uf5ae",
      fontFamily: "Font Awesome 5 Free",
      fontSize: 14,
      fontWeight: 400,
      color: null,
    });

    const result = extractPseudoIconContent(0, nodes, childrenMap, undefined, runtimePseudoContentMap);
    expect(result).not.toBeNull();
    // Should use snapshot data (Font Awesome 6, not 5)
    expect(result!.text).toBe("\uf03e");
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
  });

  it("returns null when neither snapshot nor runtime has data", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "div",
        attributes: { class: "regular-class" },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const runtimePseudoContentMap = new Map();

    const result = extractPseudoIconContent(0, nodes, childrenMap, undefined, runtimePseudoContentMap);
    expect(result).toBeNull();
  });
});

// ============================================================================
// extractPseudoContentFromMatchedStyles (CSS matched rules fallback)
// ============================================================================

describe("extractPseudoContentFromMatchedStyles", () => {
  it("extracts icon glyph from CSS content property with unicode escape", async () => {
    const { extractPseudoContentFromMatchedStyles } = await import("../css");

    const matchedStyles = {
      matchedCSSRules: [],
      pseudoElements: [{
        pseudoType: "before",
        matches: [{
          rule: {
            selectorList: { selectors: [{ text: ".fa-pen-ruler::before" }], text: ".fa-pen-ruler::before" },
            origin: "regular" as const,
            style: {
              cssProperties: [
                { name: "content", value: '"\\f5ae"' },
                { name: "font-family", value: '"Font Awesome 6 Free"' },
                { name: "font-weight", value: "900" },
              ],
              shorthandEntries: [],
            },
          },
          matchingSelectors: [0],
        }],
      }],
    };

    const result = extractPseudoContentFromMatchedStyles(matchedStyles, "before");
    expect(result).not.toBeNull();
    expect(result!.text).toBe(String.fromCodePoint(0xf5ae));
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    expect(result!.fontWeight).toBe(900);
  });

  it("returns null when content is 'none'", async () => {
    const { extractPseudoContentFromMatchedStyles } = await import("../css");

    const matchedStyles = {
      matchedCSSRules: [],
      pseudoElements: [{
        pseudoType: "before",
        matches: [{
          rule: {
            selectorList: { selectors: [{ text: "div::before" }], text: "div::before" },
            origin: "regular" as const,
            style: {
              cssProperties: [{ name: "content", value: "none" }],
              shorthandEntries: [],
            },
          },
          matchingSelectors: [0],
        }],
      }],
    };

    const result = extractPseudoContentFromMatchedStyles(matchedStyles, "before");
    expect(result).toBeNull();
  });

  it("returns null when no pseudoElements exist", async () => {
    const { extractPseudoContentFromMatchedStyles } = await import("../css");

    const matchedStyles = {
      matchedCSSRules: [],
    };

    const result = extractPseudoContentFromMatchedStyles(matchedStyles, "before");
    expect(result).toBeNull();
  });

  it("handles content with quoted string value", async () => {
    const { extractPseudoContentFromMatchedStyles } = await import("../css");

    const matchedStyles = {
      matchedCSSRules: [],
      pseudoElements: [{
        pseudoType: "before",
        matches: [{
          rule: {
            selectorList: { selectors: [{ text: ".icon::before" }], text: ".icon::before" },
            origin: "regular" as const,
            style: {
              cssProperties: [
                { name: "content", value: '"\\e900"' },
                { name: "font-family", value: "icomoon" },
              ],
              shorthandEntries: [],
            },
          },
          matchingSelectors: [0],
        }],
      }],
    };

    const result = extractPseudoContentFromMatchedStyles(matchedStyles, "before");
    expect(result).not.toBeNull();
    expect(result!.text).toBe(String.fromCodePoint(0xe900));
    expect(result!.fontFamily).toBe("icomoon");
  });
});

// ============================================================================
// extractPseudoIconContent with matchedStylesMap fallback (Tier 3)
// ============================================================================

describe("extractPseudoIconContent with matchedStyles fallback", () => {
  it("uses matched styles when both snapshot and runtime fail", () => {
    // Node with ::before child but empty textContent (snapshot failed)
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-pen-ruler" },
        computedStyles: {
          display: "inline-block",
          "font-family": '"Font Awesome 6 Free"',
          "font-size": "22px",
          "font-weight": "900",
          "color": "rgb(57, 160, 237)",
        },
      }),
      makeNode({
        index: 1,
        nodeType: -1,
        nodeName: "::before",
        parentIndex: 0,
        textContent: "", // Empty — snapshot failed to capture glyph
        computedStyles: {},
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const emptyRuntimeMap = new Map();

    // Matched styles contain the CSS content property
    const matchedStylesMap = new Map();
    matchedStylesMap.set(100, { // backendNodeId = index + 100
      matchedCSSRules: [],
      pseudoElements: [{
        pseudoType: "before",
        matches: [{
          rule: {
            selectorList: { selectors: [{ text: ".fa-pen-ruler::before" }], text: ".fa-pen-ruler::before" },
            origin: "regular" as const,
            style: {
              cssProperties: [
                { name: "content", value: '"\\f5ae"' },
                { name: "font-family", value: '"Font Awesome 6 Free"' },
                { name: "font-weight", value: "900" },
              ],
              shorthandEntries: [],
            },
          },
          matchingSelectors: [0],
        }],
      }],
    });

    const result = extractPseudoIconContent(0, nodes, childrenMap, undefined, emptyRuntimeMap, matchedStylesMap);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(String.fromCodePoint(0xf5ae));
    expect(result!.fontFamily).toBe("Font Awesome 6 Free");
    expect(result!.fontWeight).toBe(900);
    expect(result!.tag).toBe("::before");
  });

  it("prefers runtime data over matched styles", () => {
    const nodes = [
      makeNode({
        index: 0,
        nodeType: 1,
        nodeName: "i",
        attributes: { class: "fa-solid fa-check" },
        computedStyles: {
          "font-family": '"Font Awesome 6 Free"',
        },
      }),
    ];
    const childrenMap = buildChildrenMap(nodes);

    // Runtime data
    const runtimeMap = new Map();
    runtimeMap.set(100, {
      text: "\uf00c",
      fontFamily: "Font Awesome 6 Free",
      fontSize: 16,
      fontWeight: 900,
      color: null,
    });

    // Matched styles also present
    const matchedStylesMap = new Map();
    matchedStylesMap.set(100, {
      matchedCSSRules: [],
      pseudoElements: [{
        pseudoType: "before",
        matches: [{
          rule: {
            selectorList: { selectors: [{ text: ".fa-check::before" }], text: ".fa-check::before" },
            origin: "regular" as const,
            style: {
              cssProperties: [{ name: "content", value: '"\\f00c"' }],
              shorthandEntries: [],
            },
          },
          matchingSelectors: [0],
        }],
      }],
    });

    const result = extractPseudoIconContent(0, nodes, childrenMap, undefined, runtimeMap, matchedStylesMap);
    expect(result).not.toBeNull();
    // Should use runtime data (comes first in priority)
    expect(result!.text).toBe("\uf00c");
    expect(result!.tag).toBe("::before");
  });
});
