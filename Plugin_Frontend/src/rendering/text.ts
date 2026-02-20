/**
 * Text node creation for Figma
 * Handles text segments, inline styled children, and text with background
 */

import type {
  WireframeNode,
  RenderContext,
  TextSegment,
  FigmaFill,
} from "../types";
import {
  cssColorToFigmaRGB,
  normalizeColorForLookup,
  getSmartTextColor,
} from "./colors";
import { convertFillsToPaints, convertStrokesToFigma, convertEffectsToFigma } from "./fills";
import { linkFillStyleIfAvailable, linkStrokeStyleIfAvailable } from "./styles";

// ============================================================================
// Text Segment Collection
// ============================================================================

/**
 * Collect all text segments from a node and its inline children
 * Handles parent text content and inline text children (like <a> inside <h2>)
 */
export function collectTextSegments(node: WireframeNode): TextSegment[] {
  const segments: TextSegment[] = [];

  // Add parent text content if exists (may be partial)
  if (node.textContent && node.textContent.trim() !== "") {
    segments.push({
      text: node.textContent,
      color: node.textColor || "#333333",
      fontWeight: node.fontWeight || 400,
      fontSize: node.fontSize || 14,
    });
  }

  // Check for inline text children (like <a> inside <h2>)
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      // Only include inline text children
      if (
        child.type === "text" &&
        child.textContent &&
        child.textContent.trim() !== ""
      ) {
        segments.push({
          text: child.textContent,
          color: child.textColor || node.textColor || "#333333",
          fontWeight: child.fontWeight || node.fontWeight || 400,
          fontSize: child.fontSize || node.fontSize || 14,
        });
      }
    }
  }

  return segments;
}

// ============================================================================
// Text Node Creation
// ============================================================================

/**
 * Create text node with support for inline styled children
 * Handles font loading, range-specific styling, and text alignment
 */
export async function createTextNode(
  node: WireframeNode,
  fontFamily: string,
  context?: RenderContext
): Promise<TextNode | null> {
  // Collect all text segments (parent + inline children)
  const segments = collectTextSegments(node);

  if (segments.length === 0) {
    return null;
  }

  const textNode = figma.createText();

  // Determine main font style based on parent weight
  let mainFontStyle = "Regular";
  if (node.fontWeight >= 600) {
    mainFontStyle = "Bold";
  } else if (node.fontWeight >= 500) {
    mainFontStyle = "Medium";
  }

  // Load required fonts
  const fontsToLoad = new Set<string>();
  fontsToLoad.add(mainFontStyle);
  for (const seg of segments) {
    if (seg.fontWeight >= 600) fontsToLoad.add("Bold");
    else if (seg.fontWeight >= 500) fontsToLoad.add("Medium");
    else fontsToLoad.add("Regular");
  }

  // Prefer node's fontFamily, then context fontFamily, then Inter as fallback
  const targetFont = node.fontFamily || fontFamily;
  let usedFontFamily = targetFont;
  const fontStyles = Array.from(fontsToLoad);
  try {
    for (const style of fontStyles) {
      await figma.loadFontAsync({ family: targetFont, style });
    }
  } catch {
    try {
      usedFontFamily = "Inter";
      for (const style of fontStyles) {
        await figma.loadFontAsync({ family: "Inter", style });
      }
    } catch {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      usedFontFamily = "Inter";
    }
  }

  // Set initial font
  textNode.fontName = { family: usedFontFamily, style: mainFontStyle };

  // Combine all text content
  // In plugin colors mode, add whitespace separator between nested segments
  let fullText: string;
  if (context?.colorMode === "plugin" && segments.length > 1) {
    fullText = segments
      .map((s, i) => {
        const text = s.text;
        if (i > 0) {
          const prevText = segments[i - 1].text;
          const prevEndsWithSpace = /\s$/.test(prevText);
          const thisStartsWithSpace = /^\s/.test(text);
          if (!prevEndsWithSpace && !thisStartsWithSpace) {
            return " " + text;
          }
        }
        return text;
      })
      .join("");
  } else {
    fullText = segments.map((s) => s.text).join("");
  }
  textNode.characters = fullText;

  // Apply base font size
  textNode.fontSize = Math.max(node.fontSize || 14, 8);

  // Apply range-specific styling if there are multiple segments
  if (segments.length > 1) {
    let charIndex = 0;
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const segment = segments[segIdx];

      // Account for added separator space in plugin mode
      let addedSeparator = 0;
      if (context?.colorMode === "plugin" && segIdx > 0) {
        const prevText = segments[segIdx - 1].text;
        const prevEndsWithSpace = /\s$/.test(prevText);
        const thisStartsWithSpace = /^\s/.test(segment.text);
        if (!prevEndsWithSpace && !thisStartsWithSpace) {
          addedSeparator = 1;
        }
      }

      const startIdx = charIndex + addedSeparator;
      const endIdx = startIdx + segment.text.length;
      charIndex = endIdx;

      if (startIdx >= endIdx) continue;

      // Apply segment color
      let segmentColorToUse = segment.color;
      if (context?.colorMode === "plugin") {
        const tagLower = node.tag?.toLowerCase() || "";
        const isLink = tagLower === "a";
        segmentColorToUse = getSmartTextColor(node, context, isLink);
      }
      const colorWithOpacity = cssColorToFigmaRGB(segmentColorToUse);
      if (colorWithOpacity) {
        // Check if we should link to a style
        let linkedStyle: PaintStyle | undefined;
        if (context && context.variableMode === "styles") {
          const normalizedColor = normalizeColorForLookup(segmentColorToUse);
          linkedStyle = context.colorStyleMap.get(normalizedColor);
        }

        if (linkedStyle) {
          textNode.setRangeFillStyleId(startIdx, endIdx, linkedStyle.id);
        } else {
          textNode.setRangeFills(startIdx, endIdx, [
            {
              type: "SOLID",
              color: colorWithOpacity.color,
              opacity:
                context?.colorMode === "plugin"
                  ? 1.0
                  : colorWithOpacity.opacity,
            },
          ]);
        }
      }

      // Apply segment font weight
      let segStyle = "Regular";
      if (segment.fontWeight >= 600) segStyle = "Bold";
      else if (segment.fontWeight >= 500) segStyle = "Medium";

      try {
        textNode.setRangeFontName(startIdx, endIdx, {
          family: usedFontFamily,
          style: segStyle,
        });
      } catch {
        // Keep default
      }

      // Apply segment font size if different
      if (segment.fontSize && segment.fontSize !== node.fontSize) {
        textNode.setRangeFontSize(
          startIdx,
          endIdx,
          Math.max(segment.fontSize, 8)
        );
      }
    }
  } else {
    // Single segment - apply simple styling
    const segment = segments[0];
    let singleColorToUse = segment.color;
    if (context?.colorMode === "plugin") {
      const tagLower = node.tag?.toLowerCase() || "";
      const isLink = tagLower === "a";
      singleColorToUse = getSmartTextColor(node, context, isLink);
    }
    const colorWithOpacity = cssColorToFigmaRGB(singleColorToUse);

    if (colorWithOpacity) {
      let linkedStyle: PaintStyle | undefined;
      if (context && context.variableMode === "styles") {
        const normalizedColor = normalizeColorForLookup(singleColorToUse);
        linkedStyle = context.colorStyleMap.get(normalizedColor);
      }

      if (linkedStyle) {
        textNode.fillStyleId = linkedStyle.id;
      } else {
        textNode.fills = [
          {
            type: "SOLID",
            color: colorWithOpacity.color,
            opacity:
              context?.colorMode === "plugin" ? 1.0 : colorWithOpacity.opacity,
          },
        ];
      }
    }
  }

  // Text alignment
  const alignMap: Record<string, "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"> = {
    left: "LEFT",
    center: "CENTER",
    right: "RIGHT",
    justify: "JUSTIFIED",
    start: "LEFT",
    end: "RIGHT",
  };
  textNode.textAlignHorizontal = alignMap[node.textAlign] || "LEFT";

  // Line height
  if (node.lineHeight && node.lineHeight !== "normal") {
    if (typeof node.lineHeight === "number") {
      textNode.lineHeight = { value: node.lineHeight, unit: "PIXELS" };
    } else if (typeof node.lineHeight === "string") {
      if (node.lineHeight.endsWith("%")) {
        const percentValue = parseFloat(node.lineHeight);
        if (!isNaN(percentValue)) {
          textNode.lineHeight = { value: percentValue, unit: "PERCENT" };
        }
      } else if (node.lineHeight.endsWith("px")) {
        const pxValue = parseFloat(node.lineHeight);
        if (!isNaN(pxValue)) {
          textNode.lineHeight = { value: pxValue, unit: "PIXELS" };
        }
      } else {
        const numValue = parseFloat(node.lineHeight);
        if (!isNaN(numValue)) {
          if (numValue < 10) {
            textNode.lineHeight = { value: numValue * 100, unit: "PERCENT" };
          } else {
            textNode.lineHeight = { value: numValue, unit: "PIXELS" };
          }
        }
      }
    }
  }

  // Letter spacing
  if (node.letterSpacing && node.letterSpacing !== 0) {
    textNode.letterSpacing = { value: node.letterSpacing, unit: "PIXELS" };
  }

  // Set text box size and auto-resize behavior
  const isSingleChar = fullText.length <= 2;
  const isVeryNarrow = node.width < (node.fontSize || 14) * 1.5;
  const inlineTags = [
    "a",
    "span",
    "label",
    "strong",
    "em",
    "b",
    "i",
    "code",
    "small",
    "mark",
  ];
  const isInlineElement =
    node.tag && inlineTags.includes(node.tag.toLowerCase());

  const shouldHug =
    node.layoutSizingHorizontal === "HUG" ||
    isSingleChar ||
    isVeryNarrow ||
    isInlineElement;

  if (shouldHug) {
    textNode.textAutoResize = "WIDTH_AND_HEIGHT";
  } else {
    textNode.resize(Math.max(node.width, 1), Math.max(node.height, 1));
    textNode.textAutoResize = "HEIGHT";
  }

  return textNode;
}

// ============================================================================
// Text With Background
// ============================================================================

/**
 * Create a text element WITH background styling (like buttons, badges)
 * In Figma, TextNode can't have background fills - we wrap it in a Frame
 */
export async function createTextWithBackground(
  node: WireframeNode,
  context: RenderContext
): Promise<FrameNode | null> {
  // Create the wrapper frame
  const frame = figma.createFrame();
  frame.name = node.name || "Button";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Apply Auto Layout for proper text containment
  frame.layoutMode =
    node.layoutMode && node.layoutMode !== "NONE"
      ? node.layoutMode
      : "HORIZONTAL";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";

  // Apply padding
  if (node.padding) {
    frame.paddingTop = node.padding.top || 0;
    frame.paddingRight = node.padding.right || 0;
    frame.paddingBottom = node.padding.bottom || 0;
    frame.paddingLeft = node.padding.left || 0;
  }

  // Apply item spacing
  if (node.itemSpacing > 0) {
    frame.itemSpacing = node.itemSpacing;
  }

  // Apply fills (background) to the frame
  if (node.fills && node.fills.length > 0) {
    const paints = convertFillsToPaints(
      node.fills,
      context,
      node.tag,
      node.className
    );
    if (paints.length > 0) {
      frame.fills = paints;
      linkFillStyleIfAvailable(frame, context);
    } else {
      frame.fills = [];
    }
  } else {
    frame.fills = [];
  }

  // Apply strokes (border) to the frame
  if (node.strokes && node.strokes.length > 0) {
    const { paints, weight } = convertStrokesToFigma(node.strokes, context);
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      frame.strokeAlign = "INSIDE";
      linkStrokeStyleIfAvailable(frame, context);
    }
  }

  // Apply effects (shadows, blur) to the frame
  if (node.effects && node.effects.length > 0) {
    const figmaEffects = convertEffectsToFigma(node.effects, context);
    if (figmaEffects.length > 0) {
      frame.effects = figmaEffects;
    }
  }

  // Apply border radius to the frame
  if (node.borderRadius) {
    const br = node.borderRadius;
    if (typeof br === "number") {
      frame.cornerRadius = br;
    } else {
      frame.topLeftRadius = br.topLeft || 0;
      frame.topRightRadius = br.topRight || 0;
      frame.bottomRightRadius = br.bottomRight || 0;
      frame.bottomLeftRadius = br.bottomLeft || 0;
    }
  }

  // Create the text node inside
  const textNode = await createTextNode(node, context.fontFamily, context);
  if (textNode) {
    frame.appendChild(textNode);
    textNode.layoutSizingHorizontal = "HUG";
    textNode.layoutSizingVertical = "HUG";
  }

  return frame;
}
