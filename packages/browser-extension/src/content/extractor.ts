/**
 * Content Script DOM Extractor
 *
 * In-page DOM traversal using getComputedStyle() + getBoundingClientRect().
 * Produces W2WNode tree with raw CSS values (no Figma conversion).
 *
 * Flow:
 * 1. Inject pre-capture styles (freeze animations, hide scrollbars)
 * 2. Traverse DOM recursively from <html>
 * 3. Extract styles, geometry, text, SVG, pseudo-elements
 * 4. Clean up injected styles
 * 5. Return { doc, frame } with W2W node tree
 */

import type {
  W2WFrameNode,
  W2WTextNode,
  W2WSVGNode,
  W2WNode,
  W2WDocMeta,
  W2WStyles,
  W2WAttributes,
  Quad,
} from '@w2w/shared';
import {
  parseHoverSelectorsFromCssText,
  splitHoverSelector,
} from '@w2w/shared';

import { SKIP_TAGS, isHidden, isOffscreen } from './visibility';
import {
  CSS_PROPERTIES,
  NUMERIC_PROPERTIES,
  AUTO_DETECT_PROPERTIES,
  DEFAULT_VALUES,
  injectPreCaptureStyles,
  removePreCaptureStyles,
} from './styles';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_DEPTH = 30;

/** Counter for tagging elements with data-w2w-idx (used by service worker for CDP font lookup) */
let nodeIndexCounter = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExtractPageResult {
  doc: W2WDocMeta;
  frame: W2WFrameNode;
  /** Number of text-hosting elements tagged with data-w2w-idx */
  textHostCount: number;
}

/**
 * Extract the entire page DOM into W2W node tree.
 * Called from content script message handler.
 */
export function extractPage(): ExtractPageResult {
  nodeIndexCounter = 0;

  // 1. Inject pre-capture styles
  injectPreCaptureStyles();

  try {
    // 2. Collect document metadata
    const doc = extractDocMeta();

    // 3. Traverse DOM from <html>
    const frame = traverseElement(
      document.documentElement as HTMLElement,
      0,
      doc.innerWidth
    );

    if (!frame) {
      // Fallback: return empty frame for html
      removePreCaptureStyles();
      return {
        doc,
        frame: createEmptyFrame(document.documentElement as HTMLElement),
        textHostCount: 0,
      };
    }

    // 4. Clean up injected styles (but NOT data-w2w-idx — service worker needs them for font lookup)
    removePreCaptureStyles();

    return { doc, frame, textHostCount: nodeIndexCounter };
  } catch (err) {
    removePreCaptureStyles();
    cleanupMarkers();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Document metadata
// ---------------------------------------------------------------------------

function extractDocMeta(): W2WDocMeta {
  const bodyStyle = document.body ? getComputedStyle(document.body) : null;
  let bgColor = bodyStyle?.backgroundColor || 'rgb(255, 255, 255)';

  // Resolve transparent to white
  if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
    bgColor = 'rgb(255, 255, 255)';
  }

  return {
    title: document.title,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    fontSize: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
    baseURI: document.baseURI,
    bgColor,
  };
}

// ---------------------------------------------------------------------------
// Element traversal
// ---------------------------------------------------------------------------

/**
 * Recursively traverse an element and its children.
 * Returns W2WFrameNode or null if element should be skipped.
 */
function traverseElement(
  el: HTMLElement,
  depth: number,
  viewportWidth: number
): W2WFrameNode | null {
  // Depth limit
  if (depth > MAX_DEPTH) return null;

  const tag = el.tagName.toLowerCase();

  // Skip non-visual tags
  if (SKIP_TAGS.has(tag)) return null;

  // Check if SVG — handle as SVG node type (returned as frame with svg child)
  if (el instanceof SVGElement && tag === 'svg') {
    return createSVGAsFrame(el, depth);
  }

  // Visibility filtering
  if (isHidden(el)) {
    // Debug: log skipped elements with id or nav/header tags
    const _id = el.id || '';
    if (_id === 'globalheader' || _id === 'globalnav' || tag === 'nav' || tag === 'header' || tag === 'aside') {
      console.warn(`[W2W-DEBUG] isHidden SKIPPED: <${tag}> id="${_id}" cls="${el.className?.toString?.()?.slice(0,60)}" display=${getComputedStyle(el).display} pos=${getComputedStyle(el).position} offsetParent=${el.offsetParent?.tagName} rect=${JSON.stringify(el.getBoundingClientRect().toJSON())}`);
    }
    return null;
  }

  // Get bounding rect and computed styles
  const rect = el.getBoundingClientRect();
  const computed = getComputedStyle(el);

  // Debug: log nav/header elements that pass visibility
  const _dbgId = el.id || '';
  if (_dbgId === 'globalheader' || _dbgId === 'globalnav' || tag === 'nav' || tag === 'header') {
    console.log(`[W2W-DEBUG] PASSED visibility: <${tag}> id="${_dbgId}" cls="${el.className?.toString?.()?.slice(0,60)}" w=${rect.width} h=${rect.height} display=${computed.display} pos=${computed.position}`);
  }

  // Zero-size check is deferred to AFTER children are processed (post-filter below).
  // This allows zero-size wrappers (e.g. Apple's globalnav-flyout) to pass through
  // when they contain visible child elements.
  const isZeroSize = rect.width < 1 && rect.height < 1 && tag !== 'html' && tag !== 'body';

  // Skip offscreen elements
  if (isOffscreen(rect, viewportWidth, window.innerHeight * 10)) return null;

  // Extract geometry (round to 2 decimals)
  const x = round(rect.left);
  const y = round(rect.top + window.scrollY);
  const width = round(rect.width);
  const height = round(rect.height);
  const quad = rectToQuad(x, y, width, height);
  const styles = extractStyles(el, computed);

  // Extract attributes
  const attr = extractAttributes(el);

  // Extract classList
  const classList = el.classList ? Array.from(el.classList) : [];

  // Image URL for img/video tags
  let $url: string | undefined;
  if (tag === 'img') {
    const img = el as HTMLImageElement;
    $url = img.currentSrc || img.src || img.dataset.src;
  } else if (tag === 'video') {
    $url = (el as HTMLVideoElement).poster;
  }

  // Background image URL
  if (!$url && styles.backgroundImage && styles.backgroundImage !== 'none') {
    const urlMatch = styles.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch) {
      $url = resolveUrl(urlMatch[1]);
    }
  }

  // Build children
  const children: W2WNode[] = [];

  // Handle display: contents — flatten (children promoted to this level)
  if (computed.display === 'contents') {
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) {
        const childNode = traverseElement(child, depth, viewportWidth);
        if (childNode) children.push(childNode);
      }
    }
    // Return null for the display:contents element itself, push children up
    // Actually, we need to return children to parent. We'll handle this by
    // making traverse return children array for display:contents.
    // For simplicity, return a transparent frame with children.
    // Return a transparent frame with children for display:contents.
  }

  // Iterate childNodes (text nodes + elements)
  // Include shadow DOM children for Web Component support (like h2d)
  if (computed.display !== 'contents') {
    const directChildren = Array.from(el.childNodes);
    const shadowChildren = el.shadowRoot
      ? Array.from(el.shadowRoot.childNodes)
      : [];
    const allChildren = [...directChildren, ...shadowChildren];

    // Debug: log body's direct children to trace globalheader/globalnav
    if (tag === 'body' || _dbgId === 'globalheader') {
      console.log(`[W2W-DEBUG] 📦 <${tag}> id="${_dbgId}" iterating ${allChildren.length} childNodes:`);
      for (const c of allChildren) {
        const ct = (c as HTMLElement).tagName?.toLowerCase() || `text(${c.nodeType})`;
        const ci = (c as HTMLElement).id || '';
        const cc = (c as HTMLElement).className?.toString?.()?.slice(0, 40) || '';
        console.log(`[W2W-DEBUG]   child: <${ct}> id="${ci}" cls="${cc}" nodeType=${c.nodeType} isHTMLElement=${c instanceof HTMLElement} isSVGElement=${c instanceof SVGElement}`);
      }
    }

    for (const child of allChildren) {
      if (child.nodeType === Node.TEXT_NODE) {
        const textNodes = extractTextNodes(child as Text, el, computed);
        children.push(...textNodes);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        const childTag = childEl.tagName?.toLowerCase();

        // Handle SVG elements
        if (childEl instanceof SVGElement && childTag === 'svg') {
          const svgNode = createSVGNode(childEl);
          if (svgNode) children.push(svgNode);
        } else if (childEl instanceof HTMLElement) {
          const childNode = traverseElement(childEl, depth + 1, viewportWidth);
          if (childNode) children.push(childNode);
        }
      }
    }
  }

  // Extract pseudo-elements via DOM injection
  // Inject temporary wrapper spans to get accurate bounding rects
  const beforeSpan = injectPseudoSpan(el, '::before');
  if (beforeSpan) {
    const beforeNode = extractInjectedPseudo(beforeSpan, el, '::before');
    if (beforeNode) children.unshift(beforeNode);
    beforeSpan.remove();
  }

  const afterSpan = injectPseudoSpan(el, '::after');
  if (afterSpan) {
    const afterNode = extractInjectedPseudo(afterSpan, el, '::after');
    if (afterNode) children.push(afterNode);
    afterSpan.remove();
  }

  // Post-filter: skip zero-size elements ONLY if they produced no valid children.
  // This preserves zero-size wrappers that contain visible child elements
  // (e.g. Apple globalnav uses 3 levels of 0x0 wrappers around visible nav items).
  if (isZeroSize && children.length === 0) {
    const hasDirectText = el.textContent?.trim();
    const isInline = computed.display === 'inline' || computed.display === 'inline-block';
    if (!hasDirectText || !isInline) return null;
  }

  // Tag element for CDP font lookup (service worker will use data-w2w-idx)
  const hasTextChildren = children.some(c => c.type === 'TEXT');
  if (hasTextChildren) {
    el.setAttribute('data-w2w-idx', String(nodeIndexCounter++));
  }

  // Build frame node
  const frame: W2WFrameNode = {
    type: 'FRAME',
    x, y, width, height, quad,
    tag,
    classList,
    attr,
    styles,
    children,
  };

  // Special properties
  if ($url) frame.$url = $url;
  if (el === document.scrollingElement) frame.isScrollingElt = true;

  return frame;
}

// ---------------------------------------------------------------------------
// Text node extraction
// ---------------------------------------------------------------------------

/**
 * Extract a DOM text node into one or more W2WTextNodes.
 * Splits by visual lines using getClientRects().
 * Returns empty array if text is empty/whitespace-only.
 */
function extractTextNodes(
  textNode: Text,
  _parentEl: HTMLElement,
  parentStyle: CSSStyleDeclaration
): W2WTextNode[] {
  const text = textNode.textContent;
  if (!text || !text.trim()) return [];

  // Build font string
  const fontFamily = cleanFontFamily(parentStyle.fontFamily);
  const fontWeight = parentStyle.fontWeight;
  const font = buildFontString(fontFamily, fontWeight);

  // Get all visual line rects
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const rects = range.getClientRects();

  // If only 1 line, return single TEXT node
  if (rects.length <= 1) {
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return [];

    const x = round(rect.left);
    const y = round(rect.top + window.scrollY);
    return [{
      type: 'TEXT',
      x, y,
      width: round(rect.width),
      height: round(rect.height),
      quad: rectToQuad(x, y, round(rect.width), round(rect.height)),
      value: text.replace(/\s+/g, ' ').trim(),
      font,
    }];
  }

  // Multiple lines — split text by line using character-level range measurement
  const results: W2WTextNode[] = [];
  const textLength = text.length;
  let lineStart = 0;
  let prevTop = -Infinity;

  for (let i = 0; i <= textLength; i++) {
    const charRange = document.createRange();
    charRange.setStart(textNode, Math.min(i, textLength));
    charRange.setEnd(textNode, Math.min(i + 1, textLength));

    let charTop: number;
    if (i < textLength) {
      const charRect = charRange.getBoundingClientRect();
      charTop = Math.round(charRect.top);
    } else {
      charTop = prevTop + 100; // Force flush last line
    }

    // Detect new visual line (Y position jumped)
    if (charTop !== prevTop && prevTop !== -Infinity && i > lineStart) {
      const lineText = text.slice(lineStart, i).replace(/\s+/g, ' ').trim();
      if (lineText) {
        const lineRange = document.createRange();
        lineRange.setStart(textNode, lineStart);
        lineRange.setEnd(textNode, i);
        const lineRect = lineRange.getBoundingClientRect();

        if (lineRect.width >= 1 && lineRect.height >= 1) {
          const lx = round(lineRect.left);
          const ly = round(lineRect.top + window.scrollY);
          const lw = round(lineRect.width);
          const lh = round(lineRect.height);
          results.push({
            type: 'TEXT',
            x: lx, y: ly,
            width: lw,
            height: lh,
            quad: rectToQuad(lx, ly, lw, lh),
            value: lineText,
            font,
          });
        }
      }
      lineStart = i;
    }

    if (i < textLength) {
      prevTop = charTop;
    }
  }

  // If character-level splitting yielded nothing, fall back to single node
  if (results.length === 0) {
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return [];

    const x = round(rect.left);
    const y = round(rect.top + window.scrollY);
    return [{
      type: 'TEXT',
      x, y,
      width: round(rect.width),
      height: round(rect.height),
      quad: rectToQuad(x, y, round(rect.width), round(rect.height)),
      value: text.replace(/\s+/g, ' ').trim(),
      font,
    }];
  }

  return results;
}

// ---------------------------------------------------------------------------
// SVG extraction
// ---------------------------------------------------------------------------

/**
 * Create SVG node with full outerHTML markup.
 */
function createSVGNode(svgEl: SVGElement): W2WSVGNode | null {
  const rect = svgEl.getBoundingClientRect();

  // Use bounding rect if available, otherwise fall back to SVG attributes
  let w = rect.width;
  let h = rect.height;
  if (w < 1 && h < 1) {
    // SVG might have zero computed rect due to CSS clipping/overflow
    // Fall back to SVG width/height/viewBox attributes (like h2d does)
    const attrW = svgEl.getAttribute('width');
    const attrH = svgEl.getAttribute('height');
    if (attrW) w = parseFloat(attrW) || 0;
    if (attrH) h = parseFloat(attrH) || 0;
    if (w < 1 && h < 1) {
      // Try viewBox
      const viewBox = svgEl.getAttribute('viewBox');
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/);
        if (parts.length >= 4) {
          w = parseFloat(parts[2]) || 0;
          h = parseFloat(parts[3]) || 0;
        }
      }
    }
    // If still zero after all fallbacks, skip
    if (w < 1 && h < 1) return null;
  }

  const x = round(rect.left);
  const y = round(rect.top + window.scrollY);

  // Clone to avoid modifying the live DOM
  const clone = svgEl.cloneNode(true) as SVGElement;
  // Remove any W2W markers from clone
  clone.removeAttribute('data-w2w-idx');

  return {
    type: 'SVG',
    x, y,
    width: round(w),
    height: round(h),
    quad: rectToQuad(x, y, round(w), round(h)),
    svg: clone.outerHTML,
  };
}

/**
 * Create an SVG wrapped in a FRAME node (for top-level SVG elements).
 */
function createSVGAsFrame(
  svgEl: SVGElement,
  _depth: number
): W2WFrameNode | null {
  const rect = svgEl.getBoundingClientRect();
  const computed = getComputedStyle(svgEl);

  // Skip only if display:none (truly hidden)
  if (computed.display === 'none') return null;

  // Use bounding rect, fall back to SVG attributes for size
  let w = rect.width;
  let h = rect.height;
  if (w < 1 && h < 1) {
    const attrW = svgEl.getAttribute('width');
    const attrH = svgEl.getAttribute('height');
    if (attrW) w = parseFloat(attrW) || 0;
    if (attrH) h = parseFloat(attrH) || 0;
    if (w < 1 && h < 1) {
      const viewBox = svgEl.getAttribute('viewBox');
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/);
        if (parts.length >= 4) {
          w = parseFloat(parts[2]) || 0;
          h = parseFloat(parts[3]) || 0;
        }
      }
    }
    if (w < 1 && h < 1) return null;
  }

  const x = rect.left;
  const y = rect.top + window.scrollY;

  const svgChild = createSVGNode(svgEl);
  const children: W2WNode[] = svgChild ? [svgChild] : [];

  return {
    type: 'FRAME',
    x, y,
    width: w,
    height: h,
    quad: rectToQuad(x, y, w, h),
    tag: 'svg',
    classList: svgEl.classList ? Array.from(svgEl.classList) : [],
    attr: {},
    styles: extractStyles(svgEl as unknown as HTMLElement, computed),
    children,
  };
}

// ---------------------------------------------------------------------------
// Pseudo-element extraction (DOM injection approach)
// ---------------------------------------------------------------------------

/**
 * Inject a temporary wrapper span to materialize a pseudo-element's content.
 * This gives us accurate bounding rect and computed styles.
 * Returns the injected span, or null if pseudo-element has no visible content.
 */
function injectPseudoSpan(
  el: HTMLElement,
  pseudo: '::before' | '::after',
): HTMLSpanElement | null {
  const style = getComputedStyle(el, pseudo);
  const content = style.content;

  // Skip if no content — normalize various empty representations
  if (!content || content === 'none' || content === 'normal') {
    return null;
  }

  // Strip outer quotes and check if truly empty
  const stripped = content.replace(/^["']|["']$/g, '');
  if (stripped === '' || stripped === 'none' || stripped === 'normal') {
    return null;
  }

  // Skip if hidden
  if (style.display === 'none' || style.visibility === 'hidden') return null;

  // Check if pseudo has any visual presence (content, background, border, or dimensions)
  const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
  const hasBorder = style.borderWidth !== '0px' && style.borderStyle !== 'none';
  const hasWidth = style.width !== '0px' && style.width !== 'auto';
  const hasHeight = style.height !== '0px' && style.height !== 'auto';

  // Create wrapper span
  const span = document.createElement('span');
  span.className = pseudo === '::before' ? '__w2w-pseudo-before' : '__w2w-pseudo-after';

  // Extract text content (strip quotes, handle CSS content escapes)
  const textValue = stripped
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)));

  const hasText = textValue && textValue.length > 0;
  if (hasText) {
    span.textContent = textValue;
  }

  // If no text and no visual presence, skip
  if (!hasText && !hasBackground && !hasBorder && !hasWidth && !hasHeight) {
    return null;
  }

  // Copy key computed styles from pseudo-element to span
  const stylesToCopy = [
    'display', 'position', 'width', 'height', 'minWidth', 'minHeight',
    'margin', 'padding',
    'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight', 'color',
    'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
    'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
    'opacity', 'verticalAlign',
    'boxSizing', 'overflow',
  ];

  for (const prop of stylesToCopy) {
    const val = (style as unknown as Record<string, string>)[prop];
    if (val) {
      (span.style as unknown as Record<string, string>)[prop] = val;
    }
  }

  // Ensure span is inline if pseudo was inline
  if (style.display === 'inline' || style.display === '') {
    span.style.display = 'inline';
  }

  // Insert into DOM
  if (pseudo === '::before') {
    el.insertBefore(span, el.firstChild);
  } else {
    el.appendChild(span);
  }

  return span;
}

/**
 * Extract an injected pseudo-element span as an W2WNode.
 */
function extractInjectedPseudo(
  span: HTMLSpanElement,
  parentEl: HTMLElement,
  pseudo: '::before' | '::after',
): W2WFrameNode | W2WTextNode | null {
  const rect = span.getBoundingClientRect();

  // For pseudo-elements with icon font content that may render as 0x0,
  // check the original pseudo-element styles for explicit dimensions
  if (rect.width < 0.5 && rect.height < 0.5) {
    const pseudoStyle = getComputedStyle(parentEl, pseudo);
    const explicitW = parseFloat(pseudoStyle.width);
    const explicitH = parseFloat(pseudoStyle.height);
    const hasExplicitSize = (explicitW > 0 || explicitH > 0);
    if (!hasExplicitSize) return null;
  }

  const x = round(rect.left);
  const y = round(rect.top + window.scrollY);
  const width = round(rect.width);
  const height = round(rect.height);
  const quad = rectToQuad(x, y, width, height);

  const text = span.textContent?.trim();
  const computed = getComputedStyle(span);

  // Extract styles for the FRAME wrapper
  const styles = extractStyles(span, computed);

  // Get original pseudo content value for the styles
  const pseudoStyle = getComputedStyle(parentEl, pseudo);
  const contentVal = pseudoStyle.content;

  if (text && text.length > 0) {
    // Text pseudo → FRAME wrapper + TEXT child
    const fontFamily = cleanFontFamily(computed.fontFamily);
    const font = buildFontString(fontFamily, computed.fontWeight);

    // Add content to styles (stores original content value)
    if (contentVal && contentVal !== 'none' && contentVal !== 'normal') {
      (styles as Record<string, string | number>).content = contentVal;
    }

    const textChild: W2WTextNode = {
      type: 'TEXT',
      x, y, width, height, quad,
      value: text,
      font,
    };

    return {
      type: 'FRAME',
      x, y, width, height, quad,
      tag: 'span',
      classList: Array.from(span.classList),
      attr: {},
      styles,
      children: [textChild],
    };
  }

  // Decorative pseudo → FRAME (no text child)
  if (contentVal && contentVal !== 'none' && contentVal !== 'normal') {
    (styles as Record<string, string | number>).content = contentVal;
  }

  return {
    type: 'FRAME',
    x, y, width, height, quad,
    tag: 'span',
    classList: Array.from(span.classList),
    attr: {},
    styles,
    children: [],
  };
}

// ---------------------------------------------------------------------------
// Style extraction
// ---------------------------------------------------------------------------

/**
 * Extract CSS styles from an element, using getComputedStyle + computedStyleMap.
 * Only non-default values are included.
 */
function extractStyles(el: HTMLElement | SVGElement, computed: CSSStyleDeclaration): W2WStyles {
  const styles: W2WStyles = {};

  // Get element dimensions for transformOrigin default detection
  const elRect = el.getBoundingClientRect();

  // Use computedStyleMap for auto-detection if available
  let styleMap: StylePropertyMapReadOnly | null = null;
  if ('computedStyleMap' in el && typeof el.computedStyleMap === 'function') {
    try {
      styleMap = (el as HTMLElement).computedStyleMap();
    } catch {
      // computedStyleMap may throw on some elements
    }
  }

  for (const prop of CSS_PROPERTIES) {
    let value: string | number | undefined;

    // For auto-detect properties, try computedStyleMap first
    // computedStyleMap preserves CSS keywords and units that getComputedStyle resolves to pixels
    if (AUTO_DETECT_PROPERTIES.has(prop) && styleMap) {
      try {
        const cssValue = styleMap.get(prop);
        if (cssValue) {
          const csStr = cssValue.toString();
          // Preserve original CSS value if it contains non-pixel info:
          // - Keywords: auto, fit-content, min-content, max-content, none
          // - CSS functions: min(), max(), clamp(), calc()
          // - Relative/flex units: fr, %, em, rem, vw, vh
          const hasNonPixelInfo =
            csStr === 'auto' || csStr === 'none' ||
            csStr === 'fit-content' || csStr === 'min-content' || csStr === 'max-content' ||
            /\b(min|max|clamp|calc)\s*\(/.test(csStr) ||
            /\d+(fr|%|em|rem|vw|vh|vmin|vmax)\b/.test(csStr);

          if (hasNonPixelInfo) {
            value = csStr;
          } else {
            // Pure pixel value — use getComputedStyle for precision
            value = computed.getPropertyValue(camelToKebab(prop));
          }
        }
      } catch {
        value = computed.getPropertyValue(camelToKebab(prop));
      }
    } else {
      // Standard getComputedStyle read
      value = (computed as unknown as Record<string, string>)[prop];
    }

    if (value === undefined || value === '') continue;

    // Convert numeric properties
    if (NUMERIC_PROPERTIES.has(prop)) {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(num as number)) continue;
      value = num;
    }

    // Filter out defaults
    const defaultVal = DEFAULT_VALUES[prop];
    if (defaultVal !== undefined && value === defaultVal) continue;
    if (typeof value === 'string' && typeof defaultVal === 'string' && value === defaultVal) continue;

    // transformOrigin: browser returns pixel values (e.g. "720px 1351px") for default 50% 50%
    // Skip if it's just the center point
    if (prop === 'transformOrigin' && typeof value === 'string') {
      const parts = value.split(' ').map(v => parseFloat(v));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const halfW = elRect.width / 2;
        const halfH = elRect.height / 2;
        if (Math.abs(parts[0] - halfW) < 1 && Math.abs(parts[1] - halfH) < 1) continue;
      }
    }

    // Store non-default value
    (styles as Record<string, string | number>)[prop] = value;
  }

  return styles;
}


// ---------------------------------------------------------------------------
// Attribute extraction
// ---------------------------------------------------------------------------

function extractAttributes(el: HTMLElement): W2WAttributes {
  const attr: W2WAttributes = {};
  const tag = el.tagName.toLowerCase();

  if (el.id) attr.id = el.id;

  // Link attributes
  if (tag === 'a') {
    const href = (el as HTMLAnchorElement).href;
    if (href) attr.href = href;
  }

  // Image attributes
  if (tag === 'img') {
    const img = el as HTMLImageElement;
    if (img.alt) attr.alt = img.alt;
    if (img.naturalWidth) attr.naturalWidth = img.naturalWidth;
    if (img.naturalHeight) attr.naturalHeight = img.naturalHeight;
    if (img.srcset) attr.srcset = img.srcset;
  }

  // ARIA & role
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) attr.ariaLabel = ariaLabel;
  const role = el.getAttribute('role');
  if (role) attr.role = role;

  // baseURI for body
  if (tag === 'body') {
    attr.baseURI = document.baseURI;
  }

  return attr;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function rectToQuad(x: number, y: number, w: number, h: number): Quad {
  return [
    round(x), round(y),
    round(x + w), round(y),
    round(x + w), round(y + h),
    round(x), round(y + h),
  ];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function cleanFontFamily(fontFamily: string): string {
  // Take first font from the list, strip quotes
  const first = fontFamily.split(',')[0].trim();
  return first.replace(/^["']|["']$/g, '');
}

function buildFontString(family: string, weight: string): string {
  // Map weight numbers to names
  const weightName = WEIGHT_NAMES[weight] || '';
  if (weightName && weightName !== 'Regular') {
    return `${family} ${weightName}`;
  }
  return family;
}

const WEIGHT_NAMES: Record<string, string> = {
  '100': 'Thin',
  '200': 'ExtraLight',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
  '800': 'ExtraBold',
  '900': 'Black',
};

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}

function resolveUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('//')) {
    return url;
  }
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

function createEmptyFrame(el: HTMLElement): W2WFrameNode {
  const rect = el.getBoundingClientRect();
  return {
    type: 'FRAME',
    x: 0, y: 0,
    width: rect.width || window.innerWidth,
    height: rect.height || window.innerHeight,
    quad: rectToQuad(0, 0, rect.width || window.innerWidth, rect.height || window.innerHeight),
    tag: 'html',
    classList: [],
    attr: {},
    styles: {},
    children: [],
  };
}

/**
 * Extract a subtree rooted at an element matching the given CSS selector.
 * Used for hover state re-capture.
 */
export function extractSubtree(selector: string): W2WFrameNode | null {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  return traverseElement(el, 0, window.innerWidth);
}

/**
 * Remove data-w2w-idx markers from the page.
 * Called by content script message handler after service worker finishes font collection.
 */
export function cleanupMarkers(): void {
  const marked = document.querySelectorAll('[data-w2w-idx]');
  marked.forEach(el => el.removeAttribute('data-w2w-idx'));
}

/**
 * Walk `document.styleSheets` and extract every `:hover` selector, returning
 * `{ trigger, target }` pairs for elements that currently exist on the page.
 *
 * Used by background/API to EXPAND the hover capture candidate pool beyond
 * just interactive tags (button, a, input). Styled elements like
 * `<div class="card">` with `.card:hover {}` rules become capturable.
 *
 * Robustness:
 *  - Cross-origin stylesheets throw `SecurityError` on `.cssRules` → skipped
 *  - `@media` and `@supports` rules recursed into
 *  - Pseudo-element combinations (`::before`, `::after`) filtered out
 *  - Triggers deduped (one entry per unique trigger selector)
 *  - Triggers verified via `document.querySelector` before inclusion
 *  - Capped at MAX to prevent runaway CDP calls
 */
export function collectHoverSelectors(): Array<{ trigger: string; target: string }> {
  const results: Array<{ trigger: string; target: string }> = [];
  const seen = new Set<string>();
  const MAX = 300;

  function processRule(rule: CSSRule): void {
    if (results.length >= MAX) return;

    // Recurse into grouping rules (@media, @supports, @layer, @container)
    // CSSGroupingRule was introduced in all modern browsers — not all its
    // subclasses are exposed as globals (e.g., CSSLayerBlockRule), so we
    // detect by duck-typing `.cssRules`.
    const maybeRules = (rule as CSSGroupingRule).cssRules;
    if (maybeRules && typeof maybeRules[Symbol.iterator] === 'function') {
      try {
        for (const inner of Array.from(maybeRules)) processRule(inner);
      } catch {
        // Some nested rules may throw on access
      }
      return;
    }

    // Only CSSStyleRule has `selectorText`
    const styleRule = rule as CSSStyleRule;
    if (typeof styleRule.selectorText !== 'string') return;

    const selectors = parseHoverSelectorsFromCssText(styleRule.selectorText);
    for (const sel of selectors) {
      if (results.length >= MAX) return;
      const split = splitHoverSelector(sel);
      if (!split) continue;
      if (seen.has(split.trigger)) continue;

      // Verify trigger exists on the page. Saves wasted CDP calls for dead
      // rules (unused CSS). Invalid selectors throw → skip.
      try {
        if (!document.querySelector(split.trigger)) continue;
      } catch {
        continue;
      }

      seen.add(split.trigger);
      results.push(split);
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules; // throws SecurityError on cross-origin
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (results.length >= MAX) break;
        processRule(rule);
      }
    } catch {
      // Cross-origin stylesheet — skip silently
    }
    if (results.length >= MAX) break;
  }

  return results;
}
