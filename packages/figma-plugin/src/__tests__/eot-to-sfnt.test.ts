/**
 * EOT → SFNT unwrap (eotToSfnt.ts).
 *
 * telex.ge's fonts ZIP shipped EOT bytes mislabeled .ttf — macOS Font Book
 * refused them ("No Installable Fonts"). An uncompressed EOT is just a
 * variable-length header followed by the original SFNT, so unwrapping is
 * lossless. MTX-compressed EOTs (TTEMBED_TTCOMPRESSED flag) cannot be
 * unwrapped here and must return null so callers skip them honestly.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { convertEotToSfnt, isEot } from "../utils/eotToSfnt";
import {
  createFontsZipBlob,
  repackageForInstall,
  type FontDownloadEntry,
} from "../utils/fontDownload";

// ============================================================================
// Synthetic EOT builder (mirrors buildWoff in woff-to-sfnt.test.ts)
// ============================================================================

const EOT_MAGIC = 0x504c;
const TTEMBED_TTCOMPRESSED = 0x00000004;

/** Minimal-but-valid SFNT: header + one 'name' table entry. */
function buildSfnt(flavor: number): Uint8Array {
  const tableData = new TextEncoder().encode("fake-name-table!"); // 16 bytes
  const out = new Uint8Array(12 + 16 + tableData.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, flavor);
  v.setUint16(4, 1); // numTables
  v.setUint16(6, 16); // searchRange
  v.setUint16(8, 0); // entrySelector
  v.setUint16(10, 0); // rangeShift
  // table dir entry: 'name'
  v.setUint32(12, 0x6e616d65);
  v.setUint32(16, 0); // checksum
  v.setUint32(20, 28); // offset
  v.setUint32(24, tableData.length);
  out.set(tableData, 28);
  return out;
}

/**
 * Wrap an SFNT in an EOT v2.1 container: 82-byte fixed header + empty
 * name/version strings (u16 size = 0 each) + font data at the end.
 */
function buildEot(sfnt: Uint8Array, opts?: { flags?: number; version?: number }): Uint8Array {
  const headerSize = 82 + 4 * 2; // fixed part + 4 empty (u16-sized) strings
  const total = headerSize + sfnt.length;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, total, true); // EOTSize
  v.setUint32(4, sfnt.length, true); // FontDataSize
  v.setUint32(8, opts?.version ?? 0x00020001, true); // Version
  v.setUint32(12, opts?.flags ?? 0, true); // Flags
  // PANOSE(10) + Charset + Italic + Weight + fsType left zero
  v.setUint16(34, EOT_MAGIC, true); // MagicNumber
  out.set(sfnt, total - sfnt.length);
  return out;
}

const TRUETYPE = 0x00010000;
const OTTO = 0x4f54544f;

// ============================================================================
// Tests
// ============================================================================

describe("isEot", () => {
  it("recognizes a well-formed EOT container", () => {
    expect(isEot(buildEot(buildSfnt(TRUETYPE)))).toBe(true);
  });

  it("rejects SFNT, WOFF and garbage bytes", () => {
    expect(isEot(buildSfnt(TRUETYPE))).toBe(false);
    expect(isEot(new TextEncoder().encode("wOFFnot-really-a-font"))).toBe(false);
    expect(isEot(new Uint8Array(10))).toBe(false);
  });
});

describe("convertEotToSfnt", () => {
  it("unwraps an uncompressed TrueType EOT to a .ttf byte-identically", () => {
    const sfnt = buildSfnt(TRUETYPE);
    const result = convertEotToSfnt(buildEot(sfnt));
    expect(result).not.toBeNull();
    expect(result!.extension).toBe("ttf");
    expect(Array.from(result!.bytes)).toEqual(Array.from(sfnt));
  });

  it("unwraps a CFF ('OTTO') EOT to .otf", () => {
    const sfnt = buildSfnt(OTTO);
    const result = convertEotToSfnt(buildEot(sfnt, { version: 0x00020002 }));
    expect(result).not.toBeNull();
    expect(result!.extension).toBe("otf");
    expect(Array.from(result!.bytes)).toEqual(Array.from(sfnt));
  });

  it("returns null for MTX-compressed EOT (TTEMBED_TTCOMPRESSED)", () => {
    const eot = buildEot(buildSfnt(TRUETYPE), { flags: TTEMBED_TTCOMPRESSED });
    expect(convertEotToSfnt(eot)).toBeNull();
  });

  it("returns null when the embedded data is not a valid SFNT", () => {
    const eot = buildEot(new TextEncoder().encode("this is not an sfnt at all"));
    expect(convertEotToSfnt(eot)).toBeNull();
  });

  it("returns null for non-EOT input", () => {
    expect(convertEotToSfnt(buildSfnt(TRUETYPE))).toBeNull();
    expect(convertEotToSfnt(new Uint8Array(0))).toBeNull();
  });
});

// ============================================================================
// Regression: EOT bytes mislabeled .ttf (telex.ge fonts ZIP)
// ============================================================================

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function makeEntry(fontBase64: string): FontDownloadEntry {
  return {
    url: "https://site.ge/fonts/glyphs.eot?v=1",
    fileName: "glyphs-normal-normal-100.ttf",
    family: "glyphs",
    fontBase64,
    fontMimeType: "application/vnd.ms-fontobject",
  };
}

describe("repackageForInstall — EOT bytes (content-detected, name ignored)", () => {
  it("unwraps uncompressed EOT bytes named .ttf into the embedded SFNT", () => {
    const sfnt = buildSfnt(TRUETYPE);
    const result = repackageForInstall("glyphs-normal-normal-100.ttf", buildEot(sfnt));
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe("glyphs-normal-normal-100.ttf");
    expect(Array.from(result!.bytes)).toEqual(Array.from(sfnt));
  });

  it("returns null for MTX-compressed EOT so the caller can skip it", () => {
    const eot = buildEot(buildSfnt(TRUETYPE), { flags: TTEMBED_TTCOMPRESSED });
    expect(repackageForInstall("bpg-nino-normal-400-100.ttf", eot)).toBeNull();
  });
});

describe("createFontsZipBlob — cached EOT binaries", () => {
  it("ships the unwrapped SFNT for an uncompressed EOT cached binary", async () => {
    const sfnt = buildSfnt(TRUETYPE);
    const entry = makeEntry(toBase64(buildEot(sfnt)));

    const { blob, skippedEntries } = await createFontsZipBlob([entry]);

    expect(skippedEntries).toEqual([]);
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files);
    expect(names).toEqual(["glyphs-normal-normal-100.ttf"]);
    const packed = await zip.files[names[0]].async("uint8array");
    expect(Array.from(packed)).toEqual(Array.from(sfnt)); // real SFNT, not EOT
  });

  it("skips (and reports) MTX-compressed EOT instead of shipping dead bytes", async () => {
    const eot = buildEot(buildSfnt(TRUETYPE), { flags: TTEMBED_TTCOMPRESSED });
    const entry = makeEntry(toBase64(eot));

    const { blob, skippedEntries } = await createFontsZipBlob([entry]);

    expect(skippedEntries).toEqual(["glyphs-normal-normal-100.ttf"]);
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toEqual([]);
  });
});
