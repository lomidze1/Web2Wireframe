import { showUI } from "@create-figma-plugin/utilities";
import { logger } from "./utils/logger";
import { errorHandler, ErrorCode } from "./utils/errorHandler";

// ============================================================================
// FIGMA-READY TYPES (from Browser Extension)
// ============================================================================

/** RGBA color normalized to 0-1 range (Figma format) */
interface FigmaColor {
  r: number;  // 0-1
  g: number;  // 0-1
  b: number;  // 0-1
  a: number;  // 0-1
}

/** Gradient stop */
interface FigmaGradientStop {
  color: FigmaColor;
  position: number;  // 0-1
}

/** Radial gradient shape */
type RadialGradientShape = 'circle' | 'ellipse';

/** Radial gradient size keyword */
type RadialGradientSize = 'closest-side' | 'farthest-side' | 'closest-corner' | 'farthest-corner';

/** Fill layer - supports solid, gradient, image placeholder */
interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_CONIC' | 'IMAGE_PLACEHOLDER';
  visible: boolean;
  opacity: number;
  blendMode?: string;
  color?: FigmaColor;
  angle?: number;
  stops?: FigmaGradientStop[];
  // Radial/conic gradient specific
  center?: { x: number; y: number };
  shape?: RadialGradientShape;        // circle or ellipse (default: ellipse)
  size?: RadialGradientSize;          // CSS size keyword (default: farthest-corner)
  // Element dimensions for proper gradient transform calculation
  elementWidth?: number;
  elementHeight?: number;
  isImagePlaceholder?: boolean;
}

/** Stroke layer - border */
interface FigmaStroke {
  color: FigmaColor;
  weight: number;
  position: 'INSIDE' | 'CENTER' | 'OUTSIDE';
  style: 'SOLID' | 'DASHED' | 'DOTTED';
  sides?: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
}

/** Effect layer - shadow or blur */
interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  blurRadius?: number;
}

// ============================================================================
// Types for nested wireframe data
// ============================================================================
interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;

  // Layout
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };

  // =========================================================================
  // NEW: Figma-ready arrays (multiple layers support)
  // =========================================================================
  fills?: FigmaFill[];      // Multiple backgrounds: gradients, colors, image placeholders
  strokes?: FigmaStroke[];  // Borders (with per-side support)
  effects?: FigmaEffect[];  // Multiple shadows, backdrop-blur

  // =========================================================================
  // LEGACY: Keep for backward compatibility
  // =========================================================================
  backgroundColor: string | null;
  backgroundGradient: string | null;
  textColor: string;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  opacity: number;

  // Text
  textContent: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: string;

  // Media
  isPlaceholder: boolean;

  // Nested children
  children: WireframeNode[];
}

interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: WireframeNode;
}

// CSS Variable extracted from the page
interface ExtractedCSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original value
  category?: string; // color, spacing, typography, etc.
}

interface RenderWireframeData {
  frames: WireframeFrame[];
  sourceUrl: string;
  localStyles?: object;
  pluginColors: {
    main: string;
    text: string;
    accent: string;
    surface: string;
    border: string;
    background: string;
  };
  cssVariables?: ExtractedCSSVariable[];
  variableMode?: "styles" | "direct";
}

// Context passed to render functions for style linking
interface RenderContext {
  pluginColors: RenderWireframeData["pluginColors"];
  fontFamily: string;
  variableMode: "styles" | "direct";
  cssVariables: ExtractedCSSVariable[];
  // Map from resolved color value → PaintStyle (for linking)
  colorStyleMap: Map<string, PaintStyle>;
  // Map from variable name → resolved value
  variableValueMap: Map<string, string>;
}

// Extract single border radius value from number or object
function getBorderRadius(value: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number } | undefined): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  // Return the maximum corner radius for uniform appearance
  return Math.max(value.topLeft || 0, value.topRight || 0, value.bottomRight || 0, value.bottomLeft || 0);
}

// Convert hex color to Figma RGB (0-1 range)
// Supports 6-digit (#RRGGBB) and 8-digit (#RRGGBBAA) hex
function hexToFigmaRGB(hex: string): RGB {
  if (!hex || hex === "transparent" || hex === "null") {
    return { r: 0.96, g: 0.96, b: 0.96 }; // Default light gray
  }

  const cleanHex = hex.replace("#", "");

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

// Parse CSS color to Figma RGB (handles hex, rgb, rgba)
function cssColorToFigmaRGB(color: string): { color: RGB; opacity: number } | null {
  if (!color || color === "transparent") return null;

  // Handle hex (6 or 8 digit)
  if (color.startsWith("#")) {
    const cleanHex = color.replace("#", "");
    let opacity = 1;

    // 8-digit hex has alpha in last 2 characters
    if (cleanHex.length === 8) {
      opacity = parseInt(cleanHex.slice(6, 8), 16) / 255;
    }

    return { color: hexToFigmaRGB(color), opacity };
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
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

// Resolve CSS variables in a string (e.g., gradient or color)
function resolveCSSVariables(
  value: string,
  variableValueMap: Map<string, string>
): string {
  if (!value || !value.includes("var(")) return value;

  // Replace all var(--name) with resolved values
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (match, varName, fallback) => {
    const resolved = variableValueMap.get(varName);
    if (resolved) return resolved;
    if (fallback) return fallback.trim();
    return match; // Keep original if not found
  });
}

// Parse CSS gradient to Figma GradientPaint
function parseGradient(gradient: string, variableValueMap?: Map<string, string>): GradientPaint | null {
  if (!gradient) return null;

  // Resolve CSS variables first
  const resolvedGradient = variableValueMap
    ? resolveCSSVariables(gradient, variableValueMap)
    : gradient;

  // DEBUG
  console.log("[DEBUG parseGradient]", {
    original: gradient,
    resolved: resolvedGradient,
    hasVarRemaining: resolvedGradient.includes("var("),
  });

  // Match linear-gradient
  const linearMatch = resolvedGradient.match(/linear-gradient\s*\(\s*(\d+)deg\s*,\s*(.+)\)/i);
  if (linearMatch) {
    const [, angleDeg, colorStopsStr] = linearMatch;
    const angle = parseInt(angleDeg);

    // Parse color stops
    const colorStops = parseColorStops(colorStopsStr);
    console.log("[DEBUG parseGradient] colorStops:", colorStops.length, colorStopsStr);
    if (colorStops.length < 2) return null;

    // Convert CSS angle to Figma gradient handles
    // CSS: 0deg = bottom to top, 90deg = left to right
    // Figma: uses transform matrix
    const angleRad = ((angle - 90) * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    return {
      type: "GRADIENT_LINEAR",
      gradientStops: colorStops,
      gradientTransform: [
        [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
        [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
      ],
    };
  }

  // Match radial-gradient (simplified)
  const radialMatch = resolvedGradient.match(/radial-gradient\s*\(\s*(.+)\)/i);
  if (radialMatch) {
    const colorStops = parseColorStops(radialMatch[1]);
    if (colorStops.length < 2) return null;

    return {
      type: "GRADIENT_RADIAL",
      gradientStops: colorStops,
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    };
  }

  return null;
}

// Parse color stops from gradient string
function parseColorStops(colorStopsStr: string): ColorStop[] {
  const stops: ColorStop[] = [];

  // Split by comma but respect parentheses (for rgb/rgba)
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of colorStopsStr) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());

  // Parse each color stop
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();

    // Extract color and position
    // Handle: "#fff 0%", "rgb(0,0,0) 50%", "var(--color)", "#fff"
    let colorStr = part;
    let position = i / (parts.length - 1); // Default: evenly distributed

    // Check for percentage at end
    const posMatch = part.match(/^(.+?)\s+(\d+)%$/);
    if (posMatch) {
      colorStr = posMatch[1].trim();
      position = parseInt(posMatch[2]) / 100;
    }

    // Parse color
    const parsed = cssColorToFigmaRGB(colorStr);
    if (parsed) {
      stops.push({
        position,
        color: { ...parsed.color, a: parsed.opacity },
      });
    }
  }

  return stops;
}

// ============================================================================
// NEW: Figma-ready array converters
// ============================================================================

/**
 * Calculate radial gradient transform for Figma
 *
 * CSS radial gradients have complex positioning and sizing that must be properly converted.
 * The gradientTransform is a 2x3 affine matrix: [[scaleX, skewX, tx], [skewY, scaleY, ty]]
 *
 * Key insight: Figma's radial gradient default center is at (0.5, 0.5) in gradient space.
 * To position it at CSS "at X% Y%", we need to:
 * 1. Calculate gradient size based on CSS size keyword (farthest-corner, etc.)
 * 2. Apply scale to match the calculated size
 * 3. Translate to position the center correctly (accounting for scale)
 */
function calculateRadialGradientTransform(fill: FigmaFill): Transform {
  const cx = fill.center?.x ?? 0.5;
  const cy = fill.center?.y ?? 0.5;
  const shape = fill.shape ?? 'ellipse';
  const size = fill.size ?? 'farthest-corner';
  const elementWidth = fill.elementWidth ?? 100;
  const elementHeight = fill.elementHeight ?? 100;

  // Step 1: Calculate distances from center to edges
  const distLeft = cx * elementWidth;
  const distRight = (1 - cx) * elementWidth;
  const distTop = cy * elementHeight;
  const distBottom = (1 - cy) * elementHeight;

  // Step 2: Calculate gradient radius based on size keyword
  let radiusX: number;
  let radiusY: number;

  switch (size) {
    case 'closest-side':
      radiusX = Math.min(distLeft, distRight);
      radiusY = Math.min(distTop, distBottom);
      break;
    case 'farthest-side':
      radiusX = Math.max(distLeft, distRight);
      radiusY = Math.max(distTop, distBottom);
      break;
    case 'closest-corner': {
      const closestX = Math.min(distLeft, distRight);
      const closestY = Math.min(distTop, distBottom);
      const dist = Math.sqrt(closestX ** 2 + closestY ** 2);
      radiusX = radiusY = dist;
      break;
    }
    case 'farthest-corner':
    default: {
      const farthestX = Math.max(distLeft, distRight);
      const farthestY = Math.max(distTop, distBottom);
      const dist = Math.sqrt(farthestX ** 2 + farthestY ** 2);
      radiusX = radiusY = dist;
      break;
    }
  }

  // Step 3: For circle shape, use equal radii
  if (shape === 'circle') {
    // For circle, the radius should be equal in both directions
    // Use the larger radius to ensure coverage
    const radius = Math.max(radiusX, radiusY);
    radiusX = radiusY = radius;
  }

  // Step 4: Calculate scale factors (gradient size relative to element)
  // Figma's radial gradient extends from center to edge in unit space
  // The scale represents how much of the element the gradient covers
  // NOTE: We do NOT multiply by 2 - Figma's gradient already spans the full diameter
  const scaleX = radiusX / elementWidth;
  const scaleY = radiusY / elementHeight;

  // Step 5: Calculate translation
  // Figma's default gradient center is at (0.5, 0.5) in gradient space
  // After scaling, we need to position the center at (cx, cy)
  // Translation formula: tx = cx - scaleX * 0.5, ty = cy - scaleY * 0.5
  const tx = cx - scaleX * 0.5;
  const ty = cy - scaleY * 0.5;

  console.log("[DEBUG calculateRadialGradientTransform]", {
    input: { cx, cy, shape, size, elementWidth, elementHeight },
    calculated: { radiusX, radiusY, scaleX, scaleY, tx, ty },
  });

  return [
    [scaleX, 0, tx],
    [0, scaleY, ty],
  ];
}

/**
 * Convert FigmaFill[] to Figma Paint[]
 * Handles: solid colors, linear/radial/conic gradients, image placeholders
 *
 * IMPORTANT: CSS backgrounds are top-to-bottom (first = top layer)
 * Figma fills are bottom-to-top (first = bottom layer)
 * So we REVERSE the order at the end!
 */
function convertFillsToPaints(fills: FigmaFill[] | undefined, context: RenderContext): Paint[] {
  if (!fills || fills.length === 0) return [];

  console.log("[DEBUG convertFillsToPaints] Input fills count:", fills.length);
  console.log("[DEBUG convertFillsToPaints] Fill types:", fills.map(f => f.type));

  const paints: Paint[] = [];

  for (const fill of fills) {
    if (!fill.visible) {
      console.log("[DEBUG convertFillsToPaints] Skipping invisible fill:", fill.type);
      continue;
    }

    switch (fill.type) {
      case 'SOLID':
        if (fill.color) {
          const solidPaint: SolidPaint = {
            type: 'SOLID',
            color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
            opacity: fill.opacity * fill.color.a,
          };
          paints.push(solidPaint);
          console.log("[DEBUG convertFillsToPaints] Added SOLID:", solidPaint);
        }
        break;

      case 'GRADIENT_LINEAR':
        if (fill.stops && fill.stops.length >= 2) {
          const angle = fill.angle || 180;
          const angleRad = ((angle - 90) * Math.PI) / 180;
          const cos = Math.cos(angleRad);
          const sin = Math.sin(angleRad);

          const linearPaint: GradientPaint = {
            type: 'GRADIENT_LINEAR',
            gradientStops: fill.stops.map(stop => ({
              position: stop.position,
              color: {
                r: stop.color.r,
                g: stop.color.g,
                b: stop.color.b,
                a: stop.color.a,
              },
            })),
            gradientTransform: [
              [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
              [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
            ],
          };
          paints.push(linearPaint);
          console.log("[DEBUG convertFillsToPaints] Added GRADIENT_LINEAR with angle:", angle);
        }
        break;

      case 'GRADIENT_RADIAL':
        if (fill.stops && fill.stops.length >= 2) {
          const radialTransform = calculateRadialGradientTransform(fill);
          const radialPaint: GradientPaint = {
            type: 'GRADIENT_RADIAL',
            gradientStops: fill.stops.map(stop => ({
              position: stop.position,
              color: {
                r: stop.color.r,
                g: stop.color.g,
                b: stop.color.b,
                a: stop.color.a,
              },
            })),
            gradientTransform: radialTransform,
          };
          paints.push(radialPaint);
          console.log("[DEBUG convertFillsToPaints] Added GRADIENT_RADIAL, transform:", radialTransform, "stops:", fill.stops.length);
        } else {
          console.log("[DEBUG convertFillsToPaints] GRADIENT_RADIAL skipped - not enough stops:", fill.stops?.length);
        }
        break;

      case 'GRADIENT_CONIC':
        // Figma doesn't have native conic gradient - approximate with angular
        if (fill.stops && fill.stops.length >= 2) {
          const angularPaint: GradientPaint = {
            type: 'GRADIENT_ANGULAR',
            gradientStops: fill.stops.map(stop => ({
              position: stop.position,
              color: {
                r: stop.color.r,
                g: stop.color.g,
                b: stop.color.b,
                a: stop.color.a,
              },
            })),
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          };
          paints.push(angularPaint);
          console.log("[DEBUG convertFillsToPaints] Added GRADIENT_ANGULAR (from conic)");
        }
        break;

      case 'IMAGE_PLACEHOLDER':
        // Use surface color for placeholder
        const surfaceRgb = hexToFigmaRGB(context.pluginColors.surface);
        paints.push({
          type: 'SOLID',
          color: surfaceRgb,
          opacity: 0.8,
        });
        console.log("[DEBUG convertFillsToPaints] Added IMAGE_PLACEHOLDER as SOLID");
        break;

      default:
        console.log("[DEBUG convertFillsToPaints] Unknown fill type:", (fill as FigmaFill).type);
    }
  }

  // CRITICAL: Reverse the order!
  // CSS backgrounds: first = top layer (front)
  // Figma fills: first = bottom layer (back)
  const reversedPaints = paints.reverse();

  console.log("[DEBUG convertFillsToPaints] Output paints count:", reversedPaints.length);

  return reversedPaints;
}

/**
 * Convert FigmaStroke[] to Figma strokes
 * Note: Figma doesn't support different colors per side, so we use the first stroke
 */
function convertStrokesToFigma(strokes: FigmaStroke[] | undefined): { paints: Paint[], weight: number } {
  if (!strokes || strokes.length === 0) {
    return { paints: [], weight: 0 };
  }

  // Use first stroke for color (Figma limitation)
  const firstStroke = strokes[0];

  const paints: Paint[] = [{
    type: 'SOLID',
    color: { r: firstStroke.color.r, g: firstStroke.color.g, b: firstStroke.color.b },
    opacity: firstStroke.color.a,
  }];

  return { paints, weight: firstStroke.weight };
}

/**
 * Convert FigmaEffect[] to Figma Effect[]
 * Handles: drop shadow, inner shadow, background blur
 */
function convertEffectsToFigma(effects: FigmaEffect[] | undefined): Effect[] {
  if (!effects || effects.length === 0) return [];

  const figmaEffects: Effect[] = [];

  for (const effect of effects) {
    if (!effect.visible) continue;

    switch (effect.type) {
      case 'DROP_SHADOW':
        if (effect.color && effect.offset) {
          figmaEffects.push({
            type: 'DROP_SHADOW',
            visible: true,
            color: {
              r: effect.color.r,
              g: effect.color.g,
              b: effect.color.b,
              a: effect.color.a,
            },
            offset: { x: effect.offset.x, y: effect.offset.y },
            radius: effect.radius || 0,
            spread: effect.spread || 0,
            blendMode: 'NORMAL',
          });
        }
        break;

      case 'INNER_SHADOW':
        if (effect.color && effect.offset) {
          figmaEffects.push({
            type: 'INNER_SHADOW',
            visible: true,
            color: {
              r: effect.color.r,
              g: effect.color.g,
              b: effect.color.b,
              a: effect.color.a,
            },
            offset: { x: effect.offset.x, y: effect.offset.y },
            radius: effect.radius || 0,
            spread: effect.spread || 0,
            blendMode: 'NORMAL',
          });
        }
        break;

      case 'BACKGROUND_BLUR':
        figmaEffects.push({
          type: 'BACKGROUND_BLUR',
          visible: true,
          radius: effect.blurRadius || effect.radius || 10,
        });
        break;

      case 'LAYER_BLUR':
        figmaEffects.push({
          type: 'LAYER_BLUR',
          visible: true,
          radius: effect.blurRadius || effect.radius || 10,
        });
        break;
    }
  }

  return figmaEffects;
}

// Create gallery icon for image/video placeholders
async function createGalleryIcon(size: number): Promise<FrameNode> {
  const iconFrame = figma.createFrame();
  iconFrame.name = "Gallery Icon";
  iconFrame.resize(size, size);
  iconFrame.fills = [];

  // Create simple gallery icon using rectangles
  const iconColor: RGB = { r: 0.6, g: 0.6, b: 0.6 };
  const strokeWeight = Math.max(2, size / 20);

  // Outer rectangle (image frame)
  const outerRect = figma.createRectangle();
  outerRect.resize(size * 0.8, size * 0.7);
  outerRect.x = size * 0.1;
  outerRect.y = size * 0.15;
  outerRect.fills = [];
  outerRect.strokes = [{ type: "SOLID", color: iconColor }];
  outerRect.strokeWeight = strokeWeight;
  outerRect.cornerRadius = size * 0.05;
  iconFrame.appendChild(outerRect);

  // Mountain shape (triangle)
  const mountain = figma.createPolygon();
  mountain.pointCount = 3;
  mountain.resize(size * 0.4, size * 0.25);
  mountain.x = size * 0.2;
  mountain.y = size * 0.5;
  mountain.fills = [{ type: "SOLID", color: iconColor }];
  iconFrame.appendChild(mountain);

  // Sun circle
  const sun = figma.createEllipse();
  sun.resize(size * 0.15, size * 0.15);
  sun.x = size * 0.6;
  sun.y = size * 0.25;
  sun.fills = [{ type: "SOLID", color: iconColor }];
  iconFrame.appendChild(sun);

  return iconFrame;
}

// Create placeholder for images/videos
async function createPlaceholder(
  node: WireframeNode,
  surfaceColor: string
): Promise<FrameNode> {
  const placeholder = figma.createFrame();
  placeholder.name = node.name || "Image Placeholder";
  placeholder.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Surface background color
  placeholder.fills = [
    {
      type: "SOLID",
      color: hexToFigmaRGB(surfaceColor),
    },
  ];

  // Border radius
  if (getBorderRadius(node.borderRadius) > 0) {
    placeholder.cornerRadius = Math.min(
      getBorderRadius(node.borderRadius),
      Math.min(node.width, node.height) / 2
    );
  }

  // Add gallery icon in center
  const iconSize = Math.min(node.width, node.height) * 0.3;
  if (iconSize >= 20) {
    const icon = await createGalleryIcon(iconSize);
    icon.x = (node.width - iconSize) / 2;
    icon.y = (node.height - iconSize) / 2;
    placeholder.appendChild(icon);
  }

  return placeholder;
}

// Text segment for tracking styled ranges
interface TextSegment {
  text: string;
  color: string;
  fontWeight: number;
  fontSize: number;
}

// Collect all text segments from a node and its inline children
function collectTextSegments(node: WireframeNode): TextSegment[] {
  const segments: TextSegment[] = [];

  // Add parent text content if exists (may be partial)
  if (node.textContent && node.textContent.trim() !== "") {
    segments.push({
      text: node.textContent,
      color: node.textColor || "#333333",
      fontWeight: node.fontWeight || 400,
      fontSize: node.fontSize || 14,
    });
  }

  // Check for inline text children (like <a> inside <h2>)
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      // Only include inline text children
      if (child.type === "text" && child.textContent && child.textContent.trim() !== "") {
        segments.push({
          text: child.textContent,
          color: child.textColor || node.textColor || "#333333",
          fontWeight: child.fontWeight || node.fontWeight || 400,
          fontSize: child.fontSize || node.fontSize || 14,
        });
      }
    }
  }

  return segments;
}

// Create text node with support for inline styled children
async function createTextNode(
  node: WireframeNode,
  fontFamily: string,
  context?: RenderContext
): Promise<TextNode | null> {
  // Collect all text segments (parent + inline children)
  const segments = collectTextSegments(node);

  if (segments.length === 0) {
    return null;
  }

  const textNode = figma.createText();

  // Determine main font style based on parent weight
  let mainFontStyle = "Regular";
  if (node.fontWeight >= 600) {
    mainFontStyle = "Bold";
  } else if (node.fontWeight >= 500) {
    mainFontStyle = "Medium";
  }

  // Load required fonts
  const fontsToLoad = new Set<string>();
  fontsToLoad.add(mainFontStyle);
  for (const seg of segments) {
    if (seg.fontWeight >= 600) fontsToLoad.add("Bold");
    else if (seg.fontWeight >= 500) fontsToLoad.add("Medium");
    else fontsToLoad.add("Regular");
  }

  let usedFontFamily = fontFamily;
  const fontStyles = Array.from(fontsToLoad);
  try {
    for (const style of fontStyles) {
      await figma.loadFontAsync({ family: fontFamily, style });
    }
  } catch {
    try {
      usedFontFamily = "Inter";
      for (const style of fontStyles) {
        await figma.loadFontAsync({ family: "Inter", style });
      }
    } catch {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      usedFontFamily = "Inter";
    }
  }

  // Set initial font
  textNode.fontName = { family: usedFontFamily, style: mainFontStyle };

  // Combine all text content
  const fullText = segments.map((s) => s.text).join("");
  textNode.characters = fullText;

  // Apply base font size
  textNode.fontSize = Math.max(node.fontSize || 14, 8);

  // Apply range-specific styling if there are multiple segments
  if (segments.length > 1) {
    let charIndex = 0;
    for (const segment of segments) {
      const startIdx = charIndex;
      const endIdx = charIndex + segment.text.length;
      charIndex = endIdx;

      if (startIdx >= endIdx) continue;

      // Apply segment color
      const colorWithOpacity = cssColorToFigmaRGB(segment.color);
      if (colorWithOpacity) {
        // Check if we should link to a style
        let linkedStyle: PaintStyle | undefined;
        if (context && context.variableMode === "styles") {
          // Normalize color for lookup
          const normalizedColor = normalizeColorForLookup(segment.color);
          linkedStyle = context.colorStyleMap.get(normalizedColor);
        }

        if (linkedStyle) {
          textNode.setRangeFillStyleId(startIdx, endIdx, linkedStyle.id);
        } else {
          textNode.setRangeFills(startIdx, endIdx, [
            {
              type: "SOLID",
              color: colorWithOpacity.color,
              opacity: colorWithOpacity.opacity,
            },
          ]);
        }
      }

      // Apply segment font weight
      let segStyle = "Regular";
      if (segment.fontWeight >= 600) segStyle = "Bold";
      else if (segment.fontWeight >= 500) segStyle = "Medium";

      try {
        textNode.setRangeFontName(startIdx, endIdx, {
          family: usedFontFamily,
          style: segStyle,
        });
      } catch {
        // Keep default
      }

      // Apply segment font size if different
      if (segment.fontSize && segment.fontSize !== node.fontSize) {
        textNode.setRangeFontSize(startIdx, endIdx, Math.max(segment.fontSize, 8));
      }
    }
  } else {
    // Single segment - apply simple styling
    const segment = segments[0];
    const colorWithOpacity = cssColorToFigmaRGB(segment.color);

    if (colorWithOpacity) {
      // Check if we should link to a style
      let linkedStyle: PaintStyle | undefined;
      if (context && context.variableMode === "styles") {
        const normalizedColor = normalizeColorForLookup(segment.color);
        linkedStyle = context.colorStyleMap.get(normalizedColor);
      }

      if (linkedStyle) {
        textNode.fillStyleId = linkedStyle.id;
      } else {
        textNode.fills = [
          {
            type: "SOLID",
            color: colorWithOpacity.color,
            opacity: colorWithOpacity.opacity,
          },
        ];
      }
    }
  }

  // Text alignment
  const alignMap: Record<string, "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"> = {
    left: "LEFT",
    center: "CENTER",
    right: "RIGHT",
    justify: "JUSTIFIED",
    start: "LEFT",
    end: "RIGHT",
  };
  textNode.textAlignHorizontal = alignMap[node.textAlign] || "LEFT";

  // Set text box size
  textNode.resize(Math.max(node.width, 1), Math.max(node.height, 1));
  textNode.textAutoResize = "HEIGHT";

  return textNode;
}

/**
 * Create a text element WITH background styling (like buttons, badges)
 * In Figma, TextNode can't have background fills - we need to wrap it in a Frame
 *
 * This creates:
 * - Frame with background fills, strokes, effects, border radius
 * - TextNode inside with proper text content and color
 * - Auto Layout to properly contain the text
 */
async function createTextWithBackground(
  node: WireframeNode,
  context: RenderContext
): Promise<FrameNode | null> {
  // Create the wrapper frame
  const frame = figma.createFrame();
  frame.name = node.name || "Button";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout for proper text containment
  frame.layoutMode = node.layoutMode && node.layoutMode !== "NONE" ? node.layoutMode : "HORIZONTAL";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";

  // Apply padding
  if (node.padding) {
    frame.paddingTop = node.padding.top || 0;
    frame.paddingRight = node.padding.right || 0;
    frame.paddingBottom = node.padding.bottom || 0;
    frame.paddingLeft = node.padding.left || 0;
  }

  // Apply item spacing
  if (node.itemSpacing > 0) {
    frame.itemSpacing = node.itemSpacing;
  }

  // =========================================================================
  // Apply fills (background) to the frame
  // =========================================================================
  if (node.fills && node.fills.length > 0) {
    const paints = convertFillsToPaints(node.fills, context);
    if (paints.length > 0) {
      frame.fills = paints;
    } else {
      frame.fills = [];
    }
  } else {
    frame.fills = [];
  }

  // =========================================================================
  // Apply strokes (border) to the frame
  // =========================================================================
  if (node.strokes && node.strokes.length > 0) {
    const { paints, weight } = convertStrokesToFigma(node.strokes);
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      frame.strokeAlign = "INSIDE";
    }
  }

  // =========================================================================
  // Apply effects (shadows, blur) to the frame
  // =========================================================================
  if (node.effects && node.effects.length > 0) {
    const figmaEffects = convertEffectsToFigma(node.effects);
    if (figmaEffects.length > 0) {
      frame.effects = figmaEffects;
    }
  }

  // =========================================================================
  // Apply border radius to the frame
  // =========================================================================
  if (node.borderRadius) {
    const br = node.borderRadius;
    if (typeof br === "number") {
      frame.cornerRadius = br;
    } else {
      frame.topLeftRadius = br.topLeft || 0;
      frame.topRightRadius = br.topRight || 0;
      frame.bottomRightRadius = br.bottomRight || 0;
      frame.bottomLeftRadius = br.bottomLeft || 0;
    }
  }

  // =========================================================================
  // Create the text node inside
  // =========================================================================
  const textNode = await createTextNode(node, context.fontFamily, context);
  if (textNode) {
    frame.appendChild(textNode);

    // Let text auto-size within the frame
    textNode.layoutSizingHorizontal = "HUG";
    textNode.layoutSizingVertical = "HUG";
  }

  return frame;
}

// Normalize color value for style lookup (lowercase, consistent format)
function normalizeColorForLookup(color: string): string {
  if (!color) return "";
  const trimmed = color.trim().toLowerCase();

  // For hex colors, ensure consistent format
  if (trimmed.startsWith("#")) {
    // Convert 3-digit to 6-digit if needed
    if (trimmed.length === 4) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return trimmed;
  }

  return trimmed;
}

// Apply fill to a frame with optional style linking
function applyFillToFrame(
  frame: FrameNode,
  color: string,
  context: RenderContext
): void {
  const colorWithOpacity = cssColorToFigmaRGB(color);
  if (!colorWithOpacity) {
    frame.fills = [];
    return;
  }

  // Check if we should link to a style
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(color);
    const linkedStyle = context.colorStyleMap.get(normalizedColor);

    if (linkedStyle) {
      frame.fillStyleId = linkedStyle.id;
      return;
    }
  }

  // Apply direct color
  frame.fills = [
    {
      type: "SOLID",
      color: colorWithOpacity.color,
      opacity: colorWithOpacity.opacity,
    },
  ];
}

// Apply stroke to a frame with optional style linking
function applyStrokeToFrame(
  frame: FrameNode,
  color: string,
  strokeWeight: number,
  context: RenderContext
): void {
  const colorWithOpacity = cssColorToFigmaRGB(color);
  if (!colorWithOpacity) return;

  // Check if we should link to a style
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(color);
    const linkedStyle = context.colorStyleMap.get(normalizedColor);

    if (linkedStyle) {
      frame.strokeStyleId = linkedStyle.id;
      frame.strokeWeight = strokeWeight;
      return;
    }
  }

  // Apply direct color
  frame.strokes = [
    {
      type: "SOLID",
      color: colorWithOpacity.color,
      opacity: colorWithOpacity.opacity,
    },
  ];
  frame.strokeWeight = strokeWeight;
}

// Recursively create Figma nodes from tree structure
async function createNodeInFigma(
  node: WireframeNode,
  context: RenderContext,
  depth: number = 0
): Promise<SceneNode | null> {
  // Depth limit to prevent infinite recursion
  if (depth > 20) {
    logger.warn("Max depth reached", { nodeId: node.id, depth });
    return null;
  }

  // Handle text nodes (including those with inline children like <a> inside <h2>)
  if (node.type === "text") {
    // Check if text node has background fills (like buttons)
    // In Figma, TextNode can't have background - need to wrap in a Frame
    const hasBackgroundFills = node.fills && node.fills.length > 0;
    const hasBackgroundStrokes = node.strokes && node.strokes.length > 0;
    const hasBackgroundEffects = node.effects && node.effects.length > 0;
    const br = node.borderRadius;
    const hasBorderRadius = br && typeof br === 'object' && (
      br.topLeft > 0 || br.topRight > 0 || br.bottomRight > 0 || br.bottomLeft > 0
    );

    // If text has background styling, wrap in a frame (like a button)
    if (hasBackgroundFills || hasBackgroundStrokes || hasBackgroundEffects || hasBorderRadius) {
      return await createTextWithBackground(node, context);
    }

    // Simple text node without background
    return await createTextNode(node, context.fontFamily, context);
  }

  // Handle placeholders (images/videos)
  if (node.type === "placeholder" || node.isPlaceholder) {
    return await createPlaceholder(node, context.pluginColors.surface);
  }

  // Create frame for containers
  const frame = figma.createFrame();
  frame.name = node.name || "Container";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout if detected
  if (node.layoutMode && node.layoutMode !== "NONE") {
    frame.layoutMode = node.layoutMode;
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "FIXED";

    if (node.itemSpacing > 0) {
      frame.itemSpacing = node.itemSpacing;
    }

    if (node.padding) {
      frame.paddingTop = node.padding.top || 0;
      frame.paddingRight = node.padding.right || 0;
      frame.paddingBottom = node.padding.bottom || 0;
      frame.paddingLeft = node.padding.left || 0;
    }
  }

  // =========================================================================
  // NEW: Apply fills from Figma-ready array (multiple gradients, colors)
  // =========================================================================
  if (node.fills && node.fills.length > 0) {
    const paints = convertFillsToPaints(node.fills, context);
    if (paints.length > 0) {
      frame.fills = paints;
    } else {
      frame.fills = [];
    }
  }
  // LEGACY: Fallback to old gradient/backgroundColor fields
  else if (node.backgroundGradient) {
    const gradientPaint = parseGradient(node.backgroundGradient, context.variableValueMap);
    if (gradientPaint) {
      frame.fills = [gradientPaint];
    } else if (node.backgroundColor) {
      applyFillToFrame(frame, node.backgroundColor, context);
    } else {
      frame.fills = [];
    }
  } else if (node.backgroundColor) {
    applyFillToFrame(frame, node.backgroundColor, context);
  } else {
    frame.fills = [];
  }

  // =========================================================================
  // NEW: Apply strokes from Figma-ready array
  // =========================================================================
  if (node.strokes && node.strokes.length > 0) {
    const { paints, weight } = convertStrokesToFigma(node.strokes);
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
    }
  }
  // LEGACY: Fallback to old borderColor/borderWidth fields
  else if (node.borderWidth > 0 && node.borderColor) {
    applyStrokeToFrame(frame, node.borderColor, node.borderWidth, context);
  }

  // =========================================================================
  // NEW: Apply effects from Figma-ready array (shadows, blur)
  // =========================================================================
  if (node.effects && node.effects.length > 0) {
    const figmaEffects = convertEffectsToFigma(node.effects);
    if (figmaEffects.length > 0) {
      frame.effects = figmaEffects;
    }
  }

  // Apply border radius
  if (getBorderRadius(node.borderRadius) > 0) {
    frame.cornerRadius = Math.min(
      getBorderRadius(node.borderRadius),
      Math.min(node.width, node.height) / 2
    );
  }

  // Apply opacity
  if (node.opacity < 1 && node.opacity > 0) {
    frame.opacity = node.opacity;
  }

  // Clips content
  frame.clipsContent = true;

  // Recursively create children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      try {
        const childNode = await createNodeInFigma(child, context, depth + 1);

        if (childNode) {
          // Position child relative to parent
          childNode.x = child.x;
          childNode.y = child.y;
          frame.appendChild(childNode);
        }
      } catch (err) {
        logger.error("Error creating child node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }
  }

  return frame;
}

// Create a single wireframe frame with nested structure
async function createWireframeFrame(
  frameData: WireframeFrame,
  sourceUrl: string,
  context: RenderContext,
  index: number
): Promise<FrameNode> {
  const { pluginColors, fontFamily } = context;

  // Load required fonts
  try {
    await figma.loadFontAsync({ family: fontFamily, style: "Regular" });
    await figma.loadFontAsync({ family: fontFamily, style: "Medium" });
    await figma.loadFontAsync({ family: fontFamily, style: "Bold" });
  } catch {
    logger.warn("Failed to load custom fonts, using Inter", { fontFamily });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  }

  // Create main frame
  const wireframeFrame = figma.createFrame();

  // Extract hostname for naming
  let hostname = "website";
  try {
    hostname = new URL(sourceUrl).hostname.replace("www.", "");
  } catch {
    // Use default
  }

  wireframeFrame.name = `Wireframe - ${hostname} (${frameData.viewportWidth}px)`;
  wireframeFrame.resize(
    frameData.viewportWidth,
    Math.min(frameData.viewportHeight, 15000)
  );

  // Position: Viewport center + offset for multiple frames
  const viewport = figma.viewport.center;
  wireframeFrame.x =
    viewport.x - frameData.viewportWidth / 2 + index * (frameData.viewportWidth + 100);
  wireframeFrame.y = viewport.y - 200;

  // Set frame background from tree root (body) fills, or fallback to plugin color
  console.log("[DEBUG createWireframeFrame] tree exists:", !!frameData.tree);
  console.log("[DEBUG createWireframeFrame] tree.fills:", frameData.tree?.fills);
  console.log("[DEBUG createWireframeFrame] tree.fills length:", frameData.tree?.fills?.length);

  if (frameData.tree && frameData.tree.fills && frameData.tree.fills.length > 0) {
    console.log("[DEBUG createWireframeFrame] Converting tree.fills to Figma paints...");
    const rootFills = convertFillsToPaints(frameData.tree.fills, context);
    console.log("[DEBUG createWireframeFrame] Converted rootFills:", rootFills);
    console.log("[DEBUG createWireframeFrame] rootFills.length:", rootFills.length);

    if (rootFills.length > 0) {
      wireframeFrame.fills = rootFills;
      console.log("[DEBUG createWireframeFrame] Applied rootFills to wireframeFrame");
    } else {
      console.log("[DEBUG createWireframeFrame] rootFills empty, using fallback color");
      wireframeFrame.fills = [
        {
          type: "SOLID",
          color: hexToFigmaRGB(pluginColors.background),
        },
      ];
    }
  } else {
    console.log("[DEBUG createWireframeFrame] No tree.fills found, using fallback color:", pluginColors.background);
    wireframeFrame.fills = [
      {
        type: "SOLID",
        color: hexToFigmaRGB(pluginColors.background),
      },
    ];
  }

  // Clip contents
  wireframeFrame.clipsContent = true;

  // Create nested structure from tree
  if (frameData.tree && frameData.tree.children) {
    for (const child of frameData.tree.children) {
      try {
        const childNode = await createNodeInFigma(child, context, 1);

        if (childNode) {
          childNode.x = child.x;
          childNode.y = child.y;
          wireframeFrame.appendChild(childNode);
        }
      } catch (err) {
        logger.error("Error creating top-level node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }
  }

  return wireframeFrame;
}

// Check if a color value is a valid color (not a spacing/size value)
function isColorValue(value: string): boolean {
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

// Create Figma color styles from CSS variables
async function createColorStylesFromVariables(
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

// Main plugin function
export default function () {
  showUI({ width: 400, height: 600 });

  // Listen for messages from UI
  figma.ui.onmessage = async (msg) => {
    // Handle render-wireframe message
    if (msg.type === "render-wireframe") {
      const data = msg.data as RenderWireframeData;
      const {
        frames,
        sourceUrl,
        pluginColors,
        cssVariables,
        variableMode,
      } = data;

      // Default colors if not provided
      const colors = pluginColors || {
        main: "#1f3a5f",
        text: "#333333",
        accent: "#3b82f6",
        surface: "#f5f5f5",
        border: "#e0e0e0",
        background: "#ffffff",
      };

      // Default font
      const fontFamily = "Montserrat";

      if (!frames || frames.length === 0) {
        errorHandler.handle({
          code: ErrorCode.NO_DATA_RECEIVED,
          message: "No wireframe data received",
        });
        return;
      }

      logger.info("Creating wireframe", {
        frameCount: frames.length,
        sourceUrl,
        variableMode: variableMode || "direct",
        cssVariablesCount: cssVariables?.length || 0,
      });
      figma.notify("Creating wireframe...", { timeout: 2000 });

      // Build context for rendering
      const colorStyleMap = new Map<string, PaintStyle>();
      const variableValueMap = new Map<string, string>();

      // Populate variable value map (for resolving var() references)
      if (cssVariables && cssVariables.length > 0) {
        for (const variable of cssVariables) {
          variableValueMap.set(variable.name, variable.value);
        }
      }

      // Create color styles from CSS variables if mode is "styles"
      if (variableMode === "styles" && cssVariables && cssVariables.length > 0) {
        figma.notify("Creating color styles from CSS variables...", { timeout: 1500 });
        try {
          const styleMap = await createColorStylesFromVariables(cssVariables, sourceUrl);
          logger.info("Created color styles", { styleCount: styleMap.size });

          // Build color lookup map (resolved value → style)
          for (const variable of cssVariables) {
            const normalizedValue = normalizeColorForLookup(variable.value);
            const style = styleMap.get(variable.name);
            if (style && normalizedValue) {
              colorStyleMap.set(normalizedValue, style);
            }
          }
        } catch (err) {
          logger.warn("Failed to create color styles", { error: err });
        }
      }

      // Create render context
      const renderContext: RenderContext = {
        pluginColors: colors,
        fontFamily,
        variableMode: variableMode || "direct",
        cssVariables: cssVariables || [],
        colorStyleMap,
        variableValueMap,
      };

      try {
        const createdFrames: FrameNode[] = [];

        for (let i = 0; i < frames.length; i++) {
          figma.notify(`Processing viewport ${i + 1}/${frames.length}...`, {
            timeout: 1000,
          });

          const wireframeFrame = await createWireframeFrame(
            frames[i],
            sourceUrl,
            renderContext,
            i
          );
          createdFrames.push(wireframeFrame);
        }

        // Select all created frames
        figma.currentPage.selection = createdFrames;

        // Zoom to fit created frames
        figma.viewport.scrollAndZoomIntoView(createdFrames);

        logger.info("Wireframe created successfully", {
          frameCount: createdFrames.length,
        });
        figma.notify(`Created ${createdFrames.length} wireframe frame(s)!`, {
          timeout: 3000,
        });

        // Send success message back to UI
        figma.ui.postMessage({
          type: "wireframe-created",
          data: {
            success: true,
            frameCount: createdFrames.length,
          },
        });
      } catch (error) {
        errorHandler.handle({
          code: ErrorCode.WIREFRAME_CREATION_FAILED,
          message: "Error creating wireframe",
          originalError: error,
          context: { sourceUrl, frameCount: frames.length },
        });

        // Send error message back to UI
        figma.ui.postMessage({
          type: "wireframe-error",
          data: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    // Handle open-wireframe message from Library
    if (msg.type === "open-wireframe") {
      logger.debug("Open wireframe requested", { data: msg.data });
      // TODO: Implement opening saved wireframes
    }

    // Handle community wireframe usage
    if (msg.type === "use-community-wireframe") {
      logger.debug("Use community wireframe requested", { data: msg.data });
      // TODO: Implement community wireframe insertion
    }
  };
}
