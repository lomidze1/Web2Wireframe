/**
 * Reading a font's REAL family name from its SFNT `name` table, in the plugin.
 *
 * The API does this server-side (`normalizeFontPayload`) and ships `realFamily`
 * with every URL/HTML import. The browser extension never does — a `.w2w` file
 * carries the font BYTES (in its asset map) but no real name, so `glyphs` never
 * resolved to its installed identity `icomoon` and the download modal opened
 * for a font the user already had.
 *
 * Reading the table plugin-side closes that gap for every import path.
 */
import { describe, it, expect } from "vitest";
import { readSfntNames } from "../utils/sfntNames";

/** Build a minimal but valid TTF carrying only a `name` table. */
function buildTtf(names: Array<{ nameId: number; text: string; platformId?: number }>): Uint8Array {
  const stringData: number[] = [];
  const records: Array<{ platformId: number; nameId: number; offset: number; length: number }> = [];

  for (const n of names) {
    const platformId = n.platformId ?? 3;
    const offset = stringData.length;
    if (platformId === 3) {
      // Windows: UTF-16BE
      for (const ch of n.text) {
        const cp = ch.codePointAt(0)!;
        stringData.push((cp >> 8) & 0xff, cp & 0xff);
      }
    } else {
      // Mac: single-byte
      for (const ch of n.text) stringData.push(ch.codePointAt(0)! & 0xff);
    }
    records.push({ platformId, nameId: n.nameId, offset, length: stringData.length - offset });
  }

  const nameHeader = 6 + records.length * 12;
  const nameTable = new Uint8Array(nameHeader + stringData.length);
  const nv = new DataView(nameTable.buffer);
  nv.setUint16(0, 0); // format
  nv.setUint16(2, records.length); // count
  nv.setUint16(4, nameHeader); // stringOffset
  records.forEach((r, i) => {
    const o = 6 + i * 12;
    nv.setUint16(o, r.platformId);
    nv.setUint16(o + 2, r.platformId === 3 ? 1 : 0); // encodingID
    nv.setUint16(o + 4, r.platformId === 3 ? 0x409 : 0); // languageID
    nv.setUint16(o + 6, r.nameId);
    nv.setUint16(o + 8, r.length);
    nv.setUint16(o + 10, r.offset);
  });
  nameTable.set(stringData, nameHeader);

  const tableOffset = 12 + 16;
  const font = new Uint8Array(tableOffset + nameTable.length);
  const fv = new DataView(font.buffer);
  fv.setUint32(0, 0x00010000); // sfntVersion
  fv.setUint16(4, 1); // numTables
  // Table directory entry: tag(4) checkSum(4) offset(4) length(4)
  font.set([0x6e, 0x61, 0x6d, 0x65], 12); // "name"
  fv.setUint32(16, 0); // checkSum
  fv.setUint32(20, tableOffset);
  fv.setUint32(24, nameTable.length);
  font.set(nameTable, tableOffset);
  return font;
}

describe("readSfntNames", () => {
  it("reads the family and subfamily a font installs under", () => {
    const bytes = buildTtf([
      { nameId: 1, text: "icomoon" },
      { nameId: 2, text: "Regular" },
    ]);

    expect(readSfntNames(bytes)).toEqual({ family: "icomoon", subfamily: "Regular" });
  });

  it("prefers the typographic family (16/17) over the legacy pair (1/2)", () => {
    // What variable-font static instances ship: legacy names carry the style,
    // typographic names carry the real family the OS lists.
    const bytes = buildTtf([
      { nameId: 1, text: "Space Grotesk Light" },
      { nameId: 2, text: "SemiBold" },
      { nameId: 16, text: "Space Grotesk" },
      { nameId: 17, text: "Semi Bold" },
    ]);

    expect(readSfntNames(bytes)).toEqual({ family: "Space Grotesk", subfamily: "Semi Bold" });
  });

  it("falls back to Mac-platform records when no Windows record exists", () => {
    const bytes = buildTtf([{ nameId: 1, text: "Old Mac Font", platformId: 1 }]);

    expect(readSfntNames(bytes).family).toBe("Old Mac Font");
  });

  it("rejects placeholder names foundries use as anti-piracy markers", () => {
    // A "." family would produce hidden-file ZIP names like `.-Regular.ttf`.
    const bytes = buildTtf([{ nameId: 1, text: "." }]);

    expect(readSfntNames(bytes).family).toBeUndefined();
  });

  it("returns nothing for bytes it can't parse instead of throwing", () => {
    expect(readSfntNames(new Uint8Array([1, 2, 3]))).toEqual({});
    // WOFF2 (Brotli) can't be unpacked here — must degrade quietly.
    expect(readSfntNames(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]))).toEqual({});
  });
});
