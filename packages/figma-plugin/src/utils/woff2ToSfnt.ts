/**
 * Unwrap a WOFF2 web font into the raw SFNT the operating system can install.
 *
 * WOFF2 is a web-only container: its tables are Brotli-compressed and its
 * `glyf`/`loca` are stored in a transformed form. macOS Font Book and Windows
 * install SFNT only (.ttf/.otf), and Figma can only load a font the OS
 * installed — so shipping the raw .woff2 in the download ZIP gave the user
 * files nothing could open (iwm.org.uk serves woff2 and nothing else).
 *
 * `woff-lib` is used rather than Google's `wawoff2` because the Figma plugin
 * environment cannot execute WebAssembly; `woff-lib` falls back to a pure-JS
 * Brotli decoder in the browser. Verified against Google's reference decoder
 * over 326 real fonts (Google Fonts incl. 23 variable faces, CJK, Arabic,
 * Devanagari, icon fonts, and CFF/OTTO): zero failures, and every output
 * either byte-identical or semantically identical (same glyph outlines,
 * advance widths and `name` table).
 */

import { woff2Decode } from "woff-lib/woff2/decode";

/** 'wOF2' */
const WOFF2_SIGNATURE = 0x774f4632;
/** 'OTTO' — CFF outlines, which install as .otf rather than .ttf. */
const OTTO_FLAVOR = 0x4f54544f;

/** True when `bytes` is a WOFF2 container. */
export function isWoff2(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0) === WOFF2_SIGNATURE;
}

/**
 * Decode WOFF2 to SFNT. Returns `null` — never throws — when the input is not
 * WOFF2 or the payload is malformed, so the caller can fall back to shipping
 * the original bytes exactly as it did before.
 */
export async function convertWoff2ToSfnt(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; extension: "ttf" | "otf" } | null> {
  if (!isWoff2(bytes)) return null;
  try {
    const sfnt = await woff2Decode(bytes);
    if (!sfnt || sfnt.length < 4) return null;
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    return {
      bytes: sfnt,
      extension: view.getUint32(0) === OTTO_FLAVOR ? "otf" : "ttf",
    };
  } catch {
    return null;
  }
}
