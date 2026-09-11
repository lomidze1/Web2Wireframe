/**
 * A measured font name is often the face's FULL NAME, not its family.
 *
 * `CSS.getPlatformFontsForNode` reports what the renderer actually used, and
 * for a Linotype-style face that string is "Helvetica Neue LT GEO 55 Roman" —
 * name ID 4. macOS (and therefore Figma) registers the same file as family
 * "Helvetica Neue LT GEO" + style "55 Roman". Asking the index for the full
 * name found nothing, so goodwill.ge rendered 90 layers in Inter and the
 * Re-apply modal waited forever on a family that can never exist.
 *
 * The style-word strip already in `rankInIndex` can't rescue this: it eats
 * "Roman" but leaves the numeric "55" in the family key
 * ("helveticaneueltgeo55" ≠ "helveticaneueltgeo").
 *
 * So: split the name against the index itself. A prefix only counts as the
 * family when the REMAINDER is a style that family actually ships — the index
 * is the evidence, never a guess about which words look style-ish.
 */
import { describe, it, expect } from "vitest";
import { buildFontIndex, rankInIndex } from "../rendering/fontIndex";

/** The three cuts goodwill.ge ships, as macOS registers them. */
const HELVETICA_GEO = [
  { family: "Helvetica Neue LT GEO", style: "45 Light" },
  { family: "Helvetica Neue LT GEO", style: "55 Roman" },
  { family: "Helvetica Neue LT GEO", style: "75 Bold" },
];

describe("rankInIndex — full name split into family + style", () => {
  it("resolves the measured full name to the installed family and cut", () => {
    const index = buildFontIndex(HELVETICA_GEO);

    const hits = rankInIndex(index, {
      family: "Helvetica Neue LT GEO 55 Roman",
      weight: 400,
      italic: false,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].family).toBe("Helvetica Neue LT GEO");
    expect(hits[0].style).toBe("55 Roman");
  });

  it("takes the weight from the split-off style when the request has none", () => {
    const index = buildFontIndex(HELVETICA_GEO);

    // No weight stated: "75 Bold" is the only thing that knows this is a 700.
    const hits = rankInIndex(index, { family: "Helvetica Neue LT GEO 75 Bold" });

    expect(hits[0].family).toBe("Helvetica Neue LT GEO");
    expect(hits[0].style).toBe("75 Bold");
  });

  it("keeps an explicitly requested weight over the name's own", () => {
    const index = buildFontIndex(HELVETICA_GEO);

    const hits = rankInIndex(index, {
      family: "Helvetica Neue LT GEO 55 Roman",
      weight: 700,
      italic: false,
    });

    expect(hits[0].family).toBe("Helvetica Neue LT GEO");
    expect(hits[0].style).toBe("75 Bold");
  });

  it("never falls back to a shorter family whose styles don't match", () => {
    // "Helvetica" IS installed on every Mac. Splitting greedily would hand
    // plain Helvetica back for a Georgian Neue LT GEO face — a silent, wrong
    // substitution the user would never be told about.
    const index = buildFontIndex([{ family: "Helvetica", style: "Regular" }]);

    expect(
      rankInIndex(index, {
        family: "Helvetica Neue LT GEO 55 Roman",
        weight: 400,
        italic: false,
      }),
    ).toEqual([]);
  });

  it("does not treat a family suffix as a style ('Inter Display' ≠ Inter)", () => {
    const index = buildFontIndex([{ family: "Inter", style: "Regular" }]);

    expect(
      rankInIndex(index, { family: "Inter Display", weight: 400, italic: false }),
    ).toEqual([]);
  });

  it("still prefers an exact family match over any split", () => {
    const index = buildFontIndex([
      ...HELVETICA_GEO,
      // A family that literally carries the full name — the split must not
      // steal a request the direct key already answers.
      { family: "Helvetica Neue LT GEO 55 Roman", style: "Regular" },
    ]);

    const hits = rankInIndex(index, {
      family: "Helvetica Neue LT GEO 55 Roman",
      weight: 400,
      italic: false,
    });

    expect(hits[0].family).toBe("Helvetica Neue LT GEO 55 Roman");
    expect(hits[0].style).toBe("Regular");
  });

  it("leaves the existing style-word strip working", () => {
    // "Font Awesome 6 Brands Regular" measured against an installed
    // "Font Awesome 6 Brands" — handled by the older `rest`-strip retry.
    const index = buildFontIndex([
      { family: "Font Awesome 6 Brands", style: "Regular" },
    ]);

    const hits = rankInIndex(index, {
      family: "Font Awesome 6 Brands Regular",
      weight: 400,
      italic: false,
    });

    expect(hits[0].family).toBe("Font Awesome 6 Brands");
  });
});
