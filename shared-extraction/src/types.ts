/**
 * Shared CDP Extraction Types
 *
 * This is the SINGLE SOURCE OF TRUTH for extraction-related types.
 * Used by both Browser Extension and Plugin_Backend.
 */

// ============================================================================
// CDP CLIENT INTERFACE (ABSTRACTION)
// ============================================================================

/**
 * Abstract CDP Client interface
 *
 * Both Browser Extension (chrome.debugger) and Plugin_Backend (Puppeteer)
 * implement this interface to enable shared extraction logic.
 */
export interface CDPClientInterface {
  /**
   * Send a CDP command
   * @param method - CDP method name (e.g., "DOM.getDocument")
   * @param params - Optional parameters for the command
   * @returns Promise with the result
   */
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T>;

  /**
   * Enable CDP domains
   * @param domains - Domain names to enable (e.g., "DOM", "CSS")
   */
  enableDomains(...domains: string[]): Promise<void>;

  /**
   * Listen for CDP events (optional)
   */
  on?(event: string, callback: (params?: unknown) => void): () => void;

  /**
   * Remove all event listeners (optional)
   */
  removeAllListeners?(): void;
}

// ============================================================================
// CDP DOM Types
// ============================================================================

export interface CDPNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue?: string;
  childNodeCount?: number;
  children?: CDPNode[];
  attributes?: string[];
  documentURL?: string;
  baseURL?: string;
  publicId?: string;
  systemId?: string;
  internalSubset?: string;
  xmlVersion?: string;
  name?: string;
  value?: string;
  pseudoType?: string;
  shadowRootType?: string;
  frameId?: string;
  contentDocument?: CDPNode;
  shadowRoots?: CDPNode[];
  templateContent?: CDPNode;
  pseudoElements?: CDPNode[];
  importedDocument?: CDPNode;
  distributedNodes?: CDPNode[];
  isSVG?: boolean;
}

// ============================================================================
// CDP CSS Types
// ============================================================================

export interface CDPCSSRule {
  styleSheetId?: string;
  selectorList: {
    selectors: Array<{ text: string; range?: object }>;
    text: string;
  };
  origin: "injected" | "user-agent" | "inspector" | "regular";
  style: CDPCSSStyle;
  media?: Array<{ text: string; source: string }>;
}

export interface CDPCSSStyle {
  cssProperties: CDPCSSProperty[];
  shorthandEntries?: Array<{
    name: string;
    value: string;
    important?: boolean;
  }>;
  cssText?: string;
  range?: object;
}

export interface CDPCSSProperty {
  name: string;
  value: string;
  important?: boolean;
  implicit?: boolean;
  text?: string;
  parsedOk?: boolean;
  disabled?: boolean;
  range?: object;
}

export interface CDPMatchedStyles {
  inlineStyle?: CDPCSSStyle;
  attributesStyle?: CDPCSSStyle;
  matchedCSSRules: Array<{
    rule: CDPCSSRule;
    matchingSelectors: number[];
  }>;
  pseudoElements?: Array<{
    pseudoType: string;
    matches: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }>;
  }>;
  inherited?: Array<{
    inlineStyle?: CDPCSSStyle;
    matchedCSSRules: Array<{ rule: CDPCSSRule; matchingSelectors: number[] }>;
  }>;
  cssKeyframesRules?: Array<{
    animationName: { text: string };
    keyframes: Array<{ keyText: { text: string }; style: CDPCSSStyle }>;
  }>;
}

export interface CDPComputedStyle {
  name: string;
  value: string;
}

export interface CDPFontFace {
  fontFamily: string;
  fontStyle: string;
  fontVariant: string;
  fontWeight: string;
  fontStretch: string;
  unicodeRange: string;
  src: string;
  platformFontFamily: string;
}

// ============================================================================
// FIGMA-READY TYPES
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
  cssVariableName?: string; // e.g. "--glass-bg"
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

  // SOLID
  color?: FigmaColor;

  // GRADIENT_*
  angle?: number; // degrees (0-360)
  stops?: FigmaGradientStop[];

  // RADIAL/CONIC specific
  center?: { x: number; y: number }; // 0-1 normalized position
  shape?: RadialGradientShape;
  size?: RadialGradientSize;

  // Element dimensions (needed for proper radial gradient transform calculation)
  elementWidth?: number;
  elementHeight?: number;

  // IMAGE → placeholder
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
  // Per-side (Figma limitation: can't have different colors per side)
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

  // Shadow properties
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number; // blur radius
  spread?: number; // shadow spread

  // Blur properties
  blurRadius?: number;
}

// ============================================================================
// STYLED TEXT SEGMENT
// ============================================================================

/**
 * A styled text segment for inline elements with different styles.
 * Used for cases like <h2>Text <a>link</a> more text</h2>
 * where "link" has a different color.
 */
export interface StyledTextSegment {
  text: string;
  color: string | null;     // CSS color value
  fontWeight: number;
  fontSize: number;
  fontFamily?: string;
  fontFamilyList?: string[];  // Full CSS font-family fallback chain
  isLink?: boolean;         // Is this an <a> element?
  tag?: string;             // Original tag (span, a, strong, etc.)
  textDecoration?: "underline" | "line-through" | "none";  // CSS text-decoration
}

// ============================================================================
// EXTRACTED ELEMENT (Main output format)
// ============================================================================

export interface ExtractedElement {
  id: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  className?: string;
  name: string;

  // Position & Size
  x: number;
  y: number;
  width: number;
  height: number;

  // CSS Positioning
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  zIndex?: number;

  // Layout
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  // Layout Alignment
  justifyContent?: string;
  alignItems?: string;
  flexWrap?: string;
  layoutGrow?: 0 | 1;
  layoutAlign?: "STRETCH" | "INHERIT";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";

  // Figma-ready arrays (multiple layers support)
  fills: FigmaFill[];
  strokes: FigmaStroke[];
  effects: FigmaEffect[];

  // Legacy (backward compatibility)
  backgroundColor: string | null;
  backgroundGradient: string | null;
  textColor: string | null;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  boxShadow: string | null;

  // Typography
  fontFamily: string;
  fontFamilyList?: string[];  // Full CSS font-family fallback chain
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number;
  textAlign: string;
  textContent: string;

  // Browser line count (from CDP textBoxes.length - real rendered line count)
  browserLineCount?: number;

  // Styled text segments (for inline elements with different styles)
  styledSegments?: StyledTextSegment[];

  // List styling (for <li> elements)
  listStyleType?: string;  // bullet, disc, decimal, etc.

  // States
  opacity: number;
  isPlaceholder: boolean;
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  horizontallyCentered?: boolean;

  // Margins (CSS margin values for spacing in auto layout)
  margin?: { top: number; right: number; bottom: number; left: number };

  // Matched CSS (for advanced processing)
  matchedRules?: CDPCSSRule[];
  hoverStyles?: Record<string, string>;

  // Raw computed styles passthrough (filtered non-default values)
  // Provides fallback access to any CSS property on the rendering side
  computedStyles?: Record<string, string>;

  // CSS variable reference for text color (e.g. "--text-primary")
  textColorVariable?: string;

  // Children
  children: ExtractedElement[];
}

// ============================================================================
// CAPTURE RESULT TYPES
// ============================================================================

export interface CapturedFrame {
  viewport: {
    width: number;
    height: number;
  };
  tree: ExtractedElement;
}

export interface DetectedColors {
  background: string;
  text: string;
  accent: string;
  surface: string;
  border: string;
  main: string;
  source: {
    totalElements: number;
    backgroundSamples: number;
    textSamples: number;
    accentSamples: number;
  };
}

export interface CaptureResult {
  url: string;
  title: string;
  timestamp: number;
  frames: CapturedFrame[];
  fonts: ExtractedFont[];
  assets: ExtractedAsset[];
  stylesheets: ExtractedStylesheet[];
  cssVariables: ExtractedCSSVariable[];
  detectedColors?: DetectedColors;
}

export interface ExtractedFont {
  family: string;
  style: string;
  weight: string;
  src: string;
  format: string;
  isGoogleFont: boolean;
}

/**
 * Platform font info from CSS.getPlatformFontsForNode
 * Represents the actual font the browser rendered (not just declared CSS)
 */
export interface PlatformFontInfo {
  familyName: string; // e.g., "PP Fragment Glare Medium"
  postScriptName: string; // e.g., "PPFragmentGlare-Medium"
  isCustomFont: boolean; // true = web font, false = system font
  glyphCount: number; // number of glyphs rendered with this font
}

export interface ExtractedAsset {
  type: "image" | "svg" | "video" | "icon";
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  base64?: string;
}

export interface ExtractedStylesheet {
  url: string;
  content?: string;
  isExternal: boolean;
}

export interface ExtractedCSSVariable {
  name: string;
  value: string;
  rawValue: string;
  category?: string;
}

// ============================================================================
// CAPTURE OPTIONS
// ============================================================================

export interface CaptureOptions {
  viewports: number[];
}

export const DEFAULT_CAPTURE_OPTIONS: CaptureOptions = {
  viewports: [1440],
};
