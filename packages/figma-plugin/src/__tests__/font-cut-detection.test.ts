/**
 * Per-CUT font detection.
 *
 * A "cut" is one concrete file of a family: family + weight + italic
 * (SF Pro Text Semibold 600, SF Pro Text Light 300 Italic, …). Neither
 * extreme works:
 *   - family-level "missing" → one absent cut drags the whole family into
 *     the modal and ships all 18 files in the ZIP;
 *   - family-level "available" → a family with a single installed cut is
 *     declared fine even when the page needs eight of them.
 * So we track exactly which cuts the page uses and which of those don't load.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectFontUsage, checkFontsAvailability } from "../utils/fontUtils";
import type { WireframeNode } from "../types";

let installedFonts: Map<string, string[]> = new Map();

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

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "n", name: "n", type: "text", tag: "p",
    x: 0, y: 0, width: 10, height: 10,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: null, borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, textContent: "x", fontSize: 16, fontWeight: 400,
    fontFamily: "A", textAlign: "left", lineHeight: 20, letterSpacing: 0,
    isPlaceholder: false, children: [],
    ...overrides,
  };
}

const key = (c: { weight: number; italic: boolean }) => `${c.weight}${c.italic ? "i" : ""}`;

describe("collectFontUsage", () => {
  it("collects the distinct cuts each family is actually used at", () => {
    const tree = makeNode({
      fontFamily: "SF Pro Display",
      fontWeight: 600,
      children: [
        makeNode({ fontFamily: "SF Pro Display", fontWeight: 400 }),
        makeNode({ fontFamily: "SF Pro Display", fontWeight: 400 }), // dup
        makeNode({ fontFamily: "SF Pro Text", fontWeight: 300, fontStyle: "italic" }),
      ],
    });

    const usage = collectFontUsage([{ tree }]);

    expect(usage.get("SF Pro Display")!.map(key).sort()).toEqual(["400", "600"]);
    expect(usage.get("SF Pro Text")!.map(key)).toEqual(["300i"]);
  });

  it("segments contribute their own cut to their own family", () => {
    const tree = makeNode({
      fontFamily: "SF Pro Text",
      fontWeight: 400,
      styledSegments: [
        { text: "bold", color: "#000", fontWeight: 700, fontSize: 14, fontFamily: "SF Pro Text" },
        { text: "em", color: "#000", fontWeight: 400, fontSize: 14, fontFamily: "Newsreader", fontStyle: "italic" },
      ],
    });

    const usage = collectFontUsage([{ tree }]);

    expect(usage.get("SF Pro Text")!.map(key).sort()).toEqual(["400", "700"]);
    expect(usage.get("Newsreader")!.map(key)).toEqual(["400i"]);
  });

  it("ignores CSS generics and var() junk", () => {
    const tree = makeNode({ fontFamily: "sans-serif", fontWeight: 400 });
    const usage = collectFontUsage([{ tree }]);
    expect(usage.has("sans-serif")).toBe(false);
  });
});

describe("checkFontsAvailability — per-cut", () => {
  const usage = (entries: Array<[string, Array<{ weight: number; italic: boolean }>]>) =>
    new Map(entries);

  it("reports the specific missing cut, family stays available", async () => {
    installedFonts.set("SF Pro Text", ["Regular", "Semibold"]);

    const res = await checkFontsAvailability(
      new Set(["SF Pro Text"]),
      usage([["SF Pro Text", [
        { weight: 400, italic: false },
        { weight: 600, italic: false },
        { weight: 300, italic: false },
      ]]]),
    );

    // The family is installed — it must not be declared missing…
    expect(res.missing).toHaveLength(0);
    expect(res.available).toContain("SF Pro Text");
    // …but the Light cut the page needs is genuinely absent.
    expect(res.missingCuts["SF Pro Text"].map(key)).toEqual(["300"]);
  });

  it("a fully covered family reports no missing cuts", async () => {
    installedFonts.set("SF Pro Text", ["Regular", "Semibold", "Light"]);

    const res = await checkFontsAvailability(
      new Set(["SF Pro Text"]),
      usage([["SF Pro Text", [
        { weight: 400, italic: false },
        { weight: 600, italic: false },
        { weight: 300, italic: false },
      ]]]),
    );

    expect(res.missingCuts["SF Pro Text"]).toBeUndefined();
    expect(res.available).toContain("SF Pro Text");
  });

  it("a family with NO installed cut is fully missing (not per-cut)", async () => {
    const res = await checkFontsAvailability(
      new Set(["Ghost Font"]),
      usage([["Ghost Font", [{ weight: 400, italic: false }, { weight: 700, italic: false }]]]),
    );

    expect(res.missing).toEqual(["Ghost Font"]);
    expect(res.missingCuts["Ghost Font"]).toBeUndefined();
  });

  it("italic cuts are tracked separately from upright", async () => {
    installedFonts.set("Newsreader", ["Regular"]);

    const res = await checkFontsAvailability(
      new Set(["Newsreader"]),
      usage([["Newsreader", [
        { weight: 400, italic: false },
        { weight: 400, italic: true },
      ]]]),
    );

    expect(res.available).toContain("Newsreader");
    expect(res.missingCuts["Newsreader"].map(key)).toEqual(["400i"]);
  });

  it("a regular-ish non-standard cut still covers body weight (Söhne 'Buch')", async () => {
    installedFonts.set("Copyright Klim Type Foundry", ["Buch"]);

    const res = await checkFontsAvailability(
      new Set(["Copyright Klim Type Foundry"]),
      usage([["Copyright Klim Type Foundry", [{ weight: 400, italic: false }]]]),
    );

    expect(res.available).toContain("Copyright Klim Type Foundry");
    expect(res.missingCuts["Copyright Klim Type Foundry"]).toBeUndefined();
  });

  it("icon fonts stay family-level (glyphs don't care about weight)", async () => {
    installedFonts.set("SF Pro Icons", ["Regular"]);

    const res = await checkFontsAvailability(
      new Set(["SF Pro Icons"]),
      usage([["SF Pro Icons", [{ weight: 300, italic: false }, { weight: 600, italic: false }]]]),
    );

    expect(res.available).toContain("SF Pro Icons");
    expect(res.missingCuts["SF Pro Icons"]).toBeUndefined();
  });

  it("without a usage map, behaves family-level (back-compat)", async () => {
    installedFonts.set("SF Pro Text", ["Light"]);

    const res = await checkFontsAvailability(new Set(["SF Pro Text"]));

    expect(res.available).toContain("SF Pro Text");
    expect(Object.keys(res.missingCuts)).toHaveLength(0);
  });
});

/**
 * The cut a page needs can be installed under the family's REAL (SFNT) name.
 * web2wireframe.design: the downloaded Space Grotesk 600 file carries
 * typographic family "Space Grotesk Light", so Figma registers it there. The
 * page still demands "Space Grotesk" 600 — without consulting the real-name
 * map the cut reads as missing forever and the modal reopens on every import.
 */
describe("checkFontsAvailability — real-family cuts", () => {
  const usage = (entries: Array<[string, Array<{ weight: number; italic: boolean }>]>) =>
    new Map(entries);
  const realNames = { "Space Grotesk": "Space Grotesk Light" };

  it("counts a cut the real family ships as present", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);
    installedFonts.set("Space Grotesk Light", ["SemiBold"]);

    const res = await checkFontsAvailability(
      new Set(["Space Grotesk"]),
      usage([["Space Grotesk", [{ weight: 400, italic: false }, { weight: 600, italic: false }]]]),
      realNames,
    );

    expect(res.available).toContain("Space Grotesk");
    expect(res.missingCuts["Space Grotesk"]).toBeUndefined();
  });

  it("still reports the cut missing when no real name is supplied", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);
    installedFonts.set("Space Grotesk Light", ["SemiBold"]);

    const res = await checkFontsAvailability(
      new Set(["Space Grotesk"]),
      usage([["Space Grotesk", [{ weight: 600, italic: false }]]]),
    );

    expect(res.missingCuts["Space Grotesk"].map(key)).toEqual(["600"]);
  });

  it("a real name that lacks the cut doesn't mask it", async () => {
    installedFonts.set("Space Grotesk", ["Regular", "Bold"]);
    installedFonts.set("Space Grotesk Light", ["Light"]);

    const res = await checkFontsAvailability(
      new Set(["Space Grotesk"]),
      usage([["Space Grotesk", [{ weight: 600, italic: false }]]]),
      realNames,
    );

    expect(res.missingCuts["Space Grotesk"].map(key)).toEqual(["600"]);
  });
});
