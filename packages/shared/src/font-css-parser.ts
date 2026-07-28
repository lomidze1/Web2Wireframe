/**
 * Pure CSS @font-face parser for font extraction.
 *
 * Parses raw CSS text to extract @font-face rules with all metadata.
 * Single source of truth — used by Browser_Extension, Plugin_Frontend, and Plugin_Backend.
 */

import type { ExtractedFont } from "./types";

// Re-export ParsedFontFace as alias of ExtractedFont for backward compatibility
export type ParsedFontFace = ExtractedFont;

// ============================================================================
// resolveRelativeUrl
// ============================================================================

/**
 * Resolve a relative URL against a base URL.
 * Returns the original URL if resolution fails or URL is already absolute.
 */
export function resolveRelativeUrl(relativeUrl: string, baseUrl: string): string {
  if (!relativeUrl || !baseUrl) return relativeUrl;
  // Already absolute
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  // Data URI — leave as-is
  if (relativeUrl.startsWith("data:")) return relativeUrl;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

// ============================================================================
// parseFontFaceRules
// ============================================================================

/**
 * Index of the last `src:` declaration inside an @font-face block, or 0 when
 * there is none. Only counts a `src:` that starts a declaration (block start or
 * after a `;`), so one sitting inside a url() can't be mistaken for one.
 */
function lastSrcDeclIndex(block: string): number {
  let last = 0;
  // `replace` is only a vehicle for the offsets here — the result is discarded.
  block.replace(/(?:^|;)\s*src\s*:/gi, (match: string, offset: number) => {
    last = offset;
    return match;
  });
  return last;
}

/**
 * The full value of the first `src:` declaration in `scope` — everything up
 * to the semicolon that TERMINATES the declaration, tracked with a paren
 * counter so semicolons inside url(...) (data URIs: `data:font/woff2;base64,…`)
 * don't cut the value short.
 *
 * Replaces a regex whose lazy `[^;]*?` never expanded once the first url()
 * satisfied the match: a last-src that STARTS with url() (telex.ge's
 * bulletproof icon fonts) lost every format after the first — leaving the
 * face holding only the dead EOT#iefix URL, so the binding loop had one
 * candidate and the fonts ZIP shipped uninstallable bytes. Values starting
 * with local() took the loose fallback branch and kept the full list, which
 * is why apple.com never surfaced the bug.
 */
function extractSrcValue(scope: string): string {
  const start = scope.match(/src\s*:/i);
  if (!start || start.index === undefined) return "";
  let depth = 0;
  const from = start.index + start[0].length;
  for (let i = from; i < scope.length; i++) {
    const c = scope[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) return scope.slice(from, i).trim();
  }
  return scope.slice(from).trim();
}

/**
 * Parse all @font-face blocks from raw CSS text.
 * Returns one entry per @font-face block (preserves all weight/style variants).
 */
export function parseFontFaceRules(cssText: string, sourceURL: string): ExtractedFont[] {
  if (!cssText) return [];

  const results: ExtractedFont[] = [];
  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/g;
  let match;

  while ((match = fontFaceRegex.exec(cssText)) !== null) {
    const block = match[1];

    // Extract font-family
    const familyMatch = block.match(/font-family\s*:\s*(['"]?)([^;'"]+)\1\s*;?/i);
    if (!familyMatch) continue;
    const family = familyMatch[2].trim();

    // Extract font-style
    const styleMatch = block.match(/font-style\s*:\s*([^;]+);?/i);
    const style = styleMatch ? styleMatch[1].trim() : "normal";

    // Extract font-weight
    const weightMatch = block.match(/font-weight\s*:\s*([^;]+);?/i);
    const weight = weightMatch ? weightMatch[1].trim() : "400";

    // Extract src. A @font-face may carry SEVERAL `src:` declarations — the
    // "bulletproof" pattern names an IE-only `src: url(...eot)` first and the
    // real formats second. CSS applies the LAST declaration, so scope the
    // search to it: reading the first leaves such a face holding nothing but a
    // dead EOT URL. apple.com declares SF Pro Text Regular (and only Regular)
    // this way, which is why that one cut never reached the font download
    // while every single-src cut did.
    const srcScope = block.slice(lastSrcDeclIndex(block));
    const rawSrc = extractSrcValue(srcScope);

    // Resolve relative URLs in src
    // url() can contain quotes or not; data URIs use base64 with special chars
    const resolvedSrc = rawSrc.replace(
      /url\(\s*(['"]?)([^'")\s]+|data:[^)]+)\1\s*\)/g,
      (_full, _quote, url) => {
        const resolved = resolveRelativeUrl(url, sourceURL);
        return `url(${resolved})`;
      }
    );

    // Detect format from src
    let format = "unknown";
    if (resolvedSrc.includes(".woff2")) format = "woff2";
    else if (resolvedSrc.includes(".woff")) format = "woff";
    else if (resolvedSrc.includes(".ttf")) format = "truetype";
    else if (resolvedSrc.includes(".otf")) format = "opentype";

    // Check if Google Font
    const isGoogleFont =
      resolvedSrc.includes("fonts.gstatic.com") ||
      resolvedSrc.includes("fonts.googleapis.com");

    results.push({ family, style, weight, src: resolvedSrc, format, isGoogleFont, sourceURL });
  }

  return results;
}

// ============================================================================
// deduplicateFonts
// ============================================================================

/**
 * Deduplicate by family+weight+style combo (true duplicates only).
 * Different weights/styles of the same family are preserved.
 */
export function deduplicateFonts(fonts: ExtractedFont[]): ExtractedFont[] {
  const seen = new Set<string>();
  return fonts.filter((f) => {
    const key = `${f.family.toLowerCase()}|${f.weight}|${f.style}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
