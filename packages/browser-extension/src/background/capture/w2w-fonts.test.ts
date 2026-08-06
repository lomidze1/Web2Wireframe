/**
 * Two defects that made a `.w2w` export lose the fonts a page actually uses.
 *
 * telex.ge declares 8 @font-face rules; the export carried ONE — "BPG Nino
 * Mtavruli", holding only its IE-only .eot URL. Both the plugin's font modal
 * and its fonts.zip are downstream of this data, so neither could recover.
 *
 *   1. The used-font filter compared CSS-declared family names against a set
 *      built from PLATFORM family names. A page asking for "glyphs" renders
 *      with the file's real name "icomoon", the two never matched, and the
 *      whole face was dropped — every icon font, anti-piracy alias and
 *      variable-font instance with it.
 *   2. Only one URL per face survived, ranked woff2-first. Neither Figma nor
 *      macOS can install a woff2, and the plugin can't read its name table
 *      (no Brotli in the sandbox), so the "kept" file was unusable.
 */
import { describe, it, expect } from "vitest";
import type { W2WFrameNode } from "@w2w/shared";
import { w2wCollectCssFontFamilies, w2wFilterUsedFonts, w2wPickFontUrlsToKeep } from "./w2w";

function frame(styles: Record<string, string>, children: W2WFrameNode[] = []): W2WFrameNode {
  return {
    type: "FRAME",
    tag: "div",
    classList: [],
    attr: {},
    styles: styles as W2WFrameNode["styles"],
    children,
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
  } as W2WFrameNode;
}

describe("w2wCollectCssFontFamilies", () => {
  it("collects every CSS-declared family in the tree", () => {
    const tree = frame({ fontFamily: "glyphs" }, [
      frame({ fontFamily: '"BPG Nino Mtavruli", Arial, sans-serif' }),
      frame({ fontFamily: "uni2-icons" }),
    ]);

    expect(w2wCollectCssFontFamilies(tree)).toEqual(
      new Set(["glyphs", "bpg nino mtavruli", "arial", "uni2-icons"]),
    );
  });

  it("skips generic keywords that no @font-face can declare", () => {
    const families = w2wCollectCssFontFamilies(frame({ fontFamily: "serif, monospace, inherit" }));

    expect(families.size).toBe(0);
  });
});

describe("w2wFilterUsedFonts", () => {
  const fonts = [
    { fontFamily: "glyphs", platformFontFamily: "glyphs" },
    { fontFamily: "BPG Nino Mtavruli", platformFontFamily: "BPG Nino Mtavruli" },
    { fontFamily: "Never Referenced", platformFontFamily: "Never Referenced" },
  ];

  it("keeps a face the page asks for under its CSS name", () => {
    // The platform set holds what actually rendered — "icomoon" for the icon
    // font — so the CSS-declared set is the only thing that can match "glyphs".
    const kept = w2wFilterUsedFonts(
      fonts,
      new Set(["icomoon", "bpg nino mtavruli"]),
      new Set(["glyphs", "bpg nino mtavruli"]),
    );

    expect(kept.map((f) => f.fontFamily)).toEqual(["glyphs", "BPG Nino Mtavruli"]);
  });

  it("still drops faces nothing on the page references", () => {
    const kept = w2wFilterUsedFonts(fonts, new Set(["icomoon"]), new Set(["glyphs"]));

    expect(kept.map((f) => f.fontFamily)).toEqual(["glyphs"]);
  });

  it("keeps everything when neither set is populated", () => {
    expect(w2wFilterUsedFonts(fonts, new Set(), new Set())).toHaveLength(3);
  });
});

describe("w2wPickFontUrlsToKeep", () => {
  const src =
    "url(https://telex.ge/f/glyphs.eot#iefix) format('embedded-opentype'), " +
    "url(https://telex.ge/f/glyphs.woff) format('woff'), " +
    "url(https://telex.ge/f/glyphs.ttf) format('truetype')";

  it("keeps the format the browser actually cached", () => {
    // The page requested .woff; the .ttf was never downloaded. Keeping the
    // theoretically-better .ttf would delete the only bytes we hold and ship a
    // capture with no font files at all.
    const cached = new Set(["https://telex.ge/f/glyphs.woff"]);

    expect(w2wPickFontUrlsToKeep(src, (u) => cached.has(u))).toEqual([
      "https://telex.ge/f/glyphs.woff",
    ]);
  });

  it("ranks by installability when several formats were cached", () => {
    const cached = new Set([
      "https://telex.ge/f/glyphs.woff",
      "https://telex.ge/f/glyphs.ttf",
    ]);

    expect(w2wPickFontUrlsToKeep(src, (u) => cached.has(u))[0]).toBe(
      "https://telex.ge/f/glyphs.ttf",
    );
  });

  it("keeps the best-ranked URL as a target when nothing was cached", () => {
    expect(w2wPickFontUrlsToKeep(src, () => false)).toEqual([
      "https://telex.ge/f/glyphs.ttf",
    ]);
  });

  it("returns nothing when a face declares no URL", () => {
    expect(w2wPickFontUrlsToKeep("local('Open Sans')", () => true)).toEqual([]);
  });
});
