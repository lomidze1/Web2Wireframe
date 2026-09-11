/**
 * What the "Re-apply original fonts" modal promises must match what the
 * button does — and it must never wait on something no install can satisfy.
 *
 *   E1  `ui-sans-serif` is a CSS generic keyword. The availability check
 *       already skips the generics; the MARKER path did not, so 14 layers of
 *       one import sat in the modal forever waiting for a "font" that has no
 *       file anywhere.
 *   E2  Selecting a frame with nothing pending silently widened the counts to
 *       the whole page while the button kept acting on the selection — so the
 *       modal showed other frames' numbers and the click did nothing.
 *   C   A font the user cannot install (Söhne, Geist Variable) left the modal
 *       with no way out. A chosen substitute ends that.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isServerFallbackFamily } from "../utils/fontUtils";
import {
  buildRebindableCountPayload,
  countRebindableNodes,
  rebindOriginalFonts,
  ORIGINAL_CUT_PLUGIN_KEY,
  ORIGINAL_FONT_PLUGIN_KEY,
  SEGMENT_FONT_PLUGIN_KEY,
} from "../rendering/rebindFonts";

// ---------------------------------------------------------------------------
// E1 — generic keywords are not rebindable families
// ---------------------------------------------------------------------------

describe("CSS generic keywords never wait for an install", () => {
  it.each(["ui-sans-serif", "system-ui", "monospace", "ui-monospace", "emoji"])(
    "%s is classified as unsatisfiable",
    (generic) => {
      expect(isServerFallbackFamily(generic)).toBe(true);
    },
  );

  it("keeps a real family rebindable", () => {
    expect(isServerFallbackFamily("Söhne VF")).toBe(false);
  });

  it("drops a generic-only marker from the modal's count", () => {
    const nodes = [
      fakeNode("1", { [ORIGINAL_FONT_PLUGIN_KEY]: "ui-sans-serif" }),
      fakeNode("2", { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF" }),
    ];

    const { count, families } = countRebindableNodes(nodes);

    expect(count).toBe(1);
    expect(families).toEqual(["Söhne VF"]);
  });
});

// ---------------------------------------------------------------------------
// E2 — the numbers describe the scope the button will act on
// ---------------------------------------------------------------------------

describe("selection scope is reported honestly", () => {
  it("flags a live selection that holds nothing pending", () => {
    const page = [fakeNode("1", { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF" })];
    const selection = [fakeNode("2", {})]; // a clean frame's text

    const payload = buildRebindableCountPayload(page, selection, true);

    expect(payload.selectionActive).toBe(true);
    expect(payload.selectionCount).toBe(0);
    // Falls back to the page — and says so via selectionActive.
    expect(payload.count).toBe(payload.pageCount);
  });

  it("leaves a selection that DOES hold pending layers scoped to it", () => {
    const pending = fakeNode("1", { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF" });
    const payload = buildRebindableCountPayload(
      [pending, fakeNode("2", { [ORIGINAL_FONT_PLUGIN_KEY]: "Geist" })],
      [pending],
      true,
    );

    expect(payload.selectionCount).toBe(1);
    expect(payload.count).toBe(1);
    expect(payload.pageCount).toBe(2);
  });

  it("reports no selection when nothing is selected", () => {
    const payload = buildRebindableCountPayload(
      [fakeNode("1", { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF" })],
      [],
      false,
    );

    expect(payload.selectionActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C — a chosen substitute ends the wait
// ---------------------------------------------------------------------------

let installedFonts: Map<string, string[]>;

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

/** Minimal pluginData-only stand-in for `countRebindableNodes`. */
function fakeNode(id: string, data: Record<string, string>) {
  return {
    id,
    name: `layer-${id}`,
    getPluginData: (k: string) => data[k] ?? "",
  };
}

/** A text node the rebind can actually mutate. */
function fakeTextNode(id: string, data: Record<string, string>) {
  const store: Record<string, string> = { ...data };
  let _fontName: FontName = { family: "Inter", style: "Regular" };
  const node = {
    id,
    name: `layer-${id}`,
    type: "TEXT" as const,
    characters: "Monetize through agentic commerce",
    getPluginData: (k: string) => store[k] ?? "",
    setPluginData: (k: string, v: string) => {
      store[k] = v;
    },
    setRangeFontName: vi.fn((_s: number, _e: number, font: FontName) => {
      if (!isInstalled(font.family, font.style)) throw new Error("unloaded");
    }),
    getStyledTextSegments: () => [
      { start: 0, end: 8, fontName: { family: "Inter", style: "Regular" } },
    ],
  };
  Object.defineProperty(node, "fontName", {
    get: () => _fontName,
    set: (v: FontName) => {
      if (!isInstalled(v.family, v.style)) throw new Error("unloaded");
      _fontName = v;
    },
  });
  return node as unknown as TextNode;
}

beforeEach(() => {
  installedFonts = new Map([["Inter", ["Regular", "Bold", "Medium"]]]);
  (globalThis as Record<string, unknown>).figma = {
    loadFontAsync: vi.fn(async (font: FontName) => {
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

describe("chosen substitute font", () => {
  it("applies the user's pick to a family that can't be installed", async () => {
    const node = fakeTextNode("1", { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF" });

    const result = await rebindOriginalFonts([node], { "Söhne VF": "Inter" });

    expect(result.rebound).toBe(1);
    expect(node.fontName).toEqual({ family: "Inter", style: "Regular" });
    expect(node.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
    expect(result.stillMissing).toEqual([]);
  });

  it("applies it to per-run markers too", async () => {
    const node = fakeTextNode("2", {
      [SEGMENT_FONT_PLUGIN_KEY]: JSON.stringify([
        { start: 0, end: 8, family: "Söhne VF" },
      ]),
    });

    const result = await rebindOriginalFonts([node], { "Söhne VF": "Inter" });

    expect(result.rebound).toBe(1);
    expect(node.setRangeFontName).toHaveBeenCalledWith(
      0,
      8,
      expect.objectContaining({ family: "Inter" }),
    );
  });

  it("keeps waiting when the substitute itself won't load", async () => {
    const node = fakeTextNode("3", { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF" });

    const result = await rebindOriginalFonts([node], { "Söhne VF": "Nonexistent" });

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toContain("Söhne VF");
    expect(node.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("Söhne VF");
  });

  it("is a no-op without a choice — the original family still wins", async () => {
    installedFonts.set("Söhne VF", ["Buch"]);
    const node = fakeTextNode("4", { [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne VF" });

    const result = await rebindOriginalFonts([node]);

    expect(result.rebound).toBe(1);
    expect(node.fontName).toEqual({ family: "Söhne VF", style: "Buch" });
  });
});

/**
 * The third marker kind. A cut marker means "the family is right, the WEIGHT
 * is not" — it takes a different loop (`families.map(chosen)` × the exact
 * styles for that weight), so a substitute proven to work for the family and
 * segment markers says nothing about this path. Söhne is the live case: the
 * user cannot install it at all, so every cut-marked stripe.com layer stays
 * pending forever unless the substitution reaches here too.
 */
describe("chosen substitute on a cut marker", () => {
  const cutMarker = (families: string[], weight: number) =>
    JSON.stringify({ families, weight, italic: false });

  it("applies the pick at the weight the cut asked for", async () => {
    const node = fakeTextNode("c1", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Söhne VF"], 500),
    });

    const result = await rebindOriginalFonts([node], { "Söhne VF": "Inter" });

    expect(result.rebound).toBe(1);
    expect(node.fontName).toEqual({ family: "Inter", style: "Medium" });
    expect(node.getPluginData(ORIGINAL_CUT_PLUGIN_KEY)).toBe("");
  });

  it("tries every spelling the marker carries", async () => {
    // The marker names the real (SFNT) family first and the CSS one second,
    // because the eventual install may register under either.
    installedFonts.set("Söhne VF", ["Medium"]);
    const node = fakeTextNode("c2", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Not Installed", "Söhne VF"], 500),
    });

    const result = await rebindOriginalFonts([node]);

    expect(result.rebound).toBe(1);
    expect(node.fontName).toEqual({ family: "Söhne VF", style: "Medium" });
  });

  it("keeps the marker when neither the family nor the substitute loads", async () => {
    const node = fakeTextNode("c3", {
      [ORIGINAL_CUT_PLUGIN_KEY]: cutMarker(["Söhne VF"], 500),
    });

    const result = await rebindOriginalFonts([node], { "Söhne VF": "Nonexistent" });

    expect(result.rebound).toBe(0);
    expect(result.stillMissing).toContain("Söhne VF");
    expect(node.getPluginData(ORIGINAL_CUT_PLUGIN_KEY)).not.toBe("");
  });
});
