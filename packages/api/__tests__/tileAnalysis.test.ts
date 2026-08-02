import { describe, it, expect } from "vitest";
import {
  shiftResultToPage,
  ownershipBounds,
  mergeTileAnalyses,
  type TileInput,
} from "../src/lib/tileAnalysis.js";
import type { AbsoluteAnalysisResult, AbsoluteElement } from "../src/lib/aiGenerator.js";

/** Element factory — only the fields the merge logic reads. */
function el(partial: Partial<AbsoluteElement> & { y: number }): AbsoluteElement {
  return {
    type: "paragraph",
    x: 100,
    width: 400,
    height: 40,
    ...partial,
  } as AbsoluteElement;
}

function result(elements: AbsoluteElement[], extra?: Partial<AbsoluteAnalysisResult>): AbsoluteAnalysisResult {
  return { pageWidth: 1425, pageHeight: 900, elements, ...extra };
}

const COLORS_A = { text: "#111111", background: "#FFFFFF", secondary: "#888888", surface: "#F5F5F5", accent: "#3366FF" };
const COLORS_B = { text: "#222222", background: "#FFFFFF", secondary: "#888888", surface: "#F5F5F5", accent: "#3366FF" };

/** Two 900px tiles overlapping by 200px: [0..900) and [700..1600). */
const TILES_2: TileInput[] = [
  { offsetY: 0, width: 1425, height: 900 },
  { offsetY: 700, width: 1425, height: 900 },
];

describe("shiftResultToPage", () => {
  it("shifts top-level elements by the tile offset", () => {
    const r = result([el({ y: 50 }), el({ y: 300 })]);
    shiftResultToPage(r, 700);
    expect(r.elements.map((e) => e.y)).toEqual([750, 1000]);
  });

  it("recurses into container children and button groups", () => {
    const card = el({
      type: "card",
      y: 100,
      elements: [el({ y: 120 })],
    });
    const group = el({
      type: "button-group",
      y: 400,
      buttons: [el({ type: "button", y: 410 })],
    });
    const r = result([card, group]);

    shiftResultToPage(r, 500);

    expect(card.y).toBe(600);
    expect((card.elements as AbsoluteElement[])[0].y).toBe(620);
    expect(group.y).toBe(900);
    expect((group.buttons as AbsoluteElement[])[0].y).toBe(910);
  });

  it("leaves children without coordinates untouched", () => {
    const card = el({
      type: "card",
      y: 100,
      elements: [{ type: "paragraph", text: "flow child" } as unknown as AbsoluteElement],
    });
    const r = result([card]);

    shiftResultToPage(r, 500);

    const child = (card.elements as AbsoluteElement[])[0];
    expect(child.y).toBeUndefined();
  });
});

describe("ownershipBounds", () => {
  it("puts each boundary at the midpoint of the overlap", () => {
    // Overlap of TILES_2 is [700..900) → midpoint 800.
    expect(ownershipBounds(TILES_2)).toEqual([800]);
  });

  it("returns no boundaries for a single tile", () => {
    expect(ownershipBounds([TILES_2[0]])).toEqual([]);
  });
});

describe("mergeTileAnalyses — ownership dedup", () => {
  it("keeps an overlap-zone element only from its owning tile", () => {
    // The same button sits at page-y 720 (center 740) — below the 800 boundary,
    // so tile 0 owns it. Tile 1 sees it too (tile-local y=20).
    const fromTile0 = result([el({ type: "button", y: 720, text: "Sign up" })]);
    const fromTile1 = result([el({ type: "button", y: 20, text: "Sign up" })]);

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    const buttons = merged.elements.filter((e) => e.type === "button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].y).toBe(720);
  });

  it("keeps an element owned by the second tile from the second tile", () => {
    // Page-y 850 (center 870) — above the 800 boundary → tile 1 owns it.
    const fromTile0 = result([el({ type: "badge", y: 850 })]);
    const fromTile1 = result([el({ type: "badge", y: 150 })]);

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "badge")).toHaveLength(1);
  });

  it("keeps non-overlapping content from every tile", () => {
    const fromTile0 = result([el({ y: 100, text: "top" })]);
    const fromTile1 = result([el({ y: 500, text: "bottom" })]); // page-y 1200

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements).toHaveLength(2);
    expect(merged.elements.map((e) => e.y)).toEqual([100, 1200]);
  });
});

describe("mergeTileAnalyses — seam stitch", () => {
  it("unions a container element cut across the seam", () => {
    // A 500px image: tile 0 sees rows [600..900) (clipped at its bottom edge),
    // tile 1 sees rows [700..1100) (clipped at its top edge, tile-local 0..400).
    const fromTile0 = result([el({ type: "image", x: 200, width: 1000, y: 600, height: 300 })]);
    const fromTile1 = result([el({ type: "image", x: 205, width: 995, y: 0, height: 400 })]);

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    const images = merged.elements.filter((e) => e.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0].y).toBe(600);
    expect(images[0].y + images[0].height).toBe(1100);
  });

  it("does not stitch text elements at the seam", () => {
    // Two genuinely separate paragraphs on either side of the boundary.
    const fromTile0 = result([el({ type: "paragraph", y: 740, height: 40, text: "above" })]);
    const fromTile1 = result([el({ type: "paragraph", y: 110, height: 40, text: "below" })]); // page 810

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "paragraph")).toHaveLength(2);
  });

  it("does not stitch containers that are horizontally disjoint", () => {
    // Both edge-clipped at the seam and owned by their own tiles (centres
    // 750 and 850 around the 800 boundary) — only the x-overlap gate differs.
    const fromTile0 = result([el({ type: "image", x: 0, width: 400, y: 600, height: 300 })]);
    const fromTile1 = result([el({ type: "image", x: 1000, width: 400, y: 0, height: 300 })]); // page 700

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "image")).toHaveLength(2);
  });
});

describe("mergeTileAnalyses — section-bg continuity", () => {
  it("merges adjacent same-background section rectangles across the seam", () => {
    const fromTile0 = result([
      el({ type: "section-bg", x: 0, width: 1425, y: 400, height: 380, background: "surface" }),
    ]);
    // Tile 1's copy starts where tile 0's ends (within tolerance): page 780.
    const fromTile1 = result([
      el({ type: "section-bg", x: 0, width: 1425, y: 80, height: 500, background: "surface" }),
    ]);

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    const sections = merged.elements.filter((e) => e.type === "section-bg");
    expect(sections).toHaveLength(1);
    expect(sections[0].y).toBe(400);
    expect(sections[0].y + sections[0].height).toBe(1280);
  });

  it("keeps differently-coloured sections separate", () => {
    const fromTile0 = result([
      el({ type: "section-bg", x: 0, width: 1425, y: 400, height: 380, background: "surface" }),
    ]);
    const fromTile1 = result([
      el({ type: "section-bg", x: 0, width: 1425, y: 80, height: 500, background: "accent" }),
    ]);

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "section-bg")).toHaveLength(2);
  });
});

describe("mergeTileAnalyses — boundary-straddling duplicates", () => {
  it("keeps one copy when the two tiles report the same element on opposite sides of the boundary", () => {
    // Model noise: tile 0 sees the card at page-y 750 (center 795), tile 1 at
    // page-y 762 (center 807). Centers straddle the 800 boundary, so plain
    // ownership keeps BOTH — the near-duplicate pass must collapse them.
    const fromTile0 = result([el({ type: "card", x: 100, width: 600, y: 750, height: 90 })]);
    const fromTile1 = result([el({ type: "card", x: 104, width: 596, y: 62, height: 90 })]); // page 762

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "card")).toHaveLength(1);
  });

  it("collapses the same card reported by both tiles with a large y disagreement", () => {
    // Real case from a tall import: two neighbouring tiles placed the same
    // step card 78px apart (151px vs 161px tall). IoU is only ~0.31, so an
    // IoU threshold misses it — the boxes still overlap vertically and share
    // their x-band, which is the reliable signal.
    const fromTile0 = result([el({ type: "card", x: 100, width: 300, y: 750, height: 151 })]);
    const fromTile1 = result([el({ type: "card", x: 100, width: 300, y: 128, height: 161 })]); // page 828

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "card")).toHaveLength(1);
  });

  it("keeps vertically stacked same-type elements that merely abut", () => {
    // Two paragraphs one after the other — touching, not overlapping.
    const fromTile0 = result([el({ type: "paragraph", x: 100, width: 300, y: 700, height: 100 })]);
    const fromTile1 = result([el({ type: "paragraph", x: 100, width: 300, y: 100, height: 100 })]); // page 800

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "paragraph")).toHaveLength(2);
  });

  it("keeps genuinely different same-type elements near the boundary", () => {
    // Two buttons side by side — heavy y-overlap but disjoint in x.
    const fromTile0 = result([el({ type: "button", x: 100, width: 200, y: 750, height: 90 })]);
    const fromTile1 = result([el({ type: "button", x: 700, width: 200, y: 62, height: 90 })]);

    const merged = mergeTileAnalyses([fromTile0, fromTile1], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "button")).toHaveLength(2);
  });

  it("keeps stacked same-type elements from the same tile", () => {
    // A column of paragraphs from ONE tile must never self-dedupe.
    const fromTile0 = result([
      el({ type: "paragraph", x: 100, width: 600, y: 100, height: 40 }),
      el({ type: "paragraph", x: 100, width: 600, y: 150, height: 40 }),
    ]);

    const merged = mergeTileAnalyses([fromTile0, result([])], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "paragraph")).toHaveLength(2);
  });
});

describe("mergeTileAnalyses — slice overflow clamping", () => {
  it("clips an element that spills past its slice's bottom edge", () => {
    // Tile 0 is 900 tall; the model hallucinated a box reaching 1000.
    const spilling = el({ type: "image", y: 700, height: 300 });
    const merged = mergeTileAnalyses([result([spilling]), result([])], TILES_2, 1425, 1600);

    const image = merged.elements.find((e) => e.type === "image")!;
    expect(image.y + image.height).toBeLessThanOrEqual(900);
  });

  it("drops an element whose box lies entirely beyond its slice", () => {
    const phantom = el({ type: "badge", y: 950, height: 40 }); // tile 0 ends at 900
    const merged = mergeTileAnalyses([result([phantom]), result([])], TILES_2, 1425, 1600);

    expect(merged.elements.filter((e) => e.type === "badge")).toHaveLength(0);
  });
});

describe("mergeTileAnalyses — result envelope", () => {
  it("takes the majority extractedColors, first tile breaking ties", () => {
    const tiles: TileInput[] = [
      { offsetY: 0, width: 1425, height: 900 },
      { offsetY: 700, width: 1425, height: 900 },
      { offsetY: 1400, width: 1425, height: 900 },
    ];
    const merged = mergeTileAnalyses(
      [
        result([el({ y: 10 })], { extractedColors: COLORS_A }),
        result([], { extractedColors: COLORS_B }),
        result([], { extractedColors: COLORS_B }),
      ],
      tiles,
      1425,
      2300,
    );

    expect(merged.extractedColors?.text).toBe("#222222"); // majority B
    expect(merged.extractedColors?.background).toBe("#FFFFFF");
  });

  it("forces pageWidth and pageHeight to the exact tiled dimensions", () => {
    const merged = mergeTileAnalyses(
      [result([el({ y: 100 })], { pageHeight: 5000 }), result([])],
      TILES_2,
      1425,
      1600,
    );

    expect(merged.pageWidth).toBe(1425);
    expect(merged.pageHeight).toBe(1600);
  });

  it("returns elements sorted by y", () => {
    const merged = mergeTileAnalyses(
      [result([el({ y: 500 }), el({ y: 100 })]), result([el({ y: 400 })])], // page 1100
      TILES_2,
      1425,
      1600,
    );

    const ys = merged.elements.map((e) => e.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });
});
