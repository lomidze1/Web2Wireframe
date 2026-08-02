/**
 * WOFF (v1) → SFNT (TTF/OTF) conversion.
 *
 * macOS Font Book and Windows refuse to install .woff files — WOFF is a
 * web-delivery wrapper, not an installable font. Many sites (telex.ge serves
 * its "glyphs"/"uni2-icons" icon fonts as WOFF-only) never expose a TTF/OTF
 * URL, so the fonts ZIP used to ship files the user could not install.
 *
 * WOFF v1 (RFC: https://www.w3.org/TR/WOFF/) is just an SFNT whose tables are
 * individually zlib-compressed, so unwrapping is lossless: rebuild the SFNT
 * header + table directory and inflate each table. WOFF2 uses Brotli and a
 * transformed glyf table — NOT convertible here; callers must leave .woff2
 * entries untouched.
 */

import { unzlibSync } from "fflate";

const WOFF_SIGNATURE = 0x774f4646; // 'wOFF'

/** Result of a successful conversion. */
export interface WoffConversionResult {
  bytes: Uint8Array;
  /** "ttf" when the wrapped SFNT is TrueType-flavored, "otf" for CFF ('OTTO'). */
  extension: "ttf" | "otf";
}

/** True when the buffer starts with the WOFF v1 signature. */
export function isWoff(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0) === WOFF_SIGNATURE;
}

/**
 * Convert a WOFF v1 buffer to its original SFNT (TTF/OTF).
 * Returns null for anything that is not a well-formed WOFF v1 file —
 * callers should then ship the original bytes unchanged.
 */
export function convertWoffToSfnt(bytes: Uint8Array): WoffConversionResult | null {
  try {
    if (bytes.length < 44) return null; // WOFF header is 44 bytes
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0) !== WOFF_SIGNATURE) return null;

    const flavor = view.getUint32(4);
    const numTables = view.getUint16(12);
    if (numTables === 0 || numTables > 512) return null;

    // WOFF table directory: 20 bytes per entry, starting at offset 44.
    const dirStart = 44;
    if (bytes.length < dirStart + numTables * 20) return null;

    interface TableEntry {
      tag: number;
      origChecksum: number;
      data: Uint8Array;
    }
    const tables: TableEntry[] = [];
    for (let i = 0; i < numTables; i++) {
      const off = dirStart + i * 20;
      const tag = view.getUint32(off);
      const dataOffset = view.getUint32(off + 4);
      const compLength = view.getUint32(off + 8);
      const origLength = view.getUint32(off + 12);
      const origChecksum = view.getUint32(off + 16);

      if (dataOffset + compLength > bytes.length) return null;
      const raw = bytes.subarray(dataOffset, dataOffset + compLength);
      let data: Uint8Array;
      if (compLength === origLength) {
        data = raw; // stored uncompressed
      } else {
        data = unzlibSync(raw);
        if (data.length !== origLength) return null;
      }
      tables.push({ tag, origChecksum, data });
    }

    // SFNT layout: 12-byte header, 16-byte directory entries, 4-byte-padded tables.
    const headerSize = 12 + numTables * 16;
    let totalSize = headerSize;
    for (const t of tables) totalSize += pad4(t.data.length);

    const out = new Uint8Array(totalSize);
    const outView = new DataView(out.buffer);

    outView.setUint32(0, flavor);
    outView.setUint16(4, numTables);
    // searchRange / entrySelector / rangeShift per the SFNT spec.
    const maxPow2 = Math.pow(2, Math.floor(Math.log2(numTables)));
    outView.setUint16(6, maxPow2 * 16);
    outView.setUint16(8, Math.floor(Math.log2(numTables)));
    outView.setUint16(10, numTables * 16 - maxPow2 * 16);

    let dataOffset = headerSize;
    for (let i = 0; i < numTables; i++) {
      const t = tables[i];
      const dirOff = 12 + i * 16;
      outView.setUint32(dirOff, t.tag);
      outView.setUint32(dirOff + 4, t.origChecksum);
      outView.setUint32(dirOff + 8, dataOffset);
      outView.setUint32(dirOff + 12, t.data.length);
      out.set(t.data, dataOffset);
      dataOffset += pad4(t.data.length);
    }

    // 'OTTO' flavor = CFF outlines → .otf; anything else (0x00010000, 'true') → .ttf
    const extension = flavor === 0x4f54544f ? "otf" : "ttf";
    return { bytes: out, extension };
  } catch {
    return null;
  }
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}
