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
    if (node.fontFamily) {
      fonts.add(node.fontFamily);
    }
    if (node.styledSegments) {
      for (const seg of node.styledSegments) {
        if (seg.fontFamily) {
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
    if (!CSS_GENERIC_FONTS.has(font)) {
      mapping[font] = pluginFont;
    }
  }

  return mapping;
}
