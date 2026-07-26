/**
 * Font-demand hygiene: neither a Linux server fallback nor a websafe system
 * family may drive the "install these fonts" modal / download ZIP.
 *
 * web2wireframe.design regression (server-side URL import):
 *   missing:     ["Liberation Sans"]          ← Linux platform font leaked in
 *   missingCuts: { Arial: [600], ... }        ← Arial has no Semibold cut
 *
 * "Liberation Sans" has no @font-face anywhere on the page, so
 * `buildFontDownloads` could never account for it — its all-or-nothing
 * safety net then re-bundled EVERY extracted font (Inter included) on every
 * import. And Arial's absent 600 cut is unshippable by definition: a websafe
 * system family ships no web font files, and browsers synthesize the weight.
 *
 * Both must be excluded from the demand analysis so only real, installable
 * web fonts (here: Space Grotesk 600/800) reach the modal.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkFontsAvailability,
  isWebsafeSystemFont,
  type FontCut,
} from "../utils/fontUtils";
import { convertW2WToWireframe } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// isWebsafeSystemFont
// ---------------------------------------------------------------------------

describe("isWebsafeSystemFont", () => {
  it.each([
    "Arial",
    "Helvetica",
    "Helvetica Neue",
    "Times New Roman",
    "Times",
    "Georgia",
    "Courier New",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
  ])("flags websafe system family %s", (family) => {
    expect(isWebsafeSystemFont(family)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isWebsafeSystemFont("arial")).toBe(true);
    expect(isWebsafeSystemFont("TIMES NEW ROMAN")).toBe(true);
  });

  it.each(["Space Grotesk", "Inter", "SF Pro Text", "Söhne", "Newsreader"])(
    "does NOT flag real web font %s",
    (family) => {
      expect(isWebsafeSystemFont(family)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// checkFontsAvailability — exclusion from missing / missingCuts
// ---------------------------------------------------------------------------

/** Figma stub: only the (family, style) pairs in `installed` load. */
function stubFigma(installed: Array<{ family: string; style: string }>) {
  (globalThis as Record<string, unknown>).figma = {
    listAvailableFontsAsync: vi.fn(async () =>
      installed.map((f) => ({ fontName: { ...f } })),
    ),
    loadFontAsync: vi.fn(async (font: { family: string; style: string }) => {
      if (!installed.some((f) => f.family === font.family && f.style === font.style)) {
        throw new Error(`Font "${font.family} ${font.style}" not installed`);
      }
    }),
  };
}

const cuts = (...weights: number[]): FontCut[] =>
  weights.map((weight) => ({ weight, italic: false }));

beforeEach(() => {
  stubFigma([]);
});

describe("checkFontsAvailability — server fallback + websafe exclusion", () => {
  it("never reports a Linux server fallback family as missing", async () => {
    stubFigma([{ family: "Inter", style: "Regular" }]);
    const usage = new Map([["Liberation Sans", cuts(600)]]);

    const out = await checkFontsAvailability(new Set(["Liberation Sans"]), usage);

    expect(out.missing).toEqual([]);
    expect(out.missingCuts).toEqual({});
  });

  it("never records missing cuts for a websafe system family", async () => {
    // Arial is installed at Regular but has no Semibold cut — unshippable,
    // and the browser synthesizes the weight anyway.
    stubFigma([{ family: "Arial", style: "Regular" }]);
    const usage = new Map([["Arial", cuts(400, 600)]]);

    const out = await checkFontsAvailability(new Set(["Arial"]), usage);

    expect(out.missingCuts).toEqual({});
    expect(out.missing).toEqual([]);
  });

  it("does not report a websafe family as missing even when nothing loads", async () => {
    stubFigma([]); // no Arial at all
    const usage = new Map([["Arial", cuts(400)]]);

    const out = await checkFontsAvailability(new Set(["Arial"]), usage);

    expect(out.missing).toEqual([]);
  });

  it("still records absent cuts for a genuine web font (regression guard)", async () => {
    // Space Grotesk 400/700 installed, 600/800 not — the real, installable
    // demand that SHOULD still reach the modal.
    stubFigma([
      { family: "Space Grotesk", style: "Regular" },
      { family: "Space Grotesk", style: "Bold" },
    ]);
    const usage = new Map([["Space Grotesk", cuts(400, 700, 600, 800)]]);

    const out = await checkFontsAvailability(new Set(["Space Grotesk"]), usage);

    expect(out.missing).toEqual([]);
    expect(out.missingCuts["Space Grotesk"]?.map((c) => c.weight).sort()).toEqual([600, 800]);
  });

  it("keeps a genuinely missing web font in `missing`", async () => {
    stubFigma([{ family: "Inter", style: "Regular" }]);
    const usage = new Map([["Söhne", cuts(400)]]);

    const out = await checkFontsAvailability(new Set(["Söhne"]), usage);

    expect(out.missing).toEqual(["Söhne"]);
  });

  it("mirrors the web2wireframe.design import: only the real web font survives", async () => {
    stubFigma([
      { family: "Space Grotesk", style: "Regular" },
      { family: "Space Grotesk", style: "Bold" },
      { family: "Arial", style: "Regular" },
      { family: "Times New Roman", style: "Regular" },
    ]);
    const usage = new Map([
      ["Times New Roman", cuts(400)],
      ["Space Grotesk", cuts(400, 700, 600, 800)],
      ["Arial", cuts(600, 400)],
      ["Liberation Sans", cuts(600)],
    ]);

    const out = await checkFontsAvailability(
      new Set(["Times New Roman", "Space Grotesk", "Arial", "Liberation Sans"]),
      usage,
    );

    // Liberation Sans gone (server fallback), Arial gone (websafe).
    expect(out.missing).toEqual([]);
    expect(Object.keys(out.missingCuts)).toEqual(["Space Grotesk"]);
  });
});

// ---------------------------------------------------------------------------
// css-converter — platform family must not override the CSS family when it's
// a server fallback (this is how "Liberation Sans" entered the demand set).
// ---------------------------------------------------------------------------

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 100,
    quad: [0, 0, 400, 0, 400, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: "body", width: 1280, height: 800, styles: { height: "100%" }, children });
  return makeFrame({
    tag: "html", width: 1280, height: 800,
    styles: { height: "100%" },
    children: [body],
    isScrollingElt: true,
  });
}

function findNode(
  node: unknown,
  pred: (n: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (pred(obj)) return obj;
  for (const c of ((obj.children as unknown[]) ?? [])) {
    const hit = findNode(c, pred);
    if (hit) return hit;
  }
  return null;
}

/** Text run carrying its own tag so the converter builds styledSegments —
 *  the path that consumes `platformFont.familyName`. */
function run(
  value: string,
  font: string,
  platformFamily: string,
  tag = "span",
): Record<string, unknown> {
  return {
    type: "TEXT", x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
    value, font, tag,
    platformFont: { familyName: platformFamily, postScriptName: platformFamily.replace(/\s+/g, "") },
  };
}

describe("css-converter — server fallback platform font is ignored", () => {
  it("keeps the CSS family on styled segments when the platform font is a server fallback", () => {
    const p = makeFrame({
      tag: "p",
      styles: { display: "block", fontFamily: "Arial, sans-serif" },
      children: [
        run("Hello ", "Arial", "Liberation Sans"),
        run("there", "Arial", "Liberation Sans", "strong"),
      ],
    });

    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    const node = findNode(root, (n) => Array.isArray(n.styledSegments));

    expect(node).not.toBeNull();
    const segFamilies = (node!.styledSegments as Array<{ fontFamily?: string }>).map(
      (s) => s.fontFamily,
    );
    // The Linux fallback must never surface as a demanded family.
    expect(segFamilies).not.toContain("Liberation Sans");
    expect(new Set(segFamilies)).toEqual(new Set(["Arial"]));
  });

  it("still prefers a real platform font over the CSS family", () => {
    // Anti-piracy aliasing: CSS says "PSC", the font really rendered is
    // "PPCirka-Light" — that preference must survive the guard.
    const p = makeFrame({
      tag: "p",
      styles: { display: "block", fontFamily: "PSC" },
      children: [
        run("Real ", "PSC", "PPCirka-Light"),
        run("font wins", "PSC", "PPCirka-Light", "strong"),
      ],
    });

    const root = convertW2WToWireframe(page([p]) as never, { layoutMode: "autoLayout" });
    const node = findNode(root, (n) => Array.isArray(n.styledSegments));

    expect(node).not.toBeNull();
    const segFamilies = (node!.styledSegments as Array<{ fontFamily?: string }>).map(
      (s) => s.fontFamily,
    );
    expect(new Set(segFamilies)).toEqual(new Set(["PPCirka-Light"]));
  });
});
