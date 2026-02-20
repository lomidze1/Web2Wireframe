/**
 * Figma style linking and creation
 * Creates and links PaintStyles from CSS variables and plugin colors
 */

import type {
  ExtractedCSSVariable,
  RenderContext,
  RenderWireframeData,
} from "../types";
import {
  cssColorToFigmaRGB,
  figmaRGBToHex,
  normalizeColorForLookup,
} from "./colors";
import { logger } from "../utils/logger";

// ============================================================================
// Style Linking
// ============================================================================

/**
 * Link fill style to a frame if a matching style exists in colorStyleMap
 * Call this AFTER setting frame.fills to link the style
 */
export function linkFillStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext
): void {
  // Only link styles when "Create Figma Styles" is enabled
  if (context.variableMode !== "styles") return;

  // Get fills (may be readonly, need to cast)
  const fills = frame.fills as readonly Paint[];
  if (!fills || fills.length === 0) return;

  // For now, only handle single solid fill (most common case)
  if (fills.length === 1 && fills[0].type === "SOLID") {
    const solidFill = fills[0] as SolidPaint;
    const hex = figmaRGBToHex(solidFill.color);
    const normalized = normalizeColorForLookup(hex);
    const style = context.colorStyleMap.get(normalized);

    if (style) {
      frame.fillStyleId = style.id;
    }
  }
}

/**
 * Link stroke style to a frame if a matching style exists in colorStyleMap
 * Call this AFTER setting frame.strokes to link the style
 */
export function linkStrokeStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext
): void {
  // Only link styles when "Create Figma Styles" is enabled
  if (context.variableMode !== "styles") return;

  // Get strokes (may be readonly, need to cast)
  const strokes = frame.strokes as readonly Paint[];
  if (!strokes || strokes.length === 0) return;

  // For now, only handle single solid stroke
  if (strokes.length === 1 && strokes[0].type === "SOLID") {
    const solidStroke = strokes[0] as SolidPaint;
    const hex = figmaRGBToHex(solidStroke.color);
    const normalized = normalizeColorForLookup(hex);
    const style = context.colorStyleMap.get(normalized);

    if (style) {
      frame.strokeStyleId = style.id;
    }
  }
}

// ============================================================================
// Style Creation
// ============================================================================

/**
 * Check if a color value is a valid color (not a spacing/size value)
 */
export function isColorValue(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();

  // Check for hex colors
  if (trimmed.startsWith("#")) return true;

  // Check for rgb/rgba/hsl/hsla
  if (
    trimmed.startsWith("rgb") ||
    trimmed.startsWith("hsl") ||
    trimmed.startsWith("oklab") ||
    trimmed.startsWith("oklch")
  )
    return true;

  // Check for named colors (common ones)
  const namedColors = [
    "black",
    "white",
    "red",
    "green",
    "blue",
    "yellow",
    "transparent",
  ];
  if (namedColors.includes(trimmed)) return true;

  return false;
}

/**
 * Create Figma color styles from CSS variables
 */
export async function createColorStylesFromVariables(
  cssVariables: ExtractedCSSVariable[],
  sourceUrl: string
): Promise<Map<string, PaintStyle>> {
  const styleMap = new Map<string, PaintStyle>();

  // Filter to only color variables
  const colorVariables = cssVariables.filter(
    (v) => v.category === "color" || isColorValue(v.value)
  );

  if (colorVariables.length === 0) {
    return styleMap;
  }

  // Extract hostname for style naming
  let hostname = "Website";
  try {
    hostname = new URL(sourceUrl).hostname.replace("www.", "").split(".")[0];
    hostname = hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    // Use default
  }

  logger.info("Creating color styles from CSS variables", {
    variableCount: colorVariables.length,
  });

  for (const variable of colorVariables) {
    try {
      const parsed = cssColorToFigmaRGB(variable.value);
      if (!parsed) continue;

      // Create style name: "Website / --variable-name"
      const styleName = `${hostname} / ${variable.name}`;

      // Check if style already exists
      const existingStyles = figma.getLocalPaintStyles();
      const existing = existingStyles.find((s) => s.name === styleName);

      if (existing) {
        styleMap.set(variable.name, existing);
        continue;
      }

      // Create new paint style
      const style = figma.createPaintStyle();
      style.name = styleName;
      style.paints = [
        {
          type: "SOLID",
          color: parsed.color,
          opacity: parsed.opacity,
        },
      ];

      styleMap.set(variable.name, style);
    } catch (err) {
      logger.warn("Failed to create style for variable", {
        variable: variable.name,
        error: err,
      });
    }
  }

  return styleMap;
}

/**
 * Create Figma color styles from plugin colors (for Plugin Colors mode)
 */
export async function createPluginColorStyles(
  pluginColors: RenderWireframeData["pluginColors"]
): Promise<Map<string, PaintStyle>> {
  const styleMap = new Map<string, PaintStyle>();

  // Plugin color roles (5 colors total)
  const colorRoles: (keyof typeof pluginColors)[] = [
    "text",
    "background",
    "secondary",
    "surface",
    "accent",
  ];

  logger.info("Creating plugin color styles", {
    colorCount: colorRoles.length,
  });

  for (const key of colorRoles) {
    try {
      const colorValue = pluginColors[key];
      // Skip if color value is undefined
      if (!colorValue) continue;
      const parsed = cssColorToFigmaRGB(colorValue);
      if (!parsed) continue;

      // Create style name: "W2W/--text", "W2W/--background", etc.
      const styleName = `W2W/--${key}`;

      // Check if style already exists
      const existingStyles = figma.getLocalPaintStyles();
      const existing = existingStyles.find((s) => s.name === styleName);

      if (existing) {
        // Update existing style with new color
        existing.paints = [
          {
            type: "SOLID",
            color: parsed.color,
            opacity: parsed.opacity,
          },
        ];
        styleMap.set(key, existing);
        continue;
      }

      // Create new paint style
      const style = figma.createPaintStyle();
      style.name = styleName;
      style.paints = [
        {
          type: "SOLID",
          color: parsed.color,
          opacity: parsed.opacity,
        },
      ];

      styleMap.set(key, style);
    } catch (err) {
      logger.warn("Failed to create plugin color style", {
        colorRole: key,
        error: err,
      });
    }
  }

  return styleMap;
}
