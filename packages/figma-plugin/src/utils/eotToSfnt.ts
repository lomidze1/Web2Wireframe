/**
 * EOT (Embedded OpenType) → SFNT (TTF/OTF) unwrap.
 *
 * EOT is an IE-only legacy container that neither macOS Font Book nor Windows
 * will install. The capture side can still end up embedding EOT bytes (the
 * "bulletproof" @font-face pattern declares the .eot URL first — telex.ge's
 * ZIP shipped EOT bytes mislabeled .ttf), so the packaging step must detect
 * them by content and either unwrap or skip.
 *
 * An EOT file is a little-endian variable-length header followed by the font
 * data; when the TTEMBED_TTCOMPRESSED flag is clear the data is the original
 * SFNT verbatim, so unwrapping is lossless: slice the last FontDataSize bytes
 * and verify the SFNT magic. MTX-compressed EOTs (flag set — MicroType
 * Express) cannot be decompressed here; callers must skip those files.
 */

const EOT_MAGIC = 0x504c; // MagicNumber @ offset 34, little-endian
const EOT_VERSIONS = new Set([0x00010000, 0x00020001, 0x00020002]);
const TTEMBED_TTCOMPRESSED = 0x00000004;

const SFNT_TRUETYPE = 0x00010000;
const SFNT_OTTO = 0x4f54544f; // 'OTTO' — CFF outlines
const SFNT_TRUE = 0x74727565; // 'true' — legacy Apple TrueType

/** Result of a successful unwrap. */
export interface EotConversionResult {
  bytes: Uint8Array;
  /** "otf" when the embedded SFNT is CFF ('OTTO'), "ttf" otherwise. */
  extension: "ttf" | "otf";
}

/** True when the buffer looks like an EOT container (magic + known version). */
export function isEot(bytes: Uint8Array): boolean {
  if (bytes.length < 36) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (
    view.getUint16(34, true) === EOT_MAGIC &&
    EOT_VERSIONS.has(view.getUint32(8, true))
  );
}

/**
 * Unwrap an uncompressed EOT to its original SFNT (TTF/OTF).
 * Returns null for MTX-compressed EOTs, malformed containers, or non-EOT
 * input — callers should then skip the file rather than ship dead bytes.
 */
export function convertEotToSfnt(bytes: Uint8Array): EotConversionResult | null {
  try {
    if (!isEot(bytes)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const flags = view.getUint32(12, true);
    if (flags & TTEMBED_TTCOMPRESSED) return null; // MicroType Express — can't unwrap

    const fontDataSize = view.getUint32(4, true);
    // Font data sits at the end: header is variable-length, so its start is
    // simply total − FontDataSize. Validate before slicing.
    const offset = bytes.length - fontDataSize;
    if (fontDataSize < 12 || offset < 36) return null;

    const sfnt = bytes.subarray(offset);
    const flavor = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength).getUint32(0);
    if (flavor !== SFNT_TRUETYPE && flavor !== SFNT_OTTO && flavor !== SFNT_TRUE) {
      return null; // data at the computed offset is not an SFNT — malformed
    }

    return { bytes: sfnt, extension: flavor === SFNT_OTTO ? "otf" : "ttf" };
  } catch {
    return null;
  }
}
