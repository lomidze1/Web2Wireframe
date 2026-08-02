/**
 * Re-apply for CUT-level misses.
 *
 * The family-level marker only fires when the whole family was substituted.
 * When the family is right and just the weight fell back (600 → Bold), nothing
 * was recorded — so after installing the downloaded 600 file the user had no
 * way to apply it: no footer badge, no Re-apply modal. `w2w_original_cut`
 * closes that gap.
 *
 * The rebind here is deliberately strict: only the EXACT requested cut counts.
 * A ladder that accepts Bold for a 600 marker would re-apply the very cut the
 * user is trying to replace, clear the marker, and report success.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  countRebindableNodes,
  rebindOriginalFonts,
  ORIGINAL_CUT_PLUGIN_KEY,
  ORIGINAL_FONT_PLUGIN_KEY,
  REBOUND_DONE_PLUGIN_KEY,
} from "../rendering/rebindFonts";

const MIXED = Symbol("figma.mixed");

type MockFontName = { family: string; style: string } | typeof MIXED;

function makeText(
  id: string,
  family: string,
  style: string,
  pluginData: Record<string, string> = {},
) {
  const _data = { ...pluginData };
  return {
    id,
    name: id,
    type: "TEXT" as const,
    fontName: { family, style } as MockFontName,
    characters: "abc",
    getPluginData: (key: string) => _data[key] ?? "",
    setPluginData: (key: string, value: string) => {
      if (value === "") delete _data[key];
      else _data[key] = value;
    },
  };
}

const cutMarker = (families: string[], weight: number, italic = false) =>
  JSON.stringify({ families, weight, italic });

let installedFontList: Array<{ family: string; style: string }>;

beforeEach(() => {
  installedFontList = [];

  (globalThis as Record<string, unknown>).figma = {
    mixed: MIXED,
    notify: vi.fn(),
    listAvailableFontsAsync: vi.fn(async () =>
      installedFontList.map((f) => ({ fontName: { ...f } })),
    ),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!installedFontList.some((f) => f.family === font.family && f.style === font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not available`);
      }
    }),
    currentPage: { selection: [], findAll: vi.fn(() => []) },
  };
});

describe("countRebindableNodes — cut markers", () => {
  it("counts a node carrying only a cut marker", () => {
    const t = makeText("h1", "Space Grotesk", "Bold", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Space Grotesk Light", "Space Grotesk"], 600),
    });

    const res = countRebindableNodes([t as unknown as TextNode]);

    expect(res.count).toBe(1);
    expect(res.families).toEqual(["Space Grotesk Light"]);
    expect(res.layers).toEqual([
      { id: "h1", name: "h1", families: ["Space Grotesk Light"] },
    ]);
  });

  it("doesn't double-count a node that also carries a family marker", () => {
    const t = makeText("h1", "Inter", "Bold", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Space Grotesk",
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Space Grotesk"], 600),
    });

    expect(countRebindableNodes([t as unknown as TextNode]).count).toBe(1);
  });

  it("ignores a corrupt cut marker", () => {
    const t = makeText("h1", "Space Grotesk", "Bold", {
      [ORIGINAL_CUT_PLUGIN_KEY]: "{not json",
    });

    expect(countRebindableNodes([t as unknown as TextNode]).count).toBe(0);
  });
});

describe("rebindOriginalFonts — cut markers", () => {
  it("applies the exact cut once it's installed and clears the marker", async () => {
    installedFontList = [
      { family: "Space Grotesk", style: "Regular" },
      { family: "Space Grotesk", style: "Bold" },
      { family: "Space Grotesk Light", style: "SemiBold" },
    ];
    const t = makeText("h1", "Space Grotesk", "Bold", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Space Grotesk Light", "Space Grotesk"], 600),
    });

    const res = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(res.rebound).toBe(1);
    expect(res.total).toBe(1);
    expect(t.fontName).toEqual({ family: "Space Grotesk Light", style: "SemiBold" });
    expect(t.getPluginData(ORIGINAL_CUT_PLUGIN_KEY)).toBe("");
    expect(t.getPluginData(REBOUND_DONE_PLUGIN_KEY)).toBe("Space Grotesk Light");
  });

  it("refuses a near cut — the marker survives for a later attempt", async () => {
    installedFontList = [
      { family: "Space Grotesk", style: "Regular" },
      { family: "Space Grotesk", style: "Bold" },
    ];
    const t = makeText("h1", "Space Grotesk", "Bold", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Space Grotesk"], 600),
    });

    const res = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(res.rebound).toBe(0);
    expect(res.stillMissing).toEqual(["Space Grotesk"]);
    expect(t.fontName).toEqual({ family: "Space Grotesk", style: "Bold" });
    expect(t.getPluginData(ORIGINAL_CUT_PLUGIN_KEY)).not.toBe("");
  });

  it("falls through to the second recorded family", async () => {
    installedFontList = [{ family: "Space Grotesk", style: "Semibold" }];
    const t = makeText("h1", "Space Grotesk", "Bold", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Space Grotesk Light", "Space Grotesk"], 600),
    });

    const res = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(res.rebound).toBe(1);
    expect(t.fontName).toEqual({ family: "Space Grotesk", style: "Semibold" });
  });

  it("honours the italic slant of the recorded cut", async () => {
    installedFontList = [
      { family: "Newsreader", style: "Semibold" },
      { family: "Newsreader", style: "Semibold Italic" },
    ];
    const t = makeText("em", "Newsreader", "Regular", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Newsreader"], 600, true),
    });

    await rebindOriginalFonts([t as unknown as TextNode]);

    expect(t.fontName).toEqual({ family: "Newsreader", style: "Semibold Italic" });
  });

  it("skips mixed-font nodes rather than flattening them", async () => {
    installedFontList = [{ family: "Space Grotesk", style: "Semibold" }];
    const t = makeText("h1", "Space Grotesk", "Bold", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Space Grotesk"], 600),
    });
    t.fontName = MIXED;

    const res = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(res.rebound).toBe(0);
    expect(res.skippedMixed).toBe(1);
    expect(t.getPluginData(ORIGINAL_CUT_PLUGIN_KEY)).not.toBe("");
  });
});
