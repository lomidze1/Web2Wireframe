/**
 * Unit tests for ::marker pseudo-element typography inheritance.
 *
 * Bug: when an <li>'s ::marker pseudo-element defines its own font-size,
 * font-family, color, etc., the synthesized marker text node must pick up
 * those values — NOT the <li>'s own typography. Real-world example:
 * Apple.com footer footnotes (`#ac-globalfooter .ac-gf-sosumi ol li`) where
 * the ::marker has `font-size: 12px; color: rgba(0,0,0,0.56)` inherited
 * from a selector that does not apply to the <li> itself.
 *
 * Fix lives in packages/shared/src/tree-builder.ts — attachMarkerToLi()
 * should prefer li.markerComputedStyles over li.fontSize / li.textColor.
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

let nextBackendId = 9000;

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
 * Build a CDP-style ::marker pseudo-element. Passing `textContent: ""`
 * simulates the very common case where the browser defers the marker
 * glyph computation: the pseudo-node is in the snapshot with styles but
 * no materialized text. In that case the tree-builder must still capture
 * the pseudo's computedStyles onto the parent <li> as
 * `markerComputedStyles` so the synthesized marker picks them up.
 */
function makeMarkerPseudo(
  index: number,
  parentLiIndex: number,
  markerStyles: Record<string, string>,
  textContent: string = "",
  bounds: { x: number; y: number; width: number; height: number } | null = null
): ParsedSnapshotNode {
  return {
    index,
    parentIndex: parentLiIndex,
    backendNodeId: nextBackendId++,
    nodeType: 1,
    nodeName: "::marker",
    textContent,
    attributes: {},
    isClickable: false,
    needsMatchedStyles: false,
    bounds,
    computedStyles: {
      ...baseStyles,
      ...markerStyles,
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

function markerOf(li: ExtractedElement): ExtractedElement | undefined {
  return li.children.find((c) => c.tag === "::marker");
}

/**
 * Build a minimal <body><ol><li>…</li></ol></body> fixture with an optional
 * ::marker pseudo-element whose computedStyles differ from the <li>'s own.
 */
function buildOlWithMarkerPseudo(opts: {
  liOverrides?: Record<string, string>;
  markerStyles?: Record<string, string>;
  markerTextContent?: string;
  attachMarkerPseudo?: boolean; // default true
  listStyleType?: string;
  olAttributes?: Record<string, string>;
  itemTexts?: string[];
}): ParsedSnapshotNode[] {
  const attach = opts.attachMarkerPseudo ?? true;
  const itemTexts = opts.itemTexts ?? ["First"];
  const listStyleType = opts.listStyleType ?? "decimal";

  const nodes: ParsedSnapshotNode[] = [];
  nodes.push(
    makeElementNode(0, -1, "body", {
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      computedStyles: { ...baseStyles, width: "1440", height: "900" },
    })
  );
  nodes.push(
    makeElementNode(1, 0, "ol", {
      bounds: { x: 0, y: 0, width: 1200, height: 200 },
      attributes: opts.olAttributes ?? {},
      computedStyles: {
        ...baseStyles,
        width: "1200",
        height: "200",
        "list-style-type": listStyleType,
        "list-style-position": "outside",
        "padding-left": "17",
      },
    })
  );

  let nextIdx = 2;
  itemTexts.forEach((text, i) => {
    const liIndex = nextIdx++;
    nodes.push(
      makeElementNode(liIndex, 1, "li", {
        bounds: { x: 17, y: i * 30, width: 1166, height: 24 },
        textContent: text,
        computedStyles: {
          ...liStyles,
          "list-style-type": listStyleType,
          ...(opts.liOverrides ?? {}),
          width: "1166",
          height: "24",
        },
      })
    );
    nodes.push(makeTextNode(nextIdx++, liIndex, text));
    if (attach) {
      nodes.push(
        makeMarkerPseudo(
          nextIdx++,
          liIndex,
          opts.markerStyles ?? {},
          opts.markerTextContent ?? "",
          null
        )
      );
    }
  });

  return nodes;
}

// ============================================================================
// TESTS
// ============================================================================

describe("::marker typography inherits from ::marker pseudo, not <li>", () => {
  it("1. ::marker font-size overrides <li> font-size", () => {
    const nodes = buildOlWithMarkerPseudo({
      liOverrides: { "font-size": "20" },
      markerStyles: { "font-size": "12" },
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    expect(marker).toBeDefined();
    expect(marker.fontSize).toBe(12);
  });

  it("2. ::marker color (rgba with alpha) overrides <li> color", () => {
    const nodes = buildOlWithMarkerPseudo({
      liOverrides: { color: "rgb(0, 0, 0)" },
      markerStyles: { color: "rgba(0, 0, 0, 0.56)" },
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    // Hex representation should reflect the rgba(0,0,0,0.56) alpha.
    // textColor is stored as hex; opacity channel lives separately. Verify
    // both together instead of hard-coding a single format.
    expect(marker.textColor).not.toBe(null);
    expect(marker.textColor!.toLowerCase().startsWith("#000000")).toBe(true);
    // Alpha 0.56 → ~0x8f (143). Accept any non-1 opacity on the node.
    expect(marker.opacity).toBeLessThan(1);
    expect(marker.opacity).toBeGreaterThan(0.5);
  });

  it("3. ::marker font-family overrides <li> font-family", () => {
    const nodes = buildOlWithMarkerPseudo({
      liOverrides: { "font-family": "Inter" },
      markerStyles: {
        "font-family": '"SF Pro Text", "Helvetica Neue", Arial, sans-serif',
      },
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    expect(marker.fontFamily).toBe("SF Pro Text");
  });

  it("4. ::marker font-weight overrides <li> font-weight", () => {
    const nodes = buildOlWithMarkerPseudo({
      liOverrides: { "font-weight": "400" },
      markerStyles: { "font-weight": "700" },
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    expect(marker.fontWeight).toBe(700);
  });

  it("5. ::marker line-height overrides <li> line-height", () => {
    const nodes = buildOlWithMarkerPseudo({
      liOverrides: { "line-height": "normal", "font-size": "20" },
      markerStyles: { "line-height": "16", "font-size": "12" },
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    expect(marker.lineHeight).toBe(16);
  });

  it("6. ::marker letter-spacing overrides <li> letter-spacing", () => {
    const nodes = buildOlWithMarkerPseudo({
      liOverrides: { "letter-spacing": "0" },
      markerStyles: { "letter-spacing": "-0.12" },
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    expect(marker.letterSpacing).toBeCloseTo(-0.12, 2);
  });

  it("7. no ::marker pseudo present → marker inherits from <li>", () => {
    const nodes = buildOlWithMarkerPseudo({
      liOverrides: { "font-size": "14", color: "rgb(50, 50, 50)" },
      attachMarkerPseudo: false,
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    expect(marker).toBeDefined();
    expect(marker.fontSize).toBe(14);
  });

  it("8. list-style-type: none → no marker child produced", () => {
    const nodes = buildOlWithMarkerPseudo({
      listStyleType: "none",
      markerStyles: { "font-size": "12" },
    });
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    expect(markerOf(li)).toBeUndefined();
  });

  it("9. <ol start='5'> → first three markers are '5.', '6.', '7.' with pseudo styles", () => {
    const nodes = buildOlWithMarkerPseudo({
      itemTexts: ["Alpha", "Beta", "Gamma"],
      olAttributes: { start: "5" },
      liOverrides: { "font-size": "20" },
      markerStyles: { "font-size": "12" },
    });
    const tree = buildTree(nodes);
    const lis = findByTag(tree, "li");
    expect(lis).toHaveLength(3);
    expect(markerOf(lis[0])!.textContent).toBe("5.");
    expect(markerOf(lis[1])!.textContent).toBe("6.");
    expect(markerOf(lis[2])!.textContent).toBe("7.");
    // All three should pick up the pseudo's font-size, not the li's 20.
    for (const li of lis) {
      expect(markerOf(li)!.fontSize).toBe(12);
    }
  });

  it("10. <ul> with list-style-type: disc → marker text is '•' and uses pseudo font", () => {
    const nodes = [
      makeElementNode(0, -1, "body", {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
      }),
      makeElementNode(1, 0, "ul", {
        bounds: { x: 0, y: 0, width: 1200, height: 80 },
        computedStyles: {
          ...baseStyles,
          "list-style-type": "disc",
          "list-style-position": "outside",
          "padding-left": "17",
          width: "1200",
          height: "80",
        },
      }),
      makeElementNode(2, 1, "li", {
        bounds: { x: 17, y: 0, width: 1166, height: 24 },
        textContent: "Bullet item",
        computedStyles: {
          ...liStyles,
          "list-style-type": "disc",
          "font-size": "18",
          width: "1166",
          height: "24",
        },
      }),
      makeTextNode(3, 2, "Bullet item"),
      makeMarkerPseudo(
        4,
        2,
        { "font-size": "12", "font-family": "Georgia" },
        "",
        null
      ),
    ];
    const tree = buildTree(nodes);
    const li = findByTag(tree, "li")[0]!;
    const marker = markerOf(li)!;
    expect(marker).toBeDefined();
    expect(marker.textContent).toBe("•");
    expect(marker.fontSize).toBe(12);
    expect(marker.fontFamily).toBe("Georgia");
  });
});
