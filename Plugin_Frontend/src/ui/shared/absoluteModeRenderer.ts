/**
 * absoluteModeRenderer.ts
 *
 * Unified Absolute Mode rendering for all import methods:
 * - URL Import (Browser Extension / CDP)
 * - JSON Import (File upload)
 * - HTML Import (future)
 * - Screenshot Import (future)
 *
 * This file is the SINGLE SOURCE OF TRUTH for Absolute Mode data preparation.
 */

// ============================================================================
// FIGMA-READY TYPES
// ============================================================================

/** RGBA color normalized to 0-1 range (Figma format) */
interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Gradient stop */
interface FigmaGradientStop {
  color: FigmaColor;
  position: number;
}

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
  center?: { x: number; y: number };
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

/** Styled text segment for inline elements with different styles */
export interface StyledTextSegment {
  text: string;
  color: string | null;
  fontWeight: number;
  fontSize: number;
  fontFamily?: string;
  isLink?: boolean;
  tag?: string;
  textDecoration?: "underline" | "line-through" | "none";
}

// ============================================================================
// EXTRACTED ELEMENT (from CDP / Browser Extension)
// ============================================================================

/** Element extracted from website via CDP */
export interface ExtractedElement {
  id: string;
  type?: "frame" | "text" | "placeholder";
  tag: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
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
  textColor: string | null;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  boxShadow?: string | null;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number;
  textAlign: string;
  textContent: string;
  browserLineCount?: number;
  styledSegments?: StyledTextSegment[];
  listStyleType?: string;
  opacity: number;
  isPlaceholder: boolean;
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  horizontallyCentered?: boolean;
  computedStyles?: Record<string, string>;
  children: ExtractedElement[];
}

// ============================================================================
// WIREFRAME NODE (Figma-ready format)
// ============================================================================

/** Node ready for Figma rendering */
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
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  horizontallyCentered?: boolean;
  verticallyCenteredViaMargin?: boolean;
  alignSelf?: string;
  justifySelf?: string;
  margin?: { top: number; right: number; bottom: number; left: number };
  textContent: string;
  styledSegments?: StyledTextSegment[];
  listStyleType?: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  textAlign: string;
  lineHeight: number | string;
  letterSpacing: number;
  browserLineCount?: number;
  computedStyles?: Record<string, string>;
  isPlaceholder: boolean;
  children: WireframeNode[];
}

/** Frame containing wireframe tree */
export interface WireframeFrame {
  viewportWidth: number;
  viewportHeight: number;
  tree: WireframeNode;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Tags that are primarily text content */
const TEXT_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "li",
  "label",
  "button",
  "strong",
  "em",
  "b",
  "i",
  "small",
];

// ============================================================================
// CONVERSION FUNCTION
// ============================================================================

/**
 * Convert ExtractedElement to WireframeNode format
 *
 * This is the UNIFIED conversion function used by ALL import methods.
 * It transforms CDP-extracted data into Figma-ready format.
 */
export function convertToWireframeNode(
  element: ExtractedElement,
  pluginColors: { text: string; surface: string }
): WireframeNode {
  // Use the type already set by the Extension (CDP extraction sets this correctly)
  // Fallback logic only if type is not set
  let type: "frame" | "text" | "placeholder" = element.type || "frame";

  // If type wasn't set, try to determine it (fallback for legacy/external JSON data)
  if (!element.type) {
    if (element.isPlaceholder) {
      type = "placeholder";
    } else if (element.tag && TEXT_TAGS.includes(element.tag) && element.textContent) {
      // Has known text tag
      type = "text";
    } else if (
      // SMART DETECTION: For JSON files without tag field
      // If element has textContent + fontSize and is a leaf (no children), it's likely text
      element.textContent &&
      element.textContent.trim() &&
      element.fontSize &&
      element.fontSize > 0 &&
      (!element.children || element.children.length === 0)
    ) {
      type = "text";
    }
  }

  // Calculate average border radius
  const avgRadius = element.borderRadius
    ? Math.round(
        (element.borderRadius.topLeft +
          element.borderRadius.topRight +
          element.borderRadius.bottomRight +
          element.borderRadius.bottomLeft) /
          4
      )
    : 0;

  // Recursively convert children
  const children = element.children.map((child) =>
    convertToWireframeNode(child, pluginColors)
  );

  return {
    id: element.id,
    name: element.name || element.tag || (type === "text" ? "Text" : "Frame"),
    type,
    tag: element.tag || (type === "text" ? "#text" : "div"),
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    // CSS Positioning (for absolute elements like ::before/::after)
    position: element.position,
    layoutMode: element.layoutMode,
    itemSpacing: element.itemSpacing || 0,
    padding: element.padding || { top: 0, right: 0, bottom: 0, left: 0 },
    // Layout Alignment (for Auto Layout) - pass through from Extension
    justifyContent: element.justifyContent,
    alignItems: element.alignItems,
    flexWrap: element.flexWrap,
    // Child-level flex properties
    layoutGrow: element.layoutGrow,
    layoutAlign: element.layoutAlign,
    // Sizing mode
    layoutSizingHorizontal: element.layoutSizingHorizontal,
    layoutSizingVertical: element.layoutSizingVertical,
    // NEW: Figma-ready arrays (pass through from Extension)
    fills: element.fills,
    strokes: element.strokes,
    effects: element.effects,
    // LEGACY: Keep for backward compatibility
    backgroundColor: element.backgroundColor,
    backgroundGradient: element.backgroundGradient,
    textColor: element.textColor || pluginColors.text,
    borderColor: element.borderColor,
    borderWidth: element.borderWidth || 0,
    borderRadius: avgRadius,
    opacity: element.opacity ?? 1,
    overflow: element.overflow,
    horizontallyCentered: element.horizontallyCentered,
    textContent: element.textContent || "",
    styledSegments: element.styledSegments,
    listStyleType: element.listStyleType,
    fontSize: element.fontSize || 14,
    fontWeight: element.fontWeight || 400,
    fontFamily: element.fontFamily || "Inter",
    textAlign: element.textAlign || "left",
    lineHeight: element.lineHeight || "normal",
    letterSpacing: element.letterSpacing || 0,
    browserLineCount: element.browserLineCount,
    computedStyles: element.computedStyles,
    isPlaceholder: element.isPlaceholder,
    children,
  };
}

// ============================================================================
// FRAME DATA INTERFACE
// ============================================================================

/** Input frame format (from transformed data) */
interface TransformedFrame {
  viewport: { width: number; height: number };
  tree: ExtractedElement;
}

// ============================================================================
// UNIFIED PREPARE FUNCTION
// ============================================================================

/**
 * Prepare frames for Absolute Mode rendering in Figma
 *
 * This is the MAIN ENTRY POINT for all import methods.
 * Call this function after transformFramesData() to get Figma-ready data.
 *
 * @example
 * // URL Import
 * const transformedFrames = transformFramesData(wireframeData.frames, options);
 * const framesData = prepareFramesForAbsoluteMode(transformedFrames, pluginColors);
 * postMessage({ type: "render-wireframe", data: { frames: framesData, ... } });
 *
 * @example
 * // JSON Import
 * const transformedFrames = transformFramesData(captureResult.frames, options);
 * const framesData = prepareFramesForAbsoluteMode(transformedFrames, pluginColors);
 * postMessage({ type: "render-wireframe", data: { frames: framesData, ... } });
 */
export function prepareFramesForAbsoluteMode(
  transformedFrames: TransformedFrame[],
  pluginColors: { text: string; surface: string }
): WireframeFrame[] {
  return transformedFrames.map((frame) => {
    const wireframeTree = convertToWireframeNode(frame.tree, pluginColors);

    return {
      viewportWidth: frame.viewport.width,
      viewportHeight: frame.viewport.height,
      tree: wireframeTree,
    };
  });
}
