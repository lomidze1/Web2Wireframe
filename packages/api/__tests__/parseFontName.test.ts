/**
 * parseFontNames — SFNT `name` table parser tests.
 *
 * TDD: tests written before implementation.
 *
 * The parser only needs to read three table layers:
 *   - 12-byte offset table at byte 0
 *   - 16-byte directory entry pointing to the 'name' table
 *   - the name table itself (header + records + string heap)
 *
 * We hand-craft minimal SFNT buffers covering each branch of the parser —
 * no real font fixtures necessary.
 */

import { describe, it, expect } from "vitest";
import { parseFontNames } from "../src/lib/fonts/parseFontName.js";

// ---------------------------------------------------------------------------
// Buffer builders
// ---------------------------------------------------------------------------

interface NameRecordSpec {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  /** UTF-8 source string; encoded UTF-16BE for Microsoft/Unicode platforms,
   *  Mac Roman (latin1) for platformID=1. */
  text: string;
}

/**
 * Build a complete minimal SFNT buffer with a single 'name' table populated
 * from `records`. The offset table claims numTables=1 (just 'name'); the
 * directory points to a name table starting right after the directory.
 */
function buildSfntWithName(
  records: NameRecordSpec[],
  opts: { sfntVersion?: number; corruptNameTag?: boolean } = {},
): Buffer {
  const sfntVersion = opts.sfntVersion ?? 0x00010000;

  // -- Encode each record's string per-platform
  const encoded = records.map((r) => {
    if (r.platformID === 1) {
      // Mac Roman → encode as latin1 (good enough for ASCII-only test inputs)
      return Buffer.from(r.text, "latin1");
    }
    // (3, *) and (0, *) → UTF-16BE
    const u16 = Buffer.alloc(r.text.length * 2);
    for (let i = 0; i < r.text.length; i++) {
      u16.writeUInt16BE(r.text.charCodeAt(i), i * 2);
    }
    return u16;
  });

  // String heap = concat of all encoded strings.
  const stringHeap = Buffer.concat(encoded);

  // -- Build name records (12 bytes each)
  const recordsBuf = Buffer.alloc(records.length * 12);
  let stringOffsetCursor = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const enc = encoded[i];
    const rec = recordsBuf.subarray(i * 12, (i + 1) * 12);
    rec.writeUInt16BE(r.platformID, 0);
    rec.writeUInt16BE(r.encodingID, 2);
    rec.writeUInt16BE(r.languageID, 4);
    rec.writeUInt16BE(r.nameID, 6);
    rec.writeUInt16BE(enc.length, 8);
    rec.writeUInt16BE(stringOffsetCursor, 10);
    stringOffsetCursor += enc.length;
  }

  // -- Name table = 6-byte header + records + string heap
  const nameHeader = Buffer.alloc(6);
  nameHeader.writeUInt16BE(0, 0);                       // format
  nameHeader.writeUInt16BE(records.length, 2);          // count
  nameHeader.writeUInt16BE(6 + records.length * 12, 4); // stringOffset (from start of name table)
  const nameTable = Buffer.concat([nameHeader, recordsBuf, stringHeap]);

  // -- Offset table (12 bytes) + 1 directory entry (16 bytes)
  const offsetTable = Buffer.alloc(12);
  offsetTable.writeUInt32BE(sfntVersion, 0);
  offsetTable.writeUInt16BE(1, 4);  // numTables = 1
  offsetTable.writeUInt16BE(0, 6);  // searchRange (unused by parser)
  offsetTable.writeUInt16BE(0, 8);  // entrySelector
  offsetTable.writeUInt16BE(0, 10); // rangeShift

  const dirEntry = Buffer.alloc(16);
  const tag = opts.corruptNameTag ? "xxxx" : "name";
  dirEntry.write(tag, 0, 4, "ascii");
  dirEntry.writeUInt32BE(0, 4);                   // checksum (unused)
  dirEntry.writeUInt32BE(12 + 16, 8);             // table offset = right after directory
  dirEntry.writeUInt32BE(nameTable.length, 12);   // table length

  return Buffer.concat([offsetTable, dirEntry, nameTable]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseFontNames", () => {
  it("reads NameID 1 (family) + NameID 2 (subfamily) from a Microsoft Unicode record", () => {
    const buf = buildSfntWithName([
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, text: "Averta Std" },
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 2, text: "Regular" },
    ]);

    const names = parseFontNames(buf);

    expect(names.family).toBe("Averta Std");
    expect(names.subfamily).toBe("Regular");
    expect(names.fullName).toBeUndefined();
  });

  it("prefers NameID 16/17 (typographic) over 1/2 when both present", () => {
    const buf = buildSfntWithName([
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, text: "PPFragment Glare Medium" }, // legacy name
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 2, text: "Regular" },                 // legacy subfamily
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 16, text: "PPFragment Glare" },       // typographic family
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 17, text: "Medium" },                 // typographic subfamily
    ]);

    const names = parseFontNames(buf);

    expect(names.family).toBe("PPFragment Glare");
    expect(names.subfamily).toBe("Medium");
  });

  it("populates fullName from NameID 4", () => {
    const buf = buildSfntWithName([
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, text: "Averta Std" },
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 4, text: "AvertaStd-Regular" },
    ]);

    const names = parseFontNames(buf);

    expect(names.fullName).toBe("AvertaStd-Regular");
  });

  it("reads OTF (sfntVersion = 'OTTO' = 0x4F54544F) the same way", () => {
    const buf = buildSfntWithName(
      [{ platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, text: "Source Sans 3 VF" }],
      { sfntVersion: 0x4f54544f },
    );

    const names = parseFontNames(buf);

    expect(names.family).toBe("Source Sans 3 VF");
  });

  it("ignores Mac Roman platform records (platformID=1)", () => {
    const buf = buildSfntWithName([
      { platformID: 1, encodingID: 0, languageID: 0, nameID: 1, text: "Should Be Ignored" },
    ]);

    const names = parseFontNames(buf);

    expect(names.family).toBeUndefined();
    expect(names.subfamily).toBeUndefined();
  });

  it("prefers English-language record when multiple languages exist", () => {
    const buf = buildSfntWithName([
      { platformID: 3, encodingID: 1, languageID: 0x040c, nameID: 1, text: "Averta Std FR" }, // French
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, text: "Averta Std" },     // English (preferred)
      { platformID: 3, encodingID: 1, languageID: 0x0407, nameID: 1, text: "Averta Std DE" }, // German
    ]);

    const names = parseFontNames(buf);

    expect(names.family).toBe("Averta Std");
  });

  it("returns {} for non-SFNT buffers without throwing", () => {
    const garbage = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x00, 0x00, 0x00]);
    expect(parseFontNames(garbage)).toEqual({});
  });

  it("returns {} when the offset table is fine but no 'name' table exists", () => {
    const buf = buildSfntWithName(
      [{ platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, text: "X" }],
      { corruptNameTag: true }, // directory says 'xxxx' instead of 'name'
    );

    expect(parseFontNames(buf)).toEqual({});
  });

  it("returns {} for a buffer too short to contain even an offset table", () => {
    expect(parseFontNames(Buffer.from([0x00, 0x01]))).toEqual({});
  });

  it("does not crash when a name record's offset+length falls past end of buffer", () => {
    // Build a valid buffer, then truncate it inside the string heap to force
    // the parser to bail out gracefully on the over-long record.
    const buf = buildSfntWithName([
      { platformID: 3, encodingID: 1, languageID: 0x0409, nameID: 1, text: "Truncated" },
    ]);
    const truncated = buf.subarray(0, buf.length - 4); // chop the last 4 bytes

    expect(() => parseFontNames(truncated)).not.toThrow();
  });
});
