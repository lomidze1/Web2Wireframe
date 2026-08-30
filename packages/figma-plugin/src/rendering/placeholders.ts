/**
 * Image placeholder creation for Figma
 * Creates placeholder frames with icon for images/videos
 */

import type { WireframeNode, RenderContext } from "../types";
import { hexToFigmaRGB, normalizeColorForLookup } from "./colors";
import { applyCornerRadii } from "./layout";
import * as perf from "../utils/perf";

// ============================================================================
// Placeholder Icon
// ============================================================================

/**
 * Create modern image placeholder icon
 * Matches the SVG design with mountain, sun, and clean border
 */
export async function createImagePlaceholderIcon(
  size: number,
  borderColor: RGB,
  iconColorHex: string,
  context: RenderContext
): Promise<FrameNode> {
  const iconFrame = figma.createFrame();
  iconFrame.name = "Image Icon";
  iconFrame.resize(size, size);
  iconFrame.fills = [];

  const iconColor = borderColor;
  const strokeWeight = Math.max(1.5, size / 30);

  // Helper function to link style for shape nodes
  const linkShapeStyle = async (
    node: RectangleNode | EllipseNode | PolygonNode,
    isFill: boolean
  ) => {
    if (context.variableMode !== "styles") return;
    const normalizedColor = normalizeColorForLookup(iconColorHex);
    let linkedStyle = context.colorStyleMap.get(normalizedColor);

    // If no existing style, create one for this plugin-assigned icon color
    if (!linkedStyle && normalizedColor) {
      try {
        // Plugin-generated helper style (not sourced from the website's CSS),
        // so it lives in the "W2W/" group instead of a per-hostname group —
        // keeps it consistent across multi-site wireframes.
        const styleName = "W2W/--image-placeholder-icon";
        const existingStyles = await figma.getLocalPaintStylesAsync();
        const existing = existingStyles.find((s) => s.name === styleName);
        if (existing) {
          existing.paints = [{ type: "SOLID", color: iconColor }];
          linkedStyle = existing;
        } else {
          const style = figma.createPaintStyle();
          style.name = styleName;
          style.paints = [{ type: "SOLID", color: iconColor }];
          linkedStyle = style;
        }
        context.colorStyleMap.set(normalizedColor, linkedStyle);
      } catch {
        // Style creation failed
      }
    }

    if (linkedStyle) {
      if (isFill) {
        await node.setFillStyleIdAsync(linkedStyle.id);
      } else {
        await node.setStrokeStyleIdAsync(linkedStyle.id);
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
  await linkShapeStyle(outerRect, false); // Link stroke style
  iconFrame.appendChild(outerRect);

  // Sun circle (top right area)
  const sunSize = size * 0.12;
  const sun = figma.createEllipse();
  sun.resize(sunSize, sunSize);
  sun.x = outerRect.x + rectWidth * 0.65;
  sun.y = outerRect.y + rectHeight * 0.15;
  sun.fills = [{ type: "SOLID", color: iconColor }];
  sun.strokes = [];
  await linkShapeStyle(sun, true); // Link fill style
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
  await linkShapeStyle(mountain1, true); // Link fill style
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
  await linkShapeStyle(mountain2, true); // Link fill style
  iconFrame.appendChild(mountain2);

  return iconFrame;
}

// ============================================================================
// Placeholder Creation
// ============================================================================

/**
 * Create placeholder for images/videos
 * Uses a clean, modern design with the image icon centered
 */
export async function createPlaceholder(
  node: WireframeNode,
  surfaceColor: string,
  borderColor: string | undefined,
  context: RenderContext
): Promise<FrameNode> {
  if (!__W2W_DEV_LOG__)
    return createPlaceholderInner(node, surfaceColor, borderColor, context);
  return perf.timed("node.placeholder", () =>
    createPlaceholderInner(node, surfaceColor, borderColor, context)
  );
}

async function createPlaceholderInner(
  node: WireframeNode,
  surfaceColor: string,
  borderColor: string | undefined,
  context: RenderContext
): Promise<FrameNode> {
  const placeholder = figma.createFrame();
  placeholder.name = node.name || "Image";
  placeholder.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Explicit layout properties prevent Figma from collapsing dimensions
  // when this placeholder is inside an auto-layout parent.
  // Without these, height collapses to ~lineHeight (e.g. 25.6px instead of 357px).
  placeholder.layoutMode = "VERTICAL";
  placeholder.primaryAxisSizingMode = "FIXED";
  placeholder.counterAxisSizingMode = "FIXED";
  placeholder.primaryAxisAlignItems = "CENTER";
  placeholder.counterAxisAlignItems = "CENTER";

  // Surface background color
  const surfaceRgb = hexToFigmaRGB(surfaceColor);

  // Check if we should link to a style
  let styleLinked = false;
  if (context.variableMode === "styles") {
    const normalizedColor = normalizeColorForLookup(surfaceColor);
    const opacity = context.colorMode === "plugin" ? 1.0 : 0.6;
    // Build opacity-aware paint key (matches how styles are keyed)
    const paintKey =
      opacity >= 0.99
        ? normalizedColor
        : `${normalizedColor}@${Math.round(opacity * 100)}`;

    // Try opacity-aware key first, then full-opacity key
    let linkedStyle =
      context.colorStyleMap.get(paintKey) ||
      context.colorStyleMap.get(normalizedColor);

    // If no existing style, create one for this plugin-assigned placeholder color
    if (!linkedStyle && normalizedColor) {
      try {
        // Plugin-generated helper style — see note at image-placeholder-icon above.
        const styleName = "W2W/--image-placeholder";
        const existingStyles = await figma.getLocalPaintStylesAsync();
        const existing = existingStyles.find((s) => s.name === styleName);
        if (existing) {
          existing.paints = [{ type: "SOLID", color: surfaceRgb, opacity }];
          linkedStyle = existing;
        } else {
          const style = figma.createPaintStyle();
          style.name = styleName;
          style.paints = [{ type: "SOLID", color: surfaceRgb, opacity }];
          linkedStyle = style;
        }
        context.colorStyleMap.set(paintKey, linkedStyle);
      } catch {
        // Style creation failed — fall through to direct color
      }
    }

    if (linkedStyle) {
      await placeholder.setFillStyleIdAsync(linkedStyle.id);
      styleLinked = true;
    }
  }

  // Apply direct color if no style was linked
  if (!styleLinked) {
    placeholder.fills = [
      {
        type: "SOLID",
        color: surfaceRgb,
        opacity: context.colorMode === "plugin" ? 1.0 : 0.6,
      },
    ];
  }

  // Border radius (per-corner — asymmetric CSS radii stay asymmetric)
  applyCornerRadii(placeholder, node.borderRadius, node.width, node.height);

  // Determine icon color (use provided color or derive from surface color)
  let iconColor: RGB;
  if (borderColor) {
    iconColor = hexToFigmaRGB(borderColor);
  } else {
    // Derive icon color from surface: make it darker for contrast
    const surfaceLuminance =
      0.299 * surfaceRgb.r + 0.587 * surfaceRgb.g + 0.114 * surfaceRgb.b;
    const darkenFactor = surfaceLuminance > 0.5 ? 0.5 : 1.5;
    iconColor = {
      r: Math.min(1, Math.max(0, surfaceRgb.r * darkenFactor)),
      g: Math.min(1, Math.max(0, surfaceRgb.g * darkenFactor)),
      b: Math.min(1, Math.max(0, surfaceRgb.b * darkenFactor)),
    };
  }

  // Add image icon in center
  const minDimension = Math.min(node.width, node.height);
  const iconSize = Math.min(Math.max(minDimension * 0.4, 24), 120);

  if (iconSize >= 20) {
    const icon = await createImagePlaceholderIcon(
      iconSize,
      iconColor,
      borderColor || "",
      context
    );
    icon.x = (node.width - iconSize) / 2;
    icon.y = (node.height - iconSize) / 2;
    placeholder.appendChild(icon);
  }

  return placeholder;
}
