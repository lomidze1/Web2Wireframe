/**
 * Font payload normalization.
 *
 * Web fonts the page served are almost always `.woff2` — a brotli-compressed
 * SFNT (TTF/OTF) payload. macOS Font Book and the Windows font installer
 * reject `.woff`/`.woff2` outright, so the .zip we ship for the
 * "Use original fonts" workflow has to contain TTF/OTF bytes.
 *
 * `normalizeFontPayload` peeks at the magic header, decompresses WOFF2 in
 * place via the pure-JS `wawoff2`, and reports back what the caller now
 * holds (TTF / OTF / unchanged). Decompression failures are non-fatal — we
 * pass the original buffer back so the user is no worse off than before.
 */

import wawoff2 from "wawoff2";
import { parseFontNames, type FontNames } from "./parseFontName.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FontFormat = "truetype" | "opentype" | "woff2" | "woff" | "unknown";

export interface FontPayload {
  /** Bytes ready to drop into the ZIP. After successful WOFF2 decompression
   *  this is the underlying SFNT buffer; otherwise it's the input as-is. */
  buffer: Buffer;
  /** MIME type that matches `buffer`. */
  mimeType: string;
  /** Format discriminator the plugin maps to a file extension. */
  format: FontFormat;
  /** Real font names extracted from the SFNT `name` table when available.
   *  Empty for WOFF1 / unknown / non-SFNT inputs — caller falls back to
   *  CSS-declared names in that case. */
  names: FontNames;
}

// ---------------------------------------------------------------------------
// Magic header detection
// ---------------------------------------------------------------------------

/** SFNT v1 (TrueType) — most common .ttf magic. */
const SFNT_V1: ReadonlyArray<number> = [0x00, 0x01, 0x00, 0x00];

/** Read the first 4 bytes as ASCII; returns "" if buffer is too short. */
function readTag(buf: Buffer): string {
  if (buf.length < 4) return "";
  return buf.subarray(0, 4).toString("latin1");
}

/** Match SFNT v1 ([0x00, 0x01, 0x00, 0x00]) byte-wise. */
function isSfntV1(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  for (let i = 0; i < 4; i++) {
    if (buf[i] !== SFNT_V1[i]) return false;
  }
  return true;
}

/** Inspect a font buffer and decide what flavor of SFNT it carries.
 *
 *  Returns `"truetype" | "opentype"` for installable formats,
 *  `"woff2" | "woff"` for compressed wrappers we recognise but didn't
 *  decompress here, and `"unknown"` for anything else. */
function detectFormat(buf: Buffer): FontFormat {
  if (isSfntV1(buf)) return "truetype";
  const tag = readTag(buf);
  if (tag === "true") return "truetype";        // mac TrueType variant
  if (tag === "OTTO") return "opentype";
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  return "unknown";
}

/** Pick a MIME type that matches a known format; falls back to URL extension
 *  when the format is unknown so we still produce a sensible header. */
function mimeForFormat(format: FontFormat, urlHint?: string): string {
  switch (format) {
    case "truetype":
      return "font/ttf";
    case "opentype":
      return "font/otf";
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    default: {
      // Last-resort guess from URL extension. Useful when an upstream
      // strips the magic (e.g. partial-content responses).
      const lower = (urlHint ?? "").toLowerCase().split("?")[0];
      if (lower.endsWith(".ttf")) return "font/ttf";
      if (lower.endsWith(".otf")) return "font/otf";
      if (lower.endsWith(".woff2")) return "font/woff2";
      if (lower.endsWith(".woff")) return "font/woff";
      return "application/octet-stream";
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a font binary into something installable on macOS / Windows.
 *
 * @param input    Captured font bytes (typically from a network response or
 *                 `Page.getResourceContent`).
 * @param urlHint  Optional source URL — used only as a last-ditch MIME hint
 *                 when the magic doesn't identify the format.
 */
export async function normalizeFontPayload(
  input: Buffer,
  urlHint?: string,
): Promise<FontPayload> {
  const initial = detectFormat(input);

  // Already installable formats: parse the name table directly. WOFF1 /
  // unknown buffers don't expose an SFNT name table at the top level — we
  // skip parsing and ship empty `names`, callers fall back to CSS names.
  if (initial === "truetype" || initial === "opentype") {
    return {
      buffer: input,
      mimeType: mimeForFormat(initial, urlHint),
      format: initial,
      names: parseFontNames(input),
    };
  }
  if (initial === "woff" || initial === "unknown") {
    return {
      buffer: input,
      mimeType: mimeForFormat(initial, urlHint),
      format: initial,
      names: {},
    };
  }

  // initial === "woff2" — try to decompress to the underlying SFNT, then
  // read the name table from the decompressed bytes.
  try {
    const decompressed = await wawoff2.decompress(input);
    const decompressedBuf = Buffer.from(decompressed);
    const innerFormat = detectFormat(decompressedBuf);
    const names =
      innerFormat === "truetype" || innerFormat === "opentype"
        ? parseFontNames(decompressedBuf)
        : {};
    return {
      buffer: decompressedBuf,
      mimeType: mimeForFormat(innerFormat, urlHint),
      format: innerFormat,
      names,
    };
  } catch {
    // Decompression failed (corrupt stream, partial download, ...). Hand
    // back the original WOFF2 so the caller still has *something* to ship —
    // worst case the user can't install it and we report "still missing"
    // in the rebind flow, exactly like the pre-decompression status quo.
    return {
      buffer: input,
      mimeType: "font/woff2",
      format: "woff2",
      names: {},
    };
  }
}
