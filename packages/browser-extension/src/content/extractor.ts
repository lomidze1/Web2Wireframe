/* eslint-disable no-console -- `[W2W-VERIFY-CONTENT]` + `[W2W-HOVER-DIAG]`
 * traces are the primary diagnostic surface for new-site extraction bugs;
 * silenced in prod by gateConsoleInProduction(). */

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
  shouldRenderPseudo,
  computeListMarkers,
  formatListMarker,
  buildMarkerWrapperNode,
  isSvgUrl,
  fetchSvgMarkupForUrls,
} from '@w2w/shared';
/**
 * Set by the shared auto-scroll on elements shown while scrolling but
 * transparent again at extraction — keep in sync with `W2W_REVEAL_MARKER_ATTR`
 * in @w2w/shared (local for the same code-split reason as the hover parser).
 */
const REVEAL_MARKER_ATTR = 'data-w2w-reveal-transform';
/** Below this a marked element counts as faded out (vaayu.tech footer read 0.0001). */
const REVEAL_NEAR_ZERO_OPACITY = 0.05;
// NOTE: hover parser is LOCAL (not @w2w/shared) so Vite doesn't code-split
// the content script — Chrome content scripts can't load ES module chunks.
import {
  parseHoverSelectorsFromCssText,
  splitHoverSelector,
  extractRightmostCompound,
} from './hover-parser';
import { bakeSvgPresentation } from './svg-style-baker';
import { rasterizeCanvases, MAX_CANVAS_TOTAL_BYTES } from './canvas-raster';
import { captureVideoFrames } from './video-frame';

import { SKIP_TAGS, isHidden, isOffscreen, isHorizontalScrollContainer } from './visibility';
import { DEV_LOG_ENABLED } from './dev-log-flag';
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

/**
 * `<canvas>` bitmaps exported by the pre-pass, keyed by element.
 *
 * A canvas has no children and no background to read, so the traversal has
 * nothing to render without this. Filled by rasterizeCanvases() before the
 * traversal starts, because reading a WebGL canvas has to await a frame
 * callback and traverseElement() is synchronous.
 */
const canvasBitmaps = new WeakMap<HTMLCanvasElement, string>();

/**
 * Current frame of each posterless `<video>`, exported by the pre-pass — the
 * poster's stand-in when the page has none (apple.com hero tiles).
 */
const videoFrames = new WeakMap<HTMLVideoElement, string>();

/** Bytes the canvas pass put into `$url` — the video pass gets the rest. */
function canvasBytesSpent(): number {
  let spent = 0;
  try {
    for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
      spent += canvasBitmaps.get(canvas)?.length ?? 0;
    }
  } catch {
    // Unqueryable document — the video pass will find nothing either.
  }
  return spent;
}

/**
 * Dev-log build only: why the traversal dropped elements, handed back to the
 * service worker with EXTRACT_DOM. `large` names the big ones — a dropped
 * section shows up there. Undefined outside extractPage() (hover subtrees).
 */
export interface SkipStats {
  counts: Record<string, number>;
  large: string[];
}
let skipStats: SkipStats | undefined;

function noteSkip(reason: string, el: Element, rect?: DOMRect): void {
  if (!DEV_LOG_ENABLED || !skipStats) return;
  skipStats.counts[reason] = (skipStats.counts[reason] ?? 0) + 1;
  const r = rect ?? el.getBoundingClientRect();
  if (r.width * r.height < 20000 || skipStats.large.length >= 40) return;
  const cs = getComputedStyle(el);
  const id = el.id ? `#${el.id}` : '';
  const cls =
    typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
  skipStats.large.push(
    `${reason} ${el.tagName.toLowerCase()}${id}${cls} ${Math.round(r.width)}x${Math.round(r.height)} ` +
      `@${Math.round(r.left)},${Math.round(r.top + window.scrollY)} ` +
      `opacity=${cs.opacity} visibility=${cs.visibility} display=${cs.display}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExtractPageResult {
  doc: W2WDocMeta;
  frame: W2WFrameNode;
  /** Number of text-hosting elements tagged with data-w2w-idx */
  textHostCount: number;
  /** Dev-log build only — see SkipStats. */
  skipStats?: SkipStats;
}

/**
 * Extract the entire page DOM into W2W node tree.
 * Called from content script message handler.
 *
 * Async because after synchronous DOM traversal we run a post-pass that
 * fetches SVG markup for `<img src="*.svg">` and `background-image: url(*.svg)`
 * so the figma-plugin can render them as native vectors.
 */
export async function extractPage(): Promise<ExtractPageResult> {
  nodeIndexCounter = 0;
  skipStats = DEV_LOG_ENABLED ? { counts: {}, large: [] } : undefined;

  // 0. Wait for web fonts + in-flight images before measuring anything.
  //    Text line-breaking (Range.getClientRects) measured with a fallback
  //    font produces wrong rects for every line; images still loading have
  //    empty currentSrc/naturalWidth. Both waits are capped so a hung
  //    resource can never stall the capture.
  await waitForRenderReadiness();

  // 0b. Export <canvas> bitmaps. A pre-pass, not a post-pass: reading a WebGL
  //     canvas has to await a frame callback, and traverseElement() below is
  //     synchronous, so the bitmaps must already be in hand when it runs.
  await rasterizeCanvases(canvasBitmaps);

  // 0c. Current frame of every posterless, loaded <video>. Shares the canvas
  //     payload budget — both ride in `$url` — so it gets what they left.
  captureVideoFrames(videoFrames, MAX_CANVAS_TOTAL_BYTES - canvasBytesSpent());

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

    // 5. Post-pass: fetch inline SVG markup for <img src="*.svg"> and
    //    background-image: url(*.svg) so the plugin renders them as vectors.
    await inlineSvgMarkup(frame);

    // 5b. Post-pass: resolve <use href="sprite.svg#icon"> (external sprite
    //     sheets) and <use href="#icon"> pointing at hidden in-page sprite
    //     <svg> blocks — both render blank in Figma unless the referenced
    //     symbol is inlined into the SVG markup itself.
    await resolveSvgUseRefs(frame);

    // [W2W-VERIFY] === instrumentation: collect font strings from CSS ===
    const __verifyFonts = new Set<string>();
    const __walk = (n: W2WFrameNode | W2WTextNode | W2WSVGNode): void => {
      if (n.type === 'TEXT' && n.font) __verifyFonts.add(n.font);
      if (n.type === 'FRAME' && n.children) n.children.forEach(__walk);
    };
    __walk(frame);
    console.log(
      `%c[W2W-VERIFY-CONTENT] extractPage() done: ${nodeIndexCounter} text-hosts, ${__verifyFonts.size} unique font strings (from getComputedStyle)`,
      'color: #2196F3; font-weight: bold',
    );
    console.log(
      '[W2W-VERIFY-CONTENT] Font strings (first 10):',
      Array.from(__verifyFonts).slice(0, 10),
    );

    const stats = skipStats;
    skipStats = undefined;
    return { doc, frame, textHostCount: nodeIndexCounter, skipStats: stats };
  } catch (err) {
    removePreCaptureStyles();
    cleanupMarkers();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Render readiness (fonts + images)
// ---------------------------------------------------------------------------

/** Cap on images promoted and awaited — a page with hundreds of lazy images shouldn't stall. */
const IMAGE_WAIT_CAP = 50;

/**
 * Resume the lazy images the capture will include but the browser is still
 * deferring. The auto-scroll cannot reach every one — stripe.com keeps 8 in
 * horizontal carousels and 3 under a `visibility:hidden` stack — and a deferred
 * image has no `currentSrc`, so its `$url` fell back to `<img src>`, a URL the
 * browser never requested and no asset lookup can find (7 grey placeholders on
 * a stripe URL import). `loading="eager"` resumes the load; for a `<picture>`
 * the browser still picks its own `<source>`.
 *
 * Only images with a layout box — the traversal drops the rest — and at most
 * {@link IMAGE_WAIT_CAP}, in document order. The attribute is left eager: it
 * cannot unload anything, and the extractor does not record it. Never throws.
 */
export function promoteLazyImages(doc: Document = document): number {
  let promoted = 0;
  try {
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      if (promoted >= IMAGE_WAIT_CAP) break;
      if (img.getAttribute('loading') !== 'lazy') continue;
      if (img.complete && img.naturalWidth > 0) continue;
      let hasBox = false;
      try {
        const r = img.getBoundingClientRect();
        hasBox = r.width > 0 && r.height > 0;
      } catch {
        hasBox = false;
      }
      if (!hasBox) continue;
      img.setAttribute('loading', 'eager');
      promoted++;
    }
  } catch {
    /* promotion is best-effort */
  }
  return promoted;
}

/**
 * The images worth awaiting: still pending, with a src, and not still deferred
 * by `loading="lazy"` — `decode()` never settles on a deferred image, so one
 * in the set used to hold the whole wait at its cap (2.5s on every stripe.com
 * extraction, for nothing).
 */
export function imagesToAwait(doc: Document = document): HTMLImageElement[] {
  return Array.from(doc.querySelectorAll('img'))
    .filter((img) => !img.complete && img.src && img.getAttribute('loading') !== 'lazy')
    .slice(0, IMAGE_WAIT_CAP);
}

/**
 * Wait until web fonts are loaded and visible images are decoded, with hard
 * timeouts (fonts 3s, images 2.5s) so a slow resource never blocks capture.
 */
export async function waitForRenderReadiness(): Promise<void> {
  const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

  try {
    if (document.fonts && document.fonts.status !== 'loaded') {
      await Promise.race([document.fonts.ready.then(() => undefined), sleep(3000)]);
    }
  } catch {
    /* fonts API unavailable — proceed */
  }

  try {
    promoteLazyImages();
    const pending = imagesToAwait();
    if (pending.length > 0) {
      await Promise.race([
        Promise.all(pending.map((img) => img.decode().catch(() => undefined))),
        sleep(2500),
      ]);
    }
  } catch {
    /* decoding is best-effort */
  }
}

// ---------------------------------------------------------------------------
// SVG markup inlining (post-pass)
// ---------------------------------------------------------------------------

/** Walk tree, collect SVG URLs, fetch markup, stamp $svgMarkup onto nodes. */
async function inlineSvgMarkup(root: W2WFrameNode): Promise<void> {
  const nodesByUrl = new Map<string, W2WFrameNode[]>();

  const walk = (n: W2WFrameNode): void => {
    const svgUrl = extractSvgUrl(n);
    if (svgUrl) {
      const list = nodesByUrl.get(svgUrl) ?? [];
      list.push(n);
      nodesByUrl.set(svgUrl, list);
    }
    for (const child of n.children) {
      if (child.type === 'FRAME') walk(child);
    }
  };
  walk(root);

  const urls = Array.from(nodesByUrl.keys());
  if (urls.length === 0) return;

  const markups = await fetchSvgMarkupForUrls(urls, fetch.bind(window));

  for (const [url, markup] of Object.entries(markups)) {
    const targets = nodesByUrl.get(url);
    if (!targets) continue;
    for (const node of targets) node.$svgMarkup = markup;
  }
}

/**
 * Resolve `<use>` references inside captured SVG markup.
 *
 * Two dangling-reference patterns break Figma rendering:
 *   1. `<use href="/sprites.svg#icon">` — external sprite sheet
 *   2. `<use href="#icon">` where the `<symbol>` lives in a hidden in-page
 *      sprite `<svg>` (display:none, so extraction skipped it)
 * Both are fixed by cloning the referenced element into the SVG's own <defs>
 * and rewriting the href to the now-local `#id`.
 */
async function resolveSvgUseRefs(root: W2WFrameNode): Promise<void> {
  const svgNodes: W2WSVGNode[] = [];
  const walk = (n: W2WNode): void => {
    if (n.type === 'SVG') svgNodes.push(n);
    else if (n.type === 'FRAME') n.children.forEach(walk);
  };
  walk(root);
  if (svgNodes.length === 0) return;

  const spriteCache = new Map<string, Document | null>();
  const getSprite = async (url: string): Promise<Document | null> => {
    const cached = spriteCache.get(url);
    if (cached !== undefined) return cached;
    let doc: Document | null = null;
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (res.ok) {
        doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
        if (doc.querySelector('parsererror')) doc = null;
      }
    } catch {
      doc = null;
    }
    spriteCache.set(url, doc);
    return doc;
  };

  for (const node of svgNodes) {
    if (!node.svg || !node.svg.includes('<use')) continue;

    let svgDoc: Document;
    try {
      svgDoc = new DOMParser().parseFromString(node.svg, 'image/svg+xml');
    } catch {
      continue;
    }
    if (svgDoc.querySelector('parsererror')) continue;
    const svgRoot = svgDoc.documentElement;
    const uses = Array.from(svgDoc.querySelectorAll('use'));
    if (uses.length === 0) continue;

    let changed = false;
    let defs: Element | null = svgDoc.querySelector('defs');

    for (const use of uses) {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      const hashIdx = href.indexOf('#');
      if (hashIdx === -1) continue;
      const id = href.slice(hashIdx + 1);
      if (!id) continue;

      // Already resolvable inside this SVG (either originally, or inlined by
      // an earlier <use> with the same target)?
      if (svgDoc.getElementById(id)) {
        if (hashIdx > 0) {
          use.setAttribute('href', `#${id}`);
          use.removeAttribute('xlink:href');
          changed = true;
        }
        continue;
      }

      let target: Element | null = null;
      if (hashIdx === 0) {
        // In-page sprite block (usually a hidden <svg> of <symbol>s)
        target = document.getElementById(id);
      } else {
        const sprite = await getSprite(resolveUrl(href.slice(0, hashIdx)));
        target = sprite?.getElementById(id) ?? null;
      }
      if (!target) continue;

      if (!defs) {
        defs = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svgRoot.insertBefore(defs, svgRoot.firstChild);
      }
      defs.appendChild(svgDoc.importNode(target, true));
      use.setAttribute('href', `#${id}`);
      use.removeAttribute('xlink:href');
      changed = true;
    }

    if (changed) {
      node.svg = new XMLSerializer().serializeToString(svgRoot);
    }
  }
}

/**
 * Return the SVG URL for a node (if any) — from $url (img) or
 * background-image style. Returns undefined when no SVG is present.
 */
function extractSvgUrl(node: W2WFrameNode): string | undefined {
  if (node.$url && isSvgUrl(node.$url)) return node.$url;
  const bg = typeof node.styles.backgroundImage === 'string' ? node.styles.backgroundImage : '';
  if (bg && bg.includes('url(')) {
    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (m && isSvgUrl(m[1])) return resolveUrl(m[1]);
  }
  return undefined;
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
 *
 * `inScroller` marks that an ancestor is a horizontal scroller (carousel
 * viewport), which exempts this whole subtree from viewport culling — slides
 * parked left or right of the viewport are real content, not dead nodes.
 */
function traverseElement(
  el: HTMLElement,
  depth: number,
  viewportWidth: number,
  inScroller = false
): W2WFrameNode | null {
  // Depth limit
  if (depth > MAX_DEPTH) {
    noteSkip('depth', el);
    return null;
  }

  const tag = el.tagName.toLowerCase();

  // Skip non-visual tags
  if (SKIP_TAGS.has(tag)) {
    noteSkip('skipTag', el);
    return null;
  }

  // Check if SVG — handle as SVG node type (returned as frame with svg child)
  if (el instanceof SVGElement && tag === 'svg') {
    return createSVGAsFrame(el, depth);
  }

  // Visibility filtering
  if (isHidden(el)) {
    noteSkip('hidden', el);
    return null;
  }

  // Get bounding rect and computed styles
  const rect = el.getBoundingClientRect();
  const computed = getComputedStyle(el);

  // Zero-size check is deferred to AFTER children are processed (post-filter below).
  // This allows zero-size wrappers (e.g. Apple's globalnav-flyout) to pass through
  // when they contain visible child elements.
  const isZeroSize = rect.width < 1 && rect.height < 1 && tag !== 'html' && tag !== 'body';

  // Skip offscreen elements. The scroller itself is still culled when it sits
  // entirely off-page (off-canvas menus), so this test uses the INHERITED flag;
  // only its descendants get the exemption.
  if (!inScroller && isOffscreen(rect, viewportWidth)) {
    noteSkip('offscreen', el, rect);
    return null;
  }
  const insideScroller = inScroller || isHorizontalScrollContainer(el, computed);

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
    // Poster first; the pre-pass frame only when the page has none.
    $url = (el as HTMLVideoElement).poster || videoFrames.get(el as HTMLVideoElement);
  } else if (tag === 'canvas') {
    // Exported by the pre-pass in extractPage(); absent when the canvas paints
    // nothing, or is tainted and cannot be read back.
    $url = canvasBitmaps.get(el as HTMLCanvasElement);
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
        const childNode = traverseElement(child, depth, viewportWidth, insideScroller);
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
          const childNode = traverseElement(childEl, depth + 1, viewportWidth, insideScroller);
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

  // List marker synthesis for <ol>/<ul>: compute "1.", "2.", "•", … from
  // list-style-type + start/reversed/<li value=> and prepend each <li>'s
  // children with a __w2w-pseudo-marker wrapper (pixel-accurate geometry via
  // DOM injection). Handles the vast majority of real-world lists at the
  // container level. Orphan <li> (no ol/ul parent) is handled at the <li>
  // level below.
  if (tag === 'ol' || tag === 'ul') {
    attachMarkersToListChildren(el, tag, children);
  } else if (
    tag === 'li' &&
    el.parentElement &&
    el.parentElement.tagName.toLowerCase() !== 'ol' &&
    el.parentElement.tagName.toLowerCase() !== 'ul'
  ) {
    attachMarkerToOrphanLi(el, computed, children);
  }

  // Post-filter: skip zero-size elements ONLY if they produced no valid children.
  // This preserves zero-size wrappers that contain visible child elements
  // (e.g. Apple globalnav uses 3 levels of 0x0 wrappers around visible nav items).
  if (isZeroSize && children.length === 0) {
    const hasDirectText = el.textContent?.trim();
    const isInline = computed.display === 'inline' || computed.display === 'inline-block';
    if (!hasDirectText || !isInline) {
      noteSkip('zeroSize', el, rect);
      return null;
    }
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

  // white-space: pre / pre-wrap / break-spaces render internal spacing as-is;
  // collapsing `\s+` there flattens code blocks and ASCII layouts. Newlines
  // are still dropped per extracted value because line splitting below already
  // emits one TEXT node per visual line.
  //
  // Whitespace runs containing U+00A0 (nbsp) collapse to nbsp, not a plain
  // space — "MacBook Air" must stay unbreakable in Figma, otherwise the
  // headline wraps where the browser never would.
  const preserveSpaces = /^(pre|break-spaces)/.test(parentStyle.whiteSpace || '');
  const collapse = (t: string): string =>
    t.replace(/\s+/g, (m) => (m.includes(' ') ? ' ' : ' '));
  const normalize = (t: string): string =>
    preserveSpaces
      ? t.replace(/[\r\n]+/g, ' ').replace(/^[ \t]+$/, '')
      : collapse(t).trim();

  // Inline-flow boundary spaces: `<p>shop: <a>Store</a> or <a>web</a></p>`
  // splits into text runs whose leading/trailing spaces are significant —
  // trimming them glues the runs to the neighboring links ("shop:Store orweb").
  // Keep ONE space at a boundary when the raw run had whitespace there AND an
  // element sibling exists on that side (spaces at true line edges collapse,
  // matching CSS semantics).
  const keepBoundarySpaces = (value: string, raw: string): string => {
    if (preserveSpaces || !value) return value;
    const prevIsElement = textNode.previousSibling?.nodeType === Node.ELEMENT_NODE;
    const nextIsElement = textNode.nextSibling?.nodeType === Node.ELEMENT_NODE;
    const lead = prevIsElement && /^\s/.test(raw) ? ' ' : '';
    const trail = nextIsElement && /\s$/.test(raw) ? ' ' : '';
    return lead + value + trail;
  };

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
      value: keepBoundarySpaces(normalize(text), text),
      font,
    }];
  }

  // Multiple lines — split text by line using character-level range measurement
  const results: W2WTextNode[] = [];
  const textLength = text.length;
  let lineStart = 0;
  let prevTop = -Infinity;

  // A character outside the BMP (emoji, rare CJK) occupies TWO UTF-16 code
  // units — a high surrogate followed by a low one — that render as a single
  // glyph. Range offsets and String.slice() both count code units, so a line
  // boundary landing between the halves would cut the glyph in two and leave a
  // lone surrogate at the end of one line and the start of the next (both
  // render as U+FFFD). A browser never wraps inside a pair, so the low half is
  // skipped entirely below: it is never treated as a boundary candidate, and
  // the high half is measured across both units so the rect covers the glyph.
  const isHighSurrogate = (code: number): boolean => (code & 0xfc00) === 0xd800;
  const isLowSurrogate = (code: number): boolean => (code & 0xfc00) === 0xdc00;

  for (let i = 0; i <= textLength; i++) {
    // Second half of a surrogate pair — not a legal break point, and its own
    // rect is meaningless. Skip without touching prevTop, so the next index
    // still compares against the glyph's real top.
    if (
      i > 0 && i < textLength &&
      isLowSurrogate(text.charCodeAt(i)) &&
      isHighSurrogate(text.charCodeAt(i - 1))
    ) {
      continue;
    }

    const charRange = document.createRange();
    charRange.setStart(textNode, Math.min(i, textLength));
    // Measure the whole glyph when this index starts a surrogate pair.
    const charEnd =
      i < textLength && isHighSurrogate(text.charCodeAt(i)) ? i + 2 : i + 1;
    charRange.setEnd(textNode, Math.min(charEnd, textLength));

    let charTop: number;
    if (i < textLength) {
      const charRect = charRange.getBoundingClientRect();
      charTop = Math.round(charRect.top);
    } else {
      charTop = prevTop + 100; // Force flush last line
    }

    // Detect new visual line (Y position jumped)
    if (charTop !== prevTop && prevTop !== -Infinity && i > lineStart) {
      const lineText = normalize(text.slice(lineStart, i));
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
      value: keepBoundarySpaces(normalize(text), text),
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
    if (w < 1 && h < 1) {
      noteSkip('svgZero', svgEl, rect);
      return null;
    }
  }

  const x = round(rect.left);
  const y = round(rect.top + window.scrollY);

  // Clone to avoid modifying the live DOM
  const clone = svgEl.cloneNode(true) as SVGElement;
  // Remove any W2W markers from clone
  clone.removeAttribute('data-w2w-idx');

  // Bake computed fill/stroke into the clone: icons painted purely by page
  // CSS (`.icon svg { stroke: … }`) otherwise reach Figma as attribute-less
  // markup and render with the SVG defaults — black fill, no stroke.
  bakeSvgPresentation(svgEl, clone);

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
    if (w < 1 && h < 1) {
      noteSkip('svgZero', svgEl, rect);
      return null;
    }
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

  // Single source of truth: visual presence OR text presence decides rendering.
  // Empty content ("") + background/border/dimensions is a valid decorative pseudo
  // (e.g. Apple footer pipe separators) and must not be skipped.
  const decision = shouldRenderPseudo({
    content: style.content,
    display: style.display,
    visibility: style.visibility,
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    borderWidth: style.borderWidth,
    borderStyle: style.borderStyle,
    outlineWidth: style.outlineWidth,
    outlineStyle: style.outlineStyle,
    boxShadow: style.boxShadow,
    width: style.width,
    height: style.height,
  });

  if (!decision.render) return null;

  // Create wrapper span
  const span = document.createElement('span');
  span.className = pseudo === '::before' ? '__w2w-pseudo-before' : '__w2w-pseudo-after';

  if (decision.hasText) {
    span.textContent = decision.textValue;
  }

  // Copy key computed styles from pseudo-element to span so the injected node
  // paints with the same visual properties the browser gave to the pseudo.
  const stylesToCopy = [
    'display', 'position', 'width', 'height', 'minWidth', 'minHeight',
    'top', 'right', 'bottom', 'left',
    // z-index rides along with the other positioning properties: without it the
    // span reports `auto`, the renderer reads that as zero, and a decorative
    // overlay loses to any sibling with a positive z-index — chroniclehq.com's
    // carousel edge-fades are `z-index: 99` over a `z-index: 1` swiper and were
    // painted underneath the cards. It cannot move the span: z-index affects
    // paint order only, never layout, so the measured rect is unchanged.
    'zIndex',
    'margin', 'padding',
    'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight', 'color',
    'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
    'backgroundRepeat', 'backgroundOrigin', 'backgroundClip',
    'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
    'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset',
    'boxShadow',
    'opacity', 'verticalAlign',
    'boxSizing', 'overflow',
    'transform', 'transformOrigin',
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
// List marker synthesis
// ---------------------------------------------------------------------------

/**
 * Compute markers for an <ol>/<ul> container and prepend a
 * __w2w-pseudo-marker wrapper to each direct <li> child found in
 * `containerChildren`. Measurement of marker geometry uses temporary DOM
 * injection (same pattern as injectPseudoSpan).
 */
function attachMarkersToListChildren(
  listEl: HTMLElement,
  listTag: 'ol' | 'ul',
  containerChildren: W2WNode[],
): void {
  // Walk containerChildren and pair each <li> with its DOM element by
  // traversing in DOM order. We only pair direct-child <li> elements of the
  // list container — nested lists are handled by their own recursion.
  const domLiElements: HTMLElement[] = [];
  for (const domChild of Array.from(listEl.children)) {
    if (domChild instanceof HTMLElement && domChild.tagName.toLowerCase() === 'li') {
      // Only synthesize markers for li elements with display: list-item.
      // block/flex/grid/inline-block li elements don't get browser markers.
      const liDisplay = getComputedStyle(domChild).display;
      if (liDisplay === 'list-item') {
        domLiElements.push(domChild);
      }
    }
  }
  if (domLiElements.length === 0) return;

  const firstLiStyle = getComputedStyle(domLiElements[0]);
  const listStyleType = firstLiStyle.listStyleType || (listTag === 'ol' ? 'decimal' : undefined);
  if (!listStyleType || listStyleType === 'none') return;

  const itemSpecs = domLiElements.map((li) => ({
    valueAttr: li.getAttribute('value') ?? undefined,
  }));
  const startAttr = listEl.getAttribute('start') ?? undefined;
  const reversed = listEl.hasAttribute('reversed');

  const markers = computeListMarkers({
    tag: listTag,
    listStyleType,
    startAttr,
    reversed,
    items: itemSpecs,
  });

  // Find W2W <li> frames that correspond to the DOM lis (by DOM-order match).
  // containerChildren may include pseudo-before at position 0; skip non-li.
  const w2wLiFrames: W2WFrameNode[] = [];
  for (const c of containerChildren) {
    if (c.type === 'FRAME' && c.tag === 'li') w2wLiFrames.push(c);
  }

  const pairCount = Math.min(domLiElements.length, w2wLiFrames.length, markers.length);
  for (let i = 0; i < pairCount; i++) {
    injectMarkerIntoLi(domLiElements[i], w2wLiFrames[i], markers[i]);
  }
}

/**
 * Orphan <li> — a list item with no <ol>/<ul> parent. Synthesize a single
 * marker at index=0 using the li's own list-style-type.
 */
function attachMarkerToOrphanLi(
  liEl: HTMLElement,
  liComputed: CSSStyleDeclaration,
  containerChildren: W2WNode[],
): void {
  if (liComputed.display !== 'list-item') return;
  const listStyleType = liComputed.listStyleType;
  if (!listStyleType || listStyleType === 'none') return;
  const markerText = formatListMarker({ listStyleType, index: 0 });
  if (!markerText) return;
  // Orphan li's container is the li itself — the W2W frame isn't built yet,
  // we have its children array directly. Synthesize marker and unshift it.
  const wrapper = measureAndBuildMarker(liEl, markerText);
  if (wrapper) containerChildren.unshift(wrapper);
}

/**
 * Inject a temporary <span> into the given <li>, measure its geometry, build
 * a __w2w-pseudo-marker wrapper node, and prepend it to the W2W li's
 * children.
 */
function injectMarkerIntoLi(
  liEl: HTMLElement,
  liFrame: W2WFrameNode,
  markerText: string,
): void {
  const wrapper = measureAndBuildMarker(liEl, markerText);
  if (wrapper) liFrame.children.unshift(wrapper);
}

/**
 * Temporarily inject a span inside the <li> to measure the marker's
 * pixel-accurate box, then return a __w2w-pseudo-marker wrapper W2W frame.
 * The span is absolutely positioned so it does not disturb sibling layout.
 */
function measureAndBuildMarker(
  liEl: HTMLElement,
  markerText: string,
): W2WFrameNode | null {
  // Read marker typography from the real ::marker pseudo; fall back to li.
  // The ::marker pseudo is a legitimate CSS selector — sites (e.g. Apple.com
  // footer footnotes) frequently style it differently from the <li> itself.
  const liComputed = getComputedStyle(liEl);
  let markerFontFamily = liComputed.fontFamily;
  let markerFontWeight = liComputed.fontWeight;
  let markerFontSize = liComputed.fontSize;
  let markerLineHeight = liComputed.lineHeight;
  let markerLetterSpacing = liComputed.letterSpacing;
  let markerFontStyle = liComputed.fontStyle;
  let markerColor: string | undefined;
  try {
    const pseudo = getComputedStyle(liEl, '::marker');
    if (pseudo.fontFamily) markerFontFamily = pseudo.fontFamily;
    if (pseudo.fontWeight) markerFontWeight = pseudo.fontWeight;
    if (pseudo.fontSize) markerFontSize = pseudo.fontSize;
    if (pseudo.lineHeight) markerLineHeight = pseudo.lineHeight;
    if (pseudo.letterSpacing) markerLetterSpacing = pseudo.letterSpacing;
    if (pseudo.fontStyle) markerFontStyle = pseudo.fontStyle;
    if (pseudo.color && pseudo.color !== 'rgba(0, 0, 0, 0)') {
      markerColor = pseudo.color;
    }
  } catch {
    /* ignore — not all browsers expose ::marker */
  }

  // Inject measurement span
  const span = document.createElement('span');
  span.className = '__w2w-pseudo-marker';
  span.textContent = markerText;
  span.style.position = 'absolute';
  span.style.right = '100%';
  span.style.top = '0';
  span.style.marginRight = '0.3em';
  span.style.whiteSpace = 'nowrap';
  span.style.pointerEvents = 'none';
  span.style.fontFamily = markerFontFamily;
  span.style.fontWeight = markerFontWeight;
  span.style.fontSize = markerFontSize;
  // line-height + letter-spacing affect the measured rect height/width.
  if (markerLineHeight) span.style.lineHeight = markerLineHeight;
  if (markerLetterSpacing) span.style.letterSpacing = markerLetterSpacing;
  if (markerFontStyle && markerFontStyle !== 'normal') span.style.fontStyle = markerFontStyle;
  if (markerColor) span.style.color = markerColor;

  // Ensure li is a positioning context so right:100% resolves against its box
  const prevPosition = liEl.style.position;
  const liPositionResolved = getComputedStyle(liEl).position;
  if (liPositionResolved === 'static') liEl.style.position = 'relative';
  liEl.insertBefore(span, liEl.firstChild);

  const rect = span.getBoundingClientRect();
  const fontString = buildFontString(cleanFontFamily(markerFontFamily), markerFontWeight);

  // Clean up injection before anything else can throw
  span.remove();
  if (liPositionResolved === 'static') liEl.style.position = prevPosition;

  // Fallback geometry when the browser returned a zero-size rect
  const fontSizePx = parseFloat(markerFontSize) || 12;
  const measuredW = rect.width;
  const measuredH = rect.height;
  const liRect = liEl.getBoundingClientRect();
  const width = measuredW > 0 ? round(measuredW) : Math.max(Math.round(markerText.length * fontSizePx * 0.6), 8);
  const height = measuredH > 0 ? round(measuredH) : Math.round(fontSizePx * 1.2);
  const x = measuredW > 0 ? round(rect.left) : round(liRect.left - width - 4);
  const y = measuredW > 0 ? round(rect.top + window.scrollY) : round(liRect.top + window.scrollY);

  return buildMarkerWrapperNode({
    markerText,
    x,
    y,
    width,
    height,
    font: fontString,
    color: markerColor,
    // These MUST be set on the wrapper's styles — css-converter reads
    // fontSize from parentStyles.fontSize, not from the font string.
    fontSize: markerFontSize || undefined,
    fontFamily: markerFontFamily || undefined,
    fontWeight: markerFontWeight || undefined,
    lineHeight: markerLineHeight || undefined,
    letterSpacing: markerLetterSpacing || undefined,
    fontStyle: markerFontStyle || undefined,
    pseudo: '::marker',
  });
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

  // Reversible scroll reveal: the shared auto-scroll saw this element visible,
  // but the page faded it out again before we read it (Webflow IX2 / GSAP).
  // Emit the revealed state — its end opacity (1, the default) and the
  // transform it had while shown.
  const revealTransform = el.getAttribute(REVEAL_MARKER_ATTR);
  // Near-zero too: the reveal may still be fading out (vaayu.tech footer 0.0001).
  if (
    revealTransform !== null &&
    styles.opacity !== undefined &&
    styles.opacity < REVEAL_NEAR_ZERO_OPACITY
  ) {
    delete styles.opacity;
    if (revealTransform === '' || revealTransform === 'none') delete styles.transform;
    else styles.transform = revealTransform;
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
  // A subtree root has no traversal history, so recover the scroller flag from
  // its ancestors once (a hovered card inside a carousel must not have its
  // off-viewport parts culled). Full walk — it runs once per re-capture.
  let inScroller = false;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (isHorizontalScrollContainer(p, getComputedStyle(p))) {
      inScroller = true;
      break;
    }
  }
  return traverseElement(el, 0, window.innerWidth, inScroller);
}

/**
 * Remove data-w2w-idx markers from the page.
 * Called by content script message handler after service worker finishes font collection.
 */
export function cleanupMarkers(): void {
  const marked = document.querySelectorAll('[data-w2w-idx]');
  marked.forEach(el => el.removeAttribute('data-w2w-idx'));
  document.querySelectorAll(`[${REVEAL_MARKER_ATTR}]`).forEach(el => el.removeAttribute(REVEAL_MARKER_ATTR));
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

  // DIAGNOSTIC counters — logged at the end so we can see where selectors
  // are being lost on pages like apple.com that use cross-origin CDN CSS.
  let sheetsTotal = 0;
  let sheetsBlocked = 0;
  let sheetsOk = 0;
  let rulesSeen = 0;
  let hoverCandidates = 0;
  let splitFails = 0;
  let queryFails = 0;
  const queryThrows = 0;
  let dedupSkips = 0;

  function processRule(rule: CSSRule): void {
    if (results.length >= MAX) return;

    rulesSeen++;

    // Recurse into nested rules (@media, @supports, @layer, @container, and
    // under CSS Nesting every CSSStyleRule too — Chrome 120+ exposes `.cssRules`
    // on plain style rules even when they have no nested selectors, so we must
    // NOT early-return here: the outer rule may ALSO carry a `:hover` selector
    // that we still need to parse below.
    const maybeRules = (rule as CSSGroupingRule).cssRules;
    if (maybeRules && typeof maybeRules[Symbol.iterator] === 'function') {
      try {
        for (const inner of Array.from(maybeRules)) processRule(inner);
      } catch {
        // Some nested rules may throw on access
      }
      // Fall through to check this rule's own selectorText (CSS Nesting).
    }

    const styleRule = rule as CSSStyleRule;
    if (typeof styleRule.selectorText !== 'string') return;

    const selectors = parseHoverSelectorsFromCssText(styleRule.selectorText);
    hoverCandidates += selectors.length;
    for (const sel of selectors) {
      if (results.length >= MAX) return;
      const split = splitHoverSelector(sel);
      if (!split) { splitFails++; continue; }

      // Resolve effective trigger. If the full trigger doesn't match (common
      // on state-gated selectors like
      // `#globalnav.globalnav-with-menu-open .link` where the state class is
      // absent at capture time), fall back to the rightmost compound alone.
      let effectiveTrigger = split.trigger;
      let matched = false;
      try {
        matched = !!document.querySelector(effectiveTrigger);
      } catch {
        // Invalid selector — try fallback below.
      }

      if (!matched) {
        const fallback = extractRightmostCompound(split.trigger);
        if (fallback && fallback !== split.trigger) {
          try {
            if (document.querySelector(fallback)) {
              effectiveTrigger = fallback;
              matched = true;
            }
          } catch {
            // Ignore — fallback also invalid.
          }
        }
      }

      if (!matched) {
        // Distinguish "no match in DOM" from "both selectors threw".
        queryFails++;
        continue;
      }

      if (seen.has(effectiveTrigger)) { dedupSkips++; continue; }
      seen.add(effectiveTrigger);
      results.push({ trigger: effectiveTrigger, target: split.target });
    }
  }

  const sheets = Array.from(document.styleSheets);
  sheetsTotal = sheets.length;

  for (const sheet of sheets) {
    try {
      const rules = sheet.cssRules; // throws SecurityError on cross-origin
      if (!rules) continue;
      sheetsOk++;
      for (const rule of Array.from(rules)) {
        if (results.length >= MAX) break;
        processRule(rule);
      }
    } catch {
      sheetsBlocked++;
    }
    if (results.length >= MAX) break;
  }

  console.log(
    `[W2W-HOVER-DIAG] sheets=${sheetsTotal} ok=${sheetsOk} cors-blocked=${sheetsBlocked} | ` +
    `rules=${rulesSeen} hover-candidates=${hoverCandidates} split-fails=${splitFails} | ` +
    `query-fails=${queryFails} query-throws=${queryThrows} dedup=${dedupSkips} | results=${results.length}`
  );

  return results;
}
