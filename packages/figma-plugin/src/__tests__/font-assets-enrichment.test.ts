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
  it("attaches the cached binary so the ZIP needs no network", () => {
    const fonts = [{ fontFamily: "glyphs", src: "https://telex.ge/fonts/glyphs.ttf" }];
    const assets = {
      "https://telex.ge/fonts/glyphs.ttf": {
        base64Encoded: true,
        content: GLYPHS_TTF,
        mimeType: "font/ttf",
      },
    };

    const [font] = enrichFontsFromAssets(fonts, assets) as Array<{
      fontBase64?: string;
      fontMimeType?: string;
    }>;

    expect(font.fontBase64).toBe(GLYPHS_TTF);
    expect(font.fontMimeType).toBe("font/ttf");
  });

  it("reads the real family from those bytes", () => {
    const fonts = [{ fontFamily: "glyphs", src: "url(https://telex.ge/fonts/glyphs.ttf)" }];
    const assets = {
      "https://telex.ge/fonts/glyphs.ttf": { base64Encoded: true, content: GLYPHS_TTF },
    };

    const [font] = enrichFontsFromAssets(fonts, assets) as Array<{ realFamily?: string }>;

    expect(font.realFamily).toBe("icomoon");
  });

  it("prefers an installable URL over the bulletproof EOT declared first", () => {
    const fonts = [{
      fontFamily: "glyphs",
      src: "url(https://telex.ge/f/glyphs.eot) url(https://telex.ge/f/glyphs.ttf)",
    }];
    const assets = {
      "https://telex.ge/f/glyphs.eot": { base64Encoded: true, content: toBase64(new Uint8Array([1, 2, 3, 4])) },
      "https://telex.ge/f/glyphs.ttf": { base64Encoded: true, content: GLYPHS_TTF },
    };

    const [font] = enrichFontsFromAssets(fonts, assets) as Array<{ realFamily?: string; fontBase64?: string }>;

    expect(font.fontBase64).toBe(GLYPHS_TTF);
    expect(font.realFamily).toBe("icomoon");
  });

  it("leaves a font the server already described untouched", () => {
    const fonts = [{ fontFamily: "PSA", src: "https://x/psa.ttf", realFamily: "Averta Std", fontBase64: "AAA=" }];
    const assets = { "https://x/psa.ttf": { base64Encoded: true, content: GLYPHS_TTF } };

    const [font] = enrichFontsFromAssets(fonts, assets) as Array<{ realFamily?: string; fontBase64?: string }>;

    expect(font.realFamily).toBe("Averta Std");
    expect(font.fontBase64).toBe("AAA=");
  });

  it("is a no-op without an asset map (API imports already carry their bytes)", () => {
    const fonts = [{ fontFamily: "glyphs", src: "https://telex.ge/fonts/glyphs.ttf" }];

    expect(enrichFontsFromAssets(fonts, undefined)).toEqual(fonts);
  });
});
