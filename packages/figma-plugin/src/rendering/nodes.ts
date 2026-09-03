/**
 * Frame and node creation for Figma
 * Handles recursive node creation, auto layout, and wireframe frames
 */

import type {
  WireframeNode,
  WireframeFrame,
  RenderContext,
  CssTransform,
} from "../types";
import { logger } from "../utils/logger";
import * as perf from "../utils/perf";
import { loadFontCached } from "./fontLoader";
import { registerAnchorNode } from "./anchorLinks";
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
import { parseInsetClipPath, insetClips, intersectRadii } from "./clipPath";
import {
  applyCornerRadii,
  getCornerRadii,
  inferAxisConstraint,
  cssJustifyToFigma,
  cssAlignToFigma,
  cssAlignSelfToFigma,
  resolveChildLayoutAlign,
  applyTextAlignFallback,
  needsMarginWrapper,
  createMarginWrapper,
  cssAlignToGridChild,
  cssJustifyToGridChild,
  inferGridChildAlign,
  growFitsContainer,
} from "./layout";
import {
  convertFillsToPaints,
  convertStrokesToFigma,
  convertEffectsToFigma,
  mapCSSBlendMode,
} from "./fills";
import { recordWarning } from "./diagnostics";
import {
  linkEffectStyleIfAvailable,
  linkFillStyleIfAvailable,
  linkGridStyleIfAvailable,
  linkStrokeStyleIfAvailable,
} from "./styles";
import { createTextNode, createTextWithBackground, rescaleTextMetrics } from "./text";
import { enforceMeasuredLineCount } from "./textLineGuard";
import { createPlaceholder } from "./placeholders";
import { createRealImage } from "./realImages";
import { extractHostname } from "./hostname";
// wireframeLines import removed — fontMode "lines" uses FILLR font via text.ts

// ============================================================================
// Blend Mode Mapping (CSS mix-blend-mode → Figma BlendMode)
// ============================================================================

// The map itself lives in fills.ts — paints need it for
// `background-blend-mode`, and nodes.ts already imports from fills.ts, so
// keeping it there avoids a circular import. Re-exported for callers/tests
// that have always imported it from here.
export { mapCSSBlendMode };

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
  if (!__W2W_DEV_LOG__) return applyFillToFrameInner(frame, color, context, tag, className);
  return perf.timed("node.fills", () =>
    applyFillToFrameInner(frame, color, context, tag, className)
  );
}

async function applyFillToFrameInner(
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
  if (!__W2W_DEV_LOG__) return applyStrokeToFrameInner(frame, color, strokeWeight, context);
  return perf.timed("node.fills", () =>
    applyStrokeToFrameInner(frame, color, strokeWeight, context)
  );
}

async function applyStrokeToFrameInner(
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

/**
 * Can these children's captured rects be reproduced by a VERTICAL stack?
 *
 * The VERTICAL fallback for block containers (layoutMode "NONE") is only an
 * assumption — h2d derives the axis from measured geometry (`U8`) and emits NO
 * auto-layout when the rects contradict it. Overlapping children (badge over
 * avatar, layered hero sections) and side-by-side children (floats the
 * converter's inference missed) restack into a column if we force VERTICAL, so
 * such containers must stay plain frames with captured x/y instead.
 *
 * Out-of-flow (absolute/fixed) and zero-size children don't participate in the
 * stack and are ignored. 0.51px is the global geometry epsilon (h2d's `fe`).
 */
/**
 * Hide ABSOLUTE-positioned children while auto-layout props are applied to
 * their parent — port of h2d's `Eh` (main-rawbundle.beautified.js:17623-17626).
 *
 * Figma's hug sizing still measures absolutely-positioned children while
 * layout props are being written, so the parent computes the wrong size.
 * Snapshot each absolute child's x/y/size/visibility, hide it, run the prop
 * application, then restore everything — hidden children are ignored by
 * auto-layout, so the measurement only sees the real flow content.
 */
export function withAbsoluteChildrenHidden(
  frame: FrameNode,
  fn: () => void
): void {
  const saved: Array<{
    node: SceneNode;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
  }> = [];
  const kids: readonly SceneNode[] = "children" in frame ? frame.children : [];
  for (const c of kids) {
    if (
      "layoutPositioning" in c &&
      (c as FrameNode).layoutPositioning === "ABSOLUTE"
    ) {
      saved.push({
        node: c,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        visible: c.visible,
      });
      c.visible = false;
    }
  }
  try {
    fn();
  } finally {
    for (const s of saved) {
      s.node.visible = s.visible;
      s.node.x = s.x;
      s.node.y = s.y;
      if (s.node.width !== s.width || s.node.height !== s.height) {
        const resizable = s.node as SceneNode & {
          resizeWithoutConstraints?: (w: number, h: number) => void;
          resize?: (w: number, h: number) => void;
        };
        if (typeof resizable.resizeWithoutConstraints === "function") {
          resizable.resizeWithoutConstraints(s.width, s.height);
        } else if (typeof resizable.resize === "function") {
          resizable.resize(s.width, s.height);
        }
      }
    }
  }
}

/**
 * Post-layout size guard — port of h2d's `nS`
 * (main-rawbundle.beautified.js:17694-17698).
 *
 * After auto-layout is applied, a frame can settle narrower/shorter than the
 * size captured from the browser (hug sizing measuring less content than the
 * page really had). Nothing detected that, so containers silently shrank —
 * the most common "the layout collapsed" complaint. When the frame came out
 * smaller by more than the 10px tolerance, pin the counter axis with
 * `minWidth` (VERTICAL) / `minHeight` (HORIZONTAL) at the captured value.
 * Never lowers a larger CSS-derived min already on the frame.
 */
export function applyCapturedMinSize(
  frame: FrameNode,
  capturedWidth: number,
  capturedHeight: number
): void {
  if (frame.layoutMode === "VERTICAL" && frame.width + 10 <= capturedWidth) {
    frame.minWidth = Math.max(frame.minWidth ?? 0, capturedWidth);
  } else if (
    frame.layoutMode === "HORIZONTAL" &&
    frame.height + 10 <= capturedHeight
  ) {
    frame.minHeight = Math.max(frame.minHeight ?? 0, capturedHeight);
  }
}

/**
 * Do the captured children all sit inside a single horizontal band?
 *
 * Figma's HORIZONTAL auto-layout has one row unless `layoutWrap: WRAP` applies.
 * When the browser broke the children across several rows, packing them onto
 * one line squeezes every child and strands the captured height (stripe.com's
 * bento: 1510px of 1834px left empty).
 *
 * This is h2d's `U8` horizontal test: every in-flow child must fall within the
 * TALLEST child's vertical span. Testing against the tallest child — rather
 * than pairwise overlap — keeps legitimate rows whose items differ in height,
 * and only rejects content that genuinely wrapped.
 */
/**
 * Can Figma's `layoutWrap: WRAP` actually reproduce the captured rows?
 *
 * WRAP packs children onto lines greedily against the container width, so a
 * child WIDER than the container forces a break the browser never made and
 * every following row shifts. stripe.com's bento row captured 1230px while its
 * `width: 100%` card measures 1232 — two pixels that turned the page's
 * 2 + 3 + 1 grid into 1 + 2 + 2 + 1 with 692px of overflow.
 *
 * When the widths cannot work out, absolute placement from the captured x/y is
 * the honest answer (and the one h2d gives), regardless of where the 2px went.
 */
export function wrapFitsChildren(
  width: number,
  children: WireframeNode[]
): boolean {
  return children.every(
    (c) =>
      c.position === "absolute" ||
      c.position === "fixed" ||
      c.width <= width + 0.51
  );
}

export function geometryFormsSingleRow(children: WireframeNode[]): boolean {
  const flow = children.filter(
    (c) =>
      c.position !== "absolute" &&
      c.position !== "fixed" &&
      c.width > 0.5 &&
      c.height > 0.5
  );
  if (flow.length < 2) return true;

  const tallest = flow.reduce((best, c) => (c.height > best.height ? c : best));
  const top = tallest.y;
  const bottom = tallest.y + tallest.height;
  return flow.every(
    (c) => c.y >= top - 0.51 && c.y + c.height <= bottom + 0.51
  );
}

/**
 * Resolve `growFitsContainer` for one already-configured auto-layout frame.
 *
 * Returns undefined when the question does not apply (no horizontal/vertical
 * auto-layout), which callers read as "allowed".
 */
function evaluateGrowEligibility(
  frame: FrameNode,
  children: WireframeNode[]
): boolean | undefined {
  const horizontal = frame.layoutMode === "HORIZONTAL";
  if (!horizontal && frame.layoutMode !== "VERTICAL") return undefined;

  const flow = children.filter(
    (c) => c.position !== "absolute" && c.position !== "fixed"
  );
  if (flow.length === 0) return undefined;

  const growIndices: number[] = [];
  flow.forEach((c, i) => {
    if (c.layoutGrow === 1) growIndices.push(i);
  });
  if (growIndices.length === 0) return undefined;

  return growFitsContainer({
    parentLength: horizontal ? frame.width : frame.height,
    paddingStart: horizontal ? frame.paddingLeft : frame.paddingTop,
    paddingEnd: horizontal ? frame.paddingRight : frame.paddingBottom,
    childLengths: flow.map((c) => (horizontal ? c.width : c.height)),
    itemSpacing: frame.itemSpacing || 0,
    growIndices,
  });
}

export function geometrySupportsVerticalStack(
  children: WireframeNode[]
): boolean {
  const flow = children
    .filter(
      (c) =>
        c.position !== "absolute" &&
        c.position !== "fixed" &&
        c.width > 0.5 &&
        c.height > 0.5
    )
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < flow.length; i++) {
    if (flow[i].y < flow[i - 1].y + flow[i - 1].height - 0.51) return false;
  }
  return true;
}

// ============================================================================
// Recursive Node Creation
// ============================================================================

/**
 * Renderer recursion cap. MUST be ≥ the extractor's MAX_DEPTH (30, see
 * browser-extension content/extractor.ts) plus headroom for converter-added
 * wrapper levels (pseudo-element wrappers, margin wrappers). Kept exported so
 * tests can assert the invariant against the capture-side cap.
 */
export const MAX_RENDER_DEPTH = 40;

/**
 * Record a child subtree lost to a swallowed render exception. The per-child
 * try/catch keeps one bad node from aborting the whole import, but in prod
 * the logger is a no-op — without this record, a partially-lost import is
 * indistinguishable from a perfect one. main.ts surfaces the count via
 * figma.notify after rendering.
 *
 * Feeds two sinks: the legacy `droppedNodes` list (unchanged shape) and the
 * categorised warning report, where a lost subtree is the `fatal` bucket.
 * The node itself never came into existence, so there is no id to link to —
 * the layer name is all the report can offer here.
 */
export function recordDroppedNode(
  context: RenderContext,
  name: string | undefined,
  err: unknown
): void {
  if (!context.renderStats) return;
  const layerName = name || "(unnamed)";
  const reason = err instanceof Error ? err.message : String(err);
  if (!context.renderStats.droppedNodes) context.renderStats.droppedNodes = [];
  context.renderStats.droppedNodes.push({ name: layerName, error: reason });
  recordWarning(context, {
    category: "fatal",
    message: `Could not be rendered — skipped (${reason})`,
    layerName,
  });
}

/**
 * Apply the box decorations every node type shares, regardless of which
 * creation branch produced it.
 *
 * The text / image / placeholder branches return early, before the frame
 * path's decoration block — so an `<img>` with `opacity: .6`, a
 * `mix-blend-mode`, a hover-reveal `visible=false`, or a `position: sticky`
 * logo silently lost all of it. Only properties that are legal on every
 * SceneNode live here; strokes and effects are frame-only and applied by
 * {@link applyPaintDecorations}.
 */
export function applySharedDecorations(
  target: SceneNode | null,
  node: WireframeNode,
  context: RenderContext
): void {
  if (!__W2W_DEV_LOG__) return applySharedDecorationsInner(target, node, context);
  perf.timedSync("node.decorations", () =>
    applySharedDecorationsInner(target, node, context)
  );
}

function applySharedDecorationsInner(
  target: SceneNode | null,
  node: WireframeNode,
  context: RenderContext
): void {
  if (!target) return;
  // Slice/Widget nodes have no opacity/blendMode and the render path never
  // creates one — narrow to the shape we actually set.
  const paintable = target as SceneNode & { opacity: number; blendMode: BlendMode };
  // Opacity — skip in plugin colors mode (flat wireframes)
  if (
    context.colorMode !== "plugin" &&
    typeof node.opacity === "number" &&
    node.opacity < 1 &&
    node.opacity > 0
  ) {
    paintable.opacity = Math.max(0, Math.min(1, node.opacity));
  }

  // CSS mix-blend-mode → Figma BlendMode
  if (node.blendMode) {
    const figmaBlendMode = mapCSSBlendMode(node.blendMode);
    if (figmaBlendMode) {
      paintable.blendMode = figmaBlendMode;
    }
  }

  // Hidden in default state (hover-variant rendering)
  if (node.isHiddenInDefault) {
    target.visible = false;
  }

  // CSS aspect-ratio → lock the proportions for later manual resizing.
  if (node.constrainProportions) {
    const proportional = target as SceneNode & { constrainProportions?: boolean };
    if (typeof proportional.constrainProportions === "boolean") {
      proportional.constrainProportions = true;
    }
  }

  // position:fixed / sticky marker — createWireframeFrame re-parents these
  // to the root frame and sets numberOfFixedChildren.
  if (
    (node.position === "fixed" || node.position === "sticky") &&
    !node.isHiddenInDefault &&
    !(typeof node.opacity === "number" && node.opacity === 0)
  ) {
    try {
      target.setPluginData("w2w_position_fixed", "1");
      // Which of the two it was decides whether promoting it leaves a hole in
      // the flow: `sticky` occupied space and needs a spacer, `fixed` never
      // did. See `insertFixedSpacer`'s call site.
      target.setPluginData("w2w_css_position", node.position);
      if (typeof node.cssTop === "number" && !isNaN(node.cssTop)) {
        target.setPluginData("w2w_css_top", String(node.cssTop));
      }
      if (typeof node.cssLeft === "number" && !isNaN(node.cssLeft)) {
        target.setPluginData("w2w_css_left", String(node.cssLeft));
      }
    } catch {
      // setPluginData may not be available in mock environments
    }
  }
}

/**
 * Apply strokes and effects to an image / placeholder frame.
 *
 * These branches never reached the frame path's stroke/effect blocks, so a
 * bordered `<img>` rendered borderless and a card image lost its
 * box-shadow. Text nodes are deliberately excluded — Figma strokes on a
 * TEXT node outline the glyphs, which is not what a CSS border means.
 */
export function applyPaintDecorations(
  frame: FrameNode,
  node: WireframeNode,
  context: RenderContext
): void {
  if (!__W2W_DEV_LOG__) return applyPaintDecorationsInner(frame, node, context);
  perf.timedSync("node.decorations", () =>
    applyPaintDecorationsInner(frame, node, context)
  );
}

function applyPaintDecorationsInner(
  frame: FrameNode,
  node: WireframeNode,
  context: RenderContext
): void {
  if (node.strokes && node.strokes.length > 0) {
    const { paints, weight, individualWeights, style } = convertStrokesToFigma(
      node.strokes,
      context,
      node.width,
      node.height
    );
    if (paints.length > 0) {
      frame.strokes = paints;
      frame.strokeWeight = weight;
      if (individualWeights) {
        frame.strokeTopWeight = individualWeights.top;
        frame.strokeRightWeight = individualWeights.right;
        frame.strokeBottomWeight = individualWeights.bottom;
        frame.strokeLeftWeight = individualWeights.left;
      }
      frame.dashPattern = dashPatternForStyle(style, weight);
    }
  }

  if (node.effects && node.effects.length > 0) {
    const figmaEffects = convertEffectsToFigma(node.effects, context);
    if (figmaEffects.length > 0) {
      frame.effects = figmaEffects;
    }
  }
}

/**
 * Whether a CSS overflow value clips its box in Figma terms.
 *
 * Also the correct default for SYNTHETIC wrapper frames: `figma.createFrame()`
 * starts with `clipsContent = true`, so a wrapper we invent (text padding
 * box, text-with-background) clipped glyph descenders and outside shadows
 * that the browser painted. Passing the node's own overflow — `undefined`
 * for the common case — turns that off.
 */
/**
 * Attach an ON_CLICK → URL prototype reaction, MERGING with whatever the node
 * already carries. hoverConsolidation puts ON_HOVER reactions on some of these
 * same nodes; assigning would silently delete the hover prototype.
 */
export async function attachLinkReaction(
  target: SceneNode,
  url: string,
): Promise<void> {
  if (!__W2W_DEV_LOG__) return attachLinkReactionInner(target, url);
  return perf.timed("node.link", () => attachLinkReactionInner(target, url));
}

async function attachLinkReactionInner(
  target: SceneNode,
  url: string,
): Promise<void> {
  try {
    const holder = target as unknown as {
      reactions?: readonly Reaction[];
      setReactionsAsync?: (r: Reaction[]) => Promise<void>;
    };
    const existing: Reaction[] = Array.isArray(holder.reactions) ? [...holder.reactions] : [];
    // Re-rendering the same link (or a hover variant sharing the frame) must
    // not stack duplicate click targets.
    const alreadyLinked = existing.some((r) =>
      (r.actions ?? []).some(
        (a) => (a as { type?: string; url?: string }).type === "URL"
          && (a as { url?: string }).url === url,
      ),
    );
    if (alreadyLinked) return;

    const reactions = [
      ...existing,
      {
        trigger: { type: "ON_CLICK" },
        actions: [{ type: "URL", url }],
      },
    ] as unknown as Reaction[];

    if (typeof holder.setReactionsAsync === "function") {
      await holder.setReactionsAsync(reactions);
    } else {
      (target as unknown as { reactions: Reaction[] }).reactions = reactions;
    }
  } catch {
    // A prototype link is a nice-to-have — never fail the node over it.
  }
}

export function cssOverflowClips(overflow: string | undefined): boolean {
  return overflow === "hidden" || overflow === "scroll" || overflow === "auto";
}

/**
 * CSS dash lengths scale with the border width — a 4px dashed border draws
 * far longer dashes than a 1px one. The old fixed [6,4] / [2,2] patterns
 * made every dashed border look identical regardless of weight.
 */
export function dashPatternForStyle(
  style: "SOLID" | "DASHED" | "DOTTED",
  weight: number
): number[] {
  const w = Math.max(1, weight || 1);
  if (style === "DASHED") return [w * 3, w * 2];
  if (style === "DOTTED") return [w, w];
  return [];
}

/**
 * Recursively create Figma nodes from tree structure
 */
/**
 * Single choke point for anchor bookkeeping.
 *
 * Every node — TEXT, hover instance, pseudo-state default, plain frame — leaves
 * the renderer through here, so registering the (WireframeNode, SceneNode) pair
 * in this wrapper covers all of them without a second walk of the tree.
 *
 * A no-op when `context.anchorScope` is absent, which is exactly what keeps the
 * off-canvas hover-master renders (buildHoverMasterRegistry runs BEFORE the
 * frame loop sets a scope) out of the map.
 */
export async function createNodeInFigma(
  node: WireframeNode,
  context: RenderContext,
  depth: number = 0
): Promise<SceneNode | null> {
  // Dev profiler: how many nodes actually reach Figma (the tree count includes
  // nodes the renderer drops), so ms/node has the right denominator.
  if (__W2W_DEV_LOG__) perf.count("renderedNodes", 1);
  const created = await createNodeInFigmaInner(node, context, depth);
  // "Links" option off → neither the `#anchor` links nor their targets are
  // registered, so resolveAnchorReactions has nothing to wire.
  if (created && context.anchorScope && context.originLinks !== false) {
    registerAnchorNode(context.anchorScope, node, created);
  }
  return created;
}

async function createNodeInFigmaInner(
  node: WireframeNode,
  context: RenderContext,
  depth: number = 0
): Promise<SceneNode | null> {
  // Depth limit to prevent runaway recursion. The extractor emits trees up to
  // 30 levels deep (extractor MAX_DEPTH) and the converter can add wrapper
  // levels (pseudo-element spans, margin wrappers), so the renderer cap must
  // sit ABOVE the capture cap — a tighter cap here silently truncates real
  // page content (telex.ge product prices live at DOM depth 21+).
  if (depth > MAX_RENDER_DEPTH) {
    logger.warn("Max depth reached", { nodeId: node.id, depth });
    recordDroppedNode(context, node.name, new Error(`max render depth ${MAX_RENDER_DEPTH} exceeded`));
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
      const boxed = await createTextWithBackground(node, context);
      applySharedDecorations(boxed, node, context);
      return boxed;
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
      // Figma frames clip by default; a padding wrapper we invented must not
      // cut off glyph descenders the browser painted.
      wrapper.clipsContent = cssOverflowClips(node.overflow);
      wrapper.resize(
        Math.max(node.width || 1, 1),
        Math.max(node.height || 1, 1),
      );
      wrapper.appendChild(textNode);
      textNode.x = node.padding!.left || 0;
      textNode.y = node.padding!.top || 0;
      applySharedDecorations(wrapper, node, context);
      return wrapper;
    }

    // Simple text node without background
    const plainText = await createTextNode(node, context.fontFamily, context);
    if (plainText) applySharedDecorations(plainText, node, context);
    return plainText;
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
      const image = await createRealImage(
        node,
        context.assetsMap.get(node.imageUrl)!,
        context
      );
      applyPaintDecorations(image, node, context);
      applySharedDecorations(image, node, context);
      return image;
    }

    // SVG markup → Figma Vector (when realAssets mode)
    // css-converter stores SVG markup in computedStyles.svgMarkup
    const svgMarkup = node.computedStyles?.svgMarkup;
    if (context.assetMode === "realAssets" && svgMarkup) {
      const vector = await createRealImage(node, svgMarkup, context);
      applyPaintDecorations(vector, node, context);
      applySharedDecorations(vector, node, context);
      return vector;
    }

    // Default: wireframe placeholder
    const placeholder = await createPlaceholder(
      node,
      context.pluginColors.secondary,
      context.pluginColors.text,
      context
    );
    applyPaintDecorations(placeholder, node, context);
    applySharedDecorations(placeholder, node, context);
    return placeholder;
  }

  // Create frame for containers
  const frame = figma.createFrame();
  frame.fills = []; // Clear Figma default white fill — only explicit fills should be applied
  frame.name = node.name || "Container";
  frame.resize(Math.max(node.width, 1), Math.max(node.height, 1));

  // Figma auto-layout cannot express column-wrap — `layoutWrap: WRAP` is
  // HORIZONTAL-only — so a `flex-direction: column; flex-wrap: wrap` container
  // would collapse its 2-D layout into a single column (telex.ge blog grid:
  // one tall post beside a 3×2 grid of small ones). Fall back to absolute
  // placement, where the captured x/y already carry the exact 2-D positions.
  const isColumnWrap =
    (node.flexWrap === "wrap" || node.flexWrap === "wrap-reverse") &&
    node.layoutMode === "VERTICAL";

  // A block container (layoutMode "NONE") only gets the VERTICAL fallback when
  // the captured child rects actually form a stack — otherwise the frame stays
  // without auto-layout and children keep their captured x/y (the absolute
  // branch below), matching h2d's geometry-first behavior.
  const noneStackRejected =
    (!node.layoutMode || node.layoutMode === "NONE") &&
    !geometrySupportsVerticalStack(node.children || []);

  // A HORIZONTAL container whose captured children span several rows can only
  // be reproduced if Figma will wrap them. When WRAP is unavailable (see the
  // `layoutWrap` conditions below) one row would flatten the whole 2-D layout,
  // so fall back to absolute placement where the captured x/y already hold it.
  const wrapWillApply =
    (node.flexWrap === "wrap" || node.flexWrap === "wrap-reverse") &&
    node.layoutSizingHorizontal !== "HUG" &&
    // WRAP only earns precedence over the geometry veto when it can actually
    // rebuild the captured rows — see wrapFitsChildren.
    wrapFitsChildren(node.width, node.children || []);

  const rowBandRejected =
    node.layoutMode === "HORIZONTAL" &&
    !wrapWillApply &&
    (node.children?.length ?? 0) >= 2 &&
    !geometryFormsSingleRow(node.children || []);

  // Apply Auto Layout: global autoLayout mode OR node has its own layout (e.g. card with VERTICAL)
  const useAutoLayout =
    shouldUseAutoLayout(context.layoutMode, node.layoutMode) &&
    !isColumnWrap &&
    !noneStackRejected &&
    !rowBandRejected;
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

    // Apply alignment from CSS. A reversed flex direction moves main-start to
    // the far edge, so the packing side flips with it.
    const isReversed =
      node.flexDirection === "row-reverse" ||
      node.flexDirection === "column-reverse";
    const primaryResult = cssJustifyToFigma(node.justifyContent, isReversed);
    const counterResult = cssAlignToFigma(node.alignItems);

    frame.primaryAxisAlignItems = primaryResult;
    // BASELINE is only legal on HORIZONTAL auto-layout — setting it on a
    // VERTICAL frame THROWS, and the parent's per-child try/catch swallows
    // the exception, silently deleting the whole subtree. A block container
    // (layoutMode NONE → VERTICAL here) can still carry `align-items:
    // baseline` in its computed styles; baseline behaves like flex-start in
    // that case, so fall back to MIN.
    frame.counterAxisAlignItems =
      counterResult === "BASELINE" && frame.layoutMode !== "HORIZONTAL"
        ? "MIN"
        : counterResult;

    // text-align fallback for non-flex block containers
    applyTextAlignFallback(frame, node.textAlign, node.justifyContent, node.alignItems);

    // Apply flex-wrap. Figma allows WRAP only on HORIZONTAL auto-layout, and
    // setting it elsewhere THROWS — an exception the parent's per-child
    // try/catch swallows, deleting the whole subtree. A block container can
    // still report `flex-wrap: wrap` when JS overrides its display inline
    // (telex.ge `.ab-fn-first-level`: `display:flex` in CSS, `display:block`
    // set by owl-carousel), and that combination lost eleven subtrees per
    // import — including the entire category-circles block.
    // WRAP also throws when the primary axis HUGs (sizing mode AUTO) — a
    // HUG-width row cannot wrap in the browser either, so skip it there.
    if (
      (node.flexWrap === "wrap" || node.flexWrap === "wrap-reverse") &&
      frame.layoutMode === "HORIZONTAL" &&
      node.layoutSizingHorizontal !== "HUG"
    ) {
      frame.layoutWrap = "WRAP";
      // CSS `gap` covers both axes; Figma splits them and defaults the
      // cross-axis one to 0. Without this, every wrapped row rendered its
      // lines flush against each other (web2wireframe.design's hero: the CTA
      // button sat 13.6px too high, touching the feature list above it).
      if (node.counterAxisSpacing && node.counterAxisSpacing > 0) {
        frame.counterAxisSpacing = node.counterAxisSpacing;
      }
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
      node.className,
      { id: frame.id, name: frame.name || node.name }
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
      node.width,
      node.height,
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
      frame.dashPattern = dashPatternForStyle(style, weight);
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

    // h2d `yD` (app.js:47021): a shadow on a fill-less frame has nothing to
    // cast from — Figma silently drops it (every shadow on a transparent
    // wrapper). Inject a nearly-invisible fill so the shadow rasterizes.
    // Plugin-colors mode strips shadows entirely, so no ghost fill there.
    const hasShadowEffect =
      context.colorMode !== "plugin" &&
      node.effects.some(
        (e) =>
          e.visible && (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW")
      );
    if (
      hasShadowEffect &&
      Array.isArray(frame.fills) &&
      frame.fills.length === 0
    ) {
      frame.fills = [
        { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.002 },
      ];
    }
  }

  // Apply border radius (per-corner — asymmetric CSS radii stay asymmetric)
  applyCornerRadii(frame, node.borderRadius, node.width, node.height);

  // Opacity, blend mode, hidden-in-default, fixed/sticky markers — shared
  // with the text/image branches so every node type gets them.
  applySharedDecorations(frame, node, context);

  // Clips content based on CSS overflow
  frame.clipsContent = cssOverflowClips(node.overflow);

  // Prototype scroll direction, per frame (h2d parity) — a horizontal
  // carousel or a wide code block imported fine but could not be scrolled to
  // in Presentation mode while only the root was scrollable. Gated on
  // clipsContent: a direction on a non-clipping frame is a Figma no-op that
  // only adds noise to the prototype panel.
  if (frame.clipsContent && node.scrollDirection) {
    frame.overflowDirection = node.scrollDirection;
  }

  // CSS clip-path: inset() — an axis-aligned rounded rectangle, which Figma
  // draws with clipsContent + cornerRadius. No mask node: a Figma mask is a
  // SIBLING, so it would take an auto-layout slot and disturb the child
  // stacking order sortChildrenForStacking just established.
  //
  // Runs AFTER the overflow line on purpose — a clip-path can only ADD
  // clipping, never undo `overflow: hidden`. Every unsupported shape parses to
  // null, and the whole block is guarded, so any failure degrades to the
  // unclipped rectangle this rendered before rather than losing the node.
  const insetClip = parseInsetClipPath(node.clipPath, node.width, node.height);
  if (insetClip && !insetClip.isNoOp) {
    try {
      if (insetClip.radius !== null) {
        applyCornerRadii(
          frame,
          intersectRadii(getCornerRadii(node.borderRadius), insetClip.radius),
          node.width,
          node.height
        );
      }
      if (insetClips(insetClip)) frame.clipsContent = true;
    } catch {
      // Best-effort: leave the frame unclipped.
    }
  }

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

  // `isHiddenInDefault`, and the position:fixed / sticky pluginData markers
  // that drive root re-parenting, are set by applySharedDecorations above.

  // Recursively create children
  if (node.children && node.children.length > 0) {
    const parentHasAutoLayout = useAutoLayout;

    // Get ACTUAL applied background color from this frame
    const currentBgColor = getDominantColorFromPaints(frame.fills as Paint[]);
    const effectiveParentBg = currentBgColor || context.parentBackgroundColor;

    // `flex-grow` only licenses Figma's layoutGrow when the measured children
    // already fill this frame — otherwise Figma redistributes space CSS never
    // handed out and squeezes every child (stripe.com's bento, 191.67px each).
    // Read the values actually applied to the frame, not the CSS ones.
    const growEligible = parentHasAutoLayout
      ? evaluateGrowEligibility(frame, node.children)
      : undefined;

    // Create child context with parent background and width tracking
    const childContext: RenderContext = {
      ...context,
      parentBackgroundColor: effectiveParentBg,
      parentWidth: node.width,
      growEligible,
    };

    // Sort grid children by position for correct auto-placement
    const gridSorted = gridApplied
      ? sortGridChildren(node.children, node.gridAutoFlow)
      : node.children;

    // Sort flex children by CSS order property (visual reordering)
    const orderSorted = sortByFlexOrder(gridSorted, node.layoutMode);

    // row-reverse / column-reverse: Figma has no reversed axis, so append the
    // children backwards (per wrapped line — see reverseFlexChildren).
    const directionApplied = reverseFlexChildren(
      orderSorted,
      node.layoutMode,
      node.flexDirection
    );

    // Sort for correct stacking (bg images to front; z-index only in absolute mode).
    // IMPORTANT: pass the layout mode the frame will ACTUALLY use, not the
    // CSS-derived node.layoutMode. In global autoLayout mode a plain block
    // container (node.layoutMode "NONE") still renders as VERTICAL auto-layout,
    // where children are placed by FLOW order — z-index must not reorder them
    // (telex.ge: header has z-index:5 and was pushed to the page bottom).
    const childrenToRender = sortChildrenForStacking(
      directionApplied,
      effectiveStackingLayoutMode(gridApplied, useAutoLayout, node.layoutMode)
    );

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
              // Apply grid cell alignment from parent's CSS. `STRETCH` means
              // CSS said nothing (it is the map's fallback), so a single-child
              // grid falls back to the measured insets — `justify-items`, the
              // property that centres an item horizontally, is not part of the
              // capture at all, and `place-items: center` reaches us as
              // `align-items` alone (glinc.io's 64x64 icon box).
              //
              // Only a single child gets the geometric read: with one item the
              // cell IS the content box, whereas naming a cell in a multi-track
              // grid would need track sizes we do not carry — and there CSS's
              // default stretch is already right.
              const soleGridChild = node.children.length === 1;
              const contentWidth = node.width - node.padding.left - node.padding.right;
              const contentHeight = node.height - node.padding.top - node.padding.bottom;

              const vertAlign = cssAlignToGridChild(node.alignItems);
              if (vertAlign !== "STRETCH") {
                gridChild.gridChildVerticalAlign = vertAlign;
              } else if (soleGridChild) {
                const measured = inferGridChildAlign(
                  child.y - node.padding.top,
                  child.height,
                  contentHeight,
                );
                if (measured) gridChild.gridChildVerticalAlign = measured;
              }

              const horizAlign = cssJustifyToGridChild(node.justifyContent);
              if (horizAlign !== "STRETCH") {
                gridChild.gridChildHorizontalAlign = horizAlign;
              } else if (soleGridChild) {
                const measured = inferGridChildAlign(
                  child.x - node.padding.left,
                  child.width,
                  contentWidth,
                );
                if (measured) gridChild.gridChildHorizontalAlign = measured;
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
            applyCssTransform(childNode, child, childNode.x, childNode.y);
          }
        }
      } catch (err) {
        logger.error("Error creating child node", err, {
          childId: entry?.id,
          childName: entry?.name,
        });
        recordDroppedNode(context, entry?.name, err);
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
      if (!(await loadFontCached(context.fontFamily, "Regular"))) {
        throw new Error(`Font unavailable: ${context.fontFamily} Regular`);
      }

      // Set fontName BEFORE characters — createText() defaults to "Inter Regular",
      // but we loaded context.fontFamily. Must switch font first to avoid unloaded font error.
      textNode.fontName = { family: context.fontFamily, style: "Regular" };
      textNode.characters = node.textContent;
      textNode.name = node.name || node.textContent.substring(0, 20);
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

  // Children (and any textContent) are in — hug sizing has settled, so check
  // the frame didn't come out smaller than the browser measured it.
  if (useAutoLayout && !gridApplied) {
    applyCapturedMinSize(frame, node.width, node.height);
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
            if (node.linkReactionUrl && context.originLinks !== false) {
              await attachLinkReaction(instance, node.linkReactionUrl);
            }
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
      if (node.linkReactionUrl && context.originLinks !== false) {
        await attachLinkReaction(defaultInstance, node.linkReactionUrl);
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

  // Non-text link (logo, icon, image card): the frame IS the click target.
  // Runs after the cursor:pointer block above, which assigns `reactions`
  // wholesale — merging first would lose the click-through.
  if (node.linkReactionUrl && context.originLinks !== false) {
    await attachLinkReaction(frame, node.linkReactionUrl);
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

/** Smallest scale factor we will divide by / emit a matrix for. */
const MIN_SCALE = 1e-3;

export interface TransformPlacement {
  /** Node size with the transform's scale baked in (Figma matrices cannot scale). */
  width: number;
  height: number;
  /** Unit-axis 2x3 matrix for `node.relativeTransform`. */
  transform: Transform;
  /** Axis scale factors, for scaling min/max constraints and text metrics. */
  scaleX: number;
  scaleY: number;
}

/**
 * Recover a transformed element's Figma placement from its captured AABB.
 *
 * getBoundingClientRect returns the axis-aligned bounding box of the
 * transformed element, so (aabbW, aabbH) are projected dimensions. With
 * M = [[a, c], [b, d]] the untransformed box (w, h) satisfies
 *
 *   W = w·|a| + h·|c|          det = |a|·|d| − |b|·|c|
 *   H = w·|b| + h·|d|    →     w = (W·|d| − H·|c|) / det
 *                              h = (H·|a| − W·|b|) / det
 *
 * (For pure rotation det collapses to cos2θ and this is exactly
 * computeRotatedPlacement; for pure scale it is w = W/scaleX.)
 *
 * The transformed box's edge vectors are then Xv = (a·w, b·w) and
 * Yv = (c·h, d·h). Figma requires `relativeTransform` to have UNIT axes, so we
 * split them: their LENGTHS become the node's width/height, and their
 * DIRECTIONS become the matrix. Translation is whatever makes the resulting
 * parallelogram's bounding box land back on the captured AABB — which is why
 * transform-origin plays no part (see the css-converter header for the proof).
 *
 * Returns null when the system is unsolvable (the degenerate ~45° case) or the
 * matrix is collapsed — callers keep the upright AABB rendering then.
 */
export function computeTransformPlacement(
  aabbX: number,
  aabbY: number,
  aabbW: number,
  aabbH: number,
  t: CssTransform,
): TransformPlacement | null {
  const { a, b, c, d } = t;
  if (![a, b, c, d].every(Number.isFinite)) return null;

  const det = Math.abs(a) * Math.abs(d) - Math.abs(b) * Math.abs(c);
  if (Math.abs(det) < 0.1) return null; // unsolvable near 45°

  const w = (aabbW * Math.abs(d) - aabbH * Math.abs(c)) / det;
  const h = (aabbH * Math.abs(a) - aabbW * Math.abs(b)) / det;
  if (!isFinite(w) || !isFinite(h) || w < 1 || h < 1) return null;

  // Edge vectors of the rendered parallelogram.
  const xvX = a * w, xvY = b * w;
  const yvX = c * h, yvY = d * h;

  const width = Math.hypot(xvX, xvY);
  const height = Math.hypot(yvX, yvY);
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  if (scaleX < MIN_SCALE || scaleY < MIN_SCALE) return null;
  if (width < MIN_SCALE || height < MIN_SCALE) return null;

  // Min corner of the parallelogram relative to the node's own origin.
  const minX = Math.min(0, xvX, yvX, xvX + yvX);
  const minY = Math.min(0, xvY, yvY, xvY + yvY);

  return {
    width,
    height,
    scaleX,
    scaleY,
    transform: [
      [a / scaleX, c / scaleY, aabbX - minX],
      [b / scaleX, d / scaleY, aabbY - minY],
    ],
  };
}

/**
 * Axis scale factors of a transform, for converting CSS lengths into the node's
 * rendered space. The captured width/height are the AABB of the *transformed*
 * element, so they already carry the scale — but CSS min/max lengths do not.
 * Without this a `scale(1.2)` box gets a 120px width and a 100px minWidth.
 *
 * Always positive (a mirror scales by 1, it does not shrink), and falls back to
 * 1 for a collapsed or non-finite matrix so a bad transform can never zero out
 * a constraint.
 */
export function cssBoundScales(t: CssTransform | undefined): { sx: number; sy: number } {
  if (!t) return { sx: 1, sy: 1 };
  const sx = Math.hypot(t.a, t.b);
  const sy = Math.hypot(t.c, t.d);
  return {
    sx: Number.isFinite(sx) && sx >= MIN_SCALE ? sx : 1,
    sy: Number.isFinite(sy) && sy >= MIN_SCALE ? sy : 1,
  };
}

/**
 * Apply a WireframeNode's static CSS transform to an already-positioned Figma
 * node. No-ops when the node has no transform or the geometry is degenerate.
 * `baseX`/`baseY` are the coordinates where the AABB was placed.
 *
 * Never sets `.rotation` afterwards: that setter rewrites m00/m01/m10/m11 and
 * would destroy any skew we just wrote.
 */
export function applyCssTransform(
  childNode: SceneNode,
  child: WireframeNode,
  baseX: number,
  baseY: number,
): void {
  if (!child.transform) return;
  const placement = computeTransformPlacement(baseX, baseY, child.width, child.height, child.transform);
  if (!placement) return;
  try {
    // Glyphs first: the captured fontSize is untransformed, so a scaled text
    // node would otherwise render full-size type in a scaled box. Done before
    // the resize so the resize has the final say on the box.
    if (childNode.type === "TEXT") {
      rescaleTextMetrics(childNode, placement.scaleX, placement.scaleY);
    }
    if ('resize' in childNode) {
      (childNode as FrameNode).resize(Math.max(placement.width, 1), Math.max(placement.height, 1));
    }
    (childNode as FrameNode).relativeTransform = placement.transform;
  } catch {
    // Transforms are best-effort — never break the render for one. A wrong
    // transform is a visual bug; a thrown one loses the whole subtree through
    // the per-child catch.
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
    // Hidden during the append → ABSOLUTE transition so the parent's hug
    // sizing never measures the child in normal flow (h2d `Eh` behavior).
    const wasVisible = childNode.visible;
    childNode.visible = false;
    parentFrame.appendChild(childNode);
    if ("layoutPositioning" in childNode) {
      (childNode as FrameNode | TextNode).layoutPositioning = "ABSOLUTE";
    }
    childNode.x = child.x;
    childNode.y = child.y;
    // Geometry-derived constraints: a right-anchored close button stays at
    // the right edge when the designer resizes the frame, a full-bleed
    // backdrop stretches, a centered modal stays centered. Without this
    // every absolute child was pinned top-left (Figma's default).
    if ("constraints" in childNode) {
      try {
        (childNode as FrameNode | TextNode).constraints = {
          horizontal: inferAxisConstraint(child.x, child.width, parentFrame.width),
          vertical: inferAxisConstraint(child.y, child.height, parentFrame.height),
        };
      } catch {
        // Constraints unsupported on this node type — keep defaults.
      }
    }
    applyCssTransform(childNode, child, child.x, child.y);
    if (childNode.type === "TEXT") {
      enforceMeasuredLineCount(childNode as TextNode, child);
    }
    childNode.visible = wasVisible;
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
  // CSS lengths are untransformed; the node's size is the scaled AABB.
  const { sx: boundSx, sy: boundSy } = cssBoundScales(child.transform);

  if (typeof child.cssMaxWidth === "number" && child.cssMaxWidth > 0) {
    const maxW = child.cssMaxWidth * boundSx;
    const wrapperMaxW = maxW
      + (child.margin?.left || 0)
      + (child.margin?.right || 0);
    if (wrapper && "maxWidth" in wrapper) {
      wrapper.maxWidth = wrapperMaxW;
    }
    if ("maxWidth" in childNode) {
      (childNode as FrameNode | TextNode).maxWidth = maxW;
    }
  }

  // CSS min-width / min-height / max-height → native Figma constraints.
  // Only legal on auto-layout children — which is exactly this code path.
  // These keep the imported layout behaving like the source CSS when the
  // designer edits content (a min-height hero holds its floor when its text
  // shrinks; a FILL child can't collapse below its CSS min-width).
  // Math.max: applyCapturedMinSize may already have pinned a larger
  // captured-size floor on this frame — the CSS value must not lower it.
  if (typeof child.cssMinWidth === "number" && child.cssMinWidth > 0) {
    if ("minWidth" in childNode) {
      const fc = childNode as FrameNode | TextNode;
      fc.minWidth = Math.max(fc.minWidth ?? 0, child.cssMinWidth * boundSx);
    }
  }
  if (typeof child.cssMinHeight === "number" && child.cssMinHeight > 0) {
    if ("minHeight" in childNode) {
      const fc = childNode as FrameNode | TextNode;
      fc.minHeight = Math.max(fc.minHeight ?? 0, child.cssMinHeight * boundSy);
    }
  }
  if (
    typeof child.cssMaxHeight === "number" &&
    child.cssMaxHeight > 0 &&
    // Sanity: ignore a max that contradicts an also-present min.
    (typeof child.cssMinHeight !== "number" || child.cssMaxHeight >= child.cssMinHeight)
  ) {
    if ("maxHeight" in childNode) {
      (childNode as FrameNode | TextNode).maxHeight = child.cssMaxHeight * boundSy;
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

    // Absolute descendants must not be measured while these layout props are
    // applied (h2d `Eh`) — hug sizing counts them otherwise.
    withAbsoluteChildrenHidden(frameChild, () => {
      // `flex-grow` is only honoured when the parent's measured children fill
      // it exactly — otherwise Figma re-divides space the browser never gave.
      const grows = child.layoutGrow === 1 && context.growEligible !== false;

      // layoutGrow
      if (grows) {
        target.layoutGrow = 1;
      }

      // layoutAlign from CSS align-self
      const selfAlign = cssAlignSelfToFigma(
        child.alignSelf,
        parentFrame.counterAxisAlignItems
      );
      const resolvedAlign = resolveChildLayoutAlign(selfAlign, child.layoutAlign);
      if (resolvedAlign) {
        target.layoutAlign = resolvedAlign;
      }

      if (isHorizontalLayout) {
        // Main axis = horizontal
        if (child.layoutSizingHorizontal === "FILL" || grows) {
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
        if (child.layoutSizingVertical === "FILL" || grows) {
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
    });
  } else if (childNode.type === "TEXT") {
    const textChild = childNode as TextNode;
    const isMultiLine = (child.browserLineCount || 1) > 1;

    // layoutAlign
    const selfAlign = cssAlignSelfToFigma(
      child.alignSelf,
      parentFrame.counterAxisAlignItems
    );
    const resolvedAlign = resolveChildLayoutAlign(selfAlign, child.layoutAlign);
    if (resolvedAlign) {
      (wrapper || textChild).layoutAlign = resolvedAlign;
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

    // LAST: every branch above can hand the wrap back to Figma (HEIGHT +
    // fixed width), and Figma wraps with the font that actually resolved. If
    // that lands on more lines than the browser measured, the box grows and
    // overflows into the next sibling — stripe.com's stats heading gained a
    // third line and 60px. Re-bake the measured breaks only when it happens.
    enforceMeasuredLineCount(textChild, child);
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

/**
 * The CSS `position` a promoted node carried, from the marker written in
 * `createNodeInFigma`. Empty when the marker is missing (older renders, mock
 * environments) — callers treat that as "unknown", never as "fixed".
 */
function readCssPosition(node: SceneNode): string {
  try {
    return "getPluginData" in node ? node.getPluginData("w2w_css_position") : "";
  } catch {
    return "";
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

  // Load required fonts — sequential on purpose, matching the old
  // "first failure aborts to Inter" behaviour exactly.
  const preloadOk =
    (await loadFontCached(fontFamily, "Regular")) &&
    (await loadFontCached(fontFamily, "Medium")) &&
    (await loadFontCached(fontFamily, "Bold"));
  if (!preloadOk) {
    logger.warn("Failed to load custom fonts, using Inter", { fontFamily });
    await loadFontCached("Inter", "Regular");
    await loadFontCached("Inter", "Medium");
    await loadFontCached("Inter", "Bold");
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
        frameData.tree.tag,
        undefined,
        { id: wireframeFrame.id, name: wireframeFrame.name }
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
  //
  // VERTICAL is a FLOOR, not a reading of the capture: a page whose <html>
  // declares no overflow must still scroll down, so the fallback arm is
  // unconditional. The captured overflow can only ever widen the root to BOTH
  // (a horizontally scrolling page); it can never narrow it to NONE or to
  // horizontal-only, which would stop an ordinary import from scrolling.
  const rootScroll = frameData.tree?.scrollDirection;
  wireframeFrame.overflowDirection =
    rootScroll === "BOTH" || rootScroll === "HORIZONTAL" ? "BOTH" : "VERTICAL";

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
    // Same BASELINE guard as the child path — BASELINE on a non-HORIZONTAL
    // frame throws and would abort the whole wireframe.
    wireframeFrame.counterAxisAlignItems =
      counterResult === "BASELINE" && wireframeFrame.layoutMode !== "HORIZONTAL"
        ? "MIN"
        : counterResult;

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
            applyCssTransform(childNode, child, childNode.x, childNode.y);
          }
        }
      } catch (err) {
        logger.error("Error creating top-level node", err, {
          childId: child.id,
          childName: child.name,
        });
        recordDroppedNode(context, child.name, err);
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
        //
        // Only `position: sticky` leaves such a hole. A `position: fixed`
        // element is out of flow and occupied nothing, so a spacer there
        // INVENTS space: glinc.io's `body::before` / `body::after` are
        // decorative `inset: 0` overlays captured at full viewport size, and
        // two 900px spacers pushed the whole page down 1800px.
        if (readCssPosition(fixedNode) !== "fixed") {
          insertFixedSpacer(fixedNode as FrameNode);
        }

        // Hidden during the re-parent → ABSOLUTE transition so the root's
        // HUG height never measures the fixed node in normal flow (h2d `Eh`).
        const wasVisible = fixedNode.visible;
        fixedNode.visible = false;
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
        fixedNode.visible = wasVisible;
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
 * Reorder the children of a `row-reverse` / `column-reverse` flex container.
 *
 * Figma auto-layout only lays children out along the positive axis, so a
 * reversed container is reproduced by appending its children backwards. With
 * `flex-wrap: wrap` a GLOBAL reverse is wrong: CSS breaks lines in main-axis
 * order, so reversing everything re-packs items into different lines whenever
 * their sizes differ. Only the items within one line may swap.
 *
 * Line boundaries are read off the captured main-axis geometry rather than the
 * cross axis: in a reversed row every next item sits to the LEFT of the
 * previous one, so an item that jumps back towards the start edge opens a new
 * line. Cross-axis banding cannot be used — a tall item makes its line overlap
 * the next one (iwm.org.uk: HMS Belfast is 383px in a 318px line).
 */
export function reverseFlexChildren(
  children: WireframeNode[],
  layoutMode: WireframeNode["layoutMode"],
  flexDirection: string | undefined
): WireframeNode[] {
  if (flexDirection !== "row-reverse" && flexDirection !== "column-reverse") {
    return children;
  }
  if (layoutMode !== "HORIZONTAL" && layoutMode !== "VERTICAL") return children;
  if (children.length < 2) return children;

  const horizontal = layoutMode === "HORIZONTAL";
  const start = (n: WireframeNode) => (horizontal ? n.x : n.y);
  const size = (n: WireframeNode) => (horizontal ? n.width : n.height);
  // Zero-area children (spacers, collapsed pseudo-elements) carry no position
  // of their own — they must not open a line.
  const hasArea = (n: WireframeNode) => n.width > 0.5 && n.height > 0.5;

  const out: WireframeNode[] = [];
  let line: WireframeNode[] = [];
  let lineStart: number | null = null;

  for (const child of children) {
    if (hasArea(child)) {
      const end = start(child) + size(child);
      // Still moving towards the start edge → same line. Otherwise a new one.
      if (lineStart !== null && end > lineStart) {
        out.push(...line.reverse());
        line = [];
      }
      lineStart = start(child);
    }
    line.push(child);
  }
  out.push(...line.reverse());

  return out;
}

/**
 * Resolve the layout mode a container frame will ACTUALLY render with, for
 * stacking decisions. `node.layoutMode` alone is wrong: in global autoLayout
 * mode, a block container with layoutMode "NONE" is still rendered as a
 * VERTICAL auto-layout frame (children placed by flow order), so z-index
 * must not reorder its children. Conversely in absolute mode every child is
 * positioned by x/y, where z-index ordering is exactly right.
 */
export function effectiveStackingLayoutMode(
  gridApplied: boolean,
  useAutoLayout: boolean,
  nodeLayoutMode: WireframeNode["layoutMode"]
): WireframeNode["layoutMode"] {
  if (gridApplied) return "GRID";
  if (!useAutoLayout) return "NONE";
  return nodeLayoutMode && nodeLayoutMode !== "NONE" && nodeLayoutMode !== "GRID"
    ? nodeLayoutMode
    : "VERTICAL";
}

/**
 * The lowest z-index among the IN-FLOW siblings — but only when EVERY one of
 * them is CSS-positioned (`relative`/`sticky`) and carries a numeric z-index.
 * Otherwise `undefined`, meaning "no floor, leave the DOM order alone".
 *
 * Both halves of that guard matter:
 *   • A z-index on a `static` child has NO effect in CSS, so telex.ge's static
 *     `div.tygh-header` (z-index: 5) must not license any reordering.
 *   • With a MIX of positioned and static in-flow siblings there is no single
 *     right answer: auto layout offers only "before all in-flow" and "after
 *     all in-flow", and an out-of-flow child can legitimately belong between
 *     them. Guessing is worse than leaving the existing rules in charge.
 */
function inFlowPositionedZFloor(children: WireframeNode[]): number | undefined {
  let floor: number | undefined;
  for (const child of children) {
    if (child.position === "absolute" || child.position === "fixed") continue;
    if (child.position !== "relative" && child.position !== "sticky") return undefined;
    if (typeof child.zIndex !== "number") return undefined;
    floor = floor === undefined ? child.zIndex : Math.min(floor, child.zIndex);
  }
  return floor;
}

/**
 * Out of normal flow AND stacked behind its siblings — the one case where
 * reordering a child under auto-layout is safe and necessary.
 *
 * "Behind" is relative, not absolute. A negative z-index always qualifies, but
 * so does any value below `zFloor` (see {@link inFlowPositionedZFloor}):
 * stripe.com's stats section stacks `.section-background` (absolute, z 0)
 * under `.section-container` (relative, z 1), and reading only `z < 0` left
 * the opaque full-bleed gradient painting over the whole section.
 */
function isBehindSiblings(child: WireframeNode, zFloor?: number): boolean {
  if (child.position !== "absolute" && child.position !== "fixed") return false;
  const z = child.zIndex ?? 0;
  if (z < 0) return true;
  return zFloor !== undefined && z < zFloor;
}

/**
 * The mirror of {@link isBehindSiblings}: out of normal flow AND explicitly
 * stacked in FRONT. CSS paints such a child above every in-flow sibling no
 * matter where it sits in the DOM; Figma paints the LAST child on top, so it
 * has to move to the end.
 *
 * `z-index: auto` is deliberately excluded — it covers the vast majority of
 * absolute children, and hoisting them all would churn every import's layer
 * order for no measured gain. Only an explicit positive value is treated as
 * the author saying "this belongs on top".
 */
function isInFrontOfSiblings(child: WireframeNode): boolean {
  return (
    (child.position === "absolute" || child.position === "fixed") &&
    (child.zIndex ?? 0) > 0
  );
}

/** Stable ascending sort by z-index (DOM order breaks ties). */
function byZIndexStable(children: WireframeNode[]): WireframeNode[] {
  return children
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const za = a.c.zIndex ?? 0;
      const zb = b.c.zIndex ?? 0;
      return za !== zb ? za - zb : a.i - b.i;
    })
    .map((s) => s.c);
}

/**
 * Sort children for correct visual stacking in Figma:
 * 1. Move abs-positioned image-only containers to front (behind = background)
 * 2. Sort by z-index — fully in absolute mode (layoutMode=NONE), but in
 *    auto-layout only for out-of-flow children, since reordering in-flow ones
 *    would break DOM order (e.g., buttons above text)
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
  //
  // The hoist only makes sense when there IS in-flow content to sit behind —
  // its case is apple.com's tiles, where the copy is lifted by a z-index on a
  // descendant the sibling comparison cannot see. Among purely out-of-flow
  // siblings, DOM order is the only paint order CSS gives them, and reordering
  // destroys it: stripe.com's bento cards stack `__border` (opaque) then
  // `__inner` (the artwork), and hoisting `__inner` buried the artwork under a
  // flat #E5EDF5 box.
  const hasInFlowSibling = children.some(
    (c) => c.position !== "absolute" && c.position !== "fixed"
  );

  const bgImages: WireframeNode[] = [];
  const rest: WireframeNode[] = [];
  let hasBgImages = false;
  for (const child of children) {
    if (hasInFlowSibling && child.position === "absolute" && isImageOnlySubtreeW(child)) {
      bgImages.push(child);
      hasBgImages = true;
    } else {
      rest.push(child);
    }
  }

  const result = hasBgImages && rest.length > 0
    ? [...bgImages, ...rest]
    : children;

  // Step 2: In auto-layout (VERTICAL/HORIZONTAL/GRID) children are laid out in
  // child order, so a general z-index sort would break DOM flow (e.g. buttons
  // above text). Out-of-flow children are the exception: Figma gives them
  // layoutPositioning "ABSOLUTE" and skips them when laying out, so their order
  // only affects paint. A negative z-index puts such a child BEHIND its
  // siblings in CSS — leaving it last paints it on top and hides them, which is
  // how stripe.com's header background covered the entire nav.
  if (parentLayoutMode !== "NONE") {
    const zFloor = inFlowPositionedZFloor(result);
    const behind = result.filter((c) => isBehindSiblings(c, zFloor));
    // A background-layer container hoisted by Step 1 keeps that placement —
    // the front sort must not drag it back to the end. A child already judged
    // "behind" is excluded too: with a floor in play a positive z-index can
    // satisfy both tests, and behind wins (it is the lower CSS layer).
    const front = result.filter(
      (c) =>
        isInFrontOfSiblings(c) &&
        !isBehindSiblings(c, zFloor) &&
        bgImages.indexOf(c) === -1,
    );
    if (behind.length === 0 && front.length === 0) return result;
    return [
      ...byZIndexStable(behind),
      ...result.filter(
        (c) => !isBehindSiblings(c, zFloor) && front.indexOf(c) === -1,
      ),
      ...byZIndexStable(front),
    ];
  }

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
