/**
 * Real (SFNT) font names on the API import path.
 *
 * Two gaps met on goodwill.ge, whose faces are plain WOFF1:
 *
 *   1. Only the extension path read names out of the bytes
 *      (`enrichFontsFromAssets`). URL/HTML imports trusted the server, and the
 *      server skips WOFF1 entirely (`decompressFont.ts` ships `names: {}` for
 *      it) — so `realFamily` was never known on those paths.
 *   2. The name a text node carries is the CDP-MEASURED one, which for these
 *      faces is the full name "Helvetica Neue LT GEO 55 Roman". A map keyed
 *      only by the CSS family ("HelveticaNeue") can never answer for it, so
 *      the Re-apply marker was stamped with a family Figma will never have.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildFontRealNames,
  enrichFontsWithSfntNames,
} from "../utils/fontDownload";
import { checkFontsAvailability } from "../utils/fontUtils";

/** Minimal TTF carrying a `name` table with the requested records. */
function ttfWithNames(records: Array<{ nameId: number; text: string }>): Uint8Array {
  const strings: number[] = [];
  const meta = records.map((r) => {
    const offset = strings.length;
    for (const ch of r.text) strings.push(0, ch.charCodeAt(0));
    return { nameId: r.nameId, offset, length: strings.length - offset };
  });

  const header = 6 + meta.length * 12;
  const nameTable = new Uint8Array(header + strings.length);
  const nv = new DataView(nameTable.buffer);
  nv.setUint16(0, 0); // format
  nv.setUint16(2, meta.length); // count
  nv.setUint16(4, header); // stringOffset
  meta.forEach((m, i) => {
    const rec = 6 + i * 12;
    nv.setUint16(rec, 3); // platformID — Windows
    nv.setUint16(rec + 2, 1); // encodingID
    nv.setUint16(rec + 4, 0x409); // languageID
    nv.setUint16(rec + 6, m.nameId);
    nv.setUint16(rec + 8, m.length);
    nv.setUint16(rec + 10, m.offset);
  });
  nameTable.set(strings, header);

  const font = new Uint8Array(28 + nameTable.length);
  const fv = new DataView(font.buffer);
  fv.setUint32(0, 0x00010000);
  fv.setUint16(4, 1); // numTables
  font.set([0x6e, 0x61, 0x6d, 0x65], 12); // "name"
  fv.setUint32(20, 28);
  fv.setUint32(24, nameTable.length);
  font.set(nameTable, 28);
  return font;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** goodwill.ge's 55 Roman cut, as its `name` table really reads. */
const HELVETICA_GEO_TTF = toBase64(
  ttfWithNames([
    { nameId: 1, text: "Helvetica Neue LT GEO 55 Roman" },
    { nameId: 2, text: "Regular" },
    { nameId: 16, text: "Helvetica Neue LT GEO" },
    { nameId: 17, text: "55 Roman" },
  ]),
);

describe("enrichFontsWithSfntNames", () => {
  it("reads the real names straight from the bound bytes — no asset map", async () => {
    const fonts = [
      { fontFamily: "HelveticaNeue", fontWeight: "400", fontBase64: HELVETICA_GEO_TTF },
    ];

    const [font] = (await enrichFontsWithSfntNames(fonts)) as Array<{
      realFamily?: string;
      realSubfamily?: string;
    }>;

    expect(font.realFamily).toBe("Helvetica Neue LT GEO");
    expect(font.realSubfamily).toBe("55 Roman");
  });

  it("leaves a face the server already described untouched", async () => {
    const fonts = [
      {
        fontFamily: "PSC",
        fontBase64: HELVETICA_GEO_TTF,
        realFamily: "PPCirka-Light",
      },
    ];

    const [font] = (await enrichFontsWithSfntNames(fonts)) as Array<{ realFamily?: string }>;

    expect(font.realFamily).toBe("PPCirka-Light");
  });

  it("passes through faces with no bytes to read", async () => {
    const fonts = [{ fontFamily: "Inter", src: "https://x/inter.woff2" }];
    expect(await enrichFontsWithSfntNames(fonts)).toEqual(fonts);
  });

  it("tolerates an absent font list", async () => {
    expect(await enrichFontsWithSfntNames(undefined)).toEqual([]);
  });
});

describe("buildFontRealNames — full-name key", () => {
  it("also maps the measured full name to the installed family", () => {
    const map = buildFontRealNames([
      {
        fontFamily: "HelveticaNeue",
        realFamily: "Helvetica Neue LT GEO",
        realSubfamily: "55 Roman",
      },
    ]);

    // The CSS name, as before …
    expect(map["HelveticaNeue"]).toBe("Helvetica Neue LT GEO");
    // … and the string CDP actually measures, which is what lands on the node.
    expect(map["Helvetica Neue LT GEO 55 Roman"]).toBe("Helvetica Neue LT GEO");
  });

  it("adds no key for a face whose full name IS its family", () => {
    // moitane-icons: family and full name are the same string, subfamily is
    // the default "Regular" — a composed key would name a font nothing reports.
    const map = buildFontRealNames([
      { fontFamily: "glyphs", realFamily: "moitane-icons", realSubfamily: "Regular" },
    ]);

    expect(map["glyphs"]).toBe("moitane-icons");
    expect(Object.keys(map)).toEqual(["glyphs"]);
  });

  it("keeps working when no subfamily was read", () => {
    const map = buildFontRealNames([
      { fontFamily: "Söhne", realFamily: "Copyright Klim Type Foundry" },
    ]);

    expect(map).toEqual({ "Söhne": "Copyright Klim Type Foundry" });
  });
});

// ---------------------------------------------------------------------------
// End to end: the measured full name against a machine that HAS the font
// ---------------------------------------------------------------------------

let installedFonts: Map<string, string[]>;

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

/** What goodwill.ge's text nodes actually carry: the CDP-measured full name. */
const MEASURED = "Helvetica Neue LT GEO 55 Roman";

const REAL_NAMES = buildFontRealNames([
  {
    fontFamily: "HelveticaNeue",
    realFamily: "Helvetica Neue LT GEO",
    realSubfamily: "55 Roman",
  },
]);

describe("checkFontsAvailability — measured full name", () => {
  it("reports the family present once the user installs it", async () => {
    installedFonts.set("Helvetica Neue LT GEO", ["45 Light", "55 Roman", "75 Bold"]);

    const result = await checkFontsAvailability(
      new Set([MEASURED]),
      new Map([[MEASURED, [{ weight: 400, italic: false }]]]),
      REAL_NAMES,
    );

    expect(result.missing).toEqual([]);
    expect(result.available).toContain(MEASURED);
    expect(result.missingCuts).toEqual({});
  });

  it("still reports it missing when nothing is installed", async () => {
    // The modal must keep opening before the user has the font — the split
    // rescues a real install, it must never fake one.
    const result = await checkFontsAvailability(
      new Set([MEASURED]),
      new Map([[MEASURED, [{ weight: 400, italic: false }]]]),
      REAL_NAMES,
    );

    expect(result.missing).toEqual([MEASURED]);
  });
});
