/**
 * CSS Grid Template Parser
 *
 * Converts CSS computed grid-template-columns/rows into Figma GridTrackSize[].
 * Handles: fr, px, auto, repeat(), minmax(), fit-content(), named lines.
 *
 * Note: auto-fit/auto-fill are already resolved to fixed tracks in computed
 * styles (e.g., "250px 250px 250px 250px"), so no special handling needed.
 */

// ============================================================================
// Types
// ============================================================================

/** Figma-compatible grid track size */
export interface FigmaGridTrackSize {
  type: "FLEX" | "FIXED";
  value: number;
}

// ============================================================================
// Single Track Value Parser
// ============================================================================

/**
 * Parse a single CSS track value to FigmaGridTrackSize.
 *
 * Handles: "1fr", "200px", "auto", "minmax(...)", "fit-content(...)", bare numbers.
 */
export function parseTrackValue(value: string): FigmaGridTrackSize {
  const trimmed = value.trim();

  // fr units → FLEX
  if (trimmed.endsWith("fr")) {
    const num = parseFloat(trimmed);
    return { type: "FLEX", value: isNaN(num) ? 1 : num };
  }

  // px units → FIXED (Figma requires value > 0 for FIXED tracks)
  if (trimmed.endsWith("px")) {
    const num = parseFloat(trimmed);
    if (isNaN(num) || num <= 0) return { type: "FLEX", value: 1 };
    return { type: "FIXED", value: num };
  }

  // auto → FLEX (fills available space like 1fr)
  if (trimmed === "auto") {
    return { type: "FLEX", value: 1 };
  }

  // minmax(min, max) → use max value
  if (trimmed.startsWith("minmax(")) {
    const inner = trimmed.slice(7, -1); // strip "minmax(" and ")"
    const parts = splitTopLevelCommas(inner);
    if (parts.length >= 2) {
      return parseTrackValue(parts[parts.length - 1].trim());
    }
    return { type: "FLEX", value: 1 };
  }

  // fit-content(Npx) → FIXED with that value
  if (trimmed.startsWith("fit-content(")) {
    const inner = trimmed.slice(12, -1); // strip "fit-content(" and ")"
    if (inner.endsWith("px")) {
      const num = parseFloat(inner);
      return { type: "FIXED", value: isNaN(num) ? 0 : num };
    }
    return { type: "FLEX", value: 1 };
  }

  // Percentage → FLEX fallback (computed styles normally resolve to px)
  if (trimmed.endsWith("%")) {
    return { type: "FLEX", value: 1 };
  }

  // Bare number → FIXED (px implied, must be > 0)
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 0) {
    return { type: "FIXED", value: num };
  }

  // Unknown → FLEX fallback
  return { type: "FLEX", value: 1 };
}

// ============================================================================
// Template Parser
// ============================================================================

/**
 * Parse CSS computed grid-template-columns/rows into Figma GridTrackSize[].
 *
 * @param cssValue - CSS computed value (e.g., "200px 1fr 1fr", "repeat(3, 1fr)")
 * @returns Array of Figma-compatible track sizes
 */
export function parseGridTemplate(cssValue: string): FigmaGridTrackSize[] {
  if (!cssValue || cssValue === "none") return [];

  const trimmed = cssValue.trim();
  if (!trimmed) return [];

  // Expand repeat() functions first
  const expanded = expandRepeats(trimmed);

  // Remove named grid lines [name]
  const withoutNames = expanded.replace(/\[[^\]]*\]/g, "").trim();
  if (!withoutNames) return [];

  // Tokenize: split on whitespace but respect parentheses
  const tokens = tokenize(withoutNames);

  return tokens.map(parseTrackValue);
}

// ============================================================================
// Grid Child Placement Helpers
// ============================================================================

/**
 * Compute grid span from start and end line numbers.
 * CSS uses 1-based line numbers. Returns span count (minimum 1).
 */
export function getGridSpan(start?: number, end?: number): number {
  if (start && end && end > start) return end - start;
  return 1;
}

/**
 * Parse CSS grid-column-start/grid-row-start to 0-based index.
 * Computed values: "1", "2", "auto"
 * Returns 0-based index or -1 for auto/undefined.
 */
export function parseGridLineIndex(cssValue: string | undefined): number {
  if (!cssValue || cssValue === "auto") return -1;
  const num = parseInt(cssValue, 10);
  if (isNaN(num) || num < 1) return -1;
  return num - 1; // Convert 1-based CSS to 0-based Figma
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Expand all repeat() functions in a CSS grid template string.
 * "100px repeat(2, 1fr) 100px" → "100px 1fr 1fr 100px"
 * "repeat(2, 100px 1fr)" → "100px 1fr 100px 1fr"
 */
function expandRepeats(value: string): string {
  // Match repeat(N, ...) where N is a number (not auto-fit/auto-fill)
  const repeatRegex = /repeat\s*\(\s*(\d+)\s*,\s*([^)]+)\)/g;

  return value.replace(repeatRegex, (_match, countStr, trackList) => {
    const count = parseInt(countStr, 10);
    const tracks = trackList.trim();
    return Array(count).fill(tracks).join(" ");
  });
}

/**
 * Tokenize a CSS grid template string, respecting parentheses.
 * "200px minmax(0px, 1fr) auto" → ["200px", "minmax(0px, 1fr)", "auto"]
 */
function tokenize(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === " " && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Split a string by commas, respecting nested parentheses.
 * "100px, minmax(0, 1fr)" → ["100px", "minmax(0, 1fr)"]
 */
function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}
