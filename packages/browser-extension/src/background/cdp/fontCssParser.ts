/**
 * Pure CSS @font-face parser for font extraction.
 *
 * Parses raw CSS text to extract @font-face rules with all metadata.
 * Duplicated from Plugin_Frontend/src/utils/fontCssParser.ts
 * (cannot import cross-service in monorepo).
 */

import type { ExtractedFont } from "@/shared/types";

// ============================================================================
// resolveRelativeUrl
// ============================================================================

/**
 * Resolve a relative URL against a base URL.
 * Returns the original URL if resolution fails or URL is already absolute.
 */
export function resolveRelativeUrl(relativeUrl: string, baseUrl: string): string {
  if (!relativeUrl || !baseUrl) return relativeUrl;
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
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

    // Extract src — greedy match up to the last closing paren before a semicolon or end of block
    // Need special handling because data URIs contain semicolons
    const srcMatch = block.match(/src\s*:\s*((?:url\([^)]*\)[^;]*?)+);?/i)
      || block.match(/src\s*:\s*([^;]+);?/i);
    const rawSrc = srcMatch ? srcMatch[1].trim() : "";

    // Resolve relative URLs in src
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

    // Extract font-display
    const displayMatch = block.match(/font-display\s*:\s*([^;]+);?/i);
    const fontDisplay = displayMatch ? displayMatch[1].trim() : undefined;

    // Extract font-stretch
    const stretchMatch = block.match(/font-stretch\s*:\s*([^;]+);?/i);
    const fontStretch = stretchMatch ? stretchMatch[1].trim() : undefined;

    // Extract font-variant
    const variantMatch = block.match(/font-variant\s*:\s*([^;]+);?/i);
    const fontVariant = variantMatch ? variantMatch[1].trim() : undefined;

    // Extract unicode-range
    const rangeMatch = block.match(/unicode-range\s*:\s*([^;]+);?/i);
    const unicodeRange = rangeMatch ? rangeMatch[1].trim() : undefined;

    // Parse font-weight range for variable font axes (e.g., "300 700")
    let fontVariationAxes: ExtractedFont["fontVariationAxes"] | undefined;
    if (weight.includes(" ")) {
      const [minStr, maxStr] = weight.split(/\s+/);
      const minVal = parseInt(minStr, 10);
      const maxVal = parseInt(maxStr, 10);
      if (!isNaN(minVal) && !isNaN(maxVal) && minVal !== maxVal) {
        fontVariationAxes = [{
          tag: "wght",
          name: "Weight",
          minValue: minVal,
          maxValue: maxVal,
          defaultValue: minVal,
        }];
      }
    }

    results.push({
      family, style, weight, src: resolvedSrc, format, isGoogleFont,
      fontDisplay, fontStretch, fontVariant, unicodeRange, fontVariationAxes,
    });
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
