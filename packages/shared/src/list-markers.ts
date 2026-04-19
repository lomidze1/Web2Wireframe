/**
 * List marker counter engine.
 *
 * Pure functions that, given an HTML list context (list-style-type, ol start /
 * reversed, li value), produce the exact marker strings a browser would render
 * ("1.", "iv.", "a.", "•", etc.).
 *
 * Used by tree-builder to synthesize marker text children for <li> elements
 * when the CDP ::marker pseudo-element is missing or has zero bounds.
 *
 * References:
 *   https://drafts.csswg.org/css-counter-styles-3/
 *   https://html.spec.whatwg.org/multipage/grouping-content.html#the-ol-element
 */

export interface ListMarkerInput {
  listStyleType: string;
  index: number;
  start?: number;
  reversed?: boolean;
  total?: number;
  valueOverride?: number;
  suffix?: string;
}

export interface ListItemSpec {
  valueAttr?: string | number;
}

export interface ListContainerSpec {
  tag: "ol" | "ul";
  listStyleType: string;
  startAttr?: string | number;
  reversed?: boolean;
  items: ListItemSpec[];
}

// ---------------------------------------------------------------------------
// Style registries
// ---------------------------------------------------------------------------

const BULLET_CHAR: Record<string, string> = {
  disc: "•",
  circle: "○",
  square: "▪",
  none: "",
};

const NUMERIC_STYLES = new Set([
  "decimal",
  "decimal-leading-zero",
  "lower-alpha",
  "lower-latin",
  "upper-alpha",
  "upper-latin",
  "lower-roman",
  "upper-roman",
  "lower-greek",
]);

const GREEK_LETTERS = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ",
  "ν", "ξ", "ο", "π", "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω",
];

// ---------------------------------------------------------------------------
// Numeric formatters
// ---------------------------------------------------------------------------

function toRoman(n: number): string {
  if (n <= 0) return String(n);
  const table: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let remaining = n;
  for (const [value, numeral] of table) {
    while (remaining >= value) {
      out += numeral;
      remaining -= value;
    }
  }
  return out;
}

/** Bijective base-k alphabetic numbering (1 → 'a', 26 → 'z', 27 → 'aa'). */
function toAlphabetic(n: number, chars: string[]): string {
  if (n <= 0) return String(n);
  const k = chars.length;
  let out = "";
  let remaining = n;
  while (remaining > 0) {
    remaining--;
    out = chars[remaining % k] + out;
    remaining = Math.floor(remaining / k);
  }
  return out;
}

const LATIN_LOWER = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
const LATIN_UPPER = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

function formatNumeric(value: number, listStyleType: string, totalForPadding?: number): string {
  switch (listStyleType) {
    case "decimal":
      return String(value);
    case "decimal-leading-zero": {
      if (value < 0) return String(value);
      const width = Math.max(2, String(totalForPadding ?? 2).length);
      return String(value).padStart(width, "0");
    }
    case "lower-alpha":
    case "lower-latin":
      return value > 0 ? toAlphabetic(value, LATIN_LOWER) : String(value);
    case "upper-alpha":
    case "upper-latin":
      return value > 0 ? toAlphabetic(value, LATIN_UPPER) : String(value);
    case "lower-roman":
      return value > 0 ? toRoman(value).toLowerCase() : String(value);
    case "upper-roman":
      return value > 0 ? toRoman(value) : String(value);
    case "lower-greek":
      return value > 0 ? toAlphabetic(value, GREEK_LETTERS) : String(value);
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given style + index + optional start/reversed/valueOverride, return the
 * marker string the browser would render for a single <li>.
 */
export function formatListMarker(input: ListMarkerInput): string {
  const style = input.listStyleType || "disc";

  // Bullet styles ignore index/start/reversed and never take a suffix.
  if (style in BULLET_CHAR) {
    return BULLET_CHAR[style];
  }

  // Unknown style → disc fallback (matches CSS UA default).
  if (!NUMERIC_STYLES.has(style)) {
    return "•";
  }

  let value: number;
  if (input.valueOverride !== undefined) {
    value = input.valueOverride;
  } else if (input.reversed) {
    const start = input.start ?? input.total ?? 1;
    value = start - input.index;
  } else {
    const start = input.start ?? 1;
    value = start + input.index;
  }

  const numericStr = formatNumeric(value, style, input.total);
  const suffix = input.suffix !== undefined ? input.suffix : ".";
  return numericStr + suffix;
}

/**
 * Given an <ol>/<ul> container and its direct <li> children, return the
 * marker strings. Honors start attribute, reversed attribute, and per-item
 * `value` attribute overrides (which reset the counter in place and affect
 * subsequent siblings).
 */
export function computeListMarkers(spec: ListContainerSpec): string[] {
  const { items } = spec;
  if (items.length === 0) return [];

  const style = spec.listStyleType || (spec.tag === "ol" ? "decimal" : "disc");

  // Bullet / none — identical marker for every item.
  if (style in BULLET_CHAR) {
    const ch = BULLET_CHAR[style];
    return items.map(() => ch);
  }

  // Unknown style → disc fallback.
  if (!NUMERIC_STYLES.has(style)) {
    return items.map(() => "•");
  }

  const total = items.length;
  const reversed = !!spec.reversed;
  const parsedStart = spec.startAttr !== undefined
    ? parseInt(String(spec.startAttr), 10)
    : NaN;

  let counter: number;
  if (!Number.isNaN(parsedStart)) {
    counter = parsedStart;
  } else if (reversed) {
    counter = total;
  } else {
    counter = 1;
  }

  const results: string[] = [];
  for (const item of items) {
    let value = counter;
    if (item.valueAttr !== undefined) {
      const parsed = parseInt(String(item.valueAttr), 10);
      if (!Number.isNaN(parsed)) {
        value = parsed;
        counter = parsed;
      }
    }
    results.push(formatNumeric(value, style, total) + ".");
    counter += reversed ? -1 : 1;
  }
  return results;
}
