/**
 * Hover-consolidation variant identity must include subtree STRUCTURE.
 *
 * telex.ge regression: product cards WITH price/rating/ribbon and cards
 * WITHOUT shared one variant (visual style of the card root is identical),
 * so every non-representative card was instanced from the poorer master and
 * silently lost its prices, ratings and discount ribbons. Instances override
 * TEXT values only — never structure — so two hoverables may share a master
 * ONLY when their subtree structure matches.
 */
import { describe, it, expect } from "vitest";
import {
  variantSignature,
  visualStyleSignature,
} from "../rendering/hoverConsolidation";
import type { WireframeNode } from "../types";

function makeWfNode(overrides: Partial<WireframeNode> = {}): WireframeNode {
  return {
    id: `wf-${Math.random().toString(36).slice(2, 8)}`,
    name: "node",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 250,
    height: 420,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#111",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: "normal",
    letterSpacing: 0,
    children: [],
    pseudoStateStyles: { hover: { color: "red" } },
    ...overrides,
  } as WireframeNode;
}

function textNode(text: string): WireframeNode {
  return makeWfNode({ type: "text", tag: "span", textContent: text, pseudoStateStyles: undefined });
}

function imgNode(): WireframeNode {
  return makeWfNode({ type: "placeholder", tag: "img", isPlaceholder: true, pseudoStateStyles: undefined });
}

/** Product card: image + title (+ optional price row). */
function card(withPrice: boolean): WireframeNode {
  const children: WireframeNode[] = [imgNode(), textNode("Book title")];
  if (withPrice) {
    children.push(
      makeWfNode({
        tag: "span",
        pseudoStateStyles: undefined,
        children: [textNode("19,95")],
      }),
    );
  }
  return makeWfNode({ tag: "a", children });
}

describe("variantSignature", () => {
  it("gives identical signatures to structurally identical cards", () => {
    expect(variantSignature(card(true))).toBe(variantSignature(card(true)));
    expect(variantSignature(card(false))).toBe(variantSignature(card(false)));
  });

  it("separates cards WITH vs WITHOUT a price row (same visual style)", () => {
    const withPrice = card(true);
    const withoutPrice = card(false);
    // Visual style alone can NOT tell them apart when text typography matches…
    // (both have identical root paints; the price adds a text fingerprint, so
    // don't assert equality of visualStyleSignature here — the point is the
    // STRUCTURAL part must differ regardless.)
    expect(variantSignature(withPrice)).not.toBe(variantSignature(withoutPrice));
  });

  it("separates a populated block from its empty AJAX shell", () => {
    const populated = makeWfNode({
      tag: "div",
      children: [imgNode(), textNode("post")],
    });
    const empty = makeWfNode({ tag: "div", children: [] });
    expect(variantSignature(populated)).not.toBe(variantSignature(empty));
  });

  it("starts with the visual signature (visual variants still split)", () => {
    const a = card(true);
    expect(variantSignature(a).startsWith(visualStyleSignature(a))).toBe(true);
  });
});
