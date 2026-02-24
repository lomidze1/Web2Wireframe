// ============================================================================
// FIGMA-READY TYPES (from Browser Extension)
// ============================================================================

/** RGBA color normalized to 0-1 range (Figma format) */
export interface FigmaColor {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

/** Gradient stop */
export interface FigmaGradientStop {
  color: FigmaColor;
  position: number; // 0-1
}

/** Radial gradient shape */
export type RadialGradientShape = "circle" | "ellipse";

/** Radial gradient size keyword */
export type RadialGradientSize =
  | "closest-side"
  | "farthest-side"
  | "closest-corner"
  | "farthest-corner";

/** Fill layer - supports solid, gradient, image placeholder */
export interface FigmaFill {
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
  // CSS variable reference (e.g. "--primary-color") if this fill came from a var()
  cssVariable?: string;
}

/** Stroke layer - border */
export interface FigmaStroke {
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
  // CSS variable reference (e.g. "--border-color") if this stroke came from a var()
  cssVariable?: string;
}

/** Effect layer - shadow or blur */
export interface FigmaEffect {
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

export interface WireframeNode {
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
  styledSegments?: TextSegment[];  // Inline elements with different styles
  listStyleType?: string;           // Bullet type for <li> elements
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  fontFamilyList?: string[];         // Full CSS font-family fallback chain
  textAlign: string;
  lineHeight: number | string;
  letterSpacing: number;
  browserLineCount?: number;        // Number of lines from browser (from CDP textBoxes.length)

  // Raw computed styles passthrough (filtered non-default values)
  computedStyles?: Record<string, string>;

  // CSS variable reference for text color (e.g. "--text-primary")
  textColorVariable?: string;

  // Media
  isPlaceholder: boolean;

  // Nested children
  children: WireframeNode[];
}

export interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: WireframeNode;
}

// CSS Variable extracted from the page
export interface ExtractedCSSVariable {
  name: string; // --accent
  value: string; // #FF6B35 (resolved)
  rawValue: string; // Original value
  category?: string; // color, spacing, typography, etc.
}

export interface RenderWireframeData {
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
export interface RenderContext {
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
  // Text style linking map (typography key → TextStyle)
  textStyleMap?: Map<string, TextStyle>;
  // Parent background tracking for child-parent contrast
  parentBackgroundColor?: { r: number; g: number; b: number } | null;
  // Parent container width for text sizing decisions
  parentWidth?: number;
  // Map from CSS variable name → PaintStyle (for variable-first linking)
  variableStyleMap?: Map<string, PaintStyle>;
}

/**
 * Element color role for smart mapping
 * 5-color minimalist wireframe palette
 */
export type ColorRole =
  | "text" // #11151A - ONLY for text content and placeholder icons
  | "background" // #F1F2F0 - Page/section backgrounds
  | "secondary" // #BDC1B2 - Borders, strokes
  | "surface" // #AAB5C3 - Cards, containers
  | "accent"; // #AFC6DC - Buttons, links, CTAs

// Text segment for tracking styled ranges (inline elements with different styles)
export interface TextSegment {
  text: string;
  color: string | null;
  fontWeight: number;
  fontSize: number;
  fontFamily?: string;
  fontFamilyList?: string[];  // Full CSS font-family fallback chain for this segment
  isLink?: boolean;  // Is this an <a> element?
  tag?: string;      // Original tag (span, a, strong, etc.)
  textDecoration?: "underline" | "line-through" | "none";  // CSS text-decoration
}

// Color stop for gradient parsing
export interface ColorStop {
  position: number;
  color: FigmaColor;
}
