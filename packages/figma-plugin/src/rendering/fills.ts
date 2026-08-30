/**
 * Fill, stroke, and effect conversion for Figma
 * Converts FigmaFill[], FigmaStroke[], FigmaEffect[] to Figma native formats
 */

import type { FigmaFill, FigmaStroke, FigmaEffect, FigmaColor, RenderContext } from "../types";
import {
  cssColorToFigmaRGB,
  hexToFigmaRGB,
  isLightColorValue,
  isSaturatedColor,
  determineColorRole,
  getAlternativePluginColor,
} from "./colors";
import {
  calculateConicGradientTransform,
  calculateRadialGradientTransform,
  calculateLinearGradientTransform,
} from "./gradients";
import { parseImageSize, computeCoverCropTransform, computeBackgroundLayout } from "./imageCrop";
import { logger } from "../utils/logger";
import { recordWarning } from "./diagnostics";
import * as perf from "../utils/perf";

// ============================================================================
// Blend Mode Mapping (CSS mix-blend-mode / background-blend-mode → Figma)
// ============================================================================

const CSS_TO_FIGMA_BLEND_MODE: Record<string, BlendMode> = {
  "multiply": "MULTIPLY",
  "screen": "SCREEN",
  "overlay": "OVERLAY",
  "darken": "DARKEN",
  "lighten": "LIGHTEN",
  "color-dodge": "COLOR_DODGE",
  "color-burn": "COLOR_BURN",
  "hard-light": "HARD_LIGHT",
  "soft-light": "SOFT_LIGHT",
  "difference": "DIFFERENCE",
  "exclusion": "EXCLUSION",
  "hue": "HUE",
  "saturation": "SATURATION",
  "color": "COLOR",
  "luminosity": "LUMINOSITY",
};

/**
 * Maps a CSS blend-mode value to a Figma BlendMode.
 * Returns undefined for "normal", unknown, or empty values.
 */
export function mapCSSBlendMode(
  cssBlendMode: string | undefined
): BlendMode | undefined {
  if (!cssBlendMode) return undefined;
  return CSS_TO_FIGMA_BLEND_MODE[cssBlendMode];
}

/**
 * Per-paint blend mode from CSS `background-blend-mode`. Figma's Paint
 * blendMode is the exact 1:1 slot; it used to be hardcoded "NORMAL", so
 * multiply-tinted heroes and duotone stacks rendered as plain layers.
 */
function paintBlendMode(fill: FigmaFill): BlendMode {
  return mapCSSBlendMode(fill.blendMode) ?? "NORMAL";
}

// ============================================================================
// Fill Conversion
// ============================================================================

/**
 * Convert FigmaFill[] array to Figma Paint[] array
 *
 * IMPORTANT: CSS backgrounds are top-to-bottom (first = top layer)
 * Figma fills are bottom-to-top (first = bottom layer)
 * So we REVERSE the order at the end!
 */
export function convertFillsToPaints(
  fills: FigmaFill[] | undefined,
  context: RenderContext,
  tag?: string,
  className?: string,
  /** The node these paints are destined for — used only to attribute a
   *  failed background-image decode to a clickable layer in the report. */
  owner?: { id?: string; name?: string }
): Paint[] {
  if (!fills || fills.length === 0) return [];

  const paints: Paint[] = [];
  const parentBg = context.parentBackgroundColor;

  for (const fill of fills) {
    if (!fill.visible) continue;

    switch (fill.type) {
      case "SOLID":
        if (fill.color) {
          // When colorMode is "plugin", map solid colors to plugin palette
          let finalColor = {
            r: fill.color.r,
            g: fill.color.g,
            b: fill.color.b,
          };
          if (context.colorMode === "plugin") {
            const isLight = isLightColorValue(fill.color);
            const isSaturated = isSaturatedColor(fill.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);

            // Override: Saturated fills on cards/containers → secondary (highlighted)
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }

            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              finalColor = pluginColorRGB.color;
            }
          }
          const solidPaint: SolidPaint = {
            type: "SOLID",
            color: finalColor,
            opacity: context.colorMode === "plugin" ? 1.0 : fill.opacity,
            blendMode: paintBlendMode(fill),
          };
          paints.push(solidPaint);
        }
        break;

      case "GRADIENT_LINEAR":
        if (fill.stops && fill.stops.length >= 2) {
          if (context.colorMode === "plugin") {
            // In plugin mode, convert gradients to solid colors
            const dominantStop = fill.stops[0];
            const isLight = isLightColorValue(dominantStop.color);
            const isSaturated = isSaturatedColor(dominantStop.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }
            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              paints.push({
                type: "SOLID",
                color: pluginColorRGB.color,
                opacity: 1.0,
              });
            }
          } else {
            // Website colors mode - preserve gradient
            const linearPaint: GradientPaint = {
              type: "GRADIENT_LINEAR",
              opacity: fill.opacity ?? 1,
              blendMode: paintBlendMode(fill),
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              // `?? 180` — angle 0 (`to top` / `0deg`) is a valid value; `||`
              // treated it as unset and flipped every top-pointing gradient.
              gradientTransform: calculateLinearGradientTransform(
                fill.angle ?? 180,
                fill.elementWidth,
                fill.elementHeight
              ),
            };
            paints.push(linearPaint);
          }
        }
        break;

      case "GRADIENT_RADIAL":
        if (fill.stops && fill.stops.length >= 2) {
          if (context.colorMode === "plugin") {
            const dominantStop = fill.stops[0];
            const isLight = isLightColorValue(dominantStop.color);
            const isSaturated = isSaturatedColor(dominantStop.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }
            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              paints.push({
                type: "SOLID",
                color: pluginColorRGB.color,
                opacity: 1.0,
              });
            }
          } else {
            const radialTransform = calculateRadialGradientTransform(fill);
            const radialPaint: GradientPaint = {
              type: "GRADIENT_RADIAL",
              opacity: fill.opacity ?? 1,
              blendMode: paintBlendMode(fill),
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              gradientTransform: radialTransform,
            };
            paints.push(radialPaint);
          }
        }
        break;

      case "GRADIENT_CONIC":
        if (fill.stops && fill.stops.length >= 2) {
          if (context.colorMode === "plugin") {
            const dominantStop = fill.stops[0];
            const isLight = isLightColorValue(dominantStop.color);
            const isSaturated = isSaturatedColor(dominantStop.color);
            let role = determineColorRole("fill", tag, isLight, undefined, className);
            if (isSaturated && !isLight && role === "surface") {
              role = "secondary";
            }
            const pluginColorHex = getAlternativePluginColor(role, context.pluginColors, parentBg);
            const pluginColorRGB = cssColorToFigmaRGB(pluginColorHex);
            if (pluginColorRGB) {
              paints.push({
                type: "SOLID",
                color: pluginColorRGB.color,
                opacity: 1.0,
              });
            }
          } else {
            const angularPaint: GradientPaint = {
              type: "GRADIENT_ANGULAR",
              opacity: fill.opacity ?? 1,
              blendMode: paintBlendMode(fill),
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              // `from <angle>` / `at <pos>` — CSS 0deg starts at 12 o'clock,
              // Figma's angular at 3 o'clock, so even default conics need it.
              gradientTransform: calculateConicGradientTransform(
                fill.angle ?? 0,
                fill.center?.x ?? 0.5,
                fill.center?.y ?? 0.5,
              ),
            };
            paints.push(angularPaint);
          }
        }
        break;

      case "IMAGE_PLACEHOLDER": {
        const dataUri = fill.imageUrl ? context.assetsMap?.get(fill.imageUrl) : undefined;
        // SVG data URIs cannot be consumed by figma.createImage (would throw).
        // Vector conversion for background SVGs is handled upstream in
        // css-converter (synthetic child placeholder). Skip raster path for SVGs.
        const isSvgAsset = dataUri?.startsWith("data:image/svg") ?? false;

        if (dataUri && !isSvgAsset) {
          try {
            const commaIndex = dataUri.indexOf(",");
            if (commaIndex > 0) {
              // Strip whitespace/newlines, then pad to multiple of 4 so charCodeAt
              // never reads past the string end (which returned NaN → garbage bytes).
              let base64Str = dataUri.substring(commaIndex + 1).replace(/\s+/g, "");
              while (base64Str.length % 4 !== 0) base64Str += "=";
              // Decode base64 to bytes (pure JS — no atob in Figma sandbox)
              const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
              const lookup = new Uint8Array(256);
              for (let k = 0; k < B64.length; k++) lookup[B64.charCodeAt(k)] = k;
              let bufLen = Math.floor(base64Str.length * 3 / 4);
              if (base64Str[base64Str.length - 1] === "=") bufLen--;
              if (base64Str[base64Str.length - 2] === "=") bufLen--;
              const bytes = new Uint8Array(bufLen);
              let p = 0;
              for (let k = 0; k < base64Str.length; k += 4) {
                const a = lookup[base64Str.charCodeAt(k)];
                const b = lookup[base64Str.charCodeAt(k + 1)];
                const c = lookup[base64Str.charCodeAt(k + 2)];
                const d = lookup[base64Str.charCodeAt(k + 3)];
                if (p < bufLen) bytes[p++] = (a << 2) | (b >> 4);
                if (p < bufLen) bytes[p++] = ((b & 15) << 4) | (c >> 2);
                if (p < bufLen) bytes[p++] = ((c & 3) << 6) | d;
              }
              const image = __W2W_DEV_LOG__
                ? perf.timedSync("node.bgImage", () => figma.createImage(bytes), true)
                : figma.createImage(bytes);
              let scaleMode = fill.scaleMode ?? "FILL";
              let imageTransform: Transform | undefined;
              let tileScalingFactor: number | undefined;

              // h2d-style pipeline: when the converter forwarded the raw
              // background-size/repeat/position strings and the natural size
              // is readable, compute the painted size and the exact CROP/TILE
              // layout. The legacy FILL/FIT path below stays the fallback.
              if (
                (fill.cssSize !== undefined ||
                  fill.cssRepeat !== undefined ||
                  fill.cssPosition !== undefined) &&
                fill.elementWidth &&
                fill.elementHeight
              ) {
                const natural = parseImageSize(bytes);
                if (natural) {
                  const layout = computeBackgroundLayout(
                    natural.width,
                    natural.height,
                    fill.elementWidth,
                    fill.elementHeight,
                    fill.cssSize,
                    fill.cssRepeat,
                    fill.cssPosition
                  );
                  if (layout) {
                    if (layout.mode === "TILE") {
                      scaleMode = "TILE";
                      tileScalingFactor = Math.max(0.01, Math.min(4, layout.scalingFactor));
                    } else {
                      scaleMode = "CROP";
                      imageTransform = layout.transform as Transform;
                    }
                  }
                }
              }

              // background-position on a cover layer → CROP + imageTransform.
              // FILL always center-crops; the author's focus point (e.g.
              // `center 30%` hero) needs the crop rectangle spelled out.
              if (
                !imageTransform &&
                tileScalingFactor === undefined &&
                scaleMode === "FILL" &&
                fill.position &&
                fill.elementWidth &&
                fill.elementHeight
              ) {
                const size = parseImageSize(bytes);
                if (size) {
                  const crop = computeCoverCropTransform(
                    size.width,
                    size.height,
                    fill.elementWidth,
                    fill.elementHeight,
                    fill.position.x,
                    fill.position.y
                  );
                  if (crop) {
                    scaleMode = "CROP";
                    imageTransform = crop as Transform;
                  }
                }
              }

              paints.push({
                type: "IMAGE",
                imageHash: image.hash,
                scaleMode,
                ...(imageTransform ? { imageTransform } : {}),
                // TILE renders the image at natural size × scalingFactor.
                // When the converter forwarded a CSS px background-size,
                // scale the natural size to it (a 200px texture tiled at
                // 40px needs 0.2); otherwise tile 1:1.
                ...(scaleMode === "TILE"
                  ? {
                      scalingFactor: (() => {
                        if (tileScalingFactor !== undefined) {
                          return tileScalingFactor;
                        }
                        if (fill.tileSize && fill.tileSize.width > 0) {
                          const natural = parseImageSize(bytes);
                          if (natural && natural.width > 0) {
                            const factor = fill.tileSize.width / natural.width;
                            if (isFinite(factor) && factor > 0) {
                              return Math.max(0.01, Math.min(4, factor));
                            }
                          }
                        }
                        return 1;
                      })(),
                    }
                  : {}),
                // CSS filter: grayscale(N) → Figma per-paint saturation
                // adjustment (−1 = fully desaturated).
                ...(typeof fill.imageSaturation === "number"
                  ? { filters: { saturation: Math.max(-1, Math.min(1, fill.imageSaturation)) } }
                  : {}),
                visible: true,
                opacity: 1,
                blendMode: paintBlendMode(fill),
              } as Paint);
              break;
            }
          } catch {
            // Image load failed — fall through to solid surface color fallback.
            // Report it: the solid grey that replaces the background is
            // otherwise indistinguishable from a designed one.
            recordWarning(context, {
              category: "image",
              message: "Background image could not be decoded — replaced with a solid fill",
              nodeId: owner?.id,
              layerName: owner?.name,
            });
          }
        }
        // Fallback: solid surface color
        const surfaceRgb = hexToFigmaRGB(context.pluginColors.surface);
        paints.push({
          type: "SOLID",
          color: surfaceRgb,
          opacity: context.colorMode === "plugin" ? 1.0 : fill.opacity,
        });
        break;
      }
    }
  }

  // CRITICAL: Reverse the order!
  // CSS backgrounds: first = top layer (front)
  // Figma fills: first = bottom layer (back)
  return paints.reverse();
}

// ============================================================================
// Stroke Conversion
// ============================================================================

// ----------------------------------------------------------------------------
// Two-color border gradients (h2d parity: uD app.js:46135, mD :46646,
// CD :47261). Figma allows ONE stroke paint per frame, so mixed border colors
// are reproduced with a hard-edged gradient whose split line follows the
// border edge / miter diagonal.
// ----------------------------------------------------------------------------

/** Row-major affine {a,b,c,d,e,f} — the transformation-matrix convention
 *  h2d composes its border gradients with. */
type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

const affTranslate = (tx: number, ty: number): Affine =>
  ({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });

const affRotate = (rad: number): Affine => {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
};

const affScale = (sx: number, sy: number): Affine =>
  ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });

/** m1 · m2 — m2 is applied to a point first. */
const affMultiply = (m1: Affine, m2: Affine): Affine => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
  e: m1.a * m2.e + m1.c * m2.f + m1.e,
  f: m1.b * m2.e + m1.d * m2.f + m1.f,
});

const affCompose = (...ms: Affine[]): Affine => ms.reduce(affMultiply);

/** Scale around a pivot point. */
const affScaleAt = (sx: number, sy: number, cx: number, cy: number): Affine =>
  affCompose(affTranslate(cx, cy), affScale(sx, sy), affTranslate(-cx, -cy));

/** Affine → Figma Transform rows, snapping float noise to 0 (h2d's xc). */
const affToTransform = (m: Affine): Transform => {
  const snap = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);
  return [
    [snap(m.a), snap(m.c), snap(m.e)],
    [snap(m.b), snap(m.d), snap(m.f)],
  ];
};

function strokeColorsEqual(a: FigmaColor, b: FigmaColor): boolean {
  const eps = 1e-4;
  return (
    Math.abs(a.r - b.r) < eps &&
    Math.abs(a.g - b.g) < eps &&
    Math.abs(a.b - b.b) < eps &&
    Math.abs((a.a ?? 1) - (b.a ?? 1)) < eps
  );
}

/**
 * Build the two-color border gradient paint, or null when the arrangement
 * has no h2d mapping (the caller then falls back to the first color and
 * logs it). Sides are CSS order: [top, right, bottom, left].
 */
function twoColorBorderPaint(
  colors: (FigmaColor | undefined)[],
  weights: number[],
  width: number,
  height: number,
): GradientPaint | null {
  const visible = [0, 1, 2, 3].filter((i) => colors[i] && weights[i] > 0);

  const gradientStop = (color: FigmaColor, position: number) => ({
    position,
    color: { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 },
  });

  // --- Exactly two visible sides → hard-split linear (h2d mD) -------------
  if (visible.length === 2) {
    const has = (i: number) => visible.includes(i);
    let start: FigmaColor;
    let end: FigmaColor;
    let m: Affine;
    if (has(0) && has(3)) {
      // top + left: split along the top-left miter diagonal
      const b = Math.atan2(weights[0], weights[3]);
      start = colors[3]!;
      end = colors[0]!;
      m = affCompose(affTranslate(0, 0.5), affRotate(b), affScale(1, height / width));
    } else if (has(1) && has(2)) {
      // right + bottom
      const b = Math.atan2(weights[2], weights[1]);
      start = colors[2]!;
      end = colors[1]!;
      m = affCompose(
        affTranslate(0, 0.5),
        affRotate(b),
        affTranslate(-1, -1),
        affScale(1, height / width),
      );
    } else if (has(2) && has(3)) {
      // bottom + left
      const b = Math.atan2(weights[2], weights[3]);
      start = colors[3]!;
      end = colors[2]!;
      m = affCompose(
        affTranslate(0, 0.5),
        affRotate(-b),
        affTranslate(0, -1),
        affScale(1, height / width),
      );
    } else if (has(0) && has(1)) {
      // top + right
      const b = Math.atan2(weights[0], weights[1]);
      start = colors[0]!;
      end = colors[1]!;
      m = affCompose(
        affTranslate(0, 0.5),
        affRotate(-b),
        affTranslate(-1, 0),
        affScale(1, height / width),
      );
    } else if (has(1) && has(3)) {
      // left + right (opposite): split at the left border's inner edge
      start = colors[3]!;
      end = colors[1]!;
      m = affTranslate(-weights[3] / width, 0);
    } else {
      // top + bottom (opposite): split at the bottom border's inner edge
      start = colors[2]!;
      end = colors[0]!;
      m = affCompose(
        affTranslate(0, 0.5),
        affRotate(Math.PI / 2),
        affTranslate(-0.5, weights[2] / height - 1),
      );
    }
    return {
      type: "GRADIENT_LINEAR",
      gradientStops: [gradientStop(start, 0), gradientStop(end, 0)],
      gradientTransform: affToTransform(m),
    };
  }

  // --- One side differs → diamond with miter joins (h2d CD) ---------------
  // q = the side OPPOSITE the uniquely-colored one; the diamond is centered
  // on the unique side's edge midpoint so its contour follows the miters.
  let q = -1;
  let unique = -1;
  let common: FigmaColor | undefined;
  if (visible.length === 3) {
    const missing = [0, 1, 2, 3].find((i) => !visible.includes(i))!;
    const p1 = (missing + 1) % 4;
    const p2 = (missing + 3) % 4;
    if (
      strokeColorsEqual(colors[p1]!, colors[p2]!) &&
      weights[p1] === weights[p2] &&
      !strokeColorsEqual(colors[(missing + 2) % 4]!, colors[p1]!)
    ) {
      q = missing;
      unique = (missing + 2) % 4;
      common = colors[p1];
    }
  } else if (visible.length === 4) {
    for (let d = 0; d < 4; d++) {
      const others = [0, 1, 2, 3].filter(
        (i) => i !== d && strokeColorsEqual(colors[i]!, colors[d]!),
      );
      if (others.length !== 0) continue;
      const s = (d + 1) % 4;
      const h = (d + 3) % 4;
      if (weights[s] !== weights[h]) return null;
      // The miter apex of side d must fit inside the box, else the diamond
      // cannot represent the join (h2d's size condition).
      const ratio = weights[d] / weights[s];
      const apex = (ratio * (d === 0 || d === 2 ? width : height)) / 2;
      const g = (d + 2) % 4;
      if ((d === 0 || d === 2 ? height : width) - weights[g] > apex) {
        q = g;
        unique = d;
        common = colors[s];
      }
      break;
    }
  }
  if (q === -1 || !common || !colors[unique]) return null;

  const k = width / height;
  let m: Affine;
  switch (q) {
    case 0: // unique side = bottom
      m = affCompose(
        affTranslate(0, -0.5),
        affScaleAt(1, weights[1] / (k * weights[2]), 0.5, 1),
      );
      break;
    case 1: // unique side = left
      m = affCompose(
        affTranslate(0.5, 0),
        affScaleAt((k * weights[0]) / weights[3], 1, 0, 0.5),
      );
      break;
    case 2: // unique side = top
      m = affCompose(
        affTranslate(0, 0.5),
        affScaleAt(1, weights[1] / (k * weights[0]), 0.5, 0),
      );
      break;
    default: // q = 3, unique side = right
      m = affCompose(
        affTranslate(-0.5, 0),
        affScaleAt((k * weights[0]) / weights[1], 1, 1, 0.5),
      );
      break;
  }
  return {
    type: "GRADIENT_DIAMOND",
    gradientStops: [
      gradientStop(colors[unique]!, 0.9999999),
      gradientStop(common, 1),
    ],
    gradientTransform: affToTransform(m),
  };
}

/**
 * Convert FigmaStroke[] to Figma strokes.
 *
 * Figma constraint: a single FrameNode has ONE paint for `frame.strokes` and
 * ONE `dashPattern`, but supports per-side `strokeTopWeight` /
 * `strokeRightWeight` / `strokeBottomWeight` / `strokeLeftWeight` via
 * IndividualStrokesMixin. So we:
 *   1. Pick a representative color + style from the first non-zero stroke
 *      (for mixed colors/styles across sides — rare, Figma can't fully honor).
 *   2. Compute per-side weights from the `.sides` flags of every stroke.
 *   3. Return `individualWeights` only when sides actually differ, so the
 *      common uniform case still sets `frame.strokeWeight` as before.
 *
 * In plugin colors mode: ALL strokes/borders use text color (#11151A).
 */
export function convertStrokesToFigma(
  strokes: FigmaStroke[] | undefined,
  context?: RenderContext,
  frameWidth?: number,
  frameHeight?: number
): {
  paints: Paint[];
  weight: number;
  individualWeights?: { top: number; right: number; bottom: number; left: number };
  style: "SOLID" | "DASHED" | "DOTTED";
} {
  if (!strokes || strokes.length === 0) {
    return { paints: [], weight: 0, style: "SOLID" };
  }

  // Pick representative (first) stroke for color/style.
  const firstStroke = strokes[0];

  // Accumulate per-side weights across all strokes. Also track per-side
  // colors (CSS order [top, right, bottom, left]) for the two-color
  // gradient path below.
  const perSide = { top: 0, right: 0, bottom: 0, left: 0 };
  const sideColors: (FigmaColor | undefined)[] = [undefined, undefined, undefined, undefined];
  let anySides = false;
  let allSidesFlag = false;
  for (const s of strokes) {
    if (!s.sides) {
      // No sides info → apply weight to all 4 sides (legacy uniform).
      perSide.top = Math.max(perSide.top, s.weight);
      perSide.right = Math.max(perSide.right, s.weight);
      perSide.bottom = Math.max(perSide.bottom, s.weight);
      perSide.left = Math.max(perSide.left, s.weight);
      sideColors[0] = sideColors[0] ?? s.color;
      sideColors[1] = sideColors[1] ?? s.color;
      sideColors[2] = sideColors[2] ?? s.color;
      sideColors[3] = sideColors[3] ?? s.color;
      continue;
    }
    anySides = true;
    if (s.sides.top) { perSide.top = Math.max(perSide.top, s.weight); sideColors[0] = sideColors[0] ?? s.color; }
    if (s.sides.right) { perSide.right = Math.max(perSide.right, s.weight); sideColors[1] = sideColors[1] ?? s.color; }
    if (s.sides.bottom) { perSide.bottom = Math.max(perSide.bottom, s.weight); sideColors[2] = sideColors[2] ?? s.color; }
    if (s.sides.left) { perSide.left = Math.max(perSide.left, s.weight); sideColors[3] = sideColors[3] ?? s.color; }
    if (s.sides.top && s.sides.right && s.sides.bottom && s.sides.left) {
      allSidesFlag = true;
    }
  }

  // Uniform case: one stroke with sides=all-true, OR per-side weights all equal.
  const uniformWeight =
    perSide.top === perSide.right &&
    perSide.right === perSide.bottom &&
    perSide.bottom === perSide.left;
  const isUniform =
    (strokes.length === 1 && (allSidesFlag || !anySides)) || uniformWeight;

  const representativeWeight = isUniform
    ? perSide.top
    : Math.max(perSide.top, perSide.right, perSide.bottom, perSide.left);

  // Two-color borders (h2d uD/mD/CD): Figma has ONE stroke paint per frame,
  // so `border-bottom: red` + `border-top: blue` used to collapse to red.
  // Exactly two distinct visible colors with a uniform SOLID style become a
  // hard-edged gradient paint; anything more complex falls back to the first
  // color — logged, not silent (h2d does the same).
  if (context?.colorMode !== "plugin" && frameWidth && frameHeight) {
    const visibleColors: FigmaColor[] = [];
    for (let i = 0; i < 4; i++) {
      const c = sideColors[i];
      if (!c || (c.a ?? 1) === 0) continue;
      if (!visibleColors.some((v) => strokeColorsEqual(v, c))) visibleColors.push(c);
    }
    const uniformSolid = strokes.every((s) => s.style === "SOLID");
    if (visibleColors.length === 2 && uniformSolid) {
      const weights = [perSide.top, perSide.right, perSide.bottom, perSide.left];
      const gradient = twoColorBorderPaint(sideColors, weights, frameWidth, frameHeight);
      if (gradient) {
        return {
          paints: [gradient],
          weight: isUniform
            ? perSide.top
            : Math.max(perSide.top, perSide.right, perSide.bottom, perSide.left),
          individualWeights: isUniform ? undefined : perSide,
          style: firstStroke.style,
        };
      }
      logger.warn("Unsupported mixed border colors — falling back to first color", {
        colors: visibleColors.length,
      });
    } else if (visibleColors.length > 2 || (visibleColors.length === 2 && !uniformSolid)) {
      logger.warn("Unsupported mixed border colors — falling back to first color", {
        colors: visibleColors.length,
      });
    }
  }

  // In plugin colors mode: ALL strokes/borders use text color (#11151A)
  let paints: Paint[];
  if (context?.colorMode === "plugin" && context.pluginColors) {
    const textColor = hexToFigmaRGB(context.pluginColors.text);
    // Fully invisible borders (a=0, nicepage gutter) must stay invisible in
    // plugin-colors mode too — forcing 1.0 would paint them. Semi-transparent
    // borders still normalize to 1.0 for clean wireframes.
    paints = [{ type: "SOLID", color: textColor, opacity: firstStroke.color.a === 0 ? 0 : 1.0 }];
  } else {
    paints = [{
      type: "SOLID",
      color: { r: firstStroke.color.r, g: firstStroke.color.g, b: firstStroke.color.b },
      opacity: firstStroke.color.a,
    }];
  }

  return {
    paints,
    weight: representativeWeight,
    individualWeights: isUniform ? undefined : perSide,
    style: firstStroke.style,
  };
}

// ============================================================================
// Effect Conversion
// ============================================================================

/**
 * Convert FigmaEffect[] to Figma Effect[]
 * Handles: drop shadow, inner shadow, background blur, layer blur
 * In plugin colors mode: shadows and background blur are removed for clean wireframes
 */
export function convertEffectsToFigma(
  effects: FigmaEffect[] | undefined,
  context?: RenderContext
): Effect[] {
  if (!effects || effects.length === 0) return [];

  const figmaEffects: Effect[] = [];
  const isPluginColors = context?.colorMode === "plugin";

  for (const effect of effects) {
    if (!effect.visible) continue;

    switch (effect.type) {
      case "DROP_SHADOW":
        // Skip shadows in plugin colors mode - wireframes don't need shadows
        if (isPluginColors) continue;

        if (effect.color && effect.offset) {
          figmaEffects.push({
            type: "DROP_SHADOW",
            visible: true,
            color: {
              r: effect.color.r,
              g: effect.color.g,
              b: effect.color.b,
              a: effect.color.a,
            },
            offset: { x: effect.offset.x, y: effect.offset.y },
            radius: effect.radius || 0,
            spread: effect.spread || 0,
            blendMode: "NORMAL",
            showShadowBehindNode: false,
          });
        }
        break;

      case "INNER_SHADOW":
        // Skip shadows in plugin colors mode
        if (isPluginColors) continue;

        if (effect.color && effect.offset) {
          figmaEffects.push({
            type: "INNER_SHADOW",
            visible: true,
            color: {
              r: effect.color.r,
              g: effect.color.g,
              b: effect.color.b,
              a: effect.color.a,
            },
            offset: { x: effect.offset.x, y: effect.offset.y },
            radius: effect.radius || 0,
            spread: effect.spread || 0,
            blendMode: "NORMAL",
          });
        }
        break;

      case "BACKGROUND_BLUR":
        // Skip background blur in plugin colors mode
        if (isPluginColors) continue;

        figmaEffects.push({
          type: "BACKGROUND_BLUR",
          visible: true,
          radius: effect.blurRadius || effect.radius || 10,
        });
        break;

      case "LAYER_BLUR":
        figmaEffects.push({
          type: "LAYER_BLUR",
          visible: true,
          radius: effect.blurRadius || effect.radius || 10,
        });
        break;
    }
  }

  return figmaEffects;
}
