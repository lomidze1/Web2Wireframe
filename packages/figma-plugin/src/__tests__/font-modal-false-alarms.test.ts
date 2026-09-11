/**
 * Three false alarms that kept the font modal (and the Re-apply button) alive
 * on goodwill.ge even though every font the page uses was installed.
 *
 * Measured from a real import's log:
 *
 *   missing:     ["-apple-system"]
 *   missingCuts: { "Helvetica Neue LT GEO 55 Roman": [{ weight: 500 }] }
 *   warnings ×90: Font "…55 Roman" not available — rendered with
 *                 "Helvetica Neue LT GEO"
 *
 *   D1  `-apple-system` is a CSS system KEYWORD, not a family. No @font-face
 *       ever ships it and Figma never lists it, so demanding it opens the
 *       modal for something the user cannot install.
 *   D2  The renderer DID draw the right face — family "Helvetica Neue LT GEO",
 *       style "55 Roman", which together spell the very name the node asked
 *       for. Comparing family-to-family calls that a substitution, stamps a
 *       marker, and reports the layer as "still showing Inter" when it never
 *       was.
 *   D3  The site declares a `font-weight: 500` face whose FILE installs as
 *       "75 Bold". No exact 500 cut can ever exist, so the family stayed
 *       permanently "partial" — offering a download of files already on disk.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildFontFaceStyles,
  checkFontsAvailability,
  isServerFallbackFamily,
} from "../utils/fontUtils";
import { createTextNode } from "../rendering/text";
import { ORIGINAL_FONT_PLUGIN_KEY } from "../rendering/rebindFonts";
import type { WireframeNode, RenderContext } from "../types";

/** The measured (CDP) name goodwill.ge's text nodes carry. */
const MEASURED = "Helvetica Neue LT GEO 55 Roman";
const REAL_FAMILY = "Helvetica Neue LT GEO";

let installedFonts: Map<string, string[]>;
let pluginData: Map<string, string>;
let rangeFontCalls: Array<{ start: number; end: number; font: { family: string; style: string } }> = [];

function isInstalled(family: string, style: string): boolean {
  const styles = installedFonts.get(family);
  return !!styles && styles.includes(style);
}

function createMockTextNode() {
  let _fontName: { family: string; style: string } = { family: "Inter", style: "Regular" };
  const node: Record<string, unknown> = {
    characters: "",
    fontSize: 14,
    fills: [],
    textAutoResize: "NONE",
    width: 100,
    height: 20,
    resize(w: number, h: number) { node.width = w; node.height = h; },
    textAlignHorizontal: "LEFT",
    lineHeight: { unit: "AUTO" },
    letterSpacing: { value: 0, unit: "PIXELS" },
    textDecoration: "NONE",
    fillStyleId: "",
    textStyleId: "",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn((start: number, end: number, font: { family: string; style: string }) => {
      rangeFontCalls.push({ start, end, font });
    }),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
    setPluginData: vi.fn((k: string, v: string) => { pluginData.set(k, v); }),
    getPluginData: vi.fn((k: string) => pluginData.get(k) || ""),
  };
  Object.defineProperty(node, "fontName", {
    get: () => _fontName,
    set: (v: { family: string; style: string }) => {
      if (!isInstalled(v.family, v.style)) throw new Error(`unloaded: ${v.family} ${v.style}`);
      _fontName = v;
    },
  });
  return node;
}

beforeEach(() => {
  installedFonts = new Map([["Inter", ["Regular", "Bold", "Medium", "Light"]]]);
  pluginData = new Map();
  rangeFontCalls = [];

  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => createMockTextNode()),
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

// ---------------------------------------------------------------------------
// D1 — CSS system keywords are not installable families
// ---------------------------------------------------------------------------

describe("system-keyword families never reach the modal", () => {
  it.each(["-apple-system", "BlinkMacSystemFont"])(
    "%s is classified as unsatisfiable",
    (keyword) => {
      expect(isServerFallbackFamily(keyword)).toBe(true);
    },
  );

  it("keeps a real family classified as satisfiable", () => {
    expect(isServerFallbackFamily(REAL_FAMILY)).toBe(false);
  });

  it("is skipped by the availability check instead of reported missing", async () => {
    const result = await checkFontsAvailability(
      new Set(["-apple-system"]),
      new Map([["-apple-system", [{ weight: 400, italic: false }]]]),
    );

    expect(result.missing).toEqual([]);
    expect(result.missingCuts).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// D3 — a declared cut whose FILE is already installed is not missing
// ---------------------------------------------------------------------------

describe("declared cuts already covered by installed files", () => {
  const FACES = [
    { fontFamily: "HelveticaNeue", fontWeight: "300", realFamily: REAL_FAMILY, realSubfamily: "45 Light" },
    { fontFamily: "HelveticaNeue", fontWeight: "400", realFamily: REAL_FAMILY, realSubfamily: "55 Roman" },
    { fontFamily: "HelveticaNeue", fontWeight: "500", realFamily: REAL_FAMILY, realSubfamily: "75 Bold" },
  ];

  it("maps every name a face answers to onto the styles it installs as", () => {
    const styles = buildFontFaceStyles(FACES);

    expect(styles["HelveticaNeue"]).toEqual(["45 Light", "55 Roman", "75 Bold"]);
    expect(styles[REAL_FAMILY]).toEqual(["45 Light", "55 Roman", "75 Bold"]);
    expect(styles[MEASURED]).toEqual(["45 Light", "55 Roman", "75 Bold"]);
  });

  it("reports no missing cut when the family's every file is installed", async () => {
    installedFonts.set(REAL_FAMILY, ["45 Light", "55 Roman", "75 Bold"]);

    const result = await checkFontsAvailability(
      new Set([MEASURED]),
      // The 500 the page asks for: no 500 cut exists, the file is the Bold one.
      new Map([[MEASURED, [{ weight: 400, italic: false }, { weight: 500, italic: false }]]]),
      { [MEASURED]: REAL_FAMILY },
      undefined,
      buildFontFaceStyles(FACES),
    );

    expect(result.missing).toEqual([]);
    expect(result.missingCuts).toEqual({});
  });

  it("still reports the cut when one of the files is NOT installed", async () => {
    // Only two of the three cuts installed — the ZIP has something to give.
    installedFonts.set(REAL_FAMILY, ["45 Light", "55 Roman"]);

    const result = await checkFontsAvailability(
      new Set([MEASURED]),
      new Map([[MEASURED, [{ weight: 500, italic: false }]]]),
      { [MEASURED]: REAL_FAMILY },
      undefined,
      buildFontFaceStyles(FACES),
    );

    expect(result.missingCuts[MEASURED]).toEqual([{ weight: 500, italic: false }]);
  });
});

// ---------------------------------------------------------------------------
// D2 — drawing "family + style" for a request spelling "family style" is a hit
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "t", name: "t", type: "text", tag: "p",
    x: 0, y: 0, width: 200, height: 24,
    layoutMode: "NONE", itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null, backgroundGradient: null,
    textColor: "#333", borderColor: null, borderWidth: 0, borderRadius: 0,
    opacity: 1, textContent: "გუდვილი", fontSize: 16, fontWeight: 400,
    fontFamily: "Inter", textAlign: "left", lineHeight: 24, letterSpacing: 0,
    isPlaceholder: false, children: [], browserLineCount: 1,
    ...overrides,
  };
}

function makeContext(overrides: Partial<RenderContext>): RenderContext {
  return {
    pluginColors: {
      main: "#1f3a5f", text: "#333333", accent: "#3b82f6",
      surface: "#f5f5f5", border: "#e0e0e0", background: "#ffffff",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    ...overrides,
  };
}

describe("full-name request satisfied by family + style", () => {
  it("stamps no Re-apply marker — the node already shows what it asked for", async () => {
    installedFonts.set(REAL_FAMILY, ["45 Light", "55 Roman", "75 Bold"]);

    const node = makeNode({ fontFamily: MEASURED, fontWeight: 400 });
    const text = await createTextNode(node, "Inter", makeContext({}));

    expect(text!.fontName).toEqual({ family: REAL_FAMILY, style: "55 Roman" });
    expect(text!.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
  });

  it("still marks a genuine substitution", async () => {
    // Nothing of the family installed: the node really does fall to Inter.
    const node = makeNode({ fontFamily: MEASURED, fontWeight: 400 });
    const text = await createTextNode(node, "Inter", makeContext({}));

    expect(text!.fontName.family).toBe("Inter");
    expect(text!.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe(MEASURED);
  });
});

// ---------------------------------------------------------------------------
// D4 — the same rule for inline RUNS (stripe.com's Söhne)
// ---------------------------------------------------------------------------

describe("segment markers compare faces, not raw strings", () => {
  it("leaves a run alone when Figma drew it under its own spelling", async () => {
    // Figma mangles the ö: the loadable family is "S?hne VF", the page (and
    // the font's own name table) says "Söhne VF". Drawing one for the other is
    // a hit — a raw !== called it a substitution and put 57 stripe.com runs in
    // the Re-apply modal while they showed the right font all along.
    installedFonts.set("S?hne VF", ["Buch", "Kräftig"]);

    const node = makeNode({
      fontFamily: "Söhne VF",
      textContent: "Monetize through agentic commerce",
      styledSegments: [
        { text: "Monetize ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Söhne VF" },
        { text: "through", color: "#000", fontWeight: 400, fontSize: 16, fontFamily: "Söhne VF" },
      ],
    } as Partial<WireframeNode>);

    const text = await createTextNode(node, "Inter", makeContext({}));

    // Every run drew the same face the node did — not Inter.
    expect(rangeFontCalls.map((c) => c.font)).toEqual([
      { family: "S?hne VF", style: "Buch" },
      { family: "S?hne VF", style: "Buch" },
    ]);
    expect(text!.getPluginData("w2w_original_font_segments")).toBe("");
  });

  it("still marks a run that really fell back to Inter", async () => {
    const node = makeNode({
      fontFamily: "Söhne VF",
      textContent: "Monetize through",
      styledSegments: [
        { text: "Monetize ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "Söhne VF" },
        { text: "through", color: "#000", fontWeight: 400, fontSize: 16, fontFamily: "Söhne VF" },
      ],
    } as Partial<WireframeNode>);

    const text = await createTextNode(node, "Inter", makeContext({}));

    expect(text!.getPluginData("w2w_original_font_segments")).toContain("Söhne VF");
  });

  it("routes a run through the REAL family via the index too", async () => {
    // stripe.com declares `sohne-var`; the file's name table says "Söhne VF"
    // and Figma loads it as "S?hne VF" / "Buch". The run has to cross both
    // gaps — CSS name → real name → Figma's own spelling — and the real-name
    // step was still using the plain style ladder, so 9 runs kept falling to
    // Inter after the index-first fix.
    installedFonts.set("S?hne VF", ["Buch", "Kräftig"]);

    const node = makeNode({
      fontFamily: "sohne-var",
      textContent: "Monetize through",
      styledSegments: [
        { text: "Monetize ", color: "#333", fontWeight: 400, fontSize: 16, fontFamily: "sohne-var" },
        { text: "through", color: "#000", fontWeight: 400, fontSize: 16, fontFamily: "sohne-var" },
      ],
    } as Partial<WireframeNode>);

    const text = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { "sohne-var": "Söhne VF" },
    }));

    expect(rangeFontCalls.map((c) => c.font.family)).toEqual(["S?hne VF", "S?hne VF"]);
    expect(text!.getPluginData("w2w_original_font_segments")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// D5 — the same face rule now gates the CUT marker
// ---------------------------------------------------------------------------

describe("cut marker on a full-name family", () => {
  it("draws the family's own file for a full-name request at a near weight", () => {
    // `familyIsRight` in the cut-marker gate switched from family-to-family to
    // face comparison, so a full-name request now REACHES that gate for the
    // first time. Pin the draw itself: whatever the marker policy, the node
    // must still show the page's own font, not Inter.
    installedFonts.set(REAL_FAMILY, ["45 Light", "55 Roman", "75 Bold"]);

    const node = makeNode({ fontFamily: MEASURED, fontWeight: 500 });
    return createTextNode(node, "Inter", makeContext({
      fontRealNames: { [MEASURED]: REAL_FAMILY },
    } as never)).then((text) => {
      expect(text!.fontName).toEqual({ family: REAL_FAMILY, style: "55 Roman" });
      expect(text!.getPluginData(ORIGINAL_FONT_PLUGIN_KEY)).toBe("");
    });
  });

  it("stamps no cut marker when the page declares no such cut", async () => {
    // telex.ge fakes bold from a single 400 file: no @font-face at that weight
    // exists, so a Re-apply would have nothing to apply.
    installedFonts.set(REAL_FAMILY, ["45 Light", "55 Roman", "75 Bold"]);

    const node = makeNode({ fontFamily: MEASURED, fontWeight: 500 });
    const text = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { [MEASURED]: REAL_FAMILY },
    } as never));

    expect(text!.getPluginData("w2w_original_cut")).toBe("");
  });

  it("carries both spellings when it does stamp one", async () => {
    // The install may register under either name, so the marker names both —
    // real (SFNT) first.
    installedFonts.set(REAL_FAMILY, ["45 Light", "55 Roman", "75 Bold"]);

    const node = makeNode({ fontFamily: MEASURED, fontWeight: 500 });
    const text = await createTextNode(node, "Inter", makeContext({
      fontRealNames: { [MEASURED]: REAL_FAMILY },
      fontDeclaredCuts: { [MEASURED]: [{ weight: 500, italic: false }] },
    } as never));

    const cut = JSON.parse(text!.getPluginData("w2w_original_cut") || "{}");
    expect(cut.families).toEqual([REAL_FAMILY, MEASURED]);
    expect(cut.weight).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// D6 — one CSS name, two real families: the styles must UNION, not overwrite
// ---------------------------------------------------------------------------

/**
 * `buildFontFaceStyles` groups faces by REAL family, then writes each group's
 * styles under every name that group answers to. But one CSS family name can
 * belong to several groups — the ordinary Linotype/Google shape where
 * `font-family: Foo` is served by "Foo Text" for body weights and "Foo
 * Display" for headings.
 *
 * `map[name] = styles.get(real)` let the last group win and dropped the other
 * one's styles. `allFaceFilesInstalled` then compared against half the list,
 * decided nothing was left to install, and SUPPRESSED a genuinely missing cut
 * — the exact inverse of what this map exists to do. The user is told every
 * file is on disk while one really is missing, and the download that would
 * fix it is never offered.
 */
describe("one CSS family served by two real families", () => {
  const SPLIT_FACES = [
    { fontFamily: "Foo", fontWeight: "400", realFamily: "Foo Text", realSubfamily: "Regular" },
    { fontFamily: "Foo", fontWeight: "700", realFamily: "Foo Display", realSubfamily: "Bold" },
  ];

  it("keeps both families' styles under the shared CSS name", () => {
    const styles = buildFontFaceStyles(SPLIT_FACES);

    expect(styles["Foo"].sort()).toEqual(["Bold", "Regular"]);
  });

  it("still gives each real family only its own styles", () => {
    // The union is for the SHARED alias. "Foo Text" installs one file and must
    // not be reported as owing "Foo Display"'s.
    const styles = buildFontFaceStyles(SPLIT_FACES);

    expect(styles["Foo Text"]).toEqual(["Regular"]);
    expect(styles["Foo Display"]).toEqual(["Bold"]);
  });

  it("still reports the missing cut when only one of the two is installed", () => {
    // The consequence that makes it a bug and not a curiosity.
    installedFonts.set("Foo Display", ["Bold"]);

    return checkFontsAvailability(
      new Set(["Foo"]),
      new Map([["Foo", [{ weight: 400, italic: false }]]]),
      { Foo: "Foo Display" },
      undefined,
      buildFontFaceStyles(SPLIT_FACES),
    ).then((result) => {
      expect(result.missingCuts["Foo"]).toBeTruthy();
    });
  });

  it("stays conservative when it can only see one of the two families", async () => {
    // `fontRealNames` is 1:1 — it can name only ONE real family per CSS name —
    // so "Foo Text"'s file is invisible to the check even when installed. The
    // deliberate trade: an extra download offer the user may not need is
    // cheaper than telling them everything is on disk while a file is missing
    // and leaving them no way to fix it.
    installedFonts.set("Foo Display", ["Bold"]);
    installedFonts.set("Foo Text", ["Regular"]);

    const result = await checkFontsAvailability(
      new Set(["Foo"]),
      new Map([["Foo", [{ weight: 400, italic: false }]]]),
      { Foo: "Foo Display" },
      undefined,
      buildFontFaceStyles(SPLIT_FACES),
    );

    expect(result.missingCuts["Foo"]).toBeTruthy();
  });

  it("says nothing when the one family it knows covers every style", async () => {
    // The single-family case — by far the common one, and goodwill.ge's — is
    // untouched by the union: one group, one alias set, nothing to merge.
    installedFonts.set(REAL_FAMILY, ["45 Light", "55 Roman", "75 Bold"]);

    const result = await checkFontsAvailability(
      new Set([MEASURED]),
      new Map([[MEASURED, [{ weight: 500, italic: false }]]]),
      { [MEASURED]: REAL_FAMILY },
      undefined,
      buildFontFaceStyles([
        { fontFamily: "HelveticaNeue", fontWeight: "300", realFamily: REAL_FAMILY, realSubfamily: "45 Light" },
        { fontFamily: "HelveticaNeue", fontWeight: "400", realFamily: REAL_FAMILY, realSubfamily: "55 Roman" },
        { fontFamily: "HelveticaNeue", fontWeight: "500", realFamily: REAL_FAMILY, realSubfamily: "75 Bold" },
      ]),
    );

    expect(result.missingCuts).toEqual({});
  });
});

