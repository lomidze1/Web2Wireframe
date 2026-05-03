/**
 * Font download utilities for ZIP bundling.
 *
 * - buildFontFileName: generates file names ({family}-{style}-{weight}-100.{ext})
 * - buildFontDownloadEntries: converts FontDownloadInfo[] to downloadable entries
 * - createFontsZipBlob: fetches font files and bundles into a ZIP blob
 */

import JSZip from "jszip";
import type { FontDownloadInfo } from "../ui/components/modalPopup/FontFallbackModal";
import { parseFontSrcUrls } from "./fontUtils";

// ============================================================================
// Types
// ============================================================================

export interface FontDownloadEntry {
  url: string;
  fileName: string;
  family: string;
  /** Pre-extracted font binary as base64 (from browser cache via CDP) */
  fontBase64?: string;
  /** MIME type of the font binary */
  fontMimeType?: string;
}

// ============================================================================
// sanitizeFontFileName
// ============================================================================

/**
 * Convert an arbitrary font family name into a portable ZIP-entry / filesystem
 * fragment. Output is restricted to `[A-Za-z0-9._-]`, has no leading/trailing
 * hyphens, and is capped at 100 characters. Empty / fully-stripped input falls
 * back to `"font"` so the surrounding name template never produces a leading
 * separator.
 *
 * Examples:
 *   "Font Awesome 6 Brands" → "Font-Awesome-6-Brands"
 *   "Шрифт 中文"            → "font"
 *   ""                      → "font"
 */
export function sanitizeFontFileName(family: string): string {
  const cleaned = family
    // Replace anything outside the safe set with a hyphen…
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    // …then collapse and trim leading/trailing hyphens.
    .replace(/^-+|-+$/g, "");

  if (cleaned.length === 0) return "font";
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned;
}

// ============================================================================
// buildFontFileName
// ============================================================================

/**
 * Generate a font file name:
 * {family}-{style}-{weight}-100.{ext}
 *
 * Family is sanitized via {@link sanitizeFontFileName} so the resulting ZIP
 * entry is safe on Windows and unicode-naive extractors.
 */
export function buildFontFileName(
  family: string,
  style: string = "normal",
  weight: string = "400",
  format: string = "truetype"
): string {
  const ext =
    format === "woff2"
      ? ".woff2"
      : format === "woff"
        ? ".woff"
        : format === "opentype"
          ? ".otf"
          : ".ttf";
  return `${sanitizeFontFileName(family)}-${style}-${weight}-100${ext}`;
}

// ============================================================================
// guessFormatFromUrl
// ============================================================================

/** Infer font format from URL extension */
export function guessFormatFromUrl(url: string): string {
  if (url.includes(".woff2")) return "woff2";
  if (url.includes(".woff")) return "woff";
  if (url.includes(".otf")) return "opentype";
  return "truetype";
}

// ============================================================================
// isEotUrl
// ============================================================================

/** Detect Embedded OpenType (EOT) URLs. EOT is an IE-only legacy format that
 *  Figma can't load and macOS Font Book refuses to install, so we exclude it
 *  from the download bundle entirely. */
export function isEotUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".eot") || lower.includes("format=eot");
}

// ============================================================================
// buildFontDownloadEntries
// ============================================================================

/**
 * Metadata for an extracted font, accepting either shape that the plugin
 * receives in practice:
 *   - browser-extension `ExtractedFont`: { family,     style,     weight }
 *   - API W2W `W2WFontEntry`:           { fontFamily, fontStyle, fontWeight }
 * `family`/`style`/`weight` are read with the alternate-shape fallback.
 */
type FontMetadata = {
  family?: string;
  fontFamily?: string;
  style?: string;
  fontStyle?: string;
  weight?: string;
  fontWeight?: string;
  format?: string;
  src?: string;
  fontBase64?: string;
  fontMimeType?: string;
  /** Real family name read from the SFNT `name` table on the server. When
   *  set, takes priority over the CSS-declared family for ZIP filenames so
   *  anti-piracy-aliased fonts surface their actual name (e.g. "Averta Std"
   *  rather than "PSA"). */
  realFamily?: string;
  /** Real subfamily / style — composed into the filename when present. */
  realSubfamily?: string;
};

/**
 * Convert FontDownloadInfo[] to flat list of downloadable entries
 * with proper file names derived from extracted font metadata.
 *
 * Two source shapes coexist (see {@link FontMetadata}); we normalize each
 * field so a single read works on either side.
 */
export function buildFontDownloadEntries(
  downloads: FontDownloadInfo[],
  extractedFonts?: FontMetadata[]
): FontDownloadEntry[] {
  const entries: FontDownloadEntry[] = [];

  for (const dl of downloads) {
    if (dl.urls.length === 0 && !dl.isGoogleFont) continue;

    // Find matching extracted font metadata for style/weight info.
    // Read both shapes; skip entries with no usable family at all.
    const matchingFonts = extractedFonts?.filter((ef) => {
      const efFamily = ef.family || ef.fontFamily;
      if (!efFamily) return false;
      return efFamily.toLowerCase() === dl.family.toLowerCase();
    }) || [];

    if (dl.urls.length > 0) {
      for (let i = 0; i < dl.urls.length; i++) {
        const url = dl.urls[i];

        // Drop EOT entries — Figma & macOS Font Book can't use them, so packaging
        // them would only ship the user a file they can't install.
        if (isEotUrl(url)) {
          continue;
        }

        const meta = matchingFonts[i] || matchingFonts[0];
        const style = meta?.style || meta?.fontStyle || "normal";
        const weight = meta?.weight || meta?.fontWeight || "400";
        const format = meta?.format || guessFormatFromUrl(url);

        // Find the extracted font with matching URL that has base64 data
        const fontWithBinary = matchingFonts.find(
          (ef) => ef.fontBase64 && ef.src?.includes(url)
        ) || (meta?.fontBase64 ? meta : undefined);

        // Prefer real names from the SFNT `name` table when the API supplied
        // them — they're what the OS will list after install, so matching
        // the filename to the real name makes the download self-describing.
        // Fall back to (CSS family, css style, css weight) for fonts the
        // server couldn't decompress / parse.
        const fileName = meta?.realFamily
          ? buildFontFileName(
              meta.realFamily,
              meta.realSubfamily || style,
              weight,
              format,
            )
          : buildFontFileName(dl.family, style, weight, format);

        entries.push({
          url,
          fileName,
          family: dl.family,
          fontBase64: fontWithBinary?.fontBase64,
          fontMimeType: fontWithBinary?.fontMimeType,
        });
      }
    }
  }

  return entries;
}

// ============================================================================
// createFontsZipBlob
// ============================================================================

/** Result of {@link createFontsZipBlob}: ZIP blob plus the list of entries that
 *  could not be packaged (CORS failures, invalid base64, fetch errors, …).
 *  Callers should surface `skippedEntries` to the user instead of silently
 *  delivering an incomplete archive. */
export interface FontsZipResult {
  blob: Blob;
  /** File names of entries that failed to package; safe to display to the user. */
  skippedEntries: string[];
}

/**
 * Bundle font files into a ZIP blob.
 * Prefers pre-extracted base64 binaries (from browser cache, no network needed).
 * Falls back to fetch() if no base64 available.
 *
 * Per-entry failures are collected into `skippedEntries` rather than being
 * swallowed silently, so the UI can warn the user that the ZIP is incomplete.
 *
 * @param onProgress Optional callback invoked with `0 <= percent <= 100` while
 *   JSZip streams the archive. Always finishes with `100`. Useful for showing
 *   a progress label on large ZIPs (e.g. Noto CJK is ~20MB).
 */
export async function createFontsZipBlob(
  entries: FontDownloadEntry[],
  onProgress?: (percent: number) => void
): Promise<FontsZipResult> {
  const zip = new JSZip();
  const skippedEntries: string[] = [];

  for (const entry of entries) {
    try {
      if (entry.fontBase64) {
        // Use pre-extracted binary from browser cache (no network!)
        const binaryString = atob(entry.fontBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        zip.file(entry.fileName, bytes);
      } else {
        // Fallback: try network fetch (may fail in Figma sandbox)
        const resp = await fetch(entry.url);
        if (!resp.ok) {
          skippedEntries.push(entry.fileName);
          continue;
        }
        const data = await resp.arrayBuffer();
        zip.file(entry.fileName, data);
      }
    } catch {
      skippedEntries.push(entry.fileName);
    }
  }

  let lastReported = -1;
  const blob = await zip.generateAsync(
    { type: "blob" },
    onProgress
      ? (metadata: { percent: number }) => {
          // JSZip emits percent as a float; clamp + round to keep callbacks
          // monotonic when the consumer expects integers.
          const pct = Math.max(0, Math.min(100, Math.round(metadata.percent)));
          if (pct > lastReported) {
            lastReported = pct;
            onProgress(pct);
          }
        }
      : undefined
  );

  // Always end at exactly 100 so consumers can rely on the terminal value.
  if (onProgress && lastReported < 100) {
    onProgress(100);
  }

  return { blob, skippedEntries };
}

// ============================================================================
// Build Font Downloads from extracted fonts + missing fonts list
// ============================================================================

/**
 * Build FontDownloadInfo[] from extracted fonts, intended for the
 * "Download fonts (.zip)" button on the font fallback modal.
 *
 * Bundling policy: when the modal has opened (missingFonts > 0) AND the
 * page exposed @font-face entries (extractedFonts > 0), we bundle ALL
 * extracted fonts into the ZIP — *not* just the ones whose declared
 * family name happens to match an entry in `missingFonts`.
 *
 * Why: in real-world captures, the page CSS uses abbreviated chain heads
 * (e.g. "PSA", "PS1", "." on apple.com-style sites) while @font-face
 * rules declare the same fonts under verbose canonical names (e.g.
 * "PrivateSans Apple", "Source Sans 3"). Exact-string matching produced
 * 0 downloads and silently hid the download button. Bundling everything
 * is correct: the user's missing font likely IS one of the entries we
 * pulled from the page, just under a different label, and any extras
 * are still cheap to ship inside one ZIP.
 *
 * Used by all import paths (Web, HTML, BrowserExtension, AreaSelection).
 */
export function buildFontDownloads(
  missingFonts: string[],
  extractedFonts?: unknown[]
): FontDownloadInfo[] | undefined {
  if (!extractedFonts || extractedFonts.length === 0) {
    // [F] buildFontDownloads early exit (no extracted fonts)
    console.log("[W2W-FONT-TRACE] F: buildFontDownloads early exit", {
      missingFontsCount: missingFonts.length,
      extractedFontsLength: extractedFonts?.length ?? 0,
      result: undefined,
    });
    return undefined;
  }

  const downloads: FontDownloadInfo[] = [];

  for (const ef of extractedFonts) {
    // Two shapes coexist in the wild:
    //   - browser-extension capture → ExtractedFont    { family,     src, isGoogleFont }
    //   - API W2W content-script    → W2WFontEntry    { fontFamily, src }            (no isGoogleFont)
    // Normalize both so the rest of the function works on either input.
    const font = ef as {
      family?: string;
      fontFamily?: string;
      src?: string;
      isGoogleFont?: boolean;
    };
    const familyName = font.family || font.fontFamily;
    // Skip entries we couldn't even label (no family) — naming the ZIP
    // entry would be impossible.
    if (!familyName) continue;

    const urls = font.src ? parseFontSrcUrls(font.src) : [];

    // W2WFontEntry doesn't carry isGoogleFont, but Google's font CDN URLs
    // are recognizable from `src`. Fall back to URL-based detection so the
    // "no URLs but isGoogleFont" branch keeps working for both shapes.
    const isGoogleFont =
      font.isGoogleFont === true ||
      (typeof font.src === "string" &&
        (font.src.includes("fonts.googleapis.com") ||
          font.src.includes("fonts.gstatic.com")));

    if (urls.length > 0 || isGoogleFont) {
      // Aggregate URLs across variants (different weights/styles) for same family
      const existing = downloads.find((d) => d.family === familyName);
      if (existing) {
        for (const url of urls) {
          if (!existing.urls.includes(url)) existing.urls.push(url);
        }
      } else {
        downloads.push({
          family: familyName,
          urls,
          isGoogleFont,
        });
      }
    }
  }

  const result = downloads.length > 0 ? downloads : undefined;

  // [F] buildFontDownloads result
  console.log("[W2W-FONT-TRACE] F: buildFontDownloads result", {
    missingFonts,
    extractedFontsLength: extractedFonts.length,
    // Read both shapes (`family` legacy, `fontFamily` W2W API) so the
    // log isn't misleading on the W2W path.
    extractedFontFamilies: extractedFonts
      .map((ef) => {
        const f = ef as { family?: string; fontFamily?: string };
        return f.family || f.fontFamily;
      })
      .filter(Boolean),
    extractedFontSrcSample: extractedFonts
      .slice(0, 3)
      .map((ef) => (ef as { src?: string }).src),
    downloadsCount: downloads.length,
    downloads: downloads.map((d) => ({
      family: d.family,
      urlsCount: d.urls.length,
      isGoogleFont: d.isGoogleFont,
    })),
  });

  return result;
}
