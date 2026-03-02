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
  if (node.type === "placeholder" || node.isPlaceholder) {
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

  // === DEBUG: Log frame creation dimensions ===
  if (node.name && (node.name.includes("Card") || node.tag === "div")) {
    console.log(`[DEBUG-RENDER] Creating "${node.name}": resize(${node.width}, ${node.height}), layoutSizingH=${node.layoutSizingHorizontal}, layoutSizingV=${node.layoutSizingVertical}, layoutMode=${node.layoutMode}`);
  }
  // === END DEBUG ===

  // Apply Auto Layout ONLY if context.layoutMode is "autoLayout"
  const useAutoLayout = context.layoutMode === "autoLayout";

  if (useAutoLayout) {
    // Use CSS layout direction if available
    frame.layoutMode =
      node.layoutMode && node.layoutMode !== "NONE"
        ? node.layoutMode
        : "VERTICAL";

    // Apply sizing mode (preserve browser dimensions with minWidth/minHeight)
    // HUG = size to content with min constraint; FILL applied later by parent
    if (node.layoutSizingHorizontal === "HUG" || !node.layoutSizingHorizontal) {
      frame.layoutSizingHorizontal = "HUG";
      frame.minWidth = node.width;
    } else {
      frame.layoutSizingHorizontal = "FIXED";
    }
    if (node.layoutSizingVertical === "HUG" || !node.layoutSizingVertical) {
      frame.layoutSizingVertical = "HUG";
      frame.minHeight = node.height;
    } else {
      frame.layoutSizingVertical = "FIXED";
    }

    // Apply alignment from CSS
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

    for (const child of node.children) {
      try {
        const childNode = await createNodeInFigma(child, childContext, depth + 1);

        if (childNode) {
          // Check if child needs a margin wrapper
          let nodeToAppend: SceneNode = childNode;
          if (
            parentHasAutoLayout &&
            needsMarginWrapper(child.margin) &&
            child.position !== "absolute" &&
            child.position !== "fixed"
          ) {
            nodeToAppend = createMarginWrapper(child, childNode, frame.layoutMode);
          }

          // Append child first (required for Auto Layout properties)
          frame.appendChild(nodeToAppend);

          // Handle absolute/fixed positioning
          if (child.position === "absolute" || child.position === "fixed") {
            if (parentHasAutoLayout && "layoutPositioning" in childNode) {
              (childNode as FrameNode | TextNode).layoutPositioning = "ABSOLUTE";
            }
            childNode.x = child.x;
            childNode.y = child.y;
          } else if (parentHasAutoLayout) {
            // Auto Layout parent: apply child-level properties
            if (
              childNode.type === "FRAME" ||
              childNode.type === "COMPONENT" ||
              childNode.type === "INSTANCE"
            ) {
              const frameChild = childNode as FrameNode;

              // Apply layoutGrow
              if (child.layoutGrow === 1) {
                frameChild.layoutGrow = 1;
              }

              // Apply layoutAlign from CSS align-self
              const selfAlign = cssAlignSelfToFigma(
                child.alignSelf,
                frame.counterAxisAlignItems
              );
              if (selfAlign === "STRETCH") {
                frameChild.layoutAlign = "STRETCH";
              } else if (selfAlign === "CENTER") {
                frameChild.layoutAlign = "INHERIT";
              } else if (child.layoutAlign === "STRETCH") {
                frameChild.layoutAlign = "STRETCH";
              }

              // Apply sizing mode for children
              const isHorizontalLayout = frame.layoutMode === "HORIZONTAL";

              if (isHorizontalLayout) {
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
                  frameChild.minWidth = child.width;
                }
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
                  frameChild.minHeight = child.height;
                }
              } else {
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
                  frameChild.minHeight = child.height;
                }
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
                  frameChild.minWidth = child.width;
                }
              }
            } else if (childNode.type === "TEXT") {
              const textChild = childNode as TextNode;
              const isHorizontalLayout = frame.layoutMode === "HORIZONTAL";
              const isMultiLine = (child.browserLineCount || 1) > 1;

              if (isHorizontalLayout) {
                // Horizontal axis (main axis)
                if (child.layoutSizingHorizontal === "FILL") {
                  textChild.layoutSizingHorizontal = "FILL";
                  textChild.textAutoResize = "HEIGHT";
                } else if (isMultiLine) {
                  // Multi-line text: constrain width, auto height
                  textChild.layoutSizingHorizontal = "FILL";
                  textChild.textAutoResize = "HEIGHT";
                } else {
                  // Single-line text: hug both axes
                  textChild.layoutSizingHorizontal = "HUG";
                  textChild.textAutoResize = "WIDTH_AND_HEIGHT";
                }
                // Vertical axis (cross axis)
                if (
                  child.layoutAlign === "STRETCH" ||
                  child.layoutSizingVertical === "FILL"
                ) {
                  textChild.layoutSizingVertical = "FILL";
                }
              } else {
                // VERTICAL layout
                // Vertical axis (main axis)
                if (child.layoutSizingVertical === "FILL") {
                  textChild.layoutSizingVertical = "FILL";
                } else {
                  textChild.layoutSizingVertical = "HUG";
                }
                // Horizontal axis (cross axis)
                if (
                  child.layoutAlign === "STRETCH" ||
                  child.layoutSizingHorizontal === "FILL"
                ) {
                  textChild.layoutSizingHorizontal = "FILL";
                  textChild.textAutoResize = "HEIGHT";
                } else if (isMultiLine) {
                  // Multi-line text: constrain width, auto height
                  textChild.layoutSizingHorizontal = "FILL";
                  textChild.textAutoResize = "HEIGHT";
                } else {
                  // Single-line text: hug both axes
                  textChild.layoutSizingHorizontal = "HUG";
                  textChild.textAutoResize = "WIDTH_AND_HEIGHT";
                }
              }
            }
          } else {
            // Absolute mode: use x/y positioning
            if (child.horizontallyCentered && child.width < node.width) {
              // childNode.x = Math.round((node.width - child.width) / 2);
              childNode.x = (node.width - child.width) / 2;
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

  // Create text node for frame's textContent (like li elements with text)
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

  return frame;
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
          // Handle horizontally centered elements
          if (
            child.horizontallyCentered &&
            child.width < frameData.viewportWidth
          ) {
            // childNode.x = Math.round(
            //   (frameData.viewportWidth - child.width) / 2
            // );
            childNode.x = (frameData.viewportWidth - child.width) / 2;
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
