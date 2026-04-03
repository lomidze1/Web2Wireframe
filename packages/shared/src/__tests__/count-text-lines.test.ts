/**
 * countTextLines Unit Tests
 *
 * Tests that pseudo-elements (::marker, ::before, ::after) are filtered out
 * from line counting. Without this fix, list items with a ::marker bullet
 * would have browserLineCount inflated (e.g. 2 instead of 1), causing
 * text sizing to use browserWidth instead of hugWidth — breaking plugin font text.
 */

import { describe, it, expect } from "vitest";
import { countTextLines } from "../tree-builder";
import type { ParsedSnapshotNode, TextBoxInfo } from "../snapshot";

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

function makeTextBox(): TextBoxInfo[] {
  return [{ x: 0, y: 0, width: 100, height: 20, start: 0, length: 10 }];
}

function makeMultiLineTextBoxes(lines: number): TextBoxInfo[] {
  return Array.from({ length: lines }, (_, i) => ({
    x: 0,
    y: i * 20,
    width: 100,
    height: 20,
    start: i * 10,
    length: 10,
  }));
}

describe("countTextLines", () => {
  describe("basic counting", () => {
    it("counts single text node child as 1 line", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "LI", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "#text", nodeType: 3, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map([[0, [1]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("counts multi-line text node correctly", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "P", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "#text", nodeType: 3, textBoxes: makeMultiLineTextBoxes(3) }),
      ];
      const childrenMap = new Map([[0, [1]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(3);
    });

    it("defaults to 1 when no textBoxes found", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "DIV", nodeType: 1 }),
      ];
      const childrenMap = new Map<number, number[]>();

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });
  });

  describe("pseudo-element filtering (root cause fix)", () => {
    it("skips ::marker pseudo-element (nodeType -1)", () => {
      // <li> with ::marker bullet + text content
      // Without fix: returns 2 (1 marker + 1 text) — WRONG
      // With fix: returns 1 (only text) — CORRECT
      const nodes = [
        makeNode({ index: 0, nodeName: "LI", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "::marker", nodeType: -1, textBoxes: makeTextBox() }),
        makeNode({ index: 2, nodeName: "#text", nodeType: 3, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map([[0, [1, 2]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("skips ::before pseudo-element (nodeType -1)", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "LI", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "::before", nodeType: -1, textBoxes: makeTextBox() }),
        makeNode({ index: 2, nodeName: "#text", nodeType: 3, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map([[0, [1, 2]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("skips ::after pseudo-element (nodeType -1)", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "DIV", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "#text", nodeType: 3, textBoxes: makeTextBox() }),
        makeNode({ index: 2, nodeName: "::after", nodeType: -1, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map([[0, [1, 2]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("skips pseudo-elements by nodeName even when nodeType is not -1", () => {
      // Safety: some CDP versions may report different nodeType
      const nodes = [
        makeNode({ index: 0, nodeName: "LI", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "::marker", nodeType: 1, textBoxes: makeTextBox() }),
        makeNode({ index: 2, nodeName: "#text", nodeType: 3, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map([[0, [1, 2]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("real-world: <li> with ::marker + single-line text = 1 line", () => {
      // This is the exact scenario causing the bug:
      // "AI-powered generation" in a pricing card list item
      const nodes = [
        makeNode({ index: 0, nodeName: "LI", nodeType: 1 }),
        makeNode({
          index: 1,
          nodeName: "::marker",
          nodeType: -1,
          textBoxes: [{ x: 0, y: 2, width: 7, height: 16, start: 0, length: 1 }],
        }),
        makeNode({
          index: 2,
          nodeName: "#text",
          nodeType: 3,
          textBoxes: [{ x: 16, y: 2, width: 178, height: 21, start: 0, length: 22 }],
        }),
      ];
      const childrenMap = new Map([[0, [1, 2]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("real-world: <li> with ::marker + multi-line text = 2 lines", () => {
      // "Best for teams, agencies, and power users" wraps to 2 lines
      const nodes = [
        makeNode({ index: 0, nodeName: "LI", nodeType: 1 }),
        makeNode({
          index: 1,
          nodeName: "::marker",
          nodeType: -1,
          textBoxes: [{ x: 0, y: 2, width: 7, height: 16, start: 0, length: 1 }],
        }),
        makeNode({
          index: 2,
          nodeName: "#text",
          nodeType: 3,
          textBoxes: makeMultiLineTextBoxes(2),
        }),
      ];
      const childrenMap = new Map([[0, [1, 2]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(2);
    });
  });

  describe("parent element textBoxes (inline elements)", () => {
    it("includes parent element's own textBoxes", () => {
      // Inline element like <span> may have its own textBoxes
      const nodes = [
        makeNode({ index: 0, nodeName: "SPAN", nodeType: 1, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map<number, number[]>();

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("sums parent textBoxes with child text node textBoxes", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "SPAN", nodeType: 1, textBoxes: makeTextBox() }),
        makeNode({ index: 1, nodeName: "#text", nodeType: 3, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map([[0, [1]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(2);
    });
  });

  describe("edge cases", () => {
    it("handles node with no children in childrenMap", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "P", nodeType: 1, textBoxes: makeTextBox() }),
      ];
      const childrenMap = new Map<number, number[]>();

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("handles children with no textBoxes", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "DIV", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "SPAN", nodeType: 1 }),
      ];
      const childrenMap = new Map([[0, [1]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });

    it("handles children with empty textBoxes array", () => {
      const nodes = [
        makeNode({ index: 0, nodeName: "DIV", nodeType: 1 }),
        makeNode({ index: 1, nodeName: "#text", nodeType: 3, textBoxes: [] }),
      ];
      const childrenMap = new Map([[0, [1]]]);

      expect(countTextLines(0, nodes, childrenMap)).toBe(1);
    });
  });
});
