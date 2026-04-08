/**
 * CDP Captured Data Types
 * These types represent the data structure captured from websites using Chrome DevTools Protocol
 */

// CDP DOM Node representation
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

// CSS Rule from CDP
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

// CSS Style declaration
export interface CDPCSSStyle {
  cssProperties: CDPCSSProperty[];
  shorthandEntries?: Array<{ name: string; value: string; important?: boolean }>;
  cssText?: string;
  range?: object;
}

// CSS Property
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

// Matched CSS rules for a node
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

// Computed style for a node
export interface CDPComputedStyle {
  name: string;
  value: string;
}

// Font face definition
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

// Extracted element data (our processed format)
export interface ExtractedElement {
  id: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  className?: string;  // CSS class name(s) from the element
  name: string;
  // Position & Size
  x: number;
  y: number;
  width: number;
  height: number;
  // CSS Positioning (for sticky headers, fixed elements, etc.)
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  zIndex?: number;
  // Layout
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  itemSpacing: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  // Layout Alignment (for Auto Layout)
  justifyContent?: string;  // CSS justify-content value
  alignItems?: string;      // CSS align-items value
  flexWrap?: string;        // CSS flex-wrap value
  // Child-level flex properties
  layoutGrow?: 0 | 1;       // flex-grow: 0 = fixed, 1 = fill (Figma only supports 0 or 1)
  layoutAlign?: "STRETCH" | "INHERIT";  // align-self: stretch
  // Sizing mode (how element sizes itself)
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";  // width behavior
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";    // height behavior

  // =========================================================================
  // NEW: Figma-ready arrays (multiple layers support)
  // =========================================================================
  fills: FigmaFill[];      // Multiple backgrounds: gradients, colors, image placeholders
  strokes: FigmaStroke[];  // Borders (with per-side support)
  effects: FigmaEffect[];  // Multiple shadows, backdrop-blur

  // =========================================================================
  // LEGACY: Keep for backward compatibility (will be removed later)
  // =========================================================================
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
  fontFamilyList?: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number;
  textAlign: string;
  textContent: string;
  // States
  opacity: number;
  isPlaceholder: boolean;
  // Overflow (for clipsContent in Figma)
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  // Centering (margin: 0 auto detected from original CSS)
  horizontallyCentered?: boolean;
  // Matched CSS (for advanced processing)
  matchedRules?: CDPCSSRule[];
  // Hover/Interactive styles (for buttons, links)
  hoverStyles?: Record<string, string>;
  // Raw computed styles passthrough (filtered non-default values)
  computedStyles?: Record<string, string>;
  // Children
  children: ExtractedElement[];
}

// Single viewport frame capture
export interface CapturedFrame {
  viewport: {
    width: number;
    height: number;
  };
  tree: ExtractedElement;
  assets?: Record<string, string>; // URL → base64 map for real asset extraction
}

// Detected colors from the page (for smart color palette)
export interface DetectedColors {
  background: string;    // Most common page background (white, dark, etc.)
  text: string;          // Most common text color
  accent: string;        // Buttons, links, CTAs
  surface: string;       // Cards, containers background
  border: string;        // Most common border color
  main: string;          // Brand/hero background color
  // Source info for transparency
  source: {
    totalElements: number;
    backgroundSamples: number;
    textSamples: number;
    accentSamples: number;
  };
}

// Full page capture result (multi-viewport support)
export interface CaptureResult {
  url: string;
  title: string;
  timestamp: number;
  frames: CapturedFrame[];  // Multiple viewport captures
  fonts: ExtractedFont[];
  assets: ExtractedAsset[];
  stylesheets: ExtractedStylesheet[];
  cssVariables: ExtractedCSSVariable[];  // All CSS variables from the page
  detectedColors?: DetectedColors;       // Auto-detected color palette from page
}

// Extracted font info
export interface ExtractedFont {
  family: string;
  style: string;
  weight: string;
  src: string;
  format: string;
  isGoogleFont: boolean;
  /** Base64-encoded font binary (extracted from browser cache via Page.getResourceContent) */
  fontBase64?: string;
  /** MIME type of the font binary (e.g., "font/woff2", "font/woff", "font/ttf") */
  fontMimeType?: string;
  // h2d-compatible extended fields
  fontDisplay?: string;
  fontStretch?: string;
  fontVariant?: string;
  unicodeRange?: string;
  fontVariationAxes?: Array<{
    tag: string;
    name: string;
    minValue: number;
    maxValue: number;
    defaultValue: number;
  }>;
}

// Extracted asset (image, SVG, etc.)
export interface ExtractedAsset {
  type: "image" | "svg" | "video" | "icon";
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  base64?: string;
}

// Extracted stylesheet
export interface ExtractedStylesheet {
  url: string;
  content?: string;
  isExternal: boolean;
}

// CSS Variable extracted from the page
export interface ExtractedCSSVariable {
  name: string;        // --accent
  value: string;       // #FF6B35 (resolved)
  rawValue: string;    // Original value (might reference other vars)
  category?: string;   // color, spacing, typography, etc.
}

// ============================================================================
// FIGMA-READY TYPES - for 1:1 visual fidelity
// ============================================================================

/** RGBA color normalized to 0-1 range (Figma format) */
export interface FigmaColor {
  r: number;  // 0-1
  g: number;  // 0-1
  b: number;  // 0-1
  a: number;  // 0-1
}

/** Gradient stop */
export interface FigmaGradientStop {
  color: FigmaColor;
  position: number;  // 0-1
}

/** Radial gradient shape */
export type RadialGradientShape = 'circle' | 'ellipse';

/** Radial gradient size keyword */
export type RadialGradientSize = 'closest-side' | 'farthest-side' | 'closest-corner' | 'farthest-corner';

/** Fill layer - supports solid, gradient, image placeholder */
export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_CONIC' | 'IMAGE_PLACEHOLDER';
  visible: boolean;
  opacity: number;
  blendMode?: string;

  // SOLID
  color?: FigmaColor;

  // GRADIENT_*
  angle?: number;  // degrees (0-360)
  stops?: FigmaGradientStop[];

  // RADIAL/CONIC specific
  center?: { x: number; y: number };  // 0-1 normalized position
  shape?: RadialGradientShape;        // circle or ellipse (default: ellipse)
  size?: RadialGradientSize;          // CSS size keyword (default: farthest-corner)

  // Element dimensions (needed for proper radial gradient transform calculation)
  elementWidth?: number;
  elementHeight?: number;

  // IMAGE → placeholder
  isImagePlaceholder?: boolean;
}

/** Stroke layer - border */
export interface FigmaStroke {
  color: FigmaColor;
  weight: number;
  position: 'INSIDE' | 'CENTER' | 'OUTSIDE';
  style: 'SOLID' | 'DASHED' | 'DOTTED';
  // Per-side (Figma limitation: can't have different colors per side)
  sides?: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
}

/** Effect layer - shadow or blur */
export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible: boolean;

  // Shadow properties
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;   // blur radius
  spread?: number;   // shadow spread

  // Blur properties
  blurRadius?: number;
}

// Selection bounds (absolute page coordinates)
export interface SelectionBounds {
  x: number;      // absolute page X (includes scroll)
  y: number;      // absolute page Y (includes scroll)
  width: number;
  height: number;
}

// Capture options (user selections before capture)
// NOTE: Colors, Fonts, Text transformation options moved to Plugin (import-time)
export interface CaptureOptions {
  viewports: number[];  // Multi-viewport support
}

// Default capture options
export const DEFAULT_CAPTURE_OPTIONS: CaptureOptions = {
  viewports: [1440],  // Default to 1440px
};

// Extension settings
export interface ExtensionSettings {
  backendUrl: string;
  autoCapture: boolean;
  captureAssets: boolean;
  captureFonts: boolean;
  compressData: boolean;
  defaultViewport: number;
}

// Message types for extension communication
export type ExtensionMessage =
  | { type: "CAPTURE_PAGE"; tabId: number; options: CaptureOptions }
  | { type: "CAPTURE_COMPLETE"; data: CaptureResult }
  | { type: "CAPTURE_ERROR"; error: string }
  | { type: "CAPTURE_PROGRESS"; progress: number; status: string }
  | { type: "SEND_TO_BACKEND"; data: CaptureResult }
  | { type: "DOWNLOAD_FILE"; data: CaptureResult; filename: string }
  | { type: "GET_SETTINGS" }
  | { type: "UPDATE_SETTINGS"; settings: Partial<ExtensionSettings> }
  | { type: "GET_CAPTURE_STATUS" }
  // CDP Inspect Mode selection (background script)
  | { type: "START_SELECTION"; tabId: number; options: CaptureOptions }
  | { type: "CANCEL_SELECTION" }
  // Content script UI messages
  | { type: "SHOW_SELECTION_UI" }
  | { type: "HIDE_SELECTION_UI" }
  // h2d-style content script DOM extraction
  | { type: "EXTRACT_DOM" }
  // h2d-style page capture (content script + CDP fonts/assets)
  | { type: "CAPTURE_PAGE_H2D"; tabId: number; options: CaptureOptions }
  // Legacy (kept for compatibility)
  | { type: "ELEMENT_PICKED"; selector: string; bounds: SelectionBounds; tabId: number; options: CaptureOptions };

// Backend API response
export interface BackendResponse {
  success: boolean;
  wireframeData?: object;
  error?: string;
}
