/**
 * Declared-cut filtering for the font download modal.
 *
 * telex.ge: BPG Nino Mtavruli ships ONE file (weight 400) and the page fakes
 * bold in the browser. The availability check found the used 700 cut missing
 * and reopened the download modal on every import — offering a file that does
 * not exist anywhere. A missing cut is only actionable when some @font-face
 * actually DECLARES a matching face; everything else must be dropped so the
 * modal stays closed.
 */

import { describe, it, expect } from "vitest";
import {
  buildFontDeclaredCuts,
  filterMissingCutsToDeclared,
  type FontCut,
} from "../utils/fontUtils";

const cut = (weight: number, italic = false): FontCut => ({ weight, italic });

describe("buildFontDeclaredCuts", () => {
  it("maps each family to its declared weights (both metadata shapes)", () => {
    const map = buildFontDeclaredCuts([
      { family: "BPG Nino Mtavruli", weight: "400", style: "normal" },
      { fontFamily: "Sohne", fontWeight: "700", fontStyle: "italic" },
    ]);
    expect(map["BPG Nino Mtavruli"]).toEqual([cut(400)]);
    expect(map["Sohne"]).toEqual([cut(700, true)]);
  });

  it("normalizes keyword weights and defaults", () => {
    const map = buildFontDeclaredCuts([
      { family: "A", weight: "normal", style: "normal" },
      { family: "B", weight: "bold", style: "normal" },
      { family: "C", style: "normal" }, // weight absent → 400
    ]);
    expect(map["A"]).toEqual([cut(400)]);
    expect(map["B"]).toEqual([cut(700)]);
    expect(map["C"]).toEqual([cut(400)]);
  });

  it("expands a variable-font weight range to its endpoints", () => {
    const map = buildFontDeclaredCuts([
      { family: "Var", weight: "100 900", style: "normal" },
    ]);
    expect(map["Var"]).toEqual([cut(100), cut(900)]);
  });

  it("dedupes repeated cuts and returns {} for no input", () => {
    const map = buildFontDeclaredCuts([
      { family: "A", weight: "400", style: "normal" },
      { family: "A", weight: "400", style: "normal", src: "other-url" },
    ]);
    expect(map["A"]).toEqual([cut(400)]);
    expect(buildFontDeclaredCuts(undefined)).toEqual({});
  });
});

describe("filterMissingCutsToDeclared", () => {
  it("drops a missing cut no declared face can provide (telex faux-bold)", () => {
    const filtered = filterMissingCutsToDeclared(
      { "BPG Nino Mtavruli": [cut(700)] },
      { "BPG Nino Mtavruli": [cut(400)] },
    );
    // Nothing downloadable remains → family disappears entirely.
    expect(filtered).toEqual({});
  });

  it("keeps cuts the site actually declares", () => {
    const filtered = filterMissingCutsToDeclared(
      { Inter: [cut(700), cut(300)] },
      { Inter: [cut(700)] },
    );
    expect(filtered).toEqual({ Inter: [cut(700)] });
  });

  it("a variable-font range covers every weight between its endpoints", () => {
    const filtered = filterMissingCutsToDeclared(
      { Var: [cut(550)] },
      { Var: [cut(100), cut(900)] },
    );
    expect(filtered).toEqual({ Var: [cut(550)] });
  });

  it("italic never satisfies an upright cut (and vice versa)", () => {
    const filtered = filterMissingCutsToDeclared(
      { A: [cut(400, false)] },
      { A: [cut(400, true)] },
    );
    expect(filtered).toEqual({});
  });

  it("families without declared-cut info pass through untouched", () => {
    const filtered = filterMissingCutsToDeclared(
      { Unknown: [cut(700)] },
      {},
    );
    expect(filtered).toEqual({ Unknown: [cut(700)] });
  });
});
