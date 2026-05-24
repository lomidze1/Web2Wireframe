/**
 * Text node creation for Figma
 * Handles text segments, inline styled children, and text with background
 */

import type {
  WireframeNode,
  RenderContext,
  TextSegment,
} from "../types";

/**
 * Determine the text color for FILLR wireframe lines mode.
 * - colorMode "plugin" → pluginColors.text
 * - colorMode "website" → node.textColor or first segment color or fallback
 */
export function determineFillrTextColor(
  node: { textColor?: string },
  segments: { color?: string | null }[],
  colorMode?: string,
  pluginColors?: { text: string }
): string {
  if (colorMode === "plugin" && pluginColors) {
    return pluginColors.text;
  }
  return node.textColor || segments[0]?.color || "#333333";
}

/**
 * Resolve the target width for FILLR rendering.
 *
 * `node.width` is the element's CSS box width (e.g. a `<p>` with width: 100%
 * = 1114px). But the real text inside may only span half of that (e.g. 556px).
 * Using the element width makes FILLR stretch the wireframe line across the
 * full box — much longer than the real text's visual span.
 *
 * `renderedTextWidth` captures the max bounding-box width across the node's
 * text children (from content-script TEXT nodes). When present, use it as
 * the target so FILLR mirrors the real text. Clamp to elementWidth so
 * overflowing text still truncates to the container.
 */
export function resolveFillrTargetWidth(
  elementWidth: number,
  renderedTextWidth: number | undefined,
): number {
  const clampedElement = Math.max(elementWidth || 100, 1);
  if (renderedTextWidth && renderedTextWidth > 0) {
    return Math.min(renderedTextWidth, clampedElement);
  }
  return clampedElement;
}

/**
 * Calculate how many characters to keep so FILLR text fits within the original width.
 * Uses ratio-based estimation (floor to never exceed).
 */
export function calculateFillrTrimLength(
  fullTextLength: number,
  fillrWidth: number,
  originalWidth: number
): number {
  if (fillrWidth <= originalWidth || fullTextLength === 0) {
    return fullTextLength;
  }
  const ratio = originalWidth / fillrWidth;
  return Math.floor(fullTextLength * ratio);
}

/**
 * Split FILLR text into N explicit lines, each trimmed to the matching target
 * width from `lineWidths` (capped at `frameWidth` so chunks don't re-wrap
 * inside the fixed text frame). Mutates `textNode.characters` during
 * measurement. Caller must set `textAutoResize = "WIDTH_AND_HEIGHT"` before
 * invoking.
 *
 * Trailing text that doesn't fit in N lines is dropped (same policy as the
 * single-line path's width-only trim). Absorbing it into the last line
 * causes Figma to soft-wrap past `browserLineCount`.
 */
export function splitFillrTextByLineWidths(
  textNode: { characters: string; width: number },
  fullText: string,
  lineWidths: number[],
  frameWidth = Infinity,
): string {
  const lines: string[] = [];
  let cursor = 0;
  // Safety margin: Figma measurements round to subpixels; leave ~2px headroom
  // so chunks never exceed the frame and trigger soft-wrap.
  const frameCap = Math.max(frameWidth - 2, 1);

  for (let i = 0; i < lineWidths.length; i++) {
    if (cursor >= fullText.length) break;

    const target = Math.max(1, Math.min(lineWidths[i], frameCap));
    const remaining = fullText.length - cursor;

    // Measure natural width of remaining text to compute ratio-based estimate.
    textNode.characters = fullText.slice(cursor);
    const naturalWidth = textNode.width || 1;

    let chars = Math.max(
      1,
      Math.min(remaining, Math.floor(remaining * (target / naturalWidth))),
    );
    textNode.characters = fullText.slice(cursor, cursor + chars);

    // Fine-tune: shrink if too wide
    while (textNode.width > target && chars > 1) {
      chars--;
      textNode.characters = fullText.slice(cursor, cursor + chars);
    }
    // Fine-tune: grow if too narrow and more text remains
    while (textNode.width < target && cursor + chars < fullText.length) {
      chars++;
      textNode.characters = fullText.slice(cursor, cursor + chars);
      if (textNode.width > target) {
        chars--;
        textNode.characters = fullText.slice(cursor, cursor + chars);
        break;
      }
    }

    lines.push(fullText.slice(cursor, cursor + chars));
    cursor += chars;
  }

  return lines.join("\n");
}

/**
 * Trim trailing alphabetic characters from a Figma TextNode's content until
 * its rendered height fits within `browserLineCount` lines. Used by lorem
 * ipsum mode where the substitute text may render wider than the original
 * (e.g. "Legal" 40.82px → "Lorem" 46.61px in Space Grotesk Bold) and
 * overflow the content box. Mutates `textNode.characters` in place.
 *
 * Caller must:
 *   - have already assigned `textNode.characters = fullText`
 *   - have set fontName / fontSize / lineHeight / letterSpacing
 *   - have called `textNode.resize(targetWidth, ...)` so width is locked
 *   - have set `textAutoResize = "HEIGHT"` so wrapping grows height (not width)
 *
 * Stops when:
 *   - height fits within `browserLineCount * expectedSingleLineHeight + 1px`
 *   - characters reduced to ≤1 (give up — accept whatever overflow)
 *   - no more alphabetic characters left to trim (give up)
 *
 * Non-alphabetic characters ($, digits, punctuation, spaces) are preserved
 * in their original positions; only the LAST alphabetic char is removed
 * each iteration.
 */
export function trimLoremToFitLineCount(
  textNode: { characters: string; height: number },
  browserLineCount: number,
  expectedSingleLineHeight: number,
): void {
  const lineCount = Math.max(browserLineCount || 1, 1);
  const targetMaxHeight = expectedSingleLineHeight * lineCount + 1; // 1px tolerance
  if (textNode.height <= targetMaxHeight) return;

  let chars = textNode.characters;
  // Bound iterations by initial length — cannot loop more than that
  for (let i = chars.length; i > 0; i--) {
    if (textNode.height <= targetMaxHeight) return;
    if (chars.length <= 1) return;
    // Find last alphabetic char (ASCII a-zA-Z) — trailing non-alpha preserved
    const idx = chars.search(/[a-zA-Z](?=[^a-zA-Z]*$)/);
    if (idx < 0) return; // no alpha left to trim
    chars = chars.slice(0, idx) + chars.slice(idx + 1);
    textNode.characters = chars;
  }
}

/**
 * Apply CSS lineHeight (string or number) to a Figma text node. Mirrors the
 * inline logic at text.ts:880-906 but callable from the FILLR multi-line
 * branch where we need lineHeight for Figma's vertical stacking to match
 * the browser's layout.
 */
export function applyLineHeightFromCss(
  textNode: TextNode,
  node: Pick<WireframeNode, "lineHeight">,
): void {
  const lh = node.lineHeight;
  if (!lh || lh === "normal") return;
  if (typeof lh === "number") {
    textNode.lineHeight = { value: lh, unit: "PIXELS" };
    return;
  }
  if (typeof lh !== "string") return;
  if (lh.endsWith("%")) {
    const v = parseFloat(lh);
    if (!isNaN(v)) textNode.lineHeight = { value: v, unit: "PERCENT" };
    return;
  }
  if (lh.endsWith("px")) {
    const v = parseFloat(lh);
    if (!isNaN(v)) textNode.lineHeight = { value: v, unit: "PIXELS" };
    return;
  }
  const v = parseFloat(lh);
  if (!isNaN(v)) {
    textNode.lineHeight = v < 10
      ? { value: v * 100, unit: "PERCENT" }
      : { value: v, unit: "PIXELS" };
  }
}

import {
  cssColorToFigmaRGB,
  paintKeyFromCSSColor,
  getSmartTextColor,
} from "./colors";
import { convertFillsToPaints, convertStrokesToFigma, convertEffectsToFigma } from "./fills";
import { linkEffectStyleIfAvailable, linkFillStyleIfAvailable, linkStrokeStyleIfAvailable, parseFigmaLineHeight, lineHeightKeyStr, buildTextStyleKey, fontWeightToStyleCandidates } from "./styles";
import { isIconFont, stripFontStyleSuffix } from "../utils/fontUtils";

/** Extra font styles to try for icon fonts (FA uses "Solid", "Brands", etc.) */
const ICON_FONT_EXTRA_STYLES = ["Solid", "Brands", "Regular", "Bold", "Light", "Thin"];

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
      fontFamilyList: seg.fontFamilyList,
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
// Block-Level Element Detection
// ============================================================================

const BLOCK_LEVEL_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "div", "li", "blockquote",
  "section", "article", "header", "footer", "main", "nav",
  "figcaption", "dd", "dt", "td", "th", "caption",
]);

/**
 * Detect if a node is a block-level element whose browserWidth
 * represents the container width, not the text content width.
 *
 * Block elements take 100% parent width by default (display: block).
 * Their text is positioned via text-align, so shrinking to HUG width
 * would break center/right alignment and change line wrapping.
 */
export function isBlockLevelElement(node: WireframeNode): boolean {
  const display = node.computedStyles?.["display"];
  if (display === "block" || display === "list-item") {
    return true;
  }
  if (node.tag && BLOCK_LEVEL_TAGS.has(node.tag.toLowerCase())) {
    return true;
  }
  return false;
}

// ============================================================================
// Text Style Linking
// ============================================================================

/**
 * Link a TextStyle to a single-segment text node.
 * MUST be called AFTER all property modifications (fontSize, lineHeight, etc.)
 * because setting textStyleId applies the style's values and any subsequent
 * property change would detach the style.
 *
 * TextStyles now include lineHeight and letterSpacing, so linking won't
 * destroy those properties. The key includes lineHeight/letterSpacing
 * to match the exact style.
 *
 * Skips linking when:
 * - Multi-segment nodes (TextStyle would override per-range formatting)
 */
function linkTextStyleIfApplicable(
  textNode: TextNode,
  node: WireframeNode,
  segments: TextSegment[],
  usedFontFamily: string,
  context?: RenderContext
): void {
  if (
    !context ||
    context.variableMode !== "styles" ||
    !context.textStyleMap ||
    segments.length !== 1
  ) {
    return;
  }

  // Use original tree values for key — NOT textNode.fontSize (which may be adjusted by sizing)
  // and NOT usedFontFamily (which may be a fallback font).
  // This ensures the key matches what collectTypographyFromTree generated.
  const weight = segments[0].fontWeight || node.fontWeight || 400;
  const fontMode = context.fontMode || "website";
  const family = fontMode === "plugin"
    ? context.fontFamily
    : (node.fontFamily || context.fontFamily);
  const tsKey = buildTextStyleKey(family, weight, node.fontSize || 14, node.lineHeight, node.letterSpacing || 0);
  const textStyle = context.textStyleMap.get(tsKey);
  if (textStyle) {
    try {
      textNode.textStyleId = textStyle.id;

      // Re-apply text decoration — setting textStyleId resets it to the
      // style's default (NONE), but the original segment may have underline/etc.
      if (segments[0].textDecoration) {
        const deco =
          segments[0].textDecoration === "underline" ? ("UNDERLINE" as const) :
          segments[0].textDecoration === "line-through" ? ("STRIKETHROUGH" as const) : null;
        if (deco) textNode.textDecoration = deco;
      }
    } catch {
      // Style linking failed, continue with direct properties
    }
  }
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

  // Determine main font style + per-weight fallback candidates.
  // CSS standard 9-step mapping: 600 = Semibold, 700 = Bold, etc.
  // candidates[0] is preferred; later entries fall back when the font lacks
  // the preferred style (e.g. system-ui without Semibold).
  const mainCandidates = fontWeightToStyleCandidates(node.fontWeight);
  let mainFontStyle = mainCandidates[0];

  // Load required fonts — include all candidates so the loader can fall back
  const fontsToLoad = new Set<string>();
  for (const c of mainCandidates) fontsToLoad.add(c);
  for (const seg of segments) {
    for (const c of fontWeightToStyleCandidates(seg.fontWeight)) {
      fontsToLoad.add(c);
    }
  }

  // Wireframe lines mode: use FILLR font (squiggly wireframe lines)
  // FILLR only has Regular style, so force all weights to Regular
  if (context?.fontMode === "lines") {
    const fillrFont = "FILLR";
    try {
      await figma.loadFontAsync({ family: fillrFont, style: "Regular" });
    } catch {
      // FILLR not installed — fall back to Inter
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    }

    textNode.fontName = { family: fillrFont, style: "Regular" };

    const fullText = segments.length > 1
      ? segments.map((s, i) => {
          if (i > 0) {
            const prev = segments[i - 1].text;
            if (!/\s$/.test(prev) && !/^\s/.test(s.text)) return " " + s.text;
          }
          return s.text;
        }).join("")
      : segments.map(s => s.text).join("");

    textNode.characters = fullText;
    textNode.fontSize = node.fontSize || 14;

    // FILLR sizing has two separate targets:
    //   • trimTargetWidth — the VISUAL width the FILLR content should fit in
    //     (the real text's bounding box, or the element width as fallback).
    //   • elementWidth — the TEXT FRAME width. Stays at the element's box so
    //     Figma's native `textAlignHorizontal` (center/left/right) positions
    //     the trimmed FILLR content correctly within the original box.
    //
    // For a centered <h2> of width 1440 with renderedTextWidth 535: FILLR
    // trims to fit 535 visually, then the frame is sized to 1440 and
    // textAlignHorizontal=CENTER centers the 535-wide line in the frame.
    const elementWidth = Math.max(node.width || 100, 1);
    const lineWidths = node.renderedTextWidths;

    if (lineWidths && lineWidths.length > 1 && fullText.length > 0) {
      // Multi-line path: split FILLR into N explicit lines matching the
      // browser's per-line widths (e.g. [535, 550, 240]). Each \n forces a
      // hard break so Figma renders exactly N squigglies. Targets are capped
      // at `elementWidth` so chunks never re-wrap inside the fixed frame.
      textNode.textAutoResize = "WIDTH_AND_HEIGHT";
      const joined = splitFillrTextByLineWidths(
        textNode,
        fullText,
        lineWidths,
        elementWidth,
      );
      textNode.characters = joined;
      applyLineHeightFromCss(textNode, node);
      textNode.resize(elementWidth, Math.max(node.height || 20, 1));
      textNode.textAutoResize = "NONE";
    } else {
      // Single-line path: width-only trim.
      const trimTargetWidth = resolveFillrTargetWidth(
        elementWidth,
        node.renderedTextWidth,
      );
      textNode.textAutoResize = "WIDTH_AND_HEIGHT";
      const fillrWidth = textNode.width;

      if (fillrWidth > trimTargetWidth && fullText.length > 0) {
        const ratio = trimTargetWidth / fillrWidth;
        let trimLength = Math.floor(fullText.length * ratio);
        textNode.characters = fullText.slice(0, trimLength);

        // Fine-tune: trim more if still too wide
        while (textNode.width > trimTargetWidth && trimLength > 0) {
          trimLength--;
          textNode.characters = fullText.slice(0, trimLength);
        }
      }

      textNode.resize(elementWidth, Math.max(node.height || 20, 1));
      textNode.textAutoResize = "HEIGHT";
    }

    textNode.name = node.name || node.tag || "Text";

    // Apply text color based on colorMode
    const fillrTextColor = determineFillrTextColor(
      node, segments, context?.colorMode, context?.pluginColors
    );
    const fillrColorParsed = cssColorToFigmaRGB(fillrTextColor);
    if (fillrColorParsed) {
      textNode.fills = [{
        type: "SOLID",
        color: fillrColorParsed.color,
        opacity: context?.colorMode === "plugin" ? 1.0 : fillrColorParsed.opacity,
      }];
    }

    // Apply text alignment
    const align = (node.textAlign || "left").toUpperCase();
    if (align === "CENTER") textNode.textAlignHorizontal = "CENTER";
    else if (align === "RIGHT") textNode.textAlignHorizontal = "RIGHT";
    else textNode.textAlignHorizontal = "LEFT";

    return textNode;
  }

  // Resolve font using fontMapping (multi-font) or legacy missingFont (single-font)
  let targetFont: string;
  if (context?.fontMode === "plugin") {
    // Plugin mode: use fontMapping if available, otherwise single plugin font
    const nodeFont = node.fontFamily || fontFamily;
    if (isIconFont(nodeFont)) {
      // Preserve icon font — remapping would break glyph rendering
      targetFont = nodeFont;
    } else if (context.fontMapping && context.fontMapping[nodeFont]) {
      targetFont = context.fontMapping[nodeFont];
    } else {
      targetFont = fontFamily;
    }
  } else {
    const nodeFont = node.fontFamily || fontFamily;
    if (context?.fontMapping && context.fontMapping[nodeFont]) {
      // Multi-font mapping: look up this specific font
      targetFont = context.fontMapping[nodeFont];
    } else if (context?.missingFont && nodeFont === context.missingFont) {
      // Legacy single-font: popup choice replaces the missing font
      targetFont = fontFamily;
    } else {
      // No mapping needed: use original font
      targetFont = nodeFont;
    }
  }
  let usedFontFamily = targetFont;
  const fontStyles = Array.from(fontsToLoad);
  const fallbackList = (context?.fontMode === "website" && node.fontFamilyList) || [];

  // Helper: try loading a font with a specific style
  const tryLoad = async (family: string, style: string): Promise<boolean> => {
    try {
      await figma.loadFontAsync({ family, style });
      return true;
    } catch {
      return false;
    }
  };

  // Helper: try a family with multiple styles, return first that works
  const tryLoadWithStyles = async (family: string, styles: string[]): Promise<string | null> => {
    for (const style of styles) {
      if (await tryLoad(family, style)) return style;
    }
    return null;
  };

  // Build list of styles to try (icon fonts get extra FA-specific styles)
  const isIcon = isIconFont(targetFont);
  const allStylesToTry = isIcon
    ? Array.from(new Set([...fontStyles, ...ICON_FONT_EXTRA_STYLES]))
    : fontStyles;

  let loaded = false;

  // Step 1: Try target font with all style variants
  const foundStyle = await tryLoadWithStyles(targetFont, allStylesToTry);
  if (foundStyle) {
    mainFontStyle = foundStyle;
    loaded = true;
  }

  // Step 2: Try suffix-stripped version (e.g., "FA 6 Brands Regular" → "FA 6 Brands" + "Regular")
  if (!loaded) {
    const stripped = stripFontStyleSuffix(targetFont);
    if (stripped) {
      const strippedStyles = isIcon
        ? Array.from(new Set([stripped.style, ...allStylesToTry]))
        : [stripped.style, ...fontStyles];
      const sFoundStyle = await tryLoadWithStyles(stripped.family, strippedStyles);
      if (sFoundStyle) {
        usedFontFamily = stripped.family;
        mainFontStyle = sFoundStyle;
        loaded = true;
      }
    }
  }

  // Step 3: For icon fonts — try version variants (v6→v5, v5→v6)
  if (!loaded && isIcon) {
    const versionMatch = targetFont.match(/^(.+?)(\d+)(.+)$/);
    if (versionMatch) {
      const [, prefix, version, suffix] = versionMatch;
      const otherVersions = version === "6" ? ["5"] : version === "5" ? ["6"] : [];
      for (const v of otherVersions) {
        const altFamily = `${prefix}${v}${suffix}`;
        const vFoundStyle = await tryLoadWithStyles(altFamily, allStylesToTry);
        if (vFoundStyle) {
          usedFontFamily = altFamily;
          mainFontStyle = vFoundStyle;
          loaded = true;
          break;
        }
      }
    }
  }

  // Step 4: Try CSS fallback chain (non-icon fonts only)
  if (!loaded && !isIcon) {
    for (const fallback of fallbackList) {
      if (fallback === targetFont) continue;
      const fFoundStyle = await tryLoadWithStyles(fallback, fontStyles);
      if (fFoundStyle) {
        usedFontFamily = fallback;
        mainFontStyle = fFoundStyle;
        loaded = true;
        break;
      }
    }
  }

  // Step 5: Try popup choice font (non-icon fonts only)
  if (!loaded && fontFamily !== targetFont && !isIcon) {
    const cFoundStyle = await tryLoadWithStyles(fontFamily, fontStyles);
    if (cFoundStyle) {
      usedFontFamily = fontFamily;
      mainFontStyle = cFoundStyle;
      loaded = true;
    }
  }

  // Step 7: Final fallback — Inter
  if (!loaded) {
    usedFontFamily = "Inter";
    mainFontStyle = "Regular";
    if (!(await tryLoad("Inter", "Regular"))) {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    }
  }

  // Set initial font (may fail for fonts that aren't installed)
  try {
    textNode.fontName = { family: usedFontFamily, style: mainFontStyle };
  } catch {
    const stripped = stripFontStyleSuffix(usedFontFamily);
    let recovered = false;
    if (stripped) {
      try {
        await figma.loadFontAsync({ family: stripped.family, style: stripped.style });
        textNode.fontName = { family: stripped.family, style: stripped.style };
        recovered = true;
      } catch { /* suffix stripping didn't help */ }
    }
    if (!recovered) {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      textNode.fontName = { family: "Inter", style: "Regular" };
    }
  }

  // Stash the family the user wants on this text node so the post-render
  // "Re-apply fonts" action can swap Inter → that family once the user
  // installs the fonts they downloaded via the FontFallbackModal.
  //
  // Critical: write the VALUE of `originalFontNames[node.fontFamily]`, not
  // the key. The map carries CSS-declared family → real (SFNT-stamped)
  // family. For anti-piracy aliased sites the CSS key ("PSC") doesn't match
  // anything installable; only the real value ("PPCirka-Light") will let
  // a later `loadFontAsync({family: marker})` succeed. When the API
  // couldn't extract a real name the modal sends an identity entry, so we
  // get the CSS family back — current behavior preserved.
  //
  // Icon fonts are never rebinded — their glyphs only render correctly
  // with the source font and don't have a usable installable form.
  if (
    context?.fontMode === "website" &&
    context.originalFontNames &&
    node.fontFamily &&
    !isIconFont(node.fontFamily) &&
    usedFontFamily !== node.fontFamily
  ) {
    const markerName = context.originalFontNames[node.fontFamily];
    if (markerName) {
      try {
        textNode.setPluginData("w2w_original_font", markerName);
      } catch {
        // setPluginData unavailable in some test environments; non-fatal.
      }
    }
  }

  // Pre-load segment-weight candidates against the resolved usedFontFamily.
  // Tracking which styles actually loaded lets segment processing pick the
  // first AVAILABLE candidate (avoiding Semibold-not-loaded → setRangeFontName
  // throws → silent fallback to mainFontStyle, which collapses weight diffs).
  // Also includes node.fontWeight so single-segment paths can pick a matching
  // candidate when it differs from mainFontStyle's resolved value.
  const loadedStylesForUsedFont = new Set<string>([mainFontStyle]);
  const uniqueWeights: number[] = [];
  const seenWeights = new Set<number>();
  for (const w of [node.fontWeight, ...segments.map((s) => s.fontWeight)]) {
    if (seenWeights.has(w)) continue;
    seenWeights.add(w);
    uniqueWeights.push(w);
  }
  for (const w of uniqueWeights) {
    for (const style of fontWeightToStyleCandidates(w)) {
      if (loadedStylesForUsedFont.has(style)) continue;
      if (await tryLoad(usedFontFamily, style)) {
        loadedStylesForUsedFont.add(style);
      }
    }
  }

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
  textNode.name = node.name || node.tag || "Text";

  // Apply base font size
  textNode.fontSize = Math.max(node.fontSize || 14, 8);

  // Deferred per-range TextStyle links (multi-segment only).
  // Applied AFTER lineHeight/letterSpacing to prevent Figma from detaching styles.
  const pendingTextStyleLinks: Array<{ startIdx: number; endIdx: number; styleId: string; textDecoration?: string }> = [];

  // Apply range-specific styling if there are multiple segments
  if (segments.length > 1) {
    // Apply base text color to the entire text node first.
    // This ensures separator spaces between segments don't retain
    // Figma's default #000000 color (which appears as a phantom black).
    let baseTextColor: string = node.textColor || "#333333";
    if (context?.colorMode === "plugin") {
      baseTextColor = getSmartTextColor(node, context, false);
    }
    const baseColorParsed = cssColorToFigmaRGB(baseTextColor);
    if (baseColorParsed) {
      let baseLinkedStyle: PaintStyle | undefined;
      if (context && context.variableMode === "styles") {
        // Variable-first: try direct CSS variable lookup
        if (context.variableStyleMap && node.textColorVariable) {
          baseLinkedStyle = context.variableStyleMap.get(node.textColorVariable);
        }
        // Fallback: hex-based lookup
        if (!baseLinkedStyle) {
          const normalizedBase = paintKeyFromCSSColor(baseTextColor);
          baseLinkedStyle = context.colorStyleMap.get(normalizedBase);
        }
      }
      if (baseLinkedStyle) {
        textNode.fillStyleId = baseLinkedStyle.id;
      } else {
        textNode.fills = [
          {
            type: "SOLID",
            color: baseColorParsed.color,
            opacity: context?.colorMode === "plugin" ? 1.0 : baseColorParsed.opacity,
          },
        ];
      }
    }

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
          const normalizedColor = paintKeyFromCSSColor(segmentColorToUse);
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

      // Apply segment font weight + per-segment font family.
      // Use first candidate (preferred for this CSS weight); fall back to next
      // when the font family lacks the preferred style.
      const segCandidates = fontWeightToStyleCandidates(segment.fontWeight);
      const segStyle = segCandidates[0];

      let segFontFamily: string;
      if (context?.fontMode === "plugin") {
        const segFont = segment.fontFamily || usedFontFamily;
        if (isIconFont(segFont)) {
          // Preserve icon font — remapping would break glyph rendering
          segFontFamily = segFont;
        } else if (context.fontMapping && context.fontMapping[segFont]) {
          segFontFamily = context.fontMapping[segFont];
        } else {
          segFontFamily = usedFontFamily;
        }
      } else {
        const segFont = segment.fontFamily || usedFontFamily;
        if (context?.fontMapping && context.fontMapping[segFont]) {
          segFontFamily = context.fontMapping[segFont];
        } else if (context?.missingFont && segFont === context.missingFont) {
          segFontFamily = usedFontFamily;
        } else {
          segFontFamily = segFont;
        }
      }

      const isSegIcon = isIconFont(segFontFamily);
      const segStylesToTry = isSegIcon
        ? Array.from(new Set([...segCandidates, ...ICON_FONT_EXTRA_STYLES]))
        : segCandidates;

      let resolvedSegFont = segFontFamily;
      let resolvedSegStyle = segStyle;
      // Same-family case: pick first candidate that's actually loaded so
      // setRangeFontName won't throw and silently collapse to mainFontStyle.
      if (segFontFamily === usedFontFamily) {
        for (const c of segCandidates) {
          if (loadedStylesForUsedFont.has(c)) {
            resolvedSegStyle = c;
            break;
          }
        }
        if (!loadedStylesForUsedFont.has(resolvedSegStyle)) {
          resolvedSegStyle = mainFontStyle;
        }
      }
      if (segFontFamily !== usedFontFamily) {
        let segLoaded = false;

        // Step 1: Try segment font with all style variants
        for (const sty of segStylesToTry) {
          if (await tryLoad(segFontFamily, sty)) {
            resolvedSegStyle = sty;
            segLoaded = true;
            break;
          }
        }

        // Step 2: Try suffix-stripped version
        if (!segLoaded) {
          const stripped = stripFontStyleSuffix(segFontFamily);
          if (stripped) {
            const sStyles = isSegIcon
              ? Array.from(new Set([stripped.style, ...segStylesToTry]))
              : [stripped.style, segStyle];
            for (const sty of sStyles) {
              if (await tryLoad(stripped.family, sty)) {
                resolvedSegFont = stripped.family;
                resolvedSegStyle = sty;
                segLoaded = true;
                break;
              }
            }
          }
        }

        // Step 3: Icon fonts — try version variants
        if (!segLoaded && isSegIcon) {
          const vMatch = segFontFamily.match(/^(.+?)(\d+)(.+)$/);
          if (vMatch) {
            const [, prefix, version, suffix] = vMatch;
            const altVersions = version === "6" ? ["5"] : version === "5" ? ["6"] : [];
            for (const v of altVersions) {
              const altFamily = `${prefix}${v}${suffix}`;
              for (const sty of segStylesToTry) {
                if (await tryLoad(altFamily, sty)) {
                  resolvedSegFont = altFamily;
                  resolvedSegStyle = sty;
                  segLoaded = true;
                  break;
                }
              }
              if (segLoaded) break;
            }
          }
        }

        // Step 4: Non-icon: try segment fallback list
        if (!segLoaded && !isSegIcon && segment.fontFamilyList) {
          for (const fb of segment.fontFamilyList) {
            if (fb === segFontFamily) continue;
            if (await tryLoad(fb, segStyle)) {
              resolvedSegFont = fb;
              segLoaded = true;
              break;
            }
          }
        }

        // Step 5: Non-icon: try popup choice font
        if (!segLoaded && !isSegIcon && fontFamily !== segFontFamily && fontFamily !== usedFontFamily) {
          if (await tryLoad(fontFamily, segStyle)) {
            resolvedSegFont = fontFamily;
            segLoaded = true;
          }
        }

        if (!segLoaded) {
          resolvedSegFont = usedFontFamily;
          resolvedSegStyle = mainFontStyle;
        }
      }

      // Always set font properties directly first.
      // TextStyle linking is deferred to AFTER lineHeight/letterSpacing
      // to prevent Figma from detaching the style when those props are set.
      try {
        textNode.setRangeFontName(startIdx, endIdx, {
          family: resolvedSegFont,
          style: resolvedSegStyle,
        });
      } catch {
        // Try with suffix stripping as last resort
        const stripped = stripFontStyleSuffix(resolvedSegFont);
        if (stripped) {
          try {
            await figma.loadFontAsync({ family: stripped.family, style: stripped.style });
            textNode.setRangeFontName(startIdx, endIdx, { family: stripped.family, style: stripped.style });
          } catch { /* keep default */ }
        }
      }

      if (segment.fontSize && segment.fontSize !== node.fontSize) {
        textNode.setRangeFontSize(
          startIdx,
          endIdx,
          Math.max(segment.fontSize, 8)
        );
      }

      // Collect pending TextStyle links (applied after lineHeight/letterSpacing)
      if (context && context.variableMode === "styles" && context.textStyleMap) {
        const segWeight = segment.fontWeight || node.fontWeight || 400;
        // Use the SAME mapping TextStyle creation uses (styles.ts fontWeightToStyle)
        // so the lookup key matches and linking succeeds.
        const segStyleStr = fontWeightToStyleCandidates(segWeight)[0];
        const segFontSize = Math.max(segment.fontSize || node.fontSize || 14, 8);
        const lh = parseFigmaLineHeight(node.lineHeight);
        const lhKey = lineHeightKeyStr(lh);
        const ls = Math.round((node.letterSpacing || 0) * 10) / 10;
        const lsKey = ls !== 0 ? `ls${Math.round(ls * 10)}` : "";
        const tsKey = [resolvedSegFont, segStyleStr, segFontSize, lhKey, lsKey].filter(Boolean).join("-");
        const segTextStyle = context.textStyleMap.get(tsKey);
        if (segTextStyle) {
          pendingTextStyleLinks.push({ startIdx, endIdx, styleId: segTextStyle.id, textDecoration: segment.textDecoration });
        }
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
      let lookupKey: string | undefined;
      if (context && context.variableMode === "styles") {
        // Variable-first: try direct CSS variable lookup
        if (context.variableStyleMap && node.textColorVariable) {
          linkedStyle = context.variableStyleMap.get(node.textColorVariable);
        }
        // Fallback: hex-based lookup
        if (!linkedStyle) {
          lookupKey = paintKeyFromCSSColor(singleColorToUse);
          linkedStyle = context.colorStyleMap.get(lookupKey);
        }
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

    // Apply segment font weight if different from node's weight.
    // Resolve via candidates so Semibold/Bold/etc. preferred, with fallback
    // when the font lacks the preferred style. Only override if the resolved
    // style truly differs from mainFontStyle (and is actually loaded).
    const segCandidates = fontWeightToStyleCandidates(segment.fontWeight);
    let segStyle = mainFontStyle;
    for (const c of segCandidates) {
      if (loadedStylesForUsedFont.has(c)) {
        segStyle = c;
        break;
      }
    }
    if (segStyle !== mainFontStyle) {
      try {
        textNode.fontName = { family: usedFontFamily, style: segStyle };
      } catch {
        // Keep default
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
  // 4. If text is wider AND single-line → try font-size reduction (max 1px)
  // 5. If still doesn't fit single line → truncate text
  // 6. If text is wider AND multi-line → use browser dimensions (no font change)
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

  // Helper: apply all deferred TextStyle links (multi-segment per-range + single-segment whole-node).
  // MUST be called LAST — after lineHeight, letterSpacing, sizing, and fontSize changes.
  const applyDeferredTextStyles = () => {
    // Per-range links (multi-segment text)
    for (const link of pendingTextStyleLinks) {
      try {
        textNode.setRangeTextStyleId(link.startIdx, link.endIdx, link.styleId);
        // Re-apply text decoration — setting textStyleId resets it to the
        // style's default (NONE), but the original segment may have underline/etc.
        if (link.textDecoration) {
          const deco =
            link.textDecoration === "underline" ? ("UNDERLINE" as const) :
            link.textDecoration === "line-through" ? ("STRIKETHROUGH" as const) : null;
          if (deco) textNode.setRangeTextDecoration(link.startIdx, link.endIdx, deco);
        }
      } catch {
        // Style linking failed — font properties already set as fallback
      }
    }
    // Whole-node link (single-segment text)
    linkTextStyleIfApplicable(textNode, node, segments, usedFontFamily, context);
  };

  // Special cases: always HUG
  // BUT NOT for block-level elements — they need browser width for correct text-align
  // Block elements (h1-h6, p, div, li) take container width, not content width.
  // HUG would shrink them to text content width, breaking center/right alignment.
  const isBlock = isBlockLevelElement(node);
  if (!isBlock && (node.layoutSizingHorizontal === "HUG" || isSingleChar || isVeryNarrow || isInlineElement)) {
    textNode.textAutoResize = "WIDTH_AND_HEIGHT";
    applyDeferredTextStyles();
    return textNode;
  }

  // Semantic placeholder text: use fixed original dimensions + truncation.
  // Semantic text (e.g. "Subsection Heading") may be longer/shorter than the
  // original website text. Constrain to original size and let Figma truncate
  // with "..." anything that doesn't fit.
  if (context?.textMode === "semantic") {
    textNode.resize(browserWidth, browserHeight);
    textNode.textAutoResize = "NONE";
    textNode.textTruncation = "ENDING";
    applyDeferredTextStyles();
    return textNode;
  }

  // Lorem-ipsum placeholder text: substituted text often renders wider than
  // the original (e.g. "Legal" 40.82px → "Lorem" 46.61px), causing wrap into
  // the next line. Since lorem is meaningless filler, silently trim trailing
  // alphabetic chars until the rendered line count matches the browser's.
  // Width / height / font / dimensions are unchanged — only `characters`.
  // Multi-segment lorem skipped: trimming would shift styling-range indices.
  if (context?.textMode === "lorem" && segments.length === 1) {
    // Resolve px line-height for the trim threshold.
    const fs = node.fontSize || 14;
    const lh = node.lineHeight;
    let lineHeightPx: number;
    if (typeof lh === "number" && lh > 0) {
      lineHeightPx = lh;
    } else if (typeof lh === "string") {
      if (lh.endsWith("px")) lineHeightPx = parseFloat(lh) || fs * 1.2;
      else if (lh.endsWith("%")) lineHeightPx = fs * ((parseFloat(lh) || 120) / 100);
      else {
        const r = parseFloat(lh);
        lineHeightPx = isNaN(r) ? fs * 1.2 : r < 10 ? fs * r : r;
      }
    } else {
      lineHeightPx = fs * 1.2;
    }

    // Lock width, let height grow with wrapping, trim until fits.
    textNode.resize(browserWidth, Math.max(browserHeight, lineHeightPx));
    textNode.textAutoResize = "HEIGHT";
    trimLoremToFitLineCount(textNode, browserLineCount, lineHeightPx);
    textNode.textAutoResize = "NONE";
    textNode.resize(browserWidth, browserHeight);
    applyDeferredTextStyles();
    return textNode;
  }

  // Step 1: Measure Figma's HUG dimensions
  textNode.textAutoResize = "WIDTH_AND_HEIGHT";
  const hugWidth = textNode.width;

  // Step 2: Compare HUG width with browser width
  const widthDiff = hugWidth - browserWidth;

  if (Math.abs(widthDiff) <= 1) {
    // Same width (within 1px tolerance)
    // Use HUG's width as FIXED, browser's height as FIXED
    textNode.resize(hugWidth, browserHeight);
    textNode.textAutoResize = "NONE";
  } else if (widthDiff > 1) {
    // Text is WIDER in Figma than browser (font metrics differ)

    if (browserLineCount > 1) {
      // Multi-line text — check if hugWidth is close or fits in parent
      if (Math.abs(hugWidth - browserWidth) <= 1) {
        // Font metrics nearly identical — use hugWidth
        textNode.resize(hugWidth, browserHeight);
      // } else if (hugWidth > browserWidth && parentWMulti > 0 && hugWidth <= parentWMulti) {
      //   // Plugin font wider but fits in parent — use hugWidth to prevent wrapping
      //   // DISABLED: This caused block elements (li, p) to use Figma's HUG width (~328px)
      //   // instead of browser's textBounds width (~281px), making text boxes too wide.
      //   textNode.resize(hugWidth, browserHeight);
      } else {
        // hugWidth too large or no parent info — use browser dimensions
        textNode.resize(browserWidth, browserHeight);
      }
      textNode.textAutoResize = "NONE";
    } else {
      // Single-line text: HUG is wider than browser width
      const parentW = context?.parentWidth || 0;

      if (parentW > 0 && hugWidth <= parentW) {
        // HUG fits within parent container — use HUG width (no truncation needed)
        // This prevents unnecessary text wrapping when plugin font is slightly wider
        textNode.resize(hugWidth, browserHeight);
        textNode.textAutoResize = "NONE";
      } else {
        // HUG exceeds parent OR no parent info: try font-size reduction (max 1px)
        let adjusted = false;
        const newFontSize = originalFontSize - 1;

        if (newFontSize >= 8) {
          textNode.fontSize = newFontSize;
          textNode.textAutoResize = "WIDTH_AND_HEIGHT";

          const newHugWidth = textNode.width;
          const newHugHeight = textNode.height;

          // Check if now fits within browser width (1px tolerance)
          if (newHugWidth <= browserWidth + 1) {
            textNode.resize(Math.max(newHugWidth, browserWidth), browserHeight);
            textNode.textAutoResize = "NONE";
            adjusted = true;
          } else if (parentW > 0 && newHugWidth <= parentW) {
            // After reduction, fits within parent — accept it
            textNode.resize(newHugWidth, browserHeight);
            textNode.textAutoResize = "NONE";
            adjusted = true;
          } else {
            // Check if still renders as ~1 line
            const heightRatio = newHugHeight / browserHeight;
            if (heightRatio <= 1.3) {
              textNode.resize(newHugWidth, browserHeight);
              textNode.textAutoResize = "NONE";
              adjusted = true;
            }
          }
        }

        if (!adjusted) {
          // Font-size reduction didn't help → restore and truncate
          textNode.fontSize = originalFontSize;
          textNode.resize(browserWidth, browserHeight);
          textNode.textAutoResize = "NONE";
          textNode.textTruncation = "ENDING";
        }
      }
    }
  } else {
    // Text is NARROWER in Figma than browser
    const isBlock = isBlockLevelElement(node);
    const hasNonLeftAlign = node.textAlign === "center"
      || node.textAlign === "right"
      || node.textAlign === "justify";

    if (isBlock || hasNonLeftAlign) {
      // Block elements: browserWidth is the container width, not text width.
      // Keeping it preserves text-align behavior and correct line wrapping.
      // Non-left-aligned text: needs container width for proper positioning.
      textNode.resize(browserWidth, browserHeight);
    } else {
      // Inline/flex elements: HUG width is more accurate
      textNode.resize(hugWidth, browserHeight);
    }
    textNode.textAutoResize = "NONE";
  }

  // Apply all deferred TextStyle links LAST (after sizing, lineHeight, letterSpacing)
  applyDeferredTextStyles();

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

  // In absolute (freeform) import mode the wrapper stays layoutMode="NONE";
  // the inner TextNode is positioned via x/y from padding (see end of fn).
  // This mirrors nodes.ts:255-270 (text-with-padding-no-background path).
  const useAutoLayout = context.layoutMode !== "absolute";

  if (useAutoLayout) {
    // Apply Auto Layout for proper text containment (text backgrounds never use Grid)
    frame.layoutMode =
      node.layoutMode && node.layoutMode !== "NONE" && node.layoutMode !== "GRID"
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
      linkFillStyleIfAvailable(frame, context, node.fills);
    } else {
      frame.fills = [];
    }
  } else {
    frame.fills = [];
  }

  // Apply strokes (border) to the frame
  if (node.strokes && node.strokes.length > 0) {
    const { paints, weight, individualWeights, style } = convertStrokesToFigma(
      node.strokes,
      context,
    );
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      frame.strokeAlign = "INSIDE";
      if (individualWeights) {
        frame.strokeTopWeight = individualWeights.top;
        frame.strokeRightWeight = individualWeights.right;
        frame.strokeBottomWeight = individualWeights.bottom;
        frame.strokeLeftWeight = individualWeights.left;
      }
      if (style === "DASHED") frame.dashPattern = [6, 4];
      else if (style === "DOTTED") frame.dashPattern = [2, 2];
      else frame.dashPattern = [];
      linkStrokeStyleIfAvailable(frame, context);
    }
  }

  // Apply effects (shadows, blur) to the frame — try style linking first (Phase 2)
  if (node.effects && node.effects.length > 0) {
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
    if (useAutoLayout) {
      if (context.textMode === "semantic") {
        // Semantic text: preserve NONE + ENDING truncation, don't override to HUG.
        // FIXED keeps original browser dimensions so truncation works in auto-layout.
        textNode.layoutSizingHorizontal = "FIXED";
        textNode.layoutSizingVertical = "FIXED";
      } else {
        textNode.layoutSizingHorizontal = "HUG";
        textNode.layoutSizingVertical = "HUG";
      }
    } else {
      // Absolute mode: position via x/y, resize to content-box.
      const padLeft = node.padding?.left || 0;
      const padRight = node.padding?.right || 0;
      const padTop = node.padding?.top || 0;
      const padBottom = node.padding?.bottom || 0;
      textNode.x = padLeft;
      textNode.y = padTop;
      const innerW = Math.max(node.width - padLeft - padRight, 1);
      const innerH = Math.max(node.height - padTop - padBottom, 1);
      textNode.resize(innerW, innerH);
      textNode.textAutoResize = "NONE";

      // Lorem mode re-trim: createTextNode trimmed against node.width (the full
      // element box), but the actual TEXT area is innerW (after padding). Lorem
      // that fit at 138px may overflow at 42px content-box width. Re-run trim
      // against the real content-box width.
      if (context.textMode === "lorem" && textNode.characters.length > 1) {
        const fs = node.fontSize || 14;
        const lh = node.lineHeight;
        let lineHeightPx: number;
        if (typeof lh === "number" && lh > 0) {
          lineHeightPx = lh;
        } else if (typeof lh === "string") {
          if (lh.endsWith("px")) lineHeightPx = parseFloat(lh) || fs * 1.2;
          else if (lh.endsWith("%")) lineHeightPx = fs * ((parseFloat(lh) || 120) / 100);
          else {
            const r = parseFloat(lh);
            lineHeightPx = isNaN(r) ? fs * 1.2 : r < 10 ? fs * r : r;
          }
        } else {
          lineHeightPx = fs * 1.2;
        }
        textNode.textAutoResize = "HEIGHT";
        trimLoremToFitLineCount(textNode, node.browserLineCount || 1, lineHeightPx);
        textNode.textAutoResize = "NONE";
        textNode.resize(innerW, innerH);
      }

      // Honor flex centering. CSS for buttons (e.g. `inline-flex` +
      // `justify-content: center` + `align-items: center`) centers the text
      // visually even when text-align is the default "left". Without this,
      // absolute-mode buttons render their label at the top-left of the wrapper.
      const horizMap: Record<string, "LEFT" | "CENTER" | "RIGHT"> = {
        "flex-start": "LEFT", start: "LEFT", left: "LEFT",
        center: "CENTER",
        "flex-end": "RIGHT", end: "RIGHT", right: "RIGHT",
      };
      const vertMap: Record<string, "TOP" | "CENTER" | "BOTTOM"> = {
        "flex-start": "TOP", start: "TOP",
        center: "CENTER",
        "flex-end": "BOTTOM", end: "BOTTOM",
      };
      if (node.justifyContent && horizMap[node.justifyContent]) {
        textNode.textAlignHorizontal = horizMap[node.justifyContent];
      }
      if (node.alignItems && vertMap[node.alignItems]) {
        textNode.textAlignVertical = vertMap[node.alignItems];
      }
    }
  }

  return frame;
}
