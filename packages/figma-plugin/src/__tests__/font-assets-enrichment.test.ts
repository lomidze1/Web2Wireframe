/**
 * Wiring the `.w2w` asset map into the font entries.
 *
 * The browser extension fetches every font binary into the capture's asset map
 * (keyed by URL) but never attaches it to the @font-face entry it belongs to.
 * The plugin therefore saw no `fontBase64`, tried to fetch each font URL from
 * the Figma iframe, got blocked, and produced an EMPTY fonts.zip — while the
 * bytes sat in the same file all along.
 *
 * Attaching them also unlocks the real (SFNT) family name, which is what makes
 * `glyphs` resolve to its installed identity `icomoon`.
 */
import { describe, it, expect } from "vitest";
import { enrichFontsFromAssets } from "../utils/fontDownload";

/** Minimal TTF carrying a `name` table with `family` as nameID 1. */
function ttfNamed(family: string): Uint8Array {
  const chars: number[] = [];
  for (const ch of family) chars.push(0, ch.charCodeAt(0));
  const nameHeader = 6 + 12;
  const nameTable = new Uint8Array(nameHeader + chars.length);
  const nv = new DataView(nameTable.buffer);
  nv.setUint16(2, 1);
  nv.setUint16(4, nameHeader);
  nv.setUint16(6, 3);
  nv.setUint16(8, 1);
  nv.setUint16(10, 0x409);
  nv.setUint16(12, 1);
  nv.setUint16(14, chars.length);
  nv.setUint16(16, 0);
  nameTable.set(chars, nameHeader);

  const font = new Uint8Array(28 + nameTable.length);
  const fv = new DataView(font.buffer);
  fv.setUint32(0, 0x00010000);
  fv.setUint16(4, 1);
  font.set([0x6e, 0x61, 0x6d, 0x65], 12);
  fv.setUint32(20, 28); // table offset
  fv.setUint32(24, nameTable.length);
  font.set(nameTable, 28);
  return font;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

const GLYPHS_TTF = toBase64(ttfNamed("icomoon"));

describe("enrichFontsFromAssets", () => {
  it("attaches the cached binary so the ZIP needs no network", async () => {
    const fonts = [{ fontFamily: "glyphs", src: "https://telex.ge/fonts/glyphs.ttf" }];
    const assets = {
      "https://telex.ge/fonts/glyphs.ttf": {
        base64Encoded: true,
        content: GLYPHS_TTF,
        mimeType: "font/ttf",
      },
    };

    const [font] = await enrichFontsFromAssets(fonts, assets) as Array<{
      fontBase64?: string;
      fontMimeType?: string;
    }>;

    expect(font.fontBase64).toBe(GLYPHS_TTF);
    expect(font.fontMimeType).toBe("font/ttf");
  });

  it("reads the real family from those bytes", async () => {
    const fonts = [{ fontFamily: "glyphs", src: "url(https://telex.ge/fonts/glyphs.ttf)" }];
    const assets = {
      "https://telex.ge/fonts/glyphs.ttf": { base64Encoded: true, content: GLYPHS_TTF },
    };

    const [font] = await enrichFontsFromAssets(fonts, assets) as Array<{ realFamily?: string }>;

    expect(font.realFamily).toBe("icomoon");
  });

  it("prefers an installable URL over the bulletproof EOT declared first", async () => {
    const fonts = [{
      fontFamily: "glyphs",
      src: "url(https://telex.ge/f/glyphs.eot) url(https://telex.ge/f/glyphs.ttf)",
    }];
    const assets = {
      "https://telex.ge/f/glyphs.eot": { base64Encoded: true, content: toBase64(new Uint8Array([1, 2, 3, 4])) },
      "https://telex.ge/f/glyphs.ttf": { base64Encoded: true, content: GLYPHS_TTF },
    };

    const [font] = await enrichFontsFromAssets(fonts, assets) as Array<{ realFamily?: string; fontBase64?: string }>;

    expect(font.fontBase64).toBe(GLYPHS_TTF);
    expect(font.realFamily).toBe("icomoon");
  });

  it("leaves a font the server already described untouched", async () => {
    const fonts = [{ fontFamily: "PSA", src: "https://x/psa.ttf", realFamily: "Averta Std", fontBase64: "AAA=" }];
    const assets = { "https://x/psa.ttf": { base64Encoded: true, content: GLYPHS_TTF } };

    const [font] = await enrichFontsFromAssets(fonts, assets) as Array<{ realFamily?: string; fontBase64?: string }>;

    expect(font.realFamily).toBe("Averta Std");
    expect(font.fontBase64).toBe("AAA=");
  });

  it("is a no-op without an asset map (API imports already carry their bytes)", async () => {
    const fonts = [{ fontFamily: "glyphs", src: "https://telex.ge/fonts/glyphs.ttf" }];

    expect(await enrichFontsFromAssets(fonts, undefined)).toEqual(fonts);
  });
});


// ---------------------------------------------------------------------------
// WOFF2 assets
// ---------------------------------------------------------------------------

/**
 * A page that serves woff2 ONLY (iwm.org.uk) used to hand the user a ZIP full
 * of .woff2 files -- a web-only container no OS installs -- and readSfntNames
 * could not read a family out of them either, so "Re-apply original fonts"
 * had no real name to bind to. The bytes must be unwrapped to SFNT here, once,
 * so both the ZIP and the name lookup see an installable font.
 */
describe("enrichFontsFromAssets -- WOFF2", () => {
  it("unwraps a woff2 asset to SFNT and reads its real family", async () => {
    const { ROBOTO_SUBSET_WOFF2_BASE64 } = await import(
      "./fixtures/roboto-subset.woff2.base64"
    );
    const fonts = [{ fontFamily: "Roboto", src: "https://x.io/roboto.woff2" }];
    const assets = {
      "https://x.io/roboto.woff2": {
        base64Encoded: true,
        content: ROBOTO_SUBSET_WOFF2_BASE64,
        mimeType: "font/woff2",
      },
    };
    const [font] = (await enrichFontsFromAssets(fonts, assets)) as Array<{
      fontBase64?: string;
      fontMimeType?: string;
      realFamily?: string;
    }>;

    expect(font.fontBase64).toBeTruthy();
    const bin = atob(font.fontBase64!);
    // SFNT now, not a wOF2 container.
    expect([bin.charCodeAt(0), bin.charCodeAt(1), bin.charCodeAt(2), bin.charCodeAt(3)])
      .toEqual([0x00, 0x01, 0x00, 0x00]);
    expect(font.fontMimeType).toBe("font/ttf");
    expect(font.realFamily).toBe("Roboto");
  });

  it("keeps the original bytes when the woff2 payload is unreadable", async () => {
    const fonts = [{ fontFamily: "Broken", src: "https://x.io/broken.woff2" }];
    const junk = btoa("wOF2    junk");
    const assets = {
      "https://x.io/broken.woff2": {
        base64Encoded: true,
        content: junk,
        mimeType: "font/woff2",
      },
    };
    const [font] = (await enrichFontsFromAssets(fonts, assets)) as Array<{
      fontBase64?: string;
      fontMimeType?: string;
    }>;
    expect(font.fontBase64).toBe(junk);
    expect(font.fontMimeType).toBe("font/woff2");
  });
});
