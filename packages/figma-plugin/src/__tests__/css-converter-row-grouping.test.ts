/**
 * `groupRunsByRow` decides which per-line runs share one visual line, and every
 * downstream inline decision reads its answer: the TEXT_COALESCE gate
 * (`rowsShareCommonEdge`), the hard-line-break count, and the per-row
 * `renderedTextWidths` the renderer measures against.
 *
 * It replaced a `|Δy| <= 2` same-top rule with a 50%-vertical-overlap rule. The
 * two disagree in exactly two places, and those are the cases below: mixed font
 * sizes on ONE line (tops differ by more than 2px, same row) and consecutive
 * wrapped lines whose ascent+descent exceeds the line step (boxes graze, still
 * two rows). The corpus tests stayed green through the swap, so nothing else
 * pins the new rule.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("figma", { createFrame: vi.fn(), mixed: Symbol("figma.mixed") });

import { groupRunsByRow } from "../rendering/css-converter";

/** Minimal run — grouping reads only y/height, value is for readable failures. */
function run(value: string, y: number, height: number, x = 0, width = 100) {
  return { value, font: "Inter 400", x, y, width, height } as never;
}

/** Rows rendered as the values they hold, for legible assertions. */
const shape = (rows: unknown[][]): string[][] =>
  rows.map((r) => r.map((v) => (v as { value: string }).value));

describe("groupRunsByRow", () => {
  it("keeps mixed font sizes on one line together", () => {
    // `<p 16px>plain <span 22px>big</span></p>`: the runs sit on a common
    // baseline, so their TOPS differ by the font-size gap. The old |Δy| <= 2
    // rule split this into two rows and the span dropped onto its own line.
    const rows = groupRunsByRow([
      run("plain ", 0, 19),
      run("big", -3, 26, 40),
    ]);

    expect(shape(rows)).toEqual([["plain ", "big"]]);
  });

  it("splits consecutive wrapped lines that graze each other", () => {
    // stripe.com: 26px copy on a 29.12px line step — each line box overlaps the
    // next by 3.88px (12% of 33). Overlap alone would merge the whole paragraph
    // into one row; the 50% floor is what tells grazing from sharing.
    const rows = groupRunsByRow([
      run("first line", 0, 33),
      run("second line", 29.12, 33),
      run("third line", 58.24, 33),
    ]);

    expect(shape(rows)).toEqual([["first line"], ["second line"], ["third line"]]);
  });

  it("merges at exactly half the shorter run's height", () => {
    // The threshold is inclusive (`>=`). A run half-covered by the open row
    // belongs to it.
    const rows = groupRunsByRow([run("a", 0, 20), run("b", 10, 20, 120)]);

    expect(shape(rows)).toEqual([["a", "b"]]);
  });

  it("splits just below half", () => {
    const rows = groupRunsByRow([run("a", 0, 20), run("b", 10.5, 20, 120)]);

    expect(shape(rows)).toEqual([["a"], ["b"]]);
  });

  it("measures a tall run against the SHORTER of the two boxes", () => {
    // A 40px heading run beside a 12px superscript: 12px of overlap is 100% of
    // the superscript but only 30% of the heading. They share the line.
    const rows = groupRunsByRow([run("Heading", 0, 40), run("*", 0, 12, 200)]);

    expect(shape(rows)).toEqual([["Heading", "*"]]);
  });

  it("grows the open row's band as runs join it", () => {
    // The row's band is the union of everything in it, so a third run is
    // compared against the merged extent — not against the first run alone.
    const rows = groupRunsByRow([
      run("a", 0, 12),
      run("b", 0, 40, 50),
      run("c", 24, 16, 120),
    ]);

    expect(shape(rows)).toEqual([["a", "b", "c"]]);
  });

  it("returns no rows for no runs", () => {
    expect(groupRunsByRow([])).toEqual([]);
  });
});
