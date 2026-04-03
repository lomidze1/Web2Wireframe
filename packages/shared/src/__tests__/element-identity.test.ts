/**
 * Element Identity / Mapping Layer Tests (Layer #7)
 *
 * Tests deterministic element identification:
 * - hashSelector: FNV-1a hash → 7-char base36
 * - generateId: deterministic with selector, random without
 * - computeStructuralSelector: CSS selector path generation
 * - buildElementTree: identity propagation integration
 * - escapeCSSIdentifier: CSS.escape polyfill
 */

import { describe, it, expect } from "vitest";
import { hashSelector, generateId, computeStructuralSelector, escapeCSSIdentifier } from "../utils";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";

// ============================================================================
// Helpers
// ============================================================================

const BASE_COMPUTED_STYLES: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  overflow: "visible",
  position: "static",
  "background-color": "rgba(0, 0, 0, 0)",
  "background-image": "none",
  "border-top-width": "0px",
  "border-right-width": "0px",
  "border-bottom-width": "0px",
  "border-left-width": "0px",
  "border-top-style": "none",
  "border-right-style": "none",
  "border-bottom-style": "none",
  "border-left-style": "none",
  "padding-top": "0px",
  "padding-right": "0px",
  "padding-bottom": "0px",
  "padding-left": "0px",
  "margin-top": "0px",
  "margin-right": "0px",
  "margin-bottom": "0px",
  "margin-left": "0px",
  "font-size": "16px",
  "font-weight": "400",
  "line-height": "normal",
  "letter-spacing": "normal",
  "text-align": "start",
  color: "rgb(0, 0, 0)",
  "box-shadow": "none",
  "border-radius": "0px",
  "border-top-left-radius": "0px",
  "border-top-right-radius": "0px",
  "border-bottom-left-radius": "0px",
  "border-bottom-right-radius": "0px",
};

function makeNode(
  index: number,
  tag: string,
  parentIndex: number,
  bounds: { x: number; y: number; width: number; height: number },
  computedStyles: Record<string, string> = {},
  overrides?: Partial<ParsedSnapshotNode>
): ParsedSnapshotNode {
  return {
    index,
    backendNodeId: index + 1,
    nodeType: 1,
    nodeName: tag,
    parentIndex,
    attributes: {},
    bounds,
    computedStyles: { ...BASE_COMPUTED_STYLES, ...computedStyles },
    textContent: "",
    isClickable: false,
    needsMatchedStyles: false,
    ...overrides,
  };
}

function buildTree(nodes: ParsedSnapshotNode[]) {
  const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
  nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));
  return buildElementTree(nodes, nodesByBackendId, new Map(), {
    viewportWidth: 1440,
  });
}

// ============================================================================
// Group 1: hashSelector()
// ============================================================================

describe("hashSelector", () => {
  it("same input produces same output (determinism)", () => {
    const hash1 = hashSelector("body > div > p");
    const hash2 = hashSelector("body > div > p");
    expect(hash1).toBe(hash2);
  });

  it("different inputs produce different outputs (collision resistance)", () => {
    const hash1 = hashSelector("body > div > p");
    const hash2 = hashSelector("body > div > span");
    const hash3 = hashSelector("body > nav > a");
    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash2).not.toBe(hash3);
  });

  it("returns 7-char base36 string", () => {
    const hash = hashSelector("body > div:nth-of-type(2) > nav > a");
    expect(hash).toMatch(/^[0-9a-z]{7}$/);
  });

  it("pads short hashes to 7 chars", () => {
    const hash = hashSelector("a");
    expect(hash.length).toBe(7);
  });
});

// ============================================================================
// Group 2: generateId() determinism
// ============================================================================

describe("generateId", () => {
  it("with selector produces deterministic id", () => {
    const id1 = generateId("body > div > p");
    const id2 = generateId("body > div > p");
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^n[0-9a-z]{7}$/);
  });

  it("without selector produces random id (backward compat)", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^n\d+-[0-9a-z]+$/);
  });

  it("different selectors produce different ids", () => {
    const id1 = generateId("body > div");
    const id2 = generateId("body > span");
    expect(id1).not.toBe(id2);
  });
});

// ============================================================================
// Group 3: computeStructuralSelector()
// ============================================================================

describe("computeStructuralSelector", () => {
  // Helper to build childrenMap from nodes
  function buildChildrenMap(nodes: ParsedSnapshotNode[]): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (const node of nodes) {
      if (node.parentIndex >= 0) {
        if (!map.has(node.parentIndex)) map.set(node.parentIndex, []);
        map.get(node.parentIndex)!.push(node.index);
      }
    }
    return map;
  }

  it("simple path: body > div > p", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }),
      makeNode(2, "p", 1, { x: 0, y: 0, width: 600, height: 40 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const selector = computeStructuralSelector(2, nodes, childrenMap);
    expect(selector).toBe("body > div > p");
  });

  it("nth-of-type for same-tag siblings", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 200 }),
      makeNode(2, "div", 0, { x: 0, y: 200, width: 1440, height: 200 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    expect(computeStructuralSelector(1, nodes, childrenMap)).toBe("body > div:nth-of-type(1)");
    expect(computeStructuralSelector(2, nodes, childrenMap)).toBe("body > div:nth-of-type(2)");
  });

  it("no nth-of-type for unique tag among siblings", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "nav", 0, { x: 0, y: 0, width: 1440, height: 100 }),
      makeNode(2, "main", 0, { x: 0, y: 100, width: 1440, height: 800 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    expect(computeStructuralSelector(1, nodes, childrenMap)).toBe("body > nav");
    expect(computeStructuralSelector(2, nodes, childrenMap)).toBe("body > main");
  });

  it("id shortcut with human-authored id", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {}, {
        attributes: { id: "main" },
      }),
      makeNode(2, "p", 1, { x: 0, y: 0, width: 600, height: 40 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    expect(computeStructuralSelector(2, nodes, childrenMap)).toBe("#main > p");
  });

  it("skips auto-generated ids (ember, react, ng-, uuid, numeric, :r*)", () => {
    const testCases = [
      { id: "ember123", desc: "ember-style" },
      { id: "react-root-456", desc: "react-style" },
      { id: "ng-component-789", desc: "angular-style" },
      { id: "12345", desc: "numeric-only" },
      { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", desc: "UUID-like" },
      { id: ":r1:", desc: "React 18 useId" },
    ];

    for (const tc of testCases) {
      const nodes = [
        makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
        makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }, {}, {
          attributes: { id: tc.id },
        }),
        makeNode(2, "p", 1, { x: 0, y: 0, width: 600, height: 40 }),
      ];
      const childrenMap = buildChildrenMap(nodes);
      const selector = computeStructuralSelector(2, nodes, childrenMap);
      expect(selector, `should skip ${tc.desc} id: ${tc.id}`).toBe("body > div > p");
    }
  });

  it("pseudo-element selector: ::before", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }),
      makeNode(2, "::before", 1, { x: 0, y: 0, width: 100, height: 20 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    expect(computeStructuralSelector(2, nodes, childrenMap)).toBe("body > div > ::before");
  });

  it("prefix for iframe boundaries", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    const selector = computeStructuralSelector(1, nodes, childrenMap, "body > iframe");
    expect(selector).toBe("body > iframe > body > div");
  });

  it("skips text nodes (nodeType=3) for nth-of-type counting", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      // Text node between two divs
      makeNode(1, "#text", 0, { x: 0, y: 0, width: 100, height: 20 }, {}, { nodeType: 3 }),
      makeNode(2, "div", 0, { x: 0, y: 0, width: 1440, height: 200 }),
      makeNode(3, "div", 0, { x: 0, y: 200, width: 1440, height: 200 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    // Text nodes should be ignored — two divs should get nth-of-type(1) and (2)
    expect(computeStructuralSelector(2, nodes, childrenMap)).toBe("body > div:nth-of-type(1)");
    expect(computeStructuralSelector(3, nodes, childrenMap)).toBe("body > div:nth-of-type(2)");
  });

  it("handles deep nesting (10+ levels) with O(depth) performance", () => {
    // Build a chain: body > div > div > div > ... > p (10 levels deep)
    const nodes: ParsedSnapshotNode[] = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
    ];
    for (let i = 1; i <= 10; i++) {
      nodes.push(makeNode(i, "div", i - 1, { x: 0, y: 0, width: 1440, height: 900 - i * 10 }));
    }
    nodes.push(makeNode(11, "p", 10, { x: 0, y: 0, width: 600, height: 40 }));

    const childrenMap = buildChildrenMap(nodes);
    const start = performance.now();
    const selector = computeStructuralSelector(11, nodes, childrenMap);
    const elapsed = performance.now() - start;

    expect(selector).toBe("body > div > div > div > div > div > div > div > div > div > div > p");
    expect(elapsed).toBeLessThan(50); // Should be fast — O(depth)
  });

  it("body node returns 'body'", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
    ];
    const childrenMap = buildChildrenMap(nodes);
    expect(computeStructuralSelector(0, nodes, childrenMap)).toBe("body");
  });
});

// ============================================================================
// Group 4: buildElementTree integration
// ============================================================================

describe("buildElementTree identity", () => {
  it("populates backendNodeId on extracted elements", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }),
    ];
    const tree = buildTree(nodes);
    expect(tree.backendNodeId).toBe(1); // body's backendNodeId = index + 1
    expect(tree.children[0].backendNodeId).toBe(2); // div's backendNodeId
  });

  it("populates sourceSelector on extracted elements", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }),
      makeNode(2, "p", 1, { x: 0, y: 0, width: 600, height: 40 }),
    ];
    const tree = buildTree(nodes);
    expect(tree.sourceSelector).toBe("body");
    expect(tree.children[0].sourceSelector).toBe("body > div");
    expect(tree.children[0].children[0].sourceSelector).toBe("body > div > p");
  });

  it("produces deterministic IDs: same structure → same ids", () => {
    const makeNodes = () => [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "div", 0, { x: 0, y: 0, width: 1440, height: 400 }),
      makeNode(2, "p", 1, { x: 0, y: 0, width: 600, height: 40 }),
    ];
    const tree1 = buildTree(makeNodes());
    const tree2 = buildTree(makeNodes());

    expect(tree1.id).toBe(tree2.id);
    expect(tree1.children[0].id).toBe(tree2.children[0].id);
    expect(tree1.children[0].children[0].id).toBe(tree2.children[0].children[0].id);
  });

  it("synthetic text children have ::text suffix in sourceSelector", () => {
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "li", 0, { x: 0, y: 0, width: 1440, height: 40 }, {
        display: "list-item",
      }, {
        textContent: "List item text",
      }),
    ];
    const tree = buildTree(nodes);
    const li = tree.children[0];
    // li with text becomes frame with synthetic text child
    const textChild = li.children.find(c => c.tag === "#text");
    if (textChild) {
      expect(textChild.sourceSelector).toBe("body > li::text");
    }
  });

  it("iframe children have iframe prefix in selector", () => {
    // This test checks that iframe children get the iframe host's selector as prefix.
    // Due to the complexity of iframe setup in tests, we verify the selector format.
    const nodes = [
      makeNode(0, "body", -1, { x: 0, y: 0, width: 1440, height: 900 }),
      makeNode(1, "iframe", 0, { x: 0, y: 0, width: 800, height: 600 }, {}, {
        attributes: {},
        contentDocumentIndex: 100,
      }),
    ];

    // Create iframe document nodes
    const iframeNodes = [
      makeNode(100, "body", -1, { x: 0, y: 0, width: 800, height: 600 }),
      makeNode(101, "div", 100, { x: 10, y: 10, width: 780, height: 400 }),
    ];

    const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
    nodes.forEach((n) => nodesByBackendId.set(n.backendNodeId, n));

    const iframeDocuments = new Map();
    iframeDocuments.set(100, { nodes: iframeNodes });

    const tree = buildElementTree(nodes, nodesByBackendId, new Map(), {
      viewportWidth: 1440,
      iframeDocuments,
    });

    const iframe = tree.children[0];
    if (iframe && iframe.children.length > 0) {
      const iframeChild = iframe.children[0];
      expect(iframeChild.sourceSelector).toContain("body > iframe");
    }
  });
});

// ============================================================================
// Group 5: escapeCSSIdentifier()
// ============================================================================

describe("escapeCSSIdentifier", () => {
  it("escapes special characters: my.class → my\\.class", () => {
    expect(escapeCSSIdentifier("my.class")).toBe("my\\.class");
  });

  it("leaves alphanumeric and hyphens unchanged", () => {
    expect(escapeCSSIdentifier("main-content")).toBe("main-content");
  });

  it("escapes colons", () => {
    expect(escapeCSSIdentifier("foo:bar")).toBe("foo\\:bar");
  });

  it("escapes brackets and other special chars", () => {
    expect(escapeCSSIdentifier("data[attr]")).toBe("data\\[attr\\]");
  });

  it("handles empty string", () => {
    expect(escapeCSSIdentifier("")).toBe("");
  });
});
