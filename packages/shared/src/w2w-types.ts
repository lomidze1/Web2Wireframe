/**
 * W2W types for content script DOM extraction.
 *
 * Content script captures raw CSS values (not pre-converted to Figma).
 * - 3 node types: FRAME, TEXT, SVG
 * - Minimal TEXT nodes (value + font only, typography on parent FRAME)
 * - SVG nodes with full outerHTML markup
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** 8-number quad: 4 corners clockwise from top-left [x1,y1, x2,y2, x3,y3, x4,y4] */
export type Quad = [number, number, number, number, number, number, number, number];

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

export interface W2WBaseNode {
  x: number;
  y: number;
  width: number;
  height: number;
  quad: Quad;
}

/**
 * FRAME — any HTML element (div, section, img, button, a, etc.)
 * Styles are raw CSS string values from getComputedStyle().
 */
export interface W2WFrameNode extends W2WBaseNode {
  type: 'FRAME';
  tag: string;
  classList: string[];
  attr: W2WAttributes;
  styles: W2WStyles;
  children: W2WNode[];

  /** True if this is document.scrollingElement */
  isScrollingElt?: boolean;

  /** Image URL for img/video tags — from currentSrc or src */
  $url?: string;

  /** Hover state subtree (re-captured with forced :hover) */
  hover?: W2WFrameNode;
}

/**
 * TEXT — leaf text node (DOM nodeType === 3).
 * Minimal: value + font only. Typography styles live on parent FRAME.
 */
export interface W2WTextNode extends W2WBaseNode {
  type: 'TEXT';
  /** Text content */
  value: string;
  /** Combined font string: "Family Weight" (e.g. "Space Grotesk Light") */
  font: string;
  /** Platform font info from CSS.getPlatformFontsForNode */
  platformFont?: W2WPlatformFont;
}

/**
 * SVG — inline SVG element with full markup.
 */
export interface W2WSVGNode extends W2WBaseNode {
  type: 'SVG';
  /** Full SVG outerHTML markup */
  svg: string;
}

export type W2WNode = W2WFrameNode | W2WTextNode | W2WSVGNode;

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

export interface W2WAttributes {
  id?: string;
  href?: string;
  alt?: string;
  ariaLabel?: string;
  baseURI?: string;
  srcset?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  [key: string]: string | number | boolean | undefined;
}

// ---------------------------------------------------------------------------
// Raw CSS styles (70+ properties from getComputedStyle)
// ---------------------------------------------------------------------------

/**
 * Raw CSS property values as strings, exactly as returned by getComputedStyle().
 * Only non-default values are included (default values omitted to save space).
 *
 * Property names are camelCase (matching CSSStyleDeclaration).
 */
export interface W2WStyles {
  // Layout
  display?: string;
  flexDirection?: string;
  flexWrap?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  alignItems?: string;
  alignSelf?: string;
  justifyContent?: string;
  gap?: string;
  order?: number;

  // Grid
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridAutoFlow?: string;
  gridArea?: string;

  // Size
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  aspectRatio?: string;
  boxSizing?: string;

  // Position
  position?: string;
  left?: string;
  top?: string;
  right?: string;
  bottom?: string;
  zIndex?: string | number;

  // Spacing
  padding?: string;
  margin?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;

  // Background
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundClip?: string;
  backgroundOrigin?: string;
  backgroundBlendMode?: string;

  // Border
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  borderTopStyle?: string;
  borderRightStyle?: string;
  borderBottomStyle?: string;
  borderLeftStyle?: string;
  borderTopLeftRadius?: string;
  borderTopRightRadius?: string;
  borderBottomRightRadius?: string;
  borderBottomLeftRadius?: string;

  // Typography
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  textDecoration?: string;
  textDecorationLine?: string;
  textOverflow?: string;
  whiteSpace?: string;
  color?: string;
  webkitTextFillColor?: string;
  webkitTextStrokeColor?: string;
  webkitTextStrokeWidth?: string;
  listStyleType?: string;

  // Visual
  opacity?: number;
  boxShadow?: string;
  filter?: string;
  backdropFilter?: string;
  clipPath?: string;
  transform?: string;
  transformOrigin?: string;
  overflow?: string;
  overflowX?: string;
  overflowY?: string;
  objectFit?: string;
  objectPosition?: string;
  mixBlendMode?: string;
  visibility?: string;

  // Outline
  outlineColor?: string;
  outlineStyle?: string;
  outlineWidth?: string;
  outlineOffset?: string;

  // Content (pseudo-elements)
  content?: string;

  // SVG
  fill?: string;

  // Direction
  direction?: string;
  writingMode?: string;

  // Catch-all for properties not listed above
  [key: string]: string | number | undefined;
}

// ---------------------------------------------------------------------------
// Platform font
// ---------------------------------------------------------------------------

export interface W2WPlatformFont {
  familyName: string;
  postScriptName?: string;
  isCustomFont?: boolean;
  glyphCount?: number;
}

// ---------------------------------------------------------------------------
// Font entry (extracted @font-face)
// ---------------------------------------------------------------------------

export interface W2WFontEntry {
  fontDisplay?: string;
  fontFamily: string;
  fontStretch?: string;
  fontStyle?: string;
  fontVariant?: string;
  fontVariationAxes?: W2WFontVariationAxis[];
  fontWeight?: string;
  platformFontFamily?: string;
  src?: string;
  unicodeRange?: string;
  source?: { tabId?: number };
}

export interface W2WFontVariationAxis {
  defaultValue: number;
  maxValue: number;
  minValue: number;
  name: string;
  tag: string;
}

// ---------------------------------------------------------------------------
// Asset entry
// ---------------------------------------------------------------------------

export interface W2WAssetEntry {
  base64Encoded: boolean;
  content: string;
  mimeType?: string;
}

// ---------------------------------------------------------------------------
// Document metadata
// ---------------------------------------------------------------------------

export interface W2WDocMeta {
  title: string;
  innerHeight: number;
  innerWidth: number;
  fontSize: number;
  baseURI: string;
  bgColor: string;
}

// ---------------------------------------------------------------------------
// Top-level capture result
// ---------------------------------------------------------------------------

export interface W2WCaptureResult {
  /** Page URL */
  name: string;
  /** Document metadata */
  doc: W2WDocMeta;
  /** Root FRAME node (html element) */
  frame: W2WFrameNode;
  /** Assets dictionary: URL → { base64Encoded, content, mimeType } */
  assets: Record<string, W2WAssetEntry>;
  /** Extracted @font-face entries */
  fonts: W2WFontEntry[];
  /** Page URL (duplicate of name for compatibility) */
  url: string;
  /** Theme: "default" | "dark" | "light" */
  theme: string;
  /** Viewport width */
  width: number;

  // W2W enhancements
  /** Extracted CSS variables */
  cssVariables?: W2WCSSVariable[];
}

export interface W2WCSSVariable {
  name: string;
  value: string;
  rawValue?: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// CSS properties list (for content script extraction)
// ---------------------------------------------------------------------------

/**
 * 70 CSS properties to extract via getComputedStyle().
 * CSS properties captured by content script extraction.
 * Only non-default values are stored.
 */
export const W2W_CSS_PROPERTIES = [
  // Layout
  'display', 'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink',
  'flexBasis', 'alignItems', 'alignSelf', 'justifyContent', 'gap', 'order',

  // Grid
  'gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow', 'gridArea',

  // Size
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'aspectRatio', 'boxSizing',

  // Position
  'position', 'left', 'top', 'right', 'bottom', 'zIndex',

  // Spacing
  'padding', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',

  // Background
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
  'backgroundRepeat', 'backgroundClip', 'backgroundOrigin', 'backgroundBlendMode',

  // Border
  'borderWidth', 'borderStyle', 'borderColor',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',

  // Typography
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'textAlign', 'textDecoration', 'textDecorationLine', 'textOverflow',
  'whiteSpace', 'color', 'webkitTextFillColor', 'webkitTextStrokeColor',
  'webkitTextStrokeWidth', 'listStyleType',

  // Visual
  'opacity', 'boxShadow', 'filter', 'backdropFilter', 'clipPath',
  'transform', 'transformOrigin', 'overflow', 'overflowX', 'overflowY',
  'objectFit', 'objectPosition', 'mixBlendMode', 'visibility',

  // Outline
  'outlineColor', 'outlineStyle', 'outlineWidth', 'outlineOffset',

  // Content
  'content',

  // SVG
  'fill',

  // Direction
  'direction', 'writingMode',
] as const;

/** Numeric CSS properties that should be stored as numbers, not strings */
export const W2W_NUMERIC_PROPERTIES = new Set([
  'opacity', 'flexGrow', 'flexShrink', 'order', 'zIndex',
]);

/** Tags to skip entirely during DOM traversal */
export const W2W_SKIP_TAGS = new Set([
  'script', 'style', 'meta', 'noscript', 'link', 'head', 'title',
  'br', 'base', 'template', 'dialog', 'colgroup', 'col', 'datalist',
]);
