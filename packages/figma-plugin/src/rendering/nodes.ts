/**
 * Frame and node creation for Figma
 * Handles recursive node creation, auto layout, and wireframe frames
 */

import type {
  WireframeNode,
  WireframeFrame,
  RenderContext,
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
  cssAlignToGridChild,
  cssJustifyToGridChild,
} from "./layout";
import {
  convertFillsToPaints,
  convertStrokesToFigma,
  convertEffectsToFigma,
} from "./fills";
import {
  linkEffectStyleIfAvailable,
  linkFillStyleIfAvailable,
  linkGridStyleIfAvailable,
  linkStrokeStyleIfAvailable,
} from "./styles";
import { createTextNode, createTextWithBackground } from "./text";
import { createPlaceholder } from "./placeholders";
import { createRealImage } from "./realImages";
import { extractHostname } from "./hostname";
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
async function applyFillToFrame(
  frame: FrameNode,
  color: string,
  context: RenderContext,
  tag?: string,
  className?: string
): Promise<void> {
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
      await frame.setFillStyleIdAsync(linkedStyle.id);
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
async function applyStrokeToFrame(
  frame: FrameNode,
  color: string,
  strokeWeight: number,
  context: RenderContext
): Promise<void> {
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
      await frame.setStrokeStyleIdAsync(linkedStyle.id);
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

    // Text with padding but no background: Figma TextNode has no padding
    // support, so wrap in a plain frame and offset the TextNode by
    // padding.top/padding.left. Pattern: Apple.com footer footnote <p> with
    // padding-top: 0.8em — without this wrapper the padding collapses.
    const hasPadding =
      !!node.padding &&
      ((node.padding.top || 0) > 0 ||
        (node.padding.right || 0) > 0 ||
        (node.padding.bottom || 0) > 0 ||
        (node.padding.left || 0) > 0);

    if (hasPadding) {
      const textNode = await createTextNode(node, context.fontFamily, context);
      if (!textNode) return null;
      const wrapper = figma.createFrame();
      wrapper.name = node.name || node.tag || "Text";
      wrapper.fills = [];
      wrapper.strokes = [];
      wrapper.resize(
        Math.max(node.width || 1, 1),
        Math.max(node.height || 1, 1),
      );
      wrapper.appendChild(textNode);
      textNode.x = node.padding!.left || 0;
      textNode.y = node.padding!.top || 0;
      return wrapper;
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
      return await createRealImage(
        node,
        context.assetsMap.get(node.imageUrl)!,
        context
      );
    }

    // SVG markup → Figma Vector (when realAssets mode)
    // css-converter stores SVG markup in computedStyles.svgMarkup
    const svgMarkup = node.computedStyles?.svgMarkup;
    if (context.assetMode === "realAssets" && svgMarkup) {
      return await createRealImage(node, svgMarkup, context);
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
  frame.fills = []; // Clear Figma default white fill — only explicit fills should be applied
  frame.name = node.name || "Container";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout: global autoLayout mode OR node has its own layout (e.g. card with VERTICAL)
  const useAutoLayout = shouldUseAutoLayout(context.layoutMode, node.layoutMode);
  const isGrid = node.layoutMode === "GRID" && context.layoutMode !== "absolute";

  let gridApplied = false;
  if (isGrid) {
    // === CSS GRID LAYOUT → Figma Grid ===
    try {
      // Phase 3: try to link a shared GridStyle before applying inline grid.
      // A linked GridStyle governs the full grid config (columns, gaps,
      // alignment), so inline setters in applyGridLayout would be overridden.
      const linkedGrid =
        context.variableMode === "styles"
          ? await linkGridStyleIfAvailable(frame, context, node)
          : false;
      if (linkedGrid) {
        // Still mark layoutMode=GRID so child placement works. Other
        // grid-specific setters (sizes, gap, padding offsets) live inside
        // applyGridLayout; the style already holds the column/gap values.
        (frame as unknown as Record<string, unknown>).layoutMode = "GRID";
        frame.layoutSizingHorizontal = "FIXED";
        frame.layoutSizingVertical = "FIXED";
        gridApplied = true;
      } else {
        applyGridLayout(frame, node);
        gridApplied = true;
      }
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
      frame.paddingTop = Math.max(0, node.padding.top || 0);
      frame.paddingRight = Math.max(0, node.padding.right || 0);
      frame.paddingBottom = Math.max(0, node.padding.bottom || 0);
      frame.paddingLeft = Math.max(0, node.padding.left || 0);
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
      await linkFillStyleIfAvailable(frame, context, node.fills);
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
      await linkFillStyleIfAvailable(frame, context);
    } else if (node.backgroundColor) {
      await applyFillToFrame(
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
    await applyFillToFrame(
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
    const { paints, weight, individualWeights, style } = convertStrokesToFigma(
      node.strokes,
      context,
    );
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      if (individualWeights) {
        // Per-side borders (e.g. border-bottom only) via IndividualStrokesMixin.
        frame.strokeTopWeight = individualWeights.top;
        frame.strokeRightWeight = individualWeights.right;
        frame.strokeBottomWeight = individualWeights.bottom;
        frame.strokeLeftWeight = individualWeights.left;
      }
      if (style === "DASHED") frame.dashPattern = [6, 4];
      else if (style === "DOTTED") frame.dashPattern = [2, 2];
      else frame.dashPattern = [];
      await linkStrokeStyleIfAvailable(frame, context, node.strokes);
    }
  }
  // LEGACY: Fallback to old borderColor/borderWidth fields
  else if (node.borderWidth > 0 && node.borderColor) {
    await applyStrokeToFrame(frame, node.borderColor, node.borderWidth, context);
  }

  // Apply effects from Figma-ready array
  if (node.effects && node.effects.length > 0) {
    // Try to link a shared EffectStyle first (Phase 2). Setting effectStyleId
    // and frame.effects simultaneously detaches the link, so we skip the
    // inline assignment when linking succeeds.
    const linked =
      context.variableMode === "styles"
        ? await linkEffectStyleIfAvailable(frame, context, node.effects)
        : false;
    if (!linked) {
      const figmaEffects = convertEffectsToFigma(node.effects, context);
      if (figmaEffects.length > 0) {
        frame.effects = figmaEffects;
      }
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
  if (context.colorMode !== "plugin" && typeof node.opacity === 'number' && node.opacity < 1 && node.opacity > 0) {
    frame.opacity = Math.max(0, Math.min(1, node.opacity));
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

  // FIX 4: tag frames that have their own hover diff via pluginData.
  // This survives Figma's `clone()` when creating variant components, so
  // `createPseudoStateVariants` can re-apply these diffs to each cloned
  // descendant (enabling parent-hover → child-visibility propagation).
  if (
    context.interactionMode === "variants" &&
    node.pseudoStateStyles?.hover &&
    Object.keys(node.pseudoStateStyles.hover).length > 0
  ) {
    try {
      frame.setPluginData(
        "w2w_hover_diff",
        JSON.stringify(node.pseudoStateStyles.hover),
      );
    } catch {
      // setPluginData may not be available in some mock environments
    }
  }

  // Hidden in default state (for interaction variant rendering)
  // Element exists in tree but is not visible — ready for component hover variant
  if (node.isHiddenInDefault) {
    frame.visible = false;
  }

  // Mark position:fixed AND position:sticky frames so createWireframeFrame can
  // re-parent them to the root frame and set numberOfFixedChildren (Figma's
  // scroll behavior). Sticky elements behave like fixed once scrolled past
  // their threshold — modern sites (web2wireframe.design, stripe.com, etc.)
  // use `position: sticky` for headers instead of `position: fixed`.
  // Skip hidden overlays (e.g. globalnav-curtain: opacity:0, visibility:hidden)
  // — these are hover-reveal elements that should NOT be promoted to fixed.
  if (
    (node.position === "fixed" || node.position === "sticky") &&
    !node.isHiddenInDefault
  ) {
    const isZeroOpacity = typeof node.opacity === "number" && node.opacity === 0;
    if (!isZeroOpacity) {
      try {
        frame.setPluginData("w2w_position_fixed", "1");
        // FIX D: save the CSS top/left values so the re-parenting logic can
        // place the element at its intended viewport offset (y=0 for
        // `top: 0px`, y=10 for `top: 10px`, etc.), instead of the DOM
        // flow coordinate which can be arbitrary for nested sticky headers.
        if (typeof node.cssTop === "number" && !isNaN(node.cssTop)) {
          frame.setPluginData("w2w_css_top", String(node.cssTop));
        }
        if (typeof node.cssLeft === "number" && !isNaN(node.cssLeft)) {
          frame.setPluginData("w2w_css_left", String(node.cssLeft));
        }
      } catch {
        // setPluginData may not be available in mock environments
      }
    }
  }

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
    const gridSorted = gridApplied
      ? sortGridChildren(node.children, node.gridAutoFlow)
      : node.children;

    // Sort flex children by CSS order property (visual reordering)
    const orderSorted = sortByFlexOrder(gridSorted, node.layoutMode);

    // Sort for correct stacking (bg images to front; z-index only in absolute mode)
    const childrenToRender = sortChildrenForStacking(orderSorted, node.layoutMode);

    // Grid: build the linear append sequence with `null` spacer cells so that
    // children with an explicit grid-column/grid-row land in the right cell
    // (Figma's grid anchor index is read-only — see planGridSlots).
    let renderList: (WireframeNode | null)[] = childrenToRender;
    if (gridApplied) {
      const gridColumnCount =
        parseGridTemplate(node.gridTemplateColumns || "").length || 1;
      renderList = planGridSlots(childrenToRender, gridColumnCount, node.gridAutoFlow);
      // Spacers can push content past the row count computed in applyGridLayout
      // (which only counted real children) — grow it so cells aren't clipped.
      const neededRows = Math.ceil(renderList.length / gridColumnCount);
      const gridFrame = frame as unknown as { gridRowCount?: number };
      if (typeof gridFrame.gridRowCount === "number" && gridFrame.gridRowCount < neededRows) {
        try { gridFrame.gridRowCount = neededRows; } catch { /* Grid API */ }
      }
    }

    for (const entry of renderList) {
      try {
        if (entry === null) {
          // Empty spacer cell (grid only) — invisible frame occupying one grid
          // cell so the following child is auto-placed into its intended cell.
          const spacer = figma.createFrame();
          spacer.name = "grid-spacer";
          spacer.fills = [];
          spacer.resize(1, 1);
          frame.appendChild(spacer);
          continue;
        }
        const child = entry;

        const childNode = await createNodeInFigma(child, childContext, depth + 1);

        if (childNode) {
          if (gridApplied) {
            // Grid: append child and set spans (wrapped in try-catch for Figma API Symbol proxies)
            frame.appendChild(childNode);
            // Narrowed view of the Grid Auto Layout API surface — these properties
            // are newer Figma additions and not fully represented in @figma/plugin-typings.
            // Keeping the extension type local avoids leaking `any` / record casts.
            const gridChild = childNode as SceneNode & {
              gridColumnSpan?: number;
              gridRowSpan?: number;
              gridChildVerticalAlign?: "MIN" | "CENTER" | "MAX" | "STRETCH";
              gridChildHorizontalAlign?: "MIN" | "CENTER" | "MAX" | "STRETCH";
            };
            try {
              const colSpan = getGridSpanFromNode(child.gridColumnStart, child.gridColumnEnd);
              const rowSpan = getGridSpanFromNode(child.gridRowStart, child.gridRowEnd);
              if (typeof colSpan === 'number' && colSpan > 1) {
                gridChild.gridColumnSpan = colSpan;
              }
              if (typeof rowSpan === 'number' && rowSpan > 1) {
                gridChild.gridRowSpan = rowSpan;
              }
              // Apply grid cell alignment from parent's CSS
              const vertAlign = cssAlignToGridChild(node.alignItems);
              if (vertAlign !== "STRETCH") {
                gridChild.gridChildVerticalAlign = vertAlign;
              }
              // Horizontal cell alignment from CSS justify-items
              const horizAlign = cssJustifyToGridChild(node.justifyContent);
              if (horizAlign !== "STRETCH") {
                gridChild.gridChildHorizontalAlign = horizAlign;
              }
            } catch (err) {
              // Grid span/alignment uses Symbol proxies — log so regressions are visible.
              logger.warn("Grid cell properties skipped", {
                nodeName: child.name,
                error: err instanceof Error ? err.message : String(err),
              });
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
            applyStaticRotation(childNode, child, childNode.x, childNode.y);
          }
        }
      } catch (err) {
        logger.error("Error creating child node", err, {
          childId: entry?.id,
          childName: entry?.name,
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

      // Set fontName BEFORE characters — createText() defaults to "Inter Regular",
      // but we loaded context.fontFamily. Must switch font first to avoid unloaded font error.
      textNode.fontName = { family: context.fontFamily, style: "Regular" };
      textNode.characters = node.textContent;
      textNode.name = node.textContent.substring(0, 20);
      textNode.fontSize = node.fontSize || 16;

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
            await textNode.setFillStyleIdAsync(linkedStyle.id);
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

      // Apply text decoration from computedStyles
      const rawTextDeco = node.computedStyles?.["text-decoration"] ||
                          node.computedStyles?.["text-decoration-line"] || "";
      if (rawTextDeco.includes("underline")) {
        textNode.textDecoration = "UNDERLINE";
      } else if (rawTextDeco.includes("line-through")) {
        textNode.textDecoration = "STRIKETHROUGH";
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

  // Pseudo-state variants: convert to ComponentSet if enabled.
  // FIX 4: also trigger when descendants carry their own hover diffs, even
  // if the current node's own diff is empty (parent-hover → child case).
  const hasOwnPseudoStates =
    node.pseudoStateStyles !== undefined &&
    Object.keys(node.pseudoStateStyles).length > 0;

  // FIX B: `hasDescendantHover` is set on WireframeNodes whose descendants
  // carry pseudoStateStyles. But by the time WE process this parent, those
  // descendants have ALREADY become variant components and been replaced
  // with InstanceNodes in our subtree — so `detectDescendantHoverDiffs`
  // won't find any `w2w_hover_diff` pluginData here. If the flag is true
  // but the Figma subtree has no live tags, skip variant creation entirely.
  // Without this, parent variant creation throws "No active pseudo-states".
  let hasLiveDescendantDiffs = false;
  if (
    context.interactionMode === "variants" &&
    !hasOwnPseudoStates &&
    node.hasDescendantHover === true
  ) {
    const { detectLiveDescendantHoverDiffs } = await import("./pseudoStates");
    hasLiveDescendantDiffs = detectLiveDescendantHoverDiffs(frame);
  }
  const shouldCreateVariants =
    context.interactionMode === "variants" &&
    (hasOwnPseudoStates || hasLiveDescendantDiffs);

  if (shouldCreateVariants) {
    // PASS 2 — h2d-aligned path. If Pass 1 built a master ComponentSet for
    // this node's (childrenStructure, visualSig) bucket, we create an
    // instance of it here instead of minting a fresh ComponentSet.
    if (hasOwnPseudoStates && context.hoverMasterRegistry) {
      try {
        const { lookupHoverMaster } = await import("./hoverConsolidation");
        const lookup = lookupHoverMaster(node, context.hoverMasterRegistry);
        if (lookup) {
          // Phase C (h2d-parity): no-space variant naming.
          const wantedName = `variant=${lookup.variantIndex},:hover=false`;
          const master = (lookup.entry.componentSet.children as SceneNode[]).find(
            (c) => c.type === "COMPONENT" && c.name === wantedName,
          ) as ComponentNode | undefined;
          if (master) {
            const instance = master.createInstance();
            instance.resize(frame.width, frame.height);
            const parent = frame.parent as (BaseNode & ChildrenMixin) | null;
            if (parent) parent.appendChild(instance);
            try { frame.remove(); } catch { /* non-fatal */ }

            // Set variant property (no-op if unsupported by the mock).
            try {
              const setProps = (instance as unknown as {
                setProperties?: (p: Record<string, string | boolean>) => void;
              }).setProperties;
              if (typeof setProps === "function") {
                setProps.call(instance, { variant: String(lookup.variantIndex) });
              }
            } catch { /* non-fatal */ }

            // Override TEXT properties with this node's actual text values.
            for (let i = 0; i < lookup.entry.textPropIds.length; i++) {
              const propId = lookup.entry.textPropIds[i];
              const value = lookup.textValues[i];
              if (value === undefined) continue;
              try {
                const setProps = (instance as unknown as {
                  setProperties?: (p: Record<string, string | boolean>) => void;
                }).setProperties;
                if (typeof setProps === "function") {
                  setProps.call(instance, { [propId]: value });
                }
              } catch { /* non-fatal */ }
            }

            if (context.renderStats) context.renderStats.hoverCacheHits += 1;
            return instance;
          }
        }
      } catch (err) {
        logger.warn("Hover registry lookup failed — falling back to inline variants", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback: inline per-element ComponentSet creation (content-signature
    // dedup via hoverComponentCache). Used for nodes not in the registry.
    try {
      const { createPseudoStateVariants } = await import("./pseudoStates");
      // If self diff is empty, pass a synthetic hover state so the
      // ComponentSet still creates a Hover variant for descendant diffs.
      const pseudoStatesToUse = hasOwnPseudoStates
        ? node.pseudoStateStyles!
        : { hover: {} }; // empty self diff, descendant diffs applied via pluginData
      const { componentSet, defaultInstance, cacheHit } =
        await createPseudoStateVariants(
          frame,
          pseudoStatesToUse,
          context.hoverComponentCache,
        );
      // On cache hit the ComponentSet is already in the Components section
      // from the first occurrence — don't push it again.
      if (cacheHit) {
        if (context.renderStats) context.renderStats.hoverCacheHits += 1;
      } else {
        if (context.renderStats) context.renderStats.hoverCacheMisses += 1;
        context.componentSets?.push(componentSet);
      }
      return defaultInstance;
    } catch (err) {
      if (context.renderStats) context.renderStats.pseudoErrors += 1;
      logger.error("Pseudo-state variant creation failed", err);
    }
  }

  // Batch 3 (h2d-parity): element is clickable but has no hover variant
  // (either no captured diff or only a trivial one — e.g. apple .tile-link
  // where hovering only changes cursor). Attach a self-referencing ON_HOVER
  // reaction so Figma Preview shows cursor:pointer without creating a ghost
  // ComponentSet. The "CHANGE_TO self" action is a visual no-op.
  if (node.needsCursorPointer && frame.type === "FRAME") {
    try {
      const reactions = [
        {
          trigger: { type: "ON_HOVER" },
          actions: [
            {
              type: "NODE",
              destinationId: frame.id,
              navigation: "CHANGE_TO",
              transition: null,
              preserveScrollPosition: false,
            },
          ],
        },
      ] as unknown as Reaction[];
      if (typeof (frame as unknown as { setReactionsAsync?: (r: Reaction[]) => Promise<void> })
        .setReactionsAsync === "function") {
        await (frame as unknown as { setReactionsAsync: (r: Reaction[]) => Promise<void> })
          .setReactionsAsync(reactions);
      } else {
        (frame as unknown as { reactions: Reaction[] }).reactions = reactions;
      }
    } catch {
      // Non-fatal — cursor:pointer is a nice-to-have, never block render.
    }
  }

  return frame;
}

// ============================================================================
// Static rotation placement
// ============================================================================

/**
 * Recover a rotated element's Figma placement from its captured AABB.
 *
 * getBoundingClientRect returns the axis-aligned bounding box of the rotated
 * element, so (aabbW, aabbH) are the projected dimensions. Solving
 *   W = w·|cos θ| + h·|sin θ|
 *   H = w·|sin θ| + h·|cos θ|
 * gives back the unrotated (w, h). The returned x/y position the node's
 * origin so the rotated node's bounding box lands exactly on the captured
 * AABB. figmaRotation is negated (CSS rotates clockwise, Figma's `rotation`
 * property is counter-clockwise).
 *
 * Returns null near the degenerate 45° case (the system is unsolvable) and
 * for non-positive results — callers keep the upright AABB rendering then.
 */
export function computeRotatedPlacement(
  aabbX: number,
  aabbY: number,
  aabbW: number,
  aabbH: number,
  cssDeg: number,
): { x: number; y: number; width: number; height: number; figmaRotation: number } | null {
  const t = (cssDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  const det = c * c - s * s; // cos(2θ)
  if (Math.abs(det) < 0.1) return null;

  const width = (aabbW * c - aabbH * s) / det;
  const height = (aabbH * c - aabbW * s) / det;
  if (!isFinite(width) || !isFinite(height) || width < 1 || height < 1) return null;

  // Corner offsets of the rotated box relative to its origin (y-down coords,
  // clockwise rotation matrix [cos -sin; sin cos]).
  const xs = [0, width * cos, -height * sin, width * cos - height * sin];
  const ys = [0, width * sin, height * cos, width * sin + height * cos];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return {
    x: aabbX - minX,
    y: aabbY - minY,
    width,
    height,
    figmaRotation: -cssDeg,
  };
}

/**
 * Apply a WireframeNode's static CSS rotation to an already-positioned Figma
 * node. No-ops when the node has no rotation or the geometry is degenerate.
 * `baseX`/`baseY` are the coordinates where the AABB was placed.
 */
function applyStaticRotation(
  childNode: SceneNode,
  child: WireframeNode,
  baseX: number,
  baseY: number,
): void {
  if (typeof child.rotation !== 'number') return;
  const placement = computeRotatedPlacement(baseX, baseY, child.width, child.height, child.rotation);
  if (!placement) return;
  try {
    if ('resize' in childNode) {
      (childNode as FrameNode).resize(Math.max(placement.width, 1), Math.max(placement.height, 1));
    }
    (childNode as FrameNode).rotation = placement.figmaRotation;
    childNode.x = placement.x;
    childNode.y = placement.y;
  } catch {
    // Rotation is best-effort — never break the render for it.
  }
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
    applyStaticRotation(childNode, child, child.x, child.y);
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

  // Apply CSS max-width as Figma native maxWidth.
  // Enforces the CSS constraint regardless of downstream FILL/HUG decisions
  // (e.g. createMarginWrapper forces TEXT children to FILL, which would
  // otherwise stretch a max-width:265px paragraph to its parent's 635px).
  if (typeof child.cssMaxWidth === "number" && child.cssMaxWidth > 0) {
    const wrapperMaxW = child.cssMaxWidth
      + (child.margin?.left || 0)
      + (child.margin?.right || 0);
    if (wrapper && "maxWidth" in wrapper) {
      wrapper.maxWidth = wrapperMaxW;
    }
    if ("maxWidth" in childNode) {
      (childNode as FrameNode | TextNode).maxWidth = child.cssMaxWidth;
    }
  }

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
        // Multi-line text with explicit FIXED sizing (e.g., max-width) keeps FIXED.
        const isFixedWidthW = child.layoutSizingHorizontal === "FIXED";
        if (isHorizontalLayout) {
          if (!isFixedWidthW && (child.layoutSizingHorizontal === "FILL" || isMultiLine)) {
            wrapper.layoutSizingHorizontal = "FILL";
          }
          if (child.layoutAlign === "STRETCH" || child.layoutSizingVertical === "FILL") {
            wrapper.layoutSizingVertical = "FILL";
          }
        } else {
          if (child.layoutSizingVertical === "FILL") {
            wrapper.layoutSizingVertical = "FILL";
          }
          if (!isFixedWidthW && (child.layoutAlign === "STRETCH" || child.layoutSizingHorizontal === "FILL" || isMultiLine)) {
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
      // Multi-line text with explicit FIXED sizing (e.g., max-width constraint)
      // should keep FIXED width but use HEIGHT auto-resize for wrapping.
      const isFixedWidth = child.layoutSizingHorizontal === "FIXED";
      if (isHorizontalLayout) {
        if (isFixedWidth && isMultiLine) {
          textChild.layoutSizingHorizontal = "FIXED";
          textChild.textAutoResize = "HEIGHT";
        } else if (child.layoutSizingHorizontal === "FILL" || isMultiLine) {
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
        if (isFixedWidth && isMultiLine) {
          textChild.layoutSizingHorizontal = "FIXED";
          textChild.textAutoResize = "HEIGHT";
        } else if (child.layoutAlign === "STRETCH" || child.layoutSizingHorizontal === "FILL" || isMultiLine) {
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
 * Recursively collect position:fixed nodes from any depth in the tree.
 * These nodes are marked with pluginData "w2w_position_fixed" during
 * createNodeInFigma and need to be re-parented to the root wireframe frame.
 */
/**
 * FIX E — insert a transparent same-size spacer at the sticky/fixed node's
 * original flow position BEFORE we re-parent it to the root. This keeps the
 * layout flow intact: siblings below don't collapse upward and visually
 * overlap the now-fixed header. The spacer:
 *   - has identical name + width + height
 *   - has no fills / strokes / effects (invisible but occupies layout)
 *   - is marked with pluginData `w2w_sticky_spacer` = "1"
 *   - is inserted in vertical/absolute parents only (horizontal/grid parents
 *     would push unrelated siblings sideways — skip those edge cases).
 */
export function insertFixedSpacer(fn: FrameNode): void {
  try {
    const originalParent = fn.parent;
    if (!originalParent || !("insertChild" in originalParent)) return;
    if (!("children" in originalParent)) return;

    const parentChildren = (originalParent as FrameNode).children;
    const originalIndex = parentChildren.indexOf(fn);
    if (originalIndex < 0) return;

    const parentLayoutMode: string =
      "layoutMode" in originalParent
        ? String((originalParent as FrameNode).layoutMode)
        : "NONE";

    // Skip horizontal / grid parents — a same-height spacer would shift
    // unrelated siblings in an unhelpful direction.
    if (
      parentLayoutMode !== "NONE" &&
      parentLayoutMode !== "VERTICAL"
    ) {
      return;
    }

    const spacer = figma.createFrame();
    spacer.name = fn.name;
    spacer.fills = [];
    spacer.strokes = [];
    if ("effects" in spacer) {
      spacer.effects = [];
    }
    spacer.resize(Math.max(1, fn.width), Math.max(1, fn.height));

    // Absolute parent → preserve exact x/y; auto-layout parent → let layout
    // engine place the spacer (size matches original, stretch horizontally
    // if the original did).
    if (parentLayoutMode === "NONE") {
      spacer.x = fn.x;
      spacer.y = fn.y;
    } else {
      try {
        // Mirror the original's horizontal sizing (common case: FILL for
        // full-width headers) so the spacer spans the same slot.
        if ("layoutSizingHorizontal" in fn && "layoutSizingHorizontal" in spacer) {
          spacer.layoutSizingHorizontal = fn.layoutSizingHorizontal;
        }
        if ("layoutSizingVertical" in spacer) {
          spacer.layoutSizingVertical = "FIXED";
        }
      } catch {
        // Some size modes aren't settable on empty frames; ignore.
      }
    }

    spacer.setPluginData("w2w_sticky_spacer", "1");
    (originalParent as FrameNode).insertChild(originalIndex, spacer);
  } catch (err) {
    logger.warn("Failed to insert sticky spacer", { error: err });
  }
}

function collectFixedNodes(root: FrameNode): SceneNode[] {
  const result: SceneNode[] = [];

  function walk(node: SceneNode): void {
    if ("getPluginData" in node) {
      try {
        if (node.getPluginData("w2w_position_fixed") === "1") {
          // Skip hidden fixed elements (e.g. globalnav-curtain with
          // visibility:hidden / opacity:0). These are hover-reveal overlays
          // that shouldn't be promoted to root-level fixed children.
          if (node.visible !== false) {
            result.push(node);
          }
          return; // Don't recurse into fixed nodes either way
        }
      } catch {
        // getPluginData may fail in some environments
      }
    }
    if ("children" in node) {
      for (const child of (node as FrameNode).children) {
        walk(child);
      }
    }
  }

  for (const child of root.children) {
    walk(child);
  }

  return result;
}

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

  // Extract hostname for naming — `extractHostname` is a regex-based
  // parser that works in the Figma plugin sandbox (where `new URL(...)`
  // is unreliable and previously threw silently, leaving hostname as
  // the "website" fallback even for valid URLs like
  // `https://www.web2wireframe.design/pricing`).
  const hostname = extractHostname(sourceUrl);

  // Naming pattern: "{hostname} - wireframe ({width}px)"
  // (e.g. "apple.com - wireframe (1440px)"). Puts the site first so multi-site
  // wireframes sort alphabetically per site in the Figma layers panel.
  wireframeFrame.name = `${hostname} - wireframe (${frameData.viewportWidth}px)`;
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
        await wireframeFrame.setFillStyleIdAsync(linkedStyle.id);
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
        await linkFillStyleIfAvailable(wireframeFrame, context, frameData.tree.fills);
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

  // Root wireframe frame always clips — it's a visual container in Figma,
  // CSS overflow semantics are irrelevant at the root level.
  wireframeFrame.clipsContent = true;

  // Enable vertical scrolling on root frame so that position:fixed children
  // can be marked as "Fixed (stay in place)" via numberOfFixedChildren.
  wireframeFrame.overflowDirection = "VERTICAL";

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
      wireframeFrame.paddingTop = Math.max(0, rootTree.padding.top || 0);
      wireframeFrame.paddingRight = Math.max(0, rootTree.padding.right || 0);
      wireframeFrame.paddingBottom = Math.max(0, rootTree.padding.bottom || 0);
      wireframeFrame.paddingLeft = Math.max(0, rootTree.padding.left || 0);
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
            applyStaticRotation(childNode, child, childNode.x, childNode.y);
          }
        }
      } catch (err) {
        logger.error("Error creating top-level node", err, {
          childId: child.id,
          childName: child.name,
        });
      }
    }

    // Re-parent position:fixed elements to the root frame.
    // Fixed elements (like nav#globalnav) can be nested at ANY depth in the
    // DOM tree, but Figma requires them as the LAST N direct children of the
    // scrolling frame, with numberOfFixedChildren = N.
    // We find them via pluginData marker set during createNodeInFigma.
    const fixedNodes = collectFixedNodes(wireframeFrame);
    if (fixedNodes.length > 0) {
      for (const fixedNode of fixedNodes) {
        // FIX E: BEFORE we move the fixed node out to the root, drop a
        // same-size transparent "spacer" frame in its original flow slot.
        // Without this, promoting a sticky header to root collapses the
        // space it used to occupy in the DOM flow — sibling content slides
        // up and visually overlaps the now-fixed header. Mirrors h2d's
        // approach of preserving header height after promotion.
        insertFixedSpacer(fixedNode as FrameNode);

        // appendChild on an already-parented node moves it (re-parents)
        wireframeFrame.appendChild(fixedNode);
        // Set absolute positioning so it overlays at its original x/y.
        // `layoutPositioning = "ABSOLUTE"` is only valid when the parent has
        // auto-layout; in absolute (x/y) mode the root frame's layoutMode is
        // NONE and children already free-position via x/y — Figma throws if
        // we try to set ABSOLUTE on a NONE-parent child.
        if ("layoutPositioning" in fixedNode) {
          if (wireframeFrame.layoutMode !== "NONE") {
            (fixedNode as FrameNode).layoutPositioning = "ABSOLUTE";
          }
          // FIX D: override y/x with the CSS top/left values (captured as
          // pluginData during createNodeInFigma). Nested sticky headers
          // carry the DOM flow y-coord (e.g. 1384px) rather than their
          // pinned viewport position (e.g. 0px). Falling back to 0 gives
          // the expected "stuck to top" visual. The x override preserves
          // horizontal offsets (e.g. `left: 20px` for side-drawers).
          try {
            const topStr = fixedNode.getPluginData("w2w_css_top");
            const leftStr = fixedNode.getPluginData("w2w_css_left");
            const frameNode = fixedNode as FrameNode;
            if (topStr !== "") {
              const topVal = parseFloat(topStr);
              frameNode.y = isNaN(topVal) ? 0 : topVal;
            } else {
              // No explicit CSS top → default to 0 (the expected sticky behavior)
              frameNode.y = 0;
            }
            if (leftStr !== "") {
              const leftVal = parseFloat(leftStr);
              if (!isNaN(leftVal)) frameNode.x = leftVal;
            }
          } catch {
            // getPluginData / coordinate setters may fail in mocks
          }
        }
      }
      wireframeFrame.numberOfFixedChildren = fixedNodes.length;
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

  const explicitRowCount = rowSizes.length;
  const childCount = node.children?.length || 0;
  const implicitRowCount = Math.ceil(childCount / columnCount);
  const rowCount = Math.max(explicitRowCount, implicitRowCount, 1);
  gridFrame.gridRowCount = rowCount;

  // Apply track sizes
  try {
    const gridColSizes = gridFrame.gridColumnSizes;
    if (Array.isArray(gridColSizes)) {
      for (let i = 0; i < columnCount; i++) {
        if (columnSizes[i]) (gridColSizes as FigmaGridTrackSize[])[i] = columnSizes[i];
      }
    }
  } catch { /* Grid API may throw */ }
  try {
    const gridRowSizesArr = gridFrame.gridRowSizes;
    if (Array.isArray(gridRowSizesArr)) {
      for (let i = 0; i < rowCount; i++) {
        if (rowSizes[i]) (gridRowSizesArr as FigmaGridTrackSize[])[i] = rowSizes[i];
      }
    }
  } catch { /* Grid API may throw */ }

  // Apply gaps (guard against Symbol/non-numeric values)
  const colGap = typeof node.gridColumnGap === 'number' ? node.gridColumnGap : 0;
  const rowGap = typeof node.gridRowGap === 'number' ? node.gridRowGap : 0;
  try {
    gridFrame.gridColumnGap = Math.max(colGap, 0);
    gridFrame.gridRowGap = Math.max(rowGap, 0);
  } catch { /* Grid API may throw */ }

  // Container sizing: always FIXED (FLEX tracks + HUG is invalid in Figma)
  frame.layoutSizingHorizontal = "FIXED";
  frame.layoutSizingVertical = "FIXED";

  // Apply padding (clamp to 0 — Figma rejects negative values)
  if (node.padding) {
    frame.paddingTop = Math.max(0, node.padding.top || 0);
    frame.paddingRight = Math.max(0, node.padding.right || 0);
    frame.paddingBottom = Math.max(0, node.padding.bottom || 0);
    frame.paddingLeft = Math.max(0, node.padding.left || 0);
  }

  // Simulate justify-content via horizontal padding offset
  applyGridContentAlignment(frame, node, columnSizes, rowSizes, colGap, rowGap);
}

/**
 * Simulate CSS justify-content and align-content on Figma Grid frames
 * by calculating and applying padding offsets.
 *
 * Figma Grid has no native justify-content/align-content support.
 * When all tracks are FIXED size, we calculate excess space and
 * distribute it as padding (for center/end) or adjusted gaps
 * (for space-between/around/evenly).
 */
function applyGridContentAlignment(
  frame: FrameNode,
  node: WireframeNode,
  columnSizes: FigmaGridTrackSize[],
  rowSizes: FigmaGridTrackSize[],
  colGap: number,
  _rowGap: number
): void {
  const gridFrame = frame as unknown as Record<string, unknown>;

  // ── Horizontal (justify-content) ──
  const jc = node.justifyContent;
  if (jc && jc !== 'start' && jc !== 'flex-start' && jc !== 'normal' && jc !== 'stretch' && jc !== 'left') {
    const allFixed = columnSizes.length > 0 && columnSizes.every(t => t.type === 'FIXED');
    if (allFixed) {
      const totalTracks = columnSizes.reduce((sum, t) => sum + t.value, 0);
      const totalGaps = Math.max(0, columnSizes.length - 1) * colGap;
      const contentWidth = totalTracks + totalGaps;
      const padL = frame.paddingLeft || 0;
      const padR = frame.paddingRight || 0;
      const available = node.width - padL - padR;
      const excess = Math.max(0, available - contentWidth);

      if (excess > 1) {
        distributeExcess(jc, excess, columnSizes.length, colGap, (addL, addR, newGap) => {
          frame.paddingLeft = padL + addL;
          frame.paddingRight = padR + addR;
          if (newGap !== undefined) {
            try { gridFrame.gridColumnGap = newGap; } catch { /* Grid API */ }
          }
        });
      }
    }
  }

  // ── Vertical (align-content) — future-proof, same logic for rows ──
  // Currently align-content is not separately extracted, but if it becomes
  // available on node, the same pattern applies with rowSizes + paddingTop/Bottom.
}

/**
 * Distribute excess space according to CSS alignment value.
 * Used to simulate justify-content/align-content on Figma Grid.
 *
 * @param alignment - CSS justify-content/align-content value
 * @param excess - available excess space in pixels
 * @param trackCount - number of grid tracks
 * @param currentGap - current gap between tracks
 * @param apply - callback to apply padding/gap adjustments
 */
export function distributeExcess(
  alignment: string,
  excess: number,
  trackCount: number,
  currentGap: number,
  apply: (addLeft: number, addRight: number, newGap?: number) => void
): void {
  switch (alignment) {
    case 'center':
      apply(excess / 2, excess / 2);
      break;
    case 'end':
    case 'flex-end':
    case 'right':
      apply(excess, 0);
      break;
    case 'space-between':
      if (trackCount > 1) {
        apply(0, 0, currentGap + excess / (trackCount - 1));
      }
      break;
    case 'space-around':
      if (trackCount > 0) {
        const perTrack = excess / trackCount;
        apply(perTrack / 2, perTrack / 2, currentGap + perTrack);
      }
      break;
    case 'space-evenly':
      if (trackCount > 0) {
        const perSlot = excess / (trackCount + 1);
        apply(perSlot, perSlot, currentGap + perSlot);
      }
      break;
    default:
      // start, normal, stretch, left, flex-start — no change
      break;
  }
}

/**
 * Sort grid children by their grid position for correct Figma auto-placement.
 * Figma's gridColumnAnchorIndex is read-only, so children must be appended in order.
 */
export function sortGridChildren(
  children: WireframeNode[],
  gridAutoFlow?: string
): WireframeNode[] {
  return [...children].sort((a, b) => {
    const aHasRow = typeof a.gridRowStart === 'number';
    const bHasRow = typeof b.gridRowStart === 'number';
    const aRow = typeof a.gridRowStart === 'number' ? a.gridRowStart : Infinity;
    const aCol = typeof a.gridColumnStart === 'number' ? a.gridColumnStart : Infinity;
    const bRow = typeof b.gridRowStart === 'number' ? b.gridRowStart : Infinity;
    const bCol = typeof b.gridColumnStart === 'number' ? b.gridColumnStart : Infinity;

    // When both children have no explicit/inferred row, preserve
    // DOM order instead of re-sorting by column. CSS grid auto-placement is
    // DOM-order driven in this situation; column-only sorting was the source of
    // left,left,left,right,right,right corruption on auto-placed grids.
    if (!aHasRow && !bHasRow) {
      return 0;
    }

    if (gridAutoFlow?.includes("column")) {
      // Column flow: sort by column first, then row
      return aCol - bCol || aRow - bRow;
    }
    // Row flow (default): sort by row first, then column
    return aRow - bRow || aCol - bCol;
  });
}

/**
 * Build the linear append sequence for a Figma grid, inserting `null` spacer
 * markers so children with an explicit CSS `grid-column` / `grid-row` land in
 * the correct cell.
 *
 * Figma's grid anchor index (gridColumnAnchorIndex) is read-only, so children
 * are auto-placed sequentially in append order. To honor a definite grid line
 * we push empty spacer cells ahead of the positioned child, which shifts it
 * into its target cell — the fix for centering grids like paco.me
 * (`grid-template-columns: 192px 640px 192px`, article on `grid-column: 2`).
 *
 * Children must already be sorted by grid position (see sortGridChildren).
 * Each returned entry is either a child node (one append) or `null` (render an
 * empty placeholder cell). A child's column span is honored: it occupies
 * `span` cells but is a single append, so no spacers are emitted for the cells
 * it covers.
 */
export function planGridSlots(
  children: WireframeNode[],
  columnCount: number,
  gridAutoFlow?: string
): (WireframeNode | null)[] {
  const cols = Math.max(1, columnCount);
  const columnFlow = !!gridAutoFlow && gridAutoFlow.includes("column");
  const slots: (WireframeNode | null)[] = [];
  let cellCursor = 0; // next free linear cell index (0-based, row-major)

  for (const child of children) {
    const colStart =
      typeof child.gridColumnStart === "number" ? child.gridColumnStart : undefined;
    const rowStart =
      typeof child.gridRowStart === "number" ? child.gridRowStart : undefined;

    let target = cellCursor;
    if (colStart && colStart >= 1) {
      const targetCol = colStart - 1; // 0-based column
      if (rowStart && rowStart >= 1) {
        // Definite row + column → exact linear cell index.
        target = (rowStart - 1) * cols + targetCol;
      } else if (!columnFlow) {
        // Row flow, column-only: first cell at/after the cursor in that column
        // (wraps to the next row when the column is behind the cursor).
        target = cellCursor;
        while (target % cols !== targetCol) target++;
      }
    }

    if (target < cellCursor) target = cellCursor; // overlap guard — never go back

    for (let i = cellCursor; i < target; i++) slots.push(null);
    slots.push(child);

    const span = Math.max(
      1,
      getGridSpanFromNode(child.gridColumnStart, child.gridColumnEnd)
    );
    cellCursor = target + span;
  }

  return slots;
}

/**
 * Check if a WireframeNode subtree contains only images/placeholders
 * and no meaningful text. Used to detect background image containers.
 */
function isImageOnlySubtreeW(node: WireframeNode): boolean {
  if (node.isPlaceholder || node.type === "placeholder") return true;
  if (node.type === "text") return false;
  if (node.textContent?.trim()) return false;
  if (!node.children || node.children.length === 0) {
    return node.fills?.some(f => f.type === "IMAGE_PLACEHOLDER") ?? false;
  }
  return node.children.every(c => isImageOnlySubtreeW(c));
}

/**
 * Sort flex children by CSS `order` property for correct visual ordering.
 * Only applies to flex containers (HORIZONTAL/VERTICAL).
 * Stable sort: preserves DOM order for children with equal order values.
 * Default order value is 0 (elements without cssOrder are treated as 0).
 */
export function sortByFlexOrder(
  children: WireframeNode[],
  layoutMode: WireframeNode["layoutMode"] = "NONE"
): WireframeNode[] {
  // Only applies to flex containers, not grid or absolute
  if (layoutMode !== "HORIZONTAL" && layoutMode !== "VERTICAL") return children;
  if (children.length < 2) return children;
  const hasOrder = children.some(c => c.cssOrder != null);
  if (!hasOrder) return children;

  const stable = children.map((c, i) => ({ c, i }));
  stable.sort((a, b) => {
    const oa = a.c.cssOrder ?? 0;
    const ob = b.c.cssOrder ?? 0;
    return oa !== ob ? oa - ob : a.i - b.i;
  });
  return stable.map(s => s.c);
}

/**
 * Sort children for correct visual stacking in Figma:
 * 1. Move abs-positioned image-only containers to front (behind = background)
 * 2. Sort by z-index ONLY in absolute mode (layoutMode=NONE) — in auto-layout,
 *    z-index sorting would break DOM flow order (e.g., buttons above text)
 *
 * @param parentLayoutMode - parent's layoutMode ("NONE" for absolute, "VERTICAL"/"HORIZONTAL"/"GRID" for auto-layout)
 */
export function sortChildrenForStacking(
  children: WireframeNode[],
  parentLayoutMode: WireframeNode["layoutMode"] = "NONE"
): WireframeNode[] {
  if (children.length < 2) return children;

  // Step 1: Move abs-positioned image-only containers to front (background layer).
  // Safe in any layout mode because abs elements are out of normal flow.
  const bgImages: WireframeNode[] = [];
  const rest: WireframeNode[] = [];
  let hasBgImages = false;
  for (const child of children) {
    if (child.position === "absolute" && isImageOnlySubtreeW(child)) {
      bgImages.push(child);
      hasBgImages = true;
    } else {
      rest.push(child);
    }
  }

  const result = hasBgImages && rest.length > 0
    ? [...bgImages, ...rest]
    : children;

  // Step 2: Z-index sort — ONLY in absolute positioning mode.
  // In auto-layout (VERTICAL/HORIZONTAL/GRID), z-index affects visual stacking
  // but NOT layout flow. Reordering would break DOM order (e.g., buttons above text).
  if (parentLayoutMode !== "NONE") return result;

  const hasZIndex = result.some(c => c.zIndex != null);
  if (!hasZIndex) return result;

  const stable = result.map((c, i) => ({ c, i }));
  stable.sort((a, b) => {
    const za = a.c.zIndex ?? 0;
    const zb = b.c.zIndex ?? 0;
    return za !== zb ? za - zb : a.i - b.i;
  });
  return stable.map(s => s.c);
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
