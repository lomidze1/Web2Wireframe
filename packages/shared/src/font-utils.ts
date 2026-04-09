/**
 * Font utility functions for variable font parsing and obfuscated font detection.
 *
 * Key insights from html.to.design analysis:
 * - Variable fonts encode axis values as hex suffixes in postScriptName
 *   e.g., "SourceSans3VF-ExtraLight_wght1E00000" → wght = 0x1E00000
 * - Obfuscated fonts have non-printable familyName chars or hex-pattern postScriptName
 * - Weight can be derived from familyName keywords (Bold→700, Light→300, etc.)
 */

import type { PlatformFontInfo } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface VariableFontAxes {
  wght?: number;
  wdth?: number;
  ital?: number;
  slnt?: number;
  opsz?: number;
  [axis: string]: number | undefined;
}

// ============================================================================
// Variable Font Axis Parsing
// ============================================================================

/**
 * Pattern: `FontName_axisHEXVALUE` or `FontName_axis1HEX_axis2HEX`
 * Each axis tag is 4 chars (wght, wdth, ital, slnt, opsz) followed by hex digits.
 */
const AXIS_SUFFIX_PATTERN = /_([a-zA-Z]{3,4})([0-9a-fA-F]+)/g;

/**
 * Parse variable font axis values from a postScriptName.
 *
 * Variable fonts encode axis values as hex suffixes:
 * - "SourceSans3VF-ExtraLight_wght1E00000" → { wght: 0x1E00000 }
 * - "SomeFont_wght19000000_wdth0064" → { wght: 0x19000000, wdth: 0x0064 }
 *
 * Returns null if no axis suffixes are found.
 */
export function parseVariableFontAxes(postScriptName: string): VariableFontAxes | null {
  if (!postScriptName) return null;

  const axes: VariableFontAxes = {};
  let found = false;

  // Reset lastIndex for global regex
  AXIS_SUFFIX_PATTERN.lastIndex = 0;

  let match;
  while ((match = AXIS_SUFFIX_PATTERN.exec(postScriptName)) !== null) {
    const tag = match[1].toLowerCase();
    const hexValue = parseInt(match[2], 16);
    if (!isNaN(hexValue)) {
      axes[tag] = hexValue;
      found = true;
    }
  }

  return found ? axes : null;
}

/**
 * Check if a postScriptName indicates a variable font (has axis suffixes).
 */
export function isVariableFont(postScriptName: string): boolean {
  return parseVariableFontAxes(postScriptName) !== null;
}

// ============================================================================
// Weight from hex axis value
// ============================================================================

/**
 * Convert a variable font wght axis hex value to a CSS font-weight.
 *
 * Variable font weight values are encoded as fixed-point hex numbers.
 * The encoding uses a 16.16 fixed-point format where the integer part
 * represents the weight value. We try multiple interpretations to find
 * a valid CSS weight (100-900 range).
 */
function weightFromHex(hexValue: number): number | null {
  // Try direct value first (some fonts encode weight directly)
  if (hexValue >= 100 && hexValue <= 900) {
    return Math.round(hexValue / 100) * 100;
  }

  // 16.16 fixed-point: shift right by 16 bits
  const fixed16 = hexValue >>> 16;
  if (fixed16 >= 100 && fixed16 <= 900) {
    return Math.round(fixed16 / 100) * 100;
  }

  // 20.12 fixed-point (some fonts use this)
  const fixed12 = hexValue >>> 12;
  if (fixed12 >= 100 && fixed12 <= 900) {
    return Math.round(fixed12 / 100) * 100;
  }

  // Try right-shifting by various amounts to find a valid weight
  for (const shift of [8, 4, 20, 24]) {
    const val = hexValue >>> shift;
    if (val >= 100 && val <= 900) {
      return Math.round(val / 100) * 100;
    }
  }

  return null;
}

// ============================================================================
// Weight from familyName keywords
// ============================================================================

/**
 * Keyword → CSS font-weight mapping.
 * Ordered by specificity (longer/more specific matches first).
 */
const WEIGHT_KEYWORDS: Array<[RegExp, number]> = [
  [/\bextra\s*light\b/i, 200],
  [/\bultra\s*light\b/i, 200],
  [/\bextra\s*bold\b/i, 800],
  [/\bultra\s*bold\b/i, 800],
  [/\bsemi\s*bold\b/i, 600],
  [/\bdemi\s*bold\b/i, 600],
  [/\bthin\b/i, 100],
  [/\bhairline\b/i, 100],
  [/\blight\b/i, 300],
  [/\bmedium\b/i, 500],
  [/\bbold\b/i, 700],
  [/\bheavy\b/i, 900],
  [/\bblack\b/i, 900],
];

/**
 * Derive font weight from a familyName using keyword matching.
 *
 * Examples:
 * - "SourceSans3VF-ExtraLight" → 200
 * - "Averta Std Semibold" → 600
 * - "Roboto Bold" → 700
 *
 * Returns null if no weight keyword is found or if the name indicates "Regular".
 */
export function weightFromFamilyName(familyName: string): number | null {
  if (!familyName) return null;

  // "Regular" explicitly means 400 — we return null since 400 is the default
  // and we don't want to override computed styles unnecessarily
  if (/\bregular\b/i.test(familyName)) return null;

  for (const [pattern, weight] of WEIGHT_KEYWORDS) {
    if (pattern.test(familyName)) {
      return weight;
    }
  }

  return null;
}

// ============================================================================
// Derive weight from PlatformFontInfo
// ============================================================================

/**
 * Derive font weight from a platform font entry.
 *
 * Priority:
 * 1. Variable font axis hex value from postScriptName
 * 2. Keyword matching from familyName
 *
 * Returns null if weight cannot be determined.
 */
export function deriveWeightFromPlatformFont(font: PlatformFontInfo): number | null {
  // 1. Try variable font axis parsing
  const axes = parseVariableFontAxes(font.postScriptName);
  if (axes?.wght != null) {
    const hexWeight = weightFromHex(axes.wght);
    if (hexWeight !== null) return hexWeight;
  }

  // 2. Try keyword matching from familyName
  const keywordWeight = weightFromFamilyName(font.familyName);
  if (keywordWeight !== null) return keywordWeight;

  // 3. Try keyword matching from postScriptName (often has weight in name)
  const psWeight = weightFromFamilyName(font.postScriptName);
  if (psWeight !== null) return psWeight;

  return null;
}

// ============================================================================
// Obfuscated Font Detection
// ============================================================================

/**
 * Detect obfuscated/scrambled fonts.
 *
 * Some sites (e.g., paulstamatiou.com) use font obfuscation where:
 * - familyName contains non-printable characters (< 0x20 or 0x7F)
 * - postScriptName matches pattern: "font" + 16 hex chars
 *
 * These fonts should fall back to matched CSS rules or computed styles.
 */
export function isObfuscatedFont(font: PlatformFontInfo): boolean {
  // Check for non-printable characters in familyName
  if (font.familyName) {
    for (let i = 0; i < font.familyName.length; i++) {
      const code = font.familyName.charCodeAt(i);
      if (code < 0x20 || code === 0x7F) {
        return true;
      }
    }
  }

  // Check for hex-pattern postScriptName: "font" + 16 hex chars
  if (font.postScriptName && /^font[0-9a-f]{16}$/i.test(font.postScriptName)) {
    return true;
  }

  // Empty familyName is suspicious
  if (!font.familyName || font.familyName.trim().length === 0) {
    return true;
  }

  return false;
}
