/**
 * CSS Converter: H2D raw CSS → WireframeNode
 *
 * Converts h2d-style node tree (raw CSS values from getComputedStyle)
 * into WireframeNode tree that the existing rendering pipeline consumes.
 *
 * This is the h2d equivalent of tree-builder.ts, but runs in the Figma plugin
 * instead of during extraction.
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

// Types from h2d extraction (inline to avoid @w2w/shared dependency in plugin build)
interface H2DFrameNode {
  type: 'FRAME';
  x: number; y: number; width: number; height: number;
  quad: number[];
  tag: string;
  classList: string[];
  attr: Record<string, string | number | boolean | undefined>;
  styles: Record<string, string | number | undefined>;
  children: H2DNode[];
  $url?: string;
  isScrollingElt?: boolean;
  hover?: H2DFrameNode;
}

interface H2DTextNode {
  type: 'TEXT';
  x: number; y: number; width: number; height: number;
  quad: number[];
  value: string;
  font: string;
  platformFont?: { familyName: string; postScriptName?: string };
}

interface H2DSVGNode {
  type: 'SVG';
  x: number; y: number; width: number; height: number;
  quad: number[];
  svg: string;
}

type H2DNode = H2DFrameNode | H2DTextNode | H2DSVGNode;

interface ConvertOptions {
  cssVariables?: Map<string, string>;
  layoutMode?: 'absolute' | 'autoLayout';
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

let _nodeId = 0;

/**
 * Convert an H2D frame tree to a WireframeNode tree.
 */
export function convertH2DToWireframe(
  h2dFrame: H2DFrameNode,
  options: ConvertOptions = {},
): WireframeNode {
  _nodeId = 0;
  return convertFrame(h2dFrame, null, options);
}

// ---------------------------------------------------------------------------
// Frame conversion
// ---------------------------------------------------------------------------

function convertFrame(
  node: H2DFrameNode,
  parent: H2DFrameNode | null,
  options: ConvertOptions,
): WireframeNode {
  const s = node.styles;
  const id = `h2d-${_nodeId++}`;


  // Layout
  const cssLayoutMode = getLayoutMode(s);
  const isAbsoluteMode = options.layoutMode === 'absolute';
  const layoutMode = isAbsoluteMode ? 'NONE' as const : cssLayoutMode;
  const padding = parsePadding(str(s.paddingTop), str(s.paddingRight), str(s.paddingBottom), str(s.paddingLeft), str(s.padding));
  const gapStr = str(s.gap);
  const itemSpacing = isAbsoluteMode ? 0 : (parseFloat(gapStr) || 0);

  // Sizing
  const sizing = isAbsoluteMode
    ? { horizontal: 'FIXED' as const, vertical: 'FIXED' as const, grow: 0 as const, align: 'INHERIT' as const }
    : getSizing(s, parent?.styles, cssLayoutMode);

  // Fills
  const fills = parseFills(s, node.width, node.height);

  // Strokes
  const strokes = parseStrokes(s);

  // Effects
  const effects = parseEffects(s);

  // Border radius
  const borderRadius = parseBorderRadius(s);

  // Text color (from styles, for text children)
  const textColor = str(s.webkitTextFillColor) || str(s.color) || 'rgb(0, 0, 0)';

  // Opacity — validate to avoid Symbol/NaN reaching Figma API
  const rawOpacity = s.opacity;
  const opacity = typeof rawOpacity === 'number' ? Math.max(0, Math.min(1, rawOpacity))
    : typeof rawOpacity === 'string' ? Math.max(0, Math.min(1, parseFloat(rawOpacity) || 1))
    : 1;

  // Overflow
  const overflow = parseOverflow(s);

  // Font info from parent styles (used for text children)
  const fontFamily = cleanFontFamily(str(s.fontFamily) || 'Arial');
  const fontSize = parseFloat(str(s.fontSize)) || 16;
  const fontWeight = parseFontWeight(str(s.fontWeight));

  // Convert children — separate TEXT nodes from FRAME/SVG nodes
  const children: WireframeNode[] = [];
  const textChildValues: { value: string; font: string; platformFamily?: string; x: number; y: number; width: number; height: number }[] = [];
  let textContent = '';

  for (const child of node.children) {
    if (child.type === 'TEXT') {
      // Collect TEXT node info (don't create WireframeNode yet — will coalesce)
      textChildValues.push({
        value: child.value,
        font: child.font,
        platformFamily: child.platformFont?.familyName,
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
      });
    } else if (child.type === 'SVG') {
      children.push(convertSVGNode(child, node));
    } else if (child.type === 'FRAME') {
      // Pseudo-element wrappers (__w2w-pseudo-before/after): flatten their children
      // directly into parent, skipping the wrapper frame (like h2d does).
      const isPseudo = child.classList.includes('__w2w-pseudo-before') || child.classList.includes('__w2w-pseudo-after');
      if (isPseudo) {
        for (const pseudoChild of child.children) {
          if (pseudoChild.type === 'TEXT') {
            textChildValues.push({
              value: pseudoChild.value,
              font: pseudoChild.font,
              platformFamily: pseudoChild.platformFont?.familyName,
              x: pseudoChild.x,
              y: pseudoChild.y,
              width: pseudoChild.width,
              height: pseudoChild.height,
            });
          } else if (pseudoChild.type === 'SVG') {
            children.push(convertSVGNode(pseudoChild, node));
          } else if (pseudoChild.type === 'FRAME') {
            children.push(convertFrame(pseudoChild, node, options));
          }
        }
      } else {
        children.push(convertFrame(child, node, options));
      }
    }
  }

  // Determine type
  let type: 'frame' | 'text' | 'placeholder' = 'frame';
  const isMedia = node.tag === 'img' || node.tag === 'video' || node.tag === 'canvas';

  if (isMedia && node.$url) {
    type = 'placeholder';
  }

  // Text coalescing: join h2d per-line TEXT children into a single text node.
  // Only coalesce when:
  // - Element has TEXT children (textChildValues not empty)
  // - Element is a text-wrapping tag (p, h1-h6, span, a, button, etc.)
  // - Element is NOT a layout container (flex/grid)
  // - Element has NO non-text children (frames/SVGs)
  let styledSegments: TextSegment[] | undefined;
  let browserLineCount: number | undefined;

  const hasTextChildren = textChildValues.length > 0;
  const hasNonTextChildren = children.length > 0;
  const isLayoutContainer = layoutMode !== 'NONE';

  if (hasTextChildren && !hasNonTextChildren && !isLayoutContainer && TEXT_COALESCE_TAGS.has(node.tag)) {
    // Coalesce all TEXT children into a single text node
    // Join with space because h2d splits text per visual line
    textContent = textChildValues.map(t => t.value).join(' ');
    browserLineCount = textChildValues.length;

    // Create styledSegments — each line gets parent's typography
    if (textChildValues.length > 1) {
      styledSegments = textChildValues.map(t => {
        const { family, weight } = parseFontString(t.font);
        return {
          text: t.value,
          color: textColor,
          fontWeight: weight || fontWeight,
          fontSize,
          fontFamily: t.platformFamily || family || fontFamily,
        };
      });
    }

    type = 'text';
  } else if (hasTextChildren) {
    // Mixed children (TEXT + FRAME/SVG) or container tag — keep TEXT as individual children
    for (const tv of textChildValues) {
      const textNode = convertTextNodeFromValue(tv, node, s, options);
      children.push(textNode);
    }
    // Set frame's textContent for fallback rendering (li text, etc.)
    textContent = textChildValues.map(t => t.value).join(' ');
  }

  // Margin
  const margin = parseMargin(s);
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

  const wireframeNode: WireframeNode = {
    id,
    name: getNodeName(node),
    type,
    tag: node.tag,
    className: node.classList.join(' ') || undefined,
    x: parent ? node.x - parent.x : node.x,
    y: parent ? node.y - parent.y : node.y,
    width: node.width,
    height: node.height,

    position: str(s.position) as WireframeNode['position'] || undefined,

    layoutMode,
    itemSpacing,
    padding,
    justifyContent: !isAbsoluteMode ? str(s.justifyContent) : undefined,
    alignItems: !isAbsoluteMode ? str(s.alignItems) : undefined,
    flexWrap: !isAbsoluteMode ? str(s.flexWrap) : undefined,
    layoutGrow: sizing.grow,
    layoutAlign: sizing.align,
    layoutSizingHorizontal: sizing.horizontal,
    layoutSizingVertical: sizing.vertical,

    // Grid
    gridTemplateColumns: !isAbsoluteMode ? str(s.gridTemplateColumns) : undefined,
    gridTemplateRows: !isAbsoluteMode ? str(s.gridTemplateRows) : undefined,
    gridAutoFlow: !isAbsoluteMode ? str(s.gridAutoFlow) : undefined,
    gridColumnGap: !isAbsoluteMode ? (parseFloat(gapStr) || 0) : undefined,
    gridRowGap: !isAbsoluteMode ? (parseFloat(str(s.rowGap) || gapStr) || 0) : undefined,

    // Visual
    fills: fills.length > 0 ? fills : undefined,
    strokes: strokes.length > 0 ? strokes : undefined,
    effects: effects.length > 0 ? effects : undefined,

    // Legacy fields
    backgroundColor: fills.find(f => f.type === 'SOLID')
      ? figmaColorToCSS(fills.find(f => f.type === 'SOLID')!.color!)
      : null,
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
    overflow,
    margin: margin.top || margin.right || margin.bottom || margin.left ? margin : undefined,
    horizontallyCentered: isHorizontallyCentered || undefined,

    // Text
    textContent,
    styledSegments,
    browserLineCount,
    fontSize,
    fontWeight,
    fontFamily,
    textAlign,
    lineHeight: lineHeight === 'normal' ? 'normal' : parseFloat(lineHeight) || 'normal',
    letterSpacing,

    // Pseudo states
    pseudoStateStyles: node.hover
      ? { hover: flattenStylesToRecord(node.hover.styles) }
      : undefined,

    // Media
    isPlaceholder: type === 'placeholder',
    imageUrl: node.$url,

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
  tv: { value: string; font: string; platformFamily?: string; x: number; y: number; width: number; height: number },
  parentNode: H2DFrameNode | null,
  parentStyles: Record<string, string | number | undefined>,
  _options: ConvertOptions,
): WireframeNode {
  const id = `h2d-${_nodeId++}`;
  const { family, weight } = parseFontString(tv.font);

  const textColor = str(parentStyles.webkitTextFillColor)
    || str(parentStyles.color)
    || 'rgb(0, 0, 0)';

  return {
    id,
    name: getTextNodeName(tv.value, parentNode),
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
    textColor,
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,

    textContent: tv.value,
    fontSize: parseFloat(str(parentStyles.fontSize)) || 16,
    fontWeight: weight,
    fontFamily: tv.platformFamily || family,
    textAlign: str(parentStyles.textAlign) || 'left',
    lineHeight: str(parentStyles.lineHeight) || 'normal',
    letterSpacing: parseFloat(str(parentStyles.letterSpacing)) || 0,

    isPlaceholder: false,
    children: [],
  };
}

// ---------------------------------------------------------------------------
// SVG node conversion
// ---------------------------------------------------------------------------

function convertSVGNode(node: H2DSVGNode, parent: H2DFrameNode | null): WireframeNode {
  const id = `h2d-${_nodeId++}`;

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

// ---------------------------------------------------------------------------
// Sizing detection (HUG / FILL / FIXED)
// ---------------------------------------------------------------------------

function getSizing(
  s: Record<string, string | number | undefined>,
  parentStyles: Record<string, string | number | undefined> | undefined | null,
  layoutMode: string,
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

  // Width
  if (width === 'fit-content' || width === 'max-content') {
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
      horizontal = 'HUG'; // Horizontal flex: auto = content-sized
    }
  } else if (width === '100%') {
    horizontal = 'FILL';
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
    vertical = 'FILL';
  } else if (isParentVertical && flexGrow > 0) {
    vertical = 'FILL';
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

  // Background image (gradients, url())
  const bgImage = str(s.backgroundImage);
  if (bgImage && bgImage !== 'none') {
    const gradientFill = parseGradientToFill(bgImage, width, height);
    if (gradientFill) {
      fills.push(gradientFill);
    } else if (bgImage.includes('url(')) {
      // Extract URL from background-image
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      fills.push({
        type: 'IMAGE_PLACEHOLDER',
        visible: true,
        opacity: 1,
        isImagePlaceholder: true,
        imageUrl: urlMatch?.[1] || undefined,
      });
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
        color,
      });
    }
  }

  return fills;
}

// ---------------------------------------------------------------------------
// Stroke parsing (border → FigmaStroke[])
// ---------------------------------------------------------------------------

function parseStrokes(
  s: Record<string, string | number | undefined>,
): FigmaStroke[] {
  const borderStyle = str(s.borderStyle);
  if (!borderStyle || borderStyle === 'none') {
    // Check individual sides
    const hasTop = str(s.borderTopStyle) && str(s.borderTopStyle) !== 'none';
    const hasRight = str(s.borderRightStyle) && str(s.borderRightStyle) !== 'none';
    const hasBottom = str(s.borderBottomStyle) && str(s.borderBottomStyle) !== 'none';
    const hasLeft = str(s.borderLeftStyle) && str(s.borderLeftStyle) !== 'none';

    if (!hasTop && !hasRight && !hasBottom && !hasLeft) return [];

    const borderColor = str(s.borderColor) || 'rgb(0, 0, 0)';
    const color = parseCSSColor(borderColor);
    if (!color) return [];

    const weight = parseFloat(str(s.borderWidth) || '0');
    if (weight <= 0) return [];

    return [{
      color,
      weight,
      position: 'INSIDE',
      style: 'SOLID',
      sides: {
        top: !!hasTop,
        right: !!hasRight,
        bottom: !!hasBottom,
        left: !!hasLeft,
      },
    }];
  }

  const borderColor = str(s.borderColor) || 'rgb(0, 0, 0)';
  const color = parseCSSColor(borderColor);
  if (!color) return [];

  const weight = parseFloat(str(s.borderWidth) || '0');
  if (weight <= 0) return [];

  const style = borderStyle === 'dashed' ? 'DASHED'
    : borderStyle === 'dotted' ? 'DOTTED'
    : 'SOLID';

  return [{
    color,
    weight,
    position: 'INSIDE',
    style: style as FigmaStroke['style'],
  }];
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
    const blurMatch = filter.match(/blur\(([^)]+)\)/);
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
): number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number } {
  const tl = parseFloat(str(s.borderTopLeftRadius) || '0');
  const tr = parseFloat(str(s.borderTopRightRadius) || '0');
  const br = parseFloat(str(s.borderBottomRightRadius) || '0');
  const bl = parseFloat(str(s.borderBottomLeftRadius) || '0');

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

  // Most restrictive wins
  if (ox === 'hidden' || oy === 'hidden') return 'hidden';
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

function parseGradientToFill(
  bgImage: string,
  _width: number,
  _height: number,
): FigmaFill | null {
  // Linear gradient
  const linearMatch = bgImage.match(/linear-gradient\((.+)\)/);
  if (linearMatch) {
    return parseLinearGradient(linearMatch[1]);
  }

  // Radial gradient
  const radialMatch = bgImage.match(/radial-gradient\((.+)\)/);
  if (radialMatch) {
    return parseRadialGradient(radialMatch[1]);
  }

  return null;
}

function parseLinearGradient(content: string): FigmaFill | null {
  // Parse angle
  let angle = 180; // default: top to bottom
  const angleMatch = content.match(/^(\d+)deg/);
  if (angleMatch) {
    angle = parseInt(angleMatch[1]);
  } else if (content.startsWith('to ')) {
    const dirMatch = content.match(/^to\s+(top|bottom|left|right)/);
    if (dirMatch) {
      const dirAngles: Record<string, number> = {
        top: 0, right: 90, bottom: 180, left: 270,
      };
      angle = dirAngles[dirMatch[1]] || 180;
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
  };
}

function parseRadialGradient(content: string): FigmaFill | null {
  const stops = parseColorStops(content);
  if (stops.length < 2) return null;

  return {
    type: 'GRADIENT_RADIAL',
    visible: true,
    opacity: 1,
    center: { x: 0.5, y: 0.5 },
    stops,
  };
}

function parseColorStops(content: string): FigmaGradientStop[] {
  const stops: FigmaGradientStop[] = [];

  // Remove direction part (angle, "to xxx", "circle at xxx", etc.)
  let stopsStr = content;
  // Remove angle
  stopsStr = stopsStr.replace(/^\d+deg\s*,\s*/, '');
  // Remove "to direction"
  stopsStr = stopsStr.replace(/^to\s+\w+(\s+\w+)?\s*,\s*/, '');
  // Remove radial shape/position
  stopsStr = stopsStr.replace(/^(circle|ellipse)\s*(at\s+[^,]+)?\s*,\s*/i, '');
  stopsStr = stopsStr.replace(/^(closest|farthest)-(side|corner)\s*(at\s+[^,]+)?\s*,\s*/i, '');

  // Split by comma outside parentheses
  const parts = splitShadows(stopsStr);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Extract color and position
    const posMatch = part.match(/([\d.]+%?)\s*$/);
    let position = i / Math.max(parts.length - 1, 1);
    let colorStr = part;

    if (posMatch) {
      const posStr = posMatch[1];
      if (posStr.endsWith('%')) {
        position = parseFloat(posStr) / 100;
      } else {
        position = parseFloat(posStr);
      }
      colorStr = part.slice(0, part.length - posMatch[0].length).trim();
    }

    const color = parseCSSColor(colorStr);
    if (color) {
      stops.push({ color, position });
    }
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

function cleanFontFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0].trim();
  return first.replace(/^["']|["']$/g, '');
}

function parseFontString(font: string): { family: string; weight: number } {
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
function getTextNodeName(value: string, parentNode: H2DFrameNode | null): string {
  if (parentNode) {
    const iconClass = parentNode.classList.find(c =>
      c.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-brands', 'fa-duotone', 'fa-sharp'].includes(c)
    );
    if (iconClass) return iconClass;
  }
  return value.slice(0, 30);
}

function getNodeName(node: H2DFrameNode): string {
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

function flattenStylesToRecord(
  styles: Record<string, string | number | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(styles)) {
    if (v !== undefined) result[k] = String(v);
  }
  return result;
}
