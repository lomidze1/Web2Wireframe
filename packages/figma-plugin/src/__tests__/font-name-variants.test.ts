/**
 * Family matching across the ways a font name really varies.
 *
 * The Söhne work taught the matcher to compare families normalized (lowercase,
 * letters and digits only) so Figma's own spelling of a name still resolves.
 * That is right for the four ways a name drifts in practice — a mangled
 * non-ASCII character, spacing, case, punctuation — and it must NOT collapse
 * families that are genuinely different.
 *
 * The dangerous case is a name with NO ASCII letters at all: "蘋方-簡" and
 * "ヒラギノ角ゴ" both normalize to the empty string, so a naive comparison
 * fuses every CJK family into one. stripe.com's own capture measures both
 * PingFang and Hiragino, so this is not hypothetical.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkFontsAvailability,
  partitionMissingFonts,
} from "../utils/fontUtils";
import {
  rebindOriginalFonts,
  ORIGINAL_FONT_PLUGIN_KEY,
} from "../rendering/rebindFonts";

let installedFonts: Map<string, string[]>;

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

beforeEach(() => {
  installedFonts = new Map();
  (globalThis as Record<string, unknown>).figma = {
    mixed: Symbol("mixed"),
    notify: vi.fn(),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isInstalled(font.family, font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
    }),
    listAvailableFontsAsync: vi.fn(async () =>
      Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        styles.map((style) => ({ fontName: { family, style } })),
      ),
    ),
  };
});

const oneCut = (family: string, weight = 400) =>
  new Map([[family, [{ weight, italic: false }]]]);

// ---------------------------------------------------------------------------
// Availability: the four drifts that MUST resolve
// ---------------------------------------------------------------------------

describe("checkFontsAvailability — name drifts that must resolve", () => {
  it("a mangled non-ASCII character (Söhne VF → S?hne VF)", async () => {
    installedFonts.set("S?hne VF", ["Buch"]);

    const { available, missing } = await checkFontsAvailability(
      new Set(["sohne-var"]),
      oneCut("sohne-var"),
      { "sohne-var": "Söhne VF" },
    );

    expect(available).toContain("sohne-var");
    expect(missing).toEqual([]);
  });

  it("spacing (SourceCodePro → Source Code Pro)", async () => {
    installedFonts.set("Source Code Pro", ["Regular"]);

    const { available } = await checkFontsAvailability(
      new Set(["SourceCodePro"]),
      oneCut("SourceCodePro"),
    );

    expect(available).toContain("SourceCodePro");
  });

  it("case (ROBOTO MONO → Roboto Mono)", async () => {
    installedFonts.set("Roboto Mono", ["Regular"]);

    const { available } = await checkFontsAvailability(
      new Set(["ROBOTO MONO"]),
      oneCut("ROBOTO MONO"),
    );

    expect(available).toContain("ROBOTO MONO");
  });

  it("punctuation (PT_Sans → PT Sans)", async () => {
    installedFonts.set("PT Sans", ["Regular"]);

    const { available } = await checkFontsAvailability(
      new Set(["PT_Sans"]),
      oneCut("PT_Sans"),
    );

    expect(available).toContain("PT_Sans");
  });
});

// ---------------------------------------------------------------------------
// Availability: families that must stay APART
// ---------------------------------------------------------------------------

describe("checkFontsAvailability — families that must stay distinct", () => {
  it("keeps two digit-bearing families apart (Exo vs Exo 2)", async () => {
    // Digits survive normalization, so a numbered sibling is its own family.
    installedFonts.set("Exo 2", ["Regular"]);

    const { missing } = await checkFontsAvailability(
      new Set(["Exo"]),
      oneCut("Exo"),
    );

    expect(missing).toContain("Exo");
  });

  it("icon fonts still cross their major version on purpose (FA6 ← FA5)", async () => {
    // Deliberate: the glyph sets overlap and the ZIP can only ever ship one.
    installedFonts.set("Font Awesome 5 Brands", ["Regular"]);

    const { missing } = await checkFontsAvailability(
      new Set(["Font Awesome 6 Brands"]),
      oneCut("Font Awesome 6 Brands"),
    );

    expect(missing).not.toContain("Font Awesome 6 Brands");
  });

  it("a style-suffixed family does not stand in for the base family", async () => {
    installedFonts.set("Space Grotesk Light", ["SemiBold"]);

    const { missing } = await checkFontsAvailability(
      new Set(["Space Grotesk"]),
      oneCut("Space Grotesk", 600),
    );

    expect(missing).toContain("Space Grotesk");
  });

  it("two CJK families are not the same font", async () => {
    // Both normalize to "" — the empty key must never match.
    installedFonts.set("ヒラギノ角ゴ", ["W3"]);

    const { missing, available } = await checkFontsAvailability(
      new Set(["蘋方-簡"]),
      oneCut("蘋方-簡"),
    );

    expect(missing).toContain("蘋方-簡");
    expect(available).not.toContain("蘋方-簡");
  });

  it("a CJK family with no installed fonts at all is missing", async () => {
    const { missing } = await checkFontsAvailability(
      new Set(["黑体"]),
      oneCut("黑体"),
    );

    expect(missing).toContain("黑体");
  });
});

// ---------------------------------------------------------------------------
// partitionMissingFonts (the modal-skipping auto-resolve)
// ---------------------------------------------------------------------------

describe("partitionMissingFonts — name drifts", () => {
  it("auto-resolves a real name installed under a mangled spelling", () => {
    const { autoOriginal, stillMissing } = partitionMissingFonts(
      ["sohne-var"],
      { "sohne-var": "Söhne VF" },
      new Set(["S?hne VF"]),
    );

    expect(autoOriginal).toEqual({ "sohne-var": "Söhne VF" });
    expect(stillMissing).toEqual([]);
  });

  it("does not auto-resolve one CJK family into another", () => {
    const { autoOriginal, stillMissing } = partitionMissingFonts(
      ["pingfang-css"],
      { "pingfang-css": "蘋方-簡" },
      new Set(["ヒラギノ角ゴ"]),
    );

    expect(autoOriginal).toEqual({});
    expect(stillMissing).toEqual(["pingfang-css"]);
  });
});

// ---------------------------------------------------------------------------
// Re-apply
// ---------------------------------------------------------------------------

function makeText(family: string, style: string, marker: string) {
  const data: Record<string, string> = { [ORIGINAL_FONT_PLUGIN_KEY]: marker };
  return {
    id: "t1",
    type: "TEXT" as const,
    fontName: { family, style },
    characters: "abc",
    getPluginData: (k: string) => data[k] ?? "",
    setPluginData: (k: string, v: string) => {
      if (v === "") delete data[k];
      else data[k] = v;
    },
  };
}

describe("rebindOriginalFonts — name drifts", () => {
  it("rebinds through a case difference", async () => {
    installedFonts.set("Helvetica Neue", ["Regular"]);
    installedFonts.set("Inter", ["Regular"]);
    const t = makeText("Inter", "Regular", "HELVETICA NEUE");

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(t.fontName).toEqual({ family: "Helvetica Neue", style: "Regular" });
  });

  it("rebinds through punctuation", async () => {
    installedFonts.set("PT Sans", ["Regular"]);
    installedFonts.set("Inter", ["Regular"]);
    const t = makeText("Inter", "Regular", "PT_Sans");

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(t.fontName).toEqual({ family: "PT Sans", style: "Regular" });
  });

  it("never rebinds one CJK family onto another", async () => {
    installedFonts.set("ヒラギノ角ゴ", ["W3"]);
    installedFonts.set("Inter", ["Regular"]);
    const t = makeText("Inter", "Regular", "蘋方-簡");

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toEqual(["蘋方-簡"]);
    expect(t.fontName).toEqual({ family: "Inter", style: "Regular" });
  });

  it("does rebind a CJK family onto its own exact name", async () => {
    installedFonts.set("蘋方-簡", ["Regular"]);
    installedFonts.set("Inter", ["Regular"]);
    const t = makeText("Inter", "Regular", "蘋方-簡");

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(t.fontName).toEqual({ family: "蘋方-簡", style: "Regular" });
  });
});
