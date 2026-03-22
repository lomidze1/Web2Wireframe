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
  "font awesome", "fontawesome",
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
 * Returns { available, missing } arrays.
 */
export async function checkFontsAvailability(
  allFonts: Set<string>
): Promise<{ available: string[]; missing: string[] }> {
  const available: string[] = [];
  const missing: string[] = [];

  for (const font of Array.from(allFonts)) {
    // Skip CSS generic keywords
    if (CSS_GENERIC_FONTS.has(font)) {
      continue;
    }

    try {
      await figma.loadFontAsync({ family: font, style: "Regular" });
      available.push(font);
    } catch {
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
    // Skip icon fonts — they must keep their original font for glyphs to render
    if (isIconFont(font)) continue;

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
 * Parse font download URLs from CSS @font-face `src` declaration.
 * Ignores data URIs, returns only http/https URLs.
 */
export function parseFontSrcUrls(src: string): string[] {
  const urls: string[] = [];
  const regex = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/g;
  let match;
  while ((match = regex.exec(src)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}
