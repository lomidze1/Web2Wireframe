/**
 * Frame and node creation for Figma
 * Handles recursive node creation, auto layout, and wireframe frames
 */

import type {
  WireframeNode,
  WireframeFrame,
  RenderContext,
  RenderWireframeData,
} from "../types";
import { logger } from "../utils/logger";
import {
  hexToFigmaRGB,
  cssColorToFigmaRGB,
  normalizeColorForLookup,
  paintKeyFromCSSColor,
  getDominantColorFromPaints,
  getSmartTextColor,
  isLightColorValue,
  determineColorRole,
  getPluginColorForRole,
} from "./colors";
import { parseGradient } from "./gradients";
import {
  getBorderRadius,
  cssJustifyToFigma,
  cssAlignToFigma,
  cssAlignSelfToFigma,
  applyTextAlignFallback,
  needsMarginWrapper,
  createMarginWrapper,
} from "./layout";
import {
  convertFillsToPaints,
  convertStrokesToFigma,
  convertEffectsToFigma,
} from "./fills";
import {
  linkFillStyleIfAvailable,
  linkStrokeStyleIfAvailable,
} from "./styles";
import { createTextNode, createTextWithBackground } from "./text";
import { createPlaceholder } from "./placeholders";
import { createRealImage } from "./realImages";
// wireframeLines import removed — fontMode "lines" uses FILLR font via text.ts

// ============================================================================
// Blend Mode Mapping (CSS mix-blend-mode → Figma BlendMode)
// ============================================================================

const CSS_TO_FIGMA_BLEND_MODE: Record<string, BlendMode> = {
  "multiply": "MULTIPLY",
  "screen": "SCREEN",
  "overlay": "OVERLAY",
  "darken": "DARKEN",
  "lighten": "LIGHTEN",
  "color-dodge": "COLOR_DODGE",
  "color-burn": "COLOR_BURN",
  "hard-light": "HARD_LIGHT",
  "soft-light": "SOFT_LIGHT",
  "difference": "DIFFERENCE",
  "exclusion": "EXCLUSION",
  "hue": "HUE",
  "saturation": "SATURATION",
  "color": "COLOR",
  "luminosity": "LUMINOSITY",
};

/**
 * Maps CSS mix-blend-mode value to Figma BlendMode.
 * Returns undefined for "normal", unknown, or empty values.
 */
export function mapCSSBlendMode(
  cssBlendMode: string | undefined
): BlendMode | undefined {
  if (!cssBlendMode) return undefined;
  return CSS_TO_FIGMA_BLEND_MODE[cssBlendMode];
}

// ============================================================================
// Legacy Fill/Stroke Application
// ============================================================================

/**
 * Apply fill to a frame with optional style linking (legacy support)
 */
function applyFillToFrame(
  frame: FrameNode,
  color: string,
  context: RenderContext,
  tag?: string,
  className?: string
): void {
  // When colorMode is "plugin", use smart color mapping
  let effectiveColor = color;
  if (context.colorMode === "plugin") {
    const colorWithOpacity = cssColorToFigmaRGB(color);
    if (colorWithOpacity) {
      const isLight = isLightColorValue(colorWithOpacity.color);
      const role = determineColorRole("fill", tag, isLight, undefined, className);
      effectiveColor = getPluginColorForRole(role, context.pluginColors);
    }
  }

  const colorWithOpacity = cssColorToFigmaRGB(effectiveColor);
  if (!colorWithOpacity) {
    frame.fills = [];
    return;
  }

  // Check if we should link to a style
  if (context.variableMode === "styles") {
    const normalizedColor = paintKeyFromCSSColor(effectiveColor);
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
      opacity: context.colorMode === "plugin" ? 1.0 : colorWithOpacity.opacity,
    },
  ];
}

/**
 * Apply stroke to a frame with optional style linking (legacy support)
 */
function applyStrokeToFrame(
  frame: FrameNode,
  color: string,
  strokeWeight: number,
  context: RenderContext
): void {
  // When colorMode is "plugin", always use text color for borders
  const effectiveColor =
    context.colorMode === "plugin" ? context.pluginColors.text : color;

  const colorWithOpacity = cssColorToFigmaRGB(effectiveColor);
  if (!colorWithOpacity) return;

  // Check if we should link to a style
  if (context.variableMode === "styles") {
    const normalizedColor = paintKeyFromCSSColor(effectiveColor);
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
      opacity: context.colorMode === "plugin" ? 1.0 : colorWithOpacity.opacity,
    },
  ];
  frame.strokeWeight = strokeWeight;
}

// ============================================================================
// Auto Layout Decision Helper
// ============================================================================

/**
 * Determine whether auto layout should be applied to a node.
 * True when global mode is "autoLayout" OR when the node itself has
 * a layout mode (e.g. card with VERTICAL) — this ensures internal
 * auto-layout works even in absolute positioning mode.
 */
export function shouldUseAutoLayout(
  contextLayoutMode: string | undefined,
  nodeLayoutMode: string | undefined
): boolean {
  // Absolute mode: never use auto layout — all frames use x/y positioning
  if (contextLayoutMode === "absolute") return false;
  // Grid uses its own rendering path, not auto layout
  if (nodeLayoutMode === "GRID") return false;
  if (contextLayoutMode === "autoLayout") return true;
  // Node has its own layout (e.g. card with VERTICAL, button with HORIZONTAL)
  return !!nodeLayoutMode && nodeLayoutMode !== "NONE";
}

// ============================================================================
// Recursive Node Creation
// ============================================================================

/**
 * Recursively create Figma nodes from tree structure
 */
export async function createNodeInFigma(
  node: WireframeNode,
  context: RenderContext,
  depth: number = 0
): Promise<SceneNode | null> {
  // Depth limit to prevent infinite recursion
  if (depth > 20) {
    logger.warn("Max depth reached", { nodeId: node.id, depth });
    return null;
  }

  // Handle text nodes (including those with inline children)
  // fontMode "lines" uses FILLR font — handled in text.ts font resolution
  if (node.type === "text") {
    // Check if text node has background fills (like buttons)
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
  // Skip placeholder path when element has children (e.g. background-image containers)
  // so children are rendered normally as frame content
  if (
    (node.type === "placeholder" || node.isPlaceholder) &&
    (!node.children || node.children.length === 0)
  ) {
    // Real assets mode: render actual image if available
    if (
      context.assetMode === "realAssets" &&
      node.imageUrl &&
      context.assetsMap?.has(node.imageUrl)
    ) {
      console.log(`[W2W] ✅ Real image: ${node.imageUrl.substring(0, 60)}...`);
      return await createRealImage(
        node,
        context.assetsMap.get(node.imageUrl)!,
        context
      );
    }

    // Debug: log why placeholder was used instead of real image
    if (node.imageUrl) {
      const reasons: string[] = [];
      if (context.assetMode !== "realAssets") reasons.push(`assetMode="${context.assetMode}"`);
      if (!context.assetsMap?.has(node.imageUrl)) reasons.push(`URL not in assetsMap (map size=${context.assetsMap?.size || 0})`);
      console.log(`[W2W] ⚠️ Placeholder for: ${node.imageUrl.substring(0, 60)}... — ${reasons.join(", ")}`);
    }

    // Default: wireframe placeholder
    return await createPlaceholder(
      node,
      context.pluginColors.secondary,
      context.pluginColors.text,
      context
    );
  }

  // Create frame for containers
  const frame = figma.createFrame();
  frame.name = node.name || "Container";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout: global autoLayout mode OR node has its own layout (e.g. card with VERTICAL)
  const useAutoLayout = shouldUseAutoLayout(context.layoutMode, node.layoutMode);
  const isGrid = node.layoutMode === "GRID" && context.layoutMode !== "absolute";

  let gridApplied = false;
  if (isGrid) {
    // === CSS GRID LAYOUT → Figma Grid ===
    try {
      applyGridLayout(frame, node);
      gridApplied = true;
    } catch (err) {
      // Fallback to VERTICAL auto layout if Grid API fails
      logger.warn("Grid layout failed, falling back to auto layout", { error: err, nodeName: node.name });
      frame.layoutMode = "VERTICAL";
      frame.layoutSizingHorizontal = "FIXED";
      frame.layoutSizingVertical = "HUG";
    }
  }
  if (useAutoLayout && !gridApplied) {
    // Use CSS layout direction if available (GRID filtered above by isGrid check)
    frame.layoutMode =
      node.layoutMode && node.layoutMode !== "NONE" && node.layoutMode !== "GRID"
        ? node.layoutMode
        : "VERTICAL";

    // Apply sizing mode (resize() already sets initial dimensions at line 196)
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

    // Apply alignment from CSS
    const primaryResult = cssJustifyToFigma(node.justifyContent);
    const counterResult = cssAlignToFigma(node.alignItems);

    frame.primaryAxisAlignItems = primaryResult;
    frame.counterAxisAlignItems = counterResult;

    // text-align fallback for non-flex block containers
    applyTextAlignFallback(frame, node.textAlign, node.justifyContent, node.alignItems);

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

  // Apply fills from Figma-ready array
  if (node.fills && node.fills.length > 0) {
    const paints = convertFillsToPaints(
      node.fills,
      context,
      node.tag,
      node.className
    );
    if (paints.length > 0) {
      frame.fills = paints;
      linkFillStyleIfAvailable(frame, context, node.fills);
    } else {
      frame.fills = [];
    }
  }
  // LEGACY: Fallback to old gradient/backgroundColor fields
  else if (node.backgroundGradient) {
    const gradientPaint = parseGradient(
      node.backgroundGradient,
      context.variableValueMap
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
        node.className
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
      node.className
    );
  } else {
    frame.fills = [];
  }

  // Apply strokes from Figma-ready array
  if (node.strokes && node.strokes.length > 0) {
    const { paints, weight } = convertStrokesToFigma(node.strokes, context);
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      linkStrokeStyleIfAvailable(frame, context, node.strokes);
    }
  }
  // LEGACY: Fallback to old borderColor/borderWidth fields
  else if (node.borderWidth > 0 && node.borderColor) {
    applyStrokeToFrame(frame, node.borderColor, node.borderWidth, context);
  }

  // Apply effects from Figma-ready array
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
      Math.min(node.width, node.height) / 2
    );
  }

  // Apply opacity - skip in plugin colors mode
  if (context.colorMode !== "plugin" && node.opacity < 1 && node.opacity > 0) {
    frame.opacity = node.opacity;
  }

  // Apply blend mode (CSS mix-blend-mode → Figma BlendMode)
  if (node.blendMode) {
    const figmaBlendMode = mapCSSBlendMode(node.blendMode);
    if (figmaBlendMode) {
      frame.blendMode = figmaBlendMode;
    }
  }

  // Clips content based on CSS overflow
  frame.clipsContent =
    node.overflow === "hidden" ||
    node.overflow === "scroll" ||
    node.overflow === "auto";

  // Recursively create children
  if (node.children && node.children.length > 0) {
    const parentHasAutoLayout = useAutoLayout;

    // Get ACTUAL applied background color from this frame
    const currentBgColor = getDominantColorFromPaints(frame.fills as Paint[]);
    const effectiveParentBg = currentBgColor || context.parentBackgroundColor;

    // Create child context with parent background and width tracking
    const childContext: RenderContext = {
      ...context,
      parentBackgroundColor: effectiveParentBg,
      parentWidth: node.width,
    };

    // Sort grid children by position for correct auto-placement
    const childrenToRender = gridApplied
      ? sortGridChildren(node.children, node.gridAutoFlow)
      : node.children;

    // h2d model: when parent has styledSegments, skip inline #text children
    // (styledSegments already covers their content with proper formatting)
    const skipInlineTextChildren = node.styledSegments && node.styledSegments.length > 0;

    for (const child of childrenToRender) {
      // Skip DOM text node children when styledSegments handles inline formatting
      if (skipInlineTextChildren && child.type === "text" && child.tag === "#text") {
        continue;
      }

      try {
        const childNode = await createNodeInFigma(child, childContext, depth + 1);

        if (childNode) {
          if (gridApplied) {
            // Grid: append child and set spans
            frame.appendChild(childNode);
            const colSpan = getGridSpanFromNode(child.gridColumnStart, child.gridColumnEnd);
            const rowSpan = getGridSpanFromNode(child.gridRowStart, child.gridRowEnd);
            const gridChild = childNode as unknown as Record<string, unknown>;
            if (colSpan > 1) {
              gridChild.gridColumnSpan = colSpan;
            }
            if (rowSpan > 1) {
              gridChild.gridRowSpan = rowSpan;
            }
          } else if (parentHasAutoLayout) {
            applyChildInAutoLayout(childNode, child, frame, childContext);
          } else {
            // Absolute mode: use x/y positioning
            frame.appendChild(childNode);
            if (child.horizontallyCentered && child.width < node.width) {
              childNode.x = (node.width - child.width) / 2;
            } else {
              childNode.x = child.x;
            }
            // Sticky elements: use y=0 because their getBoundingClientRect
            // returns the "stuck" position (viewport-relative) when page is
            // scrolled during capture, not their natural flow position.
            // Figma has no scroll, so sticky = natural flow position.
            childNode.y = child.position === "sticky" ? 0 : child.y;
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

  // h2d model: frame with styledSegments → single Figma TextNode with per-range formatting
  const hasSyntheticTextChild = node.children?.some(
    (child) => child.type === "text"
  );
  if (
    node.styledSegments &&
    node.styledSegments.length > 0 &&
    hasSyntheticTextChild &&
    node.type === "frame"
  ) {
    try {
      // Create a combined text node from styledSegments (preserves inline bold/italic/link)
      const combinedTextContent = node.styledSegments.map(s => s.text).join("");
      if (combinedTextContent.trim()) {
        const combinedNode = {
          ...node,
          type: "text" as const,
          textContent: combinedTextContent,
          children: [] as typeof node.children,
        };
        const styledTextNode = await createTextNode(
          combinedNode,
          context.fontFamily,
          context
        );
        if (styledTextNode) {
          frame.appendChild(styledTextNode);
          styledTextNode.name = combinedTextContent.substring(0, 30);
          if (useAutoLayout) {
            styledTextNode.layoutSizingHorizontal = "FILL";
            styledTextNode.layoutSizingVertical = "HUG";
          }
        }
      }
    } catch (err) {
      logger.error("Error creating styled text node for frame", err, {
        nodeId: node.id,
        nodeName: node.name,
      });
    }
  } else if (
    node.textContent &&
    node.textContent.trim() &&
    node.type === "frame" &&
    !hasSyntheticTextChild
  ) {
    try {
      const textNode = figma.createText();
      await figma.loadFontAsync({
        family: context.fontFamily,
        style: "Regular",
      });

      textNode.characters = node.textContent;
      textNode.name = node.textContent.substring(0, 20);
      textNode.fontSize = node.fontSize || 16;
      textNode.fontName = { family: context.fontFamily, style: "Regular" };

      // Apply text color
      const textColorToUse =
        context.colorMode === "plugin"
          ? getSmartTextColor(node, context, node.tag?.toLowerCase() === "a")
          : node.textColor || context.pluginColors.text;
      const colorResult = cssColorToFigmaRGB(textColorToUse);
      if (colorResult) {
        let styleLinked = false;
        if (context.variableMode === "styles") {
          const colorKey = paintKeyFromCSSColor(textColorToUse);
          const linkedStyle = context.colorStyleMap.get(colorKey);
          if (linkedStyle) {
            textNode.fillStyleId = linkedStyle.id;
            styleLinked = true;
          }
        }
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

      // Position the text
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

  // Pseudo-state variants: convert to ComponentSet if enabled
  if (
    context.interactionMode === "variants" &&
    node.pseudoStateStyles &&
    Object.keys(node.pseudoStateStyles).length > 0
  ) {
    try {
      const { createPseudoStateVariants } = await import("./pseudoStates");
      const { componentSet, defaultInstance } =
        await createPseudoStateVariants(frame, node.pseudoStateStyles);
      context.componentSets?.push(componentSet);
      return defaultInstance;
    } catch (err) {
      logger.error("Pseudo-state variant creation failed", err);
    }
  }

  return frame;
}

// ============================================================================
// Auto Layout Child Helper
// ============================================================================

/**
 * Apply auto layout child properties (margin wrapper, absolute positioning,
 * sizing modes) to a child node inside an auto layout parent.
 * Shared by createNodeInFigma (nested frames) and createWireframeFrame (root frame).
 */
function applyChildInAutoLayout(
  childNode: SceneNode,
  child: WireframeNode,
  parentFrame: FrameNode,
  context: RenderContext
): void {
  // Absolute/fixed: position directly, no wrapper
  if (child.position === "absolute" || child.position === "fixed") {
    parentFrame.appendChild(childNode);
    if ("layoutPositioning" in childNode) {
      (childNode as FrameNode | TextNode).layoutPositioning = "ABSOLUTE";
    }
    childNode.x = child.x;
    childNode.y = child.y;
    return;
  }

  // Sticky: treat as normal flow. Figma has no scroll, so sticky
  // behaves identically to static — the element stays in its natural
  // flow position. No spacer or ABSOLUTE positioning needed.

  // Create margin wrapper if needed
  const hasWrapper = needsMarginWrapper(child.margin);
  let wrapper: FrameNode | null = null;
  if (hasWrapper) {
    wrapper = createMarginWrapper(child, childNode, parentFrame.layoutMode, context.textMode);
  }

  // Append to parent (wrapper is the direct child; inner childNode already inside)
  parentFrame.appendChild(wrapper || childNode);

  // Sizing target = wrapper (if exists) or childNode.
  // When wrapper exists: sizing goes on wrapper; inner child already FILLs wrapper.
  const isHorizontalLayout = parentFrame.layoutMode === "HORIZONTAL";

  if (
    childNode.type === "FRAME" ||
    childNode.type === "COMPONENT" ||
    childNode.type === "INSTANCE"
  ) {
    const target = wrapper || (childNode as FrameNode);
    const frameChild = childNode as FrameNode;

    // layoutGrow
    if (child.layoutGrow === 1) {
      target.layoutGrow = 1;
    }

    // layoutAlign from CSS align-self
    const selfAlign = cssAlignSelfToFigma(
      child.alignSelf,
      parentFrame.counterAxisAlignItems
    );
    if (selfAlign === "STRETCH") {
      target.layoutAlign = "STRETCH";
    } else if (selfAlign === "CENTER") {
      target.layoutAlign = "INHERIT";
    } else if (child.layoutAlign === "STRETCH") {
      target.layoutAlign = "STRETCH";
    }

    if (isHorizontalLayout) {
      // Main axis = horizontal
      if (
        child.layoutSizingHorizontal === "FILL" ||
        child.layoutGrow === 1
      ) {
        if (parentFrame.layoutSizingHorizontal === "HUG") {
          target.layoutSizingHorizontal = "HUG";
        } else {
          target.layoutSizingHorizontal = "FILL";
          if (child.horizontallyCentered && child.width < (context.parentWidth || Infinity)) {
            target.maxWidth = child.width + (child.margin?.left || 0) + (child.margin?.right || 0);
          }
        }
      } else if (
        !wrapper &&
        child.layoutSizingHorizontal === "HUG" &&
        frameChild.layoutMode !== "NONE"
      ) {
        frameChild.layoutSizingHorizontal = "HUG";
      }
      // Cross axis = vertical
      if (
        child.layoutAlign === "STRETCH" ||
        child.layoutSizingVertical === "FILL"
      ) {
        target.layoutSizingVertical = "FILL";
      } else if (
        !wrapper &&
        child.layoutSizingVertical === "HUG" &&
        frameChild.layoutMode !== "NONE"
      ) {
        frameChild.layoutSizingVertical = "HUG";
      }
    } else {
      // Main axis = vertical
      if (
        child.layoutSizingVertical === "FILL" ||
        child.layoutGrow === 1
      ) {
        if (parentFrame.layoutSizingVertical === "HUG") {
          target.layoutSizingVertical = "HUG";
        } else {
          target.layoutSizingVertical = "FILL";
        }
      } else if (
        !wrapper &&
        child.layoutSizingVertical === "HUG" &&
        frameChild.layoutMode !== "NONE"
      ) {
        frameChild.layoutSizingVertical = "HUG";
      }
      // Cross axis = horizontal
      if (
        child.layoutAlign === "STRETCH" ||
        child.layoutSizingHorizontal === "FILL"
      ) {
        target.layoutSizingHorizontal = "FILL";
        if (child.horizontallyCentered && child.width < (context.parentWidth || Infinity)) {
          target.maxWidth = child.width + (child.margin?.left || 0) + (child.margin?.right || 0);
        }
      } else if (
        !wrapper &&
        child.layoutSizingHorizontal === "HUG" &&
        frameChild.layoutMode !== "NONE"
      ) {
        frameChild.layoutSizingHorizontal = "HUG";
      }
    }
  } else if (childNode.type === "TEXT") {
    const textChild = childNode as TextNode;
    const isMultiLine = (child.browserLineCount || 1) > 1;

    // layoutAlign
    const selfAlign = cssAlignSelfToFigma(
      child.alignSelf,
      parentFrame.counterAxisAlignItems
    );
    if (selfAlign === "STRETCH") {
      (wrapper || textChild).layoutAlign = "STRETCH";
    } else if (child.layoutAlign === "STRETCH") {
      (wrapper || textChild).layoutAlign = "STRETCH";
    }

    if (wrapper) {
      if (context.textMode === "semantic") {
        // Semantic placeholder: wrapper keeps original browser dimensions (FIXED),
        // so inner text truncation with "..." works correctly in auto-layout.
        wrapper.layoutSizingHorizontal = "FIXED";
        wrapper.layoutSizingVertical = "FIXED";
      } else {
        // Wrapper handles parent sizing; inner text already FILL+HEIGHT from createMarginWrapper
        if (isHorizontalLayout) {
          if (child.layoutSizingHorizontal === "FILL" || isMultiLine) {
            wrapper.layoutSizingHorizontal = "FILL";
          }
          if (child.layoutAlign === "STRETCH" || child.layoutSizingVertical === "FILL") {
            wrapper.layoutSizingVertical = "FILL";
          }
        } else {
          if (child.layoutSizingVertical === "FILL") {
            wrapper.layoutSizingVertical = "FILL";
          }
          if (child.layoutAlign === "STRETCH" || child.layoutSizingHorizontal === "FILL" || isMultiLine) {
            wrapper.layoutSizingHorizontal = "FILL";
          }
        }
      }
    } else if (context.textMode === "semantic") {
      // Semantic placeholder text: preserve NONE + ENDING truncation from createTextNode.
      // FIXED keeps original browser dimensions so truncation works in auto-layout.
      textChild.layoutSizingHorizontal = "FIXED";
      textChild.layoutSizingVertical = "FIXED";
    } else {
      // No wrapper — apply directly to text node
      if (isHorizontalLayout) {
        if (child.layoutSizingHorizontal === "FILL" || isMultiLine) {
          textChild.layoutSizingHorizontal = "FILL";
          textChild.textAutoResize = "HEIGHT";
        } else {
          textChild.layoutSizingHorizontal = "HUG";
          textChild.textAutoResize = "WIDTH_AND_HEIGHT";
        }
        if (child.layoutAlign === "STRETCH" || child.layoutSizingVertical === "FILL") {
          textChild.layoutSizingVertical = "FILL";
        }
      } else {
        if (child.layoutSizingVertical === "FILL") {
          textChild.layoutSizingVertical = "FILL";
        } else {
          textChild.layoutSizingVertical = "HUG";
        }
        if (child.layoutAlign === "STRETCH" || child.layoutSizingHorizontal === "FILL" || isMultiLine) {
          textChild.layoutSizingHorizontal = "FILL";
          textChild.textAutoResize = "HEIGHT";
        } else {
          textChild.layoutSizingHorizontal = "HUG";
          textChild.textAutoResize = "WIDTH_AND_HEIGHT";
        }
      }
    }
  }
}

// ============================================================================
// Wireframe Frame Creation
// ============================================================================

/**
 * Create a single wireframe frame with nested structure
 */
export async function createWireframeFrame(
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
    getOuterFrameHeight(frameData.tree?.height, frameData.viewportHeight)
  );

  // Position
  const viewport = figma.viewport.center;
  wireframeFrame.x =
    viewport.x -
    frameData.viewportWidth / 2 +
    index * (frameData.viewportWidth + 100);
  wireframeFrame.y = viewport.y - 200;

  // Set root wireframe frame background
  if (context.colorMode === "plugin") {
    let rootStyleLinked = false;
    if (context.variableMode === "styles") {
      const normalizedColor = normalizeColorForLookup(pluginColors.background);
      const linkedStyle = context.colorStyleMap.get(normalizedColor);
      if (linkedStyle) {
        wireframeFrame.fillStyleId = linkedStyle.id;
        rootStyleLinked = true;
      }
    }
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
        frameData.tree.tag
      );
      if (rootFills.length > 0) {
        wireframeFrame.fills = rootFills;
        linkFillStyleIfAvailable(wireframeFrame, context, frameData.tree.fills);
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

  // Clip contents based on root element's overflow
  const rootOverflow = frameData.tree?.overflow;
  wireframeFrame.clipsContent =
    rootOverflow === "hidden" ||
    rootOverflow === "scroll" ||
    rootOverflow === "auto";

  // Apply Auto Layout to root frame when in autoLayout mode
  const useAutoLayout = context.layoutMode === "autoLayout";
  if (useAutoLayout && frameData.tree) {
    const rootTree = frameData.tree;

    // Use body's detected layout or default to VERTICAL
    // Skip GRID for root frame — body-level grid is rare and root needs auto layout
    const rootLayout = rootTree.layoutMode && rootTree.layoutMode !== "NONE" && rootTree.layoutMode !== "GRID"
      ? rootTree.layoutMode
      : "VERTICAL";
    wireframeFrame.layoutMode = rootLayout;

    // Root frame: fixed viewport width, height hugs content
    wireframeFrame.layoutSizingHorizontal = "FIXED";
    wireframeFrame.layoutSizingVertical = "HUG";

    // Apply padding from body element
    if (rootTree.padding) {
      wireframeFrame.paddingTop = rootTree.padding.top || 0;
      wireframeFrame.paddingRight = rootTree.padding.right || 0;
      wireframeFrame.paddingBottom = rootTree.padding.bottom || 0;
      wireframeFrame.paddingLeft = rootTree.padding.left || 0;
    }

    // Apply item spacing
    if (rootTree.itemSpacing > 0) {
      wireframeFrame.itemSpacing = rootTree.itemSpacing;
    }

    // Apply alignment from CSS
    const primaryResult = cssJustifyToFigma(rootTree.justifyContent);
    const counterResult = cssAlignToFigma(rootTree.alignItems);
    wireframeFrame.primaryAxisAlignItems = primaryResult;
    wireframeFrame.counterAxisAlignItems = counterResult;

    // text-align fallback for non-flex block containers
    applyTextAlignFallback(wireframeFrame, rootTree.textAlign, rootTree.justifyContent, rootTree.alignItems);
  }

  // Create nested structure from tree
  if (frameData.tree && frameData.tree.children) {
    const rootBgColor =
      getDominantColorFromPaints(wireframeFrame.fills as Paint[]) ||
      hexToFigmaRGB(pluginColors.background);

    const childContext: RenderContext = {
      ...context,
      parentBackgroundColor: rootBgColor,
      parentWidth: frameData.viewportWidth,
    };

    for (const child of frameData.tree.children) {
      try {
        const childNode = await createNodeInFigma(child, childContext, 1);

        if (childNode) {
          if (useAutoLayout) {
            // Auto Layout: use helper for FILL/HUG/margin/absolute
            applyChildInAutoLayout(childNode, child, wireframeFrame, childContext);
          } else {
            // Absolute mode: original x/y positioning
            if (
              child.horizontallyCentered &&
              child.width < frameData.viewportWidth
            ) {
              childNode.x = (frameData.viewportWidth - child.width) / 2;
            } else {
              childNode.x = child.x;
            }
            // Sticky elements: use y=0 (see nested comment for explanation)
            childNode.y = child.position === "sticky" ? 0 : child.y;
            wireframeFrame.appendChild(childNode);
          }
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

// ============================================================================
// CSS Grid Layout Helpers
// ============================================================================

import { parseGridTemplate, getGridSpan, type FigmaGridTrackSize } from "@w2w/shared";

/**
 * Apply Figma Grid layout to a frame based on CSS Grid properties.
 * Uses type assertions because @figma/plugin-typings 1.109.0 doesn't
 * include the Grid Layout API yet (available in Figma runtime).
 */
function applyGridLayout(frame: FrameNode, node: WireframeNode): void {
  const gridFrame = frame as unknown as Record<string, unknown>;
  gridFrame.layoutMode = "GRID";

  // Parse column/row templates
  const columnSizes = parseGridTemplate(node.gridTemplateColumns || "");
  const rowSizes = parseGridTemplate(node.gridTemplateRows || "");

  // Set grid dimensions
  const columnCount = columnSizes.length || 1;
  gridFrame.gridColumnCount = columnCount;

  // Row count: explicit rows OR computed from children
  const explicitRowCount = rowSizes.length;
  const childCount = node.children?.length || 0;
  const implicitRowCount = Math.ceil(childCount / columnCount);
  const rowCount = Math.max(explicitRowCount, implicitRowCount, 1);
  gridFrame.gridRowCount = rowCount;

  // Apply track sizes
  const gridColSizes = gridFrame.gridColumnSizes as FigmaGridTrackSize[] | undefined;
  if (gridColSizes) {
    for (let i = 0; i < columnCount; i++) {
      if (columnSizes[i]) {
        gridColSizes[i] = columnSizes[i];
      }
    }
  }
  const gridRowSizesArr = gridFrame.gridRowSizes as FigmaGridTrackSize[] | undefined;
  if (gridRowSizesArr) {
    for (let i = 0; i < rowCount; i++) {
      if (rowSizes[i]) {
        gridRowSizesArr[i] = rowSizes[i];
      }
    }
  }

  // Apply gaps
  gridFrame.gridColumnGap = Math.max(node.gridColumnGap || 0, 0);
  gridFrame.gridRowGap = Math.max(node.gridRowGap || 0, 0);

  // Container sizing: always FIXED (FLEX tracks + HUG is invalid in Figma)
  frame.layoutSizingHorizontal = "FIXED";
  frame.layoutSizingVertical = "FIXED";

  // Apply padding
  if (node.padding) {
    frame.paddingTop = node.padding.top || 0;
    frame.paddingRight = node.padding.right || 0;
    frame.paddingBottom = node.padding.bottom || 0;
    frame.paddingLeft = node.padding.left || 0;
  }
}

/**
 * Sort grid children by their grid position for correct Figma auto-placement.
 * Figma's gridColumnAnchorIndex is read-only, so children must be appended in order.
 */
function sortGridChildren(
  children: WireframeNode[],
  gridAutoFlow?: string
): WireframeNode[] {
  return [...children].sort((a, b) => {
    const aRow = a.gridRowStart || Infinity;
    const aCol = a.gridColumnStart || Infinity;
    const bRow = b.gridRowStart || Infinity;
    const bCol = b.gridColumnStart || Infinity;

    if (gridAutoFlow?.includes("column")) {
      // Column flow: sort by column first, then row
      return aCol - bCol || aRow - bRow;
    }
    // Row flow (default): sort by row first, then column
    return aRow - bRow || aCol - bCol;
  });
}

/**
 * Compute grid span from CSS grid-column-start/end line numbers.
 */
function getGridSpanFromNode(start?: number, end?: number): number {
  return getGridSpan(start, end);
}

/**
 * Calculate the outer wireframe frame height.
 * Prefers tree.height (sub-pixel CSS computed) over viewportHeight (scrollHeight integer).
 * Clamped to 15000px (Figma limit).
 */
export function getOuterFrameHeight(
  treeHeight: number | undefined,
  viewportHeight: number
): number {
  return Math.min(treeHeight || viewportHeight, 15000);
}
