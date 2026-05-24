/**
 * parseMultiDocSnapshot — Multi-document Snapshot Parsing Tests
 *
 * DOMSnapshot.captureSnapshot returns multiple documents when the page has
 * same-origin iframes. documents[0] is the main page, documents[1..N] are
 * iframe contents. parseMultiDocSnapshot() parses all documents and returns
 * a ParsedDocumentMap with the main document and iframe documents.
 */

import { describe, it, expect } from "vitest";
import { parseSnapshot, parseMultiDocSnapshot } from "../snapshot";
import type { CaptureSnapshotResult, SnapshotDocument } from "../snapshot";

// ============================================================================
// Helpers
// ============================================================================

function buildMultiDocSnapshot(
  mainNodes: Array<{ nodeName: string; nodeType: number; parentIndex: number; backendNodeId: number }>,
  iframeDocuments: Array<{
    nodes: Array<{ nodeName: string; nodeType: number; parentIndex: number; backendNodeId: number }>;
    url?: string;
  }>
): CaptureSnapshotResult {
  // Merge all strings from all documents
  const allStrings = new Map<string, number>();
  function addStr(s: string): number {
    if (!allStrings.has(s)) allStrings.set(s, allStrings.size);
    return allStrings.get(s)!;
  }

  addStr(""); // index 0

  // Collect strings from main doc
  for (const n of mainNodes) addStr(n.nodeName);
  // Collect strings from iframe docs
  for (const iDoc of iframeDocuments) {
    if (iDoc.url) addStr(iDoc.url);
    for (const n of iDoc.nodes) addStr(n.nodeName);
  }

  const strings = Array.from(allStrings.keys());
  const getIdx = (s: string) => strings.indexOf(s);

  function buildDocFromNodes(
    nodeDefs: Array<{ nodeName: string; nodeType: number; parentIndex: number; backendNodeId: number }>,
    docUrl = ""
  ): SnapshotDocument {
    return {
      documentURL: { index: getIdx(docUrl || "") },
      title: { index: 0 },
      baseURL: { index: 0 },
      contentLanguage: { index: 0 },
      encodingName: { index: 0 },
      publicId: { index: 0 },
      systemId: { index: 0 },
      frameId: { index: 0 },
      nodes: {
        parentIndex: nodeDefs.map(n => n.parentIndex),
        nodeType: nodeDefs.map(n => n.nodeType),
        nodeName: nodeDefs.map(n => getIdx(n.nodeName)),
        nodeValue: nodeDefs.map(() => -1),
        backendNodeId: nodeDefs.map(n => n.backendNodeId),
        attributes: nodeDefs.map(() => []),
      },
      layout: {
        nodeIndex: nodeDefs.map((_, i) => i),
        styles: nodeDefs.map(() => []),
        bounds: nodeDefs.map(() => [0, 0, 100, 50]),
        text: nodeDefs.map(() => -1),
        stackingContexts: [],
      },
      textBoxes: { layoutIndex: [], bounds: [], start: [], length: [] },
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      contentWidth: 1920,
      contentHeight: 1080,
    };
  }

  const documents: SnapshotDocument[] = [
    buildDocFromNodes(mainNodes),
    ...iframeDocuments.map(iDoc => buildDocFromNodes(iDoc.nodes, iDoc.url)),
  ];

  return { documents, strings };
}

// ============================================================================
// Tests
// ============================================================================

describe("parseMultiDocSnapshot — single document", () => {
  it("returns same result as parseSnapshot for single document", () => {
    const mainNodes = [
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "DIV", nodeType: 1, parentIndex: 0, backendNodeId: 2 },
    ];

    const snapshot = buildMultiDocSnapshot(mainNodes, []);
    const singleResult = parseSnapshot(snapshot);
    const multiResult = parseMultiDocSnapshot(snapshot);

    // Main document nodes should match
    expect(multiResult.nodes.length).toBe(singleResult.nodes.length);
    expect(multiResult.nodes[0].nodeName).toBe(singleResult.nodes[0].nodeName);
    expect(multiResult.nodes[1].nodeName).toBe(singleResult.nodes[1].nodeName);
    expect(multiResult.iframeDocuments.size).toBe(0);
  });
});

describe("parseMultiDocSnapshot — multi-document (main + iframe)", () => {
  it("parses iframe document into iframeDocuments map", () => {
    const mainNodes = [
      { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
      { nodeName: "IFRAME", nodeType: 1, parentIndex: 0, backendNodeId: 2 },
    ];
    const iframeNodes = [
      { nodeName: "HTML", nodeType: 1, parentIndex: -1, backendNodeId: 100 },
      { nodeName: "BODY", nodeType: 1, parentIndex: 0, backendNodeId: 101 },
      { nodeName: "P", nodeType: 1, parentIndex: 1, backendNodeId: 102 },
    ];

    const snapshot = buildMultiDocSnapshot(mainNodes, [
      { nodes: iframeNodes, url: "https://example.com/iframe.html" },
    ]);

    const result = parseMultiDocSnapshot(snapshot);

    // Main document
    expect(result.nodes.length).toBe(2);
    expect(result.nodes[0].nodeName).toBe("body");

    // Iframe document
    expect(result.iframeDocuments.size).toBe(1);
    const iframeDoc = result.iframeDocuments.get(1);
    expect(iframeDoc).toBeDefined();
    expect(iframeDoc!.nodes.length).toBe(3);
    expect(iframeDoc!.nodes[2].nodeName).toBe("p");
  });

  it("extracts iframe documentURL correctly", () => {
    const snapshot = buildMultiDocSnapshot(
      [{ nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 }],
      [
        {
          nodes: [{ nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 50 }],
          url: "https://cdn.example.com/widget.html",
        },
      ]
    );

    const result = parseMultiDocSnapshot(snapshot);
    const iframeDoc = result.iframeDocuments.get(1);
    expect(iframeDoc!.documentURL).toBe("https://cdn.example.com/widget.html");
  });

  it("merges iframe nodes into nodesByBackendId", () => {
    const snapshot = buildMultiDocSnapshot(
      [
        { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 },
        { nodeName: "DIV", nodeType: 1, parentIndex: 0, backendNodeId: 2 },
      ],
      [
        {
          nodes: [
            { nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 100 },
            { nodeName: "SPAN", nodeType: 1, parentIndex: 0, backendNodeId: 101 },
          ],
        },
      ]
    );

    const result = parseMultiDocSnapshot(snapshot);

    // Main document nodes
    expect(result.nodesByBackendId.get(1)).toBeDefined();
    expect(result.nodesByBackendId.get(2)).toBeDefined();
    // Iframe document nodes
    expect(result.nodesByBackendId.get(100)).toBeDefined();
    expect(result.nodesByBackendId.get(101)).toBeDefined();
    expect(result.nodesByBackendId.get(101)!.nodeName).toBe("span");
  });

  it("handles empty iframe document gracefully", () => {
    const snapshot = buildMultiDocSnapshot(
      [{ nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 }],
      [{ nodes: [] }]
    );

    const result = parseMultiDocSnapshot(snapshot);
    const iframeDoc = result.iframeDocuments.get(1);
    expect(iframeDoc).toBeDefined();
    expect(iframeDoc!.nodes.length).toBe(0);
  });

  it("parses multiple iframe documents", () => {
    const snapshot = buildMultiDocSnapshot(
      [{ nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 1 }],
      [
        { nodes: [{ nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 50 }], url: "https://a.com" },
        { nodes: [{ nodeName: "BODY", nodeType: 1, parentIndex: -1, backendNodeId: 60 }], url: "https://b.com" },
      ]
    );

    const result = parseMultiDocSnapshot(snapshot);
    expect(result.iframeDocuments.size).toBe(2);
    expect(result.iframeDocuments.get(1)).toBeDefined();
    expect(result.iframeDocuments.get(2)).toBeDefined();
  });
});
