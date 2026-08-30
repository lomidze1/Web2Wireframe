/**
 * A variable font ships ONE file — never demand its weights as separate cuts.
 *
 * stripe.com declares `@font-face { font-family: sohne-var; font-weight: 1 1000 }`
 * and uses 300 / 400 / 500. Figma exposes that single file as named instances
 * ("Buch", "Leicht", …), so a per-weight probe finds no "Light" or "Medium"
 * and reports the 300 and 500 cuts missing. The download modal then offers the
 * very file already installed — re-downloading it can never satisfy the demand,
 * so the modal reopened on every single import.
 *
 * Same failure shape the weight-aware rule already caused on apple.com (see the
 * header of font-availability-weights.test.ts); this closes the variable-font
 * case the earlier revert didn't cover.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkFontsAvailability,
  buildVariableFontFamilies,
} from "../utils/fontUtils";

let installedFonts: Map<string, string[]>;

beforeEach(() => {
  installedFonts = new Map();

  (globalThis as Record<string, unknown>).figma = {
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      const styles = installedFonts.get(font.family);
      if (!styles || !styles.includes(font.style)) {
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

/** stripe.com's single variable face. */
const SOHNE_FACE = [
  { fontFamily: "sohne-var", fontWeight: "1 1000", fontStyle: "normal" },
];

/** A family shipped as discrete files — the non-variable control. */
const DISCRETE_FACES = [
  { fontFamily: "BPG Nino", fontWeight: "400", fontStyle: "normal" },
  { fontFamily: "BPG Nino", fontWeight: "700", fontStyle: "normal" },
];

describe("buildVariableFontFamilies", () => {
  it("marks a family whose face declares a weight range", () => {
    expect(buildVariableFontFamilies(SOHNE_FACE).has("sohne-var")).toBe(true);
  });

  it("does not mark a family shipped as discrete weights", () => {
    expect(buildVariableFontFamilies(DISCRETE_FACES).has("BPG Nino")).toBe(false);
  });

  it("tolerates missing metadata", () => {
    expect(buildVariableFontFamilies(undefined).size).toBe(0);
  });
});

describe("checkFontsAvailability — variable families", () => {
  it("demands no per-weight cuts once the variable family is installed", async () => {
    // Figma lists the VF under its mangled real name with German instances.
    installedFonts.set("S?hne VF", ["Buch", "Leicht", "Halbfett"]);

    const { available, missing, missingCuts } = await checkFontsAvailability(
      new Set(["sohne-var"]),
      new Map([
        [
          "sohne-var",
          [
            { weight: 400, italic: false },
            { weight: 300, italic: false },
            { weight: 500, italic: false },
          ],
        ],
      ]),
      { "sohne-var": "Söhne VF" },
      buildVariableFontFamilies(SOHNE_FACE),
    );

    expect(available).toContain("sohne-var");
    expect(missing).toEqual([]);
    // The whole point: nothing to download, so no modal.
    expect(missingCuts).toEqual({});
  });

  it("still reports the family missing when nothing of it is installed", async () => {
    const { missing } = await checkFontsAvailability(
      new Set(["sohne-var"]),
      new Map([["sohne-var", [{ weight: 400, italic: false }]]]),
      {},
      buildVariableFontFamilies(SOHNE_FACE),
    );

    expect(missing).toContain("sohne-var");
  });

  it("finds a cut on a family installed under a differently-spaced name", async () => {
    // stripe.com asks for "SourceCodePro" at weight 500; the machine has
    // "Source Code Pro" with a Medium. Probing the exact spelling misses it and
    // offers a download for a font already present.
    installedFonts.set("Source Code Pro", ["Regular", "Medium", "Bold"]);

    const { available, missingCuts } = await checkFontsAvailability(
      new Set(["SourceCodePro"]),
      new Map([["SourceCodePro", [{ weight: 500, italic: false }]]]),
    );

    expect(available).toContain("SourceCodePro");
    expect(missingCuts).toEqual({});
  });

  it("keeps demanding a genuinely absent cut on a non-variable family", async () => {
    // telex.ge's regression: one 400 file installed, the page fakes bold.
    installedFonts.set("BPG Nino", ["Regular"]);

    const { missingCuts } = await checkFontsAvailability(
      new Set(["BPG Nino"]),
      new Map([
        [
          "BPG Nino",
          [
            { weight: 400, italic: false },
            { weight: 700, italic: false },
          ],
        ],
      ]),
      {},
      buildVariableFontFamilies(DISCRETE_FACES),
    );

    expect(missingCuts["BPG Nino"]).toEqual([{ weight: 700, italic: false }]);
  });
});
