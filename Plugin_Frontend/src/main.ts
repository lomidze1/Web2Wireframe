import { showUI } from "@create-figma-plugin/utilities";
import { logger } from "./utils/logger";
import { errorHandler, ErrorCode } from "./utils/errorHandler";

// ============================================================================
// FIGMA-READY TYPES (from Browser Extension)
// ============================================================================

/** RGBA color normalized to 0-1 range (Figma format) */
interface FigmaColor {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

/** Gradient stop */
interface FigmaGradientStop {
  color: FigmaColor;
  position: number; // 0-1
}

/** Radial gradient shape */
type RadialGradientShape = "circle" | "ellipse";

/** Radial gradient size keyword */
type RadialGradientSize =
  | "closest-side"
  | "farthest-side"
  | "closest-corner"
  | "farthest-corner";

/** Fill layer - supports solid, gradient, image placeholder */
interface FigmaFill {
  type:
    | "SOLID"
    | "GRADIENT_LINEAR"
    | "GRADIENT_RADIAL"
    | "GRADIENT_CONIC"
    | "IMAGE_PLACEHOLDER";
  visible: boolean;
  opacity: number;
  blendMode?: string;
  color?: FigmaColor;
  angle?: number;
  stops?: FigmaGradientStop[];
  // Radial/conic gradient specific
  center?: { x: number; y: number };
  shape?: RadialGradientShape; // circle or ellipse (default: ellipse)
  size?: RadialGradientSize; // CSS size keyword (default: farthest-corner)
  // Element dimensions for proper gradient transform calculation
  elementWidth?: number;
  elementHeight?: number;
  isImagePlaceholder?: boolean;
}

/** Stroke layer - border */
interface FigmaStroke {
  color: FigmaColor;
  weight: number;
  position: "INSIDE" | "CENTER" | "OUTSIDE";
  style: "SOLID" | "DASHED" | "DOTTED";
  sides?: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
}

/** Effect layer - shadow or blur */
interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
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
  className?: string; // CSS class name(s) from the element
  x: number;
  y: number;
  width: number;
  height: number;

  // CSS Positioning (for absolute elements like ::before/::after)
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";

  // Layout
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };
  // Layout Alignment (for Auto Layout)
  justifyContent?: string; // CSS justify-content value
  alignItems?: string; // CSS align-items value
  flexWrap?: string; // CSS flex-wrap value
  // Child-level flex properties
  layoutGrow?: 0 | 1; // flex-grow: 0 = fixed, 1 = fill (Figma only supports 0 or 1)
  layoutAlign?: "STRETCH" | "INHERIT"; // align-self: stretch
  // Sizing mode (how element sizes itself)
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL"; // width behavior
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL"; // height behavior

  // =========================================================================
  // NEW: Figma-ready arrays (multiple layers support)
  // =========================================================================
  fills?: FigmaFill[]; // Multiple backgrounds: gradients, colors, image placeholders
  strokes?: FigmaStroke[]; // Borders (with per-side support)
  effects?: FigmaEffect[]; // Multiple shadows, backdrop-blur

  // =========================================================================
  // LEGACY: Keep for backward compatibility
  // =========================================================================
  backgroundColor: string | null;
  backgroundGradient: string | null;
  textColor: string;
  borderColor: string | null;
  borderWidth: number;
  borderRadius:
    | number
    | {
        topLeft: number;
        topRight: number;
        bottomRight: number;
        bottomLeft: number;
      };
  opacity: number;
  // Overflow (for clipsContent)
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  // Centering (margin: 0 auto detected from original CSS)
  horizontallyCentered?: boolean;
  // Vertical centering via margin-top/bottom: auto (flex context)
  verticallyCenteredViaMargin?: boolean;
  // Self-alignment (for flex/grid children)
  alignSelf?: string;
  justifySelf?: string;
  // Margins for wrapper frame creation
  margin?: { top: number; right: number; bottom: number; left: number };

  // Text
  textContent: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: string;
  lineHeight: number | string;
  letterSpacing: number;

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
    // 5-color minimalist wireframe palette
    text: string; // Primary text (dark) - #11151a
    background: string; // Page background (light) - #f1f2f0
    secondary: string; // Borders, placeholders - #bdc1b2
    surface: string; // Cards, containers, sections - #afc6dc
    accent: string; // Buttons, links, CTAs - #c4def4
  };
  pluginFont?: string;
  cssVariables?: ExtractedCSSVariable[];
  variableMode?: "styles" | "direct";
  layoutMode?: "autoLayout" | "absolute"; // autoLayout = responsive, absolute = pixel-perfect
  // Import options
  colorMode?: "plugin" | "website";
  fontMode?: "plugin" | "website";
  textMode?: "semantic" | "lorem" | "website";
}

// Context passed to render functions for style linking
interface RenderContext {
  pluginColors: RenderWireframeData["pluginColors"];
  fontFamily: string;
  variableMode: "styles" | "direct";
  layoutMode: "autoLayout" | "absolute"; // autoLayout = use Auto Layout, absolute = use x,y positioning
  cssVariables: ExtractedCSSVariable[];
  // Map from resolved color value → PaintStyle (for linking)
  colorStyleMap: Map<string, PaintStyle>;
  // Map from variable name → resolved value
  variableValueMap: Map<string, string>;
  // Import options
  colorMode: "plugin" | "website";
  fontMode: "plugin" | "website";
  // Parent background tracking for child-parent contrast
  parentBackgroundColor?: { r: number; g: number; b: number } | null;
}

/**
 * Element color role for smart mapping
 * 5-color minimalist wireframe palette
 */
type ColorRole =
  | "text" // #11151A - ONLY for text content and placeholder icons
  | "background" // #F1F2F0 - Page/section backgrounds
  | "secondary" // #BDC1B2 - Borders, strokes
  | "surface" // #AAB5C3 - Cards, containers
  | "accent"; // #AFC6DC - Buttons, links, CTAs

/**
 * Determine the color role based on element context
 * Used when colorMode is "plugin" to map any color to 5 plugin colors
 *
 * CRITICAL RULE: "text" role is ONLY for actual text elements!
 * Fill/background elements should NEVER use "text" color - use surface/accent/secondary instead.
 */
/**
 * Check if an element is highlighted/active/featured based on className
 * Used to detect pricing cards, featured sections, etc. that have different backgrounds
 */
function isHighlightedElement(className?: string): boolean {
  if (!className) return false;
  const classLower = className.toLowerCase();
  // Common class patterns for highlighted/active/featured elements
  return /\b(active|featured|popular|highlighted|selected|primary|recommended|best|pro|premium|enterprise)\b/.test(
    classLower,
  );
}

function determineColorRole(
  elementType: "text" | "fill" | "stroke",
  tag?: string,
  isLightColor?: boolean,
  _parentBackgroundIsLight?: boolean,
  className?: string,
): ColorRole {
  // Strokes/borders ALWAYS use text color (#11151A) in plugin mode
  // This ensures clean black borders on all wireframe elements
  if (elementType === "stroke") {
    return "text";
  }

  // Text elements ONLY use text color (WCAG contrast handled separately)
  // This is the ONLY case where "text" role should be returned!
  if (elementType === "text") {
    return "text";
  }

  // FILL colors - NEVER return "text" role here!
  // Dark backgrounds should use surface or secondary, NOT text
  if (tag) {
    const tagLower = tag.toLowerCase();

    // Buttons, links, CTAs use accent
    if (
      ["button", "a", "input[type=submit]", "input[type=button]"].includes(
        tagLower,
      )
    ) {
      return "accent";
    }

    // Header/Footer - use background (light #F1F2F0) to stand out from wireframe
    // Both header and footer should be visually distinct from the main background
    if (["header", "footer"].includes(tagLower)) {
      return "background";
    }

    // Sections use surface or background
    if (["section"].includes(tagLower)) {
      return isLightColor ? "background" : "surface";
    }

    // Cards, containers - check for highlighted/active state first
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
      // Highlighted/active cards use secondary color (e.g., featured pricing card)
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

  // Default: light colors → background, dark colors → surface (NEVER text!)
  return isLightColor ? "background" : "surface";
}

/**
 * Determine the appropriate text color based on background
 * Uses WCAG contrast checking to ensure readability
 * With 5-color system: text (dark) or background (light) for contrast
 */
function getTextColorForBackground(
  bgColor: { r: number; g: number; b: number } | null,
  pluginColors: RenderWireframeData["pluginColors"],
): string {
  // If no background, use default text color
  if (!bgColor) {
    return pluginColors.text;
  }

  // Check if background is light
  const bgIsLight = isLightColorValue(bgColor);

  // Light background → dark text, Dark background → light text (background color)
  if (bgIsLight) {
    return pluginColors.text;
  } else {
    return pluginColors.background;
  }
}

/**
 * Get the dominant color from Figma Paint[] array (after conversion)
 * Used to track the ACTUAL applied color for parent-child contrast detection
 * IMPORTANT: This uses Figma's Paint[] format, not the original website fills
 */
function getDominantColorFromPaints(
  paints: Paint[] | undefined,
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

/**
 * Determine the text color for a node
 * SIMPLIFIED: All text (including links) uses the text color (black)
 * This ensures consistent, clean wireframe appearance
 */
function getSmartTextColor(
  _node: { tag?: string; fills?: FigmaFill[] },
  context: RenderContext,
  _isLink: boolean = false,
): string {
  // All text uses the same dark text color for consistency
  // Links, buttons, paragraphs, headings - all use text color
  return context.pluginColors.text;
}

/**
 * Check if a color is "light" (closer to white than black)
 */
function isLightColorValue(color: {
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
 * Examples: Blue (#3B82F6), Green, Orange - these stand out and should use secondary color
 */
function isSaturatedColor(color: { r: number; g: number; b: number }): boolean {
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
function colorsAreTooSimilar(
  color1: { r: number; g: number; b: number } | null | undefined,
  color2: { r: number; g: number; b: number } | null | undefined,
  tolerance: number = 0.05,
): boolean {
  if (!color1 || !color2) return false;

  const rDiff = Math.abs(color1.r - color2.r);
  const gDiff = Math.abs(color1.g - color2.g);
  const bDiff = Math.abs(color1.b - color2.b);

  // If all channels are within tolerance, colors are too similar
  return rDiff < tolerance && gDiff < tolerance && bDiff < tolerance;
}

/**
 * Get an alternative plugin color when child would match parent background
 * This ensures visual distinction between nested elements
 *
 * With 5-color system: surface → accent → background for light, text → secondary for dark
 */
function getAlternativePluginColor(
  currentRole: ColorRole,
  pluginColors: RenderWireframeData["pluginColors"],
  parentBgColor: { r: number; g: number; b: number } | null | undefined,
): string {
  if (!parentBgColor) return getPluginColorForRole(currentRole, pluginColors);

  const currentColorHex = getPluginColorForRole(currentRole, pluginColors);
  const currentColorRgb = cssColorToFigmaRGB(currentColorHex);
  if (!currentColorRgb) return currentColorHex;

  // Check if current color matches parent
  if (!colorsAreTooSimilar(currentColorRgb.color, parentBgColor)) {
    return currentColorHex; // No conflict, use original
  }

  // Color conflicts with parent - find alternative from 5 colors
  const isParentLight = isLightColorValue(parentBgColor);

  if (isParentLight) {
    // Parent is light, try different light colors
    const lightAlternatives: ColorRole[] = [
      "surface",
      "accent",
      "background",
      "secondary",
    ];
    for (const altRole of lightAlternatives) {
      if (altRole === currentRole) continue; // Skip current role
      const altHex = getPluginColorForRole(altRole, pluginColors);
      const altRgb = cssColorToFigmaRGB(altHex);
      if (altRgb && !colorsAreTooSimilar(altRgb.color, parentBgColor)) {
        return altHex;
      }
    }
    // If all colors conflict, use secondary
    return pluginColors.secondary;
  } else {
    // Parent is dark, try contrasting colors
    const darkAlternatives: ColorRole[] = ["text", "secondary", "accent"];
    for (const altRole of darkAlternatives) {
      if (altRole === currentRole) continue;
      const altHex = getPluginColorForRole(altRole, pluginColors);
      const altRgb = cssColorToFigmaRGB(altHex);
      if (altRgb && !colorsAreTooSimilar(altRgb.color, parentBgColor)) {
        return altHex;
      }
    }
    // If all colors conflict, use surface for contrast
    return pluginColors.surface;
  }
}

/**
 * Get the appropriate plugin color for an element
 * When colorMode is "plugin", maps any color to one of the 5 plugin colors
 */
function getPluginColorForRole(
  role: ColorRole,
  pluginColors: RenderWireframeData["pluginColors"],
): string {
  const colorMap: Record<ColorRole, string> = {
    text: pluginColors.text, // Dark - ONLY for text content
    background: pluginColors.background, // Light - page background
    secondary: pluginColors.secondary, // Medium - borders, strokes
    surface: pluginColors.surface, // Blue-gray - cards, containers
    accent: pluginColors.accent, // Light blue - buttons, links
  };
  // Fallback to surface for fills (NOT text - text is only for text content)
  return colorMap[role] || pluginColors.surface;
}

// Extract single border radius value from number or object
function getBorderRadius(
  value:
    | number
    | {
        topLeft: number;
        topRight: number;
        bottomRight: number;
        bottomLeft: number;
      }
    | undefined,
): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  // Return the maximum corner radius for uniform appearance
  return Math.max(
    value.topLeft || 0,
    value.topRight || 0,
    value.bottomRight || 0,
    value.bottomLeft || 0,
  );
}

// ============================================================================
// CSS → Figma Auto Layout Mapping
// ============================================================================

/**
 * Convert CSS justify-content to Figma primaryAxisAlignItems
 */
function cssJustifyToFigma(
  justify: string | undefined,
): "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN" {
  if (!justify) return "MIN";
  const map: Record<string, "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN"> = {
    "flex-start": "MIN",
    start: "MIN",
    left: "MIN",
    "flex-end": "MAX",
    end: "MAX",
    right: "MAX",
    center: "CENTER",
    "space-between": "SPACE_BETWEEN",
    "space-around": "SPACE_BETWEEN", // Figma approximation
    "space-evenly": "SPACE_BETWEEN", // Figma approximation
    normal: "MIN",
  };
  return map[justify] || "MIN";
}

/**
 * Convert CSS align-items to Figma counterAxisAlignItems
 */
function cssAlignToFigma(
  align: string | undefined,
): "MIN" | "CENTER" | "MAX" | "BASELINE" {
  if (!align) return "MIN";

  const map: Record<string, "MIN" | "CENTER" | "MAX" | "BASELINE"> = {
    "flex-start": "MIN",
    start: "MIN",
    "self-start": "MIN",
    "flex-end": "MAX",
    end: "MAX",
    "self-end": "MAX",
    center: "CENTER",
    stretch: "MIN", // Stretch handled via layoutAlign
    baseline: "BASELINE",
    normal: "MIN", // CSS default = not centered
  };

  return map[align] || "MIN";
}

/**
 * Convert CSS align-self to Figma layoutAlign
 * Used for child elements in Auto Layout
 */
function cssAlignSelfToFigma(
  alignSelf: string | undefined,
  parentCounterAlign: "MIN" | "CENTER" | "MAX" | "BASELINE",
): "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT" {
  if (!alignSelf || alignSelf === "auto") {
    // "auto" means inherit from parent's align-items
    return "INHERIT";
  }

  const map: Record<
    string,
    "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT"
  > = {
    "flex-start": "MIN",
    start: "MIN",
    "self-start": "MIN",
    "flex-end": "MAX",
    end: "MAX",
    "self-end": "MAX",
    center: "CENTER",
    stretch: "STRETCH",
    baseline: "MIN", // Figma doesn't support baseline for individual items
  };

  return map[alignSelf] || "INHERIT";
}

/**
 * Check if a node needs a margin wrapper frame
 * Wrapper frames are created for elements with CSS margins
 * since Figma doesn't have margin - only padding
 */
function needsMarginWrapper(
  margin: { top: number; right: number; bottom: number; left: number } | undefined,
): boolean {
  if (!margin) return false;
  return margin.top > 0 || margin.right > 0 || margin.bottom > 0 || margin.left > 0;
}

/**
 * Create a wrapper frame that converts CSS margin to Figma padding
 * The wrapper has padding equal to the element's margin
 * The child element is placed inside with its original styles
 */
function createMarginWrapper(
  child: WireframeNode,
  childNode: SceneNode,
  parentLayoutMode: "HORIZONTAL" | "VERTICAL" | "NONE",
): FrameNode {
  const margin = child.margin!;
  const wrapper = figma.createFrame();

  // Name the wrapper to indicate it's a margin wrapper
  wrapper.name = `${child.name}:margin`;

  // Make wrapper transparent (no fill)
  wrapper.fills = [];

  // Size: child size + margins
  const wrapperWidth = child.width + margin.left + margin.right;
  const wrapperHeight = child.height + margin.top + margin.bottom;
  wrapper.resize(Math.max(wrapperWidth, 1), Math.max(wrapperHeight, 1));

  // Apply Auto Layout to position child correctly
  // Use opposite direction of parent to stack margin + content
  wrapper.layoutMode = parentLayoutMode === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL";

  // Set padding = margin values
  wrapper.paddingTop = margin.top;
  wrapper.paddingRight = margin.right;
  wrapper.paddingBottom = margin.bottom;
  wrapper.paddingLeft = margin.left;

  // Center the child in wrapper (the padding will create the margin effect)
  wrapper.primaryAxisAlignItems = "MIN";
  wrapper.counterAxisAlignItems = "MIN";

  // No extra spacing
  wrapper.itemSpacing = 0;

  // Add child to wrapper
  wrapper.appendChild(childNode);

  return wrapper;
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
function cssColorToFigmaRGB(
  color: string,
): { color: RGB; opacity: number } | null {
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
  const rgbMatch = color.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i,
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

// Resolve CSS variables in a string (e.g., gradient or color)
function resolveCSSVariables(
  value: string,
  variableValueMap: Map<string, string>,
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
    },
  );
}

// Parse CSS gradient to Figma GradientPaint
function parseGradient(
  gradient: string,
  variableValueMap?: Map<string, string>,
): GradientPaint | null {
  if (!gradient) return null;

  // Resolve CSS variables first
  const resolvedGradient = variableValueMap
    ? resolveCSSVariables(gradient, variableValueMap)
    : gradient;

  // Match linear-gradient
  const linearMatch = resolvedGradient.match(
    /linear-gradient\s*\(\s*(\d+)deg\s*,\s*(.+)\)/i,
  );
  if (linearMatch) {
    const [, angleDeg, colorStopsStr] = linearMatch;
    const angle = parseInt(angleDeg);

    // Parse color stops
    const colorStops = parseColorStops(colorStopsStr);
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
  // DEBUG: Log raw fill object to verify data flow
  console.log(`[RADIAL TRANSFORM] Raw fill:`, JSON.stringify({
    center: fill.center,
    shape: fill.shape,
    size: fill.size,
    elementWidth: fill.elementWidth,
    elementHeight: fill.elementHeight,
  }));

  const cx = fill.center?.x ?? 0.5;
  const cy = fill.center?.y ?? 0.5;
  const shape = fill.shape ?? "ellipse";
  const size = fill.size ?? "farthest-corner";
  const elementWidth = fill.elementWidth ?? 100;
  const elementHeight = fill.elementHeight ?? 100;

  console.log(`[RADIAL TRANSFORM] Input: center=(${cx}, ${cy}), shape=${shape}, size=${size}, element=${elementWidth}x${elementHeight}`);

  // Step 1: Calculate distances from center to edges
  const distLeft = cx * elementWidth;
  const distRight = (1 - cx) * elementWidth;
  const distTop = cy * elementHeight;
  const distBottom = (1 - cy) * elementHeight;

  // Step 2: Calculate gradient radius based on size keyword
  let radiusX: number;
  let radiusY: number;

  switch (size) {
    case "closest-side":
      radiusX = Math.min(distLeft, distRight);
      radiusY = Math.min(distTop, distBottom);
      break;
    case "farthest-side":
      radiusX = Math.max(distLeft, distRight);
      radiusY = Math.max(distTop, distBottom);
      break;
    case "closest-corner": {
      const closestX = Math.min(distLeft, distRight);
      const closestY = Math.min(distTop, distBottom);
      const dist = Math.sqrt(closestX ** 2 + closestY ** 2);
      radiusX = radiusY = dist;
      break;
    }
    case "farthest-corner":
    default: {
      const farthestX = Math.max(distLeft, distRight);
      const farthestY = Math.max(distTop, distBottom);
      const dist = Math.sqrt(farthestX ** 2 + farthestY ** 2);
      radiusX = radiusY = dist;
      break;
    }
  }

  // Step 3: For circle shape, use equal radii
  if (shape === "circle") {
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
  // NOTE: Figma's gradient Y-axis is INVERTED (0=bottom, 1=top)
  // So we use (1-cy) for vertical positioning
  const tx = cx - scaleX * 0.5;
  const ty = (1 - cy) - scaleY * 0.5;

  console.log(`[RADIAL TRANSFORM] Output: scale=(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)}), translate=(${tx.toFixed(3)}, ${ty.toFixed(3)})`);

  return [
    [scaleX, 0, tx],
    [0, scaleY, ty],
  ];
}

/**
 * Convert Figma RGB (0-1 range) to hex color string
 */
function figmaRGBToHex(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Link fill style to a frame if a matching style exists in colorStyleMap
 * Call this AFTER setting frame.fills to link the style
 */
function linkFillStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext,
): void {
  // Only link styles when "Create Figma Styles" is enabled
  if (context.variableMode !== "styles") return;

  // Get fills (may be readonly, need to cast)
  const fills = frame.fills as readonly Paint[];
  if (!fills || fills.length === 0) return;

  // For now, only handle single solid fill (most common case)
  // Multiple fills or gradients would need more complex handling
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
function linkStrokeStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext,
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

/**
 * Convert FigmaFill[] to Figma Paint[]
 * Handles: solid colors, linear/radial/conic gradients, image placeholders
 *
 * IMPORTANT: CSS backgrounds are top-to-bottom (first = top layer)
 * Figma fills are bottom-to-top (first = bottom layer)
 * So we REVERSE the order at the end!
 */
function convertFillsToPaints(
  fills: FigmaFill[] | undefined,
  context: RenderContext,
  tag?: string,
  className?: string,
): Paint[] {
  if (!fills || fills.length === 0) return [];

  const paints: Paint[] = [];
  const parentBg = context.parentBackgroundColor;

  for (const fill of fills) {
    if (!fill.visible) continue;

    switch (fill.type) {
      case "SOLID":
        if (fill.color) {
          // When colorMode is "plugin", map solid colors to plugin palette
          let finalColor = {
            r: fill.color.r,
            g: fill.color.g,
            b: fill.color.b,
          };
          if (context.colorMode === "plugin") {
            const isLight = isLightColorValue(fill.color);
            const isSaturated = isSaturatedColor(fill.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);

            // Override: Saturated fills on cards/containers → secondary (highlighted)
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }

            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              finalColor = pluginColorRGB.color;
            }
          }
          const solidPaint: SolidPaint = {
            type: "SOLID",
            color: finalColor,
            opacity: context.colorMode === "plugin" ? 1.0 : fill.opacity * fill.color.a,
          };
          paints.push(solidPaint);
        }
        break;

      case "GRADIENT_LINEAR":
        if (fill.stops && fill.stops.length >= 2) {
          if (context.colorMode === "plugin") {
            const dominantStop = fill.stops[0];
            const isLight = isLightColorValue(dominantStop.color);
            const isSaturated = isSaturatedColor(dominantStop.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }
            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              paints.push({
                type: "SOLID",
                color: pluginColorRGB.color,
                opacity: 1.0,
              });
            }
          } else {
            const angle = fill.angle || 180;
            const angleRad = ((angle - 90) * Math.PI) / 180;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);

            const linearPaint: GradientPaint = {
              type: "GRADIENT_LINEAR",
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              gradientTransform: [
                [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
                [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
              ],
            };
            paints.push(linearPaint);
          }
        }
        break;

      case "GRADIENT_RADIAL":
        if (fill.stops && fill.stops.length >= 2) {
          if (context.colorMode === "plugin") {
            const dominantStop = fill.stops[0];
            const isLight = isLightColorValue(dominantStop.color);
            const isSaturated = isSaturatedColor(dominantStop.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }
            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              paints.push({
                type: "SOLID",
                color: pluginColorRGB.color,
                opacity: 1.0,
              });
            }
          } else {
            const radialTransform = calculateRadialGradientTransform(fill);
            const radialPaint: GradientPaint = {
              type: "GRADIENT_RADIAL",
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              gradientTransform: radialTransform,
            };
            console.log(`[RADIAL PAINT] Final paint:`, JSON.stringify({
              type: radialPaint.type,
              gradientTransform: radialPaint.gradientTransform,
              stopsCount: radialPaint.gradientStops.length,
            }));
            paints.push(radialPaint);
          }
        }
        break;

      case "GRADIENT_CONIC":
        if (fill.stops && fill.stops.length >= 2) {
          if (context.colorMode === "plugin") {
            const dominantStop = fill.stops[0];
            const isLight = isLightColorValue(dominantStop.color);
            const isSaturated = isSaturatedColor(dominantStop.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }
            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              paints.push({
                type: "SOLID",
                color: pluginColorRGB.color,
                opacity: 1.0,
              });
            }
          } else {
            const angularPaint: GradientPaint = {
              type: "GRADIENT_ANGULAR",
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              gradientTransform: [[1, 0, 0], [0, 1, 0]],
            };
            paints.push(angularPaint);
          }
        }
        break;

      case "IMAGE_PLACEHOLDER":
        const surfaceRgb = hexToFigmaRGB(context.pluginColors.surface);
        paints.push({
          type: "SOLID",
          color: surfaceRgb,
          opacity: context.colorMode === "plugin" ? 1.0 : fill.opacity,
        });
        break;
    }
  }

  // CRITICAL: Reverse the order!
  // CSS backgrounds: first = top layer (front)
  // Figma fills: first = bottom layer (back)
  return paints.reverse();
}

/**
 * Convert FigmaStroke[] to Figma strokes
 * Note: Figma doesn't support different colors per side, so we use the first stroke
 * In plugin colors mode: ALWAYS use text color (#11151A) for clean black borders
 */
function convertStrokesToFigma(
  strokes: FigmaStroke[] | undefined,
  context?: RenderContext,
): { paints: Paint[]; weight: number } {
  if (!strokes || strokes.length === 0) {
    return { paints: [], weight: 0 };
  }

  // Use first stroke for weight
  const firstStroke = strokes[0];

  // In plugin colors mode: ALL strokes/borders use text color (#11151A)
  // This ensures only 5 plugin colors are used in wireframes
  if (context?.colorMode === "plugin" && context.pluginColors) {
    const textColor = hexToFigmaRGB(context.pluginColors.text);
    const paints: Paint[] = [
      {
        type: "SOLID",
        color: textColor,
        opacity: 1.0,
      },
    ];
    return { paints, weight: firstStroke.weight };
  }

  // Website colors mode: use original stroke color
  const paints: Paint[] = [
    {
      type: "SOLID",
      color: {
        r: firstStroke.color.r,
        g: firstStroke.color.g,
        b: firstStroke.color.b,
      },
      opacity: firstStroke.color.a,
    },
  ];

  return { paints, weight: firstStroke.weight };
}

/**
 * Convert FigmaEffect[] to Figma Effect[]
 * Handles: drop shadow, inner shadow, background blur, layer blur
 * In plugin colors mode: shadows and background blur are removed for clean wireframes
 */
function convertEffectsToFigma(
  effects: FigmaEffect[] | undefined,
  context?: RenderContext,
): Effect[] {
  if (!effects || effects.length === 0) return [];

  const figmaEffects: Effect[] = [];
  const isPluginColors = context?.colorMode === "plugin";

  for (const effect of effects) {
    if (!effect.visible) continue;

    switch (effect.type) {
      case "DROP_SHADOW":
        // Skip shadows in plugin colors mode - wireframes don't need shadows
        if (isPluginColors) continue;

        if (effect.color && effect.offset) {
          figmaEffects.push({
            type: "DROP_SHADOW",
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
            blendMode: "NORMAL",
          });
        }
        break;

      case "INNER_SHADOW":
        // Skip shadows in plugin colors mode - wireframes don't need shadows
        if (isPluginColors) continue;

        if (effect.color && effect.offset) {
          figmaEffects.push({
            type: "INNER_SHADOW",
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
            blendMode: "NORMAL",
          });
        }
        break;

      case "BACKGROUND_BLUR":
        // Skip background blur in plugin colors mode - wireframes don't need blur effects
        if (isPluginColors) continue;

        figmaEffects.push({
          type: "BACKGROUND_BLUR",
          visible: true,
          radius: effect.blurRadius || effect.radius || 10,
        });
        break;

      case "LAYER_BLUR":
        figmaEffects.push({
          type: "LAYER_BLUR",
          visible: true,
          radius: effect.blurRadius || effect.radius || 10,
        });
        break;
    }
  }

  return figmaEffects;
}

// Create modern image placeholder icon
// Matches the SVG design with mountain, sun, and clean border
async function createImagePlaceholderIcon(
  size: number,
  borderColor: RGB,
  iconColorHex: string,
  context: RenderContext,
): Promise<FrameNode> {
  const iconFrame = figma.createFrame();
  iconFrame.name = "Image Icon";
  iconFrame.resize(size, size);
  iconFrame.fills = [];

  const iconColor = borderColor;
  const strokeWeight = Math.max(1.5, size / 30);

  // Helper function to link style for shape nodes
  const linkShapeStyle = (
    node: RectangleNode | EllipseNode | PolygonNode,
    isFill: boolean,
  ) => {
    if (context.variableMode !== "styles") return;
    const normalizedColor = normalizeColorForLookup(iconColorHex);
    const linkedStyle = context.colorStyleMap.get(normalizedColor);
    if (linkedStyle) {
      if (isFill) {
        node.fillStyleId = linkedStyle.id;
      } else {
        node.strokeStyleId = linkedStyle.id;
      }
    }
  };

  // Outer rounded rectangle (image frame border)
  const outerRect = figma.createRectangle();
  const rectWidth = size * 0.85;
  const rectHeight = size * 0.7;
  outerRect.resize(rectWidth, rectHeight);
  outerRect.x = (size - rectWidth) / 2;
  outerRect.y = (size - rectHeight) / 2;
  outerRect.fills = [];
  outerRect.strokes = [{ type: "SOLID", color: iconColor }];
  outerRect.strokeWeight = strokeWeight;
  outerRect.cornerRadius = size * 0.06;
  linkShapeStyle(outerRect, false); // Link stroke style
  iconFrame.appendChild(outerRect);

  // Sun circle (top right area)
  const sunSize = size * 0.12;
  const sun = figma.createEllipse();
  sun.resize(sunSize, sunSize);
  sun.x = outerRect.x + rectWidth * 0.65;
  sun.y = outerRect.y + rectHeight * 0.15;
  sun.fills = [{ type: "SOLID", color: iconColor }];
  sun.strokes = [];
  linkShapeStyle(sun, true); // Link fill style
  iconFrame.appendChild(sun);

  // Large mountain (bottom left, triangle)
  const mountain1 = figma.createPolygon();
  mountain1.pointCount = 3;
  const mountain1Width = rectWidth * 0.55;
  const mountain1Height = rectHeight * 0.45;
  mountain1.resize(mountain1Width, mountain1Height);
  mountain1.x = outerRect.x + rectWidth * 0.08;
  mountain1.y = outerRect.y + rectHeight - mountain1Height - rectHeight * 0.08;
  mountain1.fills = [{ type: "SOLID", color: iconColor }];
  mountain1.strokes = [];
  linkShapeStyle(mountain1, true); // Link fill style
  iconFrame.appendChild(mountain1);

  // Small mountain (overlapping, right side)
  const mountain2 = figma.createPolygon();
  mountain2.pointCount = 3;
  const mountain2Width = rectWidth * 0.35;
  const mountain2Height = rectHeight * 0.3;
  mountain2.resize(mountain2Width, mountain2Height);
  mountain2.x = outerRect.x + rectWidth * 0.45;
  mountain2.y = outerRect.y + rectHeight - mountain2Height - rectHeight * 0.08;
  mountain2.fills = [{ type: "SOLID", color: iconColor }];
  mountain2.strokes = [];
  linkShapeStyle(mountain2, true); // Link fill style
  iconFrame.appendChild(mountain2);

  return iconFrame;
}

// Create placeholder for images/videos
// Uses a clean, modern design with the image icon centered
async function createPlaceholder(
  node: WireframeNode,
  surfaceColor: string,
  borderColor: string | undefined,
  context: RenderContext,
): Promise<FrameNode> {
  const placeholder = figma.createFrame();
  placeholder.name = node.name || "Image";
  placeholder.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Surface background color (light gray like #dedede from SVG)
  const surfaceRgb = hexToFigmaRGB(surfaceColor);

  // Check if we should link to a style (when "Create Figma Styles" is enabled)
  let styleLinked = false;
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(surfaceColor);
    const linkedStyle = context.colorStyleMap.get(normalizedColor);
    if (linkedStyle) {
      placeholder.fillStyleId = linkedStyle.id;
      styleLinked = true;
    }
  }

  // Apply direct color if no style was linked
  if (!styleLinked) {
    placeholder.fills = [
      {
        type: "SOLID",
        color: surfaceRgb,
        // Plugin colors mode: 100% opacity, Website mode: 60% for softer appearance
        opacity: context.colorMode === "plugin" ? 1.0 : 0.6,
      },
    ];
  }

  // Border radius
  const cornerRadius = getBorderRadius(node.borderRadius);
  if (cornerRadius > 0) {
    placeholder.cornerRadius = Math.min(
      cornerRadius,
      Math.min(node.width, node.height) / 2,
    );
  }

  // Determine icon color (use provided color or derive from surface color)
  // In plugin mode, iconColor is passed from pluginColors.text (dark)
  // This is the ONLY place where text color is used outside of actual text content
  // Fallback: darken the surface color for contrast
  let iconColor: RGB;
  if (borderColor) {
    iconColor = hexToFigmaRGB(borderColor);
  } else {
    // Derive icon color from surface: make it darker for contrast
    const surfaceLuminance =
      0.299 * surfaceRgb.r + 0.587 * surfaceRgb.g + 0.114 * surfaceRgb.b;
    const darkenFactor = surfaceLuminance > 0.5 ? 0.5 : 1.5; // Darken light, lighten dark
    iconColor = {
      r: Math.min(1, Math.max(0, surfaceRgb.r * darkenFactor)),
      g: Math.min(1, Math.max(0, surfaceRgb.g * darkenFactor)),
      b: Math.min(1, Math.max(0, surfaceRgb.b * darkenFactor)),
    };
  }

  // Add image icon in center
  // Size the icon proportionally to the placeholder
  const minDimension = Math.min(node.width, node.height);
  const iconSize = Math.min(Math.max(minDimension * 0.4, 24), 120); // Min 24px, max 120px

  if (iconSize >= 20) {
    const icon = await createImagePlaceholderIcon(
      iconSize,
      iconColor,
      borderColor || "",
      context,
    );
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
      if (
        child.type === "text" &&
        child.textContent &&
        child.textContent.trim() !== ""
      ) {
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
  context?: RenderContext,
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

  // Prefer node's fontFamily, then context fontFamily, then Inter as fallback
  const targetFont = node.fontFamily || fontFamily;
  let usedFontFamily = targetFont;
  const fontStyles = Array.from(fontsToLoad);
  try {
    for (const style of fontStyles) {
      await figma.loadFontAsync({ family: targetFont, style });
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
  // In plugin colors mode, add whitespace separator between nested segments (a, span inside parent)
  // This ensures text like "Home" + "About" becomes "Home About" instead of "HomeAbout"
  let fullText: string;
  if (context?.colorMode === "plugin" && segments.length > 1) {
    // Add separator between segments only if they don't already have whitespace
    fullText = segments
      .map((s, i) => {
        const text = s.text;
        // Add leading space if previous segment doesn't end with space and this doesn't start with space
        if (i > 0) {
          const prevText = segments[i - 1].text;
          const prevEndsWithSpace = /\s$/.test(prevText);
          const thisStartsWithSpace = /^\s/.test(text);
          if (!prevEndsWithSpace && !thisStartsWithSpace) {
            return " " + text;
          }
        }
        return text;
      })
      .join("");
  } else {
    fullText = segments.map((s) => s.text).join("");
  }
  textNode.characters = fullText;

  // Apply base font size
  textNode.fontSize = Math.max(node.fontSize || 14, 8);

  // Apply range-specific styling if there are multiple segments
  if (segments.length > 1) {
    let charIndex = 0;
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const segment = segments[segIdx];

      // Account for added separator space in plugin mode
      let addedSeparator = 0;
      if (context?.colorMode === "plugin" && segIdx > 0) {
        const prevText = segments[segIdx - 1].text;
        const prevEndsWithSpace = /\s$/.test(prevText);
        const thisStartsWithSpace = /^\s/.test(segment.text);
        if (!prevEndsWithSpace && !thisStartsWithSpace) {
          addedSeparator = 1; // We added a space
        }
      }

      const startIdx = charIndex + addedSeparator;
      const endIdx = startIdx + segment.text.length;
      charIndex = endIdx;

      if (startIdx >= endIdx) continue;

      // Apply segment color - when colorMode is "plugin", use smart context-aware colors
      let segmentColorToUse = segment.color;
      if (context?.colorMode === "plugin") {
        const tagLower = node.tag?.toLowerCase() || "";
        const isLink = tagLower === "a";
        segmentColorToUse = getSmartTextColor(node, context, isLink);
      }
      const colorWithOpacity = cssColorToFigmaRGB(segmentColorToUse);
      if (colorWithOpacity) {
        // Check if we should link to a style (when "Create Figma Styles" is enabled)
        let linkedStyle: PaintStyle | undefined;
        if (context && context.variableMode === "styles") {
          // Normalize color for lookup
          const normalizedColor = normalizeColorForLookup(segmentColorToUse);
          linkedStyle = context.colorStyleMap.get(normalizedColor);
        }

        if (linkedStyle) {
          textNode.setRangeFillStyleId(startIdx, endIdx, linkedStyle.id);
        } else {
          textNode.setRangeFills(startIdx, endIdx, [
            {
              type: "SOLID",
              color: colorWithOpacity.color,
              // Plugin colors mode: 100% opacity for clean wireframes
              opacity:
                context?.colorMode === "plugin"
                  ? 1.0
                  : colorWithOpacity.opacity,
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
        textNode.setRangeFontSize(
          startIdx,
          endIdx,
          Math.max(segment.fontSize, 8),
        );
      }
    }
  } else {
    // Single segment - apply simple styling
    const segment = segments[0];
    // When colorMode is "plugin", use smart context-aware colors
    let singleColorToUse = segment.color;
    if (context?.colorMode === "plugin") {
      const tagLower = node.tag?.toLowerCase() || "";
      const isLink = tagLower === "a";
      singleColorToUse = getSmartTextColor(node, context, isLink);
    }
    const colorWithOpacity = cssColorToFigmaRGB(singleColorToUse);

    if (colorWithOpacity) {
      // Check if we should link to a style (when "Create Figma Styles" is enabled)
      let linkedStyle: PaintStyle | undefined;
      if (context && context.variableMode === "styles") {
        const normalizedColor = normalizeColorForLookup(singleColorToUse);
        linkedStyle = context.colorStyleMap.get(normalizedColor);
      }

      if (linkedStyle) {
        textNode.fillStyleId = linkedStyle.id;
      } else {
        textNode.fills = [
          {
            type: "SOLID",
            color: colorWithOpacity.color,
            // Plugin colors mode: 100% opacity for clean wireframes
            opacity:
              context?.colorMode === "plugin" ? 1.0 : colorWithOpacity.opacity,
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

  // Line height
  if (node.lineHeight && node.lineHeight !== "normal") {
    if (typeof node.lineHeight === "number") {
      textNode.lineHeight = { value: node.lineHeight, unit: "PIXELS" };
    } else if (typeof node.lineHeight === "string") {
      if (node.lineHeight.endsWith("%")) {
        const percentValue = parseFloat(node.lineHeight);
        if (!isNaN(percentValue)) {
          textNode.lineHeight = { value: percentValue, unit: "PERCENT" };
        }
      } else if (node.lineHeight.endsWith("px")) {
        const pxValue = parseFloat(node.lineHeight);
        if (!isNaN(pxValue)) {
          textNode.lineHeight = { value: pxValue, unit: "PIXELS" };
        }
      } else {
        // Try parsing as number (unitless multiplier or raw pixel value)
        const numValue = parseFloat(node.lineHeight);
        if (!isNaN(numValue)) {
          // If it's a small value like 1.5, treat as multiplier (convert to percent)
          if (numValue < 10) {
            textNode.lineHeight = { value: numValue * 100, unit: "PERCENT" };
          } else {
            textNode.lineHeight = { value: numValue, unit: "PIXELS" };
          }
        }
      }
    }
  }

  // Letter spacing
  if (node.letterSpacing && node.letterSpacing !== 0) {
    textNode.letterSpacing = { value: node.letterSpacing, unit: "PIXELS" };
  }

  // Set text box size and auto-resize behavior
  // textAutoResize options:
  // - "NONE": Fixed width and height
  // - "HEIGHT": Fixed width, auto height (default for most text)
  // - "WIDTH_AND_HEIGHT": Auto width and height (for fit-content)
  // - "TRUNCATE": Fixed width and height with truncation

  // Check if this is a single character or very small text (like bullet points)
  // These need auto-sizing because CSS width might be too narrow
  const isSingleChar = fullText.length <= 2;
  const isVeryNarrow = node.width < (node.fontSize || 14) * 1.5;

  // Inline elements (a, span, label, etc.) should default to HUG (auto-width)
  // unless explicitly set to FIXED. These elements naturally fit their content.
  const inlineTags = ["a", "span", "label", "strong", "em", "b", "i", "code", "small", "mark"];
  const isInlineElement = node.tag && inlineTags.includes(node.tag.toLowerCase());

  // Use HUG (auto-width) for:
  // 1. Explicit HUG sizing
  // 2. Single characters (bullets, icons)
  // 3. Very narrow elements
  // 4. Inline elements (they naturally fit content)
  const shouldHug =
    node.layoutSizingHorizontal === "HUG" ||
    isSingleChar ||
    isVeryNarrow ||
    isInlineElement;

  if (shouldHug) {
    // width: fit-content, max-content, min-content, or inline element - let Figma auto-size width
    textNode.textAutoResize = "WIDTH_AND_HEIGHT";
    // Note: We don't call resize() here because Figma will auto-size
  } else {
    // Fixed width, auto height (default behavior for block elements)
    textNode.resize(Math.max(node.width, 1), Math.max(node.height, 1));
    textNode.textAutoResize = "HEIGHT";
  }

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
  context: RenderContext,
): Promise<FrameNode | null> {
  // Create the wrapper frame
  const frame = figma.createFrame();
  frame.name = node.name || "Button";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout for proper text containment
  frame.layoutMode =
    node.layoutMode && node.layoutMode !== "NONE"
      ? node.layoutMode
      : "HORIZONTAL";
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
    const paints = convertFillsToPaints(
      node.fills,
      context,
      node.tag,
      node.className,
    );
    if (paints.length > 0) {
      frame.fills = paints;
      // Link to Figma style if "Create Figma Styles" is enabled
      linkFillStyleIfAvailable(frame, context);
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
    const { paints, weight } = convertStrokesToFigma(node.strokes, context);
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      frame.strokeAlign = "INSIDE";
      // Link to Figma style if "Create Figma Styles" is enabled
      linkStrokeStyleIfAvailable(frame, context);
    }
  }

  // =========================================================================
  // Apply effects (shadows, blur) to the frame
  // =========================================================================
  if (node.effects && node.effects.length > 0) {
    const figmaEffects = convertEffectsToFigma(node.effects, context);
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
  context: RenderContext,
  tag?: string,
  className?: string,
): void {
  // When colorMode is "plugin", use smart color mapping based on element role
  let effectiveColor = color;
  if (context.colorMode === "plugin") {
    const colorWithOpacity = cssColorToFigmaRGB(color);
    if (colorWithOpacity) {
      const isLight = isLightColorValue(colorWithOpacity.color);
      const role = determineColorRole(
        "fill",
        tag,
        isLight,
        undefined,
        className,
      );
      effectiveColor = getPluginColorForRole(role, context.pluginColors);
    }
  }

  const colorWithOpacity = cssColorToFigmaRGB(effectiveColor);
  if (!colorWithOpacity) {
    frame.fills = [];
    return;
  }

  // Check if we should link to a style (when "Create Figma Styles" is enabled)
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(effectiveColor);
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
      // Plugin colors mode: 100% opacity for clean wireframes
      opacity: context.colorMode === "plugin" ? 1.0 : colorWithOpacity.opacity,
    },
  ];
}

// Apply stroke to a frame with optional style linking
function applyStrokeToFrame(
  frame: FrameNode,
  color: string,
  strokeWeight: number,
  context: RenderContext,
): void {
  // When colorMode is "plugin", always use plugin TEXT color (#11151A) for borders
  // This ensures clean black borders on all wireframe elements
  const effectiveColor =
    context.colorMode === "plugin" ? context.pluginColors.text : color;

  const colorWithOpacity = cssColorToFigmaRGB(effectiveColor);
  if (!colorWithOpacity) return;

  // Check if we should link to a style (when "Create Figma Styles" is enabled)
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(effectiveColor);
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
      // Plugin colors mode: 100% opacity for clean wireframes
      opacity: context.colorMode === "plugin" ? 1.0 : colorWithOpacity.opacity,
    },
  ];
  frame.strokeWeight = strokeWeight;
}

// Recursively create Figma nodes from tree structure
async function createNodeInFigma(
  node: WireframeNode,
  context: RenderContext,
  depth: number = 0,
): Promise<SceneNode | null> {
  // DEBUG: Log root node to check if fills are present
  if (depth === 0) {
    console.log(`[NODE DEBUG] Root "${node.name}" | fills=${node.fills?.length || 0} | bgColor=${node.backgroundColor || 'none'}`);
  }

  // Depth limit to prevent infinite recursion
  if (depth > 20) {
    logger.warn("Max depth reached", { nodeId: node.id, depth });
    return null;
  }

  // Handle text nodes (including those with inline children like <a> inside <h2>)
  if (node.type === "text") {
    // DEBUG: Log text node rendering
    console.log("[main.ts] Rendering TEXT node:", {
      id: node.id,
      type: node.type,
      tag: node.tag,
      textContent: node.textContent?.substring(0, 50),
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    });

    // Check if text node has background fills (like buttons)
    // In Figma, TextNode can't have background - need to wrap in a Frame
    const hasBackgroundFills = node.fills && node.fills.length > 0;
    const hasBackgroundStrokes = node.strokes && node.strokes.length > 0;
    const hasBackgroundEffects = node.effects && node.effects.length > 0;
    const br = node.borderRadius;
    const hasBorderRadius =
      br &&
      typeof br === "object" &&
      (br.topLeft > 0 ||
        br.topRight > 0 ||
        br.bottomRight > 0 ||
        br.bottomLeft > 0);

    // If text has background styling, wrap in a frame (like a button)
    if (
      hasBackgroundFills ||
      hasBackgroundStrokes ||
      hasBackgroundEffects ||
      hasBorderRadius
    ) {
      return await createTextWithBackground(node, context);
    }

    // Simple text node without background
    return await createTextNode(node, context.fontFamily, context);
  }

  // Handle placeholders (images/videos)
  // Background uses secondary color, icon uses text color (dark - the ONLY exception for using text color outside of actual text)
  if (node.type === "placeholder" || node.isPlaceholder) {
    return await createPlaceholder(
      node,
      context.pluginColors.secondary,
      context.pluginColors.text,
      context,
    );
  }

  // Create frame for containers
  const frame = figma.createFrame();
  frame.name = node.name || "Container";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout ONLY if context.layoutMode is "autoLayout"
  // When context.layoutMode is "absolute", skip Auto Layout and use x/y positioning
  const useAutoLayout = context.layoutMode === "autoLayout";

  // In Auto Layout mode, ALL frames get Auto Layout (like html.to.design)
  // In Absolute mode, NO frames get Auto Layout - only x/y positioning
  if (useAutoLayout) {
    // Use CSS layout direction if available, otherwise default to VERTICAL
    // This ensures ALL containers have Auto Layout in "autoLayout" mode
    frame.layoutMode =
      node.layoutMode && node.layoutMode !== "NONE"
        ? node.layoutMode
        : "VERTICAL";

    // Apply sizing mode for this Auto Layout frame (as a parent)
    // Parent frames can be FIXED or HUG (not FILL - that's for children)
    if (node.layoutSizingHorizontal === "HUG") {
      frame.layoutSizingHorizontal = "HUG";
    } else {
      frame.layoutSizingHorizontal = "FIXED";
    }
    if (node.layoutSizingVertical === "HUG") {
      frame.layoutSizingVertical = "HUG";
    } else {
      frame.layoutSizingVertical = "FIXED";
    }

    // Apply alignment from CSS justify-content and align-items
    const primaryResult = cssJustifyToFigma(node.justifyContent);
    const counterResult = cssAlignToFigma(node.alignItems);

    frame.primaryAxisAlignItems = primaryResult;
    frame.counterAxisAlignItems = counterResult;

    // Apply flex-wrap
    if (node.flexWrap === "wrap" || node.flexWrap === "wrap-reverse") {
      frame.layoutWrap = "WRAP";
    }

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
    const paints = convertFillsToPaints(
      node.fills,
      context,
      node.tag,
      node.className,
    );
    if (paints.length > 0) {
      frame.fills = paints;
      // Link to Figma style if "Create Figma Styles" is enabled
      linkFillStyleIfAvailable(frame, context);
    } else {
      frame.fills = [];
    }
  }
  // LEGACY: Fallback to old gradient/backgroundColor fields
  else if (node.backgroundGradient) {
    const gradientPaint = parseGradient(
      node.backgroundGradient,
      context.variableValueMap,
    );
    if (gradientPaint) {
      frame.fills = [gradientPaint];
      linkFillStyleIfAvailable(frame, context);
    } else if (node.backgroundColor) {
      applyFillToFrame(
        frame,
        node.backgroundColor,
        context,
        node.tag,
        node.className,
      );
    } else {
      frame.fills = [];
    }
  } else if (node.backgroundColor) {
    applyFillToFrame(
      frame,
      node.backgroundColor,
      context,
      node.tag,
      node.className,
    );
  } else {
    frame.fills = [];
  }

  // =========================================================================
  // NEW: Apply strokes from Figma-ready array
  // =========================================================================
  if (node.strokes && node.strokes.length > 0) {
    const { paints, weight } = convertStrokesToFigma(node.strokes, context);
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      // Link to Figma style if "Create Figma Styles" is enabled
      linkStrokeStyleIfAvailable(frame, context);
    }
  }
  // LEGACY: Fallback to old borderColor/borderWidth fields
  else if (node.borderWidth > 0 && node.borderColor) {
    applyStrokeToFrame(frame, node.borderColor, node.borderWidth, context);
  }

  // =========================================================================
  // NEW: Apply effects from Figma-ready array (shadows, blur)
  // Uses neutral shadows in plugin colors mode for consistency
  // =========================================================================
  if (node.effects && node.effects.length > 0) {
    const figmaEffects = convertEffectsToFigma(node.effects, context);
    if (figmaEffects.length > 0) {
      frame.effects = figmaEffects;
    }
  }

  // Apply border radius
  if (getBorderRadius(node.borderRadius) > 0) {
    frame.cornerRadius = Math.min(
      getBorderRadius(node.borderRadius),
      Math.min(node.width, node.height) / 2,
    );
  }

  // Apply opacity - but SKIP in plugin colors mode (wireframes should be 100% solid)
  if (context.colorMode !== "plugin" && node.opacity < 1 && node.opacity > 0) {
    frame.opacity = node.opacity;
  }

  // Clips content - based on CSS overflow
  // overflow: hidden, scroll, auto = clipsContent true
  // overflow: visible = clipsContent false (default)
  frame.clipsContent =
    node.overflow === "hidden" ||
    node.overflow === "scroll" ||
    node.overflow === "auto";

  // Recursively create children
  if (node.children && node.children.length > 0) {
    // In Auto Layout mode, ALL parents have Auto Layout (we set it above)
    // In Absolute mode, NO parents have Auto Layout
    const parentHasAutoLayout = useAutoLayout;

    // Get ACTUAL applied background color from this frame (after plugin color conversion)
    // This enables correct child-parent color conflict detection
    // IMPORTANT: Use frame.fills (Figma Paint[]), not node.fills (original website colors)!
    const currentBgColor = getDominantColorFromPaints(frame.fills as Paint[]);
    // If current node has no fill, inherit from parent context (search up the tree)
    const effectiveParentBg = currentBgColor || context.parentBackgroundColor;

    // Create child context with parent background tracking
    const childContext: RenderContext = {
      ...context,
      parentBackgroundColor: effectiveParentBg,
    };

    for (const child of node.children) {
      try {
        const childNode = await createNodeInFigma(
          child,
          childContext,
          depth + 1,
        );

        if (childNode) {
          // Check if child needs a margin wrapper (CSS margins → Figma padding wrapper)
          // Only in Auto Layout mode - absolute mode uses x/y positioning
          let nodeToAppend: SceneNode = childNode;
          if (
            parentHasAutoLayout &&
            needsMarginWrapper(child.margin) &&
            child.position !== "absolute" &&
            child.position !== "fixed"
          ) {
            nodeToAppend = createMarginWrapper(child, childNode, frame.layoutMode);
          }

          // Append child (or wrapper) first (required for Auto Layout properties)
          frame.appendChild(nodeToAppend);

          // Check if child has absolute/fixed positioning (like ::before/::after pseudo elements)
          // These should be positioned absolutely in Figma, not controlled by Auto Layout
          if (child.position === "absolute" || child.position === "fixed") {
            // IMPORTANT: layoutPositioning = "ABSOLUTE" only works if parent has Auto Layout
            // If parent has layoutMode = NONE, we can't set layoutPositioning
            if (parentHasAutoLayout && "layoutPositioning" in childNode) {
              (childNode as FrameNode | TextNode).layoutPositioning =
                "ABSOLUTE";
            }
            // Set x/y coordinates for absolute positioning
            childNode.x = child.x;
            childNode.y = child.y;
          } else if (parentHasAutoLayout) {
            // Auto Layout parent: apply child-level properties
            // These properties work on most node types
            if (
              childNode.type === "FRAME" ||
              childNode.type === "COMPONENT" ||
              childNode.type === "INSTANCE"
            ) {
              const frameChild = childNode as FrameNode;

              // Apply layoutGrow (flex-grow equivalent)
              if (child.layoutGrow === 1) {
                frameChild.layoutGrow = 1;
              }

              // Apply layoutAlign from CSS align-self
              // Priority: align-self > layoutAlign > inherit from parent
              const selfAlign = cssAlignSelfToFigma(
                child.alignSelf,
                frame.counterAxisAlignItems,
              );
              if (selfAlign === "STRETCH") {
                frameChild.layoutAlign = "STRETCH";
              } else if (selfAlign === "CENTER") {
                // CENTER align-self means don't stretch, stay centered
                frameChild.layoutAlign = "INHERIT";
              } else if (child.layoutAlign === "STRETCH") {
                // Fallback to legacy layoutAlign
                frameChild.layoutAlign = "STRETCH";
              }

              // Apply sizing mode for children inside Auto Layout
              // Children can be FIXED or FILL (HUG only if they have their own auto-layout)
              // Use frame.layoutMode (not node.layoutMode) since we may have defaulted to VERTICAL
              const isHorizontalLayout = frame.layoutMode === "HORIZONTAL";

              // Primary axis sizing (along the layout direction)
              if (isHorizontalLayout) {
                // Horizontal layout: width is primary axis
                if (
                  child.layoutSizingHorizontal === "FILL" ||
                  child.layoutGrow === 1
                ) {
                  frameChild.layoutSizingHorizontal = "FILL";
                } else if (
                  child.layoutSizingHorizontal === "HUG" &&
                  frameChild.layoutMode !== "NONE"
                ) {
                  frameChild.layoutSizingHorizontal = "HUG";
                }
                // Counter axis (vertical): FILL if stretching
                if (
                  child.layoutAlign === "STRETCH" ||
                  child.layoutSizingVertical === "FILL"
                ) {
                  frameChild.layoutSizingVertical = "FILL";
                } else if (
                  child.layoutSizingVertical === "HUG" &&
                  frameChild.layoutMode !== "NONE"
                ) {
                  frameChild.layoutSizingVertical = "HUG";
                }
              } else {
                // Vertical layout: height is primary axis
                if (
                  child.layoutSizingVertical === "FILL" ||
                  child.layoutGrow === 1
                ) {
                  frameChild.layoutSizingVertical = "FILL";
                } else if (
                  child.layoutSizingVertical === "HUG" &&
                  frameChild.layoutMode !== "NONE"
                ) {
                  frameChild.layoutSizingVertical = "HUG";
                }
                // Counter axis (horizontal): FILL if stretching
                if (
                  child.layoutAlign === "STRETCH" ||
                  child.layoutSizingHorizontal === "FILL"
                ) {
                  frameChild.layoutSizingHorizontal = "FILL";
                } else if (
                  child.layoutSizingHorizontal === "HUG" &&
                  frameChild.layoutMode !== "NONE"
                ) {
                  frameChild.layoutSizingHorizontal = "HUG";
                }
              }
            } else if (childNode.type === "TEXT") {
              // Text nodes can also have sizing in auto-layout
              const textChild = childNode as TextNode;
              // Use frame.layoutMode (not node.layoutMode) since we may have defaulted to VERTICAL
              const isHorizontalLayout = frame.layoutMode === "HORIZONTAL";

              if (isHorizontalLayout) {
                // Primary axis (horizontal)
                if (child.layoutSizingHorizontal === "FILL") {
                  textChild.layoutSizingHorizontal = "FILL";
                  textChild.textAutoResize = "HEIGHT"; // Fixed width, auto height
                } else if (child.layoutSizingHorizontal === "HUG") {
                  textChild.layoutSizingHorizontal = "HUG";
                  textChild.textAutoResize = "WIDTH_AND_HEIGHT"; // Auto width and height
                }
                // Counter axis (vertical)
                if (
                  child.layoutAlign === "STRETCH" ||
                  child.layoutSizingVertical === "FILL"
                ) {
                  textChild.layoutSizingVertical = "FILL";
                }
              } else {
                // Primary axis (vertical)
                if (child.layoutSizingVertical === "FILL") {
                  textChild.layoutSizingVertical = "FILL";
                } else if (child.layoutSizingVertical === "HUG") {
                  textChild.layoutSizingVertical = "HUG";
                }
                // Counter axis (horizontal)
                if (
                  child.layoutAlign === "STRETCH" ||
                  child.layoutSizingHorizontal === "FILL"
                ) {
                  textChild.layoutSizingHorizontal = "FILL";
                  textChild.textAutoResize = "HEIGHT"; // Fixed width, auto height
                } else if (child.layoutSizingHorizontal === "HUG") {
                  textChild.layoutSizingHorizontal = "HUG";
                  textChild.textAutoResize = "WIDTH_AND_HEIGHT"; // Auto width and height
                }
              }
            }
            // Don't set x/y - Auto Layout controls positioning
          } else {
            // Absolute mode OR non-Auto Layout parent: use absolute positioning
            // Position is relative to parent frame

            // DEBUG: Log inner container coordinates
            const debugClass = child.className || "";
            if (debugClass.includes("_inner") || debugClass.includes("container")) {
              console.log(`[FIGMA Y-DEBUG CHILD] tag=${child.tag}, class="${debugClass}"`);
              console.log(`  child.y=${child.y}, child.height=${child.height}`);
              console.log(`  parent.height=${node.height}, parent.tag=${node.tag}`);
            }

            // Handle horizontally centered elements (margin: 0 auto)
            if (child.horizontallyCentered && child.width < node.width) {
              childNode.x = Math.round((node.width - child.width) / 2);
            } else {
              childNode.x = child.x;
            }
            childNode.y = child.y;
          }
        }
      } catch (err) {
        logger.error("Error creating child node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }
  }

  // =========================================================================
  // Create text node for frame's textContent (like li elements with text)
  // This is for frames that have textContent but type="frame" (containers)
  // IMPORTANT: Skip if node already has a synthetic text child from CDP extraction
  // This prevents duplicate text rendering (one from textContent, one from child)
  // =========================================================================
  const hasSyntheticTextChild = node.children?.some(
    (child) => child.type === "text"
  );
  if (
    node.textContent &&
    node.textContent.trim() &&
    node.type === "frame" &&
    !hasSyntheticTextChild
  ) {
    try {
      // Create a text node for the frame's text content
      const textNode = figma.createText();
      await figma.loadFontAsync({
        family: context.fontFamily,
        style: "Regular",
      });

      textNode.characters = node.textContent;
      textNode.name = node.textContent.substring(0, 20);

      // Apply text styling from the frame node
      textNode.fontSize = node.fontSize || 16;
      textNode.fontName = { family: context.fontFamily, style: "Regular" };

      // Apply text color - when colorMode is "plugin", use smart context-aware colors
      const textColorToUse =
        context.colorMode === "plugin"
          ? getSmartTextColor(node, context, node.tag?.toLowerCase() === "a")
          : node.textColor || context.pluginColors.text;
      const colorResult = cssColorToFigmaRGB(textColorToUse);
      if (colorResult) {
        // Check if we should link to a style (when "Create Figma Styles" is enabled)
        let styleLinked = false;
        if (context.variableMode === "styles") {
          const normalizedColor = normalizeColorForLookup(textColorToUse);
          const linkedStyle = context.colorStyleMap.get(normalizedColor);
          if (linkedStyle) {
            textNode.fillStyleId = linkedStyle.id;
            styleLinked = true;
          }
        }
        // Apply direct color if no style was linked
        if (!styleLinked) {
          textNode.fills = [
            {
              type: "SOLID",
              color: colorResult.color,
              opacity:
                context.colorMode === "plugin" ? 1.0 : colorResult.opacity,
            },
          ];
        }
      }

      // Apply line height
      if (node.lineHeight) {
        const lineHeightValue =
          typeof node.lineHeight === "string"
            ? parseFloat(node.lineHeight)
            : node.lineHeight;
        if (!isNaN(lineHeightValue) && lineHeightValue > 0) {
          textNode.lineHeight = { value: lineHeightValue, unit: "PIXELS" };
        }
      }

      // Apply letter spacing
      if (node.letterSpacing && node.letterSpacing !== 0) {
        textNode.letterSpacing = { value: node.letterSpacing, unit: "PIXELS" };
      }

      // Apply text align
      if (node.textAlign) {
        const alignMap: Record<string, TextNode["textAlignHorizontal"]> = {
          left: "LEFT",
          start: "LEFT",
          center: "CENTER",
          right: "RIGHT",
          end: "RIGHT",
          justify: "JUSTIFIED",
        };
        textNode.textAlignHorizontal = alignMap[node.textAlign] || "LEFT";
      }

      // Position the text - account for padding (text starts after padding.left)
      const textX = node.padding?.left || 0;
      const textY = 0;

      frame.appendChild(textNode);
      textNode.x = textX;
      textNode.y = textY;
    } catch (err) {
      logger.error("Error creating text node for frame", err, {
        nodeId: node.id,
        nodeName: node.name,
        textContent: node.textContent?.substring(0, 50),
      });
    }
  }

  // Frame created - minimal logging
  return frame;
}

// Create a single wireframe frame with nested structure
async function createWireframeFrame(
  frameData: WireframeFrame,
  sourceUrl: string,
  context: RenderContext,
  index: number,
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
    Math.min(frameData.viewportHeight, 15000),
  );

  // Position: Viewport center + offset for multiple frames
  const viewport = figma.viewport.center;
  wireframeFrame.x =
    viewport.x -
    frameData.viewportWidth / 2 +
    index * (frameData.viewportWidth + 100);
  wireframeFrame.y = viewport.y - 200;

  // Set root wireframe frame background
  // In plugin mode: ALWAYS use background color (#F1F2F0) for root frame
  // This ensures clean wireframe aesthetic - children will use surface/secondary/accent
  if (context.colorMode === "plugin") {
    // Check if we should link to a style (when "Create Figma Styles" is enabled)
    let rootStyleLinked = false;
    if (context.variableMode === "styles") {
      const normalizedColor = normalizeColorForLookup(pluginColors.background);
      const linkedStyle = context.colorStyleMap.get(normalizedColor);
      if (linkedStyle) {
        wireframeFrame.fillStyleId = linkedStyle.id;
        rootStyleLinked = true;
      }
    }
    // Apply direct color if no style was linked
    if (!rootStyleLinked) {
      wireframeFrame.fills = [
        {
          type: "SOLID",
          color: hexToFigmaRGB(pluginColors.background),
        },
      ];
    }
  } else {
    // Website mode: use original website colors
    if (
      frameData.tree &&
      frameData.tree.fills &&
      frameData.tree.fills.length > 0
    ) {
      const rootFills = convertFillsToPaints(
        frameData.tree.fills,
        context,
        frameData.tree.tag,
      );
      console.log(`[ROOT FILLS] Input: ${frameData.tree.fills.length} fills, Output: ${rootFills.length} paints`);
      rootFills.forEach((paint, i) => {
        if (paint.type === 'GRADIENT_RADIAL') {
          console.log(`[ROOT FILLS] Paint ${i}: GRADIENT_RADIAL, transform:`, JSON.stringify(paint.gradientTransform));
        } else {
          console.log(`[ROOT FILLS] Paint ${i}: ${paint.type}`);
        }
      });
      if (rootFills.length > 0) {
        wireframeFrame.fills = rootFills;
        linkFillStyleIfAvailable(wireframeFrame, context);
      } else {
        wireframeFrame.fills = [
          {
            type: "SOLID",
            color: hexToFigmaRGB(pluginColors.background),
          },
        ];
      }
    } else {
      wireframeFrame.fills = [
        {
          type: "SOLID",
          color: hexToFigmaRGB(pluginColors.background),
        },
      ];
    }
  }

  // Clip contents - based on root element's overflow
  const rootOverflow = frameData.tree?.overflow;
  wireframeFrame.clipsContent =
    rootOverflow === "hidden" ||
    rootOverflow === "scroll" ||
    rootOverflow === "auto";

  // Create nested structure from tree
  if (frameData.tree && frameData.tree.children) {
    // Get ACTUAL applied background color (plugin color if in plugin mode)
    // This enables correct child-parent color conflict detection
    // Root frame is ALWAYS background (#F1F2F0) in plugin mode
    const rootBgColor =
      getDominantColorFromPaints(wireframeFrame.fills as Paint[]) ||
      hexToFigmaRGB(pluginColors.background); // Default to background since root uses that

    // Create child context with root background tracking
    const childContext: RenderContext = {
      ...context,
      parentBackgroundColor: rootBgColor,
    };

    for (const child of frameData.tree.children) {
      try {
        const childNode = await createNodeInFigma(child, childContext, 1);

        if (childNode) {
          // DEBUG: Log header and inner container coordinates
          const debugClass = child.className || "";
          if (child.tag === "header" || debugClass.includes("header")) {
            console.log(`[FIGMA Y-DEBUG TOP-LEVEL] tag=${child.tag}, class="${debugClass}"`);
            console.log(`  child.y=${child.y}, child.height=${child.height}`);
            console.log(`  child.children count=${child.children?.length || 0}`);
            // Log first child (container) if exists
            if (child.children && child.children.length > 0) {
              const inner = child.children[0];
              console.log(`  first child: tag=${inner.tag}, class="${inner.className}", y=${inner.y}, height=${inner.height}`);
            }
          }

          // Handle horizontally centered elements (margin: 0 auto)
          // Calculate centered x position instead of using absolute x
          if (
            child.horizontallyCentered &&
            child.width < frameData.viewportWidth
          ) {
            childNode.x = Math.round(
              (frameData.viewportWidth - child.width) / 2,
            );
          } else {
            childNode.x = child.x;
          }
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
  sourceUrl: string,
): Promise<Map<string, PaintStyle>> {
  const styleMap = new Map<string, PaintStyle>();

  // Filter to only color variables
  const colorVariables = cssVariables.filter(
    (v) => v.category === "color" || isColorValue(v.value),
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

// Create Figma color styles from plugin colors (for Plugin Colors mode)
async function createPluginColorStyles(
  pluginColors: RenderWireframeData["pluginColors"],
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
      // Skip if color value is undefined (new optional colors may not be set)
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
        pluginFont,
        cssVariables,
        variableMode,
        layoutMode,
        colorMode,
        fontMode,
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

      // Determine effective modes (defaults)
      const effectiveColorMode = colorMode || "plugin";
      const effectiveFontMode = fontMode || "plugin";

      // Determine font family based on fontMode
      // If fontMode is "plugin", use pluginFont (default: Montserrat)
      // If fontMode is "website", use the font from wireframe data
      const websiteFont = frames[0]?.tree?.fontFamily || "Inter";
      const fontFamily =
        effectiveFontMode === "plugin"
          ? pluginFont || "Montserrat"
          : websiteFont;

      if (!frames || frames.length === 0) {
        errorHandler.handle({
          code: ErrorCode.NO_DATA_RECEIVED,
          message: "No wireframe data received",
        });
        return;
      }

      // DEBUG: Count text nodes in incoming frames
      const countTextNodes = (node: WireframeNode): number => {
        let count = node.type === "text" ? 1 : 0;
        if (node.children) {
          for (const child of node.children) {
            count += countTextNodes(child);
          }
        }
        return count;
      };
      const totalTextNodes = frames.reduce((sum, frame) => {
        return sum + (frame.tree ? countTextNodes(frame.tree) : 0);
      }, 0);
      console.log("[main.ts DEBUG] Received frames with", totalTextNodes, "text nodes");

      // DEBUG: Find and log specific element for comparison
      const findElementByClass = (node: WireframeNode, className: string): WireframeNode | null => {
        if (node.className?.includes(className)) {
          return node;
        }
        for (const child of node.children || []) {
          const found = findElementByClass(child, className);
          if (found) return found;
        }
        return null;
      };

      for (const frame of frames) {
        if (frame.tree) {
          const debugElement = findElementByClass(frame.tree, "_card_wflxa_31");
          if (debugElement) {
            console.log("[FIGMA RECEIVED] _card_wflxa_31 element:");
            console.log(JSON.stringify(debugElement, null, 2));
          }
        }
      }

      logger.info("Creating wireframe", {
        frameCount: frames.length,
        sourceUrl,
        variableMode: variableMode || "direct",
        layoutMode: layoutMode || "autoLayout",
        cssVariablesCount: cssVariables?.length || 0,
        colorMode: effectiveColorMode,
        fontMode: effectiveFontMode,
        fontFamily,
      });
      figma.notify("Creating wireframe...", { timeout: 2000 });

      // Send initial progress to UI (0-100 percent scale)
      figma.ui.postMessage({
        type: "render-progress",
        data: {
          step: "Initializing wireframe...",
          percent: 5,
        },
      });

      // Build context for rendering
      const colorStyleMap = new Map<string, PaintStyle>();
      const variableValueMap = new Map<string, string>();

      // Populate variable value map (for resolving var() references)
      if (cssVariables && cssVariables.length > 0) {
        for (const variable of cssVariables) {
          variableValueMap.set(variable.name, variable.value);
        }
      }

      // Create color styles based on mode
      if (variableMode === "styles") {
        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Creating color styles...",
            percent: 15,
          },
        });

        // If colorMode is "plugin", create plugin color styles with configuration names
        if (effectiveColorMode === "plugin") {
          figma.notify("Creating plugin color styles...", { timeout: 1500 });
          try {
            const pluginStyleMap = await createPluginColorStyles(colors);
            logger.info("Created plugin color styles", {
              styleCount: pluginStyleMap.size,
            });

            // Build color lookup map (plugin color role → style)
            // Map each role's color value to its style
            pluginStyleMap.forEach((style, role) => {
              const colorValue = colors[role as keyof typeof colors];
              // Skip if color value is undefined (new optional colors may not be set)
              if (colorValue) {
                const normalizedValue = normalizeColorForLookup(colorValue);
                if (normalizedValue) {
                  colorStyleMap.set(normalizedValue, style);
                }
              }
              // Also map by role name for direct lookups
              colorStyleMap.set(role, style);
            });
          } catch (err) {
            logger.warn("Failed to create plugin color styles", { error: err });
          }
        }
        // If colorMode is "website" and we have CSS variables, create website color styles
        else if (cssVariables && cssVariables.length > 0) {
          figma.notify("Creating color styles from CSS variables...", {
            timeout: 1500,
          });
          try {
            const styleMap = await createColorStylesFromVariables(
              cssVariables,
              sourceUrl,
            );
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
      }

      // Create render context
      const renderContext: RenderContext = {
        pluginColors: colors,
        fontFamily,
        variableMode: variableMode || "direct",
        layoutMode: layoutMode || "autoLayout", // Default to auto layout
        cssVariables: cssVariables || [],
        colorStyleMap,
        variableValueMap,
        colorMode: effectiveColorMode,
        fontMode: effectiveFontMode,
      };

      // Send "analyzing structure" progress
      figma.ui.postMessage({
        type: "render-progress",
        data: {
          step: "Analyzing page structure...",
          percent: 20,
        },
      });

      try {
        const createdFrames: FrameNode[] = [];

        for (let i = 0; i < frames.length; i++) {
          const viewportWidth = frames[i].viewportWidth;
          figma.notify(`Processing viewport ${i + 1}/${frames.length}...`, {
            timeout: 1000,
          });

          // Calculate progress: frames take 25-85% of total progress
          // First show "building elements" then "creating wireframe"
          const frameStartProgress = 25 + (i / frames.length) * 60;
          const frameEndProgress = 25 + ((i + 1) / frames.length) * 60;

          // Show building elements step
          figma.ui.postMessage({
            type: "render-progress",
            data: {
              step: `Building elements for ${viewportWidth}px...`,
              percent: Math.round(frameStartProgress + 5),
            },
          });

          const wireframeFrame = await createWireframeFrame(
            frames[i],
            sourceUrl,
            renderContext,
            i,
          );
          createdFrames.push(wireframeFrame);

          // Show completion of this frame
          figma.ui.postMessage({
            type: "render-progress",
            data: {
              step:
                frames.length > 1
                  ? `Viewport ${i + 1} of ${frames.length} complete...`
                  : "Applying styles and colors...",
              percent: Math.round(frameEndProgress),
            },
          });
        }

        // If multiple frames, wrap in a Section (like html.to.design)
        let selectionTarget: SceneNode[] = createdFrames;

        if (createdFrames.length > 1) {
          figma.notify("Grouping frames in Section...", { timeout: 1000 });

          // Send progress to UI
          figma.ui.postMessage({
            type: "render-progress",
            data: {
              step: "Organizing frames...",
              percent: 90,
            },
          });

          // Create Section
          const section = figma.createSection();

          // Extract hostname for naming
          let hostname = "website";
          try {
            hostname = new URL(sourceUrl).hostname.replace("www.", "");
          } catch {
            // Use default
          }

          // Get viewport widths for section name
          const viewportWidths = frames.map((f) => f.viewportWidth).join(" + ");
          const timestamp = new Date().toLocaleString();
          section.name = `${hostname} (${viewportWidths}) - Web2Wireframe - ${timestamp}`;

          // Position frames inside section with 100px gap
          const sectionPadding = 100;
          let currentX = sectionPadding;
          let maxHeight = 0;

          for (const frame of createdFrames) {
            section.appendChild(frame);
            frame.x = currentX;
            frame.y = sectionPadding;
            currentX += frame.width + sectionPadding;
            maxHeight = Math.max(maxHeight, frame.height);
          }

          // Resize section to fit all frames
          section.resizeWithoutConstraints(
            currentX,
            maxHeight + sectionPadding * 2,
          );

          // Position section at viewport center
          const viewport = figma.viewport.center;
          section.x = viewport.x - section.width / 2;
          section.y = viewport.y - section.height / 2;

          selectionTarget = [section];

          logger.info("Created Section with frames", {
            frameCount: createdFrames.length,
            sectionName: section.name,
          });
        }

        // Send finalizing progress
        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Finalizing wireframe...",
            percent: 95,
          },
        });

        // Select created node(s)
        figma.currentPage.selection = selectionTarget;

        // Zoom to fit
        figma.viewport.scrollAndZoomIntoView(selectionTarget);

        logger.info("Wireframe created successfully", {
          frameCount: createdFrames.length,
        });
        figma.notify(
          `Created ${createdFrames.length} wireframe frame(s)${createdFrames.length > 1 ? " in Section" : ""}!`,
          {
            timeout: 3000,
          },
        );

        // Send completion progress to UI
        figma.ui.postMessage({
          type: "render-progress",
          data: {
            step: "Wireframe created successfully!",
            percent: 100,
            isComplete: true,
          },
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

    // Handle save-config message - persist config to Figma clientStorage
    if (msg.type === "save-config") {
      const { config } = msg.data;
      try {
        await figma.clientStorage.setAsync("w2w_plugin_config", config);
        logger.info("Config saved to clientStorage");
      } catch (err) {
        logger.warn("Failed to save config to clientStorage", { error: err });
      }
    }

    // Handle load-config message - load config from Figma clientStorage
    if (msg.type === "load-config") {
      try {
        const config = await figma.clientStorage.getAsync("w2w_plugin_config");
        figma.ui.postMessage({
          type: "config-loaded",
          data: { config },
        });
        logger.info("Config loaded from clientStorage", {
          hasConfig: !!config,
        });
      } catch (err) {
        logger.warn("Failed to load config from clientStorage", { error: err });
        figma.ui.postMessage({
          type: "config-loaded",
          data: { config: null },
        });
      }
    }
  };
}
