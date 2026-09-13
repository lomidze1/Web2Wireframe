/**
 * Family matching must be NORMALIZED, not exact-string — the stripe.com case.
 *
 * The renderer resolves fonts through `fontIndex` (normalizeFamilyKey +
 * resolveInstalledCut). The Re-apply path never got migrated: it compared
 * family names with `Map.get` / `Set.has` on the raw string. Two real
 * spellings that a raw compare misses, both measured on a live install:
 *
 *   - Söhne VF ships its typographic family as "Söhne VF" (name ID 16), but
 *     the installed file registers with macOS/Figma as "S?hne VF" — the ö is
 *     mangled. Its cuts carry German instance names ("Buch", "Leicht", …),
 *     so the conventional Regular/Bold ladder can never name one either.
 *   - stripe.com declares `font-family: SourceCodePro`; the font installed on
 *     the machine is "Source Code Pro". Same face, different spacing.
 *
 * Both normalize to the same key ("shnevf" / "sourcecodepro"), so the index
 * finds them — and, crucially, hands back the EXACT installed family string,
 * which is what `loadFontAsync` and `node.fontName` require.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  rebindOriginalFonts,
  ORIGINAL_FONT_PLUGIN_KEY,
  SEGMENT_FONT_PLUGIN_KEY,
} from "../rendering/rebindFonts";
import { checkFontsAvailability, partitionMissingFonts } from "../utils/fontUtils";

const MIXED = Symbol("figma.mixed");

type MockFontName = { family: string; style: string } | typeof MIXED;

interface MockTextNode {
  id: string;
  type: "TEXT";
  fontName: MockFontName;
  characters: string;
  getPluginData: (key: string) => string;
  setPluginData: (key: string, value: string) => void;
  getRangeFontName?: (start: number, end: number) => MockFontName;
  setRangeFontName?: (start: number, end: number, font: MockFontName) => void;
}

function makeText(
  id: string,
  family: string,
  style: string,
  pluginData: Record<string, string> = {},
): MockTextNode {
  const _data = { ...pluginData };
  return {
    id,
    type: "TEXT",
    fontName: { family, style },
    characters: "abc",
    getPluginData: (key) => _data[key] ?? "",
    setPluginData: (key, value) => {
      if (value === "") delete _data[key];
      else _data[key] = value;
    },
  };
}

/** The Söhne VF file as Figma actually lists it after install: mangled family
 *  name, German named-instance styles. */
const SOHNE_MANGLED = "S?hne VF";
const SOHNE_STYLES = [
  "Buch",
  "Dreiviertelfett",
  "Extrafett",
  "Extraleicht",
  "Fett",
  "Halbfett",
  "Leicht",
];

let installedFonts: Map<string, string[]>;
/** Families `listAvailableFontsAsync` reports but `loadFontAsync` refuses.
 *  Real, measured behaviour: alongside the loadable "S?hne VF", Figma also
 *  lists a "Söhne VF" with Light/Regular whose every load throws
 *  `The font "Söhne VF Light" could not be loaded`. */
let unloadableFamilies: Set<string>;

/** Install the real stripe.com-era font set. */
function installStripeFonts(): void {
  installedFonts.set("Inter", ["Regular", "Medium", "Bold"]);
  installedFonts.set(SOHNE_MANGLED, [...SOHNE_STYLES]);
  installedFonts.set("Source Code Pro", ["Regular", "Medium", "Bold"]);
}

/** Add the phantom twin: listed by Figma, unloadable in practice. */
function installPhantomSohne(): void {
  installedFonts.set("Söhne VF", ["Light", "Regular"]);
  unloadableFamilies.add("Söhne VF");
}

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

function isLoadable(family: string, style: string): boolean {
  return isInstalled(family, style) && !unloadableFamilies.has(family);
}

/** Install the figma mock. `withFontList: false` models a host with no
 *  `listAvailableFontsAsync` at all, where the legacy ladder is all we have. */
function setupFigma(withFontList = true): void {
  const mock: Record<string, unknown> = {
    mixed: MIXED,
    notify: vi.fn(),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!isLoadable(font.family, font.style)) {
        throw new Error(
          `The font "${font.family} ${font.style}" could not be loaded`,
        );
      }
    }),
  };
  if (withFontList) {
    mock.listAvailableFontsAsync = vi.fn(async () =>
      Array.from(installedFonts.entries()).flatMap(([family, styles]) =>
        styles.map((style) => ({ fontName: { family, style } })),
      ),
    );
  }
  (globalThis as Record<string, unknown>).figma = mock;
}

beforeEach(() => {
  installedFonts = new Map();
  unloadableFamilies = new Set();
  setupFigma();
});

// ---------------------------------------------------------------------------
// 1-2. rebind resolves the real installed (family, style) pair
// ---------------------------------------------------------------------------

describe("rebindOriginalFonts — normalized family resolution", () => {
  it("rebinds to a family whose installed name is mangled (Söhne VF → S?hne VF)", async () => {
    installStripeFonts();
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.stillMissing).toEqual([]);
    // The EXACT installed spelling — anything else throws in real Figma.
    const applied = t.fontName as { family: string; style: string };
    expect(applied.family).toBe(SOHNE_MANGLED);
    // Weight 400 with no "Regular": "Buch" is the family's named 400 cut.
    expect(applied.style).toBe("Buch");
    expect(isInstalled(applied.family, applied.style)).toBe(true);
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
  });

  it("rebinds across a spacing difference (SourceCodePro → Source Code Pro)", async () => {
    installStripeFonts();
    const t = makeText("t1", "Inter", "Medium", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "SourceCodePro",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(t.fontName).toEqual({ family: "Source Code Pro", style: "Medium" });
  });

  it("applies the resolved family to per-segment ranges too", async () => {
    installStripeFonts();
    const setRangeCalls: Array<{ start: number; end: number; font: { family: string; style: string } }> = [];
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF",
      [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
        { start: 0, end: 3, family: "Söhne VF" },
      ]),
    });
    t.fontName = MIXED;
    t.getRangeFontName = () => ({ family: "Inter", style: "Regular" });
    t.setRangeFontName = (start, end, font) => {
      const f = font as { family: string; style: string };
      if (!isInstalled(f.family, f.style)) {
        throw new Error(`unloaded: ${f.family} ${f.style}`);
      }
      setRangeCalls.push({ start, end, font: f });
    };

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(setRangeCalls).toHaveLength(1);
    expect(setRangeCalls[0].font.family).toBe(SOHNE_MANGLED);
  });

  it("skips a listed-but-unloadable family and takes the next real candidate", async () => {
    // The measured stripe.com state: both spellings normalize to one key, but
    // only "S?hne VF" can actually be loaded. Weight 300 ("Light") is exactly
    // the request that used to pick the phantom and then give up.
    installStripeFonts();
    installPhantomSohne();
    const t = makeText("t1", "Inter", "Light", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.stillMissing).toEqual([]);
    const applied = t.fontName as { family: string; style: string };
    expect(applied.family).toBe(SOHNE_MANGLED);
    expect(isLoadable(applied.family, applied.style)).toBe(true);
  });

  it("skips the phantom for per-segment ranges too", async () => {
    installStripeFonts();
    installPhantomSohne();
    const setRangeCalls: Array<{ family: string; style: string }> = [];
    const t = makeText("t1", "Inter", "Light", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF",
      [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
        { start: 0, end: 3, family: "Söhne VF" },
      ]),
    });
    t.fontName = MIXED;
    t.getRangeFontName = () => ({ family: "Inter", style: "Light" });
    t.setRangeFontName = (_s, _e, font) => {
      const f = font as { family: string; style: string };
      if (!isLoadable(f.family, f.style)) {
        throw new Error(`unloaded: ${f.family} ${f.style}`);
      }
      setRangeCalls.push(f);
    };

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(setRangeCalls).toEqual([
      { family: SOHNE_MANGLED, style: expect.any(String) },
    ]);
  });

  it("still reports a genuinely absent family as missing", async () => {
    installStripeFonts();
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Nonexistent Face",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toEqual(["Nonexistent Face"]);
    // Marker preserved so a later install can still be re-applied.
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("Nonexistent Face");
  });

  it("falls back to the style ladder when the host exposes no font list", async () => {
    installedFonts.set("Inter", ["Regular"]);
    installedFonts.set("PSA", ["Regular"]);
    setupFigma(false);
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(t.fontName).toEqual({ family: "PSA", style: "Regular" });
  });
});

// ---------------------------------------------------------------------------
// 6-7. the two sites that decide whether the font modal opens at all
// ---------------------------------------------------------------------------

describe("checkFontsAvailability — normalized family match", () => {
  it("treats a CSS family as available when its real name is installed under a mangled spelling", async () => {
    installStripeFonts();

    const { available, missing } = await checkFontsAvailability(
      new Set(["sohne-var"]),
      new Map([["sohne-var", [{ weight: 400, italic: false }]]]),
      { "sohne-var": "Söhne VF" },
    );

    expect(available).toContain("sohne-var");
    expect(missing).toEqual([]);
  });

  it("treats a CSS family as available when only the spacing differs", async () => {
    installStripeFonts();

    const { available, missing } = await checkFontsAvailability(
      new Set(["SourceCodePro"]),
      new Map([["SourceCodePro", [{ weight: 500, italic: false }]]]),
    );

    expect(available).toContain("SourceCodePro");
    expect(missing).toEqual([]);
  });
});

describe("partitionMissingFonts — normalized family match", () => {
  it("auto-resolves a real name that is installed under a mangled spelling", () => {
    const { autoOriginal, stillMissing } = partitionMissingFonts(
      ["sohne-var"],
      { "sohne-var": "Söhne VF" },
      new Set([SOHNE_MANGLED]),
    );

    expect(autoOriginal).toEqual({ "sohne-var": "Söhne VF" });
    expect(stillMissing).toEqual([]);
  });

  it("leaves a family that is truly absent in stillMissing", () => {
    const { autoOriginal, stillMissing } = partitionMissingFonts(
      ["mystery"],
      { mystery: "Mystery Sans" },
      new Set([SOHNE_MANGLED]),
    );

    expect(autoOriginal).toEqual({});
    expect(stillMissing).toEqual(["mystery"]);
  });
});
