/**
 * @w2w/shared — Unified types for Web2Wireframe
 *
 * Contains both Figma-ready visual types (formerly @w2w/shared-types)
 * and CDP-specific extraction types (formerly shared-extraction/types).
 */

import type { ViewportMetadata } from "./viewport-orchestration";

// ============================================================================
// Figma-ready visual types (formerly @w2w/shared-types)
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
  color?: FigmaColor;
  angle?: number;
  stops?: FigmaGradientStop[];
  center?: { x: number; y: number };
  shape?: RadialGradientShape;
  size?: RadialGradientSize;
  elementWidth?: number;
  elementHeight?: number;
  isImagePlaceholder?: boolean;
  imageUrl?: string;
  additionalImageUrls?: string[];
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

/** Text segment for tracking styled ranges */
export interface TextSegment {
  text: string;
  color: string | null;
  fontWeight: number;
  fontSize: number;
  fontFamily?: string;
  fontFamilyList?: string[];
  isLink?: boolean;
  tag?: string;
  textDecoration?: "underline" | "line-through" | "none";
  textDecorationColor?: string;
  textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
  textDecorationThickness?: number;
}

/** Color stop for gradient parsing */
export interface ColorStop {
  position: number;
  color: FigmaColor;
}

/** CSS Variable extracted from the page */
export interface ExtractedCSSVariable {
  name: string;
  value: string;
  rawValue: string;
  category?: string;
}

/** Single wireframe node in the tree */
export interface WireframeNode {
  id: string;
  name: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  className?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing: number;
  padding: { top: number; right: number; bottom: number; left: number };
  justifyContent?: string;
  alignItems?: string;
  flexWrap?: string;
  layoutGrow?: 0 | 1;
  layoutAlign?: "STRETCH" | "INHERIT";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  effects?: FigmaEffect[];
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
  blendMode?: string;
  rotation?: number;
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  horizontallyCentered?: boolean;
  verticallyCenteredViaMargin?: boolean;
  alignSelf?: string;
  justifySelf?: string;
  margin?: { top: number; right: number; bottom: number; left: number };
  textContent: string;
  styledSegments?: TextSegment[];
  listStyleType?: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  fontFamilyList?: string[];
  platformFontFamily?: string;
  textAlign: string;
  lineHeight: number | string;
  letterSpacing: number;
  browserLineCount?: number;
  // Max rendered text bounding-box width across the node's text children.
  // When a `<p>` element has width: 100% but text spans only half the box,
  // this stores the real text width so wireframe-lines (FILLR) render to the
  // text's visual span instead of stretching to the full element width.
  renderedTextWidth?: number;
  textTruncation?: "ENDING";
  computedStyles?: Record<string, string>;
  textColorVariable?: string;
  pseudoStateStyles?: {
    hover?: Record<string, string>;
    focus?: Record<string, string>;
    active?: Record<string, string>;
    focusVisible?: Record<string, string>;
  };
  isPlaceholder: boolean;
  imageUrl?: string;
  additionalImageUrls?: string[];
  backendNodeId?: number;
  sourceSelector?: string;
  children: WireframeNode[];
}

/** Single wireframe frame (one viewport) */
export interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: WireframeNode;
  assets?: Record<string, string>;
  viewportMetadata?: {
    contentWidth: number;
    contentHeight: number;
    layoutViewport: { clientWidth: number; clientHeight: number };
    visualViewport: {
      width: number;
      height: number;
      offsetX: number;
      offsetY: number;
      scale: number;
    };
  };
}

/** 5-color minimalist wireframe palette */
export interface PluginColorPalette {
  text: string;
  background: string;
  secondary: string;
  surface: string;
  accent: string;
}

/** Full wireframe render data (transport from backend → plugin) */
export interface RenderWireframeData {
  frames: WireframeFrame[];
  sourceUrl: string;
  localStyles?: object;
  pluginColors: PluginColorPalette;
  pluginFont?: string;
  cssVariables?: ExtractedCSSVariable[];
  variableMode?: "styles" | "direct";
  layoutMode?: "autoLayout" | "absolute";
  colorMode?: "plugin" | "website";
  fontMode?: "plugin" | "website" | "lines";
  textMode?: "semantic" | "lorem" | "website";
  assetMode?: "placeholders" | "realAssets";
  interactionMode?: "none" | "variants";
}

/** Map from missing/website font name → replacement font name */
export type FontMapping = Record<string, string>;

/** Element color role for smart mapping */
export type ColorRole =
  | "text"
  | "background"
  | "secondary"
  | "surface"
  | "accent";

// ============================================================================
// License types
// ============================================================================

/** License plan tier (single-tier launch — see docs/decisions/LAUNCH-STRATEGY-2026.md) */
export type LicensePlan = "free" | "pro";

/** License status. No "trial" — Free is the trial. */
export type LicenseStatus = "active" | "canceled" | "expired";

/** Subscription metadata (Pro plans only; null for Free). */
export interface LicenseSubscription {
  flittOrderId: string;
  activatedAt: string;
  nextBillingAt: string;
  canceledAt: string | null;
}

/** License response (server → client). Dates are ISO strings. */
export interface License {
  figmaUserId: string;
  email: string | null;
  plan: LicensePlan;
  status: LicenseStatus;
  cycleStartedAt: string;
  cycleEndsAt: string;
  usage: {
    imports: number;
    periodStartedAt: string;
  };
  limits: {
    imports: number; // Pro = Infinity (serialized as null over JSON)
  };
  subscription: LicenseSubscription | null;
  createdAt: string;
  updatedAt: string;
}

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
  textDecoration?: "underline" | "line-through" | "none";  // CSS text-decoration-line
  textDecorationColor?: string;  // CSS text-decoration-color
  textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";  // CSS text-decoration-style
  textDecorationThickness?: number;  // CSS text-decoration-thickness in px
}

// ============================================================================
// PSEUDO-STATE STYLES
// ============================================================================

export interface PseudoStateStyles {
  hover?: Record<string, string>;
  focus?: Record<string, string>;
  active?: Record<string, string>;
  focusVisible?: Record<string, string>;
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
  cssOrder?: number; // CSS order property for flex child reordering

  // Layout
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
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

  // CSS Grid (container properties)
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridColumnGap?: number;
  gridRowGap?: number;
  gridAutoFlow?: string;
  // CSS Grid (child placement — 1-based CSS line numbers)
  gridColumnStart?: number;
  gridColumnEnd?: number;
  gridRowStart?: number;
  gridRowEnd?: number;

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
  platformFontFamily?: string; // Actual rendered font from CSS.getPlatformFontsForNode (may differ from fontFamily)
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number;
  textAlign: string;
  textContent: string;

  // Browser line count (from CDP textBoxes.length - real rendered line count)
  browserLineCount?: number;

  // Text truncation (from CSS text-overflow: ellipsis → Figma ENDING)
  textTruncation?: "ENDING";

  // Styled text segments (for inline elements with different styles)
  styledSegments?: StyledTextSegment[];

  // List styling (for <li> elements)
  listStyleType?: string;  // bullet, disc, decimal, etc.
  listItemValue?: string;  // <li value="N"> HTML attribute

  // States
  opacity: number;
  blendMode?: string;  // CSS mix-blend-mode → Figma blendMode
  rotation?: number;   // Rotation angle in degrees (from CSS transform)
  isPlaceholder: boolean;
  imageUrl?: string; // Original image URL for real asset extraction
  additionalImageUrls?: string[]; // Additional background image URLs (2nd+ url() layers)
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  horizontallyCentered?: boolean;

  // Margins (CSS margin values for spacing in auto layout)
  margin?: { top: number; right: number; bottom: number; left: number };

  // Matched CSS (for advanced processing)
  matchedRules?: CDPCSSRule[];
  pseudoStateStyles?: PseudoStateStyles;

  // Raw computed styles passthrough (filtered non-default values)
  // Provides fallback access to any CSS property on the rendering side
  computedStyles?: Record<string, string>;

  // Computed styles of the ::marker pseudo-element (for <li> items).
  // Populated by the tree-builder when a ::marker pseudo-node is in the
  // CDP snapshot (often with zero bounds for list-style-position: outside),
  // or by the browser-extension content script via getComputedStyle(li,
  // '::marker'). Consumed by attachMarkerToLi() to source font-size,
  // font-family, font-weight, color, line-height, letter-spacing for the
  // synthesized marker text node — the CSS ::marker rule is allowed to
  // differ from the <li>'s own typography (e.g. Apple.com footer footnotes).
  markerComputedStyles?: Record<string, string>;

  // CSS variable reference for text color (e.g. "--text-primary")
  textColorVariable?: string;

  // Source identity (Layer #7 — element mapping)
  backendNodeId?: number;       // CDP backendNodeId — stable within CDP session
  sourceSelector?: string;      // Structural CSS selector — stable across re-extractions

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
  assets?: Record<string, string>; // URL → base64 map for real asset extraction
  viewportMetadata?: ViewportMetadata;
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

/**
 * Aggregate counters for assets that didn't make it into the capture.
 * Surfaced to the popup so the user understands a partial capture (e.g.
 * "2 image/tiff skipped") instead of silently shipping a wireframe with
 * missing visuals.
 */
export interface CaptureStats {
  /** Total dropped image URLs across all frames. */
  skippedImageCount: number;
  /** Per-MIME breakdown of decoder refusals (e.g. {"image/heic": 2}). */
  unsupportedFormats: Record<string, number>;
  /** Images dropped because they exceeded the 2MB per-image cap. */
  oversizedImageCount: number;
  /** True if the 30MB total payload cap stopped us before the URL list ran out. */
  payloadTruncated: boolean;
  /** Source URLs that never appeared in the browser's resource map
   *  (cache miss — typically the image failed to load on the source page). */
  resourceMapMisses: number;
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
  /** Optional — present when asset extraction ran. Drives the popup's
   *  "partial capture" warning. */
  captureStats?: CaptureStats;
}

export interface ExtractedFont {
  family: string;
  style: string;
  weight: string;
  src: string;
  format: string;
  isGoogleFont: boolean;
  /** URL of the stylesheet that declared this @font-face rule */
  sourceURL?: string;
  /** Base64-encoded font binary (extracted from browser cache via Page.getResourceContent) */
  fontBase64?: string;
  /** MIME type of the font binary (e.g., "font/woff2", "font/woff", "font/ttf") */
  fontMimeType?: string;
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

// ============================================================================
// CAPTURE OPTIONS
// ============================================================================

export interface CaptureOptions {
  viewports: number[];
  /** Skip page reload between viewports — preserves SPA state, auth, form data */
  preserveState?: boolean;
}

export const DEFAULT_CAPTURE_OPTIONS: CaptureOptions = {
  viewports: [1440],
};
