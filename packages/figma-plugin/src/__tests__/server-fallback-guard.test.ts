/**
 * Server-fallback font guard.
 *
 * Server-side URL imports (Linux Chromium on Render) used to stamp rebind
 * markers with Linux system fallback families — "Liberation Sans",
 * "Noto Sans CJK JP" — that are never in the download ZIP and never
 * user-installable-by-intent. Those markers stranded the Re-apply modal
 * forever ("waiting for: Liberation Sans").
 *
 * Guard behavior:
 *  - `isServerFallbackFamily` recognizes the known Linux server families.
 *  - `countRebindableNodes` ignores them (footer badge / modal list).
 *  - `rebindOriginalFonts` self-heals: when such a family fails to load,
 *    the dead marker is cleared silently instead of reported as missing —
 *    one Re-apply click cleans documents imported before the API fix.
 *  - When the user genuinely HAS the family installed, rebind proceeds
 *    normally (the guard only fires on load failure).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isServerFallbackFamily,
  countRebindableNodes,
  rebindOriginalFonts,
  ORIGINAL_FONT_PLUGIN_KEY,
  SEGMENT_FONT_PLUGIN_KEY,
  REBOUND_DONE_PLUGIN_KEY,
} from "../rendering/rebindFonts";

// ---------------------------------------------------------------------------
// isServerFallbackFamily
// ---------------------------------------------------------------------------

describe("isServerFallbackFamily", () => {
  it.each([
    "Liberation Sans",
    "Liberation Serif",
    "Liberation Mono",
    "DejaVu Sans",
    "DejaVu Serif",
    "Noto Sans CJK JP",
    "Noto Sans CJK SC",
    "Noto Serif CJK TC",
    "Noto Color Emoji",
    "FreeSans",
    "FreeSerif",
    "FreeMono",
  ])("flags Linux server fallback family %s", (family) => {
    expect(isServerFallbackFamily(family)).toBe(true);
  });

  it.each([
    "Noto Sans", // legitimate Google web font — NOT a CJK server fallback
    "Noto Serif",
    "Inter",
    "Space Grotesk Light",
    "SF Pro Text",
    "Söhne",
    "Arial",
  ])("does NOT flag legitimate family %s", (family) => {
    expect(isServerFallbackFamily(family)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countRebindableNodes — exclusion
// ---------------------------------------------------------------------------

/** Minimal stand-in for a TextNode (mirrors rebindable-count-scope.test.ts). */
const node = (data: Record<string, string>, id = "n1", name = "Text") => ({
  id,
  name,
  getPluginData: (key: string) => data[key] ?? "",
});

describe("countRebindableNodes — server-fallback exclusion", () => {
  it("ignores nodes whose only marker family is a server fallback", () => {
    const out = countRebindableNodes([
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Liberation Sans" }),
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Noto Sans CJK JP" }),
    ]);
    expect(out.count).toBe(0);
    expect(out.families).toEqual([]);
  });

  it("still counts real families alongside excluded fallback nodes", () => {
    const out = countRebindableNodes([
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Liberation Sans" }),
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Space Grotesk Light" }),
    ]);
    expect(out.count).toBe(1);
    expect(out.families).toEqual(["Space Grotesk Light"]);
  });

  it("filters fallback families out of segment markers but keeps the node when real families remain", () => {
    const seg = JSON.stringify([
      { start: 0, end: 3, family: "Noto Sans CJK JP" },
      { start: 3, end: 6, family: "Newsreader" },
    ]);
    const out = countRebindableNodes([node({ [SEGMENT_FONT_PLUGIN_KEY]: seg })]);
    expect(out.count).toBe(1);
    expect(out.families).toEqual(["Newsreader"]);
  });

  it("drops a node whose segment markers are ALL server fallbacks", () => {
    const seg = JSON.stringify([
      { start: 0, end: 3, family: "Liberation Sans" },
      { start: 3, end: 6, family: "DejaVu Sans" },
    ]);
    const out = countRebindableNodes([node({ [SEGMENT_FONT_PLUGIN_KEY]: seg })]);
    expect(out.count).toBe(0);
    expect(out.families).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// rebindOriginalFonts — self-heal
// ---------------------------------------------------------------------------

type MockFontName = { family: string; style: string } | typeof MIXED;
const MIXED = Symbol("figma.mixed");

function makeText(
  id: string,
  family: string,
  style: string,
  pluginData: Record<string, string> = {},
) {
  const _data = { ...pluginData };
  return {
    id,
    name: "Text",
    type: "TEXT" as const,
    fontName: { family, style } as MockFontName,
    characters: "abc",
    getPluginData(key: string) {
      return _data[key] ?? "";
    },
    setPluginData(key: string, value: string) {
      if (value === "") delete _data[key];
      else _data[key] = value;
    },
    getRangeFontName: undefined as
      | ((start: number, end: number) => MockFontName)
      | undefined,
    setRangeFontName: undefined as
      | ((start: number, end: number, font: MockFontName) => void)
      | undefined,
  };
}

let unavailableFonts: Set<string>;

beforeEach(() => {
  unavailableFonts = new Set();
  (globalThis as Record<string, unknown>).figma = {
    mixed: MIXED,
    notify: vi.fn(),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (unavailableFonts.has(font.family)) {
        throw new Error(`Font "${font.family}" not installed`);
      }
    }),
    currentPage: { selection: [], findAll: vi.fn(() => []) },
  };
});

describe("rebindOriginalFonts — server-fallback self-heal", () => {
  it("clears a dead fallback marker silently (not stillMissing, not counted)", async () => {
    unavailableFonts.add("Liberation Sans");
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Liberation Sans",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toEqual([]);
    expect(result.total).toBe(0); // healed node no longer counts as pending
    // Marker gone — the modal stops advertising an un-installable family.
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
    // Not stamped as rebound — nothing was actually swapped.
    expect(t.getPluginData(REBOUND_DONE_PLUGIN_KEY)).toBe("");
  });

  it("rebinds normally when the user genuinely has the fallback family installed", async () => {
    // Liberation Sans IS loadable here → the guard must not fire.
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Liberation Sans",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect((t.fontName as { family: string }).family).toBe("Liberation Sans");
  });

  it("keeps real still-missing families intact while healing fallback ones", async () => {
    unavailableFonts.add("Noto Sans CJK JP");
    unavailableFonts.add("Söhne");
    const dead = makeText("dead", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Noto Sans CJK JP",
    });
    const real = makeText("real", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne",
    });

    const result = await rebindOriginalFonts([
      dead,
      real,
    ] as unknown as TextNode[]);

    expect(result.stillMissing).toEqual(["Söhne"]);
    expect(result.total).toBe(1); // only the real pending node
    expect(dead.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
    expect(real.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("Söhne");
  });

  it("heals dead fallback segment runs and clears markers when nothing real remains", async () => {
    unavailableFonts.add("Liberation Sans");
    const t = makeText("t1", "Inter", "Regular", {
      [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
        { start: 0, end: 5, family: "Liberation Sans" },
      ]),
    });
    t.fontName = MIXED;
    t.getRangeFontName = () => ({ family: "Inter", style: "Regular" });
    const setRangeCalls: unknown[] = [];
    t.setRangeFontName = (start, end, font) => {
      setRangeCalls.push({ start, end, font });
    };

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0); // nothing actually swapped
    expect(result.stillMissing).toEqual([]);
    expect(result.total).toBe(0);
    expect(setRangeCalls).toHaveLength(0);
    expect(t.getPluginData(SEGMENT_FONT_PLUGIN_KEY)).toBe("");
  });

  it("rebinds real segment runs while silently healing fallback ones", async () => {
    unavailableFonts.add("Noto Sans CJK JP");
    const t = makeText("t1", "Inter", "Regular", {
      [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
        { start: 0, end: 5, family: "Noto Sans CJK JP" },
        { start: 5, end: 10, family: "Newsreader" },
      ]),
    });
    t.fontName = MIXED;
    t.getRangeFontName = () => ({ family: "Inter", style: "Regular" });
    const setRangeCalls: Array<{ family: string }> = [];
    t.setRangeFontName = (_s, _e, font) => {
      setRangeCalls.push({ family: (font as { family: string }).family });
    };

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.stillMissing).toEqual([]);
    expect(setRangeCalls).toEqual([{ family: "Newsreader" }]); // only the real run
    expect(t.getPluginData(SEGMENT_FONT_PLUGIN_KEY)).toBe("");
  });
});
