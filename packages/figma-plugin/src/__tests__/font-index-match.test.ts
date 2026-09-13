/**
 * CSS Fonts Level 4 matching against the installed-font index (change 2).
 *
 * Spec order: slant → stretch (nearest) → weight (the spec's directional
 * fallback ordering, NOT plain absolute distance).
 *
 * The weight ordering is where our old ladder was wrong: it preferred the
 * LIGHTER neighbour above 500 ("600 → Semibold, Medium, Bold"), while the
 * spec ascends first for any desired weight above 500.
 */
import { describe, it, expect } from "vitest";
import {
  buildFontIndex,
  isSameFaceName,
  matchInIndex,
  orderWeightsBySpec,
} from "../rendering/fontIndex";

describe("orderWeightsBySpec", () => {
  it("400 → 400, then 500, then descending below, then ascending above", () => {
    expect(orderWeightsBySpec(400, [100, 300, 400, 500, 700, 900])).toEqual([
      400, 500, 300, 100, 700, 900,
    ]);
  });

  it("500 → 500, then 400, then descending below, then ascending above", () => {
    expect(orderWeightsBySpec(500, [200, 300, 400, 500, 600, 800])).toEqual([
      500, 400, 300, 200, 600, 800,
    ]);
  });

  it("below 400 → descending below first, then ascending above", () => {
    expect(orderWeightsBySpec(300, [100, 200, 400, 700])).toEqual([
      200, 100, 400, 700,
    ]);
  });

  it("above 500 → ascending above first, then descending below", () => {
    // The fix: 600 must reach for Bold before Medium.
    expect(orderWeightsBySpec(600, [300, 400, 500, 700, 900])).toEqual([
      700, 900, 500, 400, 300,
    ]);
  });

  it("800 ascends to 900 before dropping to 700", () => {
    expect(orderWeightsBySpec(800, [400, 700, 900])).toEqual([900, 700, 400]);
  });

  it("returns an empty list for an empty candidate set", () => {
    expect(orderWeightsBySpec(400, [])).toEqual([]);
  });
});

describe("matchInIndex — weight", () => {
  const index = buildFontIndex([
    { family: "Demo", style: "Light" },
    { family: "Demo", style: "Regular" },
    { family: "Demo", style: "Medium" },
    { family: "Demo", style: "Bold" },
    { family: "Demo", style: "Black" },
  ]);

  it("takes the exact cut when it exists", () => {
    expect(matchInIndex(index, { family: "Demo", weight: 700 })?.style).toBe("Bold");
  });

  it("600 without a Semibold ascends to Bold (was: Medium)", () => {
    expect(matchInIndex(index, { family: "Demo", weight: 600 })?.style).toBe("Bold");
  });

  it("500 falls to Regular before Bold", () => {
    const noMedium = buildFontIndex([
      { family: "Demo", style: "Regular" },
      { family: "Demo", style: "Bold" },
    ]);
    expect(matchInIndex(noMedium, { family: "Demo", weight: 500 })?.style).toBe("Regular");
  });

  it("400 prefers Medium over Light when there is no Regular", () => {
    const noRegular = buildFontIndex([
      { family: "Demo", style: "Light" },
      { family: "Demo", style: "Medium" },
    ]);
    expect(matchInIndex(noRegular, { family: "Demo", weight: 400 })?.style).toBe("Medium");
  });

  it("300 descends to Light-and-below before going up", () => {
    expect(matchInIndex(index, { family: "Demo", weight: 300 })?.style).toBe("Light");
  });

  it("is case- and punctuation-insensitive on the family name", () => {
    expect(matchInIndex(index, { family: "  demo ", weight: 700 })?.style).toBe("Bold");
  });

  it("returns null for a family that is not installed", () => {
    expect(matchInIndex(index, { family: "Nothing Here", weight: 400 })).toBeNull();
  });
});

describe("matchInIndex — family-name weights", () => {
  it('resolves ("Space Grotesk", 600) to the SemiBold FAMILY', () => {
    const index = buildFontIndex([
      { family: "Space Grotesk", style: "Regular" },
      { family: "Space Grotesk", style: "Bold" },
      { family: "Space Grotesk SemiBold", style: "Regular" },
    ]);
    const m = matchInIndex(index, { family: "Space Grotesk", weight: 600 });
    expect(m?.family).toBe("Space Grotesk SemiBold");
    expect(m?.style).toBe("Regular");
  });

  it("prefers an exactly-parsed entry over a defaulted one at the same weight", () => {
    const index = buildFontIndex([
      // "Buch" is a real 400 word; a hypothetical unknown cut name defaults to 400.
      { family: "Sohne", style: "Kraftig?" },
      { family: "Sohne", style: "Regular" },
    ]);
    expect(matchInIndex(index, { family: "Sohne", weight: 400 })?.style).toBe("Regular");
  });
});

describe("matchInIndex — stretch", () => {
  const index = buildFontIndex([
    { family: "Roboto", style: "Regular" },
    { family: "Roboto", style: "Bold" },
    { family: "Roboto Condensed", style: "Regular" },
    { family: "Roboto Condensed", style: "Bold" },
  ]);

  it('resolves ("Roboto", 700, condensed) to Roboto Condensed Bold', () => {
    const m = matchInIndex(index, { family: "Roboto", weight: 700, stretch: 75 });
    expect(m?.family).toBe("Roboto Condensed");
    expect(m?.style).toBe("Bold");
  });

  it("a normal-stretch request still gets the normal family", () => {
    const m = matchInIndex(index, { family: "Roboto", weight: 700 });
    expect(m?.family).toBe("Roboto");
  });

  it("picks the nearest stretch when the exact one is missing", () => {
    const m = matchInIndex(index, { family: "Roboto", weight: 400, stretch: 50 });
    expect(m?.family).toBe("Roboto Condensed");
  });

  it("stretch is matched before weight", () => {
    // Condensed only ships Bold — a 400 condensed request keeps the stretch
    // and takes the wrong weight, per the spec's ordering.
    const cd = buildFontIndex([
      { family: "Roboto", style: "Regular" },
      { family: "Roboto Condensed", style: "Bold" },
    ]);
    const m = matchInIndex(cd, { family: "Roboto", weight: 400, stretch: 75 });
    expect(m?.family).toBe("Roboto Condensed");
    expect(m?.style).toBe("Bold");
  });
});

describe("matchInIndex — slant", () => {
  it("prefers the italic cut for an italic request", () => {
    const index = buildFontIndex([
      { family: "Demo", style: "Regular" },
      { family: "Demo", style: "Italic" },
      { family: "Demo", style: "Bold" },
      { family: "Demo", style: "Bold Italic" },
    ]);
    expect(matchInIndex(index, { family: "Demo", weight: 700, italic: true })?.style)
      .toBe("Bold Italic");
  });

  it("falls back to upright when the family ships no italic at all", () => {
    const index = buildFontIndex([
      { family: "Demo", style: "Regular" },
      { family: "Demo", style: "Bold" },
    ]);
    expect(matchInIndex(index, { family: "Demo", weight: 700, italic: true })?.style)
      .toBe("Bold");
  });

  it("falls back to italic when the family ships no upright cut", () => {
    const index = buildFontIndex([{ family: "Demo", style: "Bold Italic" }]);
    expect(matchInIndex(index, { family: "Demo", weight: 700 })?.style)
      .toBe("Bold Italic");
  });

  it("never trades slant for weight when both cuts exist", () => {
    const index = buildFontIndex([
      { family: "Demo", style: "Bold" },
      { family: "Demo", style: "Light Italic" },
    ]);
    // Right slant, wrong weight wins — slant is filtered before weight.
    expect(matchInIndex(index, { family: "Demo", weight: 700, italic: true })?.style)
      .toBe("Light Italic");
  });
});

describe("matchInIndex — request-side style words", () => {
  it('resolves the request "Font Awesome 6 Brands Regular" to the installed family', () => {
    const index = buildFontIndex([
      { family: "Font Awesome 6 Brands", style: "Regular" },
    ]);
    const m = matchInIndex(index, { family: "Font Awesome 6 Brands Regular", weight: 400 });
    expect(m?.family).toBe("Font Awesome 6 Brands");
    expect(m?.style).toBe("Regular");
  });

  it("takes the weight from the request's own family words when CSS said 400", () => {
    const index = buildFontIndex([
      { family: "Space Grotesk", style: "Regular" },
      { family: "Space Grotesk", style: "Bold" },
    ]);
    // The measured family name carries the cut; CSS weight is the 400 default.
    const m = matchInIndex(index, { family: "Space Grotesk Bold", weight: 400 });
    expect(m?.style).toBe("Bold");
  });
});

describe("matchInIndex — exact mode", () => {
  const index = buildFontIndex([
    { family: "Demo", style: "Regular" },
    { family: "Demo", style: "Bold" },
  ]);

  it("returns null when the exact weight is missing", () => {
    expect(matchInIndex(index, { family: "Demo", weight: 600, exact: true })).toBeNull();
  });

  it("returns the cut when the exact weight is present", () => {
    expect(matchInIndex(index, { family: "Demo", weight: 700, exact: true })?.style)
      .toBe("Bold");
  });

  it("refuses an upright cut for an exact italic request", () => {
    expect(
      matchInIndex(index, { family: "Demo", weight: 700, italic: true, exact: true }),
    ).toBeNull();
  });
});

describe("matchInIndex — emoji partition", () => {
  const index = buildFontIndex([
    { family: "Apple Color Emoji", style: "Regular" },
    { family: "Noto Color Emoji", style: "Regular" },
  ]);

  it("an emoji font never satisfies a text run", () => {
    expect(matchInIndex(index, { family: "Apple Color Emoji", weight: 400, allowEmoji: false }))
      .toBeNull();
  });

  it("an emoji request still resolves to the emoji font", () => {
    expect(matchInIndex(index, { family: "Apple Color Emoji", weight: 400 })?.family)
      .toBe("Apple Color Emoji");
  });

  it("a text family is unaffected by the partition", () => {
    const mixed = buildFontIndex([
      { family: "Inter", style: "Regular" },
      { family: "Segoe UI Emoji", style: "Regular" },
    ]);
    expect(matchInIndex(mixed, { family: "Inter", weight: 400 })?.family).toBe("Inter");
  });
});

/**
 * `isSameFaceName` — "did drawing family+style give the face the page asked
 * for?". It sits on four hot paths in text.ts (the node-level Re-apply marker,
 * the cut marker, and both segment markers), so a normalization change here
 * silently re-opens goodwill.ge's 90-false-alarm font modal. Nothing tested the
 * primitive directly; only its end-to-end effect was pinned.
 */
describe("isSameFaceName", () => {
  it("accepts a full name served by family + style", () => {
    // THE case: the measured name is the face's FULL name. Family-to-family
    // comparison calls this a substitution; it is not one.
    expect(
      isSameFaceName("Helvetica Neue LT GEO 55 Roman", "Helvetica Neue LT GEO", "55 Roman"),
    ).toBe(true);
  });

  it("accepts a plain family match regardless of style", () => {
    expect(isSameFaceName("Inter", "Inter", "Bold")).toBe(true);
  });

  it("ignores spacing and case in the concatenation", () => {
    expect(
      isSameFaceName("helvetica neue lt geo 55 roman", "Helvetica Neue LT GEO", "55 Roman"),
    ).toBe(true);
  });

  it("survives Figma mangling a non-ASCII family name", () => {
    // Figma reports "Söhne VF" as "S?hne VF"; normalization drops every
    // non-[a-z0-9] character, so both sides land on the same key. Without
    // this, every Söhne run on stripe.com reports as a substitution.
    expect(isSameFaceName("S?hne VF Buch", "Söhne VF", "Buch")).toBe(true);
  });

  it("does not fuse two families that share a prefix", () => {
    // "Inter Display" is its own family. Answering a request for it with plain
    // Inter is exactly the substitution the marker exists to record.
    expect(isSameFaceName("Inter Display", "Inter", "Display")).toBe(true);
    expect(isSameFaceName("Inter Display", "Inter", "Regular")).toBe(false);
  });

  it("refuses a different family", () => {
    expect(isSameFaceName("Söhne VF", "Inter", "Medium")).toBe(false);
  });

  it("refuses an empty request rather than matching everything", () => {
    // A name of only non-ASCII characters normalizes to "", and so does "".
    // Equal-empty would make every CJK family answer every request.
    expect(isSameFaceName("", "Inter", "Regular")).toBe(false);
    expect(isSameFaceName("黑体", "ヒラギノ角ゴ", "W3")).toBe(false);
  });
})
