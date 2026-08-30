/**
 * CSS `clip-path` → the parts of it Figma can express natively.
 *
 * An inventory of the captures on disk (stripe.com: 358 nodes carrying a
 * clip-path across 15 distinct values; iwm.org.uk: none) found that every
 * single value is an `inset()`. `polygon()`, `circle()`, `ellipse()`, `path()`
 * and `url(#id)` do not occur, and h2d's capture of the same page agrees.
 *
 * An `inset()` is an axis-aligned rounded rectangle, which Figma already has:
 * `clipsContent` for the clipping and `cornerRadius` for the `round` part. No
 * vector mask is built. A mask in Figma is a sibling node — it would take an
 * auto-layout slot, disturb the child stacking order and add a layer to every
 * frame, all to draw a rectangle the frame can draw itself.
 *
 * Every shape we cannot express returns `null`, and the callers then leave the
 * node exactly as it renders today: an unclipped rectangle.
 */

export interface InsetClip {
  /** Resolved px insets, in CSS `top right bottom left` order. Negative values
   *  (which grow the clip region past the border box) are clamped to 0. */
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** The `round <length>` radius in px, or null when absent or not a px value. */
  radius: number | null;
  /** The clip region has no area — the element paints nothing at all. */
  fullyClipped: boolean;
  /** Nothing to apply: no side is inset and there is no radius. */
  isNoOp: boolean;
}

interface Length {
  value: number;
  isPercent: boolean;
}

/** `12px` / `99.7418%` → a length. Anything else (em, calc(), var()) → null. */
function parseLength(token: string): Length | null {
  const px = token.match(/^(-?\d*\.?\d+)px$/);
  if (px) return { value: parseFloat(px[1]), isPercent: false };
  const pct = token.match(/^(-?\d*\.?\d+)%$/);
  if (pct) return { value: parseFloat(pct[1]), isPercent: true };
  // A bare `0` is valid CSS anywhere a length is.
  if (/^-?0(\.0+)?$/.test(token)) return { value: 0, isPercent: false };
  return null;
}

/** Resolve a length against the axis it is measured on, clamped to >= 0. */
function resolve(length: Length, axis: number): number {
  const px = length.isPercent ? (length.value / 100) * axis : length.value;
  return px > 0 ? px : 0;
}

/**
 * Parse a computed `clip-path` value into the rounded rectangle it describes.
 *
 * `width` / `height` are the element's captured box, needed to resolve the
 * percentage forms — 163 of stripe.com's 358 clipped nodes use one.
 *
 * Returns null for every shape we decline, which is the signal to change
 * nothing about the node.
 */
export function parseInsetClipPath(
  cp: string | undefined | null,
  width: number,
  height: number,
): InsetClip | null {
  if (!cp) return null;
  const value = cp.trim();
  if (!value || value === "none") return null;

  const body = value.match(/^inset\((.*)\)$/i)?.[1]?.trim();
  if (!body) return null;

  // `inset(<length>{1,4} [round <border-radius>])`
  const roundAt = body.search(/\bround\b/i);
  const sidesPart = (roundAt === -1 ? body : body.slice(0, roundAt)).trim();
  const roundPart = roundAt === -1 ? "" : body.slice(roundAt).replace(/^round\b/i, "").trim();

  const tokens = sidesPart.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 1 || tokens.length > 4) return null;

  const lengths: Length[] = [];
  for (const token of tokens) {
    const length = parseLength(token);
    if (!length) return null;
    lengths.push(length);
  }

  // CSS box shorthand expansion.
  const [t, r = t, b = t, l = r] = lengths;

  const top = resolve(t, height);
  const right = resolve(r, width);
  const bottom = resolve(b, height);
  const left = resolve(l, width);

  // Percentage radii resolve per-axis in CSS; Figma has a single number per
  // corner. Rather than guess, keep the clipping and drop the rounding.
  let radius: number | null = null;
  if (roundPart) {
    const first = parseLength(roundPart.split(/\s+/)[0]);
    if (first && !first.isPercent && first.value > 0) radius = first.value;
  }

  // Sub-pixel remainders count as fully clipped: stripe.com ships
  // `inset(0px 0px 99.7418%)`, which leaves 0.77px of a 300px box showing.
  // That is the same sliver-sized artifact isScreenReaderOnlyBox already drops
  // at its own 1px threshold, and Figma has no way to draw it usefully.
  //
  // The `> 0` guards protect the zero-size box: `inset(0px)` on a 0-wide
  // wrapper must not read as "paints nothing" — such wrappers legitimately
  // show absolutely-positioned children.
  const fullyClipped =
    (left + right > 0 && width - (left + right) < 1) ||
    (top + bottom > 0 && height - (top + bottom) < 1);

  const isNoOp = top === 0 && right === 0 && bottom === 0 && left === 0 && radius === null;

  return { top, right, bottom, left, radius, fullyClipped, isNoOp };
}

/** Does this clip actually cut anything off the box? */
export function insetClips(clip: InsetClip): boolean {
  return clip.top > 0 || clip.right > 0 || clip.bottom > 0 || clip.left > 0;
}

interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/**
 * Fold a clip-path's `round` radius into the element's own border radius.
 *
 * `border-radius` and `clip-path` both clip in CSS, so what you see is their
 * intersection — visually, the tighter rounding. A corner with no border
 * radius simply takes the clip's.
 */
export function intersectRadii(css: CornerRadii, clipRadius: number): CornerRadii {
  const tighter = (corner: number): number =>
    corner > 0 ? Math.min(corner, clipRadius) : clipRadius;
  return {
    topLeft: tighter(css.topLeft),
    topRight: tighter(css.topRight),
    bottomRight: tighter(css.bottomRight),
    bottomLeft: tighter(css.bottomLeft),
  };
}
