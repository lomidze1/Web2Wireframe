/**
 * CSS to Figma Style Parsers
 * Converts CSS properties to Figma-ready format
 *
 * Goal: 1:1 visual fidelity - website looks identical in Figma
 */

import type {
  FigmaColor,
  FigmaFill,
  FigmaStroke,
  FigmaEffect,
  FigmaGradientStop,
  RadialGradientShape,
  RadialGradientSize,
} from "./types";

// ============================================================================
// COLOR PARSING
// ============================================================================

/**
 * Parse any CSS color to Figma RGBA (0-1 range)
 */
export function parseColorToFigma(
  color: string | null | undefined,
  allowTransparent: boolean = false
): FigmaColor | null {
  if (!color || color === "none") {
    return null;
  }

  const trimmed = color.trim();

  // Handle transparent - return as transparent black for gradient stops
  if (trimmed === "transparent") {
    if (allowTransparent) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    return null;
  }

  // Check for fully transparent
  if (trimmed === "rgba(0, 0, 0, 0)" || trimmed === "rgba(0,0,0,0)") {
    if (allowTransparent) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    return null;
  }

  // Hex color
  if (trimmed.startsWith("#")) {
    return hexToFigma(trimmed);
  }

  // RGB/RGBA
  const rgbaMatch = trimmed.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i
  );
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const alpha = a !== undefined ? parseFloat(a) : 1;
    if (alpha === 0 && !allowTransparent) return null;
    return {
      r: parseInt(r) / 255,
      g: parseInt(g) / 255,
      b: parseInt(b) / 255,
      a: alpha,
    };
  }

  // HSL/HSLA (convert to RGB first)
  const hslaMatch = trimmed.match(
    /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/i
  );
  if (hslaMatch) {
    const [, h, s, l, a] = hslaMatch;
    const alpha = a !== undefined ? parseFloat(a) : 1;
    if (alpha === 0 && !allowTransparent) return null;
    return hslToFigma(parseFloat(h), parseFloat(s), parseFloat(l), alpha);
  }

  // Named colors (common ones)
  const namedColors: Record<string, string> = {
    white: "#FFFFFF",
    black: "#000000",
    red: "#FF0000",
    green: "#008000",
    blue: "#0000FF",
    yellow: "#FFFF00",
    orange: "#FFA500",
    purple: "#800080",
    pink: "#FFC0CB",
    gray: "#808080",
    grey: "#808080",
  };

  if (namedColors[trimmed.toLowerCase()]) {
    return hexToFigma(namedColors[trimmed.toLowerCase()]);
  }

  console.warn("[parseColorToFigma] Could not parse:", color);
  return null;
}

/**
 * Hex to Figma color
 */
function hexToFigma(hex: string): FigmaColor {
  let h = hex.replace("#", "");

  // Shorthand (#RGB → #RRGGBB)
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  // 8-char hex with alpha (#RRGGBBAA)
  let alpha = 1;
  if (h.length === 8) {
    alpha = parseInt(h.slice(6, 8), 16) / 255;
    h = h.slice(0, 6);
  }

  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: alpha,
  };
}

/**
 * HSL to Figma color
 */
function hslToFigma(
  h: number,
  s: number,
  l: number,
  a: number = 1
): FigmaColor {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: r + m,
    g: g + m,
    b: b + m,
    a,
  };
}

// ============================================================================
// BACKGROUND PARSING → fills[]
// ============================================================================

/**
 * Element dimensions for proper gradient transform calculation
 */
export interface ElementDimensions {
  width: number;
  height: number;
}

/**
 * Parse CSS background to Figma fills array
 * Handles: multiple gradients, solid colors, images (as placeholders)
 *
 * @param background - CSS background shorthand or background-image
 * @param backgroundColor - CSS background-color (fallback)
 * @param resolvedVariables - Map of CSS variable names to resolved values
 * @param elementDimensions - Element width/height for gradient size calculation
 */
export function parseBackgroundToFills(
  background: string | null,
  backgroundColor: string | null,
  resolvedVariables: Map<string, string> = new Map(),
  elementDimensions?: ElementDimensions
): FigmaFill[] {
  const fills: FigmaFill[] = [];

  if (background) {
    // Split ORIGINAL layers before resolving — preserve var() inside gradients
    const layers = splitMultipleBackgrounds(background);

    for (const rawLayer of layers) {
      const layer = rawLayer.trim();

      // If entire layer is a bare var() reference, resolve it fully
      // (e.g., "var(--gradient-bg)" → "linear-gradient(...)")
      const topLevelVar = extractCSSVariableName(layer);
      const resolvedLayer = topLevelVar
        ? resolveCSSVariables(layer, resolvedVariables)
        : layer;

      const fill = parseBackgroundLayer(
        resolvedLayer,
        elementDimensions,
        resolvedVariables
      );
      if (fill) {
        // Preserve CSS variable name on fills created from bare var() layers
        if (topLevelVar) {
          fill.cssVariable = topLevelVar;
        }
        fills.push(fill);
      }
    }
  }

  // Add solid background color as last layer ONLY if:
  // 1. No fills parsed from background string, OR
  // 2. The last fill is NOT a solid color (avoid duplicates from var(--bg) + computed bg-color)
  if (backgroundColor) {
    const lastFill = fills[fills.length - 1];
    const alreadyHasSolidAtEnd = lastFill?.type === "SOLID";

    if (!alreadyHasSolidAtEnd) {
      const resolvedBgColor = resolveCSSVariables(
        backgroundColor,
        resolvedVariables
      );
      const color = parseColorToFigma(resolvedBgColor);
      if (color) {
        fills.push({
          type: "SOLID",
          visible: true,
          opacity: color.a,
          color: { ...color, a: 1 }, // Separate opacity from color
        });
      }
    }
  }

  return fills;
}

/**
 * Split multiple backgrounds by comma (respecting parentheses)
 */
function splitMultipleBackgrounds(background: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (const char of background) {
    // Track quote state (don't split inside quoted strings)
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    const inQuotes = inSingleQuote || inDoubleQuote;

    if (!inQuotes) {
      if (char === "(") depth++;
      else if (char === ")") depth--;
      else if (char === "," && depth === 0) {
        layers.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }

  if (current.trim()) {
    layers.push(current.trim());
  }

  return layers;
}

/**
 * Parse single background layer
 */
function parseBackgroundLayer(
  layer: string,
  elementDimensions?: ElementDimensions,
  resolvedVariables?: Map<string, string>
): FigmaFill | null {
  // Linear gradient
  if (layer.includes("linear-gradient")) {
    const fill = parseLinearGradient(layer, resolvedVariables);
    if (fill && elementDimensions) {
      fill.elementWidth = elementDimensions.width;
      fill.elementHeight = elementDimensions.height;
    }
    return fill;
  }

  // Radial gradient
  if (layer.includes("radial-gradient")) {
    const fill = parseRadialGradient(layer, resolvedVariables);
    if (fill && elementDimensions) {
      // Store element dimensions for transform calculation in Figma
      fill.elementWidth = elementDimensions.width;
      fill.elementHeight = elementDimensions.height;
    }
    return fill;
  }

  // Conic gradient
  if (layer.includes("conic-gradient")) {
    return parseConicGradient(layer, resolvedVariables);
  }

  // URL (image) → placeholder
  if (layer.includes("url(")) {
    // Extract URL from url('...') or url("...") or url(...)
    const urlMatch = layer.match(/url\(\s*['"]?(.*?)['"]?\s*\)/);
    const imageUrl = urlMatch?.[1] || undefined;
    return {
      type: "IMAGE_PLACEHOLDER",
      visible: true,
      opacity: 1,
      isImagePlaceholder: true,
      imageUrl,
    };
  }

  // Solid color — resolve any remaining var() for plain color values
  const resolvedLayer = resolvedVariables
    ? resolveCSSVariables(layer, resolvedVariables)
    : layer;
  const color = parseColorToFigma(resolvedLayer);
  if (color) {
    return {
      type: "SOLID",
      visible: true,
      opacity: color.a,
      color: { ...color, a: 1 },
    };
  }

  return null;
}

/**
 * Parse linear-gradient to Figma fill
 * Handles: deg, to direction, color stops with positions
 */
function parseLinearGradient(
  gradient: string,
  resolvedVariables?: Map<string, string>
): FigmaFill | null {
  // Extract content inside linear-gradient(...)
  const match = gradient.match(/linear-gradient\s*\(\s*(.+)\s*\)/i);
  if (!match) return null;

  const content = match[1];

  // Parse angle/direction and color stops
  let angle = 180; // Default: to bottom
  let colorStopsStr = content;

  // Check for angle in degrees
  const degMatch = content.match(/^([\d.]+)deg\s*,\s*/i);
  if (degMatch) {
    angle = parseFloat(degMatch[1]);
    colorStopsStr = content.slice(degMatch[0].length);
  }
  // Check for "to direction"
  else {
    const dirMatch = content.match(
      /^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?\s*,\s*/i
    );
    if (dirMatch) {
      angle = directionToAngle(dirMatch[1], dirMatch[2]);
      colorStopsStr = content.slice(dirMatch[0].length);
    }
  }

  // Parse color stops
  const stops = parseColorStops(colorStopsStr, resolvedVariables);

  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_LINEAR",
    visible: true,
    opacity: 1,
    angle,
    stops,
  };
}

/**
 * Parse radial-gradient to Figma fill
 * Handles: "circle at 20% 20%, color1, color2" or "ellipse farthest-corner at 50% 50%, ..."
 *
 * CSS Radial Gradient Syntax:
 * radial-gradient([shape] [size] at [position], color-stops)
 *
 * Shape: circle | ellipse (default: ellipse)
 * Size: closest-side | farthest-side | closest-corner | farthest-corner (default: farthest-corner)
 *       OR explicit: <length> | <length> <length> | <percentage> <percentage>
 * Position: at X Y (default: at 50% 50%)
 */
function parseRadialGradient(
  gradient: string,
  resolvedVariables?: Map<string, string>
): FigmaFill | null {
  const match = gradient.match(/radial-gradient\s*\(\s*(.+)\s*\)/i);
  if (!match) return null;

  const content = match[1];

  // Default values
  let center = { x: 0.5, y: 0.5 };
  let shape: RadialGradientShape = "ellipse"; // CSS default
  let size: RadialGradientSize = "farthest-corner"; // CSS default

  // Parse shape keyword (circle or ellipse)
  const shapeMatch = content.match(/^(circle|ellipse)\b/i);
  if (shapeMatch) {
    shape = shapeMatch[1].toLowerCase() as RadialGradientShape;
  }

  // Parse size keyword
  const sizeMatch = content.match(
    /\b(closest-side|farthest-side|closest-corner|farthest-corner)\b/i
  );
  if (sizeMatch) {
    size = sizeMatch[1].toLowerCase() as RadialGradientSize;
  }

  // Parse position "at X Y"
  const atMatch = content.match(/at\s+([\d.]+%?)\s+([\d.]+%?)/i);
  if (atMatch) {
    center = {
      x: parsePercent(atMatch[1]),
      y: parsePercent(atMatch[2]),
    };
  }

  // Find where color stops begin
  // The configuration part ends at the first comma after all keywords/position
  // We need to find the comma that's NOT inside a function like rgb()

  // Build regex to match the entire configuration part
  // Pattern: [shape] [size] [at X Y] ,
  const configPatterns = [
    /^(?:circle|ellipse)\s*/i,
    /^(?:closest-side|farthest-side|closest-corner|farthest-corner)\s*/i,
    /^at\s+[\d.]+%?\s+[\d.]+%?\s*/i,
  ];

  let remaining = content;
  let configFound = true;

  // Strip configuration parts from the beginning
  while (configFound) {
    configFound = false;
    for (const pattern of configPatterns) {
      const m = remaining.match(pattern);
      if (m) {
        remaining = remaining.slice(m[0].length);
        configFound = true;
        break;
      }
    }
  }

  // Remove leading comma if present
  remaining = remaining.replace(/^,\s*/, "");

  // If remaining still doesn't look like colors, try finding first comma
  if (!looksLikeColor(remaining.split(",")[0]?.trim() || "")) {
    const commaIndex = content.indexOf(",");
    if (commaIndex > -1) {
      remaining = content.slice(commaIndex + 1).trim();
    }
  }

  const stops = parseColorStops(remaining, resolvedVariables);
  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_RADIAL",
    visible: true,
    opacity: 1,
    stops,
    center,
    shape,
    size,
  };
}

/**
 * Check if a string looks like a CSS color
 */
function looksLikeColor(str: string): boolean {
  const trimmed = str.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("rgb") ||
    trimmed.startsWith("hsl") ||
    trimmed.startsWith("var(") ||
    /^(transparent|white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)$/i.test(
      trimmed
    )
  );
}

/**
 * Parse conic-gradient to Figma fill
 */
function parseConicGradient(
  gradient: string,
  resolvedVariables?: Map<string, string>
): FigmaFill | null {
  const match = gradient.match(/conic-gradient\s*\(\s*(.+)\s*\)/i);
  if (!match) return null;

  const content = match[1];
  let colorStopsStr = content;
  let angle = 0;
  let center = { x: 0.5, y: 0.5 };

  // Check for "from Xdeg"
  const fromMatch = content.match(/from\s+([\d.]+)deg\s*/i);
  if (fromMatch) {
    angle = parseFloat(fromMatch[1]);
    colorStopsStr = content.replace(fromMatch[0], "");
  }

  // Check for "at X Y"
  const atMatch = colorStopsStr.match(/at\s+([\d.]+%?)\s+([\d.]+%?)\s*,?\s*/i);
  if (atMatch) {
    center = {
      x: parsePercent(atMatch[1]),
      y: parsePercent(atMatch[2]),
    };
    colorStopsStr = colorStopsStr.replace(atMatch[0], "");
  }

  // Remove leading comma if present
  colorStopsStr = colorStopsStr.replace(/^,\s*/, "");

  const stops = parseColorStops(colorStopsStr, resolvedVariables);
  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_CONIC",
    visible: true,
    opacity: 1,
    angle,
    stops,
    center,
  };
}

/**
 * Parse color stops from gradient
 * Handles: "red 0%, blue 50%, green 100%" or just "red, blue, green"
 *
 * IMPORTANT: When encountering `transparent`, we use the adjacent color's RGB
 * with alpha=0, instead of black. This ensures smooth Figma gradient display.
 */
function parseColorStops(
  stopsStr: string,
  resolvedVariables?: Map<string, string>
): FigmaGradientStop[] {
  const stops: FigmaGradientStop[] = [];
  const transparentIndices: number[] = [];

  // Split by comma, but respect parentheses (for rgb/rgba/hsl/var)
  const parts = splitMultipleBackgrounds(stopsStr);

  for (let i = 0; i < parts.length; i++) {
    const rawPart = parts[i].trim();
    if (!rawPart) continue;

    // Extract CSS variable name BEFORE resolving
    let cssVariableName: string | undefined;
    if (resolvedVariables && rawPart.includes("var(")) {
      // Strip trailing position (e.g., "var(--color) 50%" → "var(--color)")
      const rawPosMatch = rawPart.match(/^(.+?)\s+([\d.]+%?)$/);
      const colorPart = rawPosMatch ? rawPosMatch[1].trim() : rawPart;
      cssVariableName = extractCSSVariableName(colorPart) || undefined;
    }

    // Resolve var() references for color parsing
    const part = resolvedVariables
      ? resolveCSSVariables(rawPart, resolvedVariables)
      : rawPart;

    // Skip parts that are just positions (no color) - defensive against parsing errors
    if (/^[\d.]+%?$/.test(part)) {
      continue;
    }

    // Extract color and optional position
    // Match: "rgba(255, 0, 0, 0.5) 50%" or "red 25%" or just "blue"
    const posMatch = part.match(/^(.+?)\s+([\d.]+%?)$/);

    let colorStr: string;
    let position: number;

    if (posMatch) {
      colorStr = posMatch[1].trim();
      position = parsePercent(posMatch[2]);
    } else {
      colorStr = part;
      // Auto-distribute positions
      position = parts.length > 1 ? i / (parts.length - 1) : 0;
    }

    // Check if this is a transparent color (will be fixed later)
    const isTransparent =
      colorStr.toLowerCase() === "transparent" ||
      colorStr === "rgba(0, 0, 0, 0)" ||
      colorStr === "rgba(0,0,0,0)";

    // Allow transparent colors in gradient stops (they create fade effects)
    const color = parseColorToFigma(colorStr, true);
    if (color) {
      stops.push({ color, position, cssVariableName });
      if (isTransparent) {
        transparentIndices.push(stops.length - 1);
      }
    }
  }

  // FIX: Replace transparent (black with alpha 0) with adjacent color's RGB
  // This ensures Figma displays gradient fades correctly without black edges
  for (const idx of transparentIndices) {
    // Find the nearest non-transparent color
    let referenceColor: FigmaColor | null = null;

    // Try previous stop first
    if (idx > 0 && !transparentIndices.includes(idx - 1)) {
      referenceColor = stops[idx - 1].color;
    }
    // Try next stop
    else if (idx < stops.length - 1 && !transparentIndices.includes(idx + 1)) {
      referenceColor = stops[idx + 1].color;
    }

    // Apply the fix: use reference color's RGB with alpha 0
    if (referenceColor) {
      stops[idx].color = {
        r: referenceColor.r,
        g: referenceColor.g,
        b: referenceColor.b,
        a: 0,
      };
    }
  }

  return stops;
}

/**
 * Convert CSS direction to angle
 */
function directionToAngle(dir1: string, dir2?: string): number {
  const d1 = dir1.toLowerCase();
  const d2 = dir2?.toLowerCase();

  if (d1 === "top" && !d2) return 0;
  if (d1 === "right" && !d2) return 90;
  if (d1 === "bottom" && !d2) return 180;
  if (d1 === "left" && !d2) return 270;

  // Corners
  if ((d1 === "top" && d2 === "right") || (d1 === "right" && d2 === "top"))
    return 45;
  if (
    (d1 === "bottom" && d2 === "right") ||
    (d1 === "right" && d2 === "bottom")
  )
    return 135;
  if ((d1 === "bottom" && d2 === "left") || (d1 === "left" && d2 === "bottom"))
    return 225;
  if ((d1 === "top" && d2 === "left") || (d1 === "left" && d2 === "top"))
    return 315;

  return 180; // Default
}

/**
 * Parse percentage string to 0-1
 */
function parsePercent(value: string): number {
  if (value.endsWith("%")) {
    return parseFloat(value) / 100;
  }
  return parseFloat(value);
}

// ============================================================================
// BOX-SHADOW PARSING → effects[]
// ============================================================================

/**
 * Parse CSS box-shadow to Figma effects array
 * Handles: multiple shadows, inset shadows, CSS variable colors
 */
export function parseBoxShadowToEffects(
  boxShadow: string | null,
  resolvedVariables?: Map<string, string>
): FigmaEffect[] {
  if (!boxShadow || boxShadow === "none") {
    return [];
  }

  const effects: FigmaEffect[] = [];

  // Resolve any CSS variables in the box-shadow value first
  const resolved = resolvedVariables
    ? resolveCSSVariables(boxShadow, resolvedVariables)
    : boxShadow;

  // Split multiple shadows (comma-separated, respect parentheses)
  const shadows = splitMultipleBackgrounds(resolved);

  for (const shadow of shadows) {
    const effect = parseSingleShadow(shadow.trim(), resolvedVariables);
    if (effect) {
      effects.push(effect);
    }
  }

  return effects;
}

/**
 * Parse single box-shadow
 * Format: [inset] offset-x offset-y [blur-radius] [spread-radius] color
 */
function parseSingleShadow(
  shadow: string,
  resolvedVariables?: Map<string, string>
): FigmaEffect | null {
  if (!shadow || shadow === "none") return null;

  const isInset = shadow.toLowerCase().includes("inset");
  let cleanShadow = shadow.replace(/inset/gi, "").trim();

  // Extract color first (can be at start or end)
  let color: FigmaColor | null = null;

  // Try to find color at the end (most common)
  const colorPatterns = [
    /rgba?\s*\([^)]+\)\s*$/i,
    /hsla?\s*\([^)]+\)\s*$/i,
    /#[0-9a-f]{3,8}\s*$/i,
    /\b(white|black|red|green|blue|gray|grey|transparent)\s*$/i,
  ];

  for (const pattern of colorPatterns) {
    const match = cleanShadow.match(pattern);
    if (match) {
      color = parseColorToFigma(match[0].trim());
      cleanShadow = cleanShadow.slice(0, match.index).trim();
      break;
    }
  }

  // If no color at end, try start
  if (!color) {
    for (const pattern of colorPatterns) {
      const startPattern = new RegExp(
        "^" + pattern.source.replace(/\$/, ""),
        "i"
      );
      const match = cleanShadow.match(startPattern);
      if (match) {
        color = parseColorToFigma(match[0].trim());
        cleanShadow = cleanShadow.slice(match[0].length).trim();
        break;
      }
    }
  }

  // Try to resolve var() color reference
  if (!color && resolvedVariables) {
    const varMatch = cleanShadow.match(/var\([^)]+\)\s*$/i);
    if (varMatch) {
      const resolved = resolveCSSVariables(varMatch[0], resolvedVariables);
      color = parseColorToFigma(resolved);
      cleanShadow = cleanShadow.slice(0, varMatch.index).trim();
    }
    if (!color) {
      const varMatchStart = cleanShadow.match(/^var\([^)]+\)/i);
      if (varMatchStart) {
        const resolved = resolveCSSVariables(varMatchStart[0], resolvedVariables);
        color = parseColorToFigma(resolved);
        cleanShadow = cleanShadow.slice(varMatchStart[0].length).trim();
      }
    }
  }

  // Default color if not found
  if (!color) {
    color = { r: 0, g: 0, b: 0, a: 0.25 };
  }

  // Parse numeric values: offset-x offset-y [blur] [spread]
  const values = cleanShadow.match(/-?[\d.]+(?:px)?/g);
  if (!values || values.length < 2) return null;

  const nums = values.map((v) => parseFloat(v.replace("px", "")));
  const [offsetX, offsetY, blur = 0, spread = 0] = nums;

  return {
    type: isInset ? "INNER_SHADOW" : "DROP_SHADOW",
    visible: true,
    color,
    offset: { x: offsetX, y: offsetY },
    radius: blur,
    spread,
  };
}

// ============================================================================
// BACKDROP-FILTER PARSING → effects[]
// ============================================================================

/**
 * Parse CSS backdrop-filter to Figma effects
 * Handles: blur(), saturate(), etc.
 */
export function parseBackdropFilterToEffects(
  backdropFilter: string | null
): FigmaEffect[] {
  if (!backdropFilter || backdropFilter === "none") {
    return [];
  }

  const effects: FigmaEffect[] = [];

  // Extract blur value
  const blurMatch = backdropFilter.match(/blur\s*\(\s*([\d.]+)(?:px)?\s*\)/i);
  if (blurMatch) {
    effects.push({
      type: "BACKGROUND_BLUR",
      visible: true,
      blurRadius: parseFloat(blurMatch[1]),
    });
  }

  return effects;
}

// ============================================================================
// FILTER PARSING → effects[]
// ============================================================================

/**
 * Parse CSS filter property to Figma effects.
 * Handles: blur() → LAYER_BLUR, drop-shadow() → DROP_SHADOW.
 * Other filter functions (brightness, contrast, etc.) have no Figma equivalent and are skipped.
 */
export function parseFilterToEffects(
  filter: string | null,
  resolvedVariables?: Map<string, string>
): FigmaEffect[] {
  if (!filter || filter === "none") {
    return [];
  }

  const resolved = resolvedVariables
    ? resolveCSSVariables(filter, resolvedVariables)
    : filter;

  const effects: FigmaEffect[] = [];

  // Extract blur()
  const blurMatch = resolved.match(/\bblur\s*\(\s*([\d.]+)(?:px)?\s*\)/i);
  if (blurMatch) {
    effects.push({
      type: "LAYER_BLUR",
      visible: true,
      blurRadius: parseFloat(blurMatch[1]),
    });
  }

  // Extract drop-shadow() — can be multiple
  const dropShadowRegex = /drop-shadow\s*\(\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s*(?:([\d.]+)(?:px)?)?\s*([^)]*)\)/gi;
  let dsMatch;
  while ((dsMatch = dropShadowRegex.exec(resolved)) !== null) {
    const offsetX = parseFloat(dsMatch[1]);
    const offsetY = parseFloat(dsMatch[2]);
    const blur = dsMatch[3] ? parseFloat(dsMatch[3]) : 0;
    const colorStr = dsMatch[4]?.trim();
    const color = colorStr ? parseColorToFigma(colorStr) : { r: 0, g: 0, b: 0, a: 0.5 };

    effects.push({
      type: "DROP_SHADOW",
      visible: true,
      color: color || { r: 0, g: 0, b: 0, a: 0.5 },
      offset: { x: offsetX, y: offsetY },
      radius: blur,
      spread: 0,
    });
  }

  return effects;
}

// ============================================================================
// BORDER PARSING → strokes[]
// ============================================================================

/**
 * Per-side border input (primary signature).
 */
export interface PerSideBorderInput {
  top?: { width?: string | null; color?: string | null; style?: string | null };
  right?: { width?: string | null; color?: string | null; style?: string | null };
  bottom?: { width?: string | null; color?: string | null; style?: string | null };
  left?: { width?: string | null; color?: string | null; style?: string | null };
}

/**
 * Shorthand fallback input (legacy / tests).
 */
export interface ShorthandBorderInput {
  width?: string | null;
  color?: string | null;
  style?: string | null;
}

type ParsedSide = {
  key: "top" | "right" | "bottom" | "left";
  weight: number;
  color: FigmaColor;
  style: "SOLID" | "DASHED" | "DOTTED";
};

function parseOneSide(
  key: "top" | "right" | "bottom" | "left",
  width: string | null | undefined,
  color: string | null | undefined,
  style: string | null | undefined,
  resolvedVariables: Map<string, string>,
  currentColorFallback: string | null = null,
): ParsedSide | null {
  const weight = parseFloat(String(width ?? "0"));
  if (!isFinite(weight) || weight <= 0) return null;
  const styleStr = (style || "").trim().toLowerCase();
  if (!styleStr || styleStr === "none" || styleStr === "hidden") return null;
  const rawColor = (color && color !== "") ? color : currentColorFallback;
  if (!rawColor) return null;
  const resolvedColor = resolveCSSVariables(String(rawColor), resolvedVariables);
  const parsedColor = parseColorToFigma(resolvedColor);
  if (!parsedColor || parsedColor.a === 0) return null;
  const figmaStyle: "SOLID" | "DASHED" | "DOTTED" =
    styleStr === "dashed" ? "DASHED"
    : styleStr === "dotted" ? "DOTTED"
    : "SOLID";
  return { key, weight, color: parsedColor, style: figmaStyle };
}

function colorsEqual(a: FigmaColor, b: FigmaColor): boolean {
  const eps = 1e-4;
  return (
    Math.abs(a.r - b.r) < eps &&
    Math.abs(a.g - b.g) < eps &&
    Math.abs(a.b - b.b) < eps &&
    Math.abs((a.a ?? 1) - (b.a ?? 1)) < eps
  );
}

/**
 * Parse CSS borders to Figma strokes array.
 *
 * Primary signature (new): `parseBordersToStrokes(perSide, fallback?, vars?)`.
 * Legacy positional signature still works via runtime shim for existing tests:
 *   `parseBordersToStrokes(borderWidth, borderColor, borderStyle,
 *                          borderTop, borderRight, borderBottom, borderLeft, vars)`.
 *
 * Semantics:
 * - If 4 sides are all identical (weight/color/style) → 1 all-sides stroke.
 * - Otherwise → up to 4 strokes, each with exactly one `sides` flag true.
 * - Sides with `style: none|hidden`, width<=0, or transparent color are omitted.
 */
export function parseBordersToStrokes(
  perSideOrLegacyWidth?:
    | PerSideBorderInput
    | string
    | null,
  fallbackOrLegacyColor?:
    | ShorthandBorderInput
    | string
    | null,
  resolvedVariablesOrLegacyStyle:
    | Map<string, string>
    | string
    | null = new Map(),
  legacyBorderTop?: string | null,
  legacyBorderRight?: string | null,
  legacyBorderBottom?: string | null,
  legacyBorderLeft?: string | null,
  legacyResolvedVariables: Map<string, string> = new Map(),
): FigmaStroke[] {
  // --- Legacy positional shim detection ---
  const looksLegacy =
    typeof perSideOrLegacyWidth === "string" ||
    perSideOrLegacyWidth === null ||
    typeof fallbackOrLegacyColor === "string" ||
    typeof resolvedVariablesOrLegacyStyle === "string";

  let perSide: PerSideBorderInput | undefined;
  let fallback: ShorthandBorderInput | undefined;
  let resolvedVariables: Map<string, string>;

  if (looksLegacy) {
    const legacyWidth = perSideOrLegacyWidth as string | null;
    const legacyColor = fallbackOrLegacyColor as string | null;
    const legacyStyle = resolvedVariablesOrLegacyStyle as string | null;
    resolvedVariables = legacyResolvedVariables;

    // If ANY per-side legacy shorthand is supplied, route through those.
    const hasSideShorthand =
      legacyBorderTop || legacyBorderRight || legacyBorderBottom || legacyBorderLeft;
    if (hasSideShorthand) {
      return parseBordersFromLegacySideShorthand(
        legacyBorderTop, legacyBorderRight, legacyBorderBottom, legacyBorderLeft,
        resolvedVariables,
      );
    }
    fallback = { width: legacyWidth, color: legacyColor, style: legacyStyle };
  } else {
    perSide = perSideOrLegacyWidth as PerSideBorderInput | undefined;
    fallback = fallbackOrLegacyColor as ShorthandBorderInput | undefined;
    resolvedVariables = (resolvedVariablesOrLegacyStyle as Map<string, string>) || new Map();
  }

  // --- Primary per-side path ---
  if (perSide) {
    const parsed: ParsedSide[] = [];
    (["top", "right", "bottom", "left"] as const).forEach((key) => {
      const side = perSide![key];
      if (!side) return;
      const ps = parseOneSide(
        key, side.width, side.color, side.style, resolvedVariables,
      );
      if (ps) parsed.push(ps);
    });

    if (parsed.length > 0) {
      // Uniform fast path: all 4 sides identical → single stroke
      if (parsed.length === 4) {
        const [first, ...rest] = parsed;
        const uniform = rest.every(
          (p) =>
            p.weight === first.weight &&
            p.style === first.style &&
            colorsEqual(p.color, first.color),
        );
        if (uniform) {
          return [{
            color: first.color,
            weight: first.weight,
            position: "INSIDE",
            style: first.style,
            sides: { top: true, right: true, bottom: true, left: true },
          }];
        }
      }
      // Non-uniform: one stroke per active side
      return parsed.map((p) => ({
        color: p.color,
        weight: p.weight,
        position: "INSIDE" as const,
        style: p.style,
        sides: {
          top: p.key === "top",
          right: p.key === "right",
          bottom: p.key === "bottom",
          left: p.key === "left",
        },
      }));
    }
  }

  // --- Shorthand fallback ---
  if (!fallback) return [];
  const width = parseFloat(String(fallback.width ?? "0"));
  if (!isFinite(width) || width <= 0) return [];

  const resolvedColor = resolveCSSVariables(
    String(fallback.color ?? ""),
    resolvedVariables,
  );
  const color = parseColorToFigma(resolvedColor);
  if (!color || color.a === 0) return [];

  const style = mapBorderStyle(fallback.style ?? null);
  return [{
    color,
    weight: width,
    position: "INSIDE",
    style,
    sides: { top: true, right: true, bottom: true, left: true },
  }];
}

/**
 * Legacy per-side shorthand parser (e.g. "1px solid red" per side).
 * Only reached via the legacy positional signature.
 */
function parseBordersFromLegacySideShorthand(
  borderTop: string | null | undefined,
  borderRight: string | null | undefined,
  borderBottom: string | null | undefined,
  borderLeft: string | null | undefined,
  resolvedVariables: Map<string, string>,
): FigmaStroke[] {
  const strokes: FigmaStroke[] = [];
  const sides = [
    { css: borderTop, side: "top" as const },
    { css: borderRight, side: "right" as const },
    { css: borderBottom, side: "bottom" as const },
    { css: borderLeft, side: "left" as const },
  ];
  for (const { css, side } of sides) {
    if (css && css !== "none" && css !== "0px") {
      const stroke = parseBorderShorthand(css, resolvedVariables);
      if (stroke) {
        stroke.sides = {
          top: side === "top",
          right: side === "right",
          bottom: side === "bottom",
          left: side === "left",
        };
        strokes.push(stroke);
      }
    }
  }
  return strokes;
}

/**
 * Parse border shorthand (e.g., "2px solid red")
 */
function parseBorderShorthand(
  border: string,
  resolvedVariables: Map<string, string>
): FigmaStroke | null {
  const resolved = resolveCSSVariables(border, resolvedVariables);

  // Match: width style color
  const match = resolved.match(
    /^([\d.]+)(?:px)?\s+(solid|dashed|dotted|double|none)\s+(.+)$/i
  );
  if (!match) return null;

  const [, widthStr, style, colorStr] = match;
  const width = parseFloat(widthStr);
  if (width <= 0) return null;

  const color = parseColorToFigma(colorStr.trim());
  if (!color) return null;

  return {
    color,
    weight: width,
    position: "INSIDE",
    style: mapBorderStyle(style),
  };
}

/**
 * Map CSS border-style to Figma stroke style
 */
function mapBorderStyle(style: string | null): "SOLID" | "DASHED" | "DOTTED" {
  switch (style?.toLowerCase()) {
    case "dashed":
      return "DASHED";
    case "dotted":
      return "DOTTED";
    default:
      return "SOLID";
  }
}

// ============================================================================
// CSS VARIABLE RESOLUTION
// ============================================================================

/**
 * Resolve CSS variables in a string.
 * Supports chained variables (var(--a) → var(--b) → #fff) with iterative
 * resolution up to a depth limit of 10, with circular reference detection.
 */
export function resolveCSSVariables(
  value: string,
  variables: Map<string, string>
): string {
  if (!value.includes("var(")) return value;

  const MAX_DEPTH = 10;
  let result = value;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (!result.includes("var(")) break;

    // Track this iteration to detect circular references
    // Reset seen set each iteration so same var can appear multiple times in one value
    const seen = new Set<string>();
    const beforeReplace = result;

    result = result.replace(
      /var\(\s*--([^,)]+)(?:\s*,\s*([^)]+))?\s*\)/gi,
      (match, name, fallback) => {
        const varName = `--${name}`;

        // Circular reference detection (within this resolution chain)
        if (seen.has(varName)) {
          if (fallback) return fallback.trim();
          return match;
        }
        seen.add(varName);

        const resolved = variables.get(varName);
        if (resolved) return resolved;
        if (fallback) return fallback.trim();
        return match; // Keep original if can't resolve
      }
    );

    // If nothing changed, stop iterating
    if (result === beforeReplace) break;
  }

  return result;
}

/**
 * Extract CSS variable name from a CSS value.
 * Only matches when the ENTIRE value is a single var() reference.
 * Returns null for complex values like `linear-gradient(var(--a), var(--b))`.
 *
 * Examples:
 *   "var(--primary)"           → "--primary"
 *   "var(--bg, #fff)"          → "--bg"
 *   "#3b82f6"                  → null
 *   "linear-gradient(var(--a))"→ null
 */
export function extractCSSVariableName(value: string): string | null {
  if (!value || !value.includes("var(")) return null;
  const match = value.trim().match(/^var\(\s*(--[\w-]+)\s*(?:,\s*[^)]+)?\s*\)$/);
  return match ? match[1].trim() : null;
}
