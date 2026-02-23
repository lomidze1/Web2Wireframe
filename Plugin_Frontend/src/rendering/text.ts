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
 *
 * Priority:
 * 1. Use pre-extracted styledSegments if available (from CDP extraction)
 * 2. Fall back to old method (parent + inline children)
 */
export function collectTextSegments(node: WireframeNode): TextSegment[] {
  // NEW: Use pre-extracted styled segments if available
  // These come from CDP extraction and preserve exact inline element styles
  if (node.styledSegments && node.styledSegments.length > 0) {
    return node.styledSegments.map(seg => ({
      text: seg.text,
      color: seg.color || node.textColor || "#333333",
      fontWeight: seg.fontWeight || node.fontWeight || 400,
      fontSize: seg.fontSize || node.fontSize || 14,
      fontFamily: seg.fontFamily,
      isLink: seg.isLink,
      tag: seg.tag,
      textDecoration: seg.textDecoration,
    }));
  }

  // FALLBACK: Old method with computedStyles fallback for textDecoration
  const segments: TextSegment[] = [];

  // Helper: extract textDecoration from computedStyles
  function getTextDecoration(styles?: Record<string, string>): "underline" | "line-through" | undefined {
    const raw = styles?.["text-decoration"] || styles?.["text-decoration-line"] || "";
    if (raw.includes("underline")) return "underline";
    if (raw.includes("line-through")) return "line-through";
    return undefined;
  }

  // Add parent text content if exists (may be partial)
  if (node.textContent && node.textContent.trim() !== "") {
    segments.push({
      text: node.textContent,
      color: node.textColor || "#333333",
      fontWeight: node.fontWeight || 400,
      fontSize: node.fontSize || 14,
      textDecoration: getTextDecoration(node.computedStyles),
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
          textDecoration: getTextDecoration(child.computedStyles),
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
  // Add whitespace separator between segments when missing (ensures proper spacing)
  let fullText: string;
  if (segments.length > 1) {
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

      // Account for added separator space between segments
      let addedSeparator = 0;
      if (segIdx > 0) {
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
      let segmentColorToUse: string = segment.color || node.textColor || "#333333";
      if (context?.colorMode === "plugin") {
        const tagLower = segment.tag?.toLowerCase() || node.tag?.toLowerCase() || "";
        const isLink = segment.isLink || tagLower === "a";
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

      // Apply text decoration (underline, strikethrough)
      if (segment.textDecoration) {
        const figmaDecoration =
          segment.textDecoration === "underline" ? "UNDERLINE" :
          segment.textDecoration === "line-through" ? "STRIKETHROUGH" : "NONE";
        if (figmaDecoration !== "NONE") {
          try {
            textNode.setRangeTextDecoration(startIdx, endIdx, figmaDecoration);
          } catch {
            // Keep default
          }
        }
      }
    }
  } else {
    // Single segment - apply simple styling
    const segment = segments[0];
    let singleColorToUse: string = segment.color || node.textColor || "#333333";
    if (context?.colorMode === "plugin") {
      const tagLower = segment.tag?.toLowerCase() || node.tag?.toLowerCase() || "";
      const isLink = segment.isLink || tagLower === "a";
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

    // Apply text decoration (underline, strikethrough) for single segment
    if (segment.textDecoration) {
      const figmaDecoration =
        segment.textDecoration === "underline" ? "UNDERLINE" :
        segment.textDecoration === "line-through" ? "STRIKETHROUGH" : "NONE";
      if (figmaDecoration !== "NONE") {
        textNode.textDecoration = figmaDecoration;
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

  // =========================================================================
  // SMART TEXT SIZING LOGIC
  // =========================================================================
  // 1. Get browser measurements
  // 2. Measure Figma HUG width
  // 3. If difference ≤1px → use HUG width as FIXED, browser height
  // 4. If text is wider → try font-size reduction (max 1-2px)
  // 5. If still doesn't fit single line → truncate text
  // =========================================================================

  const browserWidth = Math.max(node.width, 1);
  const browserHeight = Math.max(node.height, 1);
  const browserLineCount = node.browserLineCount || 1;
  const originalFontSize = textNode.fontSize as number;

  // Check for special cases that should always HUG
  const isSingleChar = fullText.length <= 2;
  const isVeryNarrow = browserWidth < (node.fontSize || 14) * 1.5;
  const inlineTags = ["span", "strong", "em", "b", "i", "code", "small", "mark"];
  const isInlineElement = node.tag && inlineTags.includes(node.tag.toLowerCase());

  // Special cases: always HUG
  if (node.layoutSizingHorizontal === "HUG" || isSingleChar || isVeryNarrow || isInlineElement) {
    textNode.textAutoResize = "WIDTH_AND_HEIGHT";
    return textNode;
  }

  // Step 1: Measure Figma's HUG dimensions
  textNode.textAutoResize = "WIDTH_AND_HEIGHT";
  const hugWidth = textNode.width;
  const hugHeight = textNode.height;

  // Step 2: Compare HUG width with browser width
  const widthDiff = hugWidth - browserWidth;

  if (Math.abs(widthDiff) <= 1) {
    // Same width (within 1px tolerance)
    // Use HUG's width as FIXED, browser's height as FIXED
    textNode.resize(hugWidth, browserHeight);
    textNode.textAutoResize = "NONE";
  } else if (widthDiff > 1) {
    // Text is WIDER in Figma than browser (font metrics differ)
    // Try font-size reduction (max 1-2px)
    let adjusted = false;

    for (let reduction = 1; reduction <= 2; reduction++) {
      const newFontSize = originalFontSize - reduction;
      if (newFontSize < 8) continue; // Don't go below 8px

      // Apply new font size
      textNode.fontSize = newFontSize;
      textNode.textAutoResize = "WIDTH_AND_HEIGHT";

      const newHugWidth = textNode.width;
      const newHugHeight = textNode.height;

      // Check if now fits within browser width (1px tolerance)
      if (newHugWidth <= browserWidth + 1) {
        // Fits! Use new width, browser height
        textNode.resize(Math.max(newHugWidth, browserWidth), browserHeight);
        textNode.textAutoResize = "NONE";
        adjusted = true;
        break;
      }

      // For single-line text: check if still renders as ~1 line
      if (browserLineCount === 1) {
        // Estimate line count from height ratio
        const heightRatio = newHugHeight / browserHeight;
        if (heightRatio <= 1.3) {
          // Still approximately 1 line - acceptable
          textNode.resize(newHugWidth, browserHeight);
          textNode.textAutoResize = "NONE";
          adjusted = true;
          break;
        }
      }
    }

    if (!adjusted) {
      // Font-size reduction didn't help enough
      // Restore original font size
      textNode.fontSize = originalFontSize;

      if (browserLineCount === 1) {
        // Single-line text that doesn't fit → TRUNCATE
        textNode.resize(browserWidth, browserHeight);
        textNode.textAutoResize = "NONE";
        textNode.textTruncation = "ENDING";
      } else {
        // Multi-line text → just use browser dimensions
        textNode.resize(browserWidth, browserHeight);
        textNode.textAutoResize = "NONE";
      }
    }
  } else {
    // Text is NARROWER in Figma than browser
    // Use HUG width (narrower), browser height
    textNode.resize(hugWidth, browserHeight);
    textNode.textAutoResize = "NONE";
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
