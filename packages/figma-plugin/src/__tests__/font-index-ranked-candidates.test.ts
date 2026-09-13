/**
 * `rankInIndex` — every candidate the index can offer, best first.
 *
 * `matchInIndex` answers "which cut is the best match", which is the right
 * question right up until that cut refuses to load. Figma lists fonts it
 * cannot load (stripe.com: a "Söhne VF" with Light/Regular sits in
 * `listAvailableFontsAsync` next to the loadable "S?hne VF", and every
 * `loadFontAsync` on it throws). A caller that only ever sees the winner has
 * no way to try the runner-up, so the whole family is reported missing.
 *
 * Ranked order must be identical to what `matchInIndex` already returns for
 * its first element — that path is what the renderer uses.
 */
import { describe, it, expect } from "vitest";
import {
  buildFontIndex,
  matchInIndex,
  rankInIndex,
} from "../rendering/fontIndex";

const SOHNE = [
  // The loadable install: mangled family, German named instances.
  { family: "S?hne VF", style: "Buch" },
  { family: "S?hne VF", style: "Leicht" },
  { family: "S?hne VF", style: "Extraleicht" },
  // The phantom twin Figma also lists.
  { family: "Söhne VF", style: "Light" },
  { family: "Söhne VF", style: "Regular" },
];

describe("rankInIndex", () => {
  it("returns every cut in the family's normalized bucket, both spellings", () => {
    const index = buildFontIndex(SOHNE);

    const ranked = rankInIndex(index, { family: "Söhne VF", weight: 300 });

    expect(ranked.length).toBeGreaterThanOrEqual(SOHNE.length);
    const spellings = new Set(ranked.map((f) => f.family));
    expect(spellings.has("S?hne VF")).toBe(true);
    expect(spellings.has("Söhne VF")).toBe(true);
  });

  it("agrees with matchInIndex on the winner", () => {
    const index = buildFontIndex(SOHNE);

    for (const weight of [200, 300, 400, 500, 700]) {
      const req = { family: "Söhne VF", weight };
      expect(rankInIndex(index, req)[0] ?? null).toEqual(matchInIndex(index, req));
    }
  });

  it("carries the exact installed family on every candidate", () => {
    const index = buildFontIndex(SOHNE);

    const ranked = rankInIndex(index, { family: "Söhne VF", weight: 300 });

    // Never a normalized key — these strings go straight to loadFontAsync.
    for (const f of ranked) {
      expect(SOHNE.some((s) => s.family === f.family && s.style === f.style)).toBe(true);
    }
  });

  it("returns an empty list for an unknown family", () => {
    expect(rankInIndex(buildFontIndex(SOHNE), { family: "Nothing" })).toEqual([]);
  });

  it("honours exact: only same-weight cuts, or nothing", () => {
    const index = buildFontIndex(SOHNE);

    const hit = rankInIndex(index, { family: "Söhne VF", weight: 400, exact: true });
    expect(hit.every((f) => f.weight === 400)).toBe(true);

    expect(
      rankInIndex(index, { family: "Söhne VF", weight: 950, exact: true }),
    ).toEqual([]);
  });
});
