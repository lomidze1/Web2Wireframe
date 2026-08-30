/**
 * Inline TEXT-run merge — h2d `_j` (app.js:41713).
 *
 * h2d joins sibling TEXT nodes that are inline into ONE text node carrying
 * per-character ranges, and does it AFTER its frame merge so runs whose
 * separating wrapper has just been dissolved still meet. We had no equivalent:
 * `collectTextSegments` only ever sees one node plus its own inline children,
 * and `mergeAdjacentTextEntries` merges per-line runs inside a SINGLE parent
 * element during conversion. Runs that end up as siblings — a mixed child list,
 * or a wrapper `collapseSingleChildFrames` removed — stayed separate layers.
 *
 * THE RULE these tests exist to pin: merging must not move a single glyph.
 * Every merge here either concatenates runs the browser painted touching (no
 * separator invented) or restores the one space that CAUSED the measured gap.
 * Anything else is refused.
 */
import { describe, it, expect } from "vitest";
import { mergeInlineTextRuns } from "../rendering/textRunMerge";
import { simplifyTree } from "../rendering/treeSimplify";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// WireframeNode fixtures
// ---------------------------------------------------------------------------

let _id = 0;

function text(
  value: string,
  box: { x: number; y: number; width: number; height: number },
  extra: Partial<WireframeNode> = {},
): WireframeNode {
  return {
    id: `t${_id++}`,
    name: value.slice(0, 30),
    type: "text",
    tag: "span",
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#111111",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: value,
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: "24px",
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    ...extra,
  };
}

function frame(
  children: WireframeNode[],
  extra: Partial<WireframeNode> = {},
): WireframeNode {
  return {
    id: `f${_id++}`,
    name: "Box",
    type: "frame",
    tag: "div",
    x: 0,
    y: 0,
    width: 400,
    height: 40,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#111111",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: "24px",
    letterSpacing: 0,
    isPlaceholder: false,
    children,
    ...extra,
  };
}

/** Two runs on one row, `gap` px apart, starting at x = 0. */
function row(
  a: string,
  b: string,
  gap: number,
  aExtra: Partial<WireframeNode> = {},
  bExtra: Partial<WireframeNode> = {},
): { parent: WireframeNode; a: WireframeNode; b: WireframeNode } {
  const na = text(a, { x: 0, y: 0, width: 40, height: 18 }, aExtra);
  const nb = text(b, { x: 40 + gap, y: 0, width: 50, height: 18 }, bExtra);
  return { parent: frame([na, nb]), a: na, b: nb };
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

describe("mergeInlineTextRuns — same-row runs", () => {
  it("merges runs separated by a measured gap, restoring the one space", () => {
    const { parent } = row("Hello", "world", 4);

    expect(mergeInlineTextRuns(parent)).toBe(true);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].textContent).toBe("Hello world");
  });

  it("merges touching runs WITHOUT inventing a separator", () => {
    const { parent } = row("Hello", "world", 0);

    mergeInlineTextRuns(parent);
    expect(parent.children[0].textContent).toBe("Helloworld");
    // The flag that tells createTextNode its segment texts are already exact.
    expect(parent.children[0].exactSegments).toBe(true);
  });

  it("does not double the space when a run already carries the boundary", () => {
    const { parent } = row("Hello ", "world", 4);

    mergeInlineTextRuns(parent);
    expect(parent.children[0].textContent).toBe("Hello world");
  });

  it("keeps every glyph where it was: box is the union of the runs", () => {
    const { parent } = row("Hello", "world", 4);

    mergeInlineTextRuns(parent);
    const merged = parent.children[0];
    expect(merged.x).toBe(0);
    expect(merged.y).toBe(0);
    expect(merged.width).toBe(94); // 40 + 4 + 50
    expect(merged.height).toBe(18);
  });

  it("carries each run's own typography as a segment", () => {
    const { parent } = row(
      "Hello",
      "world",
      4,
      {},
      { fontWeight: 700, textColor: "#ff0000", fontSize: 20 },
    );

    mergeInlineTextRuns(parent);
    const segs = parent.children[0].styledSegments!;
    expect(segs).toHaveLength(3); // run, separator, run
    expect(segs[0]).toMatchObject({ text: "Hello", fontWeight: 400, color: "#111111", fontSize: 16 });
    expect(segs[2]).toMatchObject({ text: "world", fontWeight: 700, color: "#ff0000", fontSize: 20 });
  });

  it("gives the restored separator the PARENT's font, not a neighbour's", () => {
    // The whitespace in `<p>Hello <b>world</b></p>` is a child of the <p>, so
    // the browser advanced it by a regular space. Letting it inherit the bold
    // run's font would advance it by a wider one and shift every glyph after it.
    const { parent } = row("Hello", "world", 4, {}, { fontWeight: 700 });

    mergeInlineTextRuns(parent);
    const segs = parent.children[0].styledSegments!;
    expect(segs[1]).toMatchObject({ text: " ", fontWeight: 400, fontFamily: "Inter" });
  });

  it("keeps the segment texts equal to the characters", () => {
    const { parent } = row("Hello", "world", 4);

    mergeInlineTextRuns(parent);
    const segs = parent.children[0].styledSegments!;
    // Concatenating the segment texts must reproduce the characters exactly —
    // that identity is what makes every per-range offset land on its own glyphs.
    expect(segs.map((s) => s.text).join("")).toBe(parent.children[0].textContent);
  });

  it("merges three runs into one node in a single pass", () => {
    const a = text("one", { x: 0, y: 0, width: 30, height: 18 });
    const b = text("two", { x: 34, y: 0, width: 30, height: 18 });
    const c = text("three", { x: 68, y: 0, width: 40, height: 18 });
    const parent = frame([a, b, c]);

    mergeInlineTextRuns(parent);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].textContent).toBe("one two three");
  });

  it("keeps a per-run href and clears the node-level one when they differ", () => {
    const { parent } = row("read the ", "docs", 0, {}, { href: "https://x.dev/docs", tag: "a" });

    mergeInlineTextRuns(parent);
    const merged = parent.children[0];
    expect(merged.href).toBeUndefined();
    expect(merged.styledSegments!.map((s) => s.href)).toEqual([undefined, "https://x.dev/docs"]);
  });

  it("keeps the node-level href when both runs share it", () => {
    const link = "https://x.dev";
    const { parent } = row("read ", "this", 0, { href: link, tag: "a" }, { href: link, tag: "a" });

    mergeInlineTextRuns(parent);
    expect(parent.children[0].href).toBe(link);
  });

  it("re-derives the layer name from the merged text", () => {
    const { parent } = row("Hello", "world", 4);

    mergeInlineTextRuns(parent);
    expect(parent.children[0].name).toBe("Hello world");
  });
});

// ---------------------------------------------------------------------------
// Refusals — every one of these would move a glyph or lose an identity
// ---------------------------------------------------------------------------

describe("mergeInlineTextRuns — refusals", () => {
  const refuses = (parent: WireframeNode, childCount = 2): void => {
    expect(mergeInlineTextRuns(parent)).toBe(false);
    expect(parent.children).toHaveLength(childCount);
  };

  it("refuses when a non-text sibling sits between the runs", () => {
    const a = text("Hello", { x: 0, y: 0, width: 40, height: 18 });
    const img = frame([], { tag: "img", x: 44, y: 0, width: 20, height: 18 });
    const b = text("world", { x: 68, y: 0, width: 40, height: 18 });
    refuses(frame([a, img, b]), 3);
  });

  it("refuses runs with different textAlign", () => {
    refuses(row("Hello", "world", 4, {}, { textAlign: "center" }).parent);
  });

  it("refuses a run that paints its own box", () => {
    refuses(row("Hello", "world", 4, {}, { backgroundColor: "#eeeeee" }).parent);
  });

  it("refuses runs with different opacity", () => {
    refuses(row("Hello", "world", 4, {}, { opacity: 0.5 }).parent);
  });

  it("refuses an out-of-flow run", () => {
    refuses(row("Hello", "world", 4, {}, { position: "absolute" }).parent);
  });

  it("refuses a run carrying hover identity", () => {
    refuses(row("Hello", "world", 4, {}, { pseudoStateStyles: { hover: { color: "red" } } }).parent);
  });

  it("refuses a block-level run", () => {
    refuses(row("Hello", "world", 4, {}, { tag: "p" }).parent);
  });

  it("refuses runs on different rows", () => {
    const a = text("line one", { x: 0, y: 0, width: 60, height: 18 });
    const b = text("line two", { x: 0, y: 22, width: 60, height: 18 });
    refuses(frame([a, b]));
  });

  it("refuses runs too far apart to be separated by one space", () => {
    refuses(row("Hello", "world", 40).parent);
  });

  it("refuses inside a VERTICAL auto-layout parent", () => {
    const { parent } = row("Hello", "world", 4);
    parent.layoutMode = "VERTICAL";
    parent.itemSpacing = 4;
    refuses(parent);
  });

  it("refuses when the HORIZONTAL parent's itemSpacing disagrees with the gap", () => {
    const { parent } = row("Hello", "world", 4);
    parent.layoutMode = "HORIZONTAL";
    parent.itemSpacing = 12;
    refuses(parent);
  });

  it("merges inside a HORIZONTAL parent whose itemSpacing IS the gap", () => {
    const { parent } = row("Hello", "world", 4);
    parent.layoutMode = "HORIZONTAL";
    parent.itemSpacing = 4;
    expect(mergeInlineTextRuns(parent)).toBe(true);
  });

  it("refuses a run whose glyphs carry a gradient fill", () => {
    refuses(
      row("Hello", "world", 4, {}, {
        textFills: [{ type: "GRADIENT_LINEAR" } as never],
      }).parent,
    );
  });
});

// ---------------------------------------------------------------------------
// Whitespace-only runs
// ---------------------------------------------------------------------------

describe("mergeInlineTextRuns — whitespace-only runs", () => {
  it("absorbs a whitespace-only run as the separator", () => {
    const a = text("Hello", { x: 0, y: 0, width: 40, height: 18 });
    const gap = text(" ", { x: 40, y: 0, width: 4, height: 18 });
    const b = text("world", { x: 44, y: 0, width: 50, height: 18 });
    const parent = frame([a, gap, b]);

    mergeInlineTextRuns(parent);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].textContent).toBe("Hello world");
  });

  it("drops a leftover whitespace-only run in an absolutely-placed parent", () => {
    const parent = frame([text(" ", { x: 0, y: 0, width: 4, height: 18 })]);

    expect(mergeInlineTextRuns(parent)).toBe(true);
    expect(parent.children).toHaveLength(0);
  });

  it("keeps a leftover whitespace-only run that owns an auto-layout slot", () => {
    const parent = frame(
      [
        text(" ", { x: 0, y: 0, width: 4, height: 18 }),
        frame([], { tag: "img", x: 8, y: 0, width: 20, height: 18 }),
      ],
      { layoutMode: "HORIZONTAL", itemSpacing: 4 },
    );

    mergeInlineTextRuns(parent);
    expect(parent.children).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Through the converter — the pass must see the tree AFTER the frame merge
// ---------------------------------------------------------------------------

function w2wFrame(
  tag: string,
  w: number,
  h: number,
  styles: Record<string, unknown>,
  children: unknown[] = [],
  x = 0,
  y = 0,
) {
  return {
    type: "FRAME",
    x, y, width: w, height: h,
    quad: [x, y, x + w, y, x + w, y + h, x, y + h],
    tag, classList: [], attr: {}, styles, children,
  };
}

const w2wText = (value: string, w: number, h: number, x = 0, y = 0) => ({
  type: "TEXT",
  x, y, width: w, height: h,
  quad: [x, y, x + w, y, x + w, y + h, x, y + h],
  value,
});

const BASE = { "font-size": "16px", color: "rgb(0, 0, 0)", "font-family": "Inter" };

function countText(n: WireframeNode): number {
  return (n.type === "text" ? 1 : 0) + n.children.reduce((a, c) => a + countText(c), 0);
}

describe("inline run merge through convertW2WToWireframe", () => {
  it("folds a row of inline-text frames into one TEXT node", () => {
    // <div><span>Hello</span> <a>world</a> <span>again</span></div> — the
    // all-inline rule makes the div a HORIZONTAL row of three TEXT siblings.
    const root = w2wFrame("body", 800, 200, { display: "block" }, [
      w2wFrame("div", 400, 20, { ...BASE, display: "block" }, [
        w2wFrame("span", 40, 18, { ...BASE, display: "inline" },
          [w2wText("Hello", 40, 18, 0, 0)], 0, 0),
        w2wFrame("a", 40, 18, { ...BASE, display: "inline", color: "rgb(0, 0, 255)" },
          [w2wText("world", 40, 18, 44, 0)], 44, 0),
        w2wFrame("span", 50, 18, { ...BASE, display: "inline" },
          [w2wText("again", 50, 18, 88, 0)], 88, 0),
      ], 0, 0),
    ]);

    const tree = convertW2WToWireframe(root as never, {}) as WireframeNode;
    expect(countText(tree)).toBe(1);
    const merged = tree.children[0].children[0] ?? tree.children[0];
    expect(merged.textContent).toBe("Hello world again");
  });

  it("leaves a paragraph broken by an inline image alone", () => {
    const root = w2wFrame("body", 800, 200, { display: "block" }, [
      w2wFrame("p", 400, 20, { ...BASE, display: "block" }, [
        w2wText("Hello", 40, 18, 0, 0),
        w2wFrame("img", 20, 18, { display: "inline-block" }, [], 44, 0),
        w2wText("world", 40, 18, 68, 0),
      ], 0, 0),
    ]);

    expect(countText(convertW2WToWireframe(root as never, {}) as WireframeNode)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ordering inside simplifyTree — the whole point of running after the frame passes
// ---------------------------------------------------------------------------

describe("merge inside simplifyTree", () => {
  it("joins runs whose separating frame the drop pass has just removed", () => {
    // A 0.4px empty spacer between two runs. `dropUselessNodes` deletes it, and
    // only then are the runs adjacent — a merge pass running before the frame
    // passes (or outside the loop) would never see this pair.
    const a = text("Hello", { x: 0, y: 0, width: 40, height: 18 });
    const sliver = frame([], { tag: "i", x: 40, y: 0, width: 0.4, height: 18 });
    const b = text("world", { x: 44, y: 0, width: 50, height: 18 });
    const root = frame([frame([a, sliver, b])]);

    simplifyTree(root);
    const parent = root.children[0];
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].textContent).toBe("Hello world");
  });

  it("settles — a second sweep over merged runs changes nothing", () => {
    const { parent } = row("Hello", "world", 4);
    mergeInlineTextRuns(parent);
    const after = JSON.stringify(parent);

    expect(mergeInlineTextRuns(parent)).toBe(false);
    expect(JSON.stringify(parent)).toBe(after);
  });
});
