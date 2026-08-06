/**
 * WOFF v1 → SFNT conversion for the fonts ZIP.
 *
 * telex.ge regression: the site serves its icon fonts ("glyphs",
 * "uni2-icons") as WOFF-only, and macOS Font Book refuses to install .woff
 * ("No Installable Fonts Selected"). The ZIP must unwrap WOFF v1 back to the
 * original TTF/OTF so every shipped file is actually installable.
 */
import { describe, it, expect } from "vitest";
import { zlibSync } from "fflate";
import { convertWoffToSfnt, isWoff } from "../utils/woffToSfnt";
import { repackageForInstall } from "../utils/fontDownload";

// ---------------------------------------------------------------------------
// Synthetic font builders
// ---------------------------------------------------------------------------

function u32(view: DataView, off: number, val: number) { view.setUint32(off, val); }
function u16(view: DataView, off: number, val: number) { view.setUint16(off, val); }

const TAG_HEAD = 0x68656164; // 'head'
const TAG_NAME = 0x6e616d65; // 'name'

/** Build a WOFF v1 file wrapping two tables (one compressed, one stored). */
function buildWoff(flavor: number): { woff: Uint8Array; tables: Uint8Array[] } {
  const headData = new Uint8Array(54); // realistic 'head' table size
  for (let i = 0; i < headData.length; i++) headData[i] = (i * 7) % 251;
  const nameData = new Uint8Array(90);
  for (let i = 0; i < nameData.length; i++) nameData[i] = (i * 13) % 251;

  const headComp = zlibSync(headData); // compressed entry
  const nameComp = nameData; // stored entry (compLength === origLength)

  const numTables = 2;
  const dirStart = 44;
  const dirSize = numTables * 20;
  let dataOffset = dirStart + dirSize;

  const total = dataOffset + headComp.length + nameComp.length;
  const woff = new Uint8Array(total);
  const view = new DataView(woff.buffer);

  u32(view, 0, 0x774f4646); // 'wOFF'
  u32(view, 4, flavor);
  u32(view, 8, total);
  u16(view, 12, numTables);

  // head entry
  u32(view, dirStart, TAG_HEAD);
  u32(view, dirStart + 4, dataOffset);
  u32(view, dirStart + 8, headComp.length);
  u32(view, dirStart + 12, headData.length);
  u32(view, dirStart + 16, 0xdeadbeef);
  woff.set(headComp, dataOffset);
  dataOffset += headComp.length;

  // name entry (stored)
  u32(view, dirStart + 20, TAG_NAME);
  u32(view, dirStart + 24, dataOffset);
  u32(view, dirStart + 28, nameComp.length);
  u32(view, dirStart + 32, nameData.length);
  u32(view, dirStart + 36, 0xcafebabe);
  woff.set(nameComp, dataOffset);

  return { woff, tables: [headData, nameData] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("convertWoffToSfnt", () => {
  it("unwraps a TrueType-flavored WOFF to a valid TTF", async () => {
    const { woff, tables } = buildWoff(0x00010000);
    expect(isWoff(woff)).toBe(true);

    const result = convertWoffToSfnt(woff);
    expect(result).not.toBeNull();
    expect(result!.extension).toBe("ttf");

    const out = result!.bytes;
    const view = new DataView(out.buffer);
    expect(view.getUint32(0)).toBe(0x00010000); // sfnt version restored
    expect(view.getUint16(4)).toBe(2); // numTables

    // Directory entry 0: 'head', decompressed length + data round-trip.
    expect(view.getUint32(12)).toBe(TAG_HEAD);
    const headOffset = view.getUint32(12 + 8);
    const headLength = view.getUint32(12 + 12);
    expect(headLength).toBe(tables[0].length);
    expect(Array.from(out.subarray(headOffset, headOffset + headLength)))
      .toEqual(Array.from(tables[0]));

    // Directory entry 1: 'name' (stored) round-trips too.
    expect(view.getUint32(28)).toBe(TAG_NAME);
    const nameOffset = view.getUint32(28 + 8);
    const nameLength = view.getUint32(28 + 12);
    expect(Array.from(out.subarray(nameOffset, nameOffset + nameLength)))
      .toEqual(Array.from(tables[1]));

    // Table data must be 4-byte aligned per the SFNT spec.
    expect(headOffset % 4).toBe(0);
    expect(nameOffset % 4).toBe(0);
  });

  it("maps 'OTTO' flavor to .otf", async () => {
    const { woff } = buildWoff(0x4f54544f);
    const result = convertWoffToSfnt(woff);
    expect(result).not.toBeNull();
    expect(result!.extension).toBe("otf");
    expect(new DataView(result!.bytes.buffer).getUint32(0)).toBe(0x4f54544f);
  });

  it("returns null for non-WOFF and corrupt input", async () => {
    expect(convertWoffToSfnt(new Uint8Array([1, 2, 3]))).toBeNull();
    const { woff } = buildWoff(0x00010000);
    woff[0] = 0x00; // break signature
    expect(convertWoffToSfnt(woff)).toBeNull();
    const truncated = buildWoff(0x00010000).woff.subarray(0, 60);
    expect(convertWoffToSfnt(truncated)).toBeNull();
  });
});

describe("repackageForInstall", () => {
  it("renames .woff entries to .ttf with converted bytes", async () => {
    const { woff } = buildWoff(0x00010000);
    const result = await repackageForInstall("uni2-icons-normal-normal-100.woff", woff);
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe("uni2-icons-normal-normal-100.ttf");
    expect(new DataView(result!.bytes.buffer).getUint32(0)).toBe(0x00010000);
  });

  it("converts WOFF bytes even when the file name lies (mislabeled .ttf)", async () => {
    // Content-based detection: cached binaries arrive with names derived from
    // URLs, which can disagree with the actual bytes.
    const { woff } = buildWoff(0x00010000);
    const result = await repackageForInstall("glyphs-normal-normal-100.ttf", woff);
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe("glyphs-normal-normal-100.ttf");
    expect(new DataView(result!.bytes.buffer).getUint32(0)).toBe(0x00010000);
    expect(isWoff(result!.bytes)).toBe(false); // unwrapped, no longer WOFF
  });

  it("leaves .woff2 and non-WOFF bytes untouched", async () => {
    const junk = new Uint8Array([9, 9, 9, 9, 9]);
    expect(await repackageForInstall("font.woff2", junk)).toEqual({ fileName: "font.woff2", bytes: junk });
    // .woff name but not actually WOFF bytes → untouched
    expect(await repackageForInstall("font.woff", junk)).toEqual({ fileName: "font.woff", bytes: junk });
  });

  it("corrects the extension of raw SFNT bytes mislabeled .woff", async () => {
    const { woff } = buildWoff(0x00010000);
    const sfnt = convertWoffToSfnt(woff)!.bytes; // genuine TrueType bytes
    const result = await repackageForInstall("font.woff", sfnt);
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe("font.ttf");
    expect(result!.bytes).toBe(sfnt); // bytes untouched, only the name fixed
  });
});
