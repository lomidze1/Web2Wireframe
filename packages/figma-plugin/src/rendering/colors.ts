/**
 * Color utilities for wireframe rendering
 * Handles color conversion, role determination, and contrast checking
 */

import type {
  ColorRole,
  FigmaFill,
  RenderContext,
  RenderWireframeData,
} from "../types";

// ============================================================================
// Color Conversion
// ============================================================================

/**
 * Convert hex color to Figma RGB (0-1 range)
 * Supports 6-digit (#RRGGBB) and 8-digit (#RRGGBBAA) hex
 */
export function hexToFigmaRGB(hex: string): RGB {
  if (!hex || hex === "transparent" || hex === "null") {
    return { r: 0.96, g: 0.96, b: 0.96 }; // Default light gray
  }

  let cleanHex = hex.replace("#", "");

  // Expand 3-digit (#fff) and 4-digit (#fffc) shorthand — these previously
  // fell through to the light-gray fallback.
  if (cleanHex.length === 3 || cleanHex.length === 4) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  // Handle 8-digit hex (with alpha) - extract first 6 digits
  const colorHex = cleanHex.length === 8 ? cleanHex.slice(0, 6) : cleanHex;

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorHex);

  if (!result) {
    return { r: 0.96, g: 0.96, b: 0.96 };
  }

  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

/**
 * Shift a Figma RGB color's lightness by `amount` (0..1 range in HSL).
 * Positive amount lightens, negative darkens. Near-black colors (L < 0.15)
 * with a negative amount invert direction and lighten instead, so dark-button
 * hover produces a visible delta instead of an imperceptible blacker-black.
 */
export function shiftLightness(rgb: RGB, amount: number): RGB {
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l0 = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l0 > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  const effective = l0 < 0.15 && amount < 0 ? -amount : amount;
  const l = Math.max(0, Math.min(1, l0 + effective));

  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue2rgb(h + 1 / 3), g: hue2rgb(h), b: hue2rgb(h - 1 / 3) };
}

/**
 * Parse CSS color to Figma RGB (handles hex, rgb, rgba)
 */
export function cssColorToFigmaRGB(
  color: string
): { color: RGB; opacity: number } | null {
  if (!color || color === "transparent") return null;

  // Handle hex (3/4/6/8 digit)
  if (color.startsWith("#")) {
    const cleanHex = color.replace("#", "");
    let opacity = 1;

    // 8-digit hex has alpha in last 2 characters; 4-digit in the last one
    if (cleanHex.length === 8) {
      opacity = parseInt(cleanHex.slice(6, 8), 16) / 255;
    } else if (cleanHex.length === 4) {
      opacity = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
    }

    return { color: hexToFigmaRGB(color), opacity };
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i
  );
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    return {
      color: {
        r: parseInt(r) / 255,
        g: parseInt(g) / 255,
        b: parseInt(b) / 255,
      },
      opacity: a !== undefined ? parseFloat(a) : 1,
    };
  }

  return null;
}

/**
 * Convert Figma RGB (0-1 range) to hex color string
 */
export function figmaRGBToHex(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Normalize color value for style lookup.
 * ALWAYS converts to lowercase 6-digit hex (#rrggbb) for consistent matching.
 * This ensures rgb(), rgba(), 3-digit hex, 8-digit hex, and 6-digit hex
 * all normalize to the same key when they represent the same color.
 */
export function normalizeColorForLookup(color: string): string {
  if (!color) return "";
  const trimmed = color.trim().toLowerCase();

  // Handle hex colors
  if (trimmed.startsWith("#")) {
    const cleanHex = trimmed.slice(1);
    // Convert 3-digit to 6-digit
    if (cleanHex.length === 3) {
      const r = cleanHex[0];
      const g = cleanHex[1];
      const b = cleanHex[2];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    // Strip alpha from 8-digit hex, keep first 6
    if (cleanHex.length === 8) {
      return `#${cleanHex.slice(0, 6)}`;
    }
    return trimmed;
  }

  // Convert rgb/rgba to hex for consistent lookup
  const rgbMatch = trimmed.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  return trimmed;
}

/**
 * Convert a CSS color string to an opacity-aware paint key.
 * Matches the key format produced by paintKeyFromFigmaFill in styles.ts.
 *
 * Examples:
 *   "#3b82f6"                → "#3b82f6"
 *   "rgba(255,255,255,0.65)" → "#ffffff@65"
 *   "#ffffffa6"              → "#ffffff@65"
 */
export function paintKeyFromCSSColor(cssColor: string): string {
  const parsed = cssColorToFigmaRGB(cssColor);
  if (!parsed) return normalizeColorForLookup(cssColor);
  const hex = figmaRGBToHex(parsed.color);
  const normalized = normalizeColorForLookup(hex);
  if (parsed.opacity >= 0.99) return normalized;
  return `${normalized}@${Math.round(parsed.opacity * 100)}`;
}

/**
 * Resolve CSS variables in a string (e.g., gradient or color)
 */
export function resolveCSSVariables(
  value: string,
  variableValueMap: Map<string, string>
): string {
  if (!value || !value.includes("var(")) return value;

  // Replace all var(--name) with resolved values
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g,
    (match, varName, fallback) => {
      const resolved = variableValueMap.get(varName);
      if (resolved) return resolved;
      if (fallback) return fallback.trim();
      return match; // Keep original if not found
    }
  );
}

// ============================================================================
// Color Analysis
// ============================================================================

/**
 * Check if a color is "light" (closer to white than black)
 */
export function isLightColorValue(color: {
  r: number;
  g: number;
  b: number;
}): boolean {
  // Using relative luminance formula
  const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  return luminance > 0.5; // Threshold at 50%
}

/**
 * Check if a color is "saturated" (colorful, not gray/white/black)
 * Saturated colors indicate "highlighted" or "featured" elements in wireframe context
 */
export function isSaturatedColor(color: {
  r: number;
  g: number;
  b: number;
}): boolean {
  // Calculate saturation using HSL-like approach
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const diff = max - min;

  // If max is 0, it's black - not saturated
  if (max === 0) return false;

  // Saturation = (max - min) / max
  const saturation = diff / max;

  // Also check that it's not too dark or too light
  const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  const isNotTooExtreme = luminance > 0.1 && luminance < 0.9;

  // Consider saturated if saturation > 30% and not extreme luminance
  return saturation > 0.3 && isNotTooExtreme;
}

/**
 * Check if two colors are too similar (same or very close)
 * Uses a tolerance threshold to catch colors that look the same visually
 */
export function colorsAreTooSimilar(
  color1: { r: number; g: number; b: number } | null | undefined,
  color2: { r: number; g: number; b: number } | null | undefined,
  tolerance: number = 0.05
): boolean {
  if (!color1 || !color2) return false;

  const rDiff = Math.abs(color1.r - color2.r);
  const gDiff = Math.abs(color1.g - color2.g);
  const bDiff = Math.abs(color1.b - color2.b);

  // If all channels are within tolerance, colors are too similar
  return rDiff < tolerance && gDiff < tolerance && bDiff < tolerance;
}

/**
 * Check if an element is highlighted/active/featured based on className
 * Used to detect pricing cards, featured sections, etc.
 */
export function isHighlightedElement(className?: string): boolean {
  if (!className) return false;
  const classLower = className.toLowerCase();
  return /\b(active|featured|popular|highlighted|selected|primary|recommended|best|pro|premium|enterprise)\b/.test(
    classLower
  );
}

// ============================================================================
// Color Role Determination
// ============================================================================

/**
 * Determine the color role based on element context
 * Used when colorMode is "plugin" to map any color to 5 plugin colors
 *
 * CRITICAL RULE: "text" role is ONLY for actual text elements!
 * Fill/background elements should NEVER use "text" color
 */
export function determineColorRole(
  elementType: "text" | "fill" | "stroke",
  tag?: string,
  isLightColor?: boolean,
  _parentBackgroundIsLight?: boolean,
  className?: string
): ColorRole {
  // Strokes/borders ALWAYS use text color (#11151A) in plugin mode
  if (elementType === "stroke") {
    return "text";
  }

  // Text elements ONLY use text color
  if (elementType === "text") {
    return "text";
  }

  // FILL colors - NEVER return "text" role here!
  if (tag) {
    const tagLower = tag.toLowerCase();

    // Buttons, links, CTAs use accent
    if (
      ["button", "a", "input[type=submit]", "input[type=button]"].includes(
        tagLower
      )
    ) {
      return "accent";
    }

    // Header/Footer - use background to stand out
    if (["header", "footer"].includes(tagLower)) {
      return "background";
    }

    // Sections use surface or background
    if (["section"].includes(tagLower)) {
      return isLightColor ? "background" : "surface";
    }

    // Cards, containers - check for highlighted/active state
    if (
      [
        "div",
        "article",
        "aside",
        "main",
        "nav",
        "form",
        "ul",
        "ol",
        "li",
      ].includes(tagLower)
    ) {
      if (!isLightColor && isHighlightedElement(className)) {
        return "secondary";
      }
      return isLightColor ? "background" : "surface";
    }

    // Body/html use background
    if (["body", "html"].includes(tagLower)) {
      return "background";
    }
  }

  // Default: light colors → background, dark colors → surface
  return isLightColor ? "background" : "surface";
}

/**
 * Get the appropriate plugin color for an element
 */
export function getPluginColorForRole(
  role: ColorRole,
  pluginColors: RenderWireframeData["pluginColors"]
): string {
  const colorMap: Record<ColorRole, string> = {
    text: pluginColors.text,
    background: pluginColors.background,
    secondary: pluginColors.secondary,
    surface: pluginColors.surface,
    accent: pluginColors.accent,
  };
  return colorMap[role] || pluginColors.surface;
}

/**
 * Get an alternative plugin color when child would match parent background
 */
export function getAlternativePluginColor(
  currentRole: ColorRole,
  pluginColors: RenderWireframeData["pluginColors"],
  parentBgColor: { r: number; g: number; b: number } | null | undefined
): string {
  if (!parentBgColor) return getPluginColorForRole(currentRole, pluginColors);

  const currentColorHex = getPluginColorForRole(currentRole, pluginColors);
  const currentColorRgb = cssColorToFigmaRGB(currentColorHex);
  if (!currentColorRgb) return currentColorHex;

  // Check if current color matches parent
  if (!colorsAreTooSimilar(currentColorRgb.color, parentBgColor)) {
    return currentColorHex;
  }

  // Color conflicts with parent - find alternative
  const isParentLight = isLightColorValue(parentBgColor);

  if (isParentLight) {
    const lightAlternatives: ColorRole[] = [
      "surface",
      "accent",
      "background",
      "secondary",
    ];
    for (const altRole of lightAlternatives) {
      if (altRole === currentRole) continue;
      const altHex = getPluginColorForRole(altRole, pluginColors);
      const altRgb = cssColorToFigmaRGB(altHex);
      if (altRgb && !colorsAreTooSimilar(altRgb.color, parentBgColor)) {
        return altHex;
      }
    }
    return pluginColors.secondary;
  } else {
    const darkAlternatives: ColorRole[] = ["text", "secondary", "accent"];
    for (const altRole of darkAlternatives) {
      if (altRole === currentRole) continue;
      const altHex = getPluginColorForRole(altRole, pluginColors);
      const altRgb = cssColorToFigmaRGB(altHex);
      if (altRgb && !colorsAreTooSimilar(altRgb.color, parentBgColor)) {
        return altHex;
      }
    }
    return pluginColors.surface;
  }
}

// ============================================================================
// Text Color Utilities
// ============================================================================

/**
 * Determine the appropriate text color based on background
 * Uses WCAG contrast checking to ensure readability
 */
export function getTextColorForBackground(
  bgColor: { r: number; g: number; b: number } | null,
  pluginColors: RenderWireframeData["pluginColors"]
): string {
  if (!bgColor) {
    return pluginColors.text;
  }

  const bgIsLight = isLightColorValue(bgColor);
  return bgIsLight ? pluginColors.text : pluginColors.background;
}

/**
 * Determine the text color for a node
 * SIMPLIFIED: All text uses the text color (black) for consistency
 */
export function getSmartTextColor(
  _node: { tag?: string; fills?: FigmaFill[] },
  context: RenderContext,
  _isLink: boolean = false
): string {
  return context.pluginColors.text;
}

/**
 * Get the dominant color from Figma Paint[] array
 * Used to track the ACTUAL applied color for parent-child contrast detection
 */
export function getDominantColorFromPaints(
  paints: Paint[] | undefined
): { r: number; g: number; b: number } | null {
  if (!paints || paints.length === 0) return null;

  for (const paint of paints) {
    if (paint.type === "SOLID") {
      return { r: paint.color.r, g: paint.color.g, b: paint.color.b };
    }

    // For gradients, use the first stop color
    if (
      (paint.type === "GRADIENT_LINEAR" ||
        paint.type === "GRADIENT_RADIAL" ||
        paint.type === "GRADIENT_ANGULAR") &&
      paint.gradientStops &&
      paint.gradientStops.length > 0
    ) {
      const firstStop = paint.gradientStops[0];
      return {
        r: firstStop.color.r,
        g: firstStop.color.g,
        b: firstStop.color.b,
      };
    }
  }

  return null;
}
