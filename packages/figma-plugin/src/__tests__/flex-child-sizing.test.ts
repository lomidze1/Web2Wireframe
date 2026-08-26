/**
 * A flex child's `width: auto` is not Figma's HUG.
 *
 * In CSS, `width: auto` on a flex item means "flex-basis and flex-grow decide
 * my width". In Figma, HUG means "shrink to fit my children". getSizing
 * translated the first into the second, throwing away the width the browser
 * actually measured.
 *
 * stripe.com's bento grid is the case that exposed it. Six cards declare
 *
 *   flex: 1 1 calc(66.666% - 8px);  max-width: 816px
 *
 * and the browser measures 816 / 400 / 400 / 400 / 400 / 1232 px. Every one of
 * them came out HUG, so all six collapsed into a single squeezed row instead
 * of wrapping into the 2 + 3 + 1 layout the page shows.
 *
 * The cards make it worse: every child inside them is `position: absolute`,
 * so HUG has no in-flow content to hug at all.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers — synthetic W2W trees, same shape as css-converter-flex-shrink
// ---------------------------------------------------------------------------

function findNode(
  node: unknown,
  predicate: (n: WireframeNode) => boolean,
): WireframeNode | null {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== "object") continue;
    const obj = cur as WireframeNode;
    if (predicate(obj)) return obj;
    if (Array.isArray(obj.children)) stack.push(...obj.children);
  }
  return null;
}

function frame(
  tag: string,
  width: number,
  height: number,
  styles: Record<string, unknown>,
  children: unknown[] = [],
) {
  return {
    type: "FRAME",
    x: 0, y: 0, width, height,
    quad: [0, 0, width, 0, width, height, 0, height],
    tag,
    classList: [],
    attr: {},
    styles,
    children,
  };
}

/** Horizontal flex row (1232px) holding one card of the given width. */
function bentoRow(cardWidth: number, cardStyles: Record<string, unknown>, cardKids: unknown[] = []) {
  return frame("div", 1232, 676, { display: "flex", flexWrap: "wrap", gap: "16px", width: "1232px" }, [
    frame("button", cardWidth, 676, {
      display: "flex",
      position: "relative",
      width: "auto",
      flexGrow: 1,
      flexShrink: 1,
      ...cardStyles,
    }, cardKids),
  ]);
}

const card = (root: WireframeNode) => findNode(root, (n) => n.tag === "button")!;
const convert = (tree: Record<string, unknown>) =>
  convertW2WToWireframe(tree as never, {}) as WireframeNode;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("flex child with width:auto", () => {
  it("max-width matching the measured width pins it FIXED", () => {
    // stripe.com's wide card: flex-grow:1 used to route past the max-width
    // rule via hasExplicitFillIntent, landing on HUG.
    const root = convert(bentoRow(816, { maxWidth: "816px", flexBasis: "calc(66.666% - 8px)" }));
    expect(card(root).layoutSizingHorizontal).toBe("FIXED");
    expect(Math.round(card(root).width)).toBe(816);
  });

  it("a definite flex-basis pins it FIXED even without max-width", () => {
    // The browser already resolved calc(33.333% - 8px) to 400px; we keep that
    // number rather than recomputing the percentage.
    const root = convert(bentoRow(400, { flexBasis: "calc(33.333% - 8px)" }));
    expect(card(root).layoutSizingHorizontal).toBe("FIXED");
    expect(Math.round(card(root).width)).toBe(400);
  });

  it("flex-basis: 100% pins the full-width card FIXED", () => {
    const root = convert(bentoRow(1232, { flexBasis: "100%", maxWidth: "1232px" }));
    expect(card(root).layoutSizingHorizontal).toBe("FIXED");
  });

  it("a frame whose children are all position:absolute cannot HUG", () => {
    // Nothing is in flow, so HUG would size the card to zero content.
    const kids = [
      frame("div", 828, 686, { position: "absolute", display: "block" }),
      frame("div", 826, 684, { position: "absolute", display: "block" }),
    ];
    const root = convert(bentoRow(816, {}, kids));
    expect(card(root).layoutSizingHorizontal).toBe("FIXED");
  });

  // ⬇️ regression guards — the plain cases must keep their old behaviour
  it("width:auto with no basis and no max-width still HUGs", () => {
    const root = convert(bentoRow(400, {}, [
      frame("span", 120, 20, { display: "block" }),
    ]));
    expect(card(root).layoutSizingHorizontal).toBe("HUG");
  });

  it("flex-basis: auto does not pin anything", () => {
    const root = convert(bentoRow(400, { flexBasis: "auto" }, [
      frame("span", 120, 20, { display: "block" }),
    ]));
    expect(card(root).layoutSizingHorizontal).toBe("HUG");
  });

  it("max-width that does NOT match the measured width is left alone", () => {
    // The element was shrunk below its cap by the row — the cap is not the
    // width the browser settled on, so it carries no sizing intent here.
    const root = convert(bentoRow(300, { maxWidth: "816px" }, [
      frame("span", 120, 20, { display: "block" }),
    ]));
    expect(card(root).layoutSizingHorizontal).toBe("HUG");
  });
});

describe("stripe.com bento — all six cards", () => {
  it("keeps every measured width so the row can wrap 2 + 3 + 1", () => {
    const widths = [816, 400, 400, 400, 400, 1232];
    const bases = [
      "calc(66.666% - 8px)", "calc(33.333% - 8px)", "calc(33.333% - 12px)",
      "calc(33.333% - 12px)", "calc(33.333% - 8px)", "100%",
    ];
    const root = convert(
      frame("div", 1232, 1834, { display: "flex", flexWrap: "wrap", gap: "16px", width: "1232px" },
        widths.map((w, i) =>
          frame("button", w, i === 5 ? 450 : 676, {
            display: "flex", position: "relative", width: "auto",
            flexGrow: 1, flexShrink: 1, flexBasis: bases[i], maxWidth: `${w}px`,
          }, [frame("div", w + 12, 686, { position: "absolute", display: "block" })]),
        ),
      ),
    );

    const cards = (root.children ?? []).filter((c) => c.tag === "button");
    expect(cards).toHaveLength(6);
    expect(cards.map((c) => Math.round(c.width))).toEqual(widths);
    expect(cards.map((c) => c.layoutSizingHorizontal)).toEqual(Array(6).fill("FIXED"));
  });
});
