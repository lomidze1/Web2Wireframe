/**
 * Font download utilities for ZIP bundling.
 *
 * - buildFontFileName: generates h2d-style file names ({family}-{style}-{weight}-100.{ext})
 * - buildFontDownloadEntries: converts FontDownloadInfo[] to downloadable entries
 * - createFontsZipBlob: fetches font files and bundles into a ZIP blob
 */

import JSZip from "jszip";
import type { FontDownloadInfo } from "../ui/components/modalPopup/FontFallbackModal";

// ============================================================================
// Types
// ============================================================================

export interface FontDownloadEntry {
  url: string;
  fileName: string;
  family: string;
}

// ============================================================================
// buildFontFileName
// ============================================================================

/**
 * Generate a font file name matching h2d convention:
 * {family}-{style}-{weight}-100.{ext}
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
  return `${family}-${style}-${weight}-100${ext}`;
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
// buildFontDownloadEntries
// ============================================================================

/**
 * Convert FontDownloadInfo[] to flat list of downloadable entries
 * with proper file names derived from extracted font metadata.
 */
export function buildFontDownloadEntries(
  downloads: FontDownloadInfo[],
  extractedFonts?: Array<{ family: string; style?: string; weight?: string; format?: string; src?: string }>
): FontDownloadEntry[] {
  const entries: FontDownloadEntry[] = [];

  for (const dl of downloads) {
    if (dl.urls.length === 0 && !dl.isGoogleFont) continue;

    // Find matching extracted font metadata for style/weight info
    const matchingFonts = extractedFonts?.filter(
      (ef) => ef.family.toLowerCase() === dl.family.toLowerCase()
    ) || [];

    if (dl.urls.length > 0) {
      for (let i = 0; i < dl.urls.length; i++) {
        const url = dl.urls[i];
        const meta = matchingFonts[i] || matchingFonts[0];
        const style = meta?.style || "normal";
        const weight = meta?.weight || "400";
        const format = meta?.format || guessFormatFromUrl(url);
        entries.push({
          url,
          fileName: buildFontFileName(dl.family, style, weight, format),
          family: dl.family,
        });
      }
    }
  }

  return entries;
}

// ============================================================================
// createFontsZipBlob
// ============================================================================

/**
 * Fetch all font files and bundle into a ZIP blob.
 * Skips failed fetches gracefully.
 */
export async function createFontsZipBlob(
  entries: FontDownloadEntry[]
): Promise<Blob> {
  const zip = new JSZip();

  for (const entry of entries) {
    try {
      const resp = await fetch(entry.url);
      if (resp.ok) {
        const data = await resp.arrayBuffer();
        zip.file(entry.fileName, data);
      }
    } catch {
      // Skip failed fetches
    }
  }

  return zip.generateAsync({ type: "blob" });
}
