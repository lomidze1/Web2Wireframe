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

beforeEach(() => {
  unavailableFonts = new Set();
  loadFontCalls = [];

  (globalThis as Record<string, unknown>).figma = {
    mixed: MIXED,
    notify: vi.fn(),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      loadFontCalls.push({ family: font.family, style: font.style });
      if (unavailableFonts.has(font.family)) {
        throw new Error(`Font "${font.family}" not installed`);
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

  it("counts and skips mixed-fontName text nodes (MVP: documented limitation)", async () => {
    const t = makeText("t1", "Inter", "Regular", {
      [ORIGINAL_FONT_PLUGIN_KEY]: "PSA",
    });
    t.fontName = MIXED;

    const result = await rebindOriginalFonts([t as unknown as TextNode]);

    expect(result.rebound).toBe(0);
    expect(result.skippedMixed).toBe(1);
    expect(result.previouslyRebound).toBe(0);
    expect(loadFontCalls).toHaveLength(0); // nothing attempted
    // Marker preserved so future single-style re-render can pick it up
    expect(t.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("PSA");
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
