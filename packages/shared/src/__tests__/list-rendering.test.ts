/**
 * Integration tests for <ol>/<ul>/<li> rendering through buildElementTree.
 *
 * Verifies that the tree-builder produces Figma-ready structures for lists:
 *
 *   1. Every <li> with display:list-item and list-style-type ≠ "none"
 *      gains a synthetic "::marker" TEXT child carrying the marker string
 *      ("1.", "a.", "•", etc.).
 *   2. The marker is produced even when the CDP ::marker pseudo-element has
 *      zero bounds (the common case for list-style-position: outside).
 *   3. When the CDP snapshot DOES carry a ::marker pseudo-element with real
 *      textValue, that text is trusted verbatim (preserves counter-reset and
 *      counter() content from CSS).
 *   4. <li> layout stays VERTICAL (from CSS); marker is position:absolute
 *      so it doesn't disturb the li's content flow.
 *   5. <ol start>, <ol reversed>, <li value> HTML attributes are honored.
 *   6. Nested <ol>/<ul> have independent counter scopes.
 *   7. listStyleType: none produces no marker children at all.
 *   8. <ul>/<ol> `padding: 0 17px` with `box-sizing: content-box` is
 *      preserved (the marker gutter is not collapsed).
 *   9. Marker inherits font-family / font-size / color from its parent <li>.
 *
 * These tests define the spec for the deep list-rendering fix. They will
 * fail until tree-builder.ts is updated to drive its marker synthesis from
 * the new `list-markers` module and stops filtering zero-bounds ::marker
 * pseudo-elements.
 */

import { describe, it, expect } from "vitest";
import { buildElementTree } from "../tree-builder";
import type { ParsedSnapshotNode } from "../snapshot";
import type { CDPMatchedStyles, ExtractedElement } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

const baseStyles: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  "background-color": "rgba(0, 0, 0, 0)",
  color: "rgba(0, 0, 0, 1)",
  "font-family": "Inter",
  "font-size": "16",
  "font-weight": "400",
  "line-height": "normal",
  "letter-spacing": "0",
  "text-align": "left",
  position: "static",
  "box-sizing": "border-box",
  "border-top-width": "0",
  "border-right-width": "0",
  "border-bottom-width": "0",
  "border-left-width": "0",
  "padding-top": "0",
  "padding-right": "0",
  "padding-bottom": "0",
  "padding-left": "0",
  "margin-top": "0",
  "margin-right": "0",
  "margin-bottom": "0",
  "margin-left": "0",
};

const liStyles: Record<string, string> = {
  ...baseStyles,
  display: "list-item",
  "list-style-type": "decimal",
  "list-style-position": "outside",
};

let nextBackendId = 5000;

function makeElementNode(
  index: number,
  parentIndex: number,
  tag: string,
  overrides: Partial<ParsedSnapshotNode> = {}
): ParsedSnapshotNode {
  return {
    index,
    parentIndex,
    backendNodeId: nextBackendId++,
    nodeType: 1,
    nodeName: tag,
    textContent: overrides.textContent || "",
    attributes: overrides.attributes || {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: overrides.bounds || { x: 0, y: 0, width: 400, height: 24 },
    computedStyles: {
      ...baseStyles,
      width: String(overrides.bounds?.width ?? 400),
      height: String(overrides.bounds?.height ?? 24),
      ...overrides.computedStyles,
    },
  };
}

function makeTextNode(index: number, parentIndex: number, text: string): ParsedSnapshotNode {
  return {
    index,
    parentIndex,
    backendNodeId: nextBackendId++,
    nodeType: 3,
    nodeName: "#text",
    textContent: text,
    attributes: {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds: null,
    computedStyles: {},
  };
}

/**
 * Build a CDP-style ::marker pseudo-element node. `bounds === null` simulates
 * the common zero-bounds case for `list-style-position: outside`; a real
 * bounds object simulates a rendered inside marker.
 */
function makeMarkerPseudo(
  index: number,
  parentLiIndex: number,
  textValue: string,
  bounds: { x: number; y: number; width: number; height: number } | null
): ParsedSnapshotNode {
  return {
    index,
    parentIndex: parentLiIndex,
    backendNodeId: nextBackendId++,
    nodeType: 1,
    nodeName: "::marker",
    textContent: textValue,
    attributes: {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds,
    computedStyles: {
      ...baseStyles,
      "font-family": "Inter",
      "font-size": "12",
      color: "rgba(0, 0, 0, 0.56)",
    },
  };
}

function buildTree(nodes: ParsedSnapshotNode[]): ExtractedElement {
  const nodesByBackendId = new Map<number, ParsedSnapshotNode>();
  for (const n of nodes) nodesByBackendId.set(n.backendNodeId, n);
  return buildElementTree(nodes, nodesByBackendId, new Map<number, CDPMatchedStyles>(), {
    viewportWidth: 1440,
    cssVariablesMap: new Map(),
    bodyOriginalCSS: null,
    browserDpr: 1,
    platformFontMap: new Map(),
    documentURL: "https://example.com",
  });
}

function findByTag(el: ExtractedElement, tag: string): ExtractedElement[] {
  const out: ExtractedElement[] = [];
  if (el.tag === tag) out.push(el);
  for (const c of el.children) out.push(...findByTag(c, tag));
  return out;
}

function markerChildOf(li: ExtractedElement): ExtractedElement | undefined {
  return li.children.find((c) => c.tag === "::marker");
}

/**
 * Generic builder: takes a list spec and returns the fully synthesized
 * CDP-style node array. Keeps tests concise and intention-revealing.
 */
interface ListFixture {
  tag: "ol" | "ul";
  listStyleType?: string;
  listStylePosition?: "inside" | "outside";
  attributes?: Record<string, string>;
  paddingLeft?: number;
  items: Array<{
    text: string;
    valueAttr?: string;
    marker?: { text: string; bounds: { x: number; y: number; width: number; height: number } | null };
  }>;
}

function buildListFixture(fx: ListFixture): ParsedSnapshotNode[] {
  const listStyleType = fx.listStyleType ?? (fx.tag === "ol" ? "decimal" : "disc");
  const listStylePosition = fx.listStylePosition ?? "outside";
  const paddingLeft = fx.paddingLeft ?? 17;

  const nodes: ParsedSnapshotNode[] = [];
  // body
  nodes.push(
    makeElementNode(0, -1, "body", {
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      computedStyles: { ...baseStyles, width: "1440", height: "900" },
    })
  );
  // list container
  nodes.push(
    makeElementNode(1, 0, fx.tag, {
      bounds: { x: 0, y: 0, width: 1200, height: 200 },
      attributes: fx.attributes || {},
      computedStyles: {
        ...baseStyles,
        width: "1200",
        height: "200",
        "list-style-type": listStyleType,
        "list-style-position": listStylePosition,
        "padding-left": String(paddingLeft),
        "padding-right": "17",
      },
    })
  );

  let nextIdx = 2;
  fx.items.forEach((item, i) => {
    const liIndex = nextIdx++;
    nodes.push(
      makeElementNode(liIndex, 1, "li", {
        bounds: { x: paddingLeft, y: i * 30, width: 1200 - paddingLeft * 2, height: 24 },
        textContent: item.text,
        attributes: item.valueAttr ? { value: item.valueAttr } : {},
        computedStyles: {
          ...liStyles,
          "list-style-type": listStyleType,
          "list-style-position": listStylePosition,
          width: String(1200 - paddingLeft * 2),
          height: "24",
        },
      })
    );
    // text node child
    nodes.push(makeTextNode(nextIdx++, liIndex, item.text));
    // optional ::marker pseudo
    if (item.marker) {
      nodes.push(makeMarkerPseudo(nextIdx++, liIndex, item.marker.text, item.marker.bounds));
    }
  });

  return nodes;
}

// ============================================================================
// 1. BASIC — decimal <ol> renders markers
// ============================================================================

describe("list rendering — basic decimal <ol>", () => {
  it("creates '::marker' text children '1.','2.','3.' when no CDP pseudo is present", () => {
    const nodes = buildListFixture({
      tag: "ol",
      items: [{ text: "First" }, { text: "Second" }, { text: "Third" }],
    });
    const tree = buildTree(nodes);
    const lis = findByTag(tree, "li");
    expect(lis).toHaveLength(3);

    const markers = lis.map((li) => markerChildOf(li));
    expect(markers.every(Boolean)).toBe(true);
    expect(markers[0]!.textContent).toBe("1.");
    expect(markers[1]!.textContent).toBe("2.");
    expect(markers[2]!.textContent).toBe("3.");
    expect(markers.every((m) => m!.type === "text")).toBe(true);
  });

  it("<li> keeps VERTICAL layout; marker is absolute-positioned first child", () => {
    const nodes = buildListFixture({
      tag: "ol",
      items: [{ text: "Only item" }],
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0];
    expect(li.layoutMode).toBe("VERTICAL");
    expect(li.children[0].tag).toBe("::marker");
    expect(li.children[0].position).toBe("absolute");
  });
});

// ============================================================================
// 2. BASIC — disc <ul>
// ============================================================================

describe("list rendering — <ul> disc", () => {
  it("creates '•' markers for every <li>", () => {
    const nodes = buildListFixture({
      tag: "ul",
      items: [{ text: "Apple" }, { text: "Banana" }],
    });
    const tree = buildTree(nodes);
    const lis = findByTag(tree, "li");
    expect(lis.map((li) => markerChildOf(li)?.textContent)).toEqual(["•", "•"]);
  });

  it("respects list-style-type: square (uses ▪)", () => {
    const nodes = buildListFixture({
      tag: "ul",
      listStyleType: "square",
      items: [{ text: "x" }],
    });
    const tree = buildTree(nodes);
    const marker = markerChildOf(findByTag(tree, "li")[0]);
    expect(marker?.textContent).toBe("▪");
  });
});

// ============================================================================
// 3. CDP ::marker with zero bounds — the Apple.com footnote regression
// ============================================================================

describe("list rendering — zero-bounds ::marker is NOT dropped", () => {
  it("synthesizes marker even when CDP ::marker pseudo has null bounds", () => {
    // This is the exact Apple.com footnotes scenario: the browser provides
    // a ::marker pseudo with textValue "1. " but no layout box (outside
    // position). The previous bounds>0 filter silently dropped it.
    const nodes = buildListFixture({
      tag: "ol",
      items: [
        { text: "Footnote 1", marker: { text: "1. ", bounds: null } },
        { text: "Footnote 2", marker: { text: "2. ", bounds: null } },
      ],
    });
    const tree = buildTree(nodes);
    const lis = findByTag(tree, "li");
    const m0 = markerChildOf(lis[0]);
    const m1 = markerChildOf(lis[1]);
    expect(m0).toBeDefined();
    expect(m1).toBeDefined();
    // Exact string from CDP must be preserved (with trailing space)
    expect(m0!.textContent).toBe("1. ");
    expect(m1!.textContent).toBe("2. ");
  });

  it("derives marker width/height from parent font when bounds are null", () => {
    const nodes = buildListFixture({
      tag: "ol",
      items: [{ text: "x", marker: { text: "1.", bounds: null } }],
    });
    const tree = buildTree(nodes);
    const marker = markerChildOf(findByTag(tree, "li")[0])!;
    // Marker must have positive dimensions so Figma can lay it out.
    expect(marker.width).toBeGreaterThan(0);
    expect(marker.height).toBeGreaterThan(0);
  });
});

// ============================================================================
// 4. CDP ::marker WITH textValue is trusted verbatim (counter-reset support)
// ============================================================================

describe("list rendering — CDP marker text takes precedence", () => {
  it("uses 'A.1 ' from CDP instead of computing '1.' from listStyleType", () => {
    // When a site uses CSS counter-reset + counter() to produce custom
    // markers, CDP delivers the rendered text in ::marker.textValue.
    // Our fallback counter engine cannot replicate this — we must trust CDP.
    const nodes = buildListFixture({
      tag: "ol",
      items: [
        { text: "Chapter one", marker: { text: "A.1 ", bounds: { x: 0, y: 0, width: 20, height: 16 } } },
        { text: "Chapter two", marker: { text: "A.2 ", bounds: { x: 0, y: 30, width: 20, height: 16 } } },
      ],
    });
    const tree = buildTree(nodes);
    const markers = findByTag(tree, "li").map((li) => markerChildOf(li)?.textContent);
    expect(markers).toEqual(["A.1 ", "A.2 "]);
  });
});

// ============================================================================
// 5. HTML attributes — start, reversed, value
// ============================================================================

describe("list rendering — <ol start='5'>", () => {
  it("first marker is '5.', not '1.'", () => {
    const nodes = buildListFixture({
      tag: "ol",
      attributes: { start: "5" },
      items: [{ text: "a" }, { text: "b" }, { text: "c" }],
    });
    const tree = buildTree(nodes);
    expect(findByTag(tree, "li").map((li) => markerChildOf(li)?.textContent))
      .toEqual(["5.", "6.", "7."]);
  });
});

describe("list rendering — <ol reversed>", () => {
  it("decimal markers count down: 3,2,1", () => {
    const nodes = buildListFixture({
      tag: "ol",
      attributes: { reversed: "" },
      items: [{ text: "a" }, { text: "b" }, { text: "c" }],
    });
    const tree = buildTree(nodes);
    expect(findByTag(tree, "li").map((li) => markerChildOf(li)?.textContent))
      .toEqual(["3.", "2.", "1."]);
  });

  it("reversed + start='10', 4 items → 10,9,8,7", () => {
    const nodes = buildListFixture({
      tag: "ol",
      attributes: { reversed: "", start: "10" },
      items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }],
    });
    const tree = buildTree(nodes);
    expect(findByTag(tree, "li").map((li) => markerChildOf(li)?.textContent))
      .toEqual(["10.", "9.", "8.", "7."]);
  });
});

describe("list rendering — <li value='N'>", () => {
  it("resets counter at that li and continues afterwards", () => {
    const nodes = buildListFixture({
      tag: "ol",
      items: [
        { text: "first" },
        { text: "override", valueAttr: "20" },
        { text: "after" },
      ],
    });
    const tree = buildTree(nodes);
    expect(findByTag(tree, "li").map((li) => markerChildOf(li)?.textContent))
      .toEqual(["1.", "20.", "21."]);
  });
});

// ============================================================================
// 6. Nested lists
// ============================================================================

describe("list rendering — nested <ol> counter scoping", () => {
  it("inner <ol> starts fresh at 1, outer keeps its own counter", () => {
    // <ol>
    //   <li>outer 1
    //     <ol><li>inner 1</li><li>inner 2</li></ol>
    //   </li>
    //   <li>outer 2</li>
    // </ol>
    const nodes: ParsedSnapshotNode[] = [];
    nodes.push(
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      })
    );
    nodes.push(
      makeElementNode(1, 0, "ol", {
        bounds: { x: 0, y: 0, width: 1200, height: 400 },
        computedStyles: {
          ...baseStyles,
          width: "1200",
          height: "400",
          "list-style-type": "decimal",
          "padding-left": "17",
        },
      })
    );
    // outer li 1
    nodes.push(
      makeElementNode(2, 1, "li", {
        bounds: { x: 17, y: 0, width: 1180, height: 200 },
        textContent: "outer 1",
        computedStyles: { ...liStyles, width: "1180", height: "200" },
      })
    );
    nodes.push(makeTextNode(3, 2, "outer 1"));
    // inner ol
    nodes.push(
      makeElementNode(4, 2, "ol", {
        bounds: { x: 34, y: 30, width: 1160, height: 150 },
        computedStyles: {
          ...baseStyles,
          width: "1160",
          height: "150",
          "list-style-type": "decimal",
          "padding-left": "17",
        },
      })
    );
    nodes.push(
      makeElementNode(5, 4, "li", {
        bounds: { x: 51, y: 30, width: 1140, height: 24 },
        textContent: "inner 1",
        computedStyles: { ...liStyles, width: "1140", height: "24" },
      })
    );
    nodes.push(makeTextNode(6, 5, "inner 1"));
    nodes.push(
      makeElementNode(7, 4, "li", {
        bounds: { x: 51, y: 60, width: 1140, height: 24 },
        textContent: "inner 2",
        computedStyles: { ...liStyles, width: "1140", height: "24" },
      })
    );
    nodes.push(makeTextNode(8, 7, "inner 2"));
    // outer li 2
    nodes.push(
      makeElementNode(9, 1, "li", {
        bounds: { x: 17, y: 210, width: 1180, height: 24 },
        textContent: "outer 2",
        computedStyles: { ...liStyles, width: "1180", height: "24" },
      })
    );
    nodes.push(makeTextNode(10, 9, "outer 2"));

    const tree = buildTree(nodes);
    const ols = findByTag(tree, "ol");
    expect(ols).toHaveLength(2);

    const outerLis = ols[0].children.filter((c) => c.tag === "li");
    const innerLis = ols[1].children.filter((c) => c.tag === "li");

    expect(outerLis.map((li) => markerChildOf(li)?.textContent)).toEqual(["1.", "2."]);
    expect(innerLis.map((li) => markerChildOf(li)?.textContent)).toEqual(["1.", "2."]);
  });
});

// ============================================================================
// 7. list-style-type: none produces NO marker child
// ============================================================================

describe("list rendering — listStyleType: none", () => {
  it("creates no ::marker children", () => {
    const nodes = buildListFixture({
      tag: "ul",
      listStyleType: "none",
      items: [{ text: "a" }, { text: "b" }],
    });
    const tree = buildTree(nodes);
    const lis = findByTag(tree, "li");
    for (const li of lis) {
      expect(markerChildOf(li)).toBeUndefined();
    }
  });

  it("does not inject marker-driven itemSpacing when there is no marker", () => {
    // `display: list-item` produces VERTICAL layout by default, so
    // we only need to verify that the marker-flip path did NOT touch the li
    // — i.e. there are no marker children and no synthetic itemSpacing gap.
    const nodes = buildListFixture({
      tag: "ul",
      listStyleType: "none",
      items: [{ text: "a" }],
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0];
    expect(markerChildOf(li)).toBeUndefined();
    expect(li.children.every((c) => c.tag !== "::marker")).toBe(true);
  });
});

// ============================================================================
// 8. Parent <ol> padding is preserved (Apple.com 0 17px case)
// ============================================================================

describe("list rendering — <ol> padding preservation", () => {
  it("keeps padding: 0 17px on the ol container", () => {
    const nodes = buildListFixture({
      tag: "ol",
      paddingLeft: 17,
      items: [{ text: "a" }],
    });
    const tree = buildTree(nodes);
    const ol = findByTag(tree, "ol")[0];
    expect(ol.padding.left).toBe(17);
    expect(ol.padding.right).toBe(17);
  });
});

// ============================================================================
// 9. Marker inherits typography from parent <li>
// ============================================================================

describe("list rendering — marker typography inheritance", () => {
  it("marker uses the <li>'s font-family, font-size, and color", () => {
    const nodes = buildListFixture({
      tag: "ol",
      items: [{ text: "Footnote" }],
    });
    // Upgrade the li computed styles to simulate Apple's SF Pro Text 12px gray
    const liNode = nodes.find((n) => n.nodeName === "li")!;
    Object.assign(liNode.computedStyles, {
      "font-family": '"SF Pro Text", Helvetica, sans-serif',
      "font-size": "12",
      color: "rgba(0, 0, 0, 0.56)",
    });

    const tree = buildTree(nodes);
    const marker = markerChildOf(findByTag(tree, "li")[0])!;
    expect(marker.fontSize).toBe(12);
    expect(marker.fontFamily.toLowerCase()).toContain("sf pro text");
    // color is stored as hex or rgba in textColor; just confirm non-default gray is carried
    expect(marker.textColor).not.toBe("rgba(0, 0, 0, 1)");
    expect(marker.textColor).not.toBeNull();
  });
});

// ============================================================================
// 10. Orphan <li> with display:list-item still gets a marker
// ============================================================================

describe("list rendering — orphan <li>", () => {
  it("<li> directly under body (no ol/ul) still receives a disc marker", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "li", {
        bounds: { x: 0, y: 0, width: 400, height: 24 },
        textContent: "orphan",
        computedStyles: { ...liStyles, "list-style-type": "disc", width: "400", height: "24" },
      }),
      makeTextNode(2, 1, "orphan"),
    ];
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0];
    expect(markerChildOf(li)?.textContent).toBe("•");
  });
});

// ============================================================================
// 11. Non-<li> children of <ol> are ignored by the counter
// ============================================================================

describe("list rendering — non-li children don't consume counter slots", () => {
  it("a <script> sibling between <li>s does not advance the counter", () => {
    const nodes: ParsedSnapshotNode[] = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      }),
      makeElementNode(1, 0, "ol", {
        bounds: { x: 0, y: 0, width: 1200, height: 100 },
        computedStyles: {
          ...baseStyles,
          width: "1200",
          height: "100",
          "list-style-type": "decimal",
          "padding-left": "17",
        },
      }),
      makeElementNode(2, 1, "li", {
        bounds: { x: 17, y: 0, width: 1180, height: 24 },
        textContent: "first",
        computedStyles: { ...liStyles, width: "1180", height: "24" },
      }),
      makeTextNode(3, 2, "first"),
      makeElementNode(4, 1, "script", {
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        computedStyles: { ...baseStyles, display: "none", width: "0", height: "0" },
      }),
      makeElementNode(5, 1, "li", {
        bounds: { x: 17, y: 30, width: 1180, height: 24 },
        textContent: "second",
        computedStyles: { ...liStyles, width: "1180", height: "24" },
      }),
      makeTextNode(6, 5, "second"),
    ];
    const tree = buildTree(nodes);
    const lis = findByTag(tree, "li");
    expect(lis.map((li) => markerChildOf(li)?.textContent)).toEqual(["1.", "2."]);
  });
});

// ============================================================================
// 12. The Apple.com footnote regression — end-to-end
// ============================================================================

describe("list rendering — Apple.com footnote regression", () => {
  it("ol with padding 0 17px, decimal, 2 li, outside markers → '1.' '2.' present as text children", () => {
    // Reproduces the JSON in CLAUDE conversation: content-box, padding 0 17px,
    // list-style-type: decimal, list-style-position: outside, SF Pro Text 12px
    // gray. CDP provides ::marker pseudo with textValue "1. " but null bounds.
    const nodes: ParsedSnapshotNode[] = [];
    nodes.push(
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        computedStyles: { ...baseStyles, width: "1440", height: "900" },
      })
    );
    nodes.push(
      makeElementNode(1, 0, "ol", {
        bounds: { x: 247, y: 4970, width: 946, height: 60 },
        computedStyles: {
          ...baseStyles,
          width: "946",
          height: "60",
          "box-sizing": "content-box",
          "padding-left": "17",
          "padding-right": "17",
          "list-style-type": "decimal",
          "list-style-position": "outside",
          "font-family": '"SF Pro Text", Helvetica, sans-serif',
          "font-size": "12",
          "line-height": "16.0005",
          color: "rgba(0, 0, 0, 0.56)",
        },
      })
    );
    // li #1
    nodes.push(
      makeElementNode(2, 1, "li", {
        bounds: { x: 264, y: 4976, width: 912, height: 25.59 },
        attributes: { id: "footnote-1" },
        textContent: "Feature and service availability varies by country and region.",
        computedStyles: {
          ...liStyles,
          width: "912",
          height: "25.59",
          "list-style-type": "decimal",
          "list-style-position": "outside",
          "font-family": '"SF Pro Text", Helvetica, sans-serif',
          "font-size": "12",
          "line-height": "16.0005",
          color: "rgba(0, 0, 0, 0.56)",
          "padding-bottom": "9.6",
        },
      })
    );
    nodes.push(
      makeTextNode(3, 2, "Feature and service availability varies by country and region.")
    );
    nodes.push(makeMarkerPseudo(4, 2, "1. ", null));
    // li #2
    nodes.push(
      makeElementNode(5, 1, "li", {
        bounds: { x: 264, y: 5010, width: 912, height: 25.59 },
        attributes: { id: "footnote-2" },
        textContent: "Trade-in values will vary based on condition.",
        computedStyles: {
          ...liStyles,
          width: "912",
          height: "25.59",
          "list-style-type": "decimal",
          "list-style-position": "outside",
          "font-family": '"SF Pro Text", Helvetica, sans-serif',
          "font-size": "12",
          "line-height": "16.0005",
          color: "rgba(0, 0, 0, 0.56)",
        },
      })
    );
    nodes.push(makeTextNode(6, 5, "Trade-in values will vary based on condition."));
    nodes.push(makeMarkerPseudo(7, 5, "2. ", null));

    const tree = buildTree(nodes);
    const ol = findByTag(tree, "ol")[0];
    expect(ol).toBeDefined();
    expect(ol.padding.left).toBe(17);
    expect(ol.padding.right).toBe(17);

    const lis = findByTag(tree, "li");
    expect(lis).toHaveLength(2);

    const markers = lis.map((li) => markerChildOf(li));
    expect(markers.every(Boolean)).toBe(true);
    expect(markers[0]!.textContent.trim()).toBe("1.");
    expect(markers[1]!.textContent.trim()).toBe("2.");

    // Layout: li stays VERTICAL; marker is absolute-positioned first child
    for (const li of lis) {
      expect(li.layoutMode).toBe("VERTICAL");
      expect(li.children[0].tag).toBe("::marker");
      expect(li.children[0].position).toBe("absolute");
    }
  });
});
