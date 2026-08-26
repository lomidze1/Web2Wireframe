/**
 * CSS Converter: W2W raw CSS → WireframeNode
 *
 * Converts w2w-style node tree (raw CSS values from getComputedStyle)
 * into WireframeNode tree that the existing rendering pipeline consumes.
 *
 * This is the w2w content-script equivalent of tree-builder.ts, but runs in
 * the Figma plugin instead of during extraction.
 *
 * Deliberately unread capture fields
 * ----------------------------------
 * The extension captures a handful of properties this converter never reads.
 * That is intentional, not an oversight — Figma has nowhere to put them:
 *
 *   wordSpacing      no such property in the Figma API (letterSpacing exists)
 *   writingMode      Figma has no vertical writing mode
 *   boxSizing        no equivalent; all geometry already arrives as the
 *                    browser's border box (node.width / node.height)
 *   flexBasis        subsumed — the measured width plus flexGrow already
 *                    decide sizing in getSizing()
 *   backgroundOrigin no equivalent; paint placement is imageTransform, driven
 *                    by background-position
 *   outlineOffset    Figma strokeAlign is INSIDE/OUTSIDE/CENTER, no offset
 *
 * Everything else in the capture list is consumed somewhere in this file or
 * in rendering/. Keep this list current if that changes.
 */

import type {
  WireframeNode,
  FigmaFill,
  FigmaStroke,
  FigmaEffect,
  FigmaColor,
  FigmaGradientStop,
  TextSegment,
} from '../types';
import { isTrivialHoverDiff } from './trivialHoverDiff';
import { parseCssPosition } from './imageCrop';
import { isItalicStyle } from './styles';
import { collapseMarginWrappers } from './marginCollapse';
import { isIconFont, isPuaOnlyText, CSS_FONT_KEYWORDS, isUsableMeasuredFamily } from '../utils/fontUtils';

// Types from w2w content-script extraction (inline to avoid @w2w/shared dependency in plugin build)
interface W2WFrameNode {
  type: 'FRAME';
  x: number; y: number; width: number; height: number;
  quad: number[];
  tag: string;
  classList: string[];
  attr: Record<string, string | number | boolean | undefined>;
  styles: Record<string, string | number | undefined>;
  children: W2WNode[];
  $url?: string;
  $svgMarkup?: string; // Inlined SVG markup for <img src="*.svg"> or bg-image url(*.svg)
  isScrollingElt?: boolean;
  hover?: W2WFrameNode;
  _isHiddenInDefault?: boolean; // Set by conditional visibility filtering (interactionMode=variants)
  _posterDonor?: boolean; // Sibling picture/img whose $url was transplanted onto a posterless <video>
}

interface W2WTextNode {
  type: 'TEXT';
  x: number; y: number; width: number; height: number;
  quad: number[];
  value: string;
  font: string;
  platformFont?: { familyName: string; postScriptName?: string };
}

interface W2WSVGNode {
  type: 'SVG';
  x: number; y: number; width: number; height: number;
  quad: number[];
  svg: string;
}

type W2WNode = W2WFrameNode | W2WTextNode | W2WSVGNode;

interface ConvertOptions {
  cssVariables?: Map<string, string>;
  layoutMode?: 'absolute' | 'autoLayout';
  interactionMode?: 'none' | 'variants';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tags that can be coalesced into text nodes.
 * These are text-wrapping elements — NOT layout containers.
 */
const TEXT_COALESCE_TAGS = new Set([
  'span', 'a', 'strong', 'em', 'b', 'i', 'u', 'mark', 'small', 'sub', 'sup',
  'label', 'button', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'figcaption', 'caption', 'dt', 'dd', 'th', 'td',
  'abbr', 'cite', 'code', 'pre', 'time', 'legend',
]);

/**
 * Inline elements whose text can be folded into a parent text node.
 * These tags don't break text flow — their content is inline.
 */
const INLINE_TEXT_TAGS = new Set([
  'span', 'a', 'strong', 'em', 'b', 'i', 'u', 'mark', 'small', 'sub', 'sup',
  'abbr', 'cite', 'code', 'time',
]);

/** Collected text child info — includes inline styles from parent FRAME elements */
interface TextChildValue {
  value: string;
  font: string;
  platformFamily?: string;
  /** PostScript name of the actually-rendered font (e.g. "Newsreader-Italic").
   *  Used to infer italic for an inline run whose CSS font-style lives on a
   *  parent FRAME the merge step can't see — the W2W TEXT node is minimal. */
  platformPostScript?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Override color from inline element (e.g., <a> with accent color) */
  color?: string;
  /** text-decoration from inline element (e.g., <a> with underline) */
  textDecoration?: 'underline' | 'line-through' | 'none';
  /** Tag of the inline element (e.g., 'a', 'span') */
  tag?: string;
  /** Override font-weight from inline element (e.g., <strong> with bold) */
  fontWeight?: number;
}

let _nodeId = 0;

/**
 * Group `textChildValues` by visual Y-row and return the per-row widths in
 * reading order. Returns an empty array for zero entries, or a single-element
 * array for one row (inline text parts on the same line).
 *
 * Widths of same-Y entries are summed (e.g. `<p>a <strong>b</strong> c</p>`
 * on one visual line yields `[widthA + widthB + widthC]`).
 *
 * Used by the FILLR multi-line renderer to decide whether to split text into
 * N squigglies. `textChildValues.length` alone is not a reliable multi-line
 * signal because a single line may contain multiple inline text parts.
 */
function computeLineWidthsByY(textChildValues: TextChildValue[]): number[] {
  if (textChildValues.length === 0) return [];
  const sorted = [...textChildValues].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Array<{ y: number; height: number; width: number }> = [];
  for (const tv of sorted) {
    const last = rows[rows.length - 1];
    // Tolerance: half the entry's height catches sub-pixel rounding but still
    // splits genuinely-different visual lines (line-height > 0.5 × height).
    const tolerance = Math.max(2, tv.height * 0.5);
    if (last && Math.abs(tv.y - last.y) <= tolerance) {
      last.width += tv.width;
    } else {
      rows.push({ y: tv.y, height: tv.height, width: tv.width });
    }
  }
  return rows.map(r => r.width);
}

/**
 * Convert a W2W content-script frame tree to a WireframeNode tree.
 */
export function convertW2WToWireframe(
  w2wFrame: W2WFrameNode,
  options: ConvertOptions = {},
): WireframeNode {
  _nodeId = 0;
  const tree = convertFrame(w2wFrame, null, options);
  // Absolute mode positions every child by x/y and never builds a margin
  // wrapper, so folding margins into padding/itemSpacing there would be inert
  // at best and misleading at worst.
  if (options.layoutMode !== 'absolute') {
    collapseMarginWrappers(tree);
  }
  return tree;
}

/**
 * Deepest content bottom edge within a node, relative to the node's own top.
 *
 * Scroll-root elements (html/body with `height: 100%`) are captured at the
 * viewport height while their real content lives in a taller descendant
 * (e.g. paco.me `div#__next` at 1424px inside a 900px body). Walking the whole
 * subtree — not just direct children — is required because conversion is
 * top-down: when sizing `<html>`, the raw `<body>` child still reads 900px and
 * only the deeper `#__next` reads 1424px.
 *
 * Returns at least the node's own height (never shrinks).
 */
export function maxDescendantBottom(node: W2WFrameNode): number {
  const rootY = node.y;
  let max = node.height;
  const walk = (n: W2WNode): void => {
    const bottom = n.y - rootY + n.height;
    if (bottom > max) max = bottom;
    if (n.type === 'FRAME' && n.children) {
      for (const child of n.children) walk(child);
    }
  };
  for (const child of node.children || []) walk(child);
  return max;
}

/**
 * Full-bleed horizontal scroller: a flex strip that escapes its parent's width
 * via the `width:100vw; left:50%; margin-left:-50vw` breakout and scrolls
 * horizontally (`overflow-x: auto|scroll`). paco.me uses one for its 3-column
 * Building/Projects/Writing band.
 *
 * Its `::before`/`::after` are pure spacer pseudos (content:"") sized to
 * re-center the content inside the full-width strip. A wireframe doesn't scroll,
 * and Figma auto-layout can't reproduce a child wider than its parent, so the
 * spacers lose their anchor and instead crush the real content into a narrow
 * mid-frame block. We detect this shape (scrolls horizontally AND broke out
 * wider than its parent) so the caller can drop the spacers.
 */
function isFullBleedHScroller(
  node: W2WFrameNode,
  parent: W2WFrameNode | null,
): boolean {
  if (!parent) return false;
  const ox = str(node.styles.overflowX) || str(node.styles.overflow);
  if (ox !== 'auto' && ox !== 'scroll') return false;
  return node.width > parent.width + 1;
}

// ---------------------------------------------------------------------------
// display:contents flattening
// ---------------------------------------------------------------------------

/**
 * Recursively flatten display:contents elements out of a child list.
 * Elements with display:contents generate no box — their children become
 * direct children of the parent (same as CSS behavior).
 * Mirrors tree-builder.ts flattenDisplayContents() for the W2WFrameNode path.
 */
function getEffectiveChildren(node: W2WFrameNode): W2WNode[] {
  const result: W2WNode[] = [];
  for (const child of node.children || []) {
    if (
      child.type === 'FRAME' &&
      str((child as W2WFrameNode).styles?.display) === 'contents'
    ) {
      // Recursive: promote this element's children
      result.push(...getEffectiveChildren(child as W2WFrameNode));
    } else {
      result.push(child);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Frame conversion
// ---------------------------------------------------------------------------

function convertFrame(
  node: W2WFrameNode,
  parent: W2WFrameNode | null,
  options: ConvertOptions,
): WireframeNode {
  const s = node.styles;
  const id = `w2w-${_nodeId++}`;

  // Layout
  let cssLayoutMode = getLayoutMode(s);
  const isAbsoluteMode = options.layoutMode === 'absolute';

  // Block parent: check if children's float/inline-block indicates horizontal layout
  if (cssLayoutMode === 'NONE' && !isAbsoluteMode) {
    const inferred = inferLayoutFromChildren(getEffectiveChildren(node), node.tag, node.width);
    if (inferred) {
      cssLayoutMode = inferred;
    }
  }

  // Overlaid grid items cannot survive Figma's grid: the renderer appends each
  // child and sets only its span, so auto-placement drops two children sharing
  // one cell into two cells (stripe.com's hero stacks two <h1> in `grid-area:
  // 2 / 2 / auto / -2`, one blended over the other). Absolute placement keeps
  // the captured coordinates, and the overlay with them.
  if (cssLayoutMode === 'GRID' && !isAbsoluteMode && hasOverlappingChildren(getEffectiveChildren(node))) {
    cssLayoutMode = 'NONE';
  }

  const layoutMode = isAbsoluteMode ? 'NONE' as const : cssLayoutMode;
  const padding = parsePadding(str(s.paddingTop), str(s.paddingRight), str(s.paddingBottom), str(s.paddingLeft), str(s.padding));

  // Invisible borders still take layout space in CSS (border-box), but a
  // Figma stroke never does — and parseStrokes drops zero-alpha sides
  // entirely. Fold their widths into padding so the content inset survives
  // (nicepage gutter: `.u-layout-cell { border: 10px solid transparent }`
  // is exactly this — without it, cell content hugs the neighboring cell).
  {
    const invisible = invisibleBorderInsets(s);
    padding.top += invisible.top;
    padding.right += invisible.right;
    padding.bottom += invisible.bottom;
    padding.left += invisible.left;
  }
  const gapStr = str(s.gap);
  // The only explicit grid placement we ever receive — see parseGridArea.
  const gridArea = parseGridArea(s.gridArea);
  // Each axis reads its own longhand. `gap` is a shorthand whose computed form
  // is "<row> <column>", so parseFloat() on it yields the ROW gap — handing a
  // horizontal row the wrong number whenever the two differ. The shorthand
  // stays as the fallback for captures without the longhands.
  const axisGap = (longhand: string | number | undefined): number =>
    parseFloat(str(longhand) || gapStr) || 0;
  const mainAxisGap = cssLayoutMode === 'VERTICAL' ? axisGap(s.rowGap) : axisGap(s.columnGap);
  const itemSpacing = isAbsoluteMode ? 0 : mainAxisGap;
  // Cross-axis gap only exists for wrapped rows — the distance between the
  // lines a flex container breaks onto (web2wireframe.design's hero CTA sat
  // flush against the feature list because Figma defaults this to 0).
  const counterAxisSpacing =
    !isAbsoluteMode && cssLayoutMode === 'HORIZONTAL' && axisGap(s.rowGap) > 0
      ? axisGap(s.rowGap)
      : undefined;

  // Sizing
  const sizing = isAbsoluteMode
    ? { horizontal: 'FIXED' as const, vertical: 'FIXED' as const, grow: 0 as const, align: 'INHERIT' as const }
    : getSizing(
        s,
        parent?.styles,
        cssLayoutMode,
        parent ? { width: parent.width, height: parent.height } : undefined,
        node.width,
        hasNoInFlowChildren(node),
      );

  // Fills
  let fills = parseFills(s, node.width, node.height);

  // CSS `filter: grayscale(N)` — Figma has no subtree filter, but IMAGE
  // paints support per-paint color adjustments (saturation −1…1), which is
  // exactly what grayscale needs (telex.ge brand logos: `filter: grayscale(1)`
  // directly on the <img>). Parsed here, applied to background IMAGE fills
  // below and to the <img>/<video> IMAGE paint in realImages.ts.
  const filterGrayscale = parseGrayscaleAmount(str(s.filter) || str(s.webkitFilter));
  if (filterGrayscale != null) {
    for (const f of fills) {
      if (f.type === 'IMAGE_PLACEHOLDER') f.imageSaturation = -filterGrayscale;
    }
  }

  // `background-clip: text` — the background is clipped to the glyph shapes, so
  // it must NOT paint the box. Move every layer to textFills; text.ts paints the
  // TextNode with them (Figma TextNodes support gradient paints natively).
  // Without this the gradient painted the whole box and the transparent text
  // vanished behind it (web2wireframe.design "Capture/Analyze/Output" headings).
  let textFills: FigmaFill[] | undefined;
  if (isBackgroundClipText(s) && fills.length > 0) {
    textFills = fills;
    fills = [];
  }

  // Strokes
  const strokes = parseStrokes(s);

  // Effects
  const effects = parseEffects(s);

  // Border radius (percentages resolve against the element box)
  const borderRadius = parseBorderRadius(s, node.width, node.height);

  // Text color (from styles, for text children)
  const textColor = resolveTextColor(s, textFills);

  // Opacity — validate to avoid Symbol/NaN reaching Figma API
  const rawOpacity = s.opacity;
  const opacity = typeof rawOpacity === 'number' ? Math.max(0, Math.min(1, rawOpacity))
    : typeof rawOpacity === 'string' ? Math.max(0, Math.min(1, parseFloat(rawOpacity) || 1))
    : 1;

  // Overflow
  const overflow = parseOverflow(s);

  // Font info from parent styles (used for text children)
  const fontFamily = cleanFontFamily(str(s.fontFamily) || 'Arial');
  // Full CSS fallback chain — text.ts walks it (Step 4) when the primary
  // family isn't installed, instead of dropping straight to Inter.
  const fontFamilyStack = parseFontFamilyStack(str(s.fontFamily));
  // May be overridden in the coalesce block below when every text run carries
  // the same measured font that differs from the element's CSS font-family
  // (icon-font pseudo glyphs flattened into their host element).
  let effectiveFontFamily = fontFamily;
  const fontSize = parseFloat(str(s.fontSize)) || 16;
  const fontWeight = parseFontWeight(str(s.fontWeight));
  const fontStyle = str(s.fontStyle) || undefined;

  // Convert children — separate TEXT nodes from FRAME/SVG nodes
  const children: WireframeNode[] = [];
  const textChildValues: TextChildValue[] = [];
  let textContent = '';

  // Fix D: DOM order tracking. Each push to either textChildValues or children
  // records an entry here so the mixed-children branch can rebuild WireframeNode
  // children in original DOM order (required for inline flow like Apple footer).
  const orderEntries: OrderEntry[] = [];
  const pushTextValue = (tv: TextChildValue): void => {
    orderEntries.push({ kind: 'text', index: textChildValues.length });
    textChildValues.push(tv);
  };
  const pushChildNode = (cn: WireframeNode): void => {
    orderEntries.push({ kind: 'child', index: children.length });
    children.push(cn);
  };

  // Flatten display:contents wrappers before iterating children.
  // Elements with display:contents generate no box — their children become
  // direct children of this parent (same as CSS behavior).
  const effectiveChildren = getEffectiveChildren(node);

  // Posterless <video> next to a <picture>/<img> start-frame (apple.com hero):
  // transplant the poster $url onto the video so the media area renders real
  // pixels, and drop the donor to avoid rendering the same image twice.
  adoptPosterFromSiblings(effectiveChildren);

  // Full-bleed horizontal scrollers (paco.me's [basics-scroller]) carry pure
  // `::before`/`::after` spacer pseudos that only make sense while the strip
  // spans the viewport and scrolls. In a non-scrolling wireframe they have no
  // anchor and crush the real content, so drop them below.
  const dropScrollSpacers = isFullBleedHScroller(node, parent);

  // Bubble-up margin: when a text-only inline wrapper is the sole child of
  // a text-coalesce parent and has only margin (no padding/width), transfer
  // its margin onto this parent so Figma auto-layout pushes THIS node's
  // next sibling. Without this, the margin lives inside the wrapper's
  // own frame (Apple footer column titles regression).
  let bubbledMargin: MarginSides | null = null;

  for (const child of effectiveChildren) {
    if (child.type === 'FRAME' && shouldSkipInvisibleFrame(child, options)) {
      continue;
    }

    if (child.type === 'TEXT') {
      // Collect TEXT node info (don't create WireframeNode yet — will coalesce)
      pushTextValue({
        value: child.value,
        font: child.font,
        platformFamily: child.platformFont?.familyName,
        platformPostScript: child.platformFont?.postScriptName,
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
      });
    } else if (child.type === 'SVG') {
      pushChildNode(convertSVGNode(child, node));
    } else if (child.type === 'FRAME') {
      // Zero-size wrapper flattening: promote children of 0x0 wrappers into parent.
      // Pattern: Apple.com's div#globalheader is display:inline, w=0, h=0, wrapping
      // a position:fixed nav. Without flattening, the 0x0 Figma frame clips the nav.
      if (child.width < 1 && child.height < 1 && child.children?.length > 0) {
        for (const grandchild of child.children) {
          // Promoted grandchildren must pass the same invisibility gate as
          // direct children — apple.com's #globalheader (0×0 wrapper) promotes
          // #globalnav-curtain (visibility:hidden, opacity:0 fixed overlay)
          // which otherwise renders as a page-covering blurred sheet.
          if (grandchild.type === 'FRAME' && shouldSkipInvisibleFrame(grandchild, options)) {
            continue;
          }
          if (grandchild.type === 'TEXT') {
            pushTextValue({
              value: grandchild.value,
              font: grandchild.font,
              platformFamily: grandchild.platformFont?.familyName,
              platformPostScript: grandchild.platformFont?.postScriptName,
              x: grandchild.x,
              y: grandchild.y,
              width: grandchild.width,
              height: grandchild.height,
            });
          } else if (grandchild.type === 'SVG') {
            pushChildNode(convertSVGNode(grandchild, node));
          } else if (grandchild.type === 'FRAME') {
            pushChildNode(convertFrame(grandchild, node, options));
          }
        }
      } else if (child.width < 1 && child.height < 1) {
        // Zero-size with no children — skip entirely
        continue;
      // Pseudo-element wrappers (__w2w-pseudo-before/after/marker): either
      // render the wrapper itself as a decorative frame (empty children —
      // e.g. Apple footer pipe separators) or flatten its children into the
      // parent (text pseudos, including list markers "1." / "•").
      } else if (
        child.classList.includes('__w2w-pseudo-before') ||
        child.classList.includes('__w2w-pseudo-after') ||
        child.classList.includes('__w2w-pseudo-marker')
      ) {
        // Extract pseudo-element styles for its text children
        const pseudoStyles = child.styles;
        const pseudoColor = str(pseudoStyles.webkitTextFillColor) || str(pseudoStyles.color) || undefined;
        const pseudoPosition = str(pseudoStyles.position);
        // list-style-position: outside markers need absolute positioning in Figma
        // even though the wrapper has position: static (browsers use special
        // marker layout, not CSS absolute). "outside" is the CSS default.
        const isMarkerOutside = child.classList.includes('__w2w-pseudo-marker') &&
          str(node.styles.listStylePosition) !== 'inside';
        const isAbsolutePseudo = isMarkerOutside || pseudoPosition === 'absolute' || pseudoPosition === 'fixed';

        // Decorative pseudo — no text/svg/frame children, wrapper IS the visual.
        // Render through convertFrame so it picks up fills/strokes/effects/sizing
        // via the same path as any regular div; absolute positioning is honored
        // downstream by nodes.ts.
        if (child.children.length === 0) {
          // …unless it's a pure spacer of a full-bleed horizontal scroller —
          // those exist only to pad the scroll strip and have no place in a
          // wireframe (they otherwise crush the real content; see paco.me).
          if (
            dropScrollSpacers &&
            (child.classList.includes('__w2w-pseudo-before') ||
              child.classList.includes('__w2w-pseudo-after'))
          ) {
            continue;
          }
          const pseudoFrame = convertFrame(child, node, options);
          // Invisible layout-hack pseudo (clearfix `content:""; display:table;
          // height:0` and friends): no children, no paint, and a degenerate
          // box. The extraction-side visibility filter can't catch these —
          // getComputedStyle reports the USED width (e.g. 1140px for a
          // stretched table pseudo), so they arrive as 1140×1 junk frames
          // that occupy auto-layout flow and shift real content.
          if (
            (child.width <= 2 || child.height <= 2) &&
            !pseudoFrame.fills?.length &&
            !pseudoFrame.strokes?.length &&
            !pseudoFrame.effects?.length &&
            pseudoFrame.children.length === 0
          ) {
            continue;
          }
          if (isAbsolutePseudo) {
            pseudoFrame.position = pseudoPosition as 'absolute' | 'fixed';
          }
          pushChildNode(pseudoFrame);
          continue;
        }

        for (const pseudoChild of child.children) {
          if (pseudoChild.type === 'TEXT') {
            if (isAbsolutePseudo) {
              // Absolutely positioned pseudo-element (e.g., li::before with position:absolute)
              // → create as a separate child node, not text coalescing.
              // For outside markers: use measured geometry (page-absolute coords);
              // convertTextNodeFromValue subtracts parent to get relative offset.
              // For CSS absolute: use left/top from styles (position from padding box edge).
              const xVal = isMarkerOutside ? pseudoChild.x : node.x + (parseFloat(str(pseudoStyles.left) || '') || 0);
              const yVal = isMarkerOutside ? pseudoChild.y : node.y + (parseFloat(str(pseudoStyles.top) || '') || 0);
              const pseudoTextNode = convertTextNodeFromValue(
                { value: pseudoChild.value, font: pseudoChild.font, platformFamily: pseudoChild.platformFont?.familyName,
                  x: xVal, y: yVal, width: pseudoChild.width, height: pseudoChild.height,
                  color: pseudoColor },
                node, pseudoStyles, options,
              );
              pseudoTextNode.position = isMarkerOutside ? 'absolute' : pseudoPosition as 'absolute' | 'fixed';
              pushChildNode(pseudoTextNode);
            } else {
              pushTextValue({
                value: pseudoChild.value,
                font: pseudoChild.font,
                platformFamily: pseudoChild.platformFont?.familyName,
                x: pseudoChild.x,
                y: pseudoChild.y,
                width: pseudoChild.width,
                height: pseudoChild.height,
                color: pseudoColor,
              });
            }
          } else if (pseudoChild.type === 'SVG') {
            pushChildNode(convertSVGNode(pseudoChild, node));
          } else if (pseudoChild.type === 'FRAME') {
            pushChildNode(convertFrame(pseudoChild, node, options));
          }
        }
      } else if (
        TEXT_COALESCE_TAGS.has(node.tag) &&
        INLINE_TEXT_TAGS.has(child.tag) &&
        isTextOnlyFrame(child) &&
        // Out-of-flow wrappers must keep their own frame: collapsing an
        // absolute/fixed span into the parent's text drops its positioning
        // and turns it into a flow item that displaces siblings (apple.com
        // locale-select: absolute ✓-glyph span pushed "United States" out
        // of the box).
        str(child.styles.position) !== 'absolute' &&
        str(child.styles.position) !== 'fixed'
      ) {
        // Text-only inline wrapper (span, a, strong, em, …). Three outcomes
        // decided by classifyWrapper:
        //   'collapse' → flatten into parent's text (original behavior)
        //   'bubble'   → move margin to parent, then collapse as text
        //   'frame'    → render as nested frame (keeps padding/width or
        //                margin against siblings)
        const isOnly = effectiveChildren.length === 1;
        const kind = classifyWrapper(child, isOnly);
        if (kind === 'frame') {
          pushChildNode(convertFrame(child, node, options));
        } else {
          if (kind === 'bubble') {
            bubbledMargin = extractMarginFromStyles(child.styles);
          }
          const before = textChildValues.length;
          collectTextFromFrame(child, textChildValues);
          for (let i = before; i < textChildValues.length; i++) {
            orderEntries.push({ kind: 'text', index: i });
          }
        }
      } else {
        pushChildNode(convertFrame(child, node, options));
      }
    }
  }

  // Same-row hack propagation: a large negative margin-top on one child
  // shifts the FOLLOWING flow siblings too (the browser lays them out
  // relative to the pulled-up element — nicepage block-4: icon, h5 at
  // margin-top:-64px, then p at y=35 instead of 64+margin). Auto-layout
  // can't reproduce any of that, so when such a child exists every static
  // flow child of this parent keeps its captured coordinates instead.
  const hasPulledUpChild = effectiveChildren.some((c) => {
    if (c.type !== 'FRAME') return false;
    const pos = str(c.styles.position);
    if (pos === 'absolute' || pos === 'fixed') return false;
    const mt = parseFloat(str(c.styles.marginTop) || '');
    return Number.isFinite(mt) && mt <= -8;
  });
  if (hasPulledUpChild) {
    for (const c of children) {
      if (!c.position || c.position === 'relative' || c.position === 'static') {
        c.position = 'absolute';
      }
    }
  }

  // Determine type
  let type: 'frame' | 'text' | 'placeholder' = 'frame';
  const isMedia = node.tag === 'img' || node.tag === 'video' || node.tag === 'canvas';

  // A <video> is a placeholder even WITHOUT $url: extraction only captures
  // the poster attribute, and most real-world videos (apple.com hero) ship
  // none — an empty frame would leave the media area blank.
  if (isMedia && (node.$url || node.tag === 'video')) {
    type = 'placeholder';
  }

  // Text coalescing: join w2w per-line TEXT children into a single text node.
  // Only coalesce when:
  // - Element has TEXT children (textChildValues not empty)
  // - Element is a text-wrapping tag (p, h1-h6, span, a, button, etc.)
  // - Element is NOT a layout container (flex/grid)
  // - Element has NO non-text children (frames/SVGs)
  let styledSegments: TextSegment[] | undefined;
  let browserLineCount: number | undefined;
  // Inline baseline overhang correction (set in the coalesce block below).
  let inkGeometry: { y: number; height: number } | null = null;
  // UPPER/LOWER ride Figma textCase with the raw string kept (set below).
  let textCase: 'UPPER' | 'LOWER' | undefined;
  // Geometry-derived vertical ink alignment (set in the coalesce block).
  let textAlignVertical: 'CENTER' | 'BOTTOM' | undefined;
  // Base-state decoration style/color beyond the line kind (set below).
  let textDecorationStyle: 'WAVY' | 'DOTTED' | undefined;
  let textDecorationColor: string | undefined;

  const hasTextChildren = textChildValues.length > 0;
  const hasNonTextChildren = children.length > 0;
  const isLayoutContainer = layoutMode !== 'NONE';

  if (hasTextChildren && !hasNonTextChildren && !isLayoutContainer && TEXT_COALESCE_TAGS.has(node.tag)) {
    // Coalesce all TEXT children into a single text node
    // Join with space because content script splits text per visual line
    //
    // Semantic placeholder dedup: when textMode="semantic", every per-line
    // W2WTextNode gets the same placeholder ("List item", "Page Title", etc.)
    // assigned by transformW2WTreeText. Joining with space would produce
    // "List item List item List item". If all values are identical, render
    // the placeholder once. browserLineCount + per-line widths preserved
    // for FILLR (Lines mode) rendering.
    const allSameValue = textChildValues.length > 1 &&
      textChildValues.every(t => t.value === textChildValues[0].value);
    const segmentSource = allSameValue ? [textChildValues[0]] : textChildValues;
    const textTransform = str(s.textTransform);
    // uppercase/lowercase → Figma textCase over the RAW string (copy/edit
    // keeps the author's casing; glyphs render identically). `capitalize`
    // stays baked: CSS keeps inner caps ("iPhone" → "IPhone"), TITLE doesn't.
    textCase = textTransform === 'uppercase' ? 'UPPER'
      : textTransform === 'lowercase' ? 'LOWER'
      : undefined;
    const bakedTransform = textCase ? undefined : textTransform;

    // --- Hard line breaks from line geometry ------------------------------
    // The extractor emits one TEXT run per visual line with exact rects.
    // Joining everything with spaces let Figma re-wrap purely by width and
    // destroyed <br>-authored breaks and pre line structure. A boundary is
    // HARD when the upper row ends leaving enough room for the next row's
    // first word — the browser had space to continue but didn't, so the
    // author forced the break. Width-exhausted rows stay soft (space join),
    // where Figma may legitimately re-wrap. `white-space: pre*` preserves
    // source breaks, so every boundary there is hard.
    const rows: TextChildValue[][] = [];
    for (const tv of segmentSource) {
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(lastRow[0].y - tv.y) <= 2) lastRow.push(tv);
      else rows.push([tv]);
    }
    const preWhitespace = (str(s.whiteSpace) || '').startsWith('pre');
    const contentRight = node.x + node.width - (parseFloat(str(s.paddingRight)) || 0);
    const hardBreakAfterRow: boolean[] = rows.map((row, ri) => {
      if (ri === rows.length - 1) return false;
      if (preWhitespace) return true;
      const next = rows[ri + 1];
      const rowRight = Math.max(...row.map(t => t.x + t.width));
      const remaining = contentRight - rowRight;
      const nextText = next.map(t => t.value).join(' ');
      const nextWidth = next.reduce((acc, t) => acc + t.width, 0);
      const firstWord = nextText.trimStart().split(/\s+/)[0] || '';
      if (!firstWord || nextWidth <= 0) return false;
      const avgChar = nextWidth / nextText.length;
      return remaining >= avgChar * (firstWord.length + 1);
    });
    // Index (into segmentSource) of each row's last run followed by a hard
    // break — the segment path appends the \n there so the composed
    // characters match textContent.
    const hardBreakAfterIndex = new Set<number>();
    {
      let runIdx = 0;
      rows.forEach((row, ri) => {
        runIdx += row.length;
        if (ri < rows.length - 1 && hardBreakAfterRow[ri]) hardBreakAfterIndex.add(runIdx - 1);
      });
    }
    const joinedRaw = rows
      .map((row, ri) =>
        row.map(t => t.value).join(' ') +
        (ri < rows.length - 1 ? (hardBreakAfterRow[ri] ? '\n' : ' ') : ''))
      .join('');
    textContent = applyTextTransform(joinedRaw, bakedTransform);
    browserLineCount = textChildValues.length;

    // Check parent element's own text-decoration (e.g., standalone <a> with underline)
    const rawOwnDecoration = str(s.textDecorationLine) || str(s.textDecoration) || '';
    let ownTextDecoration: TextChildValue['textDecoration'];
    if (rawOwnDecoration.includes('underline')) ownTextDecoration = 'underline';
    else if (rawOwnDecoration.includes('line-through')) ownTextDecoration = 'line-through';

    // Decoration style/color beyond the line kind. Chrome's computed
    // `text-decoration` shorthand is "<line> <style> <color>", so tinted or
    // dotted/wavy underlines are recoverable here (previously hover-only).
    if (ownTextDecoration) {
      const shorthand = str(s.textDecoration) || '';
      const styleMatch = shorthand.match(/\b(dotted|dashed|wavy)\b/);
      if (styleMatch) {
        // Figma has no DASHED — DOTTED is the closest visual.
        textDecorationStyle = styleMatch[1] === 'wavy' ? 'WAVY' : 'DOTTED';
      }
      const colorMatch = shorthand.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/);
      if (colorMatch && colorMatch[1] !== str(s.color)) {
        textDecorationColor = colorMatch[1];
      }
    }

    // Create styledSegments — each segment preserves its own inline styles
    const hasStyleVariation = segmentSource.length > 1 ||
      segmentSource.some(t => t.color || t.textDecoration || t.tag || t.fontWeight) ||
      !!ownTextDecoration;
    if (hasStyleVariation) {
      styledSegments = segmentSource.map((t, segIdx) => {
        const family = measuredFamily(t.font);
        // Strip weight suffix from platform font name (e.g., "Space Grotesk Light" → "Space Grotesk").
        // A server-capture fallback (Liberation Sans, Noto * CJK) is an
        // artifact of the Linux container, not the page's font — taking it
        // here would put an uninstallable family into the wireframe's font
        // demand and reopen the download modal on every import.
        const cleanPlatformFamily = measuredFamily(t.platformFamily) || undefined;
        // A PUA-only run inside mixed text is an icon glyph whose measured
        // font is the DOMINANT text font (the extension collapses platform
        // fonts per host element) — recover the icon family from the CSS stack.
        // Site-specific icon fonts (telex.ge "glyphs"/"uni2-icons") don't match
        // the known-name list, but for PUA content the FIRST stack entry is the
        // author's icon font by construction (icon classes set it first).
        const segIconFamily = isPuaOnlyText(t.value)
          ? fontFamilyStack.find(isIconFont) ?? fontFamilyStack[0]
          : undefined;
        // Infer italic for this run. The W2W TEXT node is minimal (no
        // font-style), so for an inline <em> we read it from the actually-
        // rendered font's PostScript name (e.g. "Newsreader-Italic"); fall back
        // to the parent FRAME's font-style for wholly-italic elements.
        const segItalic =
          isItalicStyle(t.platformPostScript) ||
          isItalicStyle(t.platformFamily) ||
          isItalicStyle(fontStyle);
        return {
          text: applyTextTransform(t.value, bakedTransform) +
            (hardBreakAfterIndex.has(segIdx) ? '\n' : ''),
          color: t.color || textColor,
          fontWeight: t.fontWeight || fontWeight, // Child override (e.g., <strong>) or parent's CSS fontWeight
          fontSize,
          fontFamily: segIconFamily || cleanPlatformFamily || family || fontFamily,
          fontStyle: segItalic ? 'italic' : undefined,
          textDecoration: t.textDecoration || ownTextDecoration,
          isLink: t.tag === 'a' || node.tag === 'a',
          tag: t.tag || node.tag,
        };
      });
    }

    type = 'text';

    // Text runs carry the font they were MEASURED with. When all runs agree
    // on a family that differs from the host's CSS font-family, trust the
    // runs — an icon-font pseudo (::after with "SF Pro Icons") flattens into
    // a host whose own font is the page text font; taking the host's font
    // renders the glyph as tofu and hides the icon font from the
    // missing-font/ZIP flow (collectAllFonts walks node.fontFamily).
    const runFamilies = new Set(
      segmentSource.map(t => measuredFamily(t.font)).filter(Boolean),
    );
    if (runFamilies.size === 1) {
      const runFamily = Array.from(runFamilies)[0];
      if (runFamily && runFamily !== fontFamily) {
        effectiveFontFamily = runFamily;
      }
    }

    // PUA icon glyphs: neither the runs nor the host family can be trusted —
    // the extension's platform-font pass labels a minority icon glyph with
    // the element's dominant TEXT font (highest glyphCount wins), so the run
    // font arrives as e.g. "SF Pro Text" for a "SF Pro Icons" glyph. When the
    // coalesced content is purely PUA codepoints and the CSS stack names an
    // icon family, that family wins over both.
    if (isPuaOnlyText(textContent)) {
      // Unknown site icon fonts (no name match) fall back to the first CSS
      // family — never a text font, so the glyph keeps its icon identity.
      const iconFamily = fontFamilyStack.find(isIconFont) ?? fontFamilyStack[0];
      if (iconFamily) {
        effectiveFontFamily = iconFamily;
      }
    }

    // Inline baseline overhang: an element's line box can be SHORTER than its
    // measured text ink (e.g. apple.com's locale select — a 20px-tall inline
    // box whose 36px baseline-aligned text starts 20px above it). The ink
    // rects are ground truth for where the browser painted the text, so for
    // pure text wrappers snap the frame to the ink box. Elements with a
    // background or border keep their element box (that IS their visual).
    if (fills.length === 0 && strokes.length === 0) {
      const inkTop = Math.min(...segmentSource.map(t => t.y));
      const inkBottom = Math.max(...segmentSource.map(t => t.y + t.height));
      if (isFinite(inkTop) && isFinite(inkBottom) && inkTop < node.y - 2) {
        inkGeometry = { y: inkTop, height: Math.max(inkBottom - inkTop, node.height) };
      }
    }

    // Vertical ink alignment: when the box is meaningfully taller than the
    // text and the ink sits centered (or bottom-hugging) inside it, record
    // that so text.ts can keep the glyphs positioned when Figma's font
    // metrics make the text shorter than the browser box. Geometry-based on
    // purpose — covers table-cell middle and line-height centering, for
    // which no CSS signal survives capture.
    {
      const inkTop = Math.min(...segmentSource.map(t => t.y));
      const inkBottom = Math.max(...segmentSource.map(t => t.y + t.height));
      const topGap = inkTop - node.y;
      const bottomGap = (node.y + node.height) - inkBottom;
      const spareSpace = node.height - (inkBottom - inkTop);
      if (isFinite(topGap) && isFinite(bottomGap) && spareSpace > 4) {
        if (Math.abs(topGap - bottomGap) <= 2 && topGap > 2) {
          textAlignVertical = 'CENTER';
        } else if (bottomGap <= 2 && topGap > 4) {
          textAlignVertical = 'BOTTOM';
        }
      }
    }
  } else if (hasTextChildren) {
    // Mixed children (TEXT + FRAME/SVG) or container tag — keep TEXT as individual
    // children. Fix D: rebuild in DOM order using orderEntries so inline flow
    // (e.g., Apple footer <div>text <a>link</a> text</div>) stays in source order.
    //
    // Merge adjacent per-line TEXT entries: the content script splits multi-line
    // paragraphs into one TEXT node per visual line. Consecutive TEXT entries with
    // matching font/x/height are joined into a single WireframeNode (like h2d).
    const { mergedEntries, mergedValues } = mergeAdjacentTextEntries(orderEntries, textChildValues);
    const ordered: WireframeNode[] = [];
    for (const entry of mergedEntries) {
      if (entry.kind === 'text') {
        const tv = mergedValues[entry.index];
        const wn = convertTextNodeFromValue(tv, node, s, options);
        // Same-row merged runs → styledSegments so each run keeps its own
        // weight/color/decoration inside the single text node (h2d parity).
        const rowSegs = (tv as { _rowSegments?: TextChildValue[] })._rowSegments;
        if (rowSegs && rowSegs.length > 1) {
          // UPPER/LOWER already ride wn.textCase (convertTextNodeFromValue);
          // keep segment text raw so the node and its ranges agree.
          const rawTransform = str(s.textTransform);
          const segTransform = rawTransform === 'uppercase' || rawTransform === 'lowercase'
            ? undefined
            : rawTransform;
          wn.styledSegments = rowSegs.map(seg => {
            const { weight: segWeight } = parseFontString(seg.font);
            const segFamily = measuredFamily(seg.font);
            const segPlatform = measuredFamily(seg.platformFamily) || undefined;
            return {
              text: applyTextTransform(seg.value, segTransform),
              color: seg.color || str(s.webkitTextFillColor) || str(s.color) || 'rgb(0, 0, 0)',
              fontWeight: seg.fontWeight || segWeight || parseFontWeight(str(s.fontWeight)),
              fontSize: parseFloat(str(s.fontSize)) || 16,
              fontFamily: segPlatform || segFamily || cleanFontFamily(str(s.fontFamily) || 'Arial'),
              textDecoration: seg.textDecoration,
              isLink: seg.tag === 'a' || node.tag === 'a',
              tag: seg.tag || node.tag,
            };
          });
        }
        // Propagate browserLineCount + per-line widths from merged entries
        const merged = tv as TextChildValue & {
          _mergedLineCount?: number;
          _mergedLineWidths?: number[];
        };
        if (merged._mergedLineCount && merged._mergedLineCount > 1) {
          wn.browserLineCount = merged._mergedLineCount;
          if (merged._mergedLineWidths && merged._mergedLineWidths.length > 1) {
            wn.renderedTextWidths = merged._mergedLineWidths;
          }
        }
        ordered.push(wn);
      } else {
        ordered.push(children[entry.index]);
      }
    }
    children.length = 0;
    for (const c of ordered) children.push(c);
    // Set frame's textContent for fallback rendering (li text, etc.)
    textContent = applyTextTransform(mergedValues.map(t => t.value).join(' '), str(s.textTransform));
  }

  // Margin — own margin plus any margin bubbled up from a sole text-only
  // inline wrapper child (see classifyWrapper → 'bubble').
  let margin = parseMargin(s);
  if (bubbledMargin) {
    margin = {
      top: margin.top + bubbledMargin.top,
      right: margin.right + bubbledMargin.right,
      bottom: margin.bottom + bubbledMargin.bottom,
      left: margin.left + bubbledMargin.left,
    };
  }
  // Detect horizontal centering via multiple methods:
  // 1. CSS value: marginLeft === 'auto' && marginRight === 'auto' (if computedStyleMap preserved it)
  // 2. Geometry: element is centered within parent (marginLeft ≈ marginRight > 0 and element narrower than parent)
  const mlAuto = str(s.marginLeft) === 'auto';
  const mrAuto = str(s.marginRight) === 'auto';
  const isHorizontallyCentered = (mlAuto && mrAuto) || (
    parent !== null &&
    node.width < parent.width &&
    margin.left > 0 && margin.right > 0 &&
    Math.abs(margin.left - margin.right) < 2  // Equal margins = centered
  );
  const lineHeight = str(s.lineHeight) || 'normal';
  const letterSpacing = parseFloat(str(s.letterSpacing)) || 0;
  const textAlign = str(s.textAlign) || 'left';

  // Background-image SVG → synthetic child vector.
  // When the element is NOT a media placeholder (so not <img>) but has
  // background-image: url(*.svg), promote the SVG to a child placeholder and
  // strip the matching IMAGE_PLACEHOLDER fill — fills.ts deliberately refuses
  // SVG data URIs (figma.createImage would throw), so leaving the fill in
  // place rendered a flat gray box (iwm.org.uk teaser logos).
  // Two payload shapes:
  //   - markup inlined by the content script → child carries svgMarkup;
  //   - markup absent but the URL is harvestable → child carries imageUrl,
  //     and the placeholder render branch resolves it via the assets map.
  if (type !== 'placeholder') {
    const svgFillIdx = fills.findIndex(
      (f) => f.type === 'IMAGE_PLACEHOLDER' && typeof f.imageUrl === 'string' && /\.svg(\?|#|$)/i.test(f.imageUrl),
    );
    if (svgFillIdx !== -1 && (node.$svgMarkup || fills[svgFillIdx].imageUrl)) {
      const svgFillUrl = fills[svgFillIdx].imageUrl;
      fills = fills.filter((_, i) => i !== svgFillIdx);
      const syntheticId = `w2w-${_nodeId++}`;
      children.push({
        id: syntheticId,
        name: 'SVG',
        type: 'placeholder',
        tag: 'svg',
        x: 0,
        y: 0,
        width: node.width,
        height: node.height,
        layoutMode: 'NONE',
        itemSpacing: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        backgroundColor: null,
        backgroundGradient: null,
        textColor: 'rgb(0, 0, 0)',
        borderColor: null,
        borderWidth: 0,
        borderRadius: 0,
        opacity: 1,
        textContent: '',
        fontSize: 16,
        fontWeight: 400,
        fontFamily: 'Arial',
        textAlign: 'left',
        lineHeight: 'normal',
        letterSpacing: 0,
        isPlaceholder: true,
        ...(node.$svgMarkup
          ? { computedStyles: { svgMarkup: node.$svgMarkup } }
          : { imageUrl: svgFillUrl }),
        children: [],
      } as WireframeNode);
    }
  }

  // Scroll-root expansion: html/body/scrollingElement using `height: 100%`
  // are captured at viewport height (e.g. 900px) while their real content lives
  // in a taller descendant. Expand them to content height and stop them from
  // clipping so the whole page renders instead of being cut to the viewport.
  // Inline overhang, frame-children variant. A `display: inline` element's box
  // is only its line box — inline-block / absolute children routinely paint
  // ABOVE it (apple.com's locale dropdown title: a 20px box at y=37 whose
  // check glyph and country name both paint from y=17). Auto-layout pins flow
  // children to the frame's top while absolute children keep their negative
  // offset, so the two drift apart — the stray ✓ above the field. Snap the
  // wrapper to its children's union box and shift the children with it, so
  // every child keeps the relationship the browser painted. Wrappers with a
  // background/border keep their element box (that IS their visual).
  if (
    !inkGeometry &&
    children.length > 0 &&
    str(s.display) === 'inline' &&
    fills.length === 0 &&
    strokes.length === 0
  ) {
    const childTop = Math.min(...children.map((c) => c.y));
    const childBottom = Math.max(...children.map((c) => c.y + c.height));
    if (isFinite(childTop) && isFinite(childBottom) && childTop < -2) {
      inkGeometry = {
        y: node.y + childTop,
        height: Math.max(childBottom - childTop, node.height),
      };
      // Children were positioned against the original box; rebase them onto
      // the snapped one so their painted offsets are preserved.
      for (const c of children) c.y -= childTop;
    }
  }

  // Backdrop normalization: a `position: relative; z-index: -1` child that
  // covers (almost) the whole element is a CSS paint-behind backdrop (iwm's
  // div.hero__media). The stacking pass can only safely reorder out-of-flow
  // children, so promote the backdrop to `absolute` — but ONLY when every
  // other child is already out of flow, so removing its flow slot shifts
  // nothing. In-flow siblings keep the backdrop untouched: reordering under
  // auto-layout would change layout, which is worse than the paint glitch.
  if (children.length > 1) {
    const relBackdrops = children.filter(
      (c) =>
        c.position === 'relative' &&
        (c.zIndex ?? 0) < 0 &&
        c.width * c.height >= 0.9 * node.width * node.height,
    );
    for (const backdrop of relBackdrops) {
      const othersOutOfFlow = children.every(
        (c) => c === backdrop || c.position === 'absolute' || c.position === 'fixed',
      );
      if (othersOutOfFlow) backdrop.position = 'absolute';
    }
  }

  const isScrollRoot =
    !parent || node.tag === 'html' || node.tag === 'body' || node.isScrollingElt === true;
  const effectiveHeight = isScrollRoot ? Math.max(node.height, maxDescendantBottom(node)) : node.height;
  const effectiveOverflow = isScrollRoot ? ('visible' as const) : overflow;
  const effectiveVertical =
    isScrollRoot && sizing.vertical === 'FILL' ? ('FIXED' as const) : sizing.vertical;

  const wireframeNode: WireframeNode = {
    id,
    name: getNodeName(node),
    type,
    tag: node.tag,
    className: node.classList.join(' ') || undefined,
    x: parent ? node.x - parent.x : node.x,
    y: (inkGeometry?.y ?? node.y) - (parent ? parent.y : 0),
    width: node.width,
    height: inkGeometry ? inkGeometry.height : effectiveHeight,

    position: (() => {
      const pos = str(s.position) as WireframeNode['position'] || undefined;
      if (pos === 'absolute' || pos === 'fixed' || pos === 'sticky') return pos;
      // Same-row hack: a static flow element pulled up beside its previous
      // sibling via a large negative margin-top (nicepage.io header nav
      // -32px, feature-row headings -64px). Figma auto-layout cannot express
      // negative flow offsets (margin wrappers clamp padding to 0), which
      // drops the element a full row down — absolute positioning keeps the
      // captured geometry instead.
      const mt = parseFloat(str(s.marginTop) || '');
      if (parent && Number.isFinite(mt) && mt <= -8) return 'absolute';
      return pos;
    })(),
    zIndex: s.zIndex != null && String(s.zIndex) !== 'auto' ? Number(s.zIndex) : undefined,
    cssOrder: s.order != null && String(s.order) !== '0' ? Number(s.order) : undefined,
    filterGrayscale,
    // CSS top/left for fixed|sticky elements (used by re-parenting logic)
    cssTop: (() => {
      const v = s.top;
      if (v == null || v === 'auto') return undefined;
      const n = parseFloat(String(v));
      return isNaN(n) ? undefined : n;
    })(),
    cssLeft: (() => {
      const v = s.left;
      if (v == null || v === 'auto') return undefined;
      const n = parseFloat(String(v));
      return isNaN(n) ? undefined : n;
    })(),

    layoutMode,
    itemSpacing,
    counterAxisSpacing,
    padding,
    // Pass justifyContent/alignItems through even in absolute mode: they are
    // the source-of-truth signal for centering text-with-background buttons
    // (inline-flex + justify-content: center). Frame-level auto-layout
    // consumers in nodes.ts are gated by useAutoLayout, so this is inert
    // for normal absolute frames.
    justifyContent: str(s.justifyContent),
    alignItems: str(s.alignItems),
    flexWrap: !isAbsoluteMode ? str(s.flexWrap) : undefined,
    flexDirection: !isAbsoluteMode ? str(s.flexDirection) : undefined,
    layoutGrow: sizing.grow,
    layoutAlign: sizing.align,
    // Raw CSS align-self — nodes.ts turns it into a per-child Figma
    // layoutAlign. `auto` is the CSS default and carries no intent.
    alignSelf: (() => {
      const v = str(s.alignSelf);
      return !v || v === 'auto' ? undefined : v;
    })(),
    // Single-line coalesced text whose natural DOM width exceeds its parent:
    // override FILL to HUG so the text keeps its natural width instead of
    // being wrapped to the narrower Figma parent. This matches browser
    // behavior where content overflows visually (e.g. Apple.com
    // "Amazing Mac. Surprising price." natural 364.73px inside a 351px tile).
    // When node.width <= parent.width the block/stretch FILL is correct.
    layoutSizingHorizontal: (() => {
      if (type !== 'text' || !parent) return sizing.horizontal;

      const maxTextWidth = textChildValues.reduce(
        (acc, t) => Math.max(acc, t.width || 0), 0
      );

      // Gross single-line overflow guard: captured text far wider than its
      // parent (>1.25×) cannot render without overlapping siblings — the
      // browser itself couldn't have painted it that way in a settled layout
      // (nicepage.io block-5 quotes: a display:table <p> captured mid-layout
      // as one 1095px line inside a 373px card). FILL makes it wrap at the
      // parent width, which is what the settled page shows.
      if ((browserLineCount ?? 1) === 1 && maxTextWidth > parent.width * 1.25) {
        return 'FILL';
      }

      // Multi-line text WIDER than its parent (width:auto + negative
      // margin-right, e.g. nicepage.io hero h1 at 514px in a 399px column):
      // FILL would re-wrap it at the narrower parent and break words
      // mid-word (Figma wraps by character on overflow). FIXED keeps the
      // captured width so the browser's line breaks survive.
      if (
        (browserLineCount ?? 1) > 1 &&
        node.width > parent.width + 1 &&
        str(s.width) !== '100%'
      ) {
        return 'FIXED';
      }

      // Multi-line coalesced text can never HUG: Figma's WIDTH_AND_HEIGHT
      // auto-resize renders the joined per-line values as one nowrap run
      // (nicepage.io block-5 quotes: flex-column card gives the display:table
      // <p> HUG sizing → 4 captured lines paint as a single 1000px+ line).
      // FIXED keeps the captured element width = the browser's wrap width.
      if ((browserLineCount ?? 1) > 1 && sizing.horizontal === 'HUG') {
        return 'FIXED';
      }

      if (sizing.horizontal !== 'FILL') return sizing.horizontal;
      if ((browserLineCount ?? 1) !== 1) return sizing.horizontal;

      // Single-line coalesced text → prefer HUG when the parent is already
      // content-sized (parent.width matches child text width) or the child
      // text naturally overflows the parent. Either way FILL would let
      // outer layout constraints shrink-wrap the text, which loses the
      // intrinsic width captured by the browser. HUG preserves it.
      //
      // Skip the override when CSS has an explicit sizing intent that
      // should win: explicit width/max-width (other than "auto"/"none"),
      // width: 100%, alignSelf: stretch, etc. — getSizing/cssMaxWidth
      // handle those already.
      const explicitWidth = str(s.width);
      const hasExplicitWidth = explicitWidth && explicitWidth !== 'auto';
      const hasExplicitFillIntent =
        explicitWidth === '100%' ||
        str(s.alignSelf) === 'stretch' ||
        (typeof s.flexGrow === 'number' && s.flexGrow > 0);
      if (hasExplicitWidth || hasExplicitFillIntent) return sizing.horizontal;

      // 1px tolerance for sub-pixel rounding — HUG when parent.width
      // matches or exceeds text natural width (i.e. parent is already
      // sized to fit the text, no stretch happening).
      return maxTextWidth >= parent.width - 1 ? 'HUG' : sizing.horizontal;
    })(),
    layoutSizingVertical: effectiveVertical,

    // Grid
    gridTemplateColumns: !isAbsoluteMode ? str(s.gridTemplateColumns) : undefined,
    gridTemplateRows: !isAbsoluteMode ? str(s.gridTemplateRows) : undefined,
    gridAutoFlow: !isAbsoluteMode ? str(s.gridAutoFlow) : undefined,
    gridColumnGap: !isAbsoluteMode ? (parseFloat(str(s.columnGap) || gapStr) || 0) : undefined,
    gridRowGap: !isAbsoluteMode ? (parseFloat(str(s.rowGap) || gapStr) || 0) : undefined,
    // Grid child placement — explicit CSS line numbers (1-based). Needed so
    // children land in the correct cell (e.g. a centering grid where the
    // content sits on `grid-column: 2`). "auto"/spans/line-names → undefined.
    // The longhands are not captured, so in practice `grid-area` is what
    // carries the placement; geometry inference remains the last resort and is
    // the only option for spans and named areas.
    gridColumnStart: !isAbsoluteMode
      ? (parseGridLine(s.gridColumnStart)
        ?? gridArea?.columnStart
        ?? inferGridColumnStart(node, parent))
      : undefined,
    gridColumnEnd: !isAbsoluteMode
      ? (parseGridLine(s.gridColumnEnd) ?? gridArea?.columnEnd)
      : undefined,
    // Recover a missing grid row from geometry the same way we
    // already recover missing grid columns, so partial placement data does not
    // cascade into wrong spacer insertion later in the Figma grid renderer.
    gridRowStart: !isAbsoluteMode
      ? (parseGridLine(s.gridRowStart)
        ?? gridArea?.rowStart
        ?? inferGridRowStart(node, parent))
      : undefined,
    gridRowEnd: !isAbsoluteMode
      ? (parseGridLine(s.gridRowEnd) ?? gridArea?.rowEnd)
      : undefined,

    // Visual
    fills: fills.length > 0 ? fills : undefined,
    // background-clip:text paint — belongs to the glyphs, never the box
    textFills,
    strokes: strokes.length > 0 ? strokes : undefined,
    effects: effects.length > 0 ? effects : undefined,

    // Legacy fields
    backgroundColor: (() => {
      const solidFill = fills.find(f => f.type === 'SOLID');
      return solidFill && solidFill.color ? figmaColorToCSS(solidFill.color) : null;
    })(),
    backgroundGradient: fills.some(f => f.type.startsWith('GRADIENT_'))
      ? str(s.backgroundImage) || null
      : null,
    textColor,
    borderColor: strokes.length > 0
      ? figmaColorToCSS(strokes[0].color)
      : null,
    borderWidth: strokes.length > 0 ? strokes[0].weight : 0,
    borderRadius,
    opacity,
    blendMode: str(s.mixBlendMode),
    constrainProportions: parseAspectRatio(s.aspectRatio),
    overflow: effectiveOverflow,
    margin: margin.top || margin.right || margin.bottom || margin.left ? margin : undefined,
    horizontallyCentered: isHorizontallyCentered || undefined,

    // CSS max-width (px) — applied as Figma native maxWidth on text/frame to
    // enforce the constraint regardless of layoutSizingHorizontal (FILL/HUG).
    // Parsed from CSS value like "265px". Skipped for 'none', '%' and non-px units.
    cssMaxWidth: (() => {
      const raw = str(s.maxWidth);
      if (!raw || raw === 'none' || raw.includes('%')) return undefined;
      const n = parseFloat(raw);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    })(),

    // CSS min/max box constraints → native Figma minWidth/minHeight/maxHeight
    // on auto-layout children (nodes.ts applyChildInAutoLayout). px-only.
    cssMinWidth: parsePxLength(str(s.minWidth)),
    cssMinHeight: parsePxLength(str(s.minHeight)),
    cssMaxHeight: parsePxLength(str(s.maxHeight)),

    // Nearest <a href> as an absolute URL → TextNode.hyperlink downstream.
    href: resolveLinkHref(node, parent),

    // Base-state text-shadow — applied on the TextNode itself in text.ts
    // (previously only hover variants rendered it).
    textShadowEffects: (() => {
      if (type !== 'text') return undefined;
      const raw = str(s.textShadow);
      if (!raw || raw === 'none') return undefined;
      const fx = parseBoxShadow(raw);
      return fx.length > 0 ? fx : undefined;
    })(),

    // Text
    textContent,
    styledSegments,
    browserLineCount,
    renderedTextWidth: type === 'text' && textChildValues.length > 0
      ? textChildValues.reduce((acc, t) => Math.max(acc, t.width || 0), 0) || undefined
      : undefined,
    renderedTextWidths: (() => {
      // Only populate for genuinely multi-line text. Same-Y inline parts
      // (e.g. `<p>a <strong>b</strong> c</p>` on one line) must not trigger
      // the FILLR multi-line renderer.
      if (type !== 'text' || textChildValues.length < 2) return undefined;
      const widths = computeLineWidthsByY(textChildValues);
      return widths.length > 1 ? widths : undefined;
    })(),
    fontSize,
    fontWeight,
    fontFamily: effectiveFontFamily,
    fontFamilyList: type === 'text' && fontFamilyStack.length > 1 ? fontFamilyStack : undefined,
    fontStyle,
    textAlign,
    lineHeight: (() => {
      if (lineHeight !== 'normal') return parseFloat(lineHeight) || 'normal';
      // `normal` on multi-line text: derive px from per-line y-deltas so a
      // substituted Figma font can't drift the wrap height (browser `normal`
      // uses the site font's metrics, Figma `normal` would use the stand-in's).
      if (type === 'text' && textChildValues.length >= 2) {
        const rowYs = Array.from(new Set(textChildValues.map(t => Math.round(t.y)))).sort((a, b) => a - b);
        if (rowYs.length >= 2) {
          const derived = (rowYs[rowYs.length - 1] - rowYs[0]) / (rowYs.length - 1);
          if (derived > 4) return Math.round(derived * 100) / 100;
        }
      }
      return 'normal';
    })(),
    letterSpacing,
    textCase,
    textAlignVertical: type === 'text' ? textAlignVertical : undefined,
    textDecorationStyle: type === 'text' ? textDecorationStyle : undefined,
    textDecorationColor: type === 'text' ? textDecorationColor : undefined,

    // text-overflow: ellipsis / -webkit-line-clamp → Figma truncation. Gated
    // on an overflow value that actually clips: `ellipsis` without clipping
    // does nothing in the browser, so truncating in Figma would be wrong.
    ...(() => {
      if (type !== 'text') return {};
      const clips = (v: string) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
      const overflowClips = clips(str(s.overflow)) || clips(str(s.overflowX)) || clips(str(s.overflowY));
      if (!overflowClips) return {};
      const clampRaw = parseInt(str(s.webkitLineClamp), 10);
      const lineClamp = Number.isFinite(clampRaw) && clampRaw > 0 ? clampRaw : 0;
      const wantsEllipsis = str(s.textOverflow) === 'ellipsis';
      if (!wantsEllipsis && lineClamp === 0) return {};
      return {
        textTruncation: 'ENDING' as const,
        maxLines: lineClamp > 0 ? lineClamp : undefined,
      };
    })(),

    // -webkit-text-stroke → TextNode strokes (outlined display text).
    textStroke: (() => {
      if (type !== 'text') return undefined;
      const w = parseFloat(str(s.webkitTextStrokeWidth)) || 0;
      if (w <= 0) return undefined;
      return { width: w, color: str(s.webkitTextStrokeColor) || str(s.color) || 'rgb(0, 0, 0)' };
    })(),

    // Pseudo states
    pseudoStateStyles: (() => {
      // Preferred path: a real hover subtree was captured via CDP. Compute
      // the diff; discard it when every prop is trivial (no visible delta).
      // Image-card anchors (apple .tile-link) trigger this because their
      // only hover change is `text-decoration-line: none` or cursor — h2d
      // doesn't create variants for these either.
      if (node.hover) {
        const diff = computeHoverDiff(node.styles, node.hover.styles);
        if (diff && !isTrivialHoverDiff(diff.hover)) {
          return diff;
        }
      }
      // Synthetic `opacity: 0.8` fallback REMOVED (h2d-parity).
      // Previously: interactive elements without a captured diff got a
      // fake `{ opacity: 0.8 }` hover so they'd render with a visible
      // Hover variant. That turned out to be pure fiction on apple.com
      // image tiles (no such CSS rule exists) and produced ghost hover
      // components on every hero/card. Cursor:pointer for interactive
      // elements is now handled via `needsCursorPointer` + dummy reaction
      // in nodes.ts instead.
      return undefined;
    })(),

    // Batch 3 (h2d-parity): interactive element marker for Figma Preview
    // cursor:pointer. Set when the element is clickable (tag/role/tabindex/
    // cursor-pointer) but we did NOT emit a hover variant (either no diff
    // or only a trivial one). nodes.ts attaches a self-referencing ON_HOVER
    // reaction on these elements → Figma Preview renders cursor:pointer
    // without a ghost ComponentSet being created.
    needsCursorPointer: (() => {
      // If we already returned a real pseudoStateStyles.hover, the variant
      // path handles cursor:pointer — no marker needed.
      const realHover = node.hover
        ? computeHoverDiff(node.styles, node.hover.styles)
        : undefined;
      if (realHover && !isTrivialHoverDiff(realHover.hover)) return undefined;
      // Mark only when the element is actually interactive.
      return isInteractiveNode(node) ? true : undefined;
    })(),

    // Visibility state (for interaction variants)
    isHiddenInDefault: node._isHiddenInDefault || undefined,

    // FIX 4: true when any descendant carries its own pseudoStateStyles.
    // Used by nodes.ts to create a ComponentSet trigger even if this node's
    // own diff is empty (parent-hover → child-visibility case).
    hasDescendantHover: children.some(
      (c) =>
        (c.pseudoStateStyles !== undefined &&
          c.pseudoStateStyles.hover !== undefined) ||
        c.hasDescendantHover === true,
    ) || undefined,

    // Media
    isPlaceholder: type === 'placeholder',
    imageUrl: node.$url,
    objectFit: type === 'placeholder' ? str(s.objectFit) || undefined : undefined,
    // object-position (captured only when non-default) → fractional crop
    // focus for realImages.ts. Percent/keyword forms only; px falls back.
    objectPosition: (() => {
      if (type !== 'placeholder') return undefined;
      const raw = str(s.objectPosition);
      if (!raw) return undefined;
      return parseCssPosition(raw) || undefined;
    })(),

    // Static rotation (degrees, clockwise) recovered from the transform matrix
    rotation: parseCssRotation(str(s.transform)),
    // Propagate inlined SVG markup for <img src="*.svg"> so nodes.ts can
    // render it as a native Figma Vector via figma.createNodeFromSvg().
    computedStyles: node.$svgMarkup && type === 'placeholder'
      ? { svgMarkup: node.$svgMarkup }
      : undefined,

    children,
  };

  return wireframeNode;
}

// ---------------------------------------------------------------------------
// Text node conversion
// ---------------------------------------------------------------------------

/**
 * Convert a text value (from collected TEXT child) into a WireframeNode.
 * Used when TEXT children can't be coalesced (mixed with FRAME/SVG children).
 */
function convertTextNodeFromValue(
  tv: TextChildValue,
  parentNode: W2WFrameNode | null,
  parentStyles: Record<string, string | number | undefined>,
  _options: ConvertOptions,
): WireframeNode {
  const id = `w2w-${_nodeId++}`;
  const { weight } = parseFontString(tv.font);
  const family = measuredFamily(tv.font);

  // Mixed-children counterpart of the coalesced path: a `background-clip: text`
  // parent keeps its paint off the box, so each TEXT child carries the clipped
  // background as its own glyph fill (and never inherits a transparent color).
  const textFills = isBackgroundClipText(parentStyles)
    ? (() => {
        const parsed = parseFills(parentStyles, tv.width, tv.height);
        return parsed.length > 0 ? parsed : undefined;
      })()
    : undefined;

  const textColor = tv.color
    || resolveTextColor(parentStyles, textFills);

  // Same textCase contract as the coalesced path: UPPER/LOWER ride Figma's
  // textCase with the raw string kept; capitalize stays baked.
  const tvTransform = str(parentStyles.textTransform);
  const tvTextCase = tvTransform === 'uppercase' ? ('UPPER' as const)
    : tvTransform === 'lowercase' ? ('LOWER' as const)
    : undefined;
  const value = applyTextTransform(tv.value, tvTextCase ? undefined : tvTransform);

  const parentStack = parseFontFamilyStack(str(parentStyles.fontFamily));
  // PUA icon glyph rescue — same rule as the coalesced path: the platform
  // font pass mislabels icon glyphs with the dominant text font.
  const iconFamily = isPuaOnlyText(tv.value)
    ? parentStack.find(isIconFont) ?? parentStack[0]
    : undefined;

  return {
    id,
    name: getTextNodeName(value, parentNode),
    type: 'text' as const,
    tag: '#text',
    x: parentNode ? tv.x - parentNode.x : tv.x,
    y: parentNode ? tv.y - parentNode.y : tv.y,
    width: tv.width,
    height: tv.height,

    layoutMode: 'NONE' as const,
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },

    backgroundColor: null,
    backgroundGradient: null,
    textFills,
    textColor,
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,

    textContent: value,
    textCase: tvTextCase,
    fontSize: parseFloat(str(parentStyles.fontSize)) || 16,
    fontWeight: tv.fontWeight || parseFontWeight(str(parentStyles.fontWeight)) || weight,
    // Server-capture fallbacks are ignored here for the same reason as in the
    // styled-segment path above: they are Linux container artifacts, not the
    // page's font, and must not enter the wireframe's font demand.
    fontFamily: iconFamily || measuredFamily(tv.platformFamily) || family || parentStack[0] || '',
    fontFamilyList: parentStack.length > 1 ? parentStack : undefined,
    textAlign: str(parentStyles.textAlign) || 'left',
    lineHeight: str(parentStyles.lineHeight) || 'normal',
    letterSpacing: parseFloat(str(parentStyles.letterSpacing)) || 0,

    // Inherit parent's CSS max-width so merged/child TEXT inside a <p> with
    // max-width still wraps at the constraint (MERGE path for paragraphs that
    // contain inline non-text children like <sup>).
    cssMaxWidth: (() => {
      const raw = str(parentStyles.maxWidth);
      if (!raw || raw === 'none' || raw.includes('%')) return undefined;
      const n = parseFloat(raw);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    })(),

    // Mixed-children counterparts of the coalesced-path fields: the parent's
    // link URL and inherited text-shadow apply to each TEXT child.
    href: resolveLinkHref(parentNode, null),
    textShadowEffects: (() => {
      const raw = str(parentStyles.textShadow);
      if (!raw || raw === 'none') return undefined;
      const fx = parseBoxShadow(raw);
      return fx.length > 0 ? fx : undefined;
    })(),

    isPlaceholder: false,
    children: [],
  };
}

// ---------------------------------------------------------------------------
// Adjacent per-line TEXT merging
// ---------------------------------------------------------------------------

/**
 * Merge consecutive TEXT entries that represent visual lines of the same
 * paragraph. The content-script splits multi-line text nodes into per-line
 * W2WTextNodes (via getClientRects), so a single paragraph may produce 8+
 * TEXT entries. This function detects runs of adjacent TEXT entries with
 * matching font, x-position and height, and joins them into one entry.
 *
 * Non-text entries (FRAME/SVG children) always break a run.
 */
type OrderEntry = { kind: 'text'; index: number } | { kind: 'child'; index: number };

/** TextChildValue carrying per-run segments after a same-row merge. */
type RowMergedValue = TextChildValue & { _rowSegments?: TextChildValue[] };

function mergeAdjacentTextEntries(
  entries: OrderEntry[],
  textValues: TextChildValue[],
): { mergedEntries: OrderEntry[]; mergedValues: TextChildValue[] } {
  if (entries.length <= 1) {
    return { mergedEntries: entries, mergedValues: textValues };
  }

  const mergedEntries: OrderEntry[] = [];
  const mergedValues: TextChildValue[] = [];

  let runStart = -1; // index into entries where current TEXT run started

  const flushRun = (runEnd: number): void => {
    if (runStart < 0) return;
    const runEntries = entries.slice(runStart, runEnd);
    const rawTvs = runEntries.map(e => textValues[e.index]);

    // Pass 1 — same-row merge: horizontally-adjacent runs on the same visual
    // row joined by a boundary space (inline styling spans: "03.05.2026 " +
    // bold "Porto, Portugal") become ONE value carrying per-run _rowSegments.
    // Kept separate, Figma trims the first run's trailing space in auto-width
    // text and the runs render glued together. Runs WITHOUT a boundary space
    // are intentionally contiguous — those stay separate nodes (inline-flow
    // rendering handles them; see css-converter-inline-flow tests).
    const tvs: RowMergedValue[] = [];
    for (const raw of rawTvs) {
      const prev = tvs[tvs.length - 1];
      const gapX = prev ? raw.x - (prev.x + prev.width) : 0;
      const hasBoundarySpace = prev
        ? /\s$/.test(prev.value) || /^\s/.test(raw.value)
        : false;
      // A visible geometric gap between contiguous runs means the browser
      // painted whitespace there even when the captured values lost it
      // (pre-boundary-space extractors trimmed "03.05.2026 " to
      // "03.05.2026"). Heal by inserting the space back on merge. Runs that
      // touch exactly (gap ≈ 0) are intentionally contiguous — leave them.
      const hasVisibleGap = prev ? gapX >= 2 : false;
      const sameRow = prev &&
        Math.abs(raw.y - prev.y) <= Math.max(2, prev.height * 0.2) &&
        gapX >= -3 &&
        gapX <= 12 &&
        (hasBoundarySpace || hasVisibleGap);
      if (prev && sameRow) {
        const segs = prev._rowSegments ?? [{ ...prev }];
        if (!hasBoundarySpace) {
          // Keep segments in sync with the joined value — text.ts maps
          // styling ranges from segment lengths.
          const last = segs[segs.length - 1];
          segs[segs.length - 1] = { ...last, value: last.value + ' ' };
          prev.value = prev.value + ' ';
        }
        prev._rowSegments = [...segs, { ...raw }];
        prev.value = prev.value + raw.value;
        prev.width = (raw.x + raw.width) - prev.x;
        prev.height = Math.max(prev.height, raw.height);
      } else {
        tvs.push({ ...raw });
      }
    }

    // Group consecutive mergeable TEXT values
    const groups: TextChildValue[][] = [];
    let currentGroup: TextChildValue[] = [tvs[0]];

    for (let i = 1; i < tvs.length; i++) {
      const prev = tvs[i - 1];
      const curr = tvs[i];
      // Row-merged values keep their segments — never fold them into a
      // vertical paragraph merge (segment ranges would be lost).
      const hasSegments = !!(prev as RowMergedValue)._rowSegments ||
        !!(curr as RowMergedValue)._rowSegments;
      const sameFont = !hasSegments && curr.font === prev.font;
      const sameX = Math.abs(curr.x - prev.x) <= 2;
      const sameHeight = Math.abs(curr.height - prev.height) <= 1;
      const yGap = curr.y - prev.y;
      const maxLineStep = prev.height * 2.5; // allow up to 2.5× lineHeight
      const sequentialY = yGap > 0 && yGap <= maxLineStep;

      if (sameFont && sameX && sameHeight && sequentialY) {
        currentGroup.push(curr);
      } else {
        groups.push(currentGroup);
        currentGroup = [curr];
      }
    }
    groups.push(currentGroup);

    // Convert each group into a merged TextChildValue
    for (const group of groups) {
      if (group.length === 1) {
        // Single entry — no merge needed
        const idx = mergedValues.length;
        mergedValues.push(group[0]);
        mergedEntries.push({ kind: 'text', index: idx });
      } else {
        // Merge group: join values, expand bounds, track line count.
        // Semantic dedup: identical placeholder values (e.g. ["List item",
        // "List item"] from a 2-line wrapped <li> in semantic mode) render
        // once instead of joining into "List item List item".
        const first = group[0];
        const last = group[group.length - 1];
        const allSameValue = group.every(t => t.value === first.value);
        const merged: TextChildValue = {
          value: allSameValue ? first.value : group.map(t => t.value).join(' '),
          font: first.font,
          platformFamily: first.platformFamily,
          x: first.x,
          y: first.y,
          width: Math.max(...group.map(t => t.width)),
          height: (last.y + last.height) - first.y,
          color: first.color,
          textDecoration: first.textDecoration,
          tag: first.tag,
          fontWeight: first.fontWeight,
          // Store original line count + per-line widths for FILLR multi-line
          // rendering (widths in reading order top→bottom).
          _mergedLineCount: group.length,
          _mergedLineWidths: group.map(t => t.width),
        } as TextChildValue & { _mergedLineCount: number; _mergedLineWidths: number[] };

        const idx = mergedValues.length;
        mergedValues.push(merged);
        mergedEntries.push({ kind: 'text', index: idx });
      }
    }

    runStart = -1;
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.kind === 'text') {
      if (runStart < 0) runStart = i;
    } else {
      // Non-text entry — flush any pending TEXT run, then push the child
      flushRun(i);
      mergedEntries.push({ kind: 'child', index: entry.index });
    }
  }
  // Flush trailing TEXT run
  flushRun(entries.length);

  return { mergedEntries, mergedValues };
}

// ---------------------------------------------------------------------------
// SVG node conversion
// ---------------------------------------------------------------------------

function convertSVGNode(node: W2WSVGNode, parent: W2WFrameNode | null): WireframeNode {
  const id = `w2w-${_nodeId++}`;

  return {
    id,
    name: 'SVG',
    type: 'placeholder',
    tag: 'svg',
    x: parent ? node.x - parent.x : node.x,
    y: parent ? node.y - parent.y : node.y,
    width: node.width,
    height: node.height,

    layoutMode: 'NONE',
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },

    backgroundColor: null,
    backgroundGradient: null,
    textColor: 'rgb(0, 0, 0)',
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,

    textContent: '',
    fontSize: 16,
    fontWeight: 400,
    fontFamily: 'Arial',
    textAlign: 'left',
    lineHeight: 'normal',
    letterSpacing: 0,

    isPlaceholder: true,
    // Store SVG markup in computedStyles for special handling
    computedStyles: { svgMarkup: node.svg },

    children: [],
  };
}

// ---------------------------------------------------------------------------
// Layout detection
// ---------------------------------------------------------------------------

function getLayoutMode(
  s: Record<string, string | number | undefined>,
): 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID' {
  const display = str(s.display);
  if (!display) return 'NONE';

  if (display === 'flex' || display === 'inline-flex') {
    const dir = str(s.flexDirection);
    return (dir === 'column' || dir === 'column-reverse') ? 'VERTICAL' : 'HORIZONTAL';
  }

  if (display === 'grid' || display === 'inline-grid') {
    return 'GRID';
  }

  return 'NONE';
}

/**
 * How many distinct horizontal bands (visual lines) do these children occupy?
 *
 * Children whose vertical extents overlap belong to the same band; a child
 * starting at or below the running bottom edge opens a new one. A single band
 * means the parent really is a row — several bands mean it is a column of
 * rows, whatever the CSS hints say. Zero-area children are ignored: they carry
 * no visual line of their own.
 */
function countLineBands(children: W2WNode[]): number {
  const boxes = children
    .filter((c) => c.width > 0.5 && c.height > 0.5)
    .map((c) => ({ top: c.y, bottom: c.y + c.height }))
    .sort((a, b) => a.top - b.top);

  if (boxes.length === 0) return 0;

  let bands = 1;
  let bottom = boxes[0].bottom;
  for (let i = 1; i < boxes.length; i++) {
    if (boxes[i].top >= bottom) {
      bands++;
      bottom = boxes[i].bottom;
    } else {
      bottom = Math.max(bottom, boxes[i].bottom);
    }
  }
  return bands;
}

/**
 * When parent has display:block (getLayoutMode returns NONE),
 * check if children's CSS indicates horizontal layout:
 * - float: left/right/inline-start/inline-end → children are side-by-side
 * - display: inline-block/inline → children flow horizontally
 */
/**
 * Do these inline-level children add up past the parent's width?
 *
 * Inline boxes wrap. When their widths sum beyond the parent, the browser
 * broke them across lines, so a single-row auto-layout cannot be what the
 * page showed — it would crush every child to fit (stripe.com's section
 * heading: an h2 and a p needing 1369px inside an 856px block).
 *
 * An inline box's rect is the union of its line boxes, so a wrapped paragraph
 * reports a width far past where any one line ends. That makes the sum a
 * reliable "this wrapped" signal, and `countLineBands()` a useless one here:
 * the boxes all start at the same origin and read as a single band.
 */
function inlineChildrenOverflowParent(
  children: W2WNode[],
  parentWidth?: number,
): boolean {
  if (typeof parentWidth !== 'number' || parentWidth <= 0) return false;
  const total = children.reduce((sum, c) => sum + (c.width > 0 ? c.width : 0), 0);
  return total > parentWidth + 1;
}

/**
 * Do any two children's captured rects overlap?
 *
 * Grid tracks never overlap, so an overlap means the page stacked items in one
 * cell — an arrangement Figma's auto-placed grid cannot reproduce. Shared
 * edges do not count: neighbouring tiles touch at exactly one coordinate.
 *
 * Zero-area children are skipped; they cover nothing.
 */
function hasOverlappingChildren(children: W2WNode[]): boolean {
  const boxes = children.filter((c) => c.width > 0.5 && c.height > 0.5);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > 0.5 && overlapY > 0.5) return true;
    }
  }
  return false;
}

function inferLayoutFromChildren(
  children: W2WNode[],
  parentTag: string,
  parentWidth?: number,
): 'HORIZONTAL' | null {
  if (children.length === 0) return null;

  let textNodeCount = 0;
  let inlineTextFrameCount = 0;
  let inlineBlockCount = 0;
  let blockFrameCount = 0;
  let floatCount = 0;

  for (const child of children) {
    if (child.type === 'TEXT') {
      textNodeCount++;
      continue;
    }
    if (child.type !== 'FRAME') continue;
    const frame = child as W2WFrameNode;
    const cs = frame.styles;
    const f = str(cs.cssFloat);
    const d = str(cs.display);

    // Float is EXPLICIT horizontal intent and must win over the inline-text
    // classification below. telex.ge navbar: <a class="ac-title"> holds a
    // float:left <i> icon whose subtree is all text (glyph + badge) — counting
    // it as an inline-text frame hid the float, the all-inline rule is gated
    // off for <a> parents, and the icon/label stacked vertically out of the bar.
    if (f === 'left' || f === 'right' || f === 'inline-start' || f === 'inline-end') {
      floatCount++;
      continue;
    }

    // Inline-text frames (span, a, strong, etc. with only text inside).
    // These stay as separate nodes inside a block parent (see Apple footer
    // case) but count as inline signal for layout inference.
    if (INLINE_TEXT_TAGS.has(frame.tag) && isTextOnlyFrame(frame)) {
      inlineTextFrameCount++;
      continue;
    }

    if (d === 'inline' || d === 'inline-block') {
      inlineBlockCount++;
      continue;
    }
    blockFrameCount++;
  }

  // Float → HORIZONTAL, but only while the children really do sit on ONE line.
  // A float pulls its *inline* neighbours alongside it; it does not stop later
  // block siblings from stacking below. telex.ge product cards are exactly
  // that: a 14×14 float:left video badge between the cover image and the
  // rating row, with name and price stacked underneath. Treating that as a row
  // laid 841px of content across a 241px card, pushing the stars, title and
  // price outside the clipped frame — present in the layer list, invisible on
  // canvas. Measured geometry is the arbiter: multiple bands → not a row.
  if (floatCount > 0 && countLineBands(children) <= 1) {
    return 'HORIZONTAL';
  }

  // Fix A: all children are inline (text runs, inline-text frames, or
  // inline/inline-block frames) → parent renders as HORIZONTAL auto-layout
  // with children kept as separate nodes (matches h2d behavior).
  //
  // Gate: skip for TEXT_COALESCE_TAGS parents (p, h1-h6, span, a, etc.) —
  // those use the inline text coalescing path and must stay as NONE so the
  // coalescing branch can promote them to type='text' with styledSegments.
  const inlineSignal = textNodeCount + inlineTextFrameCount + inlineBlockCount;
  if (
    !TEXT_COALESCE_TAGS.has(parentTag) &&
    blockFrameCount === 0 &&
    inlineSignal > 0 &&
    !inlineChildrenOverflowParent(children, parentWidth)
  ) {
    return 'HORIZONTAL';
  }

  // Existing heuristic: majority inline-block mixed with block frames → HORIZONTAL
  if (blockFrameCount > 0 && inlineBlockCount > blockFrameCount / 2) {
    return 'HORIZONTAL';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sizing detection (HUG / FILL / FIXED)
// ---------------------------------------------------------------------------

/** True when `margin-left` or `margin-right` resolves to a negative length. */
function hasNegativeInlineMargin(
  s: Record<string, string | number | undefined>,
): boolean {
  for (const key of ['marginLeft', 'marginRight'] as const) {
    const raw = s[key];
    if (raw == null) continue;
    const value = parseFloat(String(raw));
    if (!isNaN(value) && value < 0) return true;
  }
  return false;
}

/**
 * Are all of this frame's children out of flow (`position: absolute`/`fixed`)?
 *
 * TEXT children have no `position`, so a frame holding any text counts as
 * having in-flow content. A childless frame is not "out of flow" either —
 * there is simply nothing to say about it.
 */
function hasNoInFlowChildren(node: W2WFrameNode): boolean {
  const children = node.children ?? [];
  if (children.length === 0) return false;
  return children.every((c) => {
    if (c.type !== 'FRAME') return false;
    const pos = str((c as W2WFrameNode).styles?.position);
    return pos === 'absolute' || pos === 'fixed';
  });
}

/**
 * Does a `width: auto` flex item carry a width the browser already resolved?
 *
 * Two signals count, and both mean the page stated a definite intent that the
 * measured geometry now embodies:
 *
 *   max-width the element actually reached — the cap won, so the cap IS the
 *   width. (`flex-grow: 1` normally routes past the max-width rule above via
 *   `hasExplicitFillIntent`; a grown item that stopped exactly at its cap did
 *   not, in the end, grow past it.)
 *
 *   a definite `flex-basis` — a percentage, calc(), or length. We never have
 *   to evaluate `calc(33.333% - 8px)` ourselves: the browser resolved it and
 *   the result is the measured width.
 *
 * `flex-basis: auto` / `content` state no intent and fall through to HUG.
 */
function flexAutoHasDefiniteWidth(
  s: Record<string, string | number | undefined>,
  ownWidth?: number,
): boolean {
  if (typeof ownWidth !== 'number' || ownWidth <= 0) return false;

  const maxW = parseFloat(str(s.maxWidth) || '');
  if (Number.isFinite(maxW) && Math.abs(maxW - ownWidth) <= 1) return true;

  const basis = str(s.flexBasis);
  return !!basis && basis !== 'auto' && basis !== 'content';
}

function getSizing(
  s: Record<string, string | number | undefined>,
  parentStyles: Record<string, string | number | undefined> | undefined | null,
  layoutMode: string,
  parentDims?: { width: number; height: number },
  ownWidth?: number,
  /** Every child is `position: absolute`/`fixed` — nothing is in flow to hug. */
  hasNoInFlowChildren?: boolean,
): {
  horizontal: 'FIXED' | 'HUG' | 'FILL' | undefined;
  vertical: 'FIXED' | 'HUG' | 'FILL' | undefined;
  grow: 0 | 1;
  align: 'STRETCH' | 'INHERIT';
} {
  const width = str(s.width);
  const height = str(s.height);
  const flexGrow = typeof s.flexGrow === 'number' ? s.flexGrow : 0;
  const alignSelf = str(s.alignSelf);

  // `flex-shrink: 0` is an explicit refusal to shrink, so a `100%` main-axis
  // size must stay FIXED — FILL would let Figma resize it with the container,
  // the opposite of what the page declared. A grown item still fills: taking
  // the free space is its own intent. flex-shrink governs the MAIN axis only,
  // so this never touches cross-axis sizing.
  const cannotShrink = s.flexShrink === 0 && flexGrow === 0;

  // A negative side margin used as a BLEED gutter (`margin: 0 -6px`) makes the
  // element wider than its container. The browser-measured width already
  // carries that overhang, so FILL would snap it back to the parent and lose
  // it (iwm.org.uk's mosaic row: 1273px measured, 1261px parent). A negative
  // margin that leaves the element narrower than its parent is just a pull —
  // it keeps the normal sizing rules.
  if (
    hasNegativeInlineMargin(s) &&
    typeof ownWidth === 'number' &&
    parentDims &&
    ownWidth > parentDims.width + 0.5
  ) {
    return { horizontal: 'FIXED', vertical: 'FIXED', grow: 0, align: 'INHERIT' };
  }

  const parentDisplay = parentStyles ? str(parentStyles.display) : '';
  const parentIsFlexOrGrid = parentDisplay === 'flex' || parentDisplay === 'inline-flex'
    || parentDisplay === 'grid' || parentDisplay === 'inline-grid';

  if (!parentIsFlexOrGrid) {
    // Block parent (display: block) — block children fill parent width by default
    const parentIsBlock = parentDisplay === 'block' || parentDisplay === 'list-item' || parentDisplay === '';
    const childDisplay = str(s.display);
    const isBlockChild = childDisplay === 'block' || childDisplay === 'list-item'
      || childDisplay === 'flex' || childDisplay === 'grid'
      || childDisplay === '' || !childDisplay;

    if (parentIsBlock && isBlockChild) {
      // Float children: FIXED width (not FILL — float uses its computed width)
      const childFloat = str(s.cssFloat);
      if (childFloat === 'left' || childFloat === 'right'
        || childFloat === 'inline-start' || childFloat === 'inline-end') {
        return {
          horizontal: 'FIXED',
          vertical: 'FIXED',
          grow: 0,
          align: 'INHERIT',
        };
      }
      // Block children with max-width: FIXED width (element is narrower than
      // parent due to the constraint). Without this, text nodes inherit parent
      // width via FILL and render on one line instead of wrapping at max-width.
      const maxW = str(s.maxWidth);
      if (maxW && maxW !== 'none') {
        return {
          horizontal: 'FIXED',
          vertical: 'FIXED',
          grow: 0,
          align: 'INHERIT',
        };
      }
      // Block children in block parent: FILL width, FIXED height
      // Use browser-measured height (from node.height) — NOT HUG.
      // HUG would let Figma recalculate height from content, which differs
      // due to font rendering, margin collapsing, etc.
      return {
        horizontal: 'FILL',
        vertical: 'FIXED',
        grow: 0,
        align: 'INHERIT',
      };
    }

    return { horizontal: undefined, vertical: undefined, grow: 0, align: 'INHERIT' };
  }

  const parentDir = str(parentStyles?.flexDirection);
  const isParentVertical = parentDir === 'column' || parentDir === 'column-reverse';

  let horizontal: 'FIXED' | 'HUG' | 'FILL' = 'FIXED';
  let vertical: 'FIXED' | 'HUG' | 'FILL' = 'FIXED';

  const isParentGrid = parentDisplay === 'grid' || parentDisplay === 'inline-grid';

  // Flex/grid child with explicit maxWidth: FIXED horizontal sizing.
  // Browser-resolved node.width already reflects the maxWidth constraint;
  // without this guard, `width: auto` children in a stretching flex column
  // would get FILL and blow past maxWidth (e.g. Apple.com p.tile-subhead
  // rendering on one 635px line instead of wrapping at 265px).
  // Skip when caller has an explicit FILL intent (width:100%, flexGrow>0,
  // alignSelf:stretch) or when the element is a grid item (grid cell sizing
  // is distinct from content-box sizing).
  const maxW = str(s.maxWidth);
  const hasExplicitFillIntent = width === '100%' || flexGrow > 0 || alignSelf === 'stretch';
  if (maxW && maxW !== 'none' && !hasExplicitFillIntent && !isParentGrid) {
    // Width
    if (width === 'fit-content' || width === 'max-content') {
      horizontal = 'HUG';
    } else {
      horizontal = 'FIXED';
    }
  } else if (width === 'fit-content' || width === 'max-content') {
    horizontal = 'HUG';
  } else if (width === 'auto') {
    // CSS "auto" in grid = stretch to cell; in flex = shrink-to-content (HUG)
    // unless alignSelf/alignItems = stretch
    if (isParentGrid) {
      horizontal = 'FILL'; // Grid items stretch to cell by default
    } else if (isParentVertical) {
      // Vertical flex: cross-axis (horizontal) defaults to stretch
      const parentAlign = str(parentStyles?.alignItems);
      if (alignSelf === 'stretch' || (!alignSelf && (parentAlign === 'stretch' || parentAlign === 'normal' || !parentAlign))) {
        horizontal = 'FILL';
      } else {
        horizontal = 'HUG';
      }
    } else {
      // CSS `auto` on a flex item does NOT mean Figma's HUG. It means
      // "flex-basis and flex-grow decide my width" — and the browser already
      // did that arithmetic for us. HUG would throw the result away and
      // re-derive the width from the children instead (stripe.com's bento
      // cards: measured 816/400/1232px, all HUG, all collapsed into one row).
      horizontal = flexAutoHasDefiniteWidth(s, ownWidth) ? 'FIXED' : 'HUG';
    }
  } else if (width === '100%') {
    horizontal = isParentVertical || !cannotShrink ? 'FILL' : 'FIXED';
  } else if (!isParentVertical && flexGrow > 0) {
    horizontal = 'FILL';
  }

  // Height — prefer FIXED (browser-measured) over HUG (Figma-recalculated)
  // HUG causes height mismatches because Figma's font rendering differs from browser
  if (height === 'auto') {
    if (isParentGrid) {
      vertical = 'FILL'; // Grid items stretch to cell height
    } else {
      vertical = 'FIXED'; // Use browser-measured height, not Figma HUG
    }
  } else if (height === '100%') {
    vertical = !isParentVertical || !cannotShrink ? 'FILL' : 'FIXED';
  } else if (isParentVertical && flexGrow > 0) {
    vertical = 'FILL';
  }

  // Cross-axis FILL detection for resolved percentage widths (e.g., width: 100% → "1440px").
  // When a child's pixel dimension matches the parent's content dimension on the cross-axis,
  // upgrade FIXED to FILL — the element was likely width: 100% or height: 100%.
  if (parentDims && parentIsFlexOrGrid && !isParentGrid) {
    // parentDims comes from node.width/height — the browser's BORDER box — so
    // the parent's own border has to come off alongside its padding. Leaving it
    // in overstates the content box by both border widths, and with the 2px
    // tolerance below any border thicker than 1px per side silently loses the
    // upgrade.
    if (isParentVertical && horizontal === 'FIXED') {
      const numW = parseFloat(width);
      if (!isNaN(numW) && numW > 0) {
        const padL = parseFloat(str(parentStyles?.paddingLeft)) || 0;
        const padR = parseFloat(str(parentStyles?.paddingRight)) || 0;
        const bdL = parseFloat(str(parentStyles?.borderLeftWidth)) || 0;
        const bdR = parseFloat(str(parentStyles?.borderRightWidth)) || 0;
        const parentContentW = parentDims.width - padL - padR - bdL - bdR;
        if (parentContentW > 0 && Math.abs(parentContentW - numW) <= 2) {
          horizontal = 'FILL';
        }
      }
    } else if (!isParentVertical && vertical === 'FIXED') {
      const numH = parseFloat(height);
      if (!isNaN(numH) && numH > 0) {
        const padT = parseFloat(str(parentStyles?.paddingTop)) || 0;
        const padB = parseFloat(str(parentStyles?.paddingBottom)) || 0;
        const bdT = parseFloat(str(parentStyles?.borderTopWidth)) || 0;
        const bdB = parseFloat(str(parentStyles?.borderBottomWidth)) || 0;
        const parentContentH = parentDims.height - padT - padB - bdT - bdB;
        if (parentContentH > 0 && Math.abs(parentContentH - numH) <= 2) {
          vertical = 'FILL';
        }
      }
    }
  }

  // Nothing in flow to hug. A frame whose children are all absolutely
  // positioned has no content box to shrink onto, so HUG collapses it to
  // whatever Figma decides — never the browser's measurement (stripe.com's
  // bento cards hold four absolute layers each). Keep the measured width.
  if (horizontal === 'HUG' && hasNoInFlowChildren) {
    horizontal = 'FIXED';
  }

  return {
    horizontal,
    vertical,
    grow: flexGrow > 0 ? 1 : 0,
    align: alignSelf === 'stretch' ? 'STRETCH' : 'INHERIT',
  };
}

// ---------------------------------------------------------------------------
// Fill parsing (background-color + background-image → FigmaFill[])
// ---------------------------------------------------------------------------

function parseFills(
  s: Record<string, string | number | undefined>,
  width: number,
  height: number,
): FigmaFill[] {
  const fills: FigmaFill[] = [];

  // Background image (gradients, url()) — may contain multiple comma-separated
  // layers. CSS paints the first layer on top, which matches Figma's fills[0]
  // = top convention, so preserve order.
  const bgImage = str(s.backgroundImage);
  if (bgImage && bgImage !== 'none') {
    const layers = splitMultipleBackgrounds(bgImage);
    // background-size / background-repeat / background-position are
    // comma-separated per layer, in the same order as background-image.
    const sizes = str(s.backgroundSize).split(',').map(v => v.trim());
    const repeats = str(s.backgroundRepeat).split(',').map(v => v.trim());
    const positions = str(s.backgroundPosition).split(',').map(v => v.trim());
    // background-blend-mode is per-layer too. Figma has a blendMode on each
    // Paint, which is the exact 1:1 slot — multi-layer backgrounds that
    // relied on blending used to render as plain stacked paints.
    const blendModes = str(s.backgroundBlendMode).split(',').map(v => v.trim());
    const layerBlend = (li: number): string | undefined => {
      const mode = blendModes[li] || blendModes[0];
      return mode && mode !== 'normal' ? mode : undefined;
    };
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const gradientFill = parseGradientToFill(layer, width, height);
      if (gradientFill) {
        const blend = layerBlend(li);
        fills.push(blend ? { ...gradientFill, blendMode: blend } : gradientFill);
      } else if (layer.includes('url(')) {
        // background-position (captured only when non-default) → fractional
        // crop focus. fills.ts turns FILL + position into CROP+imageTransform.
        const rawPosition = positions[li] || positions[0] || '';
        const position = rawPosition ? parseCssPosition(rawPosition) : null;
        const layerSize = sizes[li] || sizes[0] || '';
        const layerScaleMode = backgroundScaleMode(
          layerSize,
          repeats[li] || repeats[0] || '',
          width,
          height,
        );
        // Forward the authored px pattern size so fills.ts can scale the
        // tile (TILE otherwise renders the image at natural size).
        const tilePx = layerScaleMode === 'TILE'
          ? layerSize.match(/^([\d.]+)px(?:\s+([\d.]+)px)?$/)
          : null;
        fills.push({
          type: 'IMAGE_PLACEHOLDER',
          visible: true,
          opacity: 1,
          isImagePlaceholder: true,
          imageUrl: extractCssUrl(layer) || undefined,
          scaleMode: layerScaleMode,
          ...(tilePx
            ? {
                tileSize: {
                  width: parseFloat(tilePx[1]),
                  ...(tilePx[2] ? { height: parseFloat(tilePx[2]) } : {}),
                },
              }
            : {}),
          ...(position ? { position } : {}),
          ...(layerBlend(li) ? { blendMode: layerBlend(li) } : {}),
          elementWidth: width,
          elementHeight: height,
        });
      }
    }
  }

  // Background color
  const bgColor = str(s.backgroundColor);
  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
    const color = parseCSSColor(bgColor);
    if (color) {
      fills.push({
        type: 'SOLID',
        visible: true,
        opacity: color.a,
        color: { ...color, a: 1 }, // Separate alpha into opacity (matches style-parsers.ts pattern)
      });
    }
  }

  return fills;
}

/**
 * Extract the grayscale amount (0…1) from a CSS `filter` value.
 * `grayscale(1)` / `grayscale(100%)` → 1; `grayscale(0.4)` / `grayscale(40%)`
 * → 0.4. Returns undefined when the filter has no grayscale() function.
 * Amounts are clamped to [0, 1] (CSS clamps values over 100% the same way).
 */
function parseGrayscaleAmount(filter: string): number | undefined {
  if (!filter || filter === 'none') return undefined;
  const m = filter.match(/grayscale\(\s*([\d.]+)(%?)\s*\)/);
  if (!m) return undefined;
  const raw = parseFloat(m[1]);
  if (isNaN(raw)) return undefined;
  const amount = m[2] === '%' ? raw / 100 : raw;
  return Math.max(0, Math.min(1, amount));
}

/**
 * Derive the Figma scaleMode for a background image layer from CSS
 * background-size + background-repeat.
 *
 * The extractor filters default values, so an ABSENT background-repeat means
 * the CSS default `repeat`. Tiling is only assumed when the author gave the
 * layer an explicit pixel size smaller than the element (a pattern) or an
 * explicit repeat keyword — a bare `url(...)` keeps the FILL default because
 * most such images cover the whole box.
 */
function backgroundScaleMode(
  size: string,
  repeat: string,
  width: number,
  height: number,
): 'FILL' | 'FIT' | 'TILE' {
  const rep = repeat.toLowerCase();
  const isNoRepeat = rep.includes('no-repeat');
  const isExplicitRepeat = /(^|\s|-)?(repeat-x|repeat-y|space|round)/.test(rep) ||
    rep === 'repeat' || rep === 'repeat repeat';

  if (size === 'contain') return isExplicitRepeat ? 'TILE' : 'FIT';
  if (size === 'cover') return 'FILL';

  // Explicit px pattern smaller than the element + repeat (default or explicit) → TILE
  const pxMatch = size.match(/^([\d.]+)px(?:\s+([\d.]+)px)?$/);
  if (pxMatch && !isNoRepeat) {
    const w = parseFloat(pxMatch[1]);
    const h = pxMatch[2] ? parseFloat(pxMatch[2]) : w;
    if (w < width * 0.9 || h < height * 0.9) return 'TILE';
  }

  if (isExplicitRepeat) return 'TILE';
  return 'FILL';
}

// ---------------------------------------------------------------------------
// Stroke parsing (border → FigmaStroke[])
// ---------------------------------------------------------------------------

type ParsedBorderSide = {
  key: 'top' | 'right' | 'bottom' | 'left';
  weight: number;
  color: FigmaColor;
  style: 'SOLID' | 'DASHED' | 'DOTTED';
};

function figmaColorsEqual(a: FigmaColor, b: FigmaColor): boolean {
  const eps = 1e-4;
  return (
    Math.abs(a.r - b.r) < eps &&
    Math.abs(a.g - b.g) < eps &&
    Math.abs(a.b - b.b) < eps &&
    Math.abs((a.a ?? 1) - (b.a ?? 1)) < eps
  );
}

/**
 * Per-side widths of borders that occupy layout space but paint nothing —
 * positive width, a renderable style (not none/hidden), and a fully
 * transparent color. These are dropped by parseStrokes (correct visually)
 * but must become padding so their CSS box-space survives in auto-layout.
 */
function invisibleBorderInsets(
  s: Record<string, string | number | undefined>,
): { top: number; right: number; bottom: number; left: number } {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const sides = [
    { key: 'top' as const,    w: s.borderTopWidth,    c: s.borderTopColor,    st: s.borderTopStyle    },
    { key: 'right' as const,  w: s.borderRightWidth,  c: s.borderRightColor,  st: s.borderRightStyle  },
    { key: 'bottom' as const, w: s.borderBottomWidth, c: s.borderBottomColor, st: s.borderBottomStyle },
    { key: 'left' as const,   w: s.borderLeftWidth,   c: s.borderLeftColor,   st: s.borderLeftStyle   },
  ];
  for (const side of sides) {
    const weight = parseFloat(str(side.w) || '0');
    if (!isFinite(weight) || weight <= 0) continue;
    const styleStr = str(side.st).toLowerCase();
    if (!styleStr || styleStr === 'none' || styleStr === 'hidden') continue;
    const color = parseCSSColor(str(side.c) || '');
    if (color && color.a === 0) {
      inset[side.key] = weight;
    }
  }
  return inset;
}

function parseOneBorderSide(
  key: 'top' | 'right' | 'bottom' | 'left',
  widthRaw: string | number | undefined,
  colorRaw: string | number | undefined,
  styleRaw: string | number | undefined,
  currentColorFallback: string,
): ParsedBorderSide | null {
  const weight = parseFloat(str(widthRaw) || '0');
  if (!isFinite(weight) || weight <= 0) return null;
  const styleStr = str(styleRaw).toLowerCase();
  if (!styleStr || styleStr === 'none' || styleStr === 'hidden') return null;
  const colorStr = str(colorRaw) || currentColorFallback || 'rgb(0,0,0)';
  const color = parseCSSColor(colorStr);
  // Zero-alpha borders are kept as zero-opacity strokes (h2d parity): the
  // stroke preserves the website's truth in the inspector while
  // invisibleBorderInsets() supplies the layout space as padding.
  if (!color) return null;
  const figmaStyle: 'SOLID' | 'DASHED' | 'DOTTED' =
    styleStr === 'dashed' ? 'DASHED'
    : styleStr === 'dotted' ? 'DOTTED'
    : 'SOLID';
  return { key, weight, color, style: figmaStyle };
}

function parseStrokes(
  s: Record<string, string | number | undefined>,
): FigmaStroke[] {
  // currentColor fallback for border-color
  const currentColor = str(s.color) || 'rgb(0,0,0)';

  const parsed: ParsedBorderSide[] = [];
  const sides = [
    { key: 'top' as const,    w: s.borderTopWidth,    c: s.borderTopColor,    st: s.borderTopStyle    },
    { key: 'right' as const,  w: s.borderRightWidth,  c: s.borderRightColor,  st: s.borderRightStyle  },
    { key: 'bottom' as const, w: s.borderBottomWidth, c: s.borderBottomColor, st: s.borderBottomStyle },
    { key: 'left' as const,   w: s.borderLeftWidth,   c: s.borderLeftColor,   st: s.borderLeftStyle   },
  ];
  for (const side of sides) {
    const ps = parseOneBorderSide(side.key, side.w, side.c, side.st, currentColor);
    if (ps) parsed.push(ps);
  }

  if (parsed.length > 0) {
    // Uniform fast path: all 4 sides identical
    if (parsed.length === 4) {
      const [first, ...rest] = parsed;
      const uniform = rest.every(
        (p) =>
          p.weight === first.weight &&
          p.style === first.style &&
          figmaColorsEqual(p.color, first.color),
      );
      if (uniform) {
        return [{
          color: first.color,
          weight: first.weight,
          position: 'INSIDE',
          style: first.style,
          sides: { top: true, right: true, bottom: true, left: true },
        }];
      }
    }
    // Non-uniform: one stroke per active side
    return parsed.map((p) => ({
      color: p.color,
      weight: p.weight,
      position: 'INSIDE' as const,
      style: p.style,
      sides: {
        top: p.key === 'top',
        right: p.key === 'right',
        bottom: p.key === 'bottom',
        left: p.key === 'left',
      },
    }));
  }

  // Fallback: shorthand border-{width,color,style}
  const weight = parseFloat(str(s.borderWidth) || '0');
  const borderStyle = str(s.borderStyle).toLowerCase();
  if (
    isFinite(weight) && weight > 0 &&
    borderStyle && borderStyle !== 'none' && borderStyle !== 'hidden'
  ) {
    const borderColor = str(s.borderColor) || currentColor;
    const color = parseCSSColor(borderColor);
    if (color && color.a !== 0) {
      const style: 'SOLID' | 'DASHED' | 'DOTTED' =
        borderStyle === 'dashed' ? 'DASHED'
        : borderStyle === 'dotted' ? 'DOTTED'
        : 'SOLID';
      return [{
        color,
        weight,
        position: 'INSIDE',
        style,
        sides: { top: true, right: true, bottom: true, left: true },
      }];
    }
  }

  // `outline` as the element's only ring (focus rings baked into the design,
  // button rings). Base state previously dropped it entirely — only the
  // hover diff read outline. Emitted only when there is NO border: the
  // stroke model keeps one representative stroke set per node, and a real
  // border outranks the outline. outline-offset has no Figma equivalent;
  // an OUTSIDE-aligned stroke at 0 offset is the closest rendering.
  const outlineWidth = parseFloat(str(s.outlineWidth) || '0');
  const outlineStyle = str(s.outlineStyle).toLowerCase();
  if (
    isFinite(outlineWidth) && outlineWidth > 0 &&
    outlineStyle && outlineStyle !== 'none'
  ) {
    const outlineColor = parseCSSColor(str(s.outlineColor) || currentColor);
    if (outlineColor && outlineColor.a !== 0) {
      return [{
        color: outlineColor,
        weight: outlineWidth,
        position: 'OUTSIDE',
        style: outlineStyle === 'dashed' ? 'DASHED'
          : outlineStyle === 'dotted' ? 'DOTTED'
          : 'SOLID',
        sides: { top: true, right: true, bottom: true, left: true },
      }];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Effect parsing (box-shadow, backdrop-filter, filter → FigmaEffect[])
// ---------------------------------------------------------------------------

function parseEffects(
  s: Record<string, string | number | undefined>,
): FigmaEffect[] {
  const effects: FigmaEffect[] = [];

  // Box shadow
  const boxShadow = str(s.boxShadow);
  if (boxShadow && boxShadow !== 'none') {
    const shadowEffects = parseBoxShadow(boxShadow);
    effects.push(...shadowEffects);
  }

  // Backdrop filter (blur)
  const backdropFilter = str(s.backdropFilter);
  if (backdropFilter && backdropFilter !== 'none') {
    const blurMatch = backdropFilter.match(/blur\(([^)]+)\)/);
    if (blurMatch) {
      effects.push({
        type: 'BACKGROUND_BLUR',
        visible: true,
        blurRadius: parseFloat(blurMatch[1]) || 0,
      });
    }
  }

  // Filter (blur, drop-shadow)
  const filter = str(s.filter);
  if (filter && filter !== 'none') {
    // filter: drop-shadow(x y blur color) → DROP_SHADOW. Same syntax as a
    // single box-shadow without spread/inset, so reuse parseBoxShadow on the
    // extracted (paren-balanced) argument string. Previously this rendered
    // only on hover variants — the base state stayed flat.
    let filterWithoutDropShadows = filter;
    for (const args of extractFunctionArgs(filter, 'drop-shadow')) {
      filterWithoutDropShadows = filterWithoutDropShadows.replace(
        `drop-shadow(${args})`,
        '',
      );
      for (const fx of parseBoxShadow(args)) {
        if (fx.type === 'DROP_SHADOW') effects.push(fx);
      }
    }

    // blur() — matched on the drop-shadow-stripped string so a blur radius
    // inside drop-shadow(...) is never misread as a layer blur.
    const blurMatch = filterWithoutDropShadows.match(/blur\(([^)]+)\)/);
    if (blurMatch) {
      effects.push({
        type: 'LAYER_BLUR',
        visible: true,
        blurRadius: parseFloat(blurMatch[1]) || 0,
      });
    }
  }

  return effects;
}

// ---------------------------------------------------------------------------
// Box shadow parsing
// ---------------------------------------------------------------------------

function parseBoxShadow(shadowStr: string): FigmaEffect[] {
  const effects: FigmaEffect[] = [];

  // Split multiple shadows by comma (but not inside parentheses)
  const shadows = splitShadows(shadowStr);

  for (const shadow of shadows) {
    const trimmed = shadow.trim();
    if (!trimmed || trimmed === 'none') continue;

    const isInset = trimmed.includes('inset');
    const cleaned = trimmed.replace('inset', '').trim();

    // Extract color and numeric values
    const colorMatch = cleaned.match(
      /rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-z]+$/i,
    );
    const color = colorMatch
      ? parseCSSColor(colorMatch[0]) || { r: 0, g: 0, b: 0, a: 0.25 }
      : { r: 0, g: 0, b: 0, a: 0.25 };

    // Remove color from string to get numbers
    const numbersStr = cleaned.replace(
      /rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-z]+$/gi,
      '',
    ).trim();
    const numbers = numbersStr.match(/-?[\d.]+/g)?.map(Number) || [];

    const offsetX = numbers[0] || 0;
    const offsetY = numbers[1] || 0;
    const blur = numbers[2] || 0;
    const spread = numbers[3] || 0;

    effects.push({
      type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
      visible: true,
      color,
      offset: { x: offsetX, y: offsetY },
      radius: blur,
      spread,
    });
  }

  return effects;
}

/**
 * Extract the argument strings of every `fnName(...)` occurrence, balancing
 * nested parentheses — `drop-shadow(0 4px 6px rgba(0,0,0,.3))` carries an
 * rgba() inside the outer parens, so a plain regex stops too early.
 */
function extractFunctionArgs(input: string, fnName: string): string[] {
  const out: string[] = [];
  const needle = fnName + '(';
  let idx = 0;
  while ((idx = input.indexOf(needle, idx)) !== -1) {
    let depth = 1;
    let i = idx + needle.length;
    while (i < input.length && depth > 0) {
      if (input[i] === '(') depth++;
      else if (input[i] === ')') depth--;
      i++;
    }
    out.push(input.slice(idx + needle.length, depth === 0 ? i - 1 : i));
    idx = i;
  }
  return out;
}

/**
 * Parse a px length like "220px". Returns undefined for 'none'/'auto'/'0px',
 * percentages and non-finite values — same policy as cssMaxWidth.
 */
function parsePxLength(raw: string | undefined): number | undefined {
  if (!raw || raw === 'none' || raw === 'auto' || raw.includes('%')) return undefined;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Resolve the nearest <a href> (the element itself or its DOM parent) to an
 * absolute http(s) URL, without `new URL()` — unreliable in the Figma
 * sandbox. Fragment-only and javascript: links carry no navigable target.
 */
function resolveLinkHref(
  node: W2WFrameNode | null,
  parent: W2WFrameNode | null,
): string | undefined {
  const holder =
    node && node.tag === 'a' && typeof node.attr?.href === 'string' && node.attr.href
      ? node
      : parent && parent.tag === 'a' && typeof parent.attr?.href === 'string' && parent.attr.href
        ? parent
        : null;
  if (!holder) return undefined;

  const href = String(holder.attr.href).trim();
  if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) {
    return undefined;
  }
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return `https:${href}`;

  const base = typeof holder.attr.baseURI === 'string' ? holder.attr.baseURI : '';
  const origin = base.match(/^https?:\/\/[^/]+/)?.[0];
  if (!origin) return undefined;
  if (href.startsWith('/')) return origin + href;
  // Path-relative: resolve against the base document's directory.
  const dir = base.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
  return (dir.startsWith(origin) ? dir : origin + '/') + href;
}

function splitShadows(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (const char of str) {
    if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;
    else if (char === ',' && parenDepth === 0) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Border radius parsing
// ---------------------------------------------------------------------------

function parseBorderRadius(
  s: Record<string, string | number | undefined>,
  width: number,
  height: number,
): number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number } {
  // Percentage radii stay percentages in getComputedStyle — parseFloat('50%')
  // read them as raw px (a 200×200 avatar got r=50 instead of a circle).
  // CSS resolves the horizontal and vertical radius against width/height
  // separately (elliptical); Figma corners are circular, so resolve against
  // the smaller dimension — exact for squares, pill-shaped otherwise.
  const resolve = (v: string | number | undefined): number => {
    const raw = str(v) || '0';
    const n = parseFloat(raw);
    if (!n || n < 0) return 0;
    if (raw.includes('%')) return (n / 100) * Math.min(width, height);
    return n;
  };

  const tl = resolve(s.borderTopLeftRadius);
  const tr = resolve(s.borderTopRightRadius);
  const br = resolve(s.borderBottomRightRadius);
  const bl = resolve(s.borderBottomLeftRadius);

  if (tl === tr && tr === br && br === bl) {
    return tl;
  }
  return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
}

// ---------------------------------------------------------------------------
// Padding / Margin parsing
// ---------------------------------------------------------------------------

function parsePadding(
  top: string, right: string, bottom: string, left: string,
  shorthand: string
): { top: number; right: number; bottom: number; left: number } {
  // Prefer individual properties (getComputedStyle always resolves them)
  if (top || right || bottom || left) {
    return {
      top: parseFloat(top) || 0,
      right: parseFloat(right) || 0,
      bottom: parseFloat(bottom) || 0,
      left: parseFloat(left) || 0,
    };
  }

  // Fallback to shorthand
  if (!shorthand) return { top: 0, right: 0, bottom: 0, left: 0 };
  const parts = shorthand.split(/\s+/).map(v => parseFloat(v) || 0);
  switch (parts.length) {
    case 1: return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    case 2: return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    case 3: return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    case 4: return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    default: return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

function parseMargin(s: Record<string, string | number | undefined>): {
  top: number; right: number; bottom: number; left: number;
} {
  return {
    top: parseFloat(str(s.marginTop)) || 0,
    right: parseFloat(str(s.marginRight)) || 0,
    bottom: parseFloat(str(s.marginBottom)) || 0,
    left: parseFloat(str(s.marginLeft)) || 0,
  };
}

function parseOverflow(
  s: Record<string, string | number | undefined>,
): 'visible' | 'hidden' | 'scroll' | 'auto' | undefined {
  const ox = str(s.overflowX) || str(s.overflow);
  const oy = str(s.overflowY) || str(s.overflow);

  // Most restrictive wins (CSS "clip" behaves like "hidden" for clipping)
  if (ox === 'hidden' || oy === 'hidden' || ox === 'clip' || oy === 'clip') return 'hidden';
  if (ox === 'scroll' || oy === 'scroll') return 'scroll';
  if (ox === 'auto' || oy === 'auto') return 'auto';
  return undefined;
}

// ---------------------------------------------------------------------------
// Color parsing (CSS → FigmaColor)
// ---------------------------------------------------------------------------

function parseCSSColor(color: string): FigmaColor | null {
  if (!color || color === 'transparent') return null;

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]) / 255,
      g: parseInt(rgbMatch[2]) / 255,
      b: parseInt(rgbMatch[3]) / 255,
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // Modern space-separated syntax: rgb(0 0 0 / 50%) — Chrome preserves it
  // in gradient strings; the comma regex above never matched it, so the
  // whole fill silently dropped.
  const rgbSpaceMatch = color.match(
    /rgba?\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)\s*(?:\/\s*([\d.]+%?)\s*)?\)/,
  );
  if (rgbSpaceMatch) {
    const channel = (v: string): number =>
      v.endsWith('%') ? (parseFloat(v) / 100) : (parseFloat(v) / 255);
    const alpha = (v: string | undefined): number => {
      if (v === undefined) return 1;
      return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
    };
    return {
      r: Math.min(1, channel(rgbSpaceMatch[1])),
      g: Math.min(1, channel(rgbSpaceMatch[2])),
      b: Math.min(1, channel(rgbSpaceMatch[3])),
      a: Math.max(0, Math.min(1, alpha(rgbSpaceMatch[4]))),
    };
  }

  // hsl(h, s%, l%) / hsla(...) — comma or space separated.
  const hslMatch = color.match(
    /hsla?\(\s*([\d.]+)(?:deg)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/,
  );
  if (hslMatch) {
    const hue = ((parseFloat(hslMatch[1]) % 360) + 360) % 360;
    const sat = Math.max(0, Math.min(1, parseFloat(hslMatch[2]) / 100));
    const light = Math.max(0, Math.min(1, parseFloat(hslMatch[3]) / 100));
    const rawAlpha = hslMatch[4];
    const alphaValue = rawAlpha === undefined
      ? 1
      : rawAlpha.endsWith('%') ? parseFloat(rawAlpha) / 100 : parseFloat(rawAlpha);
    const chroma = (1 - Math.abs(2 * light - 1)) * sat;
    const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const base = light - chroma / 2;
    let rp = 0, gp = 0, bp = 0;
    if (hue < 60) { rp = chroma; gp = second; }
    else if (hue < 120) { rp = second; gp = chroma; }
    else if (hue < 180) { gp = chroma; bp = second; }
    else if (hue < 240) { gp = second; bp = chroma; }
    else if (hue < 300) { rp = second; bp = chroma; }
    else { rp = chroma; bp = second; }
    return {
      r: rp + base,
      g: gp + base,
      b: bp + base,
      a: Math.max(0, Math.min(1, alphaValue)),
    };
  }

  // Hex
  const hexMatch = color.match(/^#([0-9a-fA-F]+)$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  return null;
}

/**
 * `background-clip: text` (a.k.a. `-webkit-background-clip: text`) — the classic
 * gradient-text recipe, always paired with a transparent `color` /
 * `-webkit-text-fill-color`. getComputedStyle unifies the prefixed and
 * unprefixed properties, so reading `backgroundClip` alone is sufficient.
 */
function isBackgroundClipText(
  s: Record<string, string | number | undefined>,
): boolean {
  return str(s.backgroundClip).trim() === 'text';
}

/**
 * Resolve the element's text color.
 *
 * Normally `-webkit-text-fill-color` wins over `color`. But gradient text sets
 * BOTH to transparent and relies on a `background-clip: text` background for the
 * visible pixels — so a naive read yields invisible text. When the clipped
 * background is present, fall back to its first color (the gradient's first stop
 * or a solid layer). website mode then overrides this with the real gradient
 * paint; `lines`/`plugin` modes keep a visible representative color.
 */
function resolveTextColor(
  s: Record<string, string | number | undefined>,
  textFills: FigmaFill[] | undefined,
): string {
  const cssColor = str(s.webkitTextFillColor) || str(s.color) || 'rgb(0, 0, 0)';

  if (!textFills || textFills.length === 0) return cssColor;
  const parsed = parseCSSColor(cssColor);
  // Only substitute when the authored color really is invisible.
  if (parsed && parsed.a > 0) return cssColor;

  for (const fill of textFills) {
    const fallback = fill.stops?.[0]?.color ?? fill.color;
    if (fallback && fallback.a > 0) return figmaColorToCSS(fallback);
  }
  return cssColor;
}

function figmaColorToCSS(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Gradient parsing
// ---------------------------------------------------------------------------

/**
 * Split multiple comma-separated CSS background layers, respecting parens
 * (so rgba()/gradients/etc aren't broken in the middle) and quoted strings
 * (so url("a,b.jpg") stays intact).
 */
/**
 * Elements that declare media candidates or settings and paint nothing:
 * `<source>` in a `<picture>`/`<video>`/`<audio>`, `<track>` captions,
 * legacy `<param>`. The extractor keeps them because they are DOM elements
 * with a box; the wireframe must not.
 */
const NON_RENDERING_TAGS = new Set(['source', 'track', 'param']);

/**
 * Pull the URL out of a single `background-image` layer, or null when the
 * layer isn't a `url()` at all.
 *
 * Quote-aware on purpose: an inline SVG data URI carries its own quotes and
 * may carry parentheses, so a character-class regex truncates it or fails to
 * match entirely (iwm.org.uk's hero wordmark is a 5.3 KB
 * `data:image/svg+xml` layer full of `width='277'`-style attributes).
 * Exported for tests.
 */
export function extractCssUrl(layer: string): string | null {
  const start = layer.indexOf('url(');
  if (start === -1) return null;
  let i = start + 4;
  while (i < layer.length && /\s/.test(layer[i])) i++;

  const quote = layer[i] === '"' || layer[i] === "'" ? layer[i] : null;
  if (quote) {
    const end = layer.indexOf(quote, i + 1);
    if (end === -1) return null;
    return layer.slice(i + 1, end);
  }

  // Unquoted: CSS forbids unescaped parens here, so the first `)` closes it.
  const end = layer.indexOf(')', i);
  if (end === -1) return null;
  const url = layer.slice(i, end).trim();
  return url.length > 0 ? url : null;
}

function splitMultipleBackgrounds(background: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (const char of background) {
    if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;

    const inQuotes = inSingleQuote || inDoubleQuote;

    if (!inQuotes) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        layers.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }

  if (current.trim()) layers.push(current.trim());
  return layers;
}

function parseGradientToFill(
  bgImage: string,
  width: number,
  height: number,
): FigmaFill | null {
  // repeating-* variants have no Figma equivalent — approximate with a single
  // cycle of the same gradient (stop positions are normalized/clamped below).
  // Linear gradient
  const linearMatch = bgImage.match(/(?:repeating-)?linear-gradient\((.+)\)/);
  if (linearMatch) {
    return parseLinearGradient(linearMatch[1], width, height);
  }

  // Conic gradient → GRADIENT_CONIC (rendered as Figma GRADIENT_ANGULAR)
  const conicMatch = bgImage.match(/(?:repeating-)?conic-gradient\((.+)\)/);
  if (conicMatch) {
    return parseConicGradient(conicMatch[1], width, height);
  }

  // Radial gradient
  const radialMatch = bgImage.match(/(?:repeating-)?radial-gradient\((.+)\)/);
  if (radialMatch) {
    return parseRadialGradient(radialMatch[1], width, height);
  }

  return null;
}

/**
 * Parse a CSS gradient angle token to degrees. Supports negative/decimal
 * values and deg/turn/rad/grad units. Returns null when the content does not
 * start with an angle.
 */
function parseGradientAngle(content: string): number | null {
  const m = content.match(/^(-?[\d.]+)(deg|turn|rad|grad)\b/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!isFinite(v)) return null;
  let deg: number;
  switch (m[2]) {
    case 'turn': deg = v * 360; break;
    case 'rad': deg = v * (180 / Math.PI); break;
    case 'grad': deg = v * 0.9; break;
    default: deg = v;
  }
  // Normalize to [0, 360)
  return ((deg % 360) + 360) % 360;
}

function parseLinearGradient(
  content: string,
  width?: number,
  height?: number,
): FigmaFill | null {
  // Parse angle
  let angle = 180; // default: top to bottom
  const parsedAngle = parseGradientAngle(content);
  if (parsedAngle !== null) {
    angle = parsedAngle;
  } else if (content.startsWith('to ')) {
    const dirMatch = content.match(/^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?/);
    if (dirMatch) {
      const words = [dirMatch[1], dirMatch[2]].filter(Boolean).sort().join(' ');
      const dirAngles: Record<string, number> = {
        top: 0, right: 90, bottom: 180, left: 270,
      };
      if (!dirMatch[2]) {
        angle = dirAngles[dirMatch[1]] ?? 180;
      } else {
        // Diagonal corner keyword — the exact angle depends on the box's
        // aspect ratio: `to top right` points along atan(width/height) from
        // north. Fall back to 45° multiples when dimensions are unknown.
        const w = width && width > 0 ? width : 1;
        const h = height && height > 0 ? height : 1;
        const corner = (Math.atan2(w, h) * 180) / Math.PI;
        const cornerAngles: Record<string, number> = {
          'right top': corner,
          'bottom right': 180 - corner,
          'bottom left': 180 + corner,
          'left top': 360 - corner,
        };
        angle = cornerAngles[words] ?? 180;
      }
    }
  }

  const stops = parseColorStops(content);
  if (stops.length < 2) return null;

  return {
    type: 'GRADIENT_LINEAR',
    visible: true,
    opacity: 1,
    angle,
    stops,
    elementWidth: width,
    elementHeight: height,
  };
}

/**
 * Parse `conic-gradient([from <angle>] [at <pos>], stops)` into a
 * GRADIENT_CONIC fill. fills.ts renders it as Figma GRADIENT_ANGULAR.
 */
function parseConicGradient(
  content: string,
  width?: number,
  height?: number,
): FigmaFill | null {
  let angle = 0;
  const fromMatch = content.match(/^from\s+(-?[\d.]+(?:deg|turn|rad|grad))/);
  if (fromMatch) {
    angle = parseGradientAngle(fromMatch[1]) ?? 0;
  }

  let center = { x: 0.5, y: 0.5 };
  const atMatch = content.match(/at\s+([\d.]+%?)\s+([\d.]+%?)/i);
  if (atMatch) {
    center = {
      x: parsePercentOrUnit(atMatch[1]),
      y: parsePercentOrUnit(atMatch[2]),
    };
  }

  const stops = parseColorStops(content);
  if (stops.length < 2) return null;

  return {
    type: 'GRADIENT_CONIC',
    visible: true,
    opacity: 1,
    angle,
    center,
    stops,
    elementWidth: width,
    elementHeight: height,
  };
}

function parseRadialGradient(
  content: string,
  width?: number,
  height?: number,
): FigmaFill | null {
  // Parse shape (CSS spec default: ellipse)
  let shape: 'circle' | 'ellipse' = 'ellipse';
  const shapeMatch = content.match(/^(circle|ellipse)\b/i);
  if (shapeMatch) shape = shapeMatch[1].toLowerCase() as 'circle' | 'ellipse';

  // Parse size keyword (CSS spec default: farthest-corner)
  let size: 'closest-side' | 'farthest-side' | 'closest-corner' | 'farthest-corner' =
    'farthest-corner';
  const sizeMatch = content.match(
    /\b(closest-side|farthest-side|closest-corner|farthest-corner)\b/i,
  );
  if (sizeMatch) size = sizeMatch[1].toLowerCase() as typeof size;

  // Parse center "at X Y"; default (0.5, 0.5)
  let center = { x: 0.5, y: 0.5 };
  const atMatch = content.match(/at\s+([\d.]+%?)\s+([\d.]+%?)/i);
  if (atMatch) {
    center = {
      x: parsePercentOrUnit(atMatch[1]),
      y: parsePercentOrUnit(atMatch[2]),
    };
  }

  const stops = parseColorStops(content);
  if (stops.length < 2) return null;

  return {
    type: 'GRADIENT_RADIAL',
    visible: true,
    opacity: 1,
    center,
    shape,
    size,
    stops,
    elementWidth: width,
    elementHeight: height,
  };
}

// Parse "20%" → 0.2; "50" (bare number) → 0.5 (treat as percent for radial "at").
function parsePercentOrUnit(s: string): number {
  const n = parseFloat(s);
  return isFinite(n) ? n / 100 : 0.5;
}

function parseColorStops(content: string): FigmaGradientStop[] {
  const stops: FigmaGradientStop[] = [];

  // Remove direction part (angle, "to xxx", "circle at xxx", etc.)
  let stopsStr = content;
  // Remove angle (negative/decimal, any CSS angle unit)
  stopsStr = stopsStr.replace(/^-?[\d.]+(?:deg|turn|rad|grad)\s*,\s*/, '');
  // Remove conic "from <angle> [at <pos>]" prefix
  stopsStr = stopsStr.replace(/^from\s+[^,]+,\s*/i, '');
  // Remove "to direction"
  stopsStr = stopsStr.replace(/^to\s+\w+(\s+\w+)?\s*,\s*/, '');
  // Remove radial shape/position
  stopsStr = stopsStr.replace(/^(circle|ellipse)\s*(at\s+[^,]+)?\s*,\s*/i, '');
  stopsStr = stopsStr.replace(/^(closest|farthest)-(side|corner)\s*(at\s+[^,]+)?\s*,\s*/i, '');
  // Remove standalone conic/radial "at <pos>" prefix
  stopsStr = stopsStr.replace(/^at\s+[^,]+,\s*/i, '');

  // Split by comma outside parentheses
  const parts = splitShadows(stopsStr);

  // First pass: parse color + explicit position (if any) for each non-empty part.
  // Track "transparent" stops so we can inherit adjacent RGB in the second pass
  // — Figma interpolates RGB linearly between stops, and going from a color to
  // black-at-alpha-0 leaves a dark/muddy halo. Matching the adjacent color's
  // RGB (with alpha 0) gives a clean fade. Same technique as h2d.
  type RawStop = { color: FigmaColor; explicit: number | null; isTransparent: boolean; pxPos?: number };
  const raw: RawStop[] = [];
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const posMatch = part.match(/(-?[\d.]+)(%|px|deg|turn)?\s*$/);
    let explicit: number | null = null;
    let pxPos: number | undefined;
    let colorStr = part;
    if (posMatch) {
      const num = parseFloat(posMatch[1]);
      const unit = posMatch[2];
      if (unit === '%') explicit = num / 100;
      else if (unit === 'px') pxPos = num; // normalized after the loop
      else if (unit === 'deg') explicit = num / 360;   // conic stops
      else if (unit === 'turn') explicit = num;         // conic stops
      else explicit = num;
      colorStr = part.slice(0, part.length - posMatch[0].length).trim();
    }
    // "transparent" keyword is a valid gradient stop (= rgba(0,0,0,0)).
    // Browser getComputedStyle normalizes `transparent` to the literal
    // string "rgba(0, 0, 0, 0)" before it reaches the plugin, so we need
    // to detect BOTH forms (with and without spaces, any case).
    // parseCSSColor() returns null for the keyword by design (to filter
    // out transparent backgrounds upstream), so we handle it explicitly.
    const normalized = colorStr.toLowerCase().replace(/\s+/g, '');
    const isTransparent =
      normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
    const color = isTransparent
      ? { r: 0, g: 0, b: 0, a: 0 }
      : parseCSSColor(colorStr);
    if (color) raw.push({ color, explicit, isTransparent, pxPos });
  }

  // Normalize px stop positions to one gradient cycle (0..1 across the
  // largest px value). Used by repeating-* gradients whose stops are in px.
  const maxPx = raw.reduce((m, s) => (s.pxPos !== undefined ? Math.max(m, s.pxPos) : m), 0);
  if (maxPx > 0) {
    for (const s of raw) {
      if (s.pxPos !== undefined) s.explicit = s.pxPos / maxPx;
    }
  }

  // Second pass: for each transparent stop, inherit RGB from the nearest
  // non-transparent stop (previous first, then next). Keep alpha at 0.
  for (let i = 0; i < raw.length; i++) {
    if (!raw[i].isTransparent) continue;
    let ref: FigmaColor | null = null;
    if (i > 0 && !raw[i - 1].isTransparent) ref = raw[i - 1].color;
    else if (i < raw.length - 1 && !raw[i + 1].isTransparent) ref = raw[i + 1].color;
    if (ref) raw[i].color = { r: ref.r, g: ref.g, b: ref.b, a: 0 };
  }

  // Third pass: fill auto-positions across valid stops only.
  // Clamp to [0, 1] — Figma rejects positions outside that range.
  const denom = Math.max(raw.length - 1, 1);
  for (let i = 0; i < raw.length; i++) {
    const { color, explicit } = raw[i];
    const position = explicit !== null ? explicit : i / denom;
    stops.push({ color, position: Math.min(1, Math.max(0, position)) });
  }

  return stops;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function str(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'symbol') return '';
  return String(v);
}

/**
 * Parse a computed CSS grid line value (grid-column-start, etc.) to a plain
 * integer. Only bare integers ("2", "-1") are accepted — "auto", "span 2",
 * "1 / 3" and named lines return undefined (we can't reliably honor those as
 * a single anchor index).
 */
function parseGridLine(v: string | number | undefined | null): number | undefined {
  const sv = str(v).trim();
  if (sv === '' || sv === 'auto') return undefined;
  const n = parseInt(sv, 10);
  return Number.isFinite(n) && String(n) === sv ? n : undefined;
}

/**
 * CSS `aspect-ratio` → Figma `constrainProportions`, or undefined when the
 * element declares no ratio to hold.
 *
 * Only a plain positive ratio counts: `auto` is the default, and the
 * `auto <ratio>` fallback form applies the ratio solely to replaced content
 * with no intrinsic size — too conditional to freeze into a node property.
 */
function parseAspectRatio(v: string | number | undefined | null): boolean | undefined {
  const sv = str(v).trim().toLowerCase();
  if (!sv || sv === 'auto' || sv.startsWith('auto')) return undefined;
  const [w, h = '1'] = sv.split('/').map((p) => p.trim());
  const nw = parseFloat(w);
  const nh = parseFloat(h);
  if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw <= 0 || nh <= 0) {
    return undefined;
  }
  return true;
}

/**
 * Split the `grid-area` shorthand into its four lines. The individual
 * `grid-{row,column}-{start,end}` longhands are not captured, so this is the
 * only explicit placement data we ever receive — without it every grid child
 * falls through to the geometric inference below, which only works on
 * fixed-px templates and gives up on `fr` / `minmax` / `%` grids.
 *
 * Computed order is `row-start / column-start / row-end / column-end`. Each
 * slot goes through parseGridLine, so "auto", spans and named areas stay
 * undefined and keep deferring to inference exactly as before.
 */
function parseGridArea(v: string | number | undefined | null): {
  rowStart?: number;
  columnStart?: number;
  rowEnd?: number;
  columnEnd?: number;
} | undefined {
  const sv = str(v).trim();
  if (!sv || sv === 'auto') return undefined;
  const parts = sv.split('/').map((p) => p.trim());
  if (parts.length < 2) return undefined;
  return {
    rowStart: parseGridLine(parts[0]),
    columnStart: parseGridLine(parts[1]),
    rowEnd: parseGridLine(parts[2]),
    columnEnd: parseGridLine(parts[3]),
  };
}

/**
 * Recover a grid child's 1-based column from geometry when the explicit
 * `grid-column-start` was lost in capture. Matches the child's left offset
 * inside the grid against the column-track boundaries derived from the parent's
 * `grid-template-columns` + `column-gap`. paco.me: article at offset 216 in
 * `192px 640px 192px` (gap 24) → column 2. Returns undefined when the parent
 * isn't a grid, the template has no fixed px tracks, or nothing lines up.
 */
function inferGridColumnStart(
  node: W2WFrameNode,
  parent: W2WFrameNode | null,
): number | undefined {
  if (!parent) return undefined;
  const pd = str(parent.styles.display);
  if (pd !== 'grid' && pd !== 'inline-grid') return undefined;
  const tokens = str(parent.styles.gridTemplateColumns).split(/\s+/).filter(Boolean);
  // Only fixed-pixel templates have stable track offsets to match against; fr/%/
  // auto/minmax tracks depend on container sizing and can't be matched to a
  // captured x-offset.
  if (tokens.length < 2 || !tokens.every((t) => /^[\d.]+px$/.test(t))) {
    return undefined;
  }
  const tracks = tokens.map((t) => parseFloat(t));
  const gap =
    parseFloat(str(parent.styles.columnGap) || str(parent.styles.gridColumnGap)) || 0;
  const padL = parseFloat(str(parent.styles.paddingLeft)) || 0;
  const offset = node.x - parent.x - padL;
  let cursor = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (Math.abs(offset - cursor) < 3) return i + 1;
    cursor += tracks[i] + gap;
  }
  return undefined;
}

// When a capture loses `grid-row-start`, recover it from the
// child's measured y-offset inside a fixed-pixel grid. This keeps the fix
// general for auto-placed CSS grids instead of hardcoding a site-specific case.
function inferGridRowStart(
  node: W2WFrameNode,
  parent: W2WFrameNode | null,
): number | undefined {
  if (!parent) return undefined;
  const pd = str(parent.styles.display);
  if (pd !== 'grid' && pd !== 'inline-grid') return undefined;
  const tokens = str(parent.styles.gridTemplateRows).split(/\s+/).filter(Boolean);
  // Mirror the column inference guard — only fixed px tracks
  // produce stable row boundaries that can be matched back to geometry.
  if (tokens.length < 2 || !tokens.every((t) => /^[\d.]+px$/.test(t))) {
    return undefined;
  }
  const tracks = tokens.map((t) => parseFloat(t));
  const gap =
    parseFloat(str(parent.styles.rowGap) || str(parent.styles.gridRowGap)) || 0;
  const padT = parseFloat(str(parent.styles.paddingTop)) || 0;
  const offset = node.y - parent.y - padT;
  let cursor = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (Math.abs(offset - cursor) < 3) return i + 1;
    cursor += tracks[i] + gap;
  }
  return undefined;
}

function cleanFontFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0].trim();
  return first.replace(/^["']|["']$/g, '');
}

/**
 * Parse a raw CSS `font-family` value into the ordered fallback chain.
 * Keeps generic families (sans-serif, …) — they terminate the chain the same
 * way they do in CSS — but drops var()/keyword junk that can never load.
 */
function parseFontFamilyStack(fontFamily: string): string[] {
  if (!fontFamily) return [];
  return fontFamily
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter((f) => f.length > 0 && !f.startsWith('var(') && !CSS_FONT_KEYWORDS.has(f.toLowerCase()));
}

// isPuaOnlyText moved to ../utils/fontUtils so text.ts can share it.

/**
 * Decide whether a FRAME child should be skipped as invisible, applying the
 * same policy to direct children and to grandchildren promoted by zero-size
 * wrapper flattening.
 *
 * visibility:hidden / opacity:0 elements take layout space in CSS but must
 * not render in wireframes (apple.com flyout menus, globalnav-curtain).
 * In `variants` interaction mode they are KEPT but marked _isHiddenInDefault
 * so nodes.ts renders them with visible=false for hover-variant use.
 * Tiny (<2px) trigger buttons are always skipped.
 */
/**
 * Find the first descendant <img> carrying a $url within a poster candidate
 * (<img> itself, or <picture>/<source> wrappers). Depth-capped — posters sit
 * at most a wrapper or two below the sibling.
 */
function findPosterImg(node: W2WFrameNode, depth: number): W2WFrameNode | null {
  if (node.tag === 'img' && node.$url) return node;
  if (depth >= 3) return null;
  for (const child of node.children) {
    if (child.type !== 'FRAME') continue;
    const hit = findPosterImg(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Fraction of `video`'s area covered by `rect` (0..1). */
function coverageOfVideo(rect: W2WFrameNode, video: W2WFrameNode): number {
  const ix = Math.max(0, Math.min(rect.x + rect.width, video.x + video.width) - Math.max(rect.x, video.x));
  const iy = Math.max(0, Math.min(rect.y + rect.height, video.y + video.height) - Math.max(rect.y, video.y));
  const videoArea = video.width * video.height;
  return videoArea > 0 ? (ix * iy) / videoArea : 0;
}

/**
 * Poster transplant: a hero-sized <video> with no $url (no poster attribute —
 * apple.com's back-to-school hero) takes the $url of an overlapping
 * <picture>/<img> sibling (the start-frame Apple fades out during playback,
 * which extraction still captures). The donor is marked so the child loop
 * drops it — the same pixels must not render twice.
 */
function adoptPosterFromSiblings(children: W2WNode[]): void {
  for (const video of children) {
    if (video.type !== 'FRAME' || video.tag !== 'video' || video.$url) continue;
    if (video.width < 100 || video.height < 100) continue;
    for (const sibling of children) {
      if (sibling === video || sibling.type !== 'FRAME' || sibling._posterDonor) continue;
      if (sibling.tag !== 'picture' && sibling.tag !== 'img') continue;
      const poster = findPosterImg(sibling, 0);
      if (!poster || coverageOfVideo(poster, video) < 0.5) continue;
      video.$url = poster.$url;
      sibling._posterDonor = true;
      break;
    }
  }
}

/**
 * Does this subtree contain a `position: fixed` element?
 *
 * Fixed elements are laid out against the viewport, so an ancestor's
 * `overflow: hidden` does NOT clip them — the only escape hatch from the
 * screen-reader-only rule below.
 */
function hasFixedDescendant(node: W2WFrameNode): boolean {
  for (const child of node.children ?? []) {
    if (child.type !== 'FRAME') continue;
    if (str(child.styles.position) === 'fixed') return true;
    if (hasFixedDescendant(child)) return true;
  }
  return false;
}

/**
 * The screen-reader-only clip pattern: `position: absolute; width: 1px;
 * height: 1px; overflow: hidden` (Drupal `.visually-hidden`, Bootstrap
 * `.sr-only`, "Skip to main content" links). The browser paints nothing —
 * the content is clipped away by the 1px box — but Figma kept the frame at
 * 1px wide and the inline-overhang correction then snapped its height to the
 * text ink, turning iwm.org.uk's "Secondary navigation" into a 1×122 column
 * of one-letter lines.
 *
 * `clip`/`clip-path` can't be used as the signal: the extractor doesn't
 * capture them. The three conditions below stand in for it:
 *   - `overflow: hidden` — without it a 0/1px wrapper legitimately shows
 *     absolutely-positioned children (tooltips, badges).
 *   - a non-static position — makes the box the containing block for those
 *     children, so the clip really is total.
 *   - no `position: fixed` descendant — see {@link hasFixedDescendant}.
 */
function isScreenReaderOnlyBox(child: W2WFrameNode): boolean {
  if (child.width > 1 || child.height > 1) return false;
  const position = str(child.styles.position);
  if (position === '' || position === 'static') return false;
  if (parseOverflow(child.styles) !== 'hidden') return false;
  return !hasFixedDescendant(child);
}

function shouldSkipInvisibleFrame(child: W2WFrameNode, options: ConvertOptions): boolean {
  if (child._posterDonor) return true;
  // Media metadata, never painted. They still occupy an inline box, so the
  // extractor reports them at ~1 × line-height and each one used to land in
  // Figma as a sliver frame — four per <picture> on any responsive image.
  if (NON_RENDERING_TAGS.has(child.tag)) return true;
  if (isScreenReaderOnlyBox(child)) return true;
  const vis = str(child.styles.visibility);
  const childOpacity = child.styles.opacity;
  const isInvisible = vis === 'hidden' || vis === 'collapse';
  const isFullyTransparent = childOpacity === 0 || childOpacity === '0';
  if (isInvisible || isFullyTransparent) {
    if (options.interactionMode === 'variants') {
      child._isHiddenInDefault = true;
    } else if (child.tag === 'video' && child.width >= 100 && child.height >= 100) {
      // A large video that fades itself out (apple.com hero animates the
      // video's opacity between the start-frame and the animation) still
      // marks WHERE media lives — keep it so the converter renders a media
      // placeholder instead of a blank hero. Tiny hidden videos remain
      // preload/utility artifacts and are dropped as before.
    } else {
      return true;
    }
  }

  // Tiny trigger buttons (e.g. Apple nav dropdown triggers: 1px-height buttons)
  // are interactive artifacts with no visual representation in wireframes.
  if (child.height < 2 && child.width > 0) {
    const tag = child.tag;
    const role = child.attr?.role;
    if (tag === 'button' || role === 'button' || role === 'menuitem') {
      return true;
    }
  }

  return false;
}

/**
 * Extract a static rotation angle (degrees, clockwise) from a computed CSS
 * transform matrix. Returns undefined for identity/translate-only transforms,
 * tiny angles (mid-transition noise, < 0.5°), skewed matrices and 3D
 * transforms — none of which have a faithful Figma rotation equivalent.
 */
function parseCssRotation(transform: string): number | undefined {
  if (!transform || transform === 'none') return undefined;
  const m = transform.match(/^matrix\(\s*(-?[\d.e]+)\s*,\s*(-?[\d.e]+)\s*,\s*(-?[\d.e]+)\s*,\s*(-?[\d.e]+)\s*,/);
  if (!m) return undefined; // matrix3d / unparsed → skip
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  const c = parseFloat(m[3]);
  const d = parseFloat(m[4]);
  if (![a, b, c, d].every(Number.isFinite)) return undefined;
  // Skew check: for rotation(+uniform/non-uniform scale) the column vectors
  // stay orthogonal → a·c + b·d ≈ 0 relative to their magnitudes.
  const dot = a * c + b * d;
  const mag = Math.hypot(a, b) * Math.hypot(c, d);
  if (mag === 0 || Math.abs(dot) / mag > 0.01) return undefined;
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  if (Math.abs(deg) < 0.5) return undefined;
  return deg;
}

/**
 * Apply CSS `text-transform` to a captured text value. The content script
 * stores the raw source-case textContent while the browser renders the
 * transformed case, so the converter re-applies it here. `capitalize`
 * uppercases the first letter of each word without lowercasing the rest
 * (matching CSS semantics).
 */
function applyTextTransform(value: string, textTransform: string | undefined): string {
  switch (textTransform) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    case 'capitalize':
      return value.replace(/(^|\s)(\S)/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
    default:
      return value;
  }
}

/**
 * Family name of the font a text run was MEASURED with, or `''` when the
 * measurement is not a usable family (see {@link isUsableMeasuredFamily} —
 * Chromium reports a placeholder while a `font-display: swap` webfont loads).
 * Returning `''` lets every call site fall through to the CSS-declared stack.
 */
function measuredFamily(raw: string | undefined | null): string {
  const { family } = parseFontString(raw);
  return isUsableMeasuredFamily(family) ? family : '';
}

function parseFontString(font: string | undefined | null): { family: string; weight: number } {
  if (!font || typeof font !== 'string') return { family: '', weight: 400 };
  // "Space Grotesk Light" → family="Space Grotesk", weight=300
  // "Arial Bold" → family="Arial", weight=700
  const weightMap: Record<string, number> = {
    thin: 100, hairline: 100,
    extralight: 200, ultralight: 200,
    light: 300,
    regular: 400, normal: 400,
    medium: 500,
    semibold: 600, demibold: 600,
    bold: 700,
    extrabold: 800, ultrabold: 800,
    black: 900, heavy: 900,
  };

  const parts = font.split(' ');
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].toLowerCase();
    if (weightMap[lastPart]) {
      return {
        family: parts.slice(0, -1).join(' '),
        weight: weightMap[lastPart],
      };
    }
  }

  return { family: font, weight: 400 };
}

function parseFontWeight(weight: string): number {
  if (!weight) return 400;
  const num = parseInt(weight);
  if (!isNaN(num)) return num;

  const map: Record<string, number> = {
    normal: 400, bold: 700, lighter: 300, bolder: 700,
  };
  return map[weight] || 400;
}

/** Name for standalone TEXT nodes — use parent's icon class if available */
function getTextNodeName(value: string, parentNode: W2WFrameNode | null): string {
  if (parentNode) {
    const iconClass = parentNode.classList.find(c =>
      c.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-brands', 'fa-duotone', 'fa-sharp'].includes(c)
    );
    if (iconClass) return iconClass;
  }
  // Hard breaks now live inside textContent — a raw \n in a layer name
  // renders as a broken multi-line label in the layers panel.
  return value.replace(/\s+/g, ' ').slice(0, 30);
}

function getNodeName(node: W2WFrameNode): string {
  const tag = node.tag;
  if (node.attr.id) return `${tag}#${node.attr.id}`;
  if (node.classList.length > 0) {
    // For icon fonts (FA, etc.), prefer the specific icon class (fa-layer-group)
    // over the generic weight class (fa-solid, fa-regular, fa-brands)
    const iconClass = node.classList.find(c =>
      c.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-brands', 'fa-duotone', 'fa-sharp'].includes(c)
    );
    if (iconClass) return iconClass;
    return `${tag}.${node.classList[0]}`;
  }
  return tag;
}

// ---------------------------------------------------------------------------
// Interactive node detection (FIX 2 — synthetic hover fallback)
// ---------------------------------------------------------------------------

/** Tags that are inherently interactive (mirrors packages/shared/src/w2w-hover.ts). */
const INTERACTIVE_TAGS_FOR_SYNTHESIS = new Set([
  'a', 'button', 'input', 'select', 'textarea',
]);

/** ARIA roles that indicate an interactive element. */
const INTERACTIVE_ROLES_FOR_SYNTHESIS = new Set([
  'button', 'link', 'tab', 'menuitem', 'option',
]);

/**
 * Detect whether a W2WFrameNode represents an interactive element that should
 * receive a synthetic hover fallback when no real hover diff was captured.
 *
 * Signals (any one triggers):
 *   - tag ∈ INTERACTIVE_TAGS
 *   - [role] ∈ INTERACTIVE_ROLES
 *   - [tabindex] ≠ "-1"
 *   - cursor: pointer (strong CSS signal of clickability on styled <div>s)
 */
function isInteractiveNode(node: W2WFrameNode): boolean {
  if (INTERACTIVE_TAGS_FOR_SYNTHESIS.has(node.tag)) return true;

  const role = node.attr?.role;
  if (typeof role === 'string' && INTERACTIVE_ROLES_FOR_SYNTHESIS.has(role)) {
    return true;
  }

  const tabindex = node.attr?.tabindex;
  if (tabindex != null && String(tabindex) !== '-1') {
    return true;
  }

  if (node.styles?.cursor === 'pointer') {
    return true;
  }

  return false;
}

/** CSS properties that applyCssDiffToNode() in pseudoStates.ts can handle */
const HOVER_DIFF_PROPERTIES: string[] = [
  'backgroundColor', 'background',
  'borderColor', 'borderWidth', 'borderRadius',
  'color', 'opacity',
  'boxShadow', 'outlineColor',
  'textDecoration', 'textDecorationLine',
  // Expanded (Phase 2A):
  'visibility',      // frame.visible
  'transform',       // extract rotate() → frame.rotation
  'outlineWidth',    // frame.strokeWeight + OUTSIDE
  'letterSpacing',   // textNode.letterSpacing
  // FIX 3 — effect-producing properties
  'filter',          // blur() → LAYER_BLUR, drop-shadow() → DROP_SHADOW
  'backdropFilter',  // blur() → BACKGROUND_BLUR
  'textShadow',      // → TextNode.effects[DROP_SHADOW]
  'clipPath',        // inset() → frame.clipsContent
  // Phase 5 — per-side borders (Apple nav underline), typography on hover,
  // box geometry (padding, gap, size). Each has a matching case in
  // applyCssDiffToNode.
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontWeight', 'fontSize',
  'textDecorationColor', 'textDecorationThickness', 'textUnderlineOffset',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'gap', 'rowGap', 'columnGap',
  'width', 'height',
];

/**
 * Compute CSS diff between normal and hover states.
 * Returns only properties that actually changed AND are handleable by applyCssDiffToNode.
 * Keys are converted to kebab-case (matching what applyCssDiffToNode expects).
 */
function computeHoverDiff(
  normalStyles: Record<string, string | number | undefined>,
  hoverStyles: Record<string, string | number | undefined>,
): { hover: Record<string, string> } | undefined {
  const diff: Record<string, string> = {};

  for (const prop of HOVER_DIFF_PROPERTIES) {
    const normalVal = normalStyles[prop];
    const hoverVal = hoverStyles[prop];
    if (hoverVal !== undefined && String(hoverVal) !== String(normalVal ?? '')) {
      // Convert camelCase to kebab-case for applyCssDiffToNode
      const kebab = prop.replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase());
      diff[kebab] = String(hoverVal);
    }
  }

  return Object.keys(diff).length > 0 ? { hover: diff } : undefined;
}

/**
 * Check if a FRAME node contains only TEXT children (no FRAME/SVG).
 * Used to identify inline elements whose text can be folded into a parent.
 */
function isTextOnlyFrame(node: W2WFrameNode): boolean {
  if (node.children.length === 0) return false;
  return node.children.every(child =>
    child.type === 'TEXT' || (child.type === 'FRAME' && INLINE_TEXT_TAGS.has(child.tag) && isTextOnlyFrame(child))
  );
}

type MarginSides = { top: number; right: number; bottom: number; left: number };

/**
 * Parse 4-sided margin from raw wrapper styles. Non-numeric and negative
 * values collapse to 0 (we only care about positive gaps for bubble-up).
 */
function extractMarginFromStyles(s: Record<string, string | number | undefined>): MarginSides {
  return {
    top: parseFloat(str(s.marginTop)) || 0,
    right: parseFloat(str(s.marginRight)) || 0,
    bottom: parseFloat(str(s.marginBottom)) || 0,
    left: parseFloat(str(s.marginLeft)) || 0,
  };
}

/**
 * Decide what to do with a text-only inline wrapper (span, a, strong, …)
 * that sits inside a text-coalesce parent (h3, p, button, …). Three outcomes:
 *
 *   - **frame**: render the wrapper as a nested frame (keeps its padding /
 *     width / margin-against-siblings). Used when the wrapper has CSS that
 *     cannot be bubbled up — padding (inward content box), width
 *     constraints (wrapper's own size), or margin with sibling content that
 *     the margin should not affect.
 *
 *   - **bubble**: bubble the wrapper's margin onto its parent and collapse
 *     the wrapper's text into the parent's text flow. Used when the
 *     wrapper is the only substantive child and its only box CSS is
 *     margin. CSS semantics: margin of a sole block child of a block
 *     parent collapses through the parent (and an inline wrapper's margin
 *     on the only text content similarly ends up as the parent's effective
 *     bottom margin). See Apple.com footer column titles
 *     `<h3><span display:block margin-bottom:.8em>Apple Wallet</span></h3>`
 *     — the 9.6px gap must push `<h3>`'s *next sibling* (the link list)
 *     down, not live inside `<h3>`'s box.
 *
 *   - **collapse**: plain coalesce into parent's text (original behavior
 *     for inline wrappers with no box CSS).
 */
function classifyWrapper(
  child: W2WFrameNode,
  isOnlyChild: boolean,
): 'frame' | 'bubble' | 'collapse' {
  const s = child.styles;

  // Padding — content-box inward, cannot be bubbled.
  if (
    (parseFloat(str(s.paddingTop)) || 0) > 0 ||
    (parseFloat(str(s.paddingRight)) || 0) > 0 ||
    (parseFloat(str(s.paddingBottom)) || 0) > 0 ||
    (parseFloat(str(s.paddingLeft)) || 0) > 0
  ) {
    return 'frame';
  }

  // Explicit width / min-width / max-width — constrains the wrapper's own
  // box, can't be preserved on a collapsed parent.
  for (const key of ['width', 'maxWidth', 'minWidth'] as const) {
    const v = str(s[key]);
    if (!v || v === 'auto' || v === 'none' || v === '0' || v === '0px') continue;
    const n = parseFloat(v);
    if (Number.isFinite(n) && n > 0) return 'frame';
  }

  // Margin — bubble iff the wrapper is the sole substantive child; otherwise
  // keep as a framed child so the margin survives between siblings.
  const m = extractMarginFromStyles(s);
  const hasMargin = m.top > 0 || m.right > 0 || m.bottom > 0 || m.left > 0;
  if (hasMargin) return isOnlyChild ? 'bubble' : 'frame';

  // display:block / inline-block / flex / grid — load-bearing only when the
  // wrapper carries other layout content. For a text-only wrapper that's the
  // only child, plain collapse is visually identical (parent is already the
  // block container). Fall through to 'collapse'.
  return 'collapse';
}

/**
 * Recursively collect TEXT values from an inline FRAME node.
 * Flattens nested inline elements (e.g., <strong><em>$20</em>/mo</strong>).
 * Preserves the inline element's styles (color, textDecoration) on each text child.
 */
function collectTextFromFrame(
  node: W2WFrameNode,
  target: TextChildValue[],
): void {
  // Extract inline styles from this FRAME element
  const s = node.styles;
  const colorOverride = str(s.webkitTextFillColor) || str(s.color) || undefined;
  const rawDecoration = str(s.textDecorationLine) || str(s.textDecoration) || '';
  let textDecoration: TextChildValue['textDecoration'];
  if (rawDecoration.includes('underline')) textDecoration = 'underline';
  else if (rawDecoration.includes('line-through')) textDecoration = 'line-through';
  // Font-weight override (e.g., <strong> with font-weight: bold/bolder/700)
  const rawFontWeight = str(s.fontWeight);
  const fontWeightOverride = rawFontWeight ? parseFontWeight(rawFontWeight) : undefined;

  const effectiveChildren = getEffectiveChildren(node);
  for (const child of effectiveChildren) {
    if (child.type === 'TEXT') {
      target.push({
        value: child.value,
        font: child.font,
        platformFamily: child.platformFont?.familyName,
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
        color: colorOverride,
        textDecoration,
        tag: node.tag,
        fontWeight: fontWeightOverride,
      });
    } else if (child.type === 'FRAME' && INLINE_TEXT_TAGS.has(child.tag)) {
      collectTextFromFrame(child, target);
    }
  }
}
