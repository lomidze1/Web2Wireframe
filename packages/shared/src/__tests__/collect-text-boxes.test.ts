/**
 * collectTextBoxes Unit Tests
 *
 * Tests that ::before/::after pseudo-elements are filtered out
 * so that text positioning (textBounds.x) is correct for list items.
 */

import { describe, it, expect } from "vitest";
import { collectTextBoxes } from "../tree-builder";
import type { ParsedSnapshotNode, TextBoxInfo } from "../snapshot";

/**
 * Helper to create a minimal ParsedSnapshotNode
 */
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

function makeTextBoxes(x: number, y: number, w: number, h: number): TextBoxInfo[] {
  return [{ x, y, width: w, height: h, start: 0, length: 1 }];
}

describe("collectTextBoxes", () => {
  describe("pseudo-element filtering", () => {
    it("should skip ::before pseudo-element textBoxes", () => {
      // Parent li at (100, 200) with width 340, height 26
      const parentBounds = { x: 100, y: 200, width: 340, height: 26 };

      const nodes: ParsedSnapshotNode[] = [
        // index 0: parent li
        makeNode({ index: 0, nodeName: "LI", bounds: parentBounds }),
        // index 1: ::before with bullet "•" at x=100 (parent's left edge)
        makeNode({
          index: 1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "•",
          textBoxes: makeTextBoxes(100, 202, 6, 21),
        }),
        // index 2: #text with actual content at x=116 (parent + 16px padding)
        makeNode({
          index: 2,
          nodeName: "#text",
          nodeType: 3,
          parentIndex: 0,
          textContent: "Some text content",
          textBoxes: makeTextBoxes(116, 202, 158, 21),
        }),
      ];

      const childrenMap = new Map<number, number[]>();
      childrenMap.set(0, [1, 2]);

      const result = collectTextBoxes(0, nodes, childrenMap, parentBounds, 1);

      expect(result).not.toBeNull();
      // x should be 16 (text position - parent position), NOT 0
      expect(result!.x).toBe(16);
      expect(result!.width).toBe(158);
    });

    it("should skip ::after pseudo-element textBoxes", () => {
      const parentBounds = { x: 50, y: 100, width: 400, height: 30 };

      const nodes: ParsedSnapshotNode[] = [
        makeNode({ index: 0, nodeName: "DIV", bounds: parentBounds }),
        makeNode({
          index: 1,
          nodeName: "#text",
          nodeType: 3,
          parentIndex: 0,
          textContent: "Main content",
          textBoxes: makeTextBoxes(50, 100, 200, 25),
        }),
        makeNode({
          index: 2,
          nodeName: "::after",
          parentIndex: 0,
          textContent: "→",
          textBoxes: makeTextBoxes(260, 100, 15, 25),
        }),
      ];

      const childrenMap = new Map<number, number[]>();
      childrenMap.set(0, [1, 2]);

      const result = collectTextBoxes(0, nodes, childrenMap, parentBounds, 1);

      expect(result).not.toBeNull();
      // x should be 0 (text starts at parent left), width should be 200 (only #text)
      expect(result!.x).toBe(0);
      expect(result!.width).toBe(200);
    });

    it("should return null when all children are pseudo-elements", () => {
      const parentBounds = { x: 100, y: 200, width: 340, height: 26 };

      const nodes: ParsedSnapshotNode[] = [
        makeNode({ index: 0, nodeName: "LI", bounds: parentBounds }),
        makeNode({
          index: 1,
          nodeName: "::before",
          parentIndex: 0,
          textContent: "•",
          textBoxes: makeTextBoxes(100, 202, 6, 21),
        }),
      ];

      const childrenMap = new Map<number, number[]>();
      childrenMap.set(0, [1]);

      const result = collectTextBoxes(0, nodes, childrenMap, parentBounds, 1);

      // No real text children → null
      expect(result).toBeNull();
    });

    it("should include regular element textBoxes", () => {
      const parentBounds = { x: 0, y: 0, width: 500, height: 40 };

      const nodes: ParsedSnapshotNode[] = [
        makeNode({ index: 0, nodeName: "DIV", bounds: parentBounds }),
        makeNode({
          index: 1,
          nodeName: "SPAN",
          parentIndex: 0,
          textContent: "Hello",
          textBoxes: makeTextBoxes(10, 5, 100, 20),
        }),
        makeNode({
          index: 2,
          nodeName: "#text",
          nodeType: 3,
          parentIndex: 0,
          textContent: "World",
          textBoxes: makeTextBoxes(120, 5, 80, 20),
        }),
      ];

      const childrenMap = new Map<number, number[]>();
      childrenMap.set(0, [1, 2]);

      const result = collectTextBoxes(0, nodes, childrenMap, parentBounds, 1);

      expect(result).not.toBeNull();
      // minX = 10, maxX = 120+80 = 200
      expect(result!.x).toBe(10);
      expect(result!.width).toBe(190);
    });

    it("should handle browserDpr scaling", () => {
      const parentBounds = { x: 200, y: 400, width: 680, height: 52 };

      const nodes: ParsedSnapshotNode[] = [
        makeNode({ index: 0, nodeName: "LI", bounds: parentBounds }),
        makeNode({
          index: 1,
          nodeName: "::before",
          parentIndex: 0,
          textBoxes: makeTextBoxes(200, 404, 12, 42),
        }),
        makeNode({
          index: 2,
          nodeName: "#text",
          nodeType: 3,
          parentIndex: 0,
          textBoxes: makeTextBoxes(232, 404, 316, 42),
        }),
      ];

      const childrenMap = new Map<number, number[]>();
      childrenMap.set(0, [1, 2]);

      // browserDpr = 2
      const result = collectTextBoxes(0, nodes, childrenMap, parentBounds, 2);

      expect(result).not.toBeNull();
      // x = (232 - 200) / 2 = 16
      expect(result!.x).toBe(16);
      // width = 316 / 2 = 158
      expect(result!.width).toBe(158);
    });
  });

  describe("without pseudo-elements (regression)", () => {
    it("should work normally for elements without pseudo-elements", () => {
      const parentBounds = { x: 0, y: 0, width: 300, height: 24 };

      const nodes: ParsedSnapshotNode[] = [
        makeNode({ index: 0, nodeName: "P", bounds: parentBounds }),
        makeNode({
          index: 1,
          nodeName: "#text",
          nodeType: 3,
          parentIndex: 0,
          textBoxes: makeTextBoxes(0, 0, 250, 20),
        }),
      ];

      const childrenMap = new Map<number, number[]>();
      childrenMap.set(0, [1]);

      const result = collectTextBoxes(0, nodes, childrenMap, parentBounds, 1);

      expect(result).not.toBeNull();
      expect(result!.x).toBe(0);
      expect(result!.width).toBe(250);
    });

    it("should return null when no children have textBoxes", () => {
      const parentBounds = { x: 0, y: 0, width: 300, height: 100 };

      const nodes: ParsedSnapshotNode[] = [
        makeNode({ index: 0, nodeName: "DIV", bounds: parentBounds }),
        makeNode({
          index: 1,
          nodeName: "DIV",
          parentIndex: 0,
        }),
      ];

      const childrenMap = new Map<number, number[]>();
      childrenMap.set(0, [1]);

      const result = collectTextBoxes(0, nodes, childrenMap, parentBounds, 1);

      expect(result).toBeNull();
    });
  });
});
