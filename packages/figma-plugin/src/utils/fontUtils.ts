/**
 * Font utility functions for Level 2 multi-font resolution.
 *
 * Extracted from main.ts to enable:
 * - Checking ALL fonts across all frames (not just root font)
 * - Building multi-font mapping for popup
 * - Smart default mapping (serif→Georgia, mono→Courier, etc.)
 */

import type { WireframeNode, FontMapping } from "../types";

// ============================================================================
// Icon Font Detection
// ============================================================================

/** Known icon font name patterns (lowercase). Must stay in sync with shared-extraction. */
const ICON_FONT_PATTERNS = [
  "font awesome", "fontawesome", "fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-thin",
  "material icons", "material symbols",
  "bootstrap-icons", "remixicon", "icomoon", "ionicons",
  "boxicons", "phosphor", "tabler-icons", "lucide",
  "typicons", "linearicons", "simple-line-icons", "feather",
];

/**
 * Check if a font family is an icon font (Font Awesome, Material Icons, etc.).
 * Icon fonts must NOT be remapped to the plugin font — their glyphs are
 * Unicode codepoints that only render correctly with the original font.
 */
export function isIconFont(fontFamily: string): boolean {
  if (!fontFamily) return false;
  const lower = fontFamily.toLowerCase().replace(/['"]/g, "").trim();
  return ICON_FONT_PATTERNS.some(pattern => lower.includes(pattern));
}

// ============================================================================
// Font Style Suffix Stripping
// ============================================================================

/**
 * Common font style suffixes that CDP sometimes appends to family names.
 * e.g., "Font Awesome 6 Brands Regular" → family "Font Awesome 6 Brands" + style "Regular"
 * Ordered longest-first to avoid partial matches (e.g., "ExtraBold" before "Bold").
 */
const FONT_STYLE_SUFFIXES = [
  "ExtraBold", "SemiBold", "ExtraLight", "UltraLight", "UltraBold",
  "Regular", "Solid", "Light", "Thin", "Medium", "Bold", "Black",
  "Italic", "Heavy", "Normal",
];

/**
 * Strip a style suffix from a font family name.
 * CDP's CSS.getPlatformFontsForNode sometimes returns "Font Awesome 6 Brands Regular"
 * instead of family "Font Awesome 6 Brands" + style "Regular".
 *
 * Returns null if no suffix found.
 */
export function stripFontStyleSuffix(family: string): { family: string; style: string } | null {
  if (!family) return null;
  for (const suffix of FONT_STYLE_SUFFIXES) {
    if (family.endsWith(" " + suffix)) {
      const stripped = family.slice(0, -(suffix.length + 1)).trim();
      if (stripped.length > 0) {
        return { family: stripped, style: suffix };
      }
    }
  }
  return null;
}

// ============================================================================
// CSS Generic Font Keywords
// ============================================================================

/** CSS generic font families that should NOT be checked against Figma */
export const CSS_GENERIC_FONTS: ReadonlySet<string> = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

/** CSS keywords that are not valid font names */
const CSS_FONT_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

/**
 * Check if a font name is valid (not a CSS keyword, variable, or junk value).
 * Filters out:
 * - CSS variables: var(--font-sans)
 * - CSS keywords: inherit, initial, unset
 * - CSS generic families: serif, sans-serif, etc.
 */
export function isValidFontName(font: string): boolean {
  if (!font || font.length === 0) return false;
  if (font.startsWith("var(")) return false;
  if (CSS_FONT_KEYWORDS.has(font.toLowerCase())) return false;
  if (CSS_GENERIC_FONTS.has(font.toLowerCase())) return false;
  return true;
}

// ============================================================================
// collectAllFonts
// ============================================================================

/**
 * Walk all frames' trees to collect unique font families.
 * Includes fonts from node.fontFamily and styledSegments.
 */
export function collectAllFonts(
  frames: Array<{ viewport?: { width: number; height: number }; tree: WireframeNode }>
): Set<string> {
  const fonts = new Set<string>();

  function walkNode(node: WireframeNode): void {
    if (node.fontFamily && isValidFontName(node.fontFamily)) {
      fonts.add(node.fontFamily);
    }
    if (node.styledSegments) {
      for (const seg of node.styledSegments) {
        if (seg.fontFamily && isValidFontName(seg.fontFamily)) {
          fonts.add(seg.fontFamily);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        walkNode(child);
      }
    }
  }

  for (const frame of frames) {
    if (frame.tree) {
      walkNode(frame.tree);
    }
  }

  return fonts;
}

// ============================================================================
// checkFontsAvailability
// ============================================================================

/**
 * Check each font against Figma's loadFontAsync.
 * Filters out CSS generic keywords before checking.
 * For icon fonts, tries extra styles (Solid, Brands, etc.) and suffix stripping.
 * Returns { available, missing } arrays.
 */
export async function checkFontsAvailability(
  allFonts: Set<string>
): Promise<{ available: string[]; missing: string[] }> {
  const available: string[] = [];
  const missing: string[] = [];

  // Try multiple styles — some fonts only have Bold/Medium/Light, not Regular
  const stylesToTry = ["Regular", "Bold", "Medium", "Light", "Normal"];
  // Icon fonts use extra styles like "Solid", "Brands"
  const iconStylesExtra = ["Solid", "Brands", "Thin"];

  // Set of every installed family name, used as a final check for fonts whose
  // ONLY cut is a non-standard style name the ladder above never names — e.g.
  // Söhne installs as "Copyright Klim Type Foundry" with the single style
  // "Buch". Without this, such an installed font is wrongly reported missing.
  let installedFamilies = new Set<string>();
  try {
    if (typeof figma.listAvailableFontsAsync === "function") {
      const avail = await figma.listAvailableFontsAsync();
      installedFamilies = new Set(avail.map((f) => f.fontName.family));
    }
  } catch {
    /* font list unavailable — rely on the style-ladder checks below */
  }

  for (const font of Array.from(allFonts)) {
    // Skip CSS generic keywords
    if (CSS_GENERIC_FONTS.has(font)) {
      continue;
    }

    const isIcon = isIconFont(font);
    const styles = isIcon ? [...stylesToTry, ...iconStylesExtra] : stylesToTry;

    let isAvailable = false;
    for (const style of styles) {
      try {
        await figma.loadFontAsync({ family: font, style });
        isAvailable = true;
        break;
      } catch {
        // Try next style
      }
    }

    // If not found, try suffix stripping (e.g., "Font Awesome 6 Brands Regular" → "Font Awesome 6 Brands")
    if (!isAvailable) {
      const stripped = stripFontStyleSuffix(font);
      if (stripped) {
        const strippedStyles = isIcon ? [stripped.style, ...styles] : [stripped.style, ...stylesToTry];
        for (const style of strippedStyles) {
          try {
            await figma.loadFontAsync({ family: stripped.family, style });
            isAvailable = true;
            break;
          } catch { /* try next */ }
        }
      }
    }

    // If still not found and icon font, try version variants (v6→v5, v5→v6)
    if (!isAvailable && isIcon) {
      const vMatch = font.match(/^(.+?)(\d+)(.+)$/);
      if (vMatch) {
        const [, prefix, version, suffix] = vMatch;
        const altVersions = version === "6" ? ["5"] : version === "5" ? ["6"] : [];
        for (const v of altVersions) {
          const altFamily = `${prefix}${v}${suffix}`;
          for (const style of styles) {
            try {
              await figma.loadFontAsync({ family: altFamily, style });
              isAvailable = true;
              break;
            } catch { /* try next */ }
          }
          if (isAvailable) break;
        }
      }
    }

    // Final check: the family is installed, but only under a style name none
    // of the ladders tried (e.g. Söhne's "Buch"). Presence in the installed
    // list is enough — the rebind step resolves the exact cut later.
    if (!isAvailable && installedFamilies.has(font)) {
      isAvailable = true;
    }

    if (isAvailable) {
      available.push(font);
    } else {
      missing.push(font);
    }
  }

  return { available, missing };
}

// ============================================================================
// buildDefaultFontMapping
// ============================================================================

/**
 * Create smart default mapping for missing fonts.
 * - Font name contains "serif" (not "sans") → Georgia
 * - Font name contains "mono" → Courier
 * - Otherwise → pluginFont
 */
export function buildDefaultFontMapping(
  missingFonts: string[],
  pluginFont: string
): FontMapping {
  const mapping: FontMapping = {};

  for (const font of missingFonts) {
    // Icon fonts: identity mapping — preserve original font for Unicode glyphs
    if (isIconFont(font)) {
      mapping[font] = font;
      continue;
    }

    const lower = font.toLowerCase();
    if (lower.includes("mono")) {
      mapping[font] = "Courier";
    } else if (lower.includes("serif") && !lower.includes("sans")) {
      mapping[font] = "Georgia";
    } else {
      mapping[font] = pluginFont;
    }
  }

  return mapping;
}

// ============================================================================
// buildFontsNotAvailableMessage
// ============================================================================

/**
 * Build the `fonts-not-available` message to send from sandbox to UI.
 */
export function buildFontsNotAvailableMessage(
  missingFonts: string[],
  pluginFont: string,
  pluginFontOptions: string[]
): {
  type: "fonts-not-available";
  data: {
    missingFonts: string[];
    defaultMapping: FontMapping;
    pluginFont: string;
    pluginFontOptions: string[];
  };
} {
  const defaultMapping = buildDefaultFontMapping(missingFonts, pluginFont);

  return {
    type: "fonts-not-available",
    data: {
      missingFonts,
      defaultMapping,
      pluginFont,
      pluginFontOptions,
    },
  };
}

// ============================================================================
// buildPluginModeFontMapping
// ============================================================================

/**
 * For plugin mode: map ALL website fonts to the single pluginFont.
 * Excludes CSS generic keywords.
 */
export function buildPluginModeFontMapping(
  allFonts: Set<string>,
  pluginFont: string
): FontMapping {
  const mapping: FontMapping = {};

  for (const font of Array.from(allFonts)) {
    // Skip CSS generic keywords and icon fonts
    if (!CSS_GENERIC_FONTS.has(font) && !isIconFont(font)) {
      mapping[font] = pluginFont;
    }
  }

  return mapping;
}

// ============================================================================
// parseFontSrcUrls
// ============================================================================

/**
 * Parse font download URLs from a CSS-like `src` declaration.
 * Handles two shapes that show up in practice:
 *   1. Standard CSS:        `url('https://...woff2') format('woff2')`
 *   2. W2W API cleanSrc:    `https://...woff2` (the `url(...)` wrapper is
 *                           stripped by the backend before sending)
 * Ignores data URIs and relative paths — only absolute http/https URLs.
 */
export function parseFontSrcUrls(src: string): string[] {
  const urls: string[] = [];

  // Pass 1: url('...')-wrapped form
  const wrappedRegex = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/g;
  let match: RegExpExecArray | null;
  while ((match = wrappedRegex.exec(src)) !== null) {
    urls.push(match[1]);
  }

  // Pass 2 (fallback): bare http(s):// URLs anywhere in the string. Only
  // run when no wrapped URLs were found, so we don't double-emit on
  // standard CSS input.
  if (urls.length === 0) {
    const bareRegex = /https?:\/\/[^\s'"),]+/g;
    while ((match = bareRegex.exec(src)) !== null) {
      urls.push(match[0]);
    }
  }

  return urls;
}
