/**
 * The TextStyle budget (MAX_TEXT_STYLES = 50) used to be spent in tree-walk
 * order, so on a typography-rich page a one-off footnote could take a slot
 * from the body copy. Combos now carry a usage count and are processed
 * most-used first.
 */
import { describe, it, expect } from "vitest";
import { collectTypographyFromTree } from "../rendering/styles";
import type { TypographyCombo } from "../rendering/styles";
import type { WireframeNode } from "../types";

function textNode(
  id: string,
  fontSize: number,
  fontWeight: number,
  children: WireframeNode[] = []
): WireframeNode {
  return {
    id, name: id, type: "text", tag: "p",
    x: 0, y: 0, width: 100, height: 20,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#000", borderColor: null,
    borderWidth: 0, borderRadius: 0, opacity: 1,
    textContent: "text", fontSize, fontWeight,
    fontFamily: "Inter", textAlign: "left",
    lineHeight: 24, letterSpacing: 0,
    children,
  } as WireframeNode;
}

function container(children: WireframeNode[]): WireframeNode {
  return { ...textNode("root", 0, 400, children), type: "frame", textContent: "", fontSize: 0 } as WireframeNode;
}

describe("typography usage counting", () => {
  it("counts repeated combos instead of only recording the first", () => {
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(
      container([
        textNode("body1", 16, 400),
        textNode("body2", 16, 400),
        textNode("body3", 16, 400),
        textNode("footnote", 11, 400),
      ]),
      combos,
      "Inter",
      "website"
    );

    const entries = Array.from(combos.values());
    const body = entries.find((c) => c.fontSize === 16)!;
    const footnote = entries.find((c) => c.fontSize === 11)!;
    expect(body.usageCount).toBe(3);
    expect(footnote.usageCount).toBe(1);
  });

  it("ranks the most-used combo first when sorted by usage", () => {
    const combos = new Map<string, TypographyCombo>();
    collectTypographyFromTree(
      container([
        textNode("rare", 40, 700),
        textNode("common1", 16, 400),
        textNode("common2", 16, 400),
      ]),
      combos,
      "Inter",
      "website"
    );

    const ordered = Array.from(combos.values()).sort(
      (a, b) => (b.usageCount ?? 1) - (a.usageCount ?? 1)
    );
    // The heading appears first in DOM order but is used once — body copy wins.
    expect(ordered[0].fontSize).toBe(16);
  });
});
