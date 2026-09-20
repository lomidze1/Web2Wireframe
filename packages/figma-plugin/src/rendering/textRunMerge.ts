/**
 * Inline TEXT-run merge — h2d `_j` (app.js:41713).
 *
 * h2d joins sibling TEXT nodes that are inline into ONE text node carrying
 * per-character ranges, and runs the pass AFTER its frame merge so runs whose
 * separating wrapper has just been dissolved still meet. Two of our passes
 * merge text, and neither can do this:
 *
 *   collectTextSegments (text.ts)        — render time, one node + its OWN
 *                                          inline children, never a sibling
 *   mergeAdjacentTextEntries (converter) — per-line runs inside ONE parent
 *                                          element, during conversion
 *
 * So `<div><span>a</span> <a>b</a></div>` — three inline runs the browser
 * painted on one line — stayed three layers, and a run pair only made adjacent
 * by `collapseSingleChildFrames` was never reconsidered at all.
 *
 * ## The neutrality rule
 *
 * This is a layer-count optimisation. It must not move a glyph, so exactly two
 * geometries merge, and both reproduce what the browser already did:
 *
 *   touching runs (gap ≈ 0)   concatenating the characters hands Figma the same
 *                             continuous advance string the browser laid out.
 *                             `exactSegments` stops createTextNode inventing a
 *                             separator space that would shift everything after
 *                             it.
 *
 *   runs a space apart        the measured gap exists BECAUSE of a space
 *                             character in the source, so putting one space
 *                             back reproduces it — same font, same size, same
 *                             advance. Identical reasoning to the converter's
 *                             `_rowSegments` merge (css-converter.ts:1858).
 *
 * Everything else is refused: different rows, gaps too wide for one space, a
 * run that paints its own box, an out-of-flow run, a hover variant, a run whose
 * node-level typography cannot be re-expressed per range.
 *
 * Stacked runs (consecutive LINES, h2d's `\n` case) are deliberately NOT merged:
 * measured on the stripe.com capture, 78 of 86 such pairs are `<a>` + `<a>` in a
 * footer link column, where merging dissolves one selectable layer per link.
 *
 * Differing run attributes need no special handling — they ride out as
 * `styledSegments`, and createTextNode already emits a range call per segment
 * for fills, fontName, fontSize, letterSpacing, textCase, lineHeight,
 * decoration and hyperlink (text.ts:1479-1850).
 */

import type { WireframeNode, TextSegment } from "../types";

/**
 * Tags whose text is an inline run. Same list as the converter's
 * INLINE_TEXT_TAGS (css-converter.ts:126) plus `#text`, the tag a bare text
 * child of a mixed parent gets.
 */
const INLINE_RUN_TAGS = new Set([
  "span", "a", "strong", "em", "b", "i", "u", "mark", "small", "sub", "sup",
  "abbr", "cite", "code", "time", "#text",
]);

/** Row tolerance — same numbers as mergeAdjacentTextEntries, deliberately. */
const ROW_MIN_GAP = -3;
const ROW_MAX_GAP = 12;
const HEIGHT_TOLERANCE = 1;
/** Below this a gap is the browser painting nothing between the runs. */
const VISIBLE_GAP = 2;
/**
 * Widest empty frame still readable as one space. A space glyph scales with the
 * font, so the fixed `ROW_MAX_GAP` band is too tight — 11.18px at 54px on
 * chroniclehq.com's hero. Twice the band covers display type without admitting
 * layout boxes.
 */
const MAX_SPACE_FRAME_WIDTH = ROW_MAX_GAP * 2;
/** Global geometry epsilon — h2d's `fe`, as in css-converter and treeSimplify. */
const GEOMETRY_EPSILON = 0.51;

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** Anything that puts pixels on the node's own box, as in treeSimplify. */
function paintsBox(n: WireframeNode): boolean {
  return (
    (n.fills?.length ?? 0) > 0 ||
    (n.strokes?.length ?? 0) > 0 ||
    (n.effects?.length ?? 0) > 0 ||
    n.backgroundColor != null ||
    n.backgroundGradient != null ||
    (n.borderColor != null && (n.borderWidth ?? 0) > 0)
  );
}

/** Hover variants / ComponentSet boundaries — identity we must not disturb. */
function carriesHoverIdentity(n: WireframeNode): boolean {
  return (
    (n.pseudoStateStyles != null && Object.keys(n.pseudoStateStyles).length > 0) ||
    n.isHiddenInDefault === true
  );
}

/**
 * A text node that could become part of a larger run.
 *
 * Every clause is either "this is not an inline run" or "merging would lose an
 * identity that only this node's own box can carry".
 */
function isMergeableRun(n: WireframeNode): boolean {
  if (n.type !== "text") return false;
  if (n.children.length > 0) return false;
  if (n.isPlaceholder || n.imageUrl || n.computedStyles?.svgMarkup) return false;
  if (n.textContent === "") return false;
  if (!INLINE_RUN_TAGS.has(n.tag.toLowerCase())) return false;

  // Out of flow, transformed or margined: the box is placed by rules the merged
  // box would no longer present.
  if (n.position === "absolute" || n.position === "fixed" || n.position === "sticky") return false;
  if (n.transform != null) return false;
  const m = n.margin;
  if (m && (m.top || m.right || m.bottom || m.left)) return false;

  // Clipping the glyphs is a per-box decision (`text-overflow: ellipsis`).
  if (n.textTruncation || n.maxLines) return false;

  // A painted box, a gradient through the glyphs, or a stroke belongs to this
  // node alone — none of the three has a per-range form.
  if (paintsBox(n)) return false;
  if ((n.textFills?.length ?? 0) > 0) return false;
  if (n.textStroke != null) return false;

  if (carriesHoverIdentity(n)) return false;
  // Click targets and anchor endpoints resolve to a node id, not a range.
  if (n.linkReactionUrl || n.linkAnchorId || n.anchorId) return false;

  // A run that grows or fills is sized by the parent's layout, not by its
  // glyphs; a merged box would negotiate for both runs at once.
  if (n.layoutGrow === 1) return false;
  if (n.layoutSizingHorizontal === "FILL") return false;

  return true;
}

/**
 * Node-level properties the merged node can carry only ONE of, and which have
 * no per-range equivalent (or whose per-range form we do not emit). Unequal on
 * either side → refuse rather than pick a winner.
 */
function compatible(a: WireframeNode, b: WireframeNode): boolean {
  return (
    a.textAlign === b.textAlign &&
    a.textAlignVertical === b.textAlignVertical &&
    a.opacity === b.opacity &&
    (a.zIndex ?? 0) === (b.zIndex ?? 0) &&
    a.cssMaxWidth === b.cssMaxWidth &&
    (a.blendMode ?? "normal") === (b.blendMode ?? "normal") &&
    a.listStyleType === b.listStyleType &&
    a.textCase === b.textCase &&
    a.textDecorationStyle === b.textDecorationStyle &&
    a.textDecorationColor === b.textDecorationColor &&
    a.textColorVariable === b.textColorVariable &&
    JSON.stringify(a.textShadowEffects ?? null) === JSON.stringify(b.textShadowEffects ?? null)
  );
}

/**
 * How the two runs sit relative to each other, as the separator that joins
 * them — or null when they do not sit on one line a space apart.
 *
 * The parent's layout has a veto: in a HORIZONTAL auto-layout the merged box
 * swallows one `itemSpacing` slot, which only stays neutral when that spacing
 * IS the measured gap. A VERTICAL or GRID parent placing two runs on one row
 * means the layout inference is already doing something we must not perturb.
 */
function rowSeparator(
  parent: WireframeNode,
  a: WireframeNode,
  b: WireframeNode,
): string | null {
  if (Math.abs(b.y - a.y) > Math.max(2, a.height * 0.2)) return null;
  if (Math.abs(b.height - a.height) > HEIGHT_TOLERANCE) return null;

  const gap = b.x - (a.x + a.width);
  if (gap < ROW_MIN_GAP || gap > ROW_MAX_GAP) return null;

  if (parent.layoutMode === "HORIZONTAL") {
    if (Math.abs(gap - parent.itemSpacing) > GEOMETRY_EPSILON) return null;
  } else if (parent.layoutMode !== "NONE") {
    return null;
  }

  // The captured characters already carry the boundary — adding another space
  // would widen the gap the browser measured.
  if (/\s$/.test(a.textContent) || /^\s/.test(b.textContent)) return "";
  return gap >= VISIBLE_GAP ? " " : "";
}

/**
 * The FRAME form of a painted space.
 *
 * Per-word animation libraries (GSAP SplitText, Splitting.js) rewrite a heading
 * into one `<span>` per word plus `<span class="split-space"> </span>` for each
 * space. The extractor drops whitespace-only text nodes
 * (browser-extension/src/content/extractor.ts:719), so the space reaches us as
 * a childless, inkless frame — a non-text sibling, which is precisely what ends
 * a merge run. Recognising it lets `bridgedSeparator` step over it.
 *
 * Same refusals as `isBlankRun`: anything that paints, carries an identity, or
 * is placed by rules the merged box would no longer present is not a space.
 */
function isGapFrame(n: WireframeNode): boolean {
  if (n.type !== "frame") return false;
  if (n.children.length > 0) return false;
  if (n.isPlaceholder || n.imageUrl || n.computedStyles?.svgMarkup) return false;
  if (paintsBox(n)) return false;
  if (carriesHoverIdentity(n)) return false;
  if (n.linkReactionUrl || n.linkAnchorId || n.anchorId) return false;
  if (n.position === "absolute" || n.position === "fixed" || n.position === "sticky") return false;
  if (n.transform != null) return false;
  const m = n.margin;
  if (m && (m.top || m.right || m.bottom || m.left)) return false;

  // Below VISIBLE_GAP the browser painted nothing between the runs, so there is
  // no space to restore; above the band it is a layout box, not a glyph.
  return n.width >= VISIBLE_GAP && n.width <= MAX_SPACE_FRAME_WIDTH;
}

/**
 * The separator for two runs separated by a space frame, or null to refuse.
 *
 * `rowSeparator` cannot serve here. In a HORIZONTAL parent it requires the gap
 * to equal `itemSpacing`, and the whole point of this case is that the space
 * owns a flow slot of its own: on chroniclehq.com's hero the parent's
 * `itemSpacing` is 0 while the two words are 11.18px apart. The bridge has
 * better evidence than a spacing match — the frame IS the space the browser
 * measured, so the test is that it sits in the flow directly between the runs,
 * touching each.
 */
function bridgedSeparator(
  parent: WireframeNode,
  a: WireframeNode,
  gapFrame: WireframeNode,
  b: WireframeNode,
): string | null {
  if (parent.layoutMode !== "HORIZONTAL" && parent.layoutMode !== "NONE") return null;
  if (Math.abs(b.y - a.y) > Math.max(2, a.height * 0.2)) return null;
  if (Math.abs(b.height - a.height) > HEIGHT_TOLERANCE) return null;

  const slack = parent.layoutMode === "HORIZONTAL" ? parent.itemSpacing : 0;
  const before = gapFrame.x - (a.x + a.width);
  const after = b.x - (gapFrame.x + gapFrame.width);
  if (Math.abs(before - slack) > GEOMETRY_EPSILON) return null;
  if (Math.abs(after - slack) > GEOMETRY_EPSILON) return null;

  if (/\s$/.test(a.textContent) || /^\s/.test(b.textContent)) return "";
  return " ";
}

/**
 * A run made only of whitespace, with no ink and no box — h2d deletes these.
 *
 * Deliberately NOT an empty-string node: an empty TEXT is a glyph the capture
 * failed to read (an icon `::after`, say), and deleting content we merely could
 * not see is `dropUselessNodes`'s call to make, not this pass's. Out-of-flow
 * runs are skipped for the same reason they never merge — they are not part of
 * the sibling stream this pass reasons about.
 */
function isBlankRun(n: WireframeNode): boolean {
  return (
    n.type === "text" &&
    n.children.length === 0 &&
    n.textContent.length > 0 &&
    n.textContent.trim() === "" &&
    n.position !== "absolute" &&
    n.position !== "fixed" &&
    n.position !== "sticky" &&
    !n.isPlaceholder &&
    !n.imageUrl &&
    !paintsBox(n) &&
    !carriesHoverIdentity(n) &&
    !n.linkReactionUrl &&
    !n.linkAnchorId &&
    !n.anchorId
  );
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

/** Same rule collectTextSegments uses for a node without styled segments. */
function textDecorationOf(n: WireframeNode): TextSegment["textDecoration"] {
  const raw =
    n.computedStyles?.["text-decoration"] ||
    n.computedStyles?.["text-decoration-line"] ||
    "";
  if (raw.includes("underline")) return "underline";
  if (raw.includes("line-through")) return "line-through";
  return undefined;
}

/**
 * This run as segments, with every inherited value MATERIALIZED.
 *
 * A segment omits what it shares with its host (`letterSpacing` is emitted only
 * when it differs — text.ts:1810). After the merge the host is the FIRST run,
 * so a second run's omitted values would silently become the first run's.
 * Writing them out makes each segment self-describing; createTextNode still
 * skips the range call whenever the value matches the merged node's.
 */
function segmentsOf(n: WireframeNode): TextSegment[] {
  const source: TextSegment[] =
    n.styledSegments && n.styledSegments.length > 0
      ? n.styledSegments
      : [
          {
            text: n.textContent,
            color: n.textColor,
            fontWeight: n.fontWeight,
            fontSize: n.fontSize,
            fontFamily: n.fontFamily,
            fontFamilyList: n.fontFamilyList,
            fontStyle: n.fontStyle,
            platformPostScript: n.platformPostScript,
            tag: n.tag,
            isLink: n.tag.toLowerCase() === "a" || !!n.href,
            href: n.href,
            textDecoration: textDecorationOf(n),
            textDecorationStyle: n.textDecorationStyle,
            textDecorationColor: n.textDecorationColor,
          },
        ];

  return source.map((s) => ({
    ...s,
    color: s.color ?? n.textColor,
    fontSize: s.fontSize || n.fontSize,
    fontWeight: s.fontWeight || n.fontWeight,
    fontFamily: s.fontFamily ?? n.fontFamily,
    fontFamilyList: s.fontFamilyList ?? n.fontFamilyList,
    href: s.href ?? n.href,
    letterSpacing: s.letterSpacing ?? n.letterSpacing,
    lineHeight: s.lineHeight ?? n.lineHeight,
    textCase: s.textCase ?? n.textCase,
    platformPostScript: s.platformPostScript ?? n.platformPostScript,
  }));
}

/** The layer name the converter derives from a run's text (getTextNodeName). */
function textLayerName(value: string): string {
  return value.replace(/\s+/g, " ").slice(0, 30);
}

/**
 * The restored separator as a run of its OWN.
 *
 * It cannot ride on either neighbour: in `<p>The <b>fast</b> way</p>` the
 * whitespace is a child of the `<p>`, so the browser advanced it by a REGULAR
 * space — appending it to the bold run would advance it by a bold one and push
 * every glyph after it sideways. The parent frame carries exactly the computed
 * style the whitespace inherited.
 */
function separatorSegment(parent: WireframeNode, host: WireframeNode, text: string): TextSegment {
  return {
    text,
    color: parent.textColor ?? host.textColor,
    fontWeight: parent.fontWeight || host.fontWeight,
    fontSize: parent.fontSize || host.fontSize,
    fontFamily: parent.fontFamily || host.fontFamily,
    fontFamilyList: parent.fontFamilyList ?? host.fontFamilyList,
    fontStyle: parent.fontStyle,
    tag: parent.tag,
    letterSpacing: parent.letterSpacing ?? host.letterSpacing,
    lineHeight: parent.lineHeight ?? host.lineHeight,
    textCase: host.textCase,
  };
}

/**
 * Fold `b` into `a`. `a` survives, carrying both runs' characters and one
 * segment per original run (plus one for a restored separator).
 */
function mergeRuns(
  parent: WireframeNode,
  a: WireframeNode,
  b: WireframeNode,
  separator: string,
): void {
  const segsA = segmentsOf(a);
  const segsB = segmentsOf(b);
  if (separator) segsA.push(separatorSegment(parent, a, separator));

  // Recompute the name only when it still IS the text — an icon class or a
  // `div.foo` selector name (htmlLayerNames) is an identity, not a caption.
  const nameWasText = a.name === textLayerName(a.textContent);

  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  a.width = b.x + b.width - a.x;
  a.y = top;
  a.height = bottom - top;

  a.textContent = a.textContent + separator + b.textContent;
  a.styledSegments = [...segsA, ...segsB];
  // The segment texts now carry every separator the browser painted, so
  // createTextNode must not add one of its own.
  a.exactSegments = true;

  // One line, spanning the merged box.
  a.renderedTextWidth = a.width;
  a.renderedTextWidths = undefined;
  a.browserLineCount = 1;

  // A node-level hyperlink paints over EVERY character, so it survives only
  // when both runs agree; otherwise the per-segment hrefs drive the per-range
  // setter (text.ts:1422).
  if (a.href !== b.href) a.href = undefined;

  if (nameWasText) a.name = textLayerName(a.textContent);
}

// ---------------------------------------------------------------------------
// Pass
// ---------------------------------------------------------------------------

/**
 * Merge adjacent inline TEXT siblings, bottom-up, and delete the whitespace-only
 * runs no merge absorbed.
 *
 * The blank sweep is limited to `NONE` parents on purpose: in an auto-layout
 * parent a middle child owns a flow slot AND an `itemSpacing` gap, so deleting
 * it shifts every later sibling — exactly the kind of move this pass exists not
 * to make. Absolutely-placed children shift nothing.
 *
 * Returns true when anything changed — that is what drives simplifyTree's
 * fixpoint, so a pair made adjacent by a collapse in one sweep merges in the
 * next.
 */
export function mergeInlineTextRuns(root: WireframeNode): boolean {
  let changed = false;

  const visit = (n: WireframeNode): void => {
    for (const child of n.children) visit(child);
    if (n.children.length === 0) return;

    const kept: WireframeNode[] = [];
    for (let i = 0; i < n.children.length; i++) {
      const child = n.children[i];
      const prev = kept[kept.length - 1];
      if (prev && isMergeableRun(prev) && isMergeableRun(child) && compatible(prev, child)) {
        const separator = rowSeparator(n, prev, child);
        if (separator !== null) {
          mergeRuns(n, prev, child, separator);
          continue;
        }
      }

      // Three-node bridge: run | space frame | run. Only when BOTH neighbours
      // merge — `mergeRuns` widens the survivor across the frame's slot, so a
      // bridged frame costs no later sibling a pixel, while a trailing one
      // (nothing mergeable after it) would shorten a hugging row if removed.
      const next = n.children[i + 1];
      if (
        prev && next &&
        isGapFrame(child) &&
        isMergeableRun(prev) && isMergeableRun(next) && compatible(prev, next)
      ) {
        const separator = bridgedSeparator(n, prev, child, next);
        if (separator !== null) {
          mergeRuns(n, prev, next, separator);
          i++; // `next` was consumed along with the frame
          continue;
        }
      }

      kept.push(child);
    }

    const swept = n.layoutMode === "NONE" ? kept.filter((c) => !isBlankRun(c)) : kept;
    if (swept.length !== n.children.length) changed = true;
    n.children = swept;
  };

  visit(root);
  return changed;
}
