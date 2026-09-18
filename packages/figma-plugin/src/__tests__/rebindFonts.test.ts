/**
 * rebindOriginalFonts unit tests
 *
 * Covers the rebind orchestrator that runs *after* the user installs the
 * fonts they downloaded via the "Use original fonts" flow. Each text node
 * carries a `w2w_original_font` pluginData entry recording the family name
 * the user actually wants; when the family becomes loadable we swap it back.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  rebindOriginalFonts,
  collectTextNodesIn,
  ORIGINAL_FONT_PLUGIN_KEY,
  REBOUND_DONE_PLUGIN_KEY,
  SEGMENT_FONT_PLUGIN_KEY,
} from "../rendering/rebindFonts";

// ---------------------------------------------------------------------------
// Mock Figma TextNode + scene tree
// ---------------------------------------------------------------------------

type MockFontName = { family: string; style: string } | typeof MIXED;
const MIXED = Symbol("figma.mixed");

interface MockTextNode {
  id: string;
  type: "TEXT";
  fontName: MockFontName;
  characters: string;
  _pluginData: Record<string, string>;
  getPluginData: (key: string) => string;
  setPluginData: (key: string, value: string) => void;
  // Mixed-segment helpers
  getRangeFontName?: (start: number, end: number) => MockFontName;
  setRangeFontName?: (start: number, end: number, font: MockFontName) => void;
  getStyledTextSegments?: (
    fields: string[],
  ) => Array<{ start: number; end: number; fontName: MockFontName }>;
}

interface MockFrameNode {
  id: string;
  type: "FRAME";
  children: Array<MockTextNode | MockFrameNode>;
  findAll: (predicate: (n: MockTextNode | MockFrameNode) => boolean) => Array<MockTextNode | MockFrameNode>;
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
    _pluginData: _data,
    getPluginData(key: string) {
      return _data[key] ?? "";
    },
    setPluginData(key: string, value: string) {
      if (value === "") delete _data[key];
      else _data[key] = value;
    },
  };
}

function makeFrame(id: string, children: Array<MockTextNode | MockFrameNode>): MockFrameNode {
  const frame: MockFrameNode = {
    id,
    type: "FRAME",
    children,
    findAll(predicate) {
      const result: Array<MockTextNode | MockFrameNode> = [];
      const walk = (n: MockTextNode | MockFrameNode) => {
        if (predicate(n)) result.push(n);
        if (n.type === "FRAME") for (const c of n.children) walk(c);
      };
      for (const c of children) walk(c);
      return result;
    },
  };
  return frame;
}

let unavailableFonts: Set<string>;
let loadFontCalls: Array<{ family: string; style: string }>;
// (family, style) pairs the installed-font API reports. When non-empty,
// loadFontAsync also rejects styles that aren't installed for a known family —
// this models real fonts that only ship non-standard cuts (e.g. Söhne "Buch").
let installedFontList: Array<{ family: string; style: string }>;

beforeEach(() => {
  unavailableFonts = new Set();
  loadFontCalls = [];
  installedFontList = [];

  (globalThis as Record<string, unknown>).figma = {
    mixed: MIXED,
    notify: vi.fn(),
    listAvailableFontsAsync: vi.fn(async () =>
      installedFontList.map((f) => ({ fontName: { ...f } })),
    ),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      loadFontCalls.push({ family: font.family, style: font.style });
      if (unavailableFonts.has(font.family)) {
        throw new Error(`Font "${font.family}" not installed`);
      }
      // Style-aware rejection only when we've declared installed cuts for this
      // family; otherwise stay family-only (back-compat for existing tests).
      const familyCuts = installedFontList.filter((f) => f.family === font.family);
      if (
        familyCuts.length > 0 &&
        !familyCuts.some((f) => f.style === font.style)
      ) {
        throw new Error(
          `The font "${font.family} ${font.style}" could not be loaded`,
        );
      }
    }),
    currentPage: {
      selection: [],
      findAll: vi.fn((pred: (n: unknown) => boolean) => {
        // Default: empty page; tests override per-case via figma.currentPage.findAll = ...
        return [].filter(pred);
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rebindOriginalFonts", () => {
  it("rebinds a single text node when its original font becomes loadable", async () => {
    const t = makeText("t1", "Inter", "Medium", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.stillMissing).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.previouslyRebound).toBe(0);
    expect((t.fontName as { family: string }).family).toBe("PSA");
    // Marker cleared so a second pass becomes a no-op
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
    // We tried with the node's current style, "Medium"
    expect(loadFontCalls.some((c) => c.family === "PSA" && c.style === "Medium")).toBe(true);
  });

  it("rebinds a font whose only installed style is non-standard (Söhne 'Buch')", async () => {
    // Real case: Söhne installs as family "Copyright Klim Type Foundry" with the
    // single style "Buch". The node's style ("Regular") and the conventional
    // ladder never name "Buch", so the rebind must discover it from the
    // family's actual installed styles via listAvailableFontsAsync.
    const FAM = "Copyright Klim Type Foundry";
    installedFontList = [
      { family: FAM, style: "Buch" },
      { family: "Inter", style: "Regular" },
    ];
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: FAM,
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.stillMissing).toEqual([]);
    expect(t.fontName).toEqual({ family: FAM, style: "Buch" });
    // It only succeeded after falling through to the real installed style.
    expect(loadFontCalls.some((c) => c.family === FAM && c.style === "Buch")).toBe(true);
  });

  it("still reports missing when the family is not installed at all", async () => {
    // Family absent from the installed list → no real styles to fall back to →
    // stays missing (no false-positive rebind).
    installedFontList = [{ family: "Inter", style: "Regular" }];
    unavailableFonts.add("Söhne Nowhere");
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne Nowhere",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toEqual(["Söhne Nowhere"]);
  });

  it("stamps `w2w_rebound_done` after a successful rebind", async () => {
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });

    await rebindOriginalFonts([t as unknown as TextNode]);

    // Original marker cleared (idempotency contract)
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
    // New "done" marker carries the rebound family name so future passes
    // can count cumulative rebinds even after the original marker is gone.
    expect(t.getPluginData(REBOUND_DONE_PLUGIN_KEY)).toBe("PSA");
  });

  it("counts `previouslyRebound` from already-done nodes in scope", async () => {
    const done1 = makeText("done1", "PSA", "Regular", {
      [REBOUND_DONE_PLUGIN_KEY]: "PSA",
    });
    const done2 = makeText("done2", "PSA", "Bold", {
      [REBOUND_DONE_PLUGIN_KEY]: "PSA",
    });
    const fresh1 = makeText("fresh1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });
    const fresh2 = makeText("fresh2", "Inter", "Bold", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });
    const fresh3 = makeText("fresh3", "Inter", "Medium", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });

    const result = await rebindOriginalFonts(
      [done1, done2, fresh1, fresh2, fresh3] as unknown as TextNode[],
    );

    expect(result.previouslyRebound).toBe(2);
    expect(result.rebound).toBe(3);
    expect(result.total).toBe(3); // total = current-marker carriers, unchanged contract
  });

  it("second pass with all markers cleared returns rebound=0 and previouslyRebound=N", async () => {
    const nodes = [
      makeText("a", "Inter", "Regular", { [ORIGINAL_FONT_PLUGIN_KEY]: "PSA" }),
      makeText("b", "Inter", "Bold", { [ORIGINAL_FONT_PLUGIN_KEY]: "PSA" }),
      makeText("c", "Inter", "Medium", { [ORIGINAL_FONT_PLUGIN_KEY]: "PSA" }),
    ] as unknown as TextNode[];

    // First pass — rebinds all 3, stamps `w2w_rebound_done` on each.
    const first = await rebindOriginalFonts(nodes);
    expect(first.rebound).toBe(3);
    expect(first.previouslyRebound).toBe(0);

    // Second pass on the same scope — original markers gone, but
    // `w2w_rebound_done` still set, so we should report cumulative state
    // rather than the misleading "0 / 0" UX.
    const second = await rebindOriginalFonts(nodes);
    expect(second.rebound).toBe(0);
    expect(second.total).toBe(0);
    expect(second.previouslyRebound).toBe(3);
  });

  it("preserves the marker and reports stillMissing when the font still isn't installed", async () => {
    unavailableFonts.add("PSA");
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toEqual(["PSA"]);
    expect(result.total).toBe(1);
    expect(result.previouslyRebound).toBe(0);
    expect((t.fontName as { family: string }).family).toBe("Inter"); // unchanged
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("PSA"); // marker kept
    expect(t.getPluginData(REBOUND_DONE_PLUGIN_KEY)).toBe(""); // no done stamp
  });

  it("skips text nodes that have no marker", async () => {
    const t = makeText("t1", "Inter", "Regular"); // no pluginData

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toEqual([]);
    expect(result.total).toBe(0); // total counts only nodes with a marker
    expect(result.previouslyRebound).toBe(0);
    expect(loadFontCalls).toHaveLength(0); // no load attempt at all
  });

  it("falls back through common style ladder if exact style isn't installed", async () => {
    // Imagine the user installed PSA but only the Regular cut, while the node
    // currently uses style "Medium". We should still recover by trying the
    // ladder Regular/Bold/Medium/Light/Normal until something loads.
    let attemptedCount = 0;
    (globalThis as Record<string, unknown>).figma = {
      mixed: MIXED,
      notify: vi.fn(),
      loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
        attemptedCount++;
        loadFontCalls.push({ family: font.family, style: font.style });
        if (font.family === "PSA" && font.style !== "Regular") {
          throw new Error(`PSA does not have ${font.style} cut`);
        }
      }),
      currentPage: { selection: [], findAll: vi.fn(() => []) },
    };

    const t = makeText("t1", "Inter", "Medium", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.previouslyRebound).toBe(0);
    expect((t.fontName as { family: string; style: string }).style).toBe("Regular");
    expect(attemptedCount).toBeGreaterThanOrEqual(2); // tried Medium first, then Regular
  });

  it("skips mixed-fontName nodes WITHOUT overwriting their runs", async () => {
    // A mixed block can contain SEVERAL real families (e.g. paco.me: Söhne body
    // + a Newsreader-italic <em>). The node-level marker records only the
    // PRIMARY family, so blanket-applying it would destroy the Newsreader run.
    // Until per-segment original data exists, mixed nodes are left untouched.
    const setRangeCalls: unknown[] = [];
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne",
    });
    t.fontName = MIXED;
    t.setRangeFontName = (start, end, font) => {
      setRangeCalls.push({ start, end, font });
    };

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.skippedMixed).toBe(1);
    // Crucially: no run was rewritten — the Newsreader/etc. segments are safe.
    expect(setRangeCalls).toHaveLength(0);
    // Marker preserved for a future segment-aware pass.
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("Söhne");
  });

  it("rebinds ONLY the substituted runs of a mixed node (preserves others)", async () => {
    // paco.me case: a paragraph rendered as a mix of the fallback (substituted
    // Söhne runs) and a real Newsreader-italic <em>. The render stamped a
    // per-run marker for the two Söhne ranges only; the Newsreader gap (5..20)
    // must stay untouched.
    installedFontList = [
      { family: "Copyright Klim Type Foundry", style: "Buch" },
    ];
    const setRangeCalls: Array<{
      start: number;
      end: number;
      font: { family: string; style: string };
    }> = [];
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Copyright Klim Type Foundry",
      [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
        { start: 0, end: 5, family: "Copyright Klim Type Foundry" },
        { start: 20, end: 30, family: "Copyright Klim Type Foundry" },
      ]),
    });
    t.fontName = MIXED;
    t.getRangeFontName = () => ({ family: "Inter", style: "Regular" });
    t.setRangeFontName = (start, end, font) => {
      setRangeCalls.push({ start, end, font: font as { family: string; style: string } });
    };

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.skippedMixed).toBe(0);
    // Exactly the two recorded ranges were rewritten — never the Newsreader gap.
    expect(setRangeCalls.map((c) => [c.start, c.end])).toEqual([
      [0, 5],
      [20, 30],
    ]);
    expect(
      setRangeCalls.every(
        (c) =>
          c.font.family === "Copyright Klim Type Foundry" &&
          c.font.style === "Buch",
      ),
    ).toBe(true);
    // Both markers cleared on full success.
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
    expect(t.getPluginData(SEGMENT_FONT_PLUGIN_KEY)).toBe("");
  });

  it("keeps markers and reports missing when a substituted run's font still isn't installed", async () => {
    installedFontList = [{ family: "Inter", style: "Regular" }];
    unavailableFonts.add("Copyright Klim Type Foundry");
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "Copyright Klim Type Foundry",
      [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
        { start: 0, end: 5, family: "Copyright Klim Type Foundry" },
      ]),
    });
    t.fontName = MIXED;
    t.getRangeFontName = () => ({ family: "Inter", style: "Regular" });
    t.setRangeFontName = () => {};

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toEqual(["Copyright Klim Type Foundry"]);
    // Markers preserved for a later retry.
    expect(t.getPluginData(SEGMENT_FONT_PLUGIN_KEY)).not.toBe("");
  });

  it("aggregates results across many nodes", async () => {
    unavailableFonts.add("UltraRare");
    const nodes = [
      makeText("a", "Inter", "Regular", { [ORIGINAL_FONT_PLUGIN_KEY]: "PSA" }),
      makeText("b", "Inter", "Bold", { [ORIGINAL_FONT_PLUGIN_KEY]: "PSA" }),
      makeText("c", "Inter", "Regular", { [ORIGINAL_FONT_PLUGIN_KEY]: "UltraRare" }),
      makeText("d", "Inter", "Regular"), // no marker
    ];

    const result = await rebindOriginalFonts(nodes as unknown as TextNode[]);

    expect(result.rebound).toBe(2);
    expect(result.stillMissing).toEqual(["UltraRare"]); // de-duplicated
    expect(result.total).toBe(3); // d has no marker, doesn't count
    expect(result.previouslyRebound).toBe(0);
  });
});

describe("collectTextNodesIn", () => {
  it("walks frames recursively and returns only TEXT descendants", () => {
    const t1 = makeText("t1", "Inter", "Regular");
    const t2 = makeText("t2", "Inter", "Regular");
    const t3 = makeText("t3", "Inter", "Regular");
    const inner = makeFrame("inner", [t2, t3]);
    const outer = makeFrame("outer", [t1, inner]);

    const collected = collectTextNodesIn([outer as unknown as SceneNode]);

    expect(collected).toHaveLength(3);
    expect(collected.map((n) => n.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("returns the input directly when given a TEXT node", () => {
    const t = makeText("t1", "Inter", "Regular");
    const collected = collectTextNodesIn([t as unknown as SceneNode]);
    expect(collected).toHaveLength(1);
  });

  it("dedupes the same text node passed via multiple roots", () => {
    const shared = makeText("shared", "Inter", "Regular");
    const a = makeFrame("a", [shared]);
    const b = makeFrame("b", [shared]);
    const collected = collectTextNodesIn([a as unknown as SceneNode, b as unknown as SceneNode]);
    expect(collected).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed nodes WITHOUT per-run markers — Inter-range fallback
// ---------------------------------------------------------------------------

/** Mixed text node whose runs are enumerable via getStyledTextSegments. */
function makeMixedText(
  id: string,
  ranges: Array<{ start: number; end: number; family: string; style: string }>,
  pluginData: Record<string, string> = {},
): MockTextNode {
  const node = makeText(id, "Inter", "Regular", pluginData);
  node.fontName = MIXED;
  const _ranges = ranges.map((r) => ({
    start: r.start,
    end: r.end,
    fontName: { family: r.family, style: r.style } as MockFontName,
  }));
  node.getStyledTextSegments = (_fields: string[]) =>
    _ranges.map((r) => ({ ...r }));
  node.getRangeFontName = (start, end) => {
    const hit = _ranges.find((r) => r.start === start && r.end === end);
    return hit ? hit.fontName : MIXED;
  };
  node.setRangeFontName = (start, end, font) => {
    const hit = _ranges.find((r) => r.start === start && r.end === end);
    if (hit) hit.fontName = font;
  };
  return node;
}

describe("rebindOriginalFonts — mixed node, current fonts not yet loaded", () => {
  // Figma refuses to rewrite a range whose CURRENT font isn't loaded in this
  // session: "Cannot write to node with unloaded font Inter Regular". A
  // Re-apply run later in a fresh session hit exactly that on notion.com
  // ("Michael Truell,Co-founder & CEO") and reported the font still missing.
  function strictMixed(
    ranges: Array<{ start: number; end: number; family: string; style: string }>,
    marker: Record<string, string>,
  ): MockTextNode {
    const node = makeMixedText("strict", ranges, marker);
    const set = node.setRangeFontName!;
    node.setRangeFontName = (start, end, font) => {
      const cur = node.getRangeFontName!(start, end) as { family: string; style: string };
      const loaded = loadFontCalls.some((c) => c.family === cur.family && c.style === cur.style);
      if (!loaded) {
        throw new Error(`in setRangeFontName: Cannot write to node with unloaded font "${cur.family} ${cur.style}"`);
      }
      set(start, end, font);
    };
    (node as unknown as { getRangeAllFontNames: (s: number, e: number) => unknown[] }).getRangeAllFontNames = () =>
      ranges.map((r) => ({ family: r.family, style: r.style }));
    node.characters = "x".repeat(ranges[ranges.length - 1].end);
    return node;
  }

  it("inter-run fallback loads the node's current fonts before writing", async () => {
    const node = strictMixed(
      [
        { start: 0, end: 15, family: "Lyon Text Web", style: "Regular" },
        { start: 15, end: 31, family: "Inter", style: "Regular" },
      ],
      { [ORIGINAL_FONT_PLUGIN_KEY]: "Lyon Text Web" },
    );

    const result = await rebindOriginalFonts([node as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    const ranges = node.getStyledTextSegments!(["fontName"]);
    expect((ranges[1].fontName as { family: string }).family).toBe("Lyon Text Web");
  });

  it("per-run markers load the node's current fonts before writing", async () => {
    const node = strictMixed(
      [
        { start: 0, end: 15, family: "Lyon Text Web", style: "Regular" },
        { start: 15, end: 31, family: "Inter", style: "Regular" },
      ],
      { [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([{ start: 15, end: 31, family: "Lyon Text Web" }]) },
    );

    const result = await rebindOriginalFonts([node as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    const ranges = node.getStyledTextSegments!(["fontName"]);
    expect((ranges[1].fontName as { family: string }).family).toBe("Lyon Text Web");
  });
});

describe("rebindOriginalFonts — mixed node fallback (no segment markers)", () => {
  it("rebinds every Inter run to the marker family, preserving per-run style", async () => {
    installedFontList = [
      { family: "SF Pro Text", style: "Regular" },
      { family: "SF Pro Text", style: "Semibold" },
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Semi Bold" },
    ];
    const node = makeMixedText(
      "m1",
      [
        { start: 0, end: 10, family: "Inter", style: "Regular" },
        { start: 10, end: 20, family: "Inter", style: "Semi Bold" },
      ],
      { [ORIGINAL_FONT_PLUGIN_KEY]: "SF Pro Text" },
    );

    const result = await rebindOriginalFonts([node as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect(result.skippedMixed).toBe(0);
    const ranges = node.getStyledTextSegments!(["fontName"]);
    expect((ranges[0].fontName as { family: string }).family).toBe("SF Pro Text");
    expect((ranges[1].fontName as { family: string }).family).toBe("SF Pro Text");
    // "Semi Bold" (Inter spelling) must land on the "Semibold" cut, not Regular
    expect((ranges[1].fontName as { style: string }).style).toBe("Semibold");
    expect(node.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
  });

  it("leaves non-Inter runs untouched (they already show their correct font)", async () => {
    installedFontList = [
      { family: "Söhne", style: "Buch" },
      { family: "Inter", style: "Regular" },
      { family: "Newsreader", style: "Italic" },
    ];
    const node = makeMixedText(
      "m2",
      [
        { start: 0, end: 10, family: "Inter", style: "Regular" },
        { start: 10, end: 20, family: "Newsreader", style: "Italic" },
      ],
      { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne" },
    );

    const result = await rebindOriginalFonts([node as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    const ranges = node.getStyledTextSegments!(["fontName"]);
    expect((ranges[0].fontName as { family: string }).family).toBe("Söhne");
    expect((ranges[1].fontName as { family: string }).family).toBe("Newsreader");
    expect((ranges[1].fontName as { style: string }).style).toBe("Italic");
  });

  it("still skips as mixed when the runs API is unavailable", async () => {
    const node = makeText("m3", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });
    node.fontName = MIXED; // mixed, but no getStyledTextSegments

    const result = await rebindOriginalFonts([node as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.skippedMixed).toBe(1);
  });
});

describe("rebindOriginalFonts — weight-spelling preservation", () => {
  it("maps the substitute's style spelling to the family's actual cut (Semi Bold → Semibold)", async () => {
    installedFontList = [
      { family: "SF Pro Display", style: "Regular" },
      { family: "SF Pro Display", style: "Semibold" },
    ];
    const t = makeText("w1", "Inter", "Semi Bold", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "SF Pro Display",
    });

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    expect((t.fontName as { style: string }).style).toBe("Semibold");
  });
});

describe("rebindOriginalFonts — segment-marker-only nodes", () => {
  it("processes a node that has segment markers but no node-level marker", async () => {
    installedFontList = [
      { family: "SF Pro Icons", style: "Light" },
      { family: "Inter", style: "Light" },
      { family: "SF Pro Text", style: "Regular" },
    ];
    const node = makeMixedText(
      "s1",
      [
        { start: 0, end: 1, family: "Inter", style: "Light" },
        { start: 1, end: 15, family: "SF Pro Text", style: "Regular" },
      ],
      {
        [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
          { start: 0, end: 1, family: "SF Pro Icons" },
        ]),
      },
    );

    const result = await rebindOriginalFonts([node as unknown as TextNode]);

    expect(result.rebound).toBe(1);
    const ranges = node.getStyledTextSegments!(["fontName"]);
    expect((ranges[0].fontName as { family: string }).family).toBe("SF Pro Icons");
    expect((ranges[1].fontName as { family: string }).family).toBe("SF Pro Text");
    expect(node.getPluginData(SEGMENT_FONT_PLUGIN_KEY)).toBe("");
  });
});
