/**
 * Installed-font INDEX construction (change 1).
 *
 * The old resolution path could only find a cut whose Figma style name we had
 * guessed in advance, so a family that encodes its weight in the FAMILY name
 * ("Space Grotesk SemiBold", "Roboto Condensed") was unreachable from the name
 * the page actually asks for ("Space Grotesk", "Roboto"). The index parses
 * weight/stretch/slant out of BOTH names and registers every font twice: once
 * under its literal family, once under the style-word-stripped family.
 */
import { describe, it, expect } from "vitest";
import {
  parseFontWords,
  normalizeFamilyKey,
  buildFontIndex,
  type IndexedFont,
} from "../rendering/fontIndex";

function at(
  index: Map<string, IndexedFont[]>,
  key: string,
  style: string,
): IndexedFont | undefined {
  return index.get(key)?.find((e) => e.style === style);
}

describe("normalizeFamilyKey", () => {
  it("lowercases and strips everything that is not a letter or digit", () => {
    expect(normalizeFamilyKey("Space Grotesk")).toBe("spacegrotesk");
    expect(normalizeFamilyKey("  SF Pro-Display  ")).toBe("sfprodisplay");
    expect(normalizeFamilyKey("Font Awesome 6 Brands")).toBe("fontawesome6brands");
    expect(normalizeFamilyKey("")).toBe("");
  });
});

describe("parseFontWords — weight synonyms", () => {
  const cases: Array<[string, number]> = [
    ["Thin", 100],
    ["Hairline", 100],
    ["ExtraLight", 200],
    ["Extra Light", 200],
    ["UltraLight", 200],
    ["Slim", 200],
    ["Light", 300],
    ["Book", 400],
    ["Regular", 400],
    ["Normal", 400],
    ["Buch", 400],
    ["Medium", 500],
    ["Medm", 500],
    ["Median", 500],
    ["DemiBold", 600],
    ["SemiBold", 600],
    ["Semi Bold", 600],
    ["SmBld", 600],
    ["Bold", 700],
    ["Bulky", 700],
    ["ExtraBold", 800],
    ["UltraBold", 800],
    ["Solid", 800],
    ["Black", 900],
    ["Heavy", 900],
    ["ExtraBlack", 950],
    ["UltraBlack", 950],
  ];
  for (const [name, weight] of cases) {
    it(`"${name}" → ${weight}`, () => {
      const p = parseFontWords(name);
      expect(p.weight).toBe(weight);
      expect(p.weightDefaulted).toBe(false);
    });
  }

  it("camelCase and spaced spellings parse identically", () => {
    const a = parseFontWords("SemiBold");
    const b = parseFontWords("Semi Bold");
    const c = parseFontWords("semibold");
    expect(a.weight).toBe(b.weight);
    expect(b.weight).toBe(c.weight);
    // "Semi" + "Bold" must NOT be read as a 700 Bold
    expect(a.weight).toBe(600);
  });

  it("records a defaulted parse when no weight word appears", () => {
    const p = parseFontWords("Space Grotesk");
    expect(p.weight).toBe(400);
    expect(p.weightDefaulted).toBe(true);
    expect(p.rest).toEqual(["space", "grotesk"]);
  });
});

describe("parseFontWords — stretch synonyms", () => {
  const cases: Array<[string, number]> = [
    ["UltraCondensed", 50],
    ["ExtraCondensed", 62.5],
    ["Condensed", 75],
    ["SemiCondensed", 87.5],
    ["Normal", 100],
    ["SemiExpanded", 112.5],
    ["Expanded", 125],
    ["ExtraExpanded", 150],
    ["UltraExpanded", 200],
  ];
  for (const [name, stretch] of cases) {
    it(`"${name}" → ${stretch}%`, () => {
      expect(parseFontWords(name).stretch).toBe(stretch);
    });
  }

  it("reads a weight and a stretch out of the same name", () => {
    const p = parseFontWords("Condensed Bold");
    expect(p.stretch).toBe(75);
    expect(p.weight).toBe(700);
    expect(p.rest).toEqual([]);
  });

  it("defaults stretch to 100% and flags it", () => {
    const p = parseFontWords("Bold");
    expect(p.stretch).toBe(100);
    expect(p.stretchDefaulted).toBe(true);
  });
});

describe("parseFontWords — slant", () => {
  it("detects Italic and Oblique", () => {
    expect(parseFontWords("Bold Italic").italic).toBe(true);
    expect(parseFontWords("Oblique").italic).toBe(true);
    expect(parseFontWords("Bold").italic).toBe(false);
  });

  it("keeps the weight when a slant word is present", () => {
    const p = parseFontWords("SemiBold Italic");
    expect(p.weight).toBe(600);
    expect(p.italic).toBe(true);
  });
});

describe("buildFontIndex — literal family registration", () => {
  it("indexes each installed font under its own family name", () => {
    const index = buildFontIndex([
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Bold" },
    ]);
    expect(at(index, "inter", "Regular")?.weight).toBe(400);
    expect(at(index, "inter", "Bold")?.weight).toBe(700);
  });
});

describe("buildFontIndex — family-name re-parse", () => {
  it('"Space Grotesk SemiBold"/"Regular" is findable as Space Grotesk @600', () => {
    const index = buildFontIndex([
      { family: "Space Grotesk SemiBold", style: "Regular" },
    ]);
    // Literal key keeps the style's own weight...
    expect(at(index, "spacegrotesksemibold", "Regular")?.weight).toBe(400);
    // ...and the stripped key carries the weight the FAMILY name declares.
    const derived = at(index, "spacegrotesk", "Regular");
    expect(derived?.weight).toBe(600);
    expect(derived?.family).toBe("Space Grotesk SemiBold");
    expect(derived?.style).toBe("Regular");
    expect(derived?.weightDefaulted).toBe(false);
  });

  it('"Roboto Condensed"/"Bold" is findable as Roboto @700 condensed', () => {
    const index = buildFontIndex([{ family: "Roboto Condensed", style: "Bold" }]);
    const derived = at(index, "roboto", "Bold");
    expect(derived?.weight).toBe(700);
    expect(derived?.stretch).toBe(75);
    expect(derived?.family).toBe("Roboto Condensed");
  });

  it("an explicit style weight wins over the family's weight word", () => {
    // The family says SemiBold, the cut says Bold — the cut is what rendered.
    const index = buildFontIndex([
      { family: "Space Grotesk SemiBold", style: "Bold" },
    ]);
    expect(at(index, "spacegrotesk", "Bold")?.weight).toBe(700);
  });

  it("italic is OR-ed across the two names", () => {
    const index = buildFontIndex([
      { family: "Space Grotesk SemiBold", style: "Italic" },
    ]);
    const derived = at(index, "spacegrotesk", "Italic");
    expect(derived?.weight).toBe(600);
    expect(derived?.italic).toBe(true);
  });

  it("does not register a second entry when the family has no style words", () => {
    const index = buildFontIndex([{ family: "Inter", style: "Regular" }]);
    expect(index.size).toBe(1);
  });

  it("does not collapse a family whose name is ONLY style words", () => {
    // Stripping would leave an empty key — keep the literal entry only.
    const index = buildFontIndex([{ family: "Black", style: "Regular" }]);
    expect(index.get("")).toBeUndefined();
    expect(at(index, "black", "Regular")).toBeDefined();
  });

  it("flags emoji families so they can be partitioned out of text runs", () => {
    const index = buildFontIndex([
      { family: "Apple Color Emoji", style: "Regular" },
      { family: "Inter", style: "Regular" },
    ]);
    expect(at(index, "applecoloremoji", "Regular")?.isEmoji).toBe(true);
    expect(at(index, "inter", "Regular")?.isEmoji).toBe(false);
  });

  it("survives a malformed font list without throwing", () => {
    const index = buildFontIndex([
      { family: "", style: "" },
      { family: "Inter", style: "Regular" },
    ]);
    expect(at(index, "inter", "Regular")).toBeDefined();
  });
});
