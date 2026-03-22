/**
 * parseSnapshot — pseudoType RareStringData Parsing Tests
 *
 * DOMSnapshot.captureSnapshot returns pseudo-element identity in the
 * `pseudoType` RareStringData field (values: "before", "after", "marker").
 * Currently parseSnapshot() ignores this field, so pseudo-elements keep
 * their original nodeName (e.g., "i" or "") instead of "::before"/"::after".
 *
 * These tests verify that after the fix, parseSnapshot() correctly reads
 * pseudoType and sets nodeName/nodeType accordingly.
 */

import { describe, it, expect } from "vitest";
import { parseSnapshot } from "../snapshot";
import type { CaptureSnapshotResult } from "../snapshot";

// ============================================================================
// Helpers — build minimal CDP snapshot structures
// ============================================================================

/**
 * Build a minimal CaptureSnapshotResult with the given node definitions.
 * Each node definition specifies: nodeName, nodeType, parentIndex, backendNodeId,
 * and optionally pseudoType, computedStyles, textContent.
 */
function buildSnapshot(
  nodeDefs: Array<{
    nodeName: string;
    nodeType: number;
    parentIndex: number;
    backendNodeId: number;
    pseudoType?: string;
    computedStyles?: Record<string, string>;
    textContent?: string;
  }>
): CaptureSnapshotResult {
  // Build strings table — collect all unique strings
  const stringsSet = new Map<string, number>();
  function addString(s: string): number {
    if (s === "") {
      if (!stringsSet.has("")) stringsSet.set("", stringsSet.size);
      return stringsSet.get("")!;
    }
    if (!stringsSet.has(s)) stringsSet.set(s, stringsSet.size);
    return stringsSet.get(s)!;
  }

  // Reserve index 0 for empty string
  addString("");

  // Pre-add all node names and pseudo types
  for (const def of nodeDefs) {
    addString(def.nodeName);
    if (def.pseudoType) addString(def.pseudoType);
    if (def.textContent) addString(def.textContent);
    if (def.computedStyles) {
      for (const val of Object.values(def.computedStyles)) {
        addString(val);
      }
    }
  }

  const strings = Array.from(stringsSet.keys());
  const getIdx = (s: string) => strings.indexOf(s);

  // Build nodeTree arrays
  const nodeNames: number[] = [];
  const nodeTypes: number[] = [];
  const parentIndices: number[] = [];
  const backendNodeIds: number[] = [];
  const attributes: number[][] = [];

  // pseudoType RareStringData
  const pseudoTypeIndices: number[] = [];
  const pseudoTypeValues: number[] = [];

  for (let i = 0; i < nodeDefs.length; i++) {
    const def = nodeDefs[i];
    nodeNames.push(getIdx(def.nodeName));
    nodeTypes.push(def.nodeType);
    parentIndices.push(def.parentIndex);
    backendNodeIds.push(def.backendNodeId);
    attributes.push([]);

    if (def.pseudoType) {
      pseudoTypeIndices.push(i);
      pseudoTypeValues.push(getIdx(def.pseudoType));
    }
  }

  // Build layout — only for nodes with computedStyles or textContent
  const layoutNodeIndex: number[] = [];
  const layoutStyles: number[][] = [];
  const layoutBounds: number[][] = [];
  const layoutText: number[] = [];

  // We need to know the SNAPSHOT_COMPUTED_STYLES order to build styles array
  // Import it dynamically — for now use a simplified version
  // The test only cares about font-family, font-size, font-weight, color
  // which are at specific indices in SNAPSHOT_COMPUTED_STYLES
  for (let i = 0; i < nodeDefs.length; i++) {
    const def = nodeDefs[i];
    if (def.computedStyles || def.textContent) {
      layoutNodeIndex.push(i);
      // Empty styles array (we won't validate computed styles parsing here)
      layoutStyles.push([]);
      layoutBounds.push([0, 0, 100, 100]);
      layoutText.push(def.textContent ? getIdx(def.textContent) : -1);
    }
  }

  return {
    documents: [
      {
        documentURL: { index: getIdx("") },
        title: { index: getIdx("") },
        baseURL: { index: getIdx("") },
        contentLanguage: { index: getIdx("") },
        encodingName: { index: getIdx("") },
        publicId: { index: getIdx("") },
        systemId: { index: getIdx("") },
        frameId: { index: getIdx("") },
        nodes: {
          parentIndex: parentIndices,
          nodeType: nodeTypes,
          nodeName: nodeNames,
          nodeValue: nodeNames.map(() => -1),
          backendNodeId: backendNodeIds,
          attributes,
          ...(pseudoTypeIndices.length > 0
            ? {
                pseudoType: {
                  index: pseudoTypeIndices,
                  value: pseudoTypeValues,
                },
              }
            : {}),
        },
        layout: {
          nodeIndex: layoutNodeIndex,
          styles: layoutStyles,
          bounds: layoutBounds,
          text: layoutText,
          stackingContexts: [],
        },
      },
    ],
    strings,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("parseSnapshot — pseudoType parsing", () => {
  it("sets nodeName to '::before' when pseudoType is 'before'", () => {
    const snapshot = buildSnapshot([
      // Node 0: <body>
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      // Node 1: <i> element
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
      // Node 2: ::before pseudo-element (CDP reports nodeName as "I" or empty, pseudoType as "before")
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 1,
        backendNodeId: 3,
        pseudoType: "before",
        textContent: "\uf03e",
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    // Node 2 should have nodeName "::before" (not "i")
    expect(nodes[2].nodeName).toBe("::before");
  });

  it("sets nodeName to '::after' when pseudoType is 'after'", () => {
    const snapshot = buildSnapshot([
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      {
        nodeName: "SPAN",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
      {
        nodeName: "SPAN",
        nodeType: 1,
        parentIndex: 1,
        backendNodeId: 3,
        pseudoType: "after",
        textContent: "\ue87c",
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    expect(nodes[2].nodeName).toBe("::after");
  });

  it("sets nodeType to -1 for pseudo-elements", () => {
    const snapshot = buildSnapshot([
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 1,
        backendNodeId: 3,
        pseudoType: "before",
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    // Pseudo-element should have nodeType -1
    expect(nodes[2].nodeType).toBe(-1);
    // Parent <i> should remain nodeType 1
    expect(nodes[1].nodeType).toBe(1);
  });

  it("leaves non-pseudo nodes unchanged", () => {
    const snapshot = buildSnapshot([
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      {
        nodeName: "DIV",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
      {
        nodeName: "P",
        nodeType: 1,
        parentIndex: 1,
        backendNodeId: 3,
      },
      // Text node
      {
        nodeName: "#text",
        nodeType: 3,
        parentIndex: 2,
        backendNodeId: 4,
        textContent: "Hello",
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    expect(nodes[0].nodeName).toBe("body");
    expect(nodes[0].nodeType).toBe(1);
    expect(nodes[1].nodeName).toBe("div");
    expect(nodes[1].nodeType).toBe(1);
    expect(nodes[2].nodeName).toBe("p");
    expect(nodes[2].nodeType).toBe(1);
    expect(nodes[3].nodeName).toBe("#text");
    expect(nodes[3].nodeType).toBe(3);
  });

  it("preserves textContent for pseudo-elements", () => {
    const snapshot = buildSnapshot([
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 1,
        backendNodeId: 3,
        pseudoType: "before",
        textContent: "\uf03e",
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    // Pseudo-element should have correct nodeName AND keep textContent
    expect(nodes[2].nodeName).toBe("::before");
    expect(nodes[2].textContent).toBe("\uf03e");
  });

  it("handles ::marker pseudo-type", () => {
    const snapshot = buildSnapshot([
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      {
        nodeName: "LI",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
      {
        nodeName: "LI",
        nodeType: 1,
        parentIndex: 1,
        backendNodeId: 3,
        pseudoType: "marker",
        textContent: "•",
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    expect(nodes[2].nodeName).toBe("::marker");
    expect(nodes[2].nodeType).toBe(-1);
  });

  it("handles multiple pseudo-elements in same snapshot", () => {
    const snapshot = buildSnapshot([
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      // First <i> with ::before
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
      {
        nodeName: "I",
        nodeType: 1,
        parentIndex: 1,
        backendNodeId: 3,
        pseudoType: "before",
        textContent: "\uf03e",
      },
      // Second <span> with ::after
      {
        nodeName: "SPAN",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 4,
      },
      {
        nodeName: "SPAN",
        nodeType: 1,
        parentIndex: 3,
        backendNodeId: 5,
        pseudoType: "after",
        textContent: "\uf007",
      },
      // Regular div — no pseudo
      {
        nodeName: "DIV",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 6,
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    // ::before
    expect(nodes[2].nodeName).toBe("::before");
    expect(nodes[2].nodeType).toBe(-1);
    // ::after
    expect(nodes[4].nodeName).toBe("::after");
    expect(nodes[4].nodeType).toBe(-1);
    // Regular div unchanged
    expect(nodes[5].nodeName).toBe("div");
    expect(nodes[5].nodeType).toBe(1);
  });

  it("does not create pseudoType data when snapshot has no pseudo-elements", () => {
    const snapshot = buildSnapshot([
      {
        nodeName: "BODY",
        nodeType: 1,
        parentIndex: -1,
        backendNodeId: 1,
      },
      {
        nodeName: "DIV",
        nodeType: 1,
        parentIndex: 0,
        backendNodeId: 2,
      },
    ]);

    const { nodes } = parseSnapshot(snapshot);

    // All nodes should keep original names
    expect(nodes[0].nodeName).toBe("body");
    expect(nodes[1].nodeName).toBe("div");
    expect(nodes.every((n) => n.nodeType !== -1)).toBe(true);
  });
});
