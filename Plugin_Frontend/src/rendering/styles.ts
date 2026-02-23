/**
 * Figma style linking and creation
 * Creates and links PaintStyles from CSS variables, plugin colors, and website paints
 * Supports: solid (opaque + semi-transparent), linear/radial/conic gradients
 */

import type {
  ExtractedCSSVariable,
  FigmaColor,
  FigmaFill,
  FigmaGradientStop,
  RenderContext,
  RenderWireframeData,
  WireframeFrame,
  WireframeNode,
} from "../types";
import {
  cssColorToFigmaRGB,
  figmaRGBToHex,
  normalizeColorForLookup,
} from "./colors";
import { calculateRadialGradientTransform } from "./gradients";
import { logger } from "../utils/logger";

// ============================================================================
// Paint Key Serialization
// ============================================================================

/**
 * Convert a FigmaColor (r,g,b in 0-1) to hex string (ignoring alpha)
 */
function figmaColorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Compute a deterministic lookup key from a FigmaFill (tree data).
 *
 * Key formats:
 * - Solid opaque:          "#rrggbb"
 * - Solid semi-transparent: "#rrggbb@NN"  (NN = rounded opacity %)
 * - Gradient:              "GRADIENT_LINEAR:angle:stop1|stop2|..."
 */
export function paintKeyFromFigmaFill(fill: FigmaFill): string {
  if (!fill.visible) return "";

  if (fill.type === "SOLID" && fill.color) {
    const hex = figmaColorToHex(fill.color);
    const normalized = normalizeColorForLookup(hex);
    const effectiveOpacity = fill.opacity * fill.color.a;
    if (effectiveOpacity >= 0.99) return normalized;
    return `${normalized}@${Math.round(effectiveOpacity * 100)}`;
  }

  if (
    (fill.type === "GRADIENT_LINEAR" ||
      fill.type === "GRADIENT_RADIAL" ||
      fill.type === "GRADIENT_CONIC") &&
    fill.stops &&
    fill.stops.length >= 2
  ) {
    const stopsKey = fill.stops
      .map(
        (s) =>
          `${Math.round(s.color.r * 255)},${Math.round(s.color.g * 255)},${Math.round(s.color.b * 255)},${Math.round(s.color.a * 100)}@${Math.round(s.position * 1000)}`
      )
      .join("|");
    return `${fill.type}:${fill.angle || 0}:${stopsKey}`;
  }

  return "";
}

/**
 * Compute a lookup key from an applied Figma Paint object.
 * Only handles solid paints. Gradients need sourceFills for matching
 * (because gradientTransform is a derived value, not the original angle).
 */
export function paintKeyFromPaint(paint: Paint): string {
  if (paint.type === "SOLID") {
    const solid = paint as SolidPaint;
    const hex = figmaRGBToHex(solid.color);
    const normalized = normalizeColorForLookup(hex);
    const opacity = solid.opacity ?? 1;
    if (opacity >= 0.99) return normalized;
    return `${normalized}@${Math.round(opacity * 100)}`;
  }
  return "";
}

/**
 * Create a compound key for a multi-fill FigmaFill array.
 * Returns single key if only one visible fill.
 */
function compoundPaintKey(fills: FigmaFill[]): string {
  const keys = fills
    .filter((f) => f.visible)
    .map((f) => paintKeyFromFigmaFill(f))
    .filter(Boolean);
  if (keys.length === 0) return "";
  if (keys.length === 1) return keys[0];
  return keys.join("+");
}

// ============================================================================
// Style Linking
// ============================================================================

/**
 * Link fill style to a frame if a matching style exists in colorStyleMap.
 * Call this AFTER setting frame.fills.
 *
 * @param sourceFills Optional original FigmaFill[] from the wireframe node.
 *   When provided, enables gradient and semi-transparent style matching.
 *   Without sourceFills, only solid fills can be matched (via Paint key).
 */
export function linkFillStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext,
  sourceFills?: FigmaFill[]
): void {
  if (context.variableMode !== "styles") return;

  const fills = frame.fills as readonly Paint[];
  if (!fills || fills.length === 0) return;

  // Strategy 1: Use sourceFills to derive key (supports ALL paint types)
  if (sourceFills && sourceFills.length > 0) {
    const visibleFills = sourceFills.filter((f) => f.visible);
    if (visibleFills.length === 1) {
      const key = paintKeyFromFigmaFill(visibleFills[0]);
      if (key) {
        const style = context.colorStyleMap.get(key);
        if (style) {
          frame.fillStyleId = style.id;
          return;
        }
      }
    }
    // Multi-fill: try compound key
    if (visibleFills.length > 1) {
      const compound = compoundPaintKey(sourceFills);
      if (compound) {
        const style = context.colorStyleMap.get(compound);
        if (style) {
          frame.fillStyleId = style.id;
          return;
        }
      }
    }
  }

  // Strategy 2: Fallback — derive key from applied Paint (solid fills only)
  if (fills.length === 1) {
    const key = paintKeyFromPaint(fills[0]);
    if (key) {
      const style = context.colorStyleMap.get(key);
      if (style) {
        frame.fillStyleId = style.id;
      }
    }
  }
}

/**
 * Link stroke style to a frame if a matching style exists in colorStyleMap.
 * Call this AFTER setting frame.strokes.
 * Supports both opaque and semi-transparent strokes via compound keys.
 */
export function linkStrokeStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext
): void {
  if (context.variableMode !== "styles") return;

  const strokes = frame.strokes as readonly Paint[];
  if (!strokes || strokes.length === 0) return;

  if (strokes.length === 1) {
    const key = paintKeyFromPaint(strokes[0]);
    if (key) {
      const style = context.colorStyleMap.get(key);
      if (style) {
        frame.strokeStyleId = style.id;
      }
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

// ============================================================================
// Website Paint Styles (Solid + Semi-Transparent + Gradients)
// ============================================================================

const MAX_WEBSITE_PAINT_STYLES = 100;

/**
 * Recursively collect ALL unique paints from the wireframe tree.
 * Collects: solid fills (opaque + semi-transparent), gradients, strokes, text colors.
 *
 * @param paints  Map of paintKey → FigmaFill data (fills + strokes as synthetic fills)
 * @param textColors  Map of normalizedHex → hex (text colors, always opaque)
 */
function collectAllPaintsFromTree(
  node: WireframeNode,
  paints: Map<string, FigmaFill>,
  textColors: Map<string, string>
): void {
  // Collect from fills (ALL types: solid, gradient, etc.)
  if (node.fills) {
    for (const fill of node.fills) {
      if (!fill.visible) continue;
      if (fill.type === "IMAGE_PLACEHOLDER") continue;
      const key = paintKeyFromFigmaFill(fill);
      if (key && !paints.has(key)) {
        paints.set(key, fill);
      }
    }
  }

  // Collect from strokes (as synthetic solid FigmaFills)
  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.color) {
        const hex = figmaColorToHex(stroke.color);
        const normalized = normalizeColorForLookup(hex);
        const effectiveOpacity = stroke.color.a;
        const key =
          effectiveOpacity >= 0.99
            ? normalized
            : `${normalized}@${Math.round(effectiveOpacity * 100)}`;
        if (key && !paints.has(key)) {
          paints.set(key, {
            type: "SOLID",
            visible: true,
            opacity: 1,
            color: stroke.color,
          });
        }
      }
    }
  }

  // Collect from effects (shadow colors — opaque solid fills only)
  if (node.effects) {
    for (const effect of node.effects) {
      if (effect.color) {
        const hex = figmaColorToHex(effect.color);
        const normalized = normalizeColorForLookup(hex);
        if (normalized && normalized !== "transparent" && !paints.has(normalized)) {
          paints.set(normalized, {
            type: "SOLID",
            visible: true,
            opacity: 1,
            color: effect.color,
          });
        }
      }
    }
  }

  // Collect text colors (opaque hex, for text fill linking)
  if (node.textColor) {
    const parsed = cssColorToFigmaRGB(node.textColor);
    if (parsed) {
      const hex = figmaRGBToHex(parsed.color);
      const normalized = normalizeColorForLookup(hex);
      if (normalized && normalized !== "transparent") {
        textColors.set(normalized, hex);
      }
    }
  }

  if (node.styledSegments) {
    for (const seg of node.styledSegments) {
      if (seg.color) {
        const parsed = cssColorToFigmaRGB(seg.color);
        if (parsed) {
          const hex = figmaRGBToHex(parsed.color);
          const normalized = normalizeColorForLookup(hex);
          if (normalized && normalized !== "transparent") {
            textColors.set(normalized, hex);
          }
        }
      }
    }
  }

  // Collect legacy color fields
  if (node.backgroundColor) {
    const parsed = cssColorToFigmaRGB(node.backgroundColor);
    if (parsed) {
      const hex = figmaRGBToHex(parsed.color);
      const normalized = normalizeColorForLookup(hex);
      if (normalized && normalized !== "transparent") {
        textColors.set(normalized, hex);
      }
    }
  }

  if (node.borderColor) {
    const parsed = cssColorToFigmaRGB(node.borderColor);
    if (parsed) {
      const hex = figmaRGBToHex(parsed.color);
      const normalized = normalizeColorForLookup(hex);
      if (normalized && normalized !== "transparent") {
        textColors.set(normalized, hex);
      }
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      collectAllPaintsFromTree(child, paints, textColors);
    }
  }
}

/**
 * Create Figma PaintStyles from ALL unique paints in the wireframe tree.
 * Used when colorMode === "website" and variableMode === "styles".
 *
 * Supports:
 * - Solid opaque fills:          WEB/#RRGGBB  or  WEB/--var-name
 * - Solid semi-transparent:      WEB/#RRGGBB NN%
 * - Linear gradients:            WEB/Linear #start...#end
 * - Radial gradients:            WEB/Radial #start...#end
 * - Conic/Angular gradients:     WEB/Angular #start...#end
 */
export async function createWebsiteColorStyles(
  frames: WireframeFrame[],
  cssVariables: ExtractedCSSVariable[],
  sourceUrl: string
): Promise<Map<string, PaintStyle>> {
  const styleMap = new Map<string, PaintStyle>();

  // Step 1: Build reverse map from normalized hex -> CSS variable name
  const hexToVarName = new Map<string, string>();
  for (const variable of cssVariables) {
    const parsed = cssColorToFigmaRGB(variable.value);
    if (parsed) {
      const hex = figmaRGBToHex(parsed.color);
      const normalized = normalizeColorForLookup(hex);
      if (normalized) {
        hexToVarName.set(normalized, variable.name);
      }
    }
  }

  // Step 2: Collect ALL unique paints from all frame trees
  const allPaints = new Map<string, FigmaFill>();
  const textColors = new Map<string, string>();
  for (const frame of frames) {
    if (frame.tree) {
      collectAllPaintsFromTree(frame.tree, allPaints, textColors);
    }
  }

  // Step 3: Add text colors as solid paint entries (if not already collected)
  for (const [normalized, hex] of Array.from(textColors)) {
    if (!allPaints.has(normalized)) {
      const parsed = cssColorToFigmaRGB(hex);
      if (parsed) {
        allPaints.set(normalized, {
          type: "SOLID",
          visible: true,
          opacity: 1,
          color: { r: parsed.color.r, g: parsed.color.g, b: parsed.color.b, a: 1 },
        });
      }
    }
  }

  if (allPaints.size === 0) {
    return styleMap;
  }

  logger.info("Creating website paint styles from tree", {
    uniquePaints: allPaints.size,
    cssVariableMatches: hexToVarName.size,
  });

  // Get existing styles once (avoid repeated queries)
  const existingStyles = figma.getLocalPaintStyles();
  let stylesCreated = 0;

  // Step 4: Create PaintStyle for each unique paint
  for (const [key, fill] of Array.from(allPaints)) {
    if (stylesCreated >= MAX_WEBSITE_PAINT_STYLES) break;

    try {
      let styleName: string;
      let paints: Paint[];

      if (fill.type === "SOLID" && fill.color) {
        const hex = figmaColorToHex(fill.color);
        const normalized = normalizeColorForLookup(hex);
        const effectiveOpacity = fill.opacity * fill.color.a;
        const varName = hexToVarName.get(normalized);

        if (effectiveOpacity >= 0.99) {
          styleName = varName
            ? `WEB/${varName}`
            : `WEB/${hex.toUpperCase()}`;
        } else {
          const pct = Math.round(effectiveOpacity * 100);
          styleName = varName
            ? `WEB/${varName} ${pct}%`
            : `WEB/${hex.toUpperCase()} ${pct}%`;
        }

        paints = [
          {
            type: "SOLID",
            color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
            opacity: effectiveOpacity,
          },
        ];
      } else if (
        fill.type === "GRADIENT_LINEAR" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const firstHex = figmaColorToHex(fill.stops[0].color).toUpperCase();
        const lastHex = figmaColorToHex(
          fill.stops[fill.stops.length - 1].color
        ).toUpperCase();
        styleName = `WEB/Linear ${firstHex}...${lastHex}`;

        const angle = fill.angle || 180;
        const angleRad = ((angle - 90) * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        paints = [
          {
            type: "GRADIENT_LINEAR",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: {
                r: s.color.r,
                g: s.color.g,
                b: s.color.b,
                a: s.color.a,
              },
            })),
            gradientTransform: [
              [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
              [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
            ],
          } as GradientPaint,
        ];
      } else if (
        fill.type === "GRADIENT_RADIAL" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const firstHex = figmaColorToHex(fill.stops[0].color).toUpperCase();
        const lastHex = figmaColorToHex(
          fill.stops[fill.stops.length - 1].color
        ).toUpperCase();
        styleName = `WEB/Radial ${firstHex}...${lastHex}`;

        const radialTransform = calculateRadialGradientTransform(fill);
        paints = [
          {
            type: "GRADIENT_RADIAL",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: {
                r: s.color.r,
                g: s.color.g,
                b: s.color.b,
                a: s.color.a,
              },
            })),
            gradientTransform: radialTransform,
          } as GradientPaint,
        ];
      } else if (
        fill.type === "GRADIENT_CONIC" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const firstHex = figmaColorToHex(fill.stops[0].color).toUpperCase();
        const lastHex = figmaColorToHex(
          fill.stops[fill.stops.length - 1].color
        ).toUpperCase();
        styleName = `WEB/Angular ${firstHex}...${lastHex}`;

        paints = [
          {
            type: "GRADIENT_ANGULAR",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: {
                r: s.color.r,
                g: s.color.g,
                b: s.color.b,
                a: s.color.a,
              },
            })),
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          } as GradientPaint,
        ];
      } else {
        continue;
      }

      // Check if style already exists
      const existing = existingStyles.find((s) => s.name === styleName);
      if (existing) {
        styleMap.set(key, existing);
        continue;
      }

      // Create new paint style
      const style = figma.createPaintStyle();
      style.name = styleName;
      style.paints = paints;

      styleMap.set(key, style);
      stylesCreated++;
    } catch (err) {
      logger.warn("Failed to create website paint style", {
        key,
        error: err,
      });
    }
  }

  return styleMap;
}

// ============================================================================
// Text Styles
// ============================================================================

const MAX_TEXT_STYLES = 30;

/**
 * Map a numeric font weight to a Figma font style string
 */
function fontWeightToStyle(weight: number): string {
  if (weight >= 600) return "Bold";
  if (weight >= 500) return "Medium";
  return "Regular";
}

/**
 * Recursively collect unique typography combinations from the wireframe tree.
 */
function collectTypographyFromTree(
  node: WireframeNode,
  combos: Map<string, { fontFamily: string; fontSize: number; fontWeight: number }>,
  pluginFontFamily: string,
  fontMode: "plugin" | "website"
): void {
  // Only collect from text nodes
  if ((node.type === "text" || node.textContent) && node.fontSize) {
    const family = fontMode === "plugin" ? pluginFontFamily : (node.fontFamily || pluginFontFamily);
    const fontSize = Math.max(node.fontSize || 14, 8);
    const fontWeight = node.fontWeight || 400;
    const styleStr = fontWeightToStyle(fontWeight);
    const key = `${family}-${styleStr}-${fontSize}`;

    if (!combos.has(key)) {
      combos.set(key, { fontFamily: family, fontSize, fontWeight });
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      collectTypographyFromTree(child, combos, pluginFontFamily, fontMode);
    }
  }
}

/**
 * Create Figma TextStyles from unique typography combinations in the tree.
 *
 * Naming:
 * - Plugin mode: W2W/Montserrat-Bold-24
 * - Website mode: WEB/SpaceGrotesk-Bold-24
 */
export async function createTextStyles(
  frames: WireframeFrame[],
  fontFamily: string,
  fontMode: "plugin" | "website"
): Promise<Map<string, TextStyle>> {
  const textStyleMap = new Map<string, TextStyle>();

  // Collect unique typography combos
  const combos = new Map<string, { fontFamily: string; fontSize: number; fontWeight: number }>();
  for (const frame of frames) {
    if (frame.tree) {
      collectTypographyFromTree(frame.tree, combos, fontFamily, fontMode);
    }
  }

  if (combos.size === 0) {
    return textStyleMap;
  }

  logger.info("Creating text styles", {
    uniqueCombos: combos.size,
    fontMode,
  });

  // Get existing text styles once
  const existingTextStyles = figma.getLocalTextStyles();
  let stylesCreated = 0;
  const prefix = fontMode === "plugin" ? "W2W" : "WEB";

  for (const [key, combo] of Array.from(combos)) {
    if (stylesCreated >= MAX_TEXT_STYLES) break;

    const styleStr = fontWeightToStyle(combo.fontWeight);
    const styleName = `${prefix}/${combo.fontFamily}-${styleStr}-${combo.fontSize}`;

    try {
      // Try to load the font first -- skip if unavailable
      await figma.loadFontAsync({ family: combo.fontFamily, style: styleStr });

      // Check if style already exists
      const existing = existingTextStyles.find((s) => s.name === styleName);
      if (existing) {
        textStyleMap.set(key, existing);
        continue;
      }

      // Create new text style
      const textStyle = figma.createTextStyle();
      textStyle.name = styleName;
      textStyle.fontName = { family: combo.fontFamily, style: styleStr };
      textStyle.fontSize = combo.fontSize;

      textStyleMap.set(key, textStyle);
      stylesCreated++;
    } catch {
      // Font not available -- skip this text style
      logger.warn("Skipping text style (font not available)", {
        font: combo.fontFamily,
        style: styleStr,
      });
    }
  }

  return textStyleMap;
}
