/**
 * BR Line Break Tests
 *
 * Tests that <br> tags in source HTML are converted to \n in the text stream,
 * preserving explicit line breaks in Figma wireframes.
 */

import { describe, it, expect } from "vitest";
import {
  collectDirectText,
  collectAllInlineText,
  collectStyledText,
  isLeafElement,
} from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 0;

function makeNode(overrides: Partial<ParsedSnapshotNode> = {}): ParsedSnapshotNode {
  const id = nextId++;
  return {
    index: id,
    backendNodeId: id,
    nodeType: 1,
    nodeName: "div",
    parentIndex: -1,
    attributes: {},
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    computedStyles: {},
    textContent: "",
    isClickable: false,
    needsMatchedStyles: false,
    ...overrides,
  };
}

function makeTextNode(text: string, parentIndex: number): ParsedSnapshotNode {
  return makeNode({
    nodeType: 3,
    nodeName: "#text",
    textContent: text,
    parentIndex,
    bounds: null,
  });
}

function makeBrNode(parentIndex: number): ParsedSnapshotNode {
  return makeNode({
    nodeType: 1,
    nodeName: "br",
    parentIndex,
    bounds: null,
  });
}

function makeElementNode(
  tag: string,
  parentIndex: number,
  styles: Record<string, string> = {},
): ParsedSnapshotNode {
  return makeNode({
    nodeType: 1,
    nodeName: tag,
    parentIndex,
    computedStyles: styles,
  });
}

/**
 * Build a childrenMap from a nodes array based on parentIndex.
 */
function buildChildrenMap(nodes: ParsedSnapshotNode[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentIndex >= 0) {
      const siblings = map.get(node.parentIndex) || [];
      siblings.push(node.index);
      map.set(node.parentIndex, siblings);
    }
  }
  return map;
}

// Reset IDs before each test
import { beforeEach } from "vitest";
beforeEach(() => {
  nextId = 0;
});

// ---------------------------------------------------------------------------
// collectDirectText
// ---------------------------------------------------------------------------

describe("collectDirectText — <br> handling", () => {
  it("converts single <br> between text to \\n", () => {
    // <p>Line 1<br>Line 2</p>
    const parent = makeNode({ nodeName: "p" });
    const text1 = makeTextNode("Line 1", parent.index);
    const br = makeBrNode(parent.index);
    const text2 = makeTextNode("Line 2", parent.index);

    const nodes = [parent, text1, br, text2];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectDirectText(parent.index, nodes, childrenMap);
    expect(result).toBe("Line 1\nLine 2");
  });

  it("converts double <br> to double \\n", () => {
    // <p>Line 1<br><br>Line 2</p>
    const parent = makeNode({ nodeName: "p" });
    const text1 = makeTextNode("Line 1", parent.index);
    const br1 = makeBrNode(parent.index);
    const br2 = makeBrNode(parent.index);
    const text2 = makeTextNode("Line 2", parent.index);

    const nodes = [parent, text1, br1, br2, text2];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectDirectText(parent.index, nodes, childrenMap);
    expect(result).toBe("Line 1\n\nLine 2");
  });

  it("normalizes source \\n in TEXT_NODE to space (not line break)", () => {
    // <p>Hello\n  World</p> — source whitespace, NOT a <br>
    const parent = makeNode({ nodeName: "p" });
    const text = makeTextNode("Hello\n  World", parent.index);

    const nodes = [parent, text];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectDirectText(parent.index, nodes, childrenMap);
    expect(result).toBe("Hello World");
  });

  it("handles trailing <br>", () => {
    // <p>Text<br></p>
    const parent = makeNode({ nodeName: "p" });
    const text = makeTextNode("Text", parent.index);
    const br = makeBrNode(parent.index);

    const nodes = [parent, text, br];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectDirectText(parent.index, nodes, childrenMap);
    expect(result).toBe("Text\n");
  });

  it("handles leading <br>", () => {
    // <p><br>Text</p>
    const parent = makeNode({ nodeName: "p" });
    const br = makeBrNode(parent.index);
    const text = makeTextNode("Text", parent.index);

    const nodes = [parent, br, text];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectDirectText(parent.index, nodes, childrenMap);
    expect(result).toBe("\nText");
  });
});

// ---------------------------------------------------------------------------
// collectAllInlineText
// ---------------------------------------------------------------------------

describe("collectAllInlineText — <br> handling", () => {
  it("converts <br> to \\n in nested inline context", () => {
    // <li>Line 1<br>Line 2</li>
    const parent = makeNode({ nodeName: "li" });
    const text1 = makeTextNode("Line 1", parent.index);
    const br = makeBrNode(parent.index);
    const text2 = makeTextNode("Line 2", parent.index);

    const nodes = [parent, text1, br, text2];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectAllInlineText(parent.index, nodes, childrenMap);
    expect(result).toContain("Line 1");
    expect(result).toContain("\n");
    expect(result).toContain("Line 2");
  });

  it("returns \\n for a standalone <br> node", () => {
    const br = makeBrNode(-1);
    const nodes = [br];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectAllInlineText(br.index, nodes, childrenMap);
    expect(result).toBe("\n");
  });

  it("normalizes source \\n within inline text", () => {
    // <span>Hello\nWorld</span>
    const parent = makeNode({ nodeName: "span" });
    const text = makeTextNode("Hello\nWorld", parent.index);

    const nodes = [parent, text];
    const childrenMap = buildChildrenMap(nodes);

    const result = collectAllInlineText(parent.index, nodes, childrenMap);
    expect(result).not.toContain("\n");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });
});

// ---------------------------------------------------------------------------
// collectStyledText
// ---------------------------------------------------------------------------

describe("collectStyledText — <br> handling", () => {
  const defaultStyles = {
    color: "#000000",
    fontWeight: 400,
    fontSize: 16,
    fontFamily: "Arial",
  };

  it("inserts \\n into segment text at <br>", () => {
    // <h2>Contact us<br>for help</h2>
    const parent = makeNode({ nodeName: "h2" });
    const text1 = makeTextNode("Contact us", parent.index);
    const br = makeBrNode(parent.index);
    const text2 = makeTextNode("for help", parent.index);

    const nodes = [parent, text1, br, text2];
    const childrenMap = buildChildrenMap(nodes);

    const segments = collectStyledText(parent.index, nodes, childrenMap, defaultStyles);
    const fullText = segments.map((s) => s.text).join("");
    expect(fullText).toContain("\n");
    expect(fullText).toContain("Contact us");
    expect(fullText).toContain("for help");
  });

  it("handles <br> between text and inline element", () => {
    // <h2>Normal<br><a>Link</a></h2>
    const parent = makeNode({ nodeName: "h2" });
    const text1 = makeTextNode("Normal", parent.index);
    const br = makeBrNode(parent.index);
    const link = makeElementNode("a", parent.index, {
      color: "rgb(0, 102, 204)",
      "font-weight": "700",
      "font-size": "24px",
      "font-family": "Arial",
    });
    const linkText = makeTextNode("Link", link.index);

    const nodes = [parent, text1, br, link, linkText];
    const childrenMap = buildChildrenMap(nodes);

    const segments = collectStyledText(parent.index, nodes, childrenMap, defaultStyles);
    const fullText = segments.map((s) => s.text).join("");
    expect(fullText).toContain("Normal");
    expect(fullText).toContain("\n");
    expect(fullText).toContain("Link");
  });

  it("handles double <br> in styled text", () => {
    // <p>First<br><br>Second</p>
    const parent = makeNode({ nodeName: "p" });
    const text1 = makeTextNode("First", parent.index);
    const br1 = makeBrNode(parent.index);
    const br2 = makeBrNode(parent.index);
    const text2 = makeTextNode("Second", parent.index);

    const nodes = [parent, text1, br1, br2, text2];
    const childrenMap = buildChildrenMap(nodes);

    const segments = collectStyledText(parent.index, nodes, childrenMap, defaultStyles);
    const fullText = segments.map((s) => s.text).join("");
    expect(fullText).toContain("\n\n");
  });
});

// ---------------------------------------------------------------------------
// isLeafElement
// ---------------------------------------------------------------------------

describe("isLeafElement — <br> handling", () => {
  it("returns true when children are TEXT + BR only", () => {
    // <div>Line 1<br>Line 2</div> — still a leaf text element
    const parent = makeNode({ nodeName: "div" });
    const text1 = makeTextNode("Line 1", parent.index);
    const br = makeBrNode(parent.index);
    const text2 = makeTextNode("Line 2", parent.index);

    const nodes = [parent, text1, br, text2];
    const childrenMap = buildChildrenMap(nodes);

    expect(isLeafElement(parent.index, nodes, childrenMap)).toBe(true);
  });

  it("returns false when non-br element children exist", () => {
    // <div>Text<span>child</span></div>
    const parent = makeNode({ nodeName: "div" });
    const text = makeTextNode("Text", parent.index);
    const span = makeElementNode("span", parent.index);

    const nodes = [parent, text, span];
    const childrenMap = buildChildrenMap(nodes);

    expect(isLeafElement(parent.index, nodes, childrenMap)).toBe(false);
  });

  it("returns true when only text children", () => {
    const parent = makeNode({ nodeName: "p" });
    const text = makeTextNode("Hello", parent.index);

    const nodes = [parent, text];
    const childrenMap = buildChildrenMap(nodes);

    expect(isLeafElement(parent.index, nodes, childrenMap)).toBe(true);
  });

  it("returns false when pseudo-element children exist (::marker, ::before, ::after)", () => {
    // <li>::marker + "text"</li> — NOT a leaf because ::marker is a pseudo child
    const parent = makeNode({ nodeName: "li" });
    const marker = makeNode({
      nodeName: "::marker",
      nodeType: -1,
      parentIndex: parent.index,
      textContent: "\u2022",
    });
    const text = makeTextNode("Item text", parent.index);

    const nodes = [parent, marker, text];
    const childrenMap = buildChildrenMap(nodes);

    expect(isLeafElement(parent.index, nodes, childrenMap)).toBe(false);
  });
});
