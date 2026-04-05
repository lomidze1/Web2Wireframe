/**
 * Font download utilities for ZIP bundling.
 *
 * - buildFontFileName: generates h2d-style file names ({family}-{style}-{weight}-100.{ext})
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
  extractedFonts?: Array<{ family: string; style?: string; weight?: string; format?: string; src?: string; fontBase64?: string; fontMimeType?: string }>
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

        // Find the extracted font with matching URL that has base64 data
        const fontWithBinary = matchingFonts.find(
          (ef) => ef.fontBase64 && ef.src?.includes(url)
        ) || (meta?.fontBase64 ? meta : undefined);

        entries.push({
          url,
          fileName: buildFontFileName(dl.family, style, weight, format),
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

/**
 * Bundle font files into a ZIP blob.
 * Prefers pre-extracted base64 binaries (h2d-style, no network needed).
 * Falls back to fetch() if no base64 available.
 */
export async function createFontsZipBlob(
  entries: FontDownloadEntry[]
): Promise<Blob> {
  const zip = new JSZip();

  for (const entry of entries) {
    try {
      if (entry.fontBase64) {
        // h2d-style: use pre-extracted binary from browser cache (no network!)
        const binaryString = atob(entry.fontBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        zip.file(entry.fileName, bytes);
      } else {
        // Fallback: try network fetch (may fail in Figma sandbox)
        const resp = await fetch(entry.url);
        if (resp.ok) {
          const data = await resp.arrayBuffer();
          zip.file(entry.fileName, data);
        }
      }
    } catch {
      // Skip failed entries
    }
  }

  return zip.generateAsync({ type: "blob" });
}

// ============================================================================
// Build Font Downloads from extracted fonts + missing fonts list
// ============================================================================

/**
 * Build FontDownloadInfo[] from extracted fonts, filtered to only missing fonts.
 * Used by all import paths (Web, HTML, BrowserExtension, AreaSelection).
 */
export function buildFontDownloads(
  missingFonts: string[],
  extractedFonts?: unknown[]
): FontDownloadInfo[] | undefined {
  if (!extractedFonts || extractedFonts.length === 0) return undefined;

  const downloads: FontDownloadInfo[] = [];
  const missingSet = new Set(missingFonts.map((f) => f.toLowerCase()));

  for (const ef of extractedFonts) {
    const font = ef as { family?: string; src?: string; isGoogleFont?: boolean };
    if (!font.family || !missingSet.has(font.family.toLowerCase())) continue;

    const urls = font.src ? parseFontSrcUrls(font.src) : [];
    if (urls.length > 0 || font.isGoogleFont) {
      // Aggregate URLs across variants (different weights/styles) for same family
      const existing = downloads.find((d) => d.family === font.family);
      if (existing) {
        for (const url of urls) {
          if (!existing.urls.includes(url)) existing.urls.push(url);
        }
      } else {
        downloads.push({
          family: font.family,
          urls,
          isGoogleFont: font.isGoogleFont || false,
        });
      }
    }
  }

  return downloads.length > 0 ? downloads : undefined;
}
