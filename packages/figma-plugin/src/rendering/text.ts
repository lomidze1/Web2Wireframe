/**
 * Text node creation for Figma
 * Handles text segments, inline styled children, and text with background
 */

import type {
  WireframeNode,
  RenderContext,
  TextSegment,
} from "../types";
import * as perf from "../utils/perf";
import { loadFontCached } from "./fontLoader";

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
 * Slack added to a text node's fixed width when resizing (h2d parity,
 * main-rawbundle.beautified.js:17634-17637): Figma measures in subpixels, so
 * a box set to exactly the measured width can re-wrap the last word.
 */
export const TEXT_RESIZE_SLACK = 0.2;

/**
 * Rewrite trailing regular spaces (U+0020) to NBSP (U+00A0). Figma collapses
 * trailing spaces on width-hugging (WIDTH_AND_HEIGHT) text, which shrinks the
 * box vs the browser's; h2d does the same rewrite. Same-length replacement so
 * styled-range indices stay valid.
 */
export function protectTrailingSpaces(textNode: { characters: string }): void {
  const chars = textNode.characters;
  const replaced = chars.replace(/ +$/, (m) => "\u00A0".repeat(m.length));
  if (replaced !== chars) {
    textNode.characters = replaced;
  }
}

/**
 * Binary-search the largest fontSize (≤ original) whose rendered ink fits the
 * browser-captured box (h2d parity: their _u/X5/Y5 bisection converges to
 * 0.2px between fontSize/2 and fontSize). The caller supplies `fits`, which
 * applies a candidate size to a measurable text node and reports whether the
 * rendered bounds fit the captured box.
 *
 * Returns:
 *   - the original size when it already fits (single probe),
 *   - the largest known-fitting size once the interval is ≤ 0.2px,
 *   - null when even the lower bound — max(8, original/2) — does not fit
 *     (caller falls back to truncation), or when the original size is not a
 *     finite number (mixed-range figma.mixed symbol).
 *
 * Bounded: at most 20 bisection probes (+2 for the endpoints).
 */
export function bisectFontSizeToFit(
  originalFontSize: number,
  fits: (fontSize: number) => boolean,
): number | null {
  if (!Number.isFinite(originalFontSize)) return null;
  if (fits(originalFontSize)) return originalFontSize;

  let lo = Math.max(8, originalFontSize / 2);
  if (lo >= originalFontSize) return null; // no room below the floor
  if (!fits(lo)) return null;

  let hi = originalFontSize;
  for (let i = 0; i < 20 && hi - lo > 0.2; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Re-apply per-range font sizes scaled by `factor` so mixed-size runs stay
 * proportional when the node's base fontSize is bisected. Setting the base
 * fontSize clobbers every range to that value, so the recorded ranges must be
 * replayed after each base change. 8px floor matches the search's own floor.
 */
export function scaleSegmentRangeFontSizes(
  textNode: { setRangeFontSize(start: number, end: number, size: number): void },
  ranges: Array<{ start: number; end: number; fontSize: number }>,
  factor: number,
): void {
  for (const r of ranges) {
    textNode.setRangeFontSize(r.start, r.end, Math.max(8, r.fontSize * factor));
  }
}

/**
 * Clamp a character range to what the node actually holds.
 *
 * Every `setRange*` call is bounds-checked through here: an out-of-range call
 * THROWS, and the throw propagates out of createTextNode — losing the whole
 * text node over one decorative attribute. Returns null for an empty range.
 */
export function safeRange(
  textNode: { characters: string },
  start: number,
  end: number,
): { start: number; end: number } | null {
  const len = textNode.characters.length;
  const s = Math.max(0, Math.min(Math.floor(start), len));
  const e = Math.max(0, Math.min(Math.floor(end), len));
  return e > s ? { start: s, end: e } : null;
}

/**
 * Do two CSS line-height values land on the same Figma LineHeight? Compares
 * after normalization so `24` and `"24px"` — the same value written two ways —
 * do not look like an override worth a range call.
 */
export function figmaLineHeightsEqual(
  a: number | string | undefined,
  b: number | string | undefined,
): boolean {
  const la = parseFigmaLineHeight(a);
  const lb = parseFigmaLineHeight(b);
  if (la.unit !== lb.unit) return false;
  if (la.unit === "AUTO" || lb.unit === "AUTO") return true;
  return Math.abs((la as { value: number }).value - (lb as { value: number }).value) < 0.01;
}

/**
 * Apply the per-range typography collected during the segment walk.
 *
 * Runs at the very end of createTextNode (see applyDeferredTextStyles): the
 * node-level letterSpacing / textCase / lineHeight setters and any linked
 * TextStyle all cover EVERY character, so anything applied earlier would be
 * silently overwritten.
 *
 * Each setter is wrapped: an older Figma API without one, or a font that
 * refuses a value, must degrade to a no-op rather than take down the node.
 */
export function applyPendingRangeTypography(
  textNode: TextNode,
  entries: Array<{
    start: number;
    end: number;
    letterSpacing?: number;
    textCase?: NonNullable<TextSegment["textCase"]>;
    lineHeight?: number | string;
    decorationStyle?: "SOLID" | "DOTTED" | "WAVY";
    decorationColor?: string;
  }>,
): void {
  if (entries.length === 0) return;

  const api = textNode as unknown as {
    setRangeLetterSpacing?: (s: number, e: number, v: LetterSpacing) => void;
    setRangeLineHeight?: (s: number, e: number, v: LineHeight) => void;
    setRangeTextCase?: (s: number, e: number, v: string) => void;
    setRangeTextDecorationStyle?: (s: number, e: number, v: string) => void;
    setRangeTextDecorationColor?: (s: number, e: number, v: unknown) => void;
  };

  for (const entry of entries) {
    const r = safeRange(textNode, entry.start, entry.end);
    if (!r) continue;

    if (entry.letterSpacing !== undefined && typeof api.setRangeLetterSpacing === "function") {
      try {
        api.setRangeLetterSpacing.call(textNode, r.start, r.end, {
          value: entry.letterSpacing,
          unit: "PIXELS",
        });
      } catch {
        // Range keeps the node-level tracking.
      }
    }

    if (entry.textCase && typeof api.setRangeTextCase === "function") {
      try {
        api.setRangeTextCase.call(textNode, r.start, r.end, entry.textCase);
      } catch {
        // Figma refuses SMALL_CAPS on fonts without the feature (h2d guards
        // the same way) — uppercase is the closest thing that always renders.
        if (entry.textCase === "SMALL_CAPS") {
          try {
            api.setRangeTextCase.call(textNode, r.start, r.end, "UPPER");
          } catch {
            // Give up on this range rather than the node.
          }
        }
      }
    }

    if (entry.lineHeight !== undefined && typeof api.setRangeLineHeight === "function") {
      try {
        api.setRangeLineHeight.call(textNode, r.start, r.end, parseFigmaLineHeight(entry.lineHeight));
      } catch {
        // Range keeps the node-level line height.
      }
    }

    // Decoration detail. Figma throws when the range is a strikethrough or
    // undecorated (h2d guards the same way), so entries only ever reach here
    // for runs the caller already decorated with UNDERLINE.
    if (entry.decorationStyle && typeof api.setRangeTextDecorationStyle === "function") {
      try {
        api.setRangeTextDecorationStyle.call(textNode, r.start, r.end, entry.decorationStyle);
      } catch {
        // Decorative — never fail the node.
      }
    }
    if (entry.decorationColor && typeof api.setRangeTextDecorationColor === "function") {
      const parsed = cssColorToFigmaRGB(entry.decorationColor);
      if (parsed) {
        try {
          api.setRangeTextDecorationColor.call(textNode, r.start, r.end, {
            value: { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          });
        } catch {
          // Decorative — never fail the node.
        }
      }
    }
  }
}

/**
 * Rescale a text node's visual metrics to match a CSS scale transform.
 *
 * The captured box is the AABB of the *transformed* element, so a scaled node
 * already renders at the scaled size — but `getComputedStyle().fontSize` is the
 * untransformed value (CSS transforms do not change computed font-size). Left
 * alone, a `scale(1.5)` heading gets a 1.5x box with 1.0x glyphs.
 *
 * `sx` drives the glyph size and letter-spacing (horizontal metrics), `sy` the
 * line height. Only PIXELS units are touched — PERCENT and AUTO are relative to
 * fontSize and therefore already scale with it.
 *
 * MUST run after createTextNode has fully returned: applyDeferredTextStyles()
 * links TextStyles that overwrite fontSize, lineHeight and letterSpacing, and
 * the font-size bisection measures against the unscaled captured box. Both
 * would clobber a rescale applied mid-flight.
 */
export function rescaleTextMetrics(textNode: TextNode, sx: number, sy: number): void {
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
  if (sx <= 0 || sy <= 0) return;
  if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3) return;

  // Per-range first: every run is rescaled from its own recorded size, so mixed
  // runs stay proportional. Reading the segments back beats threading the
  // converter's range list out of createTextNode, and it also picks up ranges a
  // linked TextStyle introduced.
  try {
    const segments = textNode.getStyledTextSegments(["fontSize"]) as Array<{
      start: number;
      end: number;
      fontSize?: number;
    }>;
    for (const seg of segments) {
      // A range with no fontSize is left alone rather than given an invented one.
      if (typeof seg.fontSize !== "number" || !Number.isFinite(seg.fontSize)) continue;
      textNode.setRangeFontSize(seg.start, seg.end, Math.max(8, seg.fontSize * sx));
    }
  } catch {
    // figma.mixed, a locked node, or a stub without the range API — the node
    // keeps its unscaled glyphs, which is strictly better than losing it.
  }

  try {
    const lh = textNode.lineHeight;
    // A `figma.mixed` symbol fails this guard, which is what we want.
    if (typeof lh === "object" && lh !== null && (lh as LineHeight).unit === "PIXELS") {
      textNode.lineHeight = { value: (lh as { value: number }).value * sy, unit: "PIXELS" };
    }
  } catch {
    // Non-fatal.
  }

  try {
    const ls = textNode.letterSpacing;
    if (typeof ls === "object" && ls !== null && (ls as LetterSpacing).unit === "PIXELS") {
      textNode.letterSpacing = { value: (ls as { value: number }).value * sx, unit: "PIXELS" };
    }
  } catch {
    // Non-fatal.
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
import { recordWarning } from "./diagnostics";
import { linkEffectStyleIfAvailable, linkFillStyleIfAvailable, linkStrokeStyleIfAvailable, parseFigmaLineHeight, lineHeightKeyStr, buildTextStyleKey, fontWeightToStyleCandidates, fontStyleCandidates, fontCutExactStyles, isItalicStyle, orderStylesByProximity, parseStyleName } from "./styles";
import { declaresCut, isIconFont, isPuaOnlyText, stripFontStyleSuffix } from "../utils/fontUtils";
import { isServerFallbackFamily, ORIGINAL_CUT_PLUGIN_KEY } from "./rebindFonts";
import {
  getInstalledStylesFor,
  hasFontIndex,
  isEmojiFamilyName,
  isSameFamilyName,
  normalizeFamilyKey,
  refineRequestFromPostScript,
  resolveInstalledCandidates,
  resolveInstalledCut,
} from "./fontIndex";

/** How many ranked index candidates a family resolution will try to load
 *  before falling back to the style ladder. Figma lists fonts it cannot load,
 *  so the best match is not always loadable; the cap keeps a pathological
 *  family from issuing hundreds of rejected loads per text node. */
const MAX_INDEX_CANDIDATES = 12;

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
      href: seg.href,
      letterSpacing: seg.letterSpacing,
      textCase: seg.textCase,
      lineHeight: seg.lineHeight,
      textDecorationStyle: seg.textDecorationStyle,
      textDecorationColor: seg.textDecorationColor,
      tag: seg.tag,
      textDecoration: seg.textDecoration,
      // The font this run actually rendered with — refines its weight,
      // stretch and slant at resolution time.
      platformPostScript: seg.platformPostScript ?? node.platformPostScript,
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
      platformPostScript: node.platformPostScript,
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
/**
 * Whether every segment carries the SAME typography (weight/size/family/
 * style/decoration) so a single TextStyle can represent the whole node.
 * The converter emits one segment per visual line, so multi-line paragraphs
 * are uniform by construction — bailing on segment COUNT alone silently
 * unlinked every one of them. Color differences don't matter: color is a
 * fill, not part of the TextStyle.
 */
export function segmentsShareUniformTypography(
  segments: TextSegment[],
  node: Pick<WireframeNode, "fontWeight" | "fontSize" | "fontFamily">,
): boolean {
  if (segments.length <= 1) return true;
  const first = segments[0];
  return segments.every(
    (seg) =>
      (seg.fontWeight || node.fontWeight || 400) === (first.fontWeight || node.fontWeight || 400) &&
      (seg.fontSize || node.fontSize) === (first.fontSize || node.fontSize) &&
      (seg.fontFamily || node.fontFamily) === (first.fontFamily || node.fontFamily) &&
      (seg.fontStyle || undefined) === (first.fontStyle || undefined) &&
      (seg.textDecoration || undefined) === (first.textDecoration || undefined),
  );
}

async function linkTextStyleIfApplicable(
  textNode: TextNode,
  node: WireframeNode,
  segments: TextSegment[],
  usedFontFamily: string,
  context?: RenderContext
): Promise<void> {
  if (
    !context ||
    context.variableMode !== "styles" ||
    !context.textStyleMap ||
    segments.length === 0 ||
    // Only true per-range variation must keep direct properties — a
    // TextStyle would flatten it. Uniform multi-segment nodes (one segment
    // per line) link like single-segment ones.
    !segmentsShareUniformTypography(segments, node) ||
    // Italic nodes: the weight-based TextStyle has no italic, so linking it
    // would overwrite the italic cut already applied. Keep the direct font.
    segments.some((seg) => isItalicStyle(seg.fontStyle)) ||
    isItalicStyle(node.fontStyle)
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
      await textNode.setTextStyleIdAsync(textStyle.id);

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

/**
 * Does a space have to be invented between two adjacent segments?
 *
 * The extractor hands us runs whose boundary whitespace the browser collapsed
 * away, so a separator is normally restored here. Segments produced by the
 * inline run merge (rendering/textRunMerge.ts) already carry every separator
 * the browser painted — inventing another one there would shift every glyph
 * after it, which is exactly what `exactSegments` forbids.
 */
function needsSeparator(
  node: Pick<WireframeNode, "exactSegments">,
  prevText: string,
  text: string,
): boolean {
  if (node.exactSegments) return false;
  return !/\s$/.test(prevText) && !/^\s/.test(text);
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
  if (!__W2W_DEV_LOG__) return createTextNodeInner(node, fontFamily, context);
  return perf.timed("node.text", () =>
    createTextNodeInner(node, fontFamily, context)
  );
}

async function createTextNodeInner(
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
  const mainCandidates = fontStyleCandidates(node.fontWeight, isItalicStyle(node.fontStyle));
  let mainFontStyle = mainCandidates[0];

  // Load required fonts — include all candidates so the loader can fall back
  const fontsToLoad = new Set<string>();
  for (const c of mainCandidates) fontsToLoad.add(c);
  for (const seg of segments) {
    for (const c of fontStyleCandidates(seg.fontWeight, isItalicStyle(seg.fontStyle))) {
      fontsToLoad.add(c);
    }
  }

  // Wireframe lines mode: use FILLR font (squiggly wireframe lines)
  // FILLR only has Regular style, so force all weights to Regular
  if (context?.fontMode === "lines") {
    const fillrFont = "FILLR";
    if (!(await loadFontCached(fillrFont, "Regular"))) {
      // FILLR not installed — fall back to Inter
      await loadFontCached("Inter", "Regular");
    }

    textNode.fontName = { family: fillrFont, style: "Regular" };

    const fullText = segments.length > 1
      ? segments.map((s, i) => {
          if (i > 0 && needsSeparator(node, segments[i - 1].text, s.text)) {
            return " " + s.text;
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
    // LEFT, JUSTIFY and empty land here. CSS logical `start`/`end` must NOT:
    // the converter resolves them against `direction` (resolveTextAlign in
    // css-converter.ts) before this point. If one ever reaches this branch it
    // renders left-aligned regardless of direction — that is a converter bug,
    // not something to paper over here.
    else textNode.textAlignHorizontal = "LEFT";

    return textNode;
  }

  // Resolve font using fontMapping (multi-font) or legacy missingFont (single-font)
  let targetFont: string;
  if (context?.fontMode === "plugin") {
    // Plugin mode: use fontMapping if available, otherwise single plugin font
    const nodeFont = node.fontFamily || fontFamily;
    if (isIconFont(nodeFont) || isPuaOnlyText(node.textContent ?? "")) {
      // Preserve icon font — remapping would break glyph rendering.
      // PUA-only text is an icon glyph even when the family name doesn't
      // match the known icon-font list (site-specific fonts like "glyphs").
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
  const loadOne = (family: string, style: string): Promise<boolean> =>
    loadFontCached(family, style);
  const tryLoad = async (family: string, style: string): Promise<boolean> =>
    __W2W_DEV_LOG__
      ? perf.timed("node.font", () => loadOne(family, style), true)
      : loadOne(family, style);

  // Helper: try a family with multiple styles, return first that works
  const tryLoadWithStyles = async (family: string, styles: string[]): Promise<string | null> => {
    for (const style of styles) {
      if (await tryLoad(family, style)) return style;
    }
    return null;
  };

  // The node's own cut, as the CSS declared it and as the font that actually
  // rendered reports it. `platformPostScript` is the only channel through
  // which a variable font's resolved axes or a non-obvious cut name reach us
  // — the CSS carries neither font-stretch nor font-variation-settings.
  const nodeItalic = isItalicStyle(node.fontStyle);
  const nodeRequest = refineRequestFromPostScript(
    { family: "", weight: node.fontWeight, italic: nodeItalic },
    node.platformPostScript,
  );

  /**
   * A segment's cut, refined the same way the node's is. Without this the
   * per-segment style would be re-derived from the CSS weight alone and
   * overwrite a node font that the PostScript name had corrected.
   */
  const segmentRequest = (seg: TextSegment) =>
    refineRequestFromPostScript(
      {
        family: "",
        weight: seg.fontWeight ?? node.fontWeight,
        italic: isItalicStyle(seg.fontStyle) || nodeItalic,
      },
      seg.platformPostScript ?? node.platformPostScript,
    );

  /**
   * Ask the installed-font index for the cut of `family` closest to the
   * request, then load exactly that one — instead of throwing a dozen guessed
   * style names at `loadFontAsync` and catching the rejections.
   *
   * Falls back to the guess ladder when the index can't answer (no
   * `listAvailableFontsAsync`, or the matched cut refuses to load), so this is
   * strictly additive: anything that resolved before still resolves.
   */
  // Emoji and text families are partitioned by what the RUN asks for, not by
  // the candidate family: an emoji font sitting in a CSS fallback stack must
  // never render a text run, however far down the ladder we get.
  const runWantsEmoji = isEmojiFamilyName(node.fontFamily || targetFont);

  const resolveFamilyCut = async (
    family: string,
    fallbackStyles: string[],
    opts: { exact?: boolean; weight?: number; italic?: boolean } = {},
  ): Promise<{ family: string; style: string } | null> => {
    if (!family) return null;
    if (!runWantsEmoji && isEmojiFamilyName(family)) return null;
    // Walk the ranked candidates rather than trusting the single best. Figma
    // lists fonts it cannot load — stripe.com's Söhne appears both as the
    // loadable "S?hne VF" and as a "Söhne VF" whose every load throws — and
    // both share one normalized key. Stopping at the winner drops the run to
    // Inter while a real cut of the same face waits one place down.
    const candidates = await resolveInstalledCandidates({
      family,
      weight: opts.weight ?? nodeRequest.weight,
      stretch: nodeRequest.stretch,
      italic: opts.italic ?? nodeRequest.italic,
      exact: opts.exact,
      allowEmoji: runWantsEmoji,
    });
    for (const hit of candidates.slice(0, MAX_INDEX_CANDIDATES)) {
      if (await tryLoad(hit.family, hit.style)) {
        return { family: hit.family, style: hit.style };
      }
    }
    // `exact` has no ladder equivalent that can be trusted — the caller only
    // switches families on an exact hit, and the ladder's nearest-cut
    // semantics would turn that into a near miss.
    if (opts.exact && hasFontIndex()) return null;
    const style = await tryLoadWithStyles(family, fallbackStyles);
    return style ? { family, style } : null;
  };

  // Build list of styles to try (icon fonts get extra FA-specific styles).
  // PUA-only text counts as icon regardless of the family name, so unknown
  // site icon fonts never walk the CSS fallback chain into a text font
  // (which would render the glyph as mojibake).
  const isIcon = isIconFont(targetFont) || isPuaOnlyText(node.textContent ?? "");
  const allStylesToTry = isIcon
    ? Array.from(new Set([...fontStyles, ...ICON_FONT_EXTRA_STYLES]))
    : fontStyles;

  let loaded = false;

  // Step 0: "Use original fonts" flow — fontMapping routes this family to a
  // substitute (Inter) so it can be rebound after the user installs the
  // download. But when the ORIGINAL family — under its CSS name or its real
  // SFNT name — is ALREADY installed with a cut for this weight, render it
  // directly: no substitute round-trip, no marker, no Re-apply needed. This
  // is what keeps a partially-installed site font on its installed cuts
  // instead of pushing every node to Inter.
  if (
    context?.fontMode === "website" &&
    context.originalFontNames &&
    node.fontFamily &&
    targetFont !== node.fontFamily
  ) {
    const realName = context.originalFontNames[node.fontFamily];
    if (realName) {
      const origStyles = isIconFont(node.fontFamily)
        ? Array.from(new Set([...fontStyles, ...ICON_FONT_EXTRA_STYLES]))
        : fontStyles;
      const origFamilies = Array.from(new Set([realName, node.fontFamily]));
      for (const fam of origFamilies) {
        const hit = await resolveFamilyCut(fam, origStyles);
        if (hit) {
          usedFontFamily = hit.family;
          mainFontStyle = hit.style;
          loaded = true;
          break;
        }
      }
      // The family is installed but ships no cut for this weight (apple.com:
      // SF Pro Text without a Light cut for its 300 text). "Use original
      // fonts" means exactly that — take the family's nearest installed cut
      // rather than handing the whole node to Inter.
      if (!loaded) {
        for (const fam of origFamilies) {
          const installed = await getInstalledStylesFor(fam);
          if (installed.length === 0) continue;
          const rStyle = await tryLoadWithStyles(
            fam,
            orderStylesByProximity(installed, node.fontWeight, isItalicStyle(node.fontStyle)),
          );
          if (rStyle) {
            usedFontFamily = fam;
            mainFontStyle = rStyle;
            loaded = true;
            break;
          }
        }
      }
    }
  }

  // Step 0.5: Real-family exact cut. The no-modal counterpart of Step 0 — it
  // runs when the family was NOT mapped away, i.e. the availability check
  // considered this family fine. A downloaded cut often registers under the
  // family's real (SFNT) name rather than its CSS name: web2wireframe.design's
  // Space Grotesk 600 installs as "Space Grotesk Light" / SemiBold. Without
  // this, Step 1's candidate ladder would silently settle for Bold.
  //
  // Only the EXACT cut justifies switching families, and only when the CSS
  // family can't supply it — otherwise a page whose 400 and 700 render fine
  // would have every node renamed to the real family.
  let resolvedViaRealFamily = false;
  if (
    !loaded &&
    !isIcon &&
    context?.fontMode === "website" &&
    node.fontFamily &&
    targetFont === node.fontFamily
  ) {
    const realName = context.fontRealNames?.[node.fontFamily];
    if (realName && realName !== node.fontFamily) {
      const exact = fontCutExactStyles(node.fontWeight, isItalicStyle(node.fontStyle));
      const own = await resolveFamilyCut(targetFont, exact, { exact: true });
      if (own) {
        usedFontFamily = own.family;
        mainFontStyle = own.style;
        loaded = true;
        resolvedViaRealFamily = own.family !== targetFont;
      } else {
        const real = await resolveFamilyCut(realName, exact, { exact: true });
        if (real) {
          usedFontFamily = real.family;
          mainFontStyle = real.style;
          loaded = true;
          resolvedViaRealFamily = true;
        }
      }
    }
  }

  // Step 1: Try target font with all style variants
  const found = loaded ? null : await resolveFamilyCut(targetFont, allStylesToTry);
  if (found) {
    usedFontFamily = found.family;
    mainFontStyle = found.style;
    loaded = true;
  }

  // Step 2: Try suffix-stripped version (e.g., "FA 6 Brands Regular" → "FA 6 Brands" + "Regular")
  if (!loaded) {
    const stripped = stripFontStyleSuffix(targetFont);
    if (stripped) {
      const strippedStyles = isIcon
        ? Array.from(new Set([stripped.style, ...allStylesToTry]))
        : [stripped.style, ...fontStyles];
      const sFound = await resolveFamilyCut(stripped.family, strippedStyles);
      if (sFound) {
        usedFontFamily = sFound.family;
        mainFontStyle = sFound.style;
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
        const vFound = await resolveFamilyCut(altFamily, allStylesToTry);
        if (vFound) {
          usedFontFamily = vFound.family;
          mainFontStyle = vFound.style;
          loaded = true;
          break;
        }
      }
    }
  }

  // Step 3.5: Same-family installed-style rescue. The family IS installed,
  // just not under any weight-candidate style name — e.g. SF Pro Display with
  // only a Regular cut for a weight-600 headline, or Söhne shipping the single
  // non-standard cut "Buch". CSS never falls to the next family for a missing
  // weight (browsers synthesize within the first available family), so the
  // closest installed cut of the CORRECT family beats fallback families and
  // Inter. The proper cut arrives later via the download + re-apply flow.
  //
  // The family's real (SFNT) name belongs in this list: an installed file
  // registers under the name in its `name` table, not under the CSS name that
  // asked for it — telex.ge declares `glyphs`, the file installs as "icomoon".
  // Unlike Step 0.5 this runs for ICON fonts too: `isIcon` decides which
  // STYLES we try, never which family NAMES.
  let rescuedViaRealFamily = false;
  if (!loaded) {
    const stripped = stripFontStyleSuffix(targetFont);
    const realName =
      context?.fontMode === "website" && node.fontFamily
        ? context.fontRealNames?.[node.fontFamily]
        : undefined;
    const rescueFamilies = Array.from(
      new Set([
        targetFont,
        ...(stripped ? [stripped.family] : []),
        ...(realName ? [realName] : []),
      ]),
    );
    for (const fam of rescueFamilies) {
      const installedStyles = await getInstalledStylesFor(fam);
      if (installedStyles.length === 0) continue;
      const ordered = orderStylesByProximity(
        installedStyles,
        node.fontWeight,
        isItalicStyle(node.fontStyle),
      );
      const rFound = await resolveFamilyCut(fam, ordered);
      if (rFound) {
        usedFontFamily = rFound.family;
        mainFontStyle = rFound.style;
        loaded = true;
        rescuedViaRealFamily = rFound.family === realName;
        break;
      }
    }
  }

  // Step 4: Try CSS fallback chain (non-icon fonts only)
  if (!loaded && !isIcon) {
    for (const fallback of fallbackList) {
      if (fallback === targetFont) continue;
      const fFound = await resolveFamilyCut(fallback, fontStyles);
      if (fFound) {
        usedFontFamily = fFound.family;
        mainFontStyle = fFound.style;
        loaded = true;
        break;
      }
    }
  }

  // Step 5: Try popup choice font (non-icon fonts only)
  if (!loaded && fontFamily !== targetFont && !isIcon) {
    const cFound = await resolveFamilyCut(fontFamily, fontStyles);
    if (cFound) {
      usedFontFamily = cFound.family;
      mainFontStyle = cFound.style;
      loaded = true;
    }
  }

  // Step 7: Final fallback — Inter, keeping the requested weight (a bold
  // heading must not collapse to Inter Regular; Inter ships every cut).
  if (!loaded) {
    usedFontFamily = "Inter";
    const inter = await resolveFamilyCut("Inter", fontStyles);
    if (inter) {
      usedFontFamily = inter.family;
      mainFontStyle = inter.style;
    } else {
      mainFontStyle = "Regular";
      await loadFontCached("Inter", "Regular");
    }
  }

  // Set initial font (may fail for fonts that aren't installed)
  try {
    textNode.fontName = { family: usedFontFamily, style: mainFontStyle };
  } catch {
    const stripped = stripFontStyleSuffix(usedFontFamily);
    let recovered = false;
    if (stripped && (await loadFontCached(stripped.family, stripped.style))) {
      try {
        textNode.fontName = { family: stripped.family, style: stripped.style };
        recovered = true;
      } catch { /* suffix stripping didn't help */ }
    }
    if (!recovered) {
      await loadFontCached("Inter", "Regular");
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
  // The marker is stamped on EVERY family substitution, modal or not: when
  // the availability check passes but the family still fails at render time
  // (or a fallback family/Inter was used without a popup), the CSS family
  // itself is the marker — installing the font later + "Re-apply fonts"
  // recovers it. `originalFontNames` (real SFNT names from the modal flow)
  // still wins when present. Icon fonts are included: the download ZIP makes
  // them installable, so a tofu glyph becomes recoverable via Re-apply.
  // No marker when the rendered family already IS the marker target
  // (Step 0 applied the real SFNT name directly).
  // Step 0.5 / Step 3.5 real-family resolutions are excluded: the node already
  // shows the family the page asked for, just registered under its real name.
  // A marker there would advertise a Re-apply with nothing to do.
  let stampedFamilyMarker = false;
  if (
    context?.fontMode === "website" &&
    node.fontFamily &&
    !isSameFamilyName(usedFontFamily, node.fontFamily) &&
    !resolvedViaRealFamily &&
    !rescuedViaRealFamily
  ) {
    // The real (SFNT) name backs up the modal's map: on a no-modal import
    // `originalFontNames` is empty, and a marker naming the CSS-only family
    // ("glyphs") can never be satisfied — no installed font carries that name.
    const markerName =
      context.originalFontNames?.[node.fontFamily] ||
      context.fontRealNames?.[node.fontFamily] ||
      node.fontFamily;
    // No marker for Linux server fallback families (Liberation Sans,
    // Noto * CJK …) — they're never in the download ZIP, so a marker naming
    // them would strand the Re-apply modal on an un-installable font.
    // NORMALIZED: Figma renders a family under a spelling of its own — Söhne
    // installs as "S?hne VF" while its real SFNT name is "Söhne VF". The run
    // already shows the wanted font; a marker here would file a resolved layer
    // as "still showing Inter" (386 of them on one stripe.com import).
    const markerIsWhatWeDrew =
      !!markerName && isSameFamilyName(markerName, usedFontFamily);
    if (markerName && !markerIsWhatWeDrew && !isServerFallbackFamily(markerName)) {
      try {
        textNode.setPluginData("w2w_original_font", markerName);
        stampedFamilyMarker = true;
      } catch {
        // setPluginData unavailable in some test environments; non-fatal.
      }
    }
    // Report the substitution. The marker above makes it RECOVERABLE (install
    // the font, hit Re-apply); this makes it VISIBLE — until now the swap was
    // silent, so a page rendered entirely in Inter looked intentional.
    // Only a REAL substitution is worth reporting: drawing the wanted font
    // under Figma's own spelling is a success, not a warning.
    if (!markerIsWhatWeDrew) recordWarning(context, {
      category: "typography",
      message: `Font "${node.fontFamily}" not available — rendered with "${usedFontFamily}"`,
      nodeId: textNode.id,
      layerName: textNode.name || node.name,
    });
  }

  // Cut-level marker: the family landed correctly but the WEIGHT didn't — a
  // 600 heading rendered with the family's Bold because no 600 file is
  // installed. The family marker above never fires here (same family in and
  // out), so before this the download was a dead end: install the file and
  // nothing could apply it. Recording the wanted cut lets "Re-apply fonts"
  // pick it up. Gated on a declared @font-face at that weight — telex.ge fakes
  // bold from a single 400 file, and offering a Re-apply for a cut that exists
  // nowhere is the same noise the download modal was taught to avoid.
  if (
    context?.fontMode === "website" &&
    !stampedFamilyMarker &&
    !resolvedViaRealFamily &&
    !isIcon &&
    node.fontFamily &&
    !isServerFallbackFamily(node.fontFamily)
  ) {
    const realName = context.fontRealNames?.[node.fontFamily];
    const familyIsRight =
      isSameFamilyName(usedFontFamily, node.fontFamily) ||
      (!!realName && isSameFamilyName(usedFontFamily, realName));
    // A variable family covers its whole range from one file: Figma exposes
    // named instances ("Buch"), never a Light or a Medium, so a near-weight
    // draw is the best that exists. Marking it pending promises a Re-apply no
    // install can satisfy — the modal would never close (stripe.com sohne-var).
    const isVariableFamily =
      context.fontVariableFamilies?.includes(node.fontFamily) === true;
    const wantItalic = isItalicStyle(node.fontStyle);
    const applied = parseStyleName(mainFontStyle);
    if (
      familyIsRight &&
      !isVariableFamily &&
      (applied.weight !== node.fontWeight || applied.italic !== wantItalic) &&
      declaresCut(context.fontDeclaredCuts?.[node.fontFamily], {
        weight: node.fontWeight,
        italic: wantItalic,
      })
    ) {
      // Both names, real one first: at render time we can't know which the
      // user's eventual install will register under.
      const families = Array.from(
        new Set([...(realName ? [realName] : []), node.fontFamily]),
      );
      try {
        textNode.setPluginData(
          ORIGINAL_CUT_PLUGIN_KEY,
          JSON.stringify({ families, weight: node.fontWeight, italic: wantItalic }),
        );
      } catch {
        // setPluginData unavailable in some test environments; non-fatal.
      }
      // Right family, wrong cut — a 600 heading wearing the family's Bold.
      // Reported separately from a family swap: the fix is a different file,
      // not a different font.
      recordWarning(context, {
        category: "typography",
        message: `Weight ${node.fontWeight}${wantItalic ? " italic" : ""} of "${node.fontFamily}" not installed — rendered as "${mainFontStyle}"`,
        nodeId: textNode.id,
        layerName: textNode.name || node.name,
      });
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
  for (const w of [
    nodeRequest.weight ?? node.fontWeight,
    ...segments.map((s) => segmentRequest(s).weight ?? s.fontWeight),
  ]) {
    if (seenWeights.has(w)) continue;
    seenWeights.add(w);
    uniqueWeights.push(w);
  }
  const indexedPreload = hasFontIndex();
  for (const w of uniqueWeights) {
    if (indexedPreload) {
      // One lookup, one load. The old loop threw every candidate spelling at
      // loadFontAsync for every weight of every text node.
      const hit = await resolveInstalledCut({
        family: usedFontFamily,
        weight: w,
        stretch: nodeRequest.stretch,
        italic: nodeRequest.italic,
        allowEmoji: runWantsEmoji,
      });
      if (
        hit &&
        hit.family === usedFontFamily &&
        !loadedStylesForUsedFont.has(hit.style) &&
        (await tryLoad(usedFontFamily, hit.style))
      ) {
        loadedStylesForUsedFont.add(hit.style);
      }
      continue;
    }
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
        if (i > 0 && needsSeparator(node, segments[i - 1].text, text)) {
          return " " + text;
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

  // Per-range typography (letterSpacing / textCase / lineHeight) and
  // decoration detail. Collected here, applied at the very end: the node-level
  // setters for all three run AFTER this loop and cover every character, and a
  // linked TextStyle would overwrite them again.
  const pendingRangeTypography: Array<{
    start: number;
    end: number;
    letterSpacing?: number;
    textCase?: NonNullable<TextSegment["textCase"]>;
    lineHeight?: number | string;
    decorationStyle?: "SOLID" | "DOTTED" | "WAVY";
    decorationColor?: string;
  }> = [];

  // Hyperlinks. One link covering every run is the whole-node case (cheaper,
  // and what a plain `<a>text</a>` produces); several different links — or one
  // link next to unlinked text — need a range each, because the node-level
  // setter paints the link over EVERY character.
  const segmentHrefs = new Set(segments.map((s) => s.href).filter(Boolean) as string[]);
  const useRangeHyperlinks =
    segments.length > 1 &&
    (segmentHrefs.size > 1 || (segmentHrefs.size === 1 && segments.some((s) => !s.href)));
  // A run inside an <a> knows the URL even when the node itself doesn't.
  const nodeHyperlinkHref =
    node.href ?? (!useRangeHyperlinks && segmentHrefs.size === 1
      ? Array.from(segmentHrefs)[0]
      : undefined);

  // Per-range font sizes recorded for the fontSize bisection below: setting
  // the node's base fontSize clobbers every range, so the search replays
  // these scaled by the same factor to keep mixed-size runs proportional.
  const appliedRangeFontSizes: Array<{ start: number; end: number; fontSize: number }> = [];

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
        await textNode.setFillStyleIdAsync(baseLinkedStyle.id);
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
    // Per-run record of which segments were substituted (their real font was
    // missing at render). A later Re-apply rebinds ONLY these ranges, so runs
    // already showing their correct font (e.g. a Newsreader <em>) are never
    // overwritten. Each entry: the char range + the real family it should become.
    const substitutedSegments: Array<{ start: number; end: number; family: string }> = [];
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const segment = segments[segIdx];

      // Account for added separator space between segments
      let addedSeparator = 0;
      if (segIdx > 0 && needsSeparator(node, segments[segIdx - 1].text, segment.text)) {
        addedSeparator = 1;
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
          await textNode.setRangeFillStyleIdAsync(startIdx, endIdx, linkedStyle.id);
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
      const segCandidates = fontStyleCandidates(segment.fontWeight, isItalicStyle(segment.fontStyle));
      const segStyle = segCandidates[0];

      let segFontFamily: string;
      if (context?.fontMode === "plugin") {
        const segFont = segment.fontFamily || usedFontFamily;
        if (isIconFont(segFont) || isPuaOnlyText(segment.text ?? "")) {
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

      const isSegIcon = isIconFont(segFontFamily) || isPuaOnlyText(segment.text ?? "");
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

        // Step 0: mapped-away original (see node-level Step 0) — when this
        // run's ORIGINAL family (CSS or real SFNT name) is already installed,
        // render it directly instead of the substitute.
        if (context?.fontMode === "website" && context.originalFontNames) {
          const segOrigCss = segment.fontFamily || node.fontFamily;
          const segRealName = segOrigCss ? context.originalFontNames[segOrigCss] : undefined;
          if (segOrigCss && segRealName && segFontFamily !== segOrigCss) {
            for (const fam of Array.from(new Set([segRealName, segOrigCss]))) {
              const famStyles = isIconFont(fam)
                ? Array.from(new Set([...segCandidates, ...ICON_FONT_EXTRA_STYLES]))
                : segCandidates;
              for (const sty of famStyles) {
                if (await tryLoad(fam, sty)) {
                  resolvedSegFont = fam;
                  resolvedSegStyle = sty;
                  segLoaded = true;
                  break;
                }
              }
              if (segLoaded) break;
            }
          }
        }

        // Step 1: Try segment font with all style variants
        if (!segLoaded) {
          for (const sty of segStylesToTry) {
            if (await tryLoad(segFontFamily, sty)) {
              resolvedSegStyle = sty;
              segLoaded = true;
              break;
            }
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

        // Step 2.5: the run's real (SFNT) family — the node-level Step 3.5 for
        // runs. Step 0 above can't cover this: it reads `originalFontNames`
        // (modal-only) and requires the run to have been mapped away, which is
        // false on a no-modal import. Without it an inline icon run whose CSS
        // family only exists in the stylesheet ("glyphs" → "icomoon") falls to
        // the node font and strands a marker Re-apply can never satisfy.
        if (!segLoaded && context?.fontMode === "website") {
          const segCssFamily = segment.fontFamily || node.fontFamily;
          const segRealFamily = segCssFamily
            ? context.fontRealNames?.[segCssFamily]
            : undefined;
          if (segRealFamily && segRealFamily !== segFontFamily) {
            for (const sty of segStylesToTry) {
              if (await tryLoad(segRealFamily, sty)) {
                resolvedSegFont = segRealFamily;
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
        if (stripped && (await loadFontCached(stripped.family, stripped.style))) {
          try {
            textNode.setRangeFontName(startIdx, endIdx, { family: stripped.family, style: stripped.style });
          } catch { /* keep default */ }
        }
      }

      // Record this run for Re-apply when its font was substituted. The
      // marker carries the real (SFNT) name when the modal knows it, else
      // the CSS family itself — same rule as the node-level marker. Icon
      // runs are included: the download ZIP makes icon fonts installable,
      // so a tofu glyph becomes recoverable via Re-apply.
      if (context?.fontMode === "website") {
        const segOriginalCss = segment.fontFamily || node.fontFamily;
        const segMarker = segOriginalCss
          ? context.originalFontNames?.[segOriginalCss] ||
            context.fontRealNames?.[segOriginalCss] ||
            segOriginalCss
          : undefined;
        if (
          segMarker &&
          resolvedSegFont !== segMarker &&
          resolvedSegFont !== segOriginalCss &&
          // Same rule as the node-level marker: server fallback families are
          // never installable — recording them would strand Re-apply.
          !isServerFallbackFamily(segMarker)
        ) {
          substitutedSegments.push({ start: startIdx, end: endIdx, family: segMarker });
        }
      }

      if (segment.fontSize && segment.fontSize !== node.fontSize) {
        const rangeSize = Math.max(segment.fontSize, 8);
        textNode.setRangeFontSize(startIdx, endIdx, rangeSize);
        appliedRangeFontSizes.push({ start: startIdx, end: endIdx, fontSize: rangeSize });
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
        // Skip linking for italic runs: the TextStyle key/name is weight-based
        // (no italic), so linking it would overwrite the italic font we just
        // applied via setRangeFontName. Keep the directly-applied italic cut.
        if (segTextStyle && !isItalicStyle(segment.fontStyle)) {
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

      // This run's own link (h2d parity) — three links in a paragraph get
      // three ranges instead of the node-level setter's single winner.
      if (useRangeHyperlinks && segment.href) {
        const r = safeRange(textNode, startIdx, endIdx);
        const setRangeHyperlink = (textNode as unknown as {
          setRangeHyperlink?: (s: number, e: number, v: HyperlinkTarget | null) => void;
        }).setRangeHyperlink;
        if (r && typeof setRangeHyperlink === "function") {
          try {
            setRangeHyperlink.call(textNode, r.start, r.end, {
              type: "URL",
              value: segment.href,
            });
          } catch {
            // Figma rejected the URL — keep the run, drop the link.
          }
        }
      }

      // Per-run typography, but only where it actually differs from the node —
      // these properties inherit in CSS, so most runs report their host's value
      // and setting them again would be pure overhead.
      const segLetterSpacing =
        typeof segment.letterSpacing === "number" &&
        segment.letterSpacing !== (node.letterSpacing || 0)
          ? segment.letterSpacing
          : undefined;
      const segTextCase =
        segment.textCase && segment.textCase !== (node.textCase ?? "ORIGINAL")
          ? segment.textCase
          : undefined;
      const segLineHeight =
        segment.lineHeight !== undefined &&
        !figmaLineHeightsEqual(segment.lineHeight, node.lineHeight)
          ? segment.lineHeight
          : undefined;

      // Underline detail. Gated on the run being an UNDERLINE: Figma throws
      // when style/colour are set on a strikethrough or an undecorated range
      // (h2d guards the same way).
      const segUnderlined = segment.textDecoration === "underline";
      const segDecorationStyle =
        segUnderlined && segment.textDecorationStyle &&
        segment.textDecorationStyle !== node.textDecorationStyle
          ? segment.textDecorationStyle
          : undefined;
      const segDecorationColor =
        segUnderlined && segment.textDecorationColor &&
        segment.textDecorationColor !== node.textDecorationColor
          ? segment.textDecorationColor
          : undefined;

      if (
        segLetterSpacing !== undefined || segTextCase || segLineHeight !== undefined ||
        segDecorationStyle || segDecorationColor
      ) {
        pendingRangeTypography.push({
          start: startIdx,
          end: endIdx,
          letterSpacing: segLetterSpacing,
          textCase: segTextCase,
          lineHeight: segLineHeight,
          decorationStyle: segDecorationStyle,
          decorationColor: segDecorationColor,
        });
      }
    }

    // Stamp the substituted runs so Re-apply rebinds ONLY these ranges. A
    // mixed block can mix several real families; the node-level marker alone
    // would clobber the runs that already show their correct font.
    if (substitutedSegments.length > 0) {
      try {
        textNode.setPluginData(
          "w2w_original_font_segments",
          JSON.stringify(substitutedSegments),
        );
      } catch {
        // setPluginData unavailable in some test environments; non-fatal.
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
        await textNode.setFillStyleIdAsync(linkedStyle.id);
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
    const segReq = segmentRequest(segment);
    let segStyle = mainFontStyle;
    const segHit = await resolveInstalledCut({
      ...segReq,
      family: usedFontFamily,
      allowEmoji: runWantsEmoji,
    });
    if (segHit && segHit.family === usedFontFamily && loadedStylesForUsedFont.has(segHit.style)) {
      segStyle = segHit.style;
    } else {
      for (const c of fontWeightToStyleCandidates(segReq.weight ?? segment.fontWeight)) {
        if (loadedStylesForUsedFont.has(c)) {
          segStyle = c;
          break;
        }
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
  // Physical values only. CSS logical `start`/`end` are resolved against the
  // element's `direction` in the converter (resolveTextAlign in
  // css-converter.ts), so they never reach here — mapping them again would
  // re-encode the left-to-right assumption this map used to carry.
  const alignMap: Record<string, "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"> = {
    left: "LEFT",
    center: "CENTER",
    right: "RIGHT",
    justify: "JUSTIFIED",
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

  // text-transform uppercase/lowercase — Figma renders the transform while
  // the stored string keeps the author's casing (h2d parity).
  if (node.textCase) {
    try {
      textNode.textCase = node.textCase;
    } catch {
      // Non-fatal — worst case the text shows source casing.
    }
  }

  // Geometry-derived vertical ink alignment. The converter emits CENTER both
  // for text painted centered inside a taller box AND as the default when the
  // node box equals the measured ink box (h2d parity — cancels substituted-
  // font ascent drift), BOTTOM for bottom-hugging ink. Unset = taller box
  // with top-hugging ink → keep Figma's default TOP.
  if (node.textAlignVertical) {
    textNode.textAlignVertical = node.textAlignVertical;
  }

  // Base-state decoration style/color (dotted/wavy, tinted underlines).
  if (node.textDecorationStyle) {
    try {
      textNode.textDecorationStyle = node.textDecorationStyle;
    } catch {
      // Requires a decoration line — skip silently when absent.
    }
  }
  if (node.textDecorationColor) {
    try {
      const parsed = cssColorToFigmaRGB(node.textDecorationColor);
      if (parsed) {
        textNode.textDecorationColor = {
          value: { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
        };
      }
    } catch {
      // Decorative — never fail the node.
    }
  }

  // -webkit-text-stroke → glyph stroke. CSS centers the stroke on the glyph
  // edge, so strokeAlign CENTER matches.
  if (node.textStroke) {
    try {
      const parsed = cssColorToFigmaRGB(node.textStroke.color);
      if (parsed) {
        textNode.strokes = [{ type: "SOLID", color: parsed.color, opacity: parsed.opacity }];
        textNode.strokeWeight = node.textStroke.width;
        textNode.strokeAlign = "CENTER";
      }
    } catch {
      // Decorative — never fail the node.
    }
  }

  // CSS text-shadow → DROP_SHADOW on the TextNode itself. Effects on a
  // wrapper box render visibly differently from a shadow on the glyphs.
  if (node.textShadowEffects && node.textShadowEffects.length > 0) {
    try {
      textNode.effects = node.textShadowEffects
        .filter((fx) => fx.type === "DROP_SHADOW" && fx.color && fx.offset)
        .map((fx) => ({
          type: "DROP_SHADOW" as const,
          visible: true,
          color: { r: fx.color!.r, g: fx.color!.g, b: fx.color!.b, a: fx.color!.a },
          offset: { x: fx.offset!.x, y: fx.offset!.y },
          radius: fx.radius || 0,
          spread: 0,
          blendMode: "NORMAL" as const,
          showShadowBehindNode: false,
        }));
    } catch {
      // Effects are decorative — never fail the text node over them.
    }
  }

  // Captured <a href> → clickable hyperlink (h2d parity). Skipped once the
  // runs carry their own links: this setter covers the whole node and would
  // overwrite every range set above.
  if (nodeHyperlinkHref && !useRangeHyperlinks) {
    try {
      textNode.hyperlink = { type: "URL", value: nodeHyperlinkHref };
    } catch {
      // Invalid URL for Figma — keep the text without a link.
    }
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
  const applyDeferredTextStyles = async (): Promise<void> => {
    // Per-range links (multi-segment text)
    for (const link of pendingTextStyleLinks) {
      try {
        await textNode.setRangeTextStyleIdAsync(link.startIdx, link.endIdx, link.styleId);
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
    await linkTextStyleIfApplicable(textNode, node, segments, usedFontFamily, context);
    // Per-range typography LAST: a linked TextStyle carries its own
    // lineHeight/letterSpacing and would overwrite the ranges otherwise.
    applyPendingRangeTypography(textNode, pendingRangeTypography);
  };

  // Special cases: always HUG
  // BUT NOT for block-level elements — they need browser width for correct text-align
  // Block elements (h1-h6, p, div, li) take container width, not content width.
  // HUG would shrink them to text content width, breaking center/right alignment.
  const isBlock = isBlockLevelElement(node);
  if (!isBlock && (node.layoutSizingHorizontal === "HUG" || isSingleChar || isVeryNarrow || isInlineElement)) {
    textNode.textAutoResize = "WIDTH_AND_HEIGHT";
    // Figma collapses trailing spaces on width-hugging text, shrinking the
    // box vs the browser's — rewrite them to NBSP (h2d parity).
    protectTrailingSpaces(textNode);
    await applyDeferredTextStyles();
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
    await applyDeferredTextStyles();
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
    await applyDeferredTextStyles();
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
    textNode.resize(hugWidth + TEXT_RESIZE_SLACK, browserHeight);
    textNode.textAutoResize = "NONE";
  } else if (widthDiff > 1) {
    // Text is WIDER in Figma than browser (font metrics differ)

    if (browserLineCount > 1) {
      // Multi-line text — check if hugWidth is close or fits in parent
      if (Math.abs(hugWidth - browserWidth) <= 1) {
        // Font metrics nearly identical — use hugWidth
        textNode.resize(hugWidth + TEXT_RESIZE_SLACK, browserHeight);
      // } else if (hugWidth > browserWidth && parentWMulti > 0 && hugWidth <= parentWMulti) {
      //   // Plugin font wider but fits in parent — use hugWidth to prevent wrapping
      //   // DISABLED: This caused block elements (li, p) to use Figma's HUG width (~328px)
      //   // instead of browser's textBounds width (~281px), making text boxes too wide.
      //   textNode.resize(hugWidth, browserHeight);
      } else {
        // hugWidth too large or no parent info — use browser dimensions
        textNode.resize(browserWidth + TEXT_RESIZE_SLACK, browserHeight);
      }
      textNode.textAutoResize = "NONE";
    } else {
      // Single-line text: HUG is wider than browser width
      const parentW = context?.parentWidth || 0;

      if (parentW > 0 && hugWidth <= parentW) {
        // HUG fits within parent container — use HUG width (no truncation needed)
        // This prevents unnecessary text wrapping when plugin font is slightly wider
        textNode.resize(hugWidth + TEXT_RESIZE_SLACK, browserHeight);
        textNode.textAutoResize = "NONE";
      } else {
        // HUG exceeds parent OR no parent info: binary-search fontSize until
        // the rendered ink fits the captured box (h2d parity — bisection
        // between fontSize/2 and fontSize, 0.2px convergence). A substituted
        // font that renders ~8% wider now shrinks by the exact factor needed
        // and keeps every word, instead of truncating with an ellipsis.
        //
        // Inside auto layout the parent would stretch/shrink the node during
        // measurement, so probe a clone off to the side and replay the winner
        // (h2d does the same). createTextNode currently runs before
        // appendChild, so the clone path is a safety net.
        const parent = textNode.parent;
        const inAutoLayout =
          !!parent && "layoutMode" in parent && parent.layoutMode !== "NONE";
        const probe = inAutoLayout ? textNode.clone() : textNode;
        let winningSize: number | null = null;
        try {
          winningSize = bisectFontSizeToFit(originalFontSize, (fs) => {
            probe.fontSize = fs; // clobbers ranges — replayed just below
            scaleSegmentRangeFontSizes(probe, appliedRangeFontSizes, fs / originalFontSize);
            probe.textAutoResize = "WIDTH_AND_HEIGHT";
            return (
              probe.width <= browserWidth + 1 &&
              probe.height <= browserHeight * 1.1
            );
          });
        } finally {
          if (probe !== textNode) probe.remove();
        }

        if (winningSize !== null) {
          textNode.fontSize = winningSize;
          scaleSegmentRangeFontSizes(textNode, appliedRangeFontSizes, winningSize / originalFontSize);
          textNode.textAutoResize = "WIDTH_AND_HEIGHT";
          const fittedWidth = textNode.width;
          textNode.resize(Math.max(fittedWidth, browserWidth) + TEXT_RESIZE_SLACK, browserHeight);
          textNode.textAutoResize = "NONE";
        } else {
          // Even the lower bound doesn't fit → restore and truncate (last resort)
          if (Number.isFinite(originalFontSize)) {
            textNode.fontSize = originalFontSize;
            scaleSegmentRangeFontSizes(textNode, appliedRangeFontSizes, 1);
          }
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
      textNode.resize(browserWidth + TEXT_RESIZE_SLACK, browserHeight);
    } else {
      // Inline/flex elements: HUG width is more accurate
      textNode.resize(hugWidth + TEXT_RESIZE_SLACK, browserHeight);
    }
    textNode.textAutoResize = "NONE";
  }

  // text-overflow: ellipsis / -webkit-line-clamp → native truncation. Applied
  // AFTER the sizing ladder so its textAutoResize choices stand; the clamp
  // then cuts exactly where the browser did instead of overflowing the card.
  if (node.textTruncation === "ENDING") {
    try {
      textNode.textTruncation = "ENDING";
      if (node.maxLines && node.maxLines > 0) {
        textNode.maxLines = node.maxLines;
      }
    } catch {
      // Truncation is progressive enhancement — keep the untruncated text.
    }
  }

  // Apply all deferred TextStyle links LAST (after sizing, lineHeight, letterSpacing)
  await applyDeferredTextStyles();

  // `background-clip: text` — the CSS background paints the GLYPHS. Figma
  // TextNodes take gradient/image paints natively, so apply it as the node's
  // fill. This runs last on purpose: the clipped background spans the whole
  // element, so it must win over the per-range solid colors set above.
  // Skipped in plugin colorMode, which deliberately flattens to its own palette
  // (css-converter already gave it a visible solid fallback color). fontMode
  // "lines" (FILLR) never reaches here — it returns early above.
  if (node.textFills?.length && context && context.colorMode !== "plugin") {
    const clipPaints = convertFillsToPaints(node.textFills, context, node.tag);
    if (clipPaints.length > 0) {
      textNode.fills = clipPaints;
    }
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
  // Figma frames clip by default. This wrapper exists only to carry the
  // element's own background/border, so it must not cut off glyph
  // descenders or an outside box-shadow the browser painted.
  frame.clipsContent =
    node.overflow === "hidden" ||
    node.overflow === "scroll" ||
    node.overflow === "auto";
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
      await linkFillStyleIfAvailable(frame, context, node.fills);
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
      node.width,
      node.height,
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
      await linkStrokeStyleIfAvailable(frame, context);
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
