/**
 * parseSnapshot — shadowRootType & contentDocumentIndex Parsing Tests
 *
 * DOMSnapshot.captureSnapshot returns:
 * - `shadowRootType` as RareStringData (values: "open" | "closed")
 * - `contentDocumentIndex` as RareIntegerData (index into documents[] array)
 *
 * These tests verify that parseSnapshot() correctly reads both fields
 * and populates them on ParsedSnapshotNode.
 */

import { describe, it, expect } from "vitest";
import { parseSnapshot } from "../snapshot";
import type { CaptureSnapshotResult } from "../snapshot";

// ============================================================================
// Helpers — build minimal CDP snapshot structures
// ============================================================================

function buildSnapshot(
  nodeDefs: Array<{
    nodeName: string;
    nodeType: number;
    parentIndex: number;
    backendNodeId: number;
    shadowRootType?: string;
    contentDocumentIndex?: number;
    pseudoType?: string;
  }>
): CaptureSnapshotResult {
  const stringsSet = new Map<string, number>();
  function addString(s: string): number {
    if (!stringsSet.has(s)) stringsSet.set(s, stringsSet.size);
    return stringsSet.get(s)!;
  }

  addString("");

  for (const def of nodeDefs) {
    addString(def.nodeName);
    if (def.shadowRootType) addString(def.shadowRootType);
    if (def.pseudoType) addString(def.pseudoType);
  }

  const strings = Array.from(stringsSet.keys());
  const getIdx = (s: string) => strings.indexOf(s);

  const nodeNames: number[] = [];
  const nodeTypes: number[] = [];
  const parentIndices: number[] = [];
  const backendNodeIds: number[] = [];
  const attributes: number[][] = [];

  // RareStringData for shadowRootType
  const shadowRootTypeIndices: number[] = [];
  const shadowRootTypeValues: number[] = [];

  // RareIntegerData for contentDocumentIndex
  const contentDocIndexIndices: number[] = [];
  const contentDocIndexValues: number[] = [];

  // RareStringData for pseudoType
  const pseudoTypeIndices: number[] = [];
  const pseudoTypeValues: number[] = [];

  for (let i = 0; i < nodeDefs.length; i++) {
    const def = nodeDefs[i];
    nodeNames.push(getIdx(def.nodeName));
    nodeTypes.push(def.nodeType);
    parentIndices.push(def.parentIndex);
    backendNodeIds.push(def.backendNodeId);
    attributes.push([]);

    if (def.shadowRootType) {
      shadowRootTypeIndices.push(i);
      shadowRootTypeValues.push(getIdx(def.shadowRootType));
    }
    if (def.contentDocumentIndex !== undefined) {
      contentDocIndexIndices.push(i);
      contentDocIndexValues.push(def.contentDocumentIndex);
    }
    if (def.pseudoType) {
      pseudoTypeIndices.push(i);
      pseudoTypeValues.push(getIdx(def.pseudoType));
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
          ...(shadowRootTypeIndices.length > 0
            ? { shadowRootType: { index: shadowRootTypeIndices, value: shadowRootTypeValues } }
            : {}),
          ...(contentDocIndexIndices.length > 0
            ? { contentDocumentIndex: { index: contentDocIndexIndices, value: contentDocIndexValues } }
            : {}),
          ...(pseudoTypeIndices.length > 0
            ? { pseudoType: { index: pseudoTypeIndices, value: pseudoTypeValues } }
            : {}),
        },
        layout: {
          nodeIndex: nodeDefs.map((_, i) => i),
          styles: nodeDefs.map(() => []),
          bounds: nodeDefs.map(() => [0, 0, 100, 100]),
          text: nodeDefs.map(() => -1),
          stackingContexts: [],
        },
        textBoxes: { layoutIndex: [], bounds: [], start: [], length: [] },
        scrollOffsetX: 0,
        scrollOffsetY: 0,
        contentWidth: 1920,
        contentHeight: 1080,
      },
    ],
    strings,
  };
}

// ============================================================================
// Tests: shadowRootType
// ============================================================================

describe("parseSnapshot — shadowRootType parsing", () => {
  it("sets shadowRootType to 'open' for open shadow root", () => {
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "MY-COMPONENT", nodeType: 1, parentIndex: 0, backendNodeId: 2, shadowRootType: "open" },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[1].shadowRootType).toBe("open");
  });

  it("sets shadowRootType to 'closed' for closed shadow root", () => {
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "MY-WIDGET", nodeType: 1, parentIndex: 0, backendNodeId: 2, shadowRootType: "closed" },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[1].shadowRootType).toBe("closed");
  });

  it("leaves shadowRootType undefined for non-shadow nodes", () => {
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "DIV", nodeType: 1, parentIndex: 0, backendNodeId: 2 },
      { nodeName: "P", nodeType: 1, parentIndex: 1, backendNodeId: 3 },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[0].shadowRootType).toBeUndefined();
    expect(nodes[1].shadowRootType).toBeUndefined();
    expect(nodes[2].shadowRootType).toBeUndefined();
  });

  it("handles multiple shadow hosts in one snapshot", () => {
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "MY-NAV", nodeType: 1, parentIndex: 0, backendNodeId: 2, shadowRootType: "open" },
      { nodeName: "MY-FOOTER", nodeType: 1, parentIndex: 0, backendNodeId: 3, shadowRootType: "closed" },
      { nodeName: "DIV", nodeType: 1, parentIndex: 0, backendNodeId: 4 },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[1].shadowRootType).toBe("open");
    expect(nodes[2].shadowRootType).toBe("closed");
    expect(nodes[3].shadowRootType).toBeUndefined();
  });
});

// ============================================================================
// Tests: contentDocumentIndex
// ============================================================================

describe("parseSnapshot — contentDocumentIndex parsing", () => {
  it("sets contentDocumentIndex for iframe node", () => {
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "IFRAME", nodeType: 1, parentIndex: 0, backendNodeId: 2, contentDocumentIndex: 1 },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[1].contentDocumentIndex).toBe(1);
  });

  it("leaves contentDocumentIndex undefined for non-iframe nodes", () => {
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "DIV", nodeType: 1, parentIndex: 0, backendNodeId: 2 },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[0].contentDocumentIndex).toBeUndefined();
    expect(nodes[1].contentDocumentIndex).toBeUndefined();
  });

  it("handles contentDocumentIndex: 0 correctly", () => {
    // Edge case: index 0 is falsy but valid
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "IFRAME", nodeType: 1, parentIndex: 0, backendNodeId: 2, contentDocumentIndex: 0 },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[1].contentDocumentIndex).toBe(0);
  });

  it("handles multiple iframes with different document indices", () => {
    const snapshot = buildSnapshot([
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "IFRAME", nodeType: 1, parentIndex: 0, backendNodeId: 2, contentDocumentIndex: 1 },
      { nodeName: "IFRAME", nodeType: 1, parentIndex: 0, backendNodeId: 3, contentDocumentIndex: 2 },
      // Cross-origin iframe — no contentDocumentIndex
      { nodeName: "IFRAME", nodeType: 1, parentIndex: 0, backendNodeId: 4 },
    ]);

    const { nodes } = parseSnapshot(snapshot);
    expect(nodes[1].contentDocumentIndex).toBe(1);
    expect(nodes[2].contentDocumentIndex).toBe(2);
    expect(nodes[3].contentDocumentIndex).toBeUndefined();
  });
});
