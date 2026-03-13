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
  paintKeyFromCSSColor,
} from "./colors";
import {
  calculateRadialGradientTransform,
  calculateLinearGradientTransform,
} from "./gradients";
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

  // Strategy 0: Variable-first lookup (direct CSS variable → PaintStyle)
  if (sourceFills && context.variableStyleMap) {
    const visibleFills = sourceFills.filter((f) => f.visible);
    if (visibleFills.length === 1 && visibleFills[0].cssVariable) {
      const style = context.variableStyleMap.get(visibleFills[0].cssVariable);
      if (style) {
        frame.fillStyleId = style.id;
        return;
      }
    }
  }

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
  context: RenderContext,
  sourceStrokes?: import("../types").FigmaStroke[]
): void {
  if (context.variableMode !== "styles") return;

  const strokes = frame.strokes as readonly Paint[];
  if (!strokes || strokes.length === 0) return;

  // Strategy 0: Variable-first lookup
  if (sourceStrokes && sourceStrokes.length > 0 && context.variableStyleMap) {
    if (sourceStrokes[0].cssVariable) {
      const style = context.variableStyleMap.get(sourceStrokes[0].cssVariable);
      if (style) {
        frame.strokeStyleId = style.id;
        return;
      }
    }
  }

  // Strategy 1: Fallback — derive key from applied Paint
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

// createColorStylesFromVariables removed — replaced by createUnifiedWebsiteColorStyles

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
// Website Paint Styles — Unified Creation
// ============================================================================

/**
 * Recursively collect ALL unique paints from the wireframe tree.
 * Collects: solid fills (opaque + semi-transparent), gradients, strokes, text colors.
 *
 * Uses opacity-aware paint keys so semi-transparent colors are tracked separately.
 *
 * @param paints  Map of paintKey → FigmaFill data (fills + strokes as synthetic fills)
 * @param textColors  Map of paintKey → CSS color string (text colors with opacity)
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

  // Collect from effects (shadow colors)
  if (node.effects) {
    for (const effect of node.effects) {
      if (effect.color) {
        const hex = figmaColorToHex(effect.color);
        const normalized = normalizeColorForLookup(hex);
        const effectiveOpacity = effect.color.a;
        const key =
          effectiveOpacity >= 0.99
            ? normalized
            : `${normalized}@${Math.round(effectiveOpacity * 100)}`;
        if (key && key !== "transparent" && !paints.has(key)) {
          paints.set(key, {
            type: "SOLID",
            visible: true,
            opacity: effectiveOpacity >= 0.99 ? 1 : effectiveOpacity,
            color: { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: 1 },
          });
        }
      }
    }
  }

  // Collect text colors with opacity-aware keys
  if (node.textColor) {
    const key = paintKeyFromCSSColor(node.textColor);
    if (key && key !== "transparent" && !paints.has(key)) {
      textColors.set(key, node.textColor);
    }
  }

  if (node.styledSegments) {
    for (const seg of node.styledSegments) {
      if (seg.color) {
        const key = paintKeyFromCSSColor(seg.color);
        if (key && key !== "transparent" && !paints.has(key)) {
          textColors.set(key, seg.color);
        }
      }
    }
  }

  // Collect legacy color fields with opacity-aware keys
  if (node.backgroundColor) {
    const key = paintKeyFromCSSColor(node.backgroundColor);
    if (key && key !== "transparent" && !paints.has(key)) {
      textColors.set(key, node.backgroundColor);
    }
  }

  if (node.borderColor) {
    const key = paintKeyFromCSSColor(node.borderColor);
    if (key && key !== "transparent" && !paints.has(key)) {
      textColors.set(key, node.borderColor);
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
 * Collect multi-fill combinations from the tree for compound PaintStyle creation.
 * For nodes with 2+ visible non-placeholder fills, stores the fills keyed by compound key.
 */
function collectCompoundFillsFromTree(
  node: WireframeNode,
  compounds: Map<string, FigmaFill[]>
): void {
  if (node.fills) {
    const visible = node.fills.filter(
      (f) => f.visible && f.type !== "IMAGE_PLACEHOLDER"
    );
    if (visible.length > 1) {
      const key = visible
        .map((f) => paintKeyFromFigmaFill(f))
        .filter(Boolean)
        .join("+");
      if (key && !compounds.has(key)) {
        compounds.set(key, visible);
      }
    }
  }
  if (node.children) {
    for (const child of node.children) {
      collectCompoundFillsFromTree(child, compounds);
    }
  }
}

/**
 * Convert a FigmaFill to a native Figma Paint object.
 * Handles solid, linear/radial/conic gradients.
 */
function figmaFillToPaint(fill: FigmaFill): Paint | null {
  if (fill.type === "SOLID" && fill.color) {
    const effectiveOpacity = fill.opacity * fill.color.a;
    return {
      type: "SOLID",
      color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
      opacity: effectiveOpacity,
    } as SolidPaint;
  }

  if (fill.type === "GRADIENT_LINEAR" && fill.stops && fill.stops.length >= 2) {
    return {
      type: "GRADIENT_LINEAR",
      gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
      })),
      gradientTransform: calculateLinearGradientTransform(
        fill.angle || 180,
        fill.elementWidth,
        fill.elementHeight
      ),
    } as GradientPaint;
  }

  if (fill.type === "GRADIENT_RADIAL" && fill.stops && fill.stops.length >= 2) {
    const radialTransform = calculateRadialGradientTransform(fill);
    return {
      type: "GRADIENT_RADIAL",
      gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
      })),
      gradientTransform: radialTransform,
    } as GradientPaint;
  }

  if (fill.type === "GRADIENT_CONIC" && fill.stops && fill.stops.length >= 2) {
    return {
      type: "GRADIENT_ANGULAR",
      gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
      })),
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    } as GradientPaint;
  }

  return null;
}

/**
 * Create Figma PaintStyles for ALL unique colors in the wireframe tree.
 * Unified function: replaces createColorStylesFromVariables + createWebsiteColorStyles.
 *
 * Naming convention:
 * - CSS variable colors:    WEB/--variable-name
 * - Auto-generated colors:  WEB/--created-variable-01, WEB/--created-variable-02, ...
 *
 * Same hex+opacity = same style (reused via paintKey Map).
 * All website styles use WEB/ prefix. Plugin styles use W2W/ prefix (unchanged).
 */
export async function createUnifiedWebsiteColorStyles(
  frames: WireframeFrame[],
  cssVariables: ExtractedCSSVariable[]
): Promise<{ colorStyleMap: Map<string, PaintStyle>; variableStyleMap: Map<string, PaintStyle> }> {
  const colorStyleMap = new Map<string, PaintStyle>();
  const variableStyleMap = new Map<string, PaintStyle>();

  // Get existing styles once (avoid repeated queries)
  const existingStyles = figma.getLocalPaintStyles();
  let autoCounter = 0;

  // Track styles created during THIS run (by name) to prevent duplicates
  const createdStylesByName = new Map<string, PaintStyle>();

  // Helper to create or update a PaintStyle
  function createOrUpdateStyle(styleName: string, paints: Paint[]): PaintStyle {
    // Check styles created in this run first
    const justCreated = createdStylesByName.get(styleName);
    if (justCreated) {
      justCreated.paints = paints;
      return justCreated;
    }
    // Check pre-existing styles
    const existing = existingStyles.find((s) => s.name === styleName);
    if (existing) {
      existing.paints = paints;
      createdStylesByName.set(styleName, existing);
      return existing;
    }
    const style = figma.createPaintStyle();
    style.name = styleName;
    style.paints = paints;
    createdStylesByName.set(styleName, style);
    return style;
  }

  // =========================================================================
  // PASS 1: Create PaintStyles for ALL color CSS variables
  // Priority: variable names are preserved exactly as they appear on the website
  // =========================================================================

  for (const variable of cssVariables) {
    if (variable.category !== "color" && !isColorValue(variable.value)) continue;
    const parsed = cssColorToFigmaRGB(variable.value);
    if (!parsed) continue;

    try {
      const styleName = `WEB/${variable.name}`;
      const paints: Paint[] = [
        {
          type: "SOLID",
          color: parsed.color,
          opacity: parsed.opacity,
        },
      ];

      const style = createOrUpdateStyle(styleName, paints);

      // Store by variable name (for variable-first linking)
      variableStyleMap.set(variable.name, style);

      // Also store by paintKey (for hex-based fallback linking)
      const hex = figmaRGBToHex(parsed.color);
      const normalized = normalizeColorForLookup(hex);
      const paintKey =
        parsed.opacity >= 0.99
          ? normalized
          : `${normalized}@${Math.round(parsed.opacity * 100)}`;
      // First variable wins per paintKey (don't overwrite)
      if (!colorStyleMap.has(paintKey)) {
        colorStyleMap.set(paintKey, style);
      }
    } catch (err) {
      logger.warn("Failed to create CSS variable style", {
        variable: variable.name,
        error: err,
      });
    }
  }

  logger.info("Pass 1: Created CSS variable styles", {
    variableStyleCount: variableStyleMap.size,
    colorStyleMapCount: colorStyleMap.size,
  });

  // =========================================================================
  // PASS 2: Collect non-variable paints from tree
  // =========================================================================

  const allPaints = new Map<string, FigmaFill>();
  const textColors = new Map<string, string>();
  const compoundFills = new Map<string, FigmaFill[]>();
  for (const frame of frames) {
    if (frame.tree) {
      collectAllPaintsFromTree(frame.tree, allPaints, textColors);
      collectCompoundFillsFromTree(frame.tree, compoundFills);
    }
  }

  // Add text colors as solid paint entries
  for (const [key, cssColor] of Array.from(textColors)) {
    if (!allPaints.has(key)) {
      const parsed = cssColorToFigmaRGB(cssColor);
      if (parsed) {
        allPaints.set(key, {
          type: "SOLID",
          visible: true,
          opacity: parsed.opacity,
          color: { r: parsed.color.r, g: parsed.color.g, b: parsed.color.b, a: 1 },
        });
      }
    }
  }

  // =========================================================================
  // PASS 3: Create auto-named styles for paints NOT covered by CSS variables
  // =========================================================================

  // Reverse lookup: hex→variable name (fallback for when extraction doesn't have var())
  const paintKeyToVarName = new Map<string, string>();
  for (const [varName] of Array.from(variableStyleMap)) {
    const variable = cssVariables.find((v) => v.name === varName);
    if (variable) {
      const parsed = cssColorToFigmaRGB(variable.value);
      if (parsed) {
        const hex = figmaRGBToHex(parsed.color);
        const normalized = normalizeColorForLookup(hex);
        const pk =
          parsed.opacity >= 0.99
            ? normalized
            : `${normalized}@${Math.round(parsed.opacity * 100)}`;
        if (!paintKeyToVarName.has(pk)) {
          paintKeyToVarName.set(pk, varName);
        }
      }
    }
  }

  // Track gradient style names used in this run to prevent duplicates
  const usedGradientNames = new Set<string>();

  function gradientVarName(
    fillType: string,
    angle: number | undefined,
    stops: FigmaGradientStop[]
  ): string | null {
    if (!stops || stops.length === 0) return null;

    // Strategy 1: Direct read from per-stop cssVariableName (tracked at extraction)
    const names: string[] = [];
    for (const stop of stops) {
      if (stop.cssVariableName && !names.includes(stop.cssVariableName)) {
        names.push(stop.cssVariableName);
      }
    }

    // Strategy 2: Fallback — reverse-match stop hex colors to CSS variables
    if (names.length === 0) {
      for (const stop of stops) {
        const hex = figmaColorToHex(stop.color);
        const norm = normalizeColorForLookup(hex);
        const effectiveA = stop.color.a;
        const stopKey =
          effectiveA >= 0.99
            ? norm
            : `${norm}@${Math.round(effectiveA * 100)}`;
        const matched = paintKeyToVarName.get(stopKey);
        if (matched && !names.includes(matched)) {
          names.push(matched);
        }
      }
    }

    if (names.length === 0) return null;

    // Build descriptive name: --gradient(--var1, --var2, 135deg)
    const typePrefix =
      fillType === "GRADIENT_RADIAL" ? "--radial" :
      fillType === "GRADIENT_CONIC" ? "--conic" : "--gradient";
    const angleStr = angle != null ? `, ${Math.round(angle)}deg` : "";
    let baseName = `${typePrefix}(${names.join(", ")}${angleStr})`;

    // Deduplicate: if this exact name was already used, append suffix
    if (usedGradientNames.has(baseName)) {
      let suffix = 2;
      while (usedGradientNames.has(`${baseName}-${suffix}`)) suffix++;
      baseName = `${baseName}-${suffix}`;
    }
    usedGradientNames.add(baseName);
    return baseName;
  }

  let newStylesCreated = 0;
  for (const [key, fill] of Array.from(allPaints)) {
    // Skip if already covered by a CSS variable style
    if (colorStyleMap.has(key)) continue;

    try {
      let styleName: string;
      let paints: Paint[];

      if (fill.type === "SOLID" && fill.color) {
        const effectiveOpacity = fill.opacity * fill.color.a;
        autoCounter++;
        styleName = `WEB/--created-variable-${String(autoCounter).padStart(2, "0")}`;

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
        const gradName = gradientVarName(fill.type, fill.angle, fill.stops);
        if (gradName) {
          styleName = `WEB/${gradName}`;
        } else {
          autoCounter++;
          styleName = `WEB/--created-variable-${String(autoCounter).padStart(2, "0")}`;
        }

        paints = [
          {
            type: "GRADIENT_LINEAR",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
            })),
            gradientTransform: calculateLinearGradientTransform(
              fill.angle || 180,
              fill.elementWidth,
              fill.elementHeight
            ),
          } as GradientPaint,
        ];
      } else if (
        fill.type === "GRADIENT_RADIAL" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const gradName = gradientVarName(fill.type, fill.angle, fill.stops);
        if (gradName) {
          styleName = `WEB/${gradName}`;
        } else {
          autoCounter++;
          styleName = `WEB/--created-variable-${String(autoCounter).padStart(2, "0")}`;
        }

        const radialTransform = calculateRadialGradientTransform(fill);
        paints = [
          {
            type: "GRADIENT_RADIAL",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
            })),
            gradientTransform: radialTransform,
          } as GradientPaint,
        ];
      } else if (
        fill.type === "GRADIENT_CONIC" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const gradName = gradientVarName(fill.type, fill.angle, fill.stops);
        if (gradName) {
          styleName = `WEB/${gradName}`;
        } else {
          autoCounter++;
          styleName = `WEB/--created-variable-${String(autoCounter).padStart(2, "0")}`;
        }

        paints = [
          {
            type: "GRADIENT_ANGULAR",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
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

      const style = createOrUpdateStyle(styleName, paints);
      colorStyleMap.set(key, style);
      newStylesCreated++;
    } catch (err) {
      logger.warn("Failed to create website paint style", {
        key,
        error: err,
      });
    }
  }

  logger.info("Pass 3: Created auto-named styles for remaining paints", {
    newStylesCreated,
    totalColorStyles: colorStyleMap.size,
  });

  // =========================================================================
  // PASS 4: Create compound PaintStyles for multi-fill nodes
  // Figma's fillStyleId is per-frame (all fills), so multi-fill frames need
  // a single PaintStyle containing ALL their fills to be linkable.
  // =========================================================================

  let compoundStylesCreated = 0;
  for (const [compoundKey, fills] of Array.from(compoundFills)) {
    if (colorStyleMap.has(compoundKey)) continue;

    try {
      // Build compound name from individual fill info
      const parts: string[] = [];
      for (const fill of fills) {
        if (fill.cssVariable) {
          parts.push(fill.cssVariable);
        } else if (
          (fill.type === "GRADIENT_LINEAR" ||
            fill.type === "GRADIENT_RADIAL" ||
            fill.type === "GRADIENT_CONIC") &&
          fill.stops &&
          fill.stops.length >= 2
        ) {
          const gName = gradientVarName(fill.type, fill.angle, fill.stops);
          const prefix =
            fill.type === "GRADIENT_RADIAL" ? "--radial" :
            fill.type === "GRADIENT_CONIC" ? "--conic" : "--gradient";
          parts.push(gName || prefix);
        } else if (fill.type === "SOLID" && fill.color) {
          parts.push(figmaColorToHex(fill.color));
        } else {
          parts.push("fill");
        }
      }

      const styleName = `WEB/--compound(${parts.join(", ")})`;

      // Convert each fill to a native Figma Paint
      // CSS order is top-to-bottom, Figma order is bottom-to-top → reverse
      const paints: Paint[] = [];
      for (const fill of fills) {
        const paint = figmaFillToPaint(fill);
        if (paint) paints.push(paint);
      }

      if (paints.length > 1) {
        const style = createOrUpdateStyle(styleName, paints.reverse());
        colorStyleMap.set(compoundKey, style);
        compoundStylesCreated++;
      }
    } catch (err) {
      logger.warn("Failed to create compound style", {
        key: compoundKey,
        error: err,
      });
    }
  }

  if (compoundStylesCreated > 0) {
    logger.info("Pass 4: Created compound styles for multi-fill nodes", {
      compoundStylesCreated,
      totalColorStyles: colorStyleMap.size,
    });
  }

  return { colorStyleMap, variableStyleMap };
}

// ============================================================================
// Text Styles
// ============================================================================

const MAX_TEXT_STYLES = 50;

/**
 * Map a numeric font weight to a Figma font style string
 */
export function fontWeightToStyle(weight: number): string {
  if (weight >= 600) return "Bold";
  if (weight >= 500) return "Medium";
  return "Regular";
}

/**
 * Parse a node's lineHeight value to Figma LineHeight format.
 * Handles: number (px), "NNpx", "NN%", ratio "1.5", "normal", undefined.
 */
export function parseFigmaLineHeight(
  lineHeight: number | string | undefined
): LineHeight {
  if (!lineHeight || lineHeight === "normal") {
    return { unit: "AUTO" };
  }
  if (typeof lineHeight === "number") {
    if (lineHeight <= 0) return { unit: "AUTO" };
    return { value: lineHeight, unit: "PIXELS" };
  }
  const str = String(lineHeight);
  if (str.endsWith("%")) {
    const pct = parseFloat(str);
    if (!isNaN(pct) && pct > 0) return { value: pct, unit: "PERCENT" };
  }
  if (str.endsWith("px")) {
    const px = parseFloat(str);
    if (!isNaN(px) && px > 0) return { value: px, unit: "PIXELS" };
  }
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    // Ratios < 10 → convert to percent (1.5 → 150%)
    if (num < 10) return { value: num * 100, unit: "PERCENT" };
    return { value: num, unit: "PIXELS" };
  }
  return { unit: "AUTO" };
}

/**
 * Create a deterministic key segment from a Figma LineHeight.
 * Returns "" for AUTO (omitted from key), or "lhNNpx" / "lhNNpct".
 */
export function lineHeightKeyStr(lh: LineHeight): string {
  if ("value" in lh) {
    const rounded = Math.round(lh.value);
    return lh.unit === "PIXELS" ? `lh${rounded}` : `lh${rounded}pct`;
  }
  return "";
}

export interface TypographyCombo {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: LineHeight;
  letterSpacing: number;
}

/**
 * Build a deterministic key for TextStyle lookup.
 * Used by both collectTypographyFromTree (creation) and linkTextStyleIfApplicable (linking)
 * to guarantee key consistency.
 */
export function buildTextStyleKey(
  fontFamily: string,
  fontWeight: number,
  fontSize: number,
  lineHeight: number | string | undefined,
  letterSpacing: number
): string {
  const styleStr = fontWeightToStyle(fontWeight);
  const actualFontSize = Math.max(fontSize || 14, 8);
  const lh = parseFigmaLineHeight(lineHeight);
  const lhKey = lineHeightKeyStr(lh);
  const ls = Math.round((letterSpacing || 0) * 10) / 10;
  const lsKey = ls !== 0 ? `ls${Math.round(ls * 10)}` : "";
  return [fontFamily, styleStr, actualFontSize, lhKey, lsKey].filter(Boolean).join("-");
}

/**
 * Recursively collect unique typography combinations from the wireframe tree.
 * Includes lineHeight and letterSpacing in the key for accurate TextStyle matching.
 */
export function collectTypographyFromTree(
  node: WireframeNode,
  combos: Map<string, TypographyCombo>,
  pluginFontFamily: string,
  fontMode: "plugin" | "website" | "lines"
): void {
  // Only collect from text nodes
  if ((node.type === "text" || node.textContent) && node.fontSize) {
    const family = fontMode === "plugin" || fontMode === "lines" ? pluginFontFamily : (node.fontFamily || pluginFontFamily);
    const fontSize = Math.max(node.fontSize || 14, 8);
    const fontWeight = node.fontWeight || 400;
    const key = buildTextStyleKey(family, fontWeight, node.fontSize, node.lineHeight, node.letterSpacing || 0);
    const lh = parseFigmaLineHeight(node.lineHeight);
    const ls = Math.round((node.letterSpacing || 0) * 10) / 10;

    if (!combos.has(key)) {
      combos.set(key, { fontFamily: family, fontSize, fontWeight, lineHeight: lh, letterSpacing: ls });
    }

    // Also collect from styledSegments (multi-segment text like "$12 /month")
    if (node.styledSegments) {
      for (const seg of node.styledSegments) {
        if (seg.fontSize) {
          const segFamily = fontMode === "plugin" ? pluginFontFamily : (seg.fontFamily || node.fontFamily || pluginFontFamily);
          const segFontSize = Math.max(seg.fontSize || 14, 8);
          const segFontWeight = seg.fontWeight || node.fontWeight || 400;
          const segKey = buildTextStyleKey(segFamily, segFontWeight, seg.fontSize, node.lineHeight, node.letterSpacing || 0);
          if (!combos.has(segKey)) {
            combos.set(segKey, { fontFamily: segFamily, fontSize: segFontSize, fontWeight: segFontWeight, lineHeight: lh, letterSpacing: ls });
          }
        }
      }
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
 * - Plugin mode: W2W/--Montserrat-Bold-24  (lh suffix only when disambiguating collisions)
 * - Website mode: WEB/--SpaceGrotesk-Bold-24
 *
 * TextStyles include lineHeight and letterSpacing so linking won't detach.
 */
export async function createTextStyles(
  frames: WireframeFrame[],
  fontFamily: string,
  fontMode: "plugin" | "website" | "lines",
  originalFontNames?: Record<string, string>
): Promise<Map<string, TextStyle>> {
  const textStyleMap = new Map<string, TextStyle>();

  // Collect unique typography combos (including lineHeight + letterSpacing)
  const combos = new Map<string, TypographyCombo>();
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
  const prefix = fontMode === "plugin" ? "W2W" : fontMode === "lines" ? "LNS" : "WEB";

  // Detect lineHeight collisions: same base key (font+style+size+ls) with different lineHeights.
  // Only include lh in the display name when needed to disambiguate.
  const baseKeyLhMap = new Map<string, Set<string>>();
  for (const [, combo] of Array.from(combos)) {
    const s = fontWeightToStyle(combo.fontWeight);
    const ls = combo.letterSpacing !== 0 ? `ls${Math.round(combo.letterSpacing * 10)}` : "";
    const base = [combo.fontFamily, s, combo.fontSize, ls].filter(Boolean).join("-");
    const lh = lineHeightKeyStr(combo.lineHeight);
    if (!baseKeyLhMap.has(base)) baseKeyLhMap.set(base, new Set());
    baseKeyLhMap.get(base)!.add(lh);
  }
  const lhCollisionBases = new Set<string>();
  for (const [base, lhSet] of Array.from(baseKeyLhMap)) {
    if (lhSet.size > 1) lhCollisionBases.add(base);
  }

  for (const [key, combo] of Array.from(combos)) {
    if (stylesCreated >= MAX_TEXT_STYLES) break;

    const styleStr = fontWeightToStyle(combo.fontWeight);
    const lhKey = lineHeightKeyStr(combo.lineHeight);
    const lsKey = combo.letterSpacing !== 0 ? `ls${Math.round(combo.letterSpacing * 10)}` : "";
    const baseKey = [combo.fontFamily, styleStr, combo.fontSize, lsKey].filter(Boolean).join("-");
    const needsLh = lhCollisionBases.has(baseKey);
    const nameParts = [combo.fontFamily, styleStr, combo.fontSize];
    if (needsLh && lhKey) nameParts.push(lhKey);
    if (lsKey) nameParts.push(lsKey);
    const styleName = `${prefix}/--${nameParts.join("-")}`;

    try {
      // Try to load the font first -- skip if unavailable
      await figma.loadFontAsync({ family: combo.fontFamily, style: styleStr });

      // Check if style already exists — update properties to match current data
      const existing = existingTextStyles.find((s) => s.name === styleName);
      if (existing) {
        existing.fontName = { family: combo.fontFamily, style: styleStr };
        existing.fontSize = combo.fontSize;
        existing.lineHeight = combo.lineHeight;
        if (combo.letterSpacing !== 0) {
          existing.letterSpacing = { value: combo.letterSpacing, unit: "PIXELS" };
        }
        textStyleMap.set(key, existing);
        continue;
      }

      // Create new text style
      const textStyle = figma.createTextStyle();
      textStyle.name = styleName;
      textStyle.fontName = { family: combo.fontFamily, style: styleStr };
      textStyle.fontSize = combo.fontSize;
      textStyle.lineHeight = combo.lineHeight;
      if (combo.letterSpacing !== 0) {
        textStyle.letterSpacing = { value: combo.letterSpacing, unit: "PIXELS" };
      }

      textStyleMap.set(key, textStyle);
      stylesCreated++;
    } catch {
      // Font not available — try creating style with Inter if "Use original fonts" was chosen
      if (originalFontNames && originalFontNames[combo.fontFamily]) {
        try {
          await figma.loadFontAsync({ family: "Inter", style: styleStr });

          const existing = existingTextStyles.find((s) => s.name === styleName);
          if (existing) {
            existing.fontName = { family: "Inter", style: styleStr };
            existing.fontSize = combo.fontSize;
            existing.lineHeight = combo.lineHeight;
            if (combo.letterSpacing !== 0) {
              existing.letterSpacing = { value: combo.letterSpacing, unit: "PIXELS" };
            }
            textStyleMap.set(key, existing);
            continue;
          }

          const textStyle = figma.createTextStyle();
          textStyle.name = styleName; // Original font name preserved in style name
          textStyle.fontName = { family: "Inter", style: styleStr };
          textStyle.fontSize = combo.fontSize;
          textStyle.lineHeight = combo.lineHeight;
          if (combo.letterSpacing !== 0) {
            textStyle.letterSpacing = { value: combo.letterSpacing, unit: "PIXELS" };
          }
          textStyleMap.set(key, textStyle);
          stylesCreated++;
        } catch {
          logger.warn("Skipping text style (Inter style variant not available)", {
            font: combo.fontFamily,
            style: styleStr,
          });
        }
      } else {
        logger.warn("Skipping text style (font not available)", {
          font: combo.fontFamily,
          style: styleStr,
        });
      }
    }
  }

  return textStyleMap;
}
