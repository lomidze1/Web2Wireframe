/**
 * Font download utilities for ZIP bundling.
 *
 * - buildFontFileName: generates file names ({family}-{style}-{weight}-100.{ext})
 * - buildFontDownloadEntries: converts FontDownloadInfo[] to downloadable entries
 * - createFontsZipBlob: fetches font files and bundles into a ZIP blob
 */

import JSZip from "jszip";
import { convertEotToSfnt, isEot } from "./eotToSfnt";
import { convertWoffToSfnt, isWoff } from "./woffToSfnt";
import type { FontDownloadInfo } from "../ui/components/modalPopup/FontFallbackModal";
import { parseFontSrcUrls, type FontCut } from "./fontUtils";

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
  /** Alternate URLs to try (in order) when fetching `url` fails — used for
   *  faces whose declared src was EOT-only, where every candidate is a
   *  derived sibling-format guess that may or may not exist on the server. */
  fallbackUrls?: string[];
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
          : format === "embedded-opentype"
            ? ".eot"
            : ".ttf";
  return `${sanitizeFontFileName(family)}-${style}-${weight}-100${ext}`;
}

// ============================================================================
// guessFormatFromUrl
// ============================================================================

/** Infer font format from URL extension */
export function guessFormatFromUrl(url: string): string {
  if (url.includes(".eot")) return "embedded-opentype";
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
// pickInstallableUrl
// ============================================================================

/**
 * Rank a URL by how useful its file is to the user. The ZIP exists so they
 * can INSTALL the font: Font Book (and Windows) take TTF/OTF and reject WOFF
 * and WOFF2, which are web-delivery wrappers. A face served in all three
 * formats — apple.com serves woff2 + woff + ttf for every cut — should
 * therefore ship its TTF, not three files the user can't tell apart.
 */
function installabilityRank(url: string): number {
  const lower = url.toLowerCase();
  if (lower.includes(".ttf") || lower.includes(".otf") || lower.includes(".ttc")) return 0;
  if (lower.includes(".woff2")) return 1;
  if (lower.includes(".woff")) return 2;
  return 3;
}

/** The most installable of a face's URLs (see {@link installabilityRank}). */
function pickInstallableUrl(urls: string[]): string {
  return urls.reduce((best, url) =>
    installabilityRank(url) < installabilityRank(best) ? url : best,
  );
}

// ============================================================================
// deriveSiblingUrlsFromEot
// ============================================================================

/**
 * Sibling-format candidates derived from an EOT URL, in installability order.
 * TTF/OTF install directly; WOFF converts losslessly (see woffToSfnt); WOFF2
 * needs Brotli so it comes last.
 */
const EOT_SIBLING_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];

/**
 * Derive same-basename sibling-format URLs from an `.eot` URL.
 *
 * The "bulletproof" @font-face pattern declares an IE-only `src: url(*.eot)`
 * FIRST and the real formats in a second `src:` — and the capture side's
 * first-`src:` parser leaves such faces holding nothing but the dead EOT URL
 * (telex.ge: "glyphs", "uni2-icons", "BPG Nino Mtavruli" all ship this way,
 * so the fonts ZIP silently lost them). By that same convention every format
 * lives at the same path with only the extension changed
 * (glyphs.eot?q → glyphs.ttf?q / glyphs.woff?q …), so we can reconstruct the
 * candidates and let the fetch step keep the first one that actually exists.
 *
 * Returns [] when the URL has no rewritable `.eot` (e.g. `format=eot` query
 * flavors) — callers then skip the face as before.
 */
export function deriveSiblingUrlsFromEot(eotUrl: string): string[] {
  if (!/\.eot(?=[?#]|$)/i.test(eotUrl)) return [];
  return EOT_SIBLING_EXTENSIONS.map((ext) =>
    eotUrl.replace(/\.eot(?=[?#]|$)/i, ext),
  );
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
 *
 * Each URL is matched to the @font-face that DECLARES it. The obvious
 * shortcut — walk `dl.urls` and read `extractedFonts[i]` at the same index —
 * silently mislabels everything, because a face contributes one metadata
 * entry but several URLs (apple.com serves woff2 + woff + ttf per cut), and
 * because `dl.urls` may be narrowed to the user's missing cuts while the
 * metadata list is not. That produced ZIPs whose files carried a completely
 * unrelated face's name, weight and format.
 *
 * One file per face, not per URL: the three formats are the same typeface,
 * and only the TTF/OTF is installable (see {@link pickInstallableUrl}).
 */
export function buildFontDownloadEntries(
  downloads: FontDownloadInfo[],
  extractedFonts?: FontMetadata[]
): FontDownloadEntry[] {
  const entries: FontDownloadEntry[] = [];

  // url → the face that declares it. Built once across all families so a URL
  // is always described by its own @font-face.
  const faceByUrl = new Map<string, FontMetadata>();
  for (const ef of extractedFonts || []) {
    if (!(ef.family || ef.fontFamily)) continue; // unlabelled — can't name a file from it
    for (const url of ef.src ? parseFontSrcUrls(ef.src) : []) {
      if (!faceByUrl.has(url)) faceByUrl.set(url, ef);
    }
  }

  for (const dl of downloads) {
    if (dl.urls.length === 0) continue;

    // Group this family's URLs by their owning face. URLs with no known face
    // keep their own group so they still ship, named from the family.
    // EOT URLs participate in grouping (they still identify the face) but are
    // never shipped themselves — see the per-face selection below.
    const urlsByFace = new Map<FontMetadata | string, string[]>();
    for (const url of dl.urls) {
      const key = faceByUrl.get(url) ?? `__orphan:${url}`;
      const group = urlsByFace.get(key);
      if (group) group.push(url);
      else urlsByFace.set(key, [url]);
    }

    // Whether ANY face of this family declared a real (non-EOT) URL. Sibling
    // derivation below only kicks in for families that are EOT-only in their
    // entirety — when a real URL exists elsewhere in the family, deriving
    // more candidates would just duplicate the same files under new names.
    const familyHasRealUrl = dl.urls.some((u) => !isEotUrl(u));

    for (const key of Array.from(urlsByFace.keys())) {
      const meta = typeof key === "string" ? undefined : key;
      const faceUrls = urlsByFace.get(key)!;

      // Figma & macOS Font Book can't use EOT — never ship it. A face left
      // with ONLY an EOT URL (capture read the IE-only first `src:`) gets
      // derived sibling-format candidates instead of being dropped silently;
      // the ZIP fetch keeps the first candidate that actually exists.
      const realUrls = faceUrls.filter((u) => !isEotUrl(u));
      let candidates: string[];
      if (realUrls.length > 0) {
        candidates = [...realUrls].sort(
          (a, b) => installabilityRank(a) - installabilityRank(b),
        );
      } else if (meta?.fontBase64) {
        // EOT-only URL but a cached binary exists — the binary is what ships,
        // keep the URL only as a label source.
        candidates = [faceUrls[0]];
      } else if (!familyHasRealUrl) {
        candidates = deriveSiblingUrlsFromEot(faceUrls[0]);
        if (candidates.length === 0) continue; // nothing shippable for this face
      } else {
        continue; // EOT-only face, but the family ships real files already
      }

      const url = pickInstallableUrl(candidates);
      const fallbackUrls = candidates.filter((c) => c !== url);

      const style = meta?.style || meta?.fontStyle || "normal";
      const weight = meta?.weight || meta?.fontWeight || "400";
      // The extension must describe the BYTES we ship. A pre-extracted binary
      // is whatever format the server grabbed, so it names the file; otherwise
      // we'll fetch `url`, and the URL names it.
      const format = meta?.fontBase64
        ? meta.format || guessFormatFromUrl(url)
        : guessFormatFromUrl(url);

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
        fontBase64: meta?.fontBase64,
        fontMimeType: meta?.fontMimeType,
        ...(fallbackUrls.length > 0 ? { fallbackUrls } : {}),
      });
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
 * Swap a ZIP entry's extension to match the URL the bytes actually came from
 * (a fallback candidate can be a different format than the primary URL).
 */
function renameByUrlFormat(fileName: string, url: string): string {
  const format = guessFormatFromUrl(url);
  const ext =
    format === "woff2" ? ".woff2"
      : format === "woff" ? ".woff"
        : format === "opentype" ? ".otf"
          : format === "embedded-opentype" ? ".eot"
            : ".ttf";
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? fileName + ext : fileName.slice(0, dot) + ext;
}

/** Replace a file name's extension (appending when there is none). */
function withExtension(fileName: string, ext: "ttf" | "otf"): string {
  const dot = fileName.lastIndexOf(".");
  return (dot === -1 ? fileName : fileName.slice(0, dot)) + "." + ext;
}

/**
 * Make the packaged bytes installable where possible — decided by the BYTES,
 * never the file name (cached binaries arrive mislabeled: telex.ge's ZIP
 * shipped EOT bytes under .ttf names, which macOS refused to install).
 *
 * - WOFF v1  → unwrapped to its original SFNT, renamed .ttf/.otf.
 * - EOT      → unwrapped when uncompressed; MTX-compressed EOT can't be
 *              converted and returns null so the caller skips it honestly
 *              instead of shipping a file no OS can install.
 * - SFNT     → shipped as-is, extension corrected to match the flavor.
 * - Anything else (WOFF2/Brotli, unparseable) ships unchanged.
 * Exported for tests.
 */
export function repackageForInstall(
  fileName: string,
  bytes: Uint8Array
): { fileName: string; bytes: Uint8Array } | null {
  if (isWoff(bytes)) {
    const converted = convertWoffToSfnt(bytes);
    if (!converted) return { fileName, bytes };
    return {
      fileName: withExtension(fileName, converted.extension),
      bytes: converted.bytes,
    };
  }

  if (isEot(bytes)) {
    const converted = convertEotToSfnt(bytes);
    if (!converted) return null; // MTX-compressed / malformed — nothing installable
    return {
      fileName: withExtension(fileName, converted.extension),
      bytes: converted.bytes,
    };
  }

  // Raw SFNT: keep the bytes, but make sure the extension tells the truth.
  if (bytes.length >= 4) {
    const flavor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const lower = fileName.toLowerCase();
    if (flavor === 0x4f54544f && !lower.endsWith(".otf")) {
      return { fileName: withExtension(fileName, "otf"), bytes };
    }
    if (
      (flavor === 0x00010000 || flavor === 0x74727565) &&
      !lower.endsWith(".ttf") && !lower.endsWith(".ttc")
    ) {
      return { fileName: withExtension(fileName, "ttf"), bytes };
    }
  }

  return { fileName, bytes };
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
      let bytes: Uint8Array | null = null;
      let fileName = entry.fileName;
      if (entry.fontBase64) {
        // Use pre-extracted binary from browser cache (no network!)
        const binaryString = atob(entry.fontBase64);
        bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } else {
        // Network fetch, walking the fallback candidates (derived
        // sibling-format URLs may 404 individually) until one succeeds.
        for (const candidate of [entry.url, ...(entry.fallbackUrls ?? [])]) {
          try {
            const resp = await fetch(candidate);
            if (!resp.ok) continue;
            bytes = new Uint8Array(await resp.arrayBuffer());
            // The entry was named after `entry.url`'s format; a fallback may
            // be a different one — keep the extension truthful to the bytes.
            if (candidate !== entry.url) {
              fileName = renameByUrlFormat(fileName, candidate);
            }
            break;
          } catch {
            // Try the next candidate.
          }
        }
        if (!bytes) {
          skippedEntries.push(entry.fileName);
          continue;
        }
      }
      const packaged = repackageForInstall(fileName, bytes);
      if (!packaged) {
        // Bytes no OS can install (e.g. MTX-compressed EOT) — skip honestly.
        skippedEntries.push(entry.fileName);
        continue;
      }
      zip.file(packaged.fileName, packaged.bytes);
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
// filterExtractedFontsToCuts
// ============================================================================

/** Named CSS font-weight keywords that @font-face rules use instead of numbers. */
const WEIGHT_KEYWORDS: Record<string, number> = { normal: 400, bold: 700 };

/**
 * Parse an @font-face `font-weight` descriptor into the range it covers.
 * Handles numbers ("300"), keywords ("normal"/"bold") and variable-font
 * ranges ("100 900"). Returns null when unparseable — callers treat that as
 * "covers anything" so an odd descriptor never drops a needed file.
 */
function parseFaceWeightRange(raw: string | undefined): { min: number; max: number } | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (WEIGHT_KEYWORDS[value]) {
    const w = WEIGHT_KEYWORDS[value];
    return { min: w, max: w };
  }
  const nums = value.split(/\s+/).map((p) => parseFloat(p)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/**
 * Narrow the extracted @font-face entries to the files that cover the cuts
 * the user is actually missing.
 *
 * Without this, needing a single SF Pro Text Light meant downloading all 18
 * SF Pro Text faces and hunting for the one that mattered. Families absent
 * from `missingCuts` (i.e. missing in their entirety) keep all their entries.
 *
 * Safety net: if a family's filter matches nothing — unparseable descriptors,
 * or a page that uses a weight it never declared a face for — that family
 * falls back to its full set. An over-complete ZIP is recoverable; an empty
 * one is a dead end.
 */
export function filterExtractedFontsToCuts<T>(
  extractedFonts: T[],
  missingCuts: Record<string, FontCut[]>,
): T[] {
  if (!extractedFonts || extractedFonts.length === 0) return extractedFonts;
  if (Object.keys(missingCuts).length === 0) return extractedFonts;

  // Cut lists are keyed by CSS family; match case-insensitively.
  const cutsByFamily = new Map<string, FontCut[]>();
  for (const [family, cuts] of Object.entries(missingCuts)) {
    cutsByFamily.set(family.toLowerCase().trim(), cuts);
  }

  const matchesACut = (font: FontMetadata, cuts: FontCut[]): boolean => {
    const faceItalic = /italic|oblique/i.test(font.style || font.fontStyle || "");
    const range = parseFaceWeightRange(font.weight || font.fontWeight);
    return cuts.some((cut) => {
      if (cut.italic !== faceItalic) return false;
      if (!range) return true; // unknown weight → assume it covers the cut
      return cut.weight >= range.min && cut.weight <= range.max;
    });
  };

  const kept: T[] = [];
  const droppedByFamily = new Map<string, T[]>();
  const keptFamilies = new Set<string>();

  for (const ef of extractedFonts) {
    const font = ef as FontMetadata;
    const family = (font.family || font.fontFamily || "").toLowerCase().trim();
    const cuts = cutsByFamily.get(family);
    if (!cuts || cuts.length === 0) {
      kept.push(ef); // not a partial family — ship as before
      continue;
    }
    if (matchesACut(font, cuts)) {
      kept.push(ef);
      keptFamilies.add(family);
    } else {
      const list = droppedByFamily.get(family);
      if (list) list.push(ef);
      else droppedByFamily.set(family, [ef]);
    }
  }

  // Restore any family whose filter matched nothing at all.
  for (const family of Array.from(droppedByFamily.keys())) {
    if (!keptFamilies.has(family)) kept.push(...droppedByFamily.get(family)!);
  }

  return kept;
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
  extractedFonts?: unknown[],
  missingCuts?: Record<string, FontCut[]>
): FontDownloadInfo[] | undefined {
  if (!extractedFonts || extractedFonts.length === 0) {
    return undefined;
  }

  // Partially-installed families only need their absent cuts (see
  // filterExtractedFontsToCuts) — everything else ships whole.
  const sourceFonts = missingCuts
    ? filterExtractedFontsToCuts(extractedFonts, missingCuts)
    : extractedFonts;

  const downloads: FontDownloadInfo[] = [];

  for (const ef of sourceFonts) {
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

  // Narrow to only the fonts Figma actually lacks — but ONLY when every
  // missing name maps to a download we built. On normal sites the CSS
  // @font-face name matches `missingFonts` (e.g. "Sohne"), so we can safely
  // drop fonts the user already has (Inter, Newsreader). On anti-piracy sites
  // the CSS chain head ("PSA") never matches the @font-face name
  // ("PrivateSans Apple"); there we can't tell which file covers which missing
  // font, so we fall back to bundling everything rather than risk dropping the
  // one font the user needs.
  const missingSet = new Set(
    missingFonts.map((f) => f.toLowerCase().trim()).filter(Boolean)
  );
  if (missingSet.size > 0) {
    const matched = downloads.filter((d) =>
      missingSet.has(d.family.toLowerCase().trim())
    );
    const accounted = new Set(matched.map((d) => d.family.toLowerCase().trim()));
    const everyMissingAccounted = Array.from(missingSet).every((m) =>
      accounted.has(m)
    );
    if (matched.length > 0 && everyMissingAccounted) {
      return matched;
    }
  }

  return downloads.length > 0 ? downloads : undefined;
}

/**
 * Builds a CSS-family → real-(SFNT)-family map from the extracted @font-face
 * entries. Only includes entries where a distinct real name exists. The sandbox
 * uses this to detect when a "missing" CSS font is actually installed under its
 * anti-piracy-aliased real name (e.g. "Söhne" → "Copyright Klim Type Foundry"),
 * so it can apply it directly instead of opening the fallback modal.
 */
export function buildFontRealNames(
  extractedFonts?: unknown[],
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!extractedFonts) return map;
  for (const ef of extractedFonts) {
    const font = ef as {
      family?: string;
      fontFamily?: string;
      realFamily?: string;
    };
    const css = font.fontFamily || font.family;
    const real = font.realFamily;
    if (css && real && real.trim() && real !== css && !map[css]) {
      map[css] = real;
    }
  }
  return map;
}
