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
} from './types';

// ============================================================================
// COLOR PARSING
// ============================================================================

/**
 * Parse any CSS color to Figma RGBA (0-1 range)
 */
export function parseColorToFigma(color: string | null | undefined, allowTransparent: boolean = false): FigmaColor | null {
  if (!color || color === 'none') {
    return null;
  }

  const trimmed = color.trim();

  // Handle transparent - return as transparent black for gradient stops
  if (trimmed === 'transparent') {
    if (allowTransparent) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    return null;
  }

  // Check for fully transparent
  if (trimmed === 'rgba(0, 0, 0, 0)' || trimmed === 'rgba(0,0,0,0)') {
    if (allowTransparent) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    return null;
  }

  // Hex color
  if (trimmed.startsWith('#')) {
    return hexToFigma(trimmed);
  }

  // RGB/RGBA
  const rgbaMatch = trimmed.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const alpha = a !== undefined ? parseFloat(a) : 1;
    if (alpha === 0) return null;
    return {
      r: parseInt(r) / 255,
      g: parseInt(g) / 255,
      b: parseInt(b) / 255,
      a: alpha,
    };
  }

  // HSL/HSLA (convert to RGB first)
  const hslaMatch = trimmed.match(/hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (hslaMatch) {
    const [, h, s, l, a] = hslaMatch;
    const alpha = a !== undefined ? parseFloat(a) : 1;
    if (alpha === 0) return null;
    return hslToFigma(parseFloat(h), parseFloat(s), parseFloat(l), alpha);
  }

  // Named colors (common ones)
  const namedColors: Record<string, string> = {
    white: '#FFFFFF',
    black: '#000000',
    red: '#FF0000',
    green: '#008000',
    blue: '#0000FF',
    yellow: '#FFFF00',
    orange: '#FFA500',
    purple: '#800080',
    pink: '#FFC0CB',
    gray: '#808080',
    grey: '#808080',
  };

  if (namedColors[trimmed.toLowerCase()]) {
    return hexToFigma(namedColors[trimmed.toLowerCase()]);
  }

  console.warn('[parseColorToFigma] Could not parse:', color);
  return null;
}

/**
 * Hex to Figma color
 */
function hexToFigma(hex: string): FigmaColor {
  let h = hex.replace('#', '');

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
function hslToFigma(h: number, s: number, l: number, a: number = 1): FigmaColor {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

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

  // Resolve CSS variables in the background string
  let resolvedBackground = background ? resolveCSSVariables(background, resolvedVariables) : null;

  if (resolvedBackground) {
    // Split multiple backgrounds (comma-separated, but respect parentheses)
    const layers = splitMultipleBackgrounds(resolvedBackground);

    for (const layer of layers) {
      const fill = parseBackgroundLayer(layer.trim(), elementDimensions);
      if (fill) {
        fills.push(fill);
      }
    }
  }

  // Add solid background color as last layer ONLY if:
  // 1. No fills parsed from background string, OR
  // 2. The last fill is NOT a solid color (avoid duplicates from var(--bg) + computed bg-color)
  if (backgroundColor) {
    const lastFill = fills[fills.length - 1];
    const alreadyHasSolidAtEnd = lastFill?.type === 'SOLID';

    if (!alreadyHasSolidAtEnd) {
      const resolvedBgColor = resolveCSSVariables(backgroundColor, resolvedVariables);
      const color = parseColorToFigma(resolvedBgColor);
      if (color) {
        fills.push({
          type: 'SOLID',
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
  let current = '';

  for (const char of background) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      layers.push(current.trim());
      current = '';
      continue;
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
function parseBackgroundLayer(layer: string, elementDimensions?: ElementDimensions): FigmaFill | null {
  // Linear gradient
  if (layer.includes('linear-gradient')) {
    return parseLinearGradient(layer);
  }

  // Radial gradient
  if (layer.includes('radial-gradient')) {
    const fill = parseRadialGradient(layer);
    if (fill && elementDimensions) {
      // Store element dimensions for transform calculation in Figma
      fill.elementWidth = elementDimensions.width;
      fill.elementHeight = elementDimensions.height;
    }
    return fill;
  }

  // Conic gradient
  if (layer.includes('conic-gradient')) {
    return parseConicGradient(layer);
  }

  // URL (image) → placeholder
  if (layer.includes('url(')) {
    return {
      type: 'IMAGE_PLACEHOLDER',
      visible: true,
      opacity: 1,
      isImagePlaceholder: true,
    };
  }

  // Solid color
  const color = parseColorToFigma(layer);
  if (color) {
    return {
      type: 'SOLID',
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
function parseLinearGradient(gradient: string): FigmaFill | null {
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
    const dirMatch = content.match(/^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?\s*,\s*/i);
    if (dirMatch) {
      angle = directionToAngle(dirMatch[1], dirMatch[2]);
      colorStopsStr = content.slice(dirMatch[0].length);
    }
  }

  // Parse color stops
  const stops = parseColorStops(colorStopsStr);

  if (stops.length < 2) return null;

  return {
    type: 'GRADIENT_LINEAR',
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
function parseRadialGradient(gradient: string): FigmaFill | null {
  const match = gradient.match(/radial-gradient\s*\(\s*(.+)\s*\)/i);
  if (!match) return null;

  const content = match[1];

  // Default values
  let center = { x: 0.5, y: 0.5 };
  let shape: RadialGradientShape = 'ellipse';  // CSS default
  let size: RadialGradientSize = 'farthest-corner';  // CSS default

  // Parse shape keyword (circle or ellipse)
  const shapeMatch = content.match(/^(circle|ellipse)\b/i);
  if (shapeMatch) {
    shape = shapeMatch[1].toLowerCase() as RadialGradientShape;
  }

  // Parse size keyword
  const sizeMatch = content.match(/\b(closest-side|farthest-side|closest-corner|farthest-corner)\b/i);
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
  remaining = remaining.replace(/^,\s*/, '');

  // If remaining still doesn't look like colors, try finding first comma
  if (!looksLikeColor(remaining.split(',')[0]?.trim() || '')) {
    const commaIndex = content.indexOf(',');
    if (commaIndex > -1) {
      remaining = content.slice(commaIndex + 1).trim();
    }
  }

  const stops = parseColorStops(remaining);
  if (stops.length < 2) return null;

  return {
    type: 'GRADIENT_RADIAL',
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
    trimmed.startsWith('#') ||
    trimmed.startsWith('rgb') ||
    trimmed.startsWith('hsl') ||
    /^(transparent|white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)$/i.test(trimmed)
  );
}

/**
 * Parse conic-gradient to Figma fill
 */
function parseConicGradient(gradient: string): FigmaFill | null {
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
    colorStopsStr = content.replace(fromMatch[0], '');
  }

  // Check for "at X Y"
  const atMatch = colorStopsStr.match(/at\s+([\d.]+%?)\s+([\d.]+%?)\s*,?\s*/i);
  if (atMatch) {
    center = {
      x: parsePercent(atMatch[1]),
      y: parsePercent(atMatch[2]),
    };
    colorStopsStr = colorStopsStr.replace(atMatch[0], '');
  }

  // Remove leading comma if present
  colorStopsStr = colorStopsStr.replace(/^,\s*/, '');

  const stops = parseColorStops(colorStopsStr);
  if (stops.length < 2) return null;

  return {
    type: 'GRADIENT_CONIC',
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
function parseColorStops(stopsStr: string): FigmaGradientStop[] {
  const stops: FigmaGradientStop[] = [];
  const transparentIndices: number[] = [];

  // Split by comma, but respect parentheses (for rgb/rgba/hsl)
  const parts = splitMultipleBackgrounds(stopsStr);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

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
      colorStr.toLowerCase() === 'transparent' ||
      colorStr === 'rgba(0, 0, 0, 0)' ||
      colorStr === 'rgba(0,0,0,0)';

    // Allow transparent colors in gradient stops (they create fade effects)
    const color = parseColorToFigma(colorStr, true);
    if (color) {
      stops.push({ color, position });
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

  if (d1 === 'top' && !d2) return 0;
  if (d1 === 'right' && !d2) return 90;
  if (d1 === 'bottom' && !d2) return 180;
  if (d1 === 'left' && !d2) return 270;

  // Corners
  if ((d1 === 'top' && d2 === 'right') || (d1 === 'right' && d2 === 'top')) return 45;
  if ((d1 === 'bottom' && d2 === 'right') || (d1 === 'right' && d2 === 'bottom')) return 135;
  if ((d1 === 'bottom' && d2 === 'left') || (d1 === 'left' && d2 === 'bottom')) return 225;
  if ((d1 === 'top' && d2 === 'left') || (d1 === 'left' && d2 === 'top')) return 315;

  return 180; // Default
}

/**
 * Parse percentage string to 0-1
 */
function parsePercent(value: string): number {
  if (value.endsWith('%')) {
    return parseFloat(value) / 100;
  }
  return parseFloat(value);
}

// ============================================================================
// BOX-SHADOW PARSING → effects[]
// ============================================================================

/**
 * Parse CSS box-shadow to Figma effects array
 * Handles: multiple shadows, inset shadows
 */
export function parseBoxShadowToEffects(boxShadow: string | null): FigmaEffect[] {
  if (!boxShadow || boxShadow === 'none') {
    return [];
  }

  const effects: FigmaEffect[] = [];

  // Split multiple shadows (comma-separated, respect parentheses)
  const shadows = splitMultipleBackgrounds(boxShadow);

  for (const shadow of shadows) {
    const effect = parseSingleShadow(shadow.trim());
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
function parseSingleShadow(shadow: string): FigmaEffect | null {
  if (!shadow || shadow === 'none') return null;

  const isInset = shadow.toLowerCase().includes('inset');
  let cleanShadow = shadow.replace(/inset/gi, '').trim();

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
      const startPattern = new RegExp('^' + pattern.source.replace(/\$/, ''), 'i');
      const match = cleanShadow.match(startPattern);
      if (match) {
        color = parseColorToFigma(match[0].trim());
        cleanShadow = cleanShadow.slice(match[0].length).trim();
        break;
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

  const nums = values.map(v => parseFloat(v.replace('px', '')));
  const [offsetX, offsetY, blur = 0, spread = 0] = nums;

  return {
    type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
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
export function parseBackdropFilterToEffects(backdropFilter: string | null): FigmaEffect[] {
  if (!backdropFilter || backdropFilter === 'none') {
    return [];
  }

  const effects: FigmaEffect[] = [];

  // Extract blur value
  const blurMatch = backdropFilter.match(/blur\s*\(\s*([\d.]+)(?:px)?\s*\)/i);
  if (blurMatch) {
    effects.push({
      type: 'BACKGROUND_BLUR',
      visible: true,
      blurRadius: parseFloat(blurMatch[1]),
    });
  }

  return effects;
}

// ============================================================================
// BORDER PARSING → strokes[]
// ============================================================================

/**
 * Parse CSS borders to Figma strokes array
 */
export function parseBordersToStrokes(
  borderWidth: string | null,
  borderColor: string | null,
  borderStyle: string | null,
  // Individual sides (optional)
  borderTop?: string | null,
  borderRight?: string | null,
  borderBottom?: string | null,
  borderLeft?: string | null,
  resolvedVariables: Map<string, string> = new Map()
): FigmaStroke[] {
  const strokes: FigmaStroke[] = [];

  // Check for individual side borders first
  const hasSideBorders = borderTop || borderRight || borderBottom || borderLeft;

  if (hasSideBorders) {
    // Parse each side separately
    const sides = [
      { css: borderTop, side: 'top' as const },
      { css: borderRight, side: 'right' as const },
      { css: borderBottom, side: 'bottom' as const },
      { css: borderLeft, side: 'left' as const },
    ];

    for (const { css, side } of sides) {
      if (css && css !== 'none' && css !== '0px') {
        const stroke = parseBorderShorthand(css, resolvedVariables);
        if (stroke) {
          stroke.sides = {
            top: side === 'top',
            right: side === 'right',
            bottom: side === 'bottom',
            left: side === 'left',
          };
          strokes.push(stroke);
        }
      }
    }

    return strokes;
  }

  // Use shorthand border properties
  const width = parseFloat(borderWidth || '0');
  if (width <= 0) return strokes;

  const resolvedColor = resolveCSSVariables(borderColor || '', resolvedVariables);
  const color = parseColorToFigma(resolvedColor);
  if (!color) return strokes;

  const style = mapBorderStyle(borderStyle);

  strokes.push({
    color,
    weight: width,
    position: 'INSIDE',
    style,
    sides: { top: true, right: true, bottom: true, left: true },
  });

  return strokes;
}

/**
 * Parse border shorthand (e.g., "2px solid red")
 */
function parseBorderShorthand(border: string, resolvedVariables: Map<string, string>): FigmaStroke | null {
  const resolved = resolveCSSVariables(border, resolvedVariables);

  // Match: width style color
  const match = resolved.match(/^([\d.]+)(?:px)?\s+(solid|dashed|dotted|double|none)\s+(.+)$/i);
  if (!match) return null;

  const [, widthStr, style, colorStr] = match;
  const width = parseFloat(widthStr);
  if (width <= 0) return null;

  const color = parseColorToFigma(colorStr.trim());
  if (!color) return null;

  return {
    color,
    weight: width,
    position: 'INSIDE',
    style: mapBorderStyle(style),
  };
}

/**
 * Map CSS border-style to Figma stroke style
 */
function mapBorderStyle(style: string | null): 'SOLID' | 'DASHED' | 'DOTTED' {
  switch (style?.toLowerCase()) {
    case 'dashed': return 'DASHED';
    case 'dotted': return 'DOTTED';
    default: return 'SOLID';
  }
}

// ============================================================================
// CSS VARIABLE RESOLUTION
// ============================================================================

/**
 * Resolve CSS variables in a string
 */
export function resolveCSSVariables(value: string, variables: Map<string, string>): string {
  if (!value.includes('var(')) return value;

  // Replace var(--name) with resolved value
  return value.replace(/var\(\s*--([^,)]+)(?:\s*,\s*([^)]+))?\s*\)/gi, (match, name, fallback) => {
    const resolved = variables.get(`--${name}`);
    if (resolved) return resolved;
    if (fallback) return fallback.trim();
    return match; // Keep original if can't resolve
  });
}
