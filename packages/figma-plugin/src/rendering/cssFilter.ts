/**
 * CSS `filter` color functions → baked Figma paint colors.
 *
 * Figma has no subtree filter. A CSS color filter is a per-pixel affine color
 * map, and affine maps commute with alpha compositing, so applying the math to
 * every paint under the element matches filtering the flattened element (up to
 * per-step clamping). Math: W3C Filter Effects Level 1, §"filter functions".
 *
 * Raster IMAGE paints can't be recolored here: grayscale/saturate map onto the
 * paint's saturation adjustment, anything else is counted for the report.
 */

export type ColorFilterName =
  | "brightness"
  | "contrast"
  | "grayscale"
  | "hue-rotate"
  | "invert"
  | "opacity"
  | "saturate"
  | "sepia";

export interface ColorFilterOp {
  name: ColorFilterName;
  /** Fraction (1 = 100%), or degrees for hue-rotate. */
  amount: number;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const COLOR_FILTERS = new Set<string>([
  "brightness",
  "contrast",
  "grayscale",
  "hue-rotate",
  "invert",
  "opacity",
  "saturate",
  "sepia",
]);

/** Split a CSS filter list into `name(args)` pairs, balancing nested parens. */
function listFunctions(filter: string): { name: string; arg: string }[] {
  const out: { name: string; arg: string }[] = [];
  let i = 0;
  while (i < filter.length) {
    const open = filter.indexOf("(", i);
    if (open < 0) break;
    const name = filter.slice(i, open).trim().toLowerCase();
    let depth = 1;
    let j = open + 1;
    while (j < filter.length && depth > 0) {
      if (filter[j] === "(") depth++;
      else if (filter[j] === ")") depth--;
      j++;
    }
    out.push({ name, arg: filter.slice(open + 1, j - 1).trim() });
    i = j;
  }
  return out;
}

function parseAngle(arg: string): number {
  const n = parseFloat(arg);
  if (!Number.isFinite(n)) return 0;
  if (arg.endsWith("grad")) return n * 0.9;
  if (arg.endsWith("rad")) return (n * 180) / Math.PI;
  if (arg.endsWith("turn")) return n * 360;
  return n;
}

/** The color functions of a CSS filter list, in order, identities dropped. */
export function parseColorFilter(
  filter: string | undefined | null,
): ColorFilterOp[] {
  if (!filter || filter === "none") return [];
  const ops: ColorFilterOp[] = [];
  for (const { name, arg } of listFunctions(filter)) {
    if (!COLOR_FILTERS.has(name)) continue;
    let amount: number;
    if (name === "hue-rotate") {
      amount = arg === "" ? 0 : parseAngle(arg);
      if (amount % 360 === 0) continue;
    } else {
      const n = parseFloat(arg);
      amount =
        arg === "" || !Number.isFinite(n) ? 1 : arg.endsWith("%") ? n / 100 : n;
      if (amount < 0) amount = 0;
      // CSS clamps these to 100%; brightness/contrast/saturate may exceed it.
      if (
        name === "grayscale" ||
        name === "invert" ||
        name === "opacity" ||
        name === "sepia"
      ) {
        amount = Math.min(1, amount);
      }
      const identity =
        name === "grayscale" || name === "invert" || name === "sepia" ? 0 : 1;
      if (amount === identity) continue;
    }
    ops.push({ name: name as ColorFilterName, amount });
  }
  return ops;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

type Matrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function matrixFor(op: ColorFilterOp): Matrix | null {
  const a = op.amount;
  const x = 1 - a;
  switch (op.name) {
    case "grayscale":
      return [
        0.2126 + 0.7874 * x,
        0.7152 - 0.7152 * x,
        0.0722 - 0.0722 * x,
        0.2126 - 0.2126 * x,
        0.7152 + 0.2848 * x,
        0.0722 - 0.0722 * x,
        0.2126 - 0.2126 * x,
        0.7152 - 0.7152 * x,
        0.0722 + 0.9278 * x,
      ];
    case "sepia":
      return [
        0.393 + 0.607 * x,
        0.769 - 0.769 * x,
        0.189 - 0.189 * x,
        0.349 - 0.349 * x,
        0.686 + 0.314 * x,
        0.168 - 0.168 * x,
        0.272 - 0.272 * x,
        0.534 - 0.534 * x,
        0.131 + 0.869 * x,
      ];
    case "saturate":
      return [
        0.213 + 0.787 * a,
        0.715 - 0.715 * a,
        0.072 - 0.072 * a,
        0.213 - 0.213 * a,
        0.715 + 0.285 * a,
        0.072 - 0.072 * a,
        0.213 - 0.213 * a,
        0.715 - 0.715 * a,
        0.072 + 0.928 * a,
      ];
    case "hue-rotate": {
      const rad = (a * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      return [
        0.213 + 0.787 * c - 0.213 * s,
        0.715 - 0.715 * c - 0.715 * s,
        0.072 - 0.072 * c + 0.928 * s,
        0.213 - 0.213 * c + 0.143 * s,
        0.715 + 0.285 * c + 0.14 * s,
        0.072 - 0.072 * c - 0.283 * s,
        0.213 - 0.213 * c - 0.787 * s,
        0.715 - 0.715 * c + 0.715 * s,
        0.072 + 0.928 * c + 0.072 * s,
      ];
    }
    default:
      return null;
  }
}

/** Apply the ops left to right, clamping after each step (as browsers do). */
export function applyColorFilter(color: Rgba, ops: ColorFilterOp[]): Rgba {
  let { r, g, b, a } = color;
  for (const op of ops) {
    switch (op.name) {
      case "brightness":
        r = clamp01(r * op.amount);
        g = clamp01(g * op.amount);
        b = clamp01(b * op.amount);
        break;
      case "contrast": {
        const k = op.amount;
        const off = 0.5 * (1 - k);
        r = clamp01(k * r + off);
        g = clamp01(k * g + off);
        b = clamp01(k * b + off);
        break;
      }
      case "invert": {
        const v = op.amount;
        r = clamp01(v + r * (1 - 2 * v));
        g = clamp01(v + g * (1 - 2 * v));
        b = clamp01(v + b * (1 - 2 * v));
        break;
      }
      case "opacity":
        a = clamp01(a * op.amount);
        break;
      default: {
        const m = matrixFor(op);
        if (!m) break;
        const nr = m[0] * r + m[1] * g + m[2] * b;
        const ng = m[3] * r + m[4] * g + m[5] * b;
        const nb = m[6] * r + m[7] * g + m[8] * b;
        r = clamp01(nr);
        g = clamp01(ng);
        b = clamp01(nb);
      }
    }
  }
  return { r, g, b, a };
}

// ============================================================================
// Baking into a created Figma subtree
// ============================================================================

export interface BakeResult {
  /** IMAGE/VIDEO paints the filter could not be applied to. */
  unbakedImages: number;
}

type LoosePaint = Record<string, unknown> & { type: string };

/** Only grayscale/saturate — expressible as an image saturation adjustment. */
function imageSaturationDelta(ops: ColorFilterOp[]): number | null {
  let delta = 0;
  for (const op of ops) {
    if (op.name === "grayscale") delta -= op.amount;
    else if (op.name === "saturate") delta += Math.min(op.amount, 2) - 1;
    else return null;
  }
  return delta;
}

function bakePaints(
  paints: ReadonlyArray<LoosePaint>,
  colorOps: ColorFilterOp[],
  imageOps: ColorFilterOp[],
  result: BakeResult,
): LoosePaint[] {
  return paints.map((paint) => {
    if (paint.type === "SOLID") {
      const color = paint.color as { r: number; g: number; b: number };
      const out = applyColorFilter({ ...color, a: 1 }, colorOps);
      return { ...paint, color: { r: out.r, g: out.g, b: out.b } };
    }
    if (paint.type.startsWith("GRADIENT_")) {
      const stops = (
        paint.gradientStops as Array<{ position: number; color: Rgba }>
      ).map((stop) => ({
        ...stop,
        color: applyColorFilter(stop.color, colorOps),
      }));
      return { ...paint, gradientStops: stops };
    }
    if (paint.type === "IMAGE" || paint.type === "VIDEO") {
      if (imageOps.length === 0) return paint;
      const delta =
        paint.type === "IMAGE" ? imageSaturationDelta(imageOps) : null;
      if (delta === null) {
        result.unbakedImages++;
        return paint;
      }
      const existing =
        (paint.filters as { saturation?: number } | undefined)?.saturation ?? 0;
      // The element's own grayscale is already on its image paint (css-converter).
      if (existing !== 0) return paint;
      return {
        ...paint,
        filters: {
          ...(paint.filters as object),
          saturation: Math.max(-1, Math.min(1, delta)),
        },
      };
    }
    return paint;
  });
}

function bakeNode(
  node: Record<string, unknown>,
  colorOps: ColorFilterOp[],
  imageOps: ColorFilterOp[],
  result: BakeResult,
): void {
  const bake = (paints: ReadonlyArray<LoosePaint>) =>
    bakePaints(paints, colorOps, imageOps, result);

  // Per node: one that rejects a write (locked, instance-restricted) keeps its
  // paints; the rest of the subtree is still baked.
  try {
    if (Array.isArray(node.fills)) {
      node.fills = bake(node.fills as LoosePaint[]);
    } else if (
      node.type === "TEXT" &&
      typeof node.getStyledTextSegments === "function"
    ) {
      // Mixed fills: recolor each run.
      const segments = (
        node.getStyledTextSegments as (
          f: string[],
        ) => Array<{ start: number; end: number; fills: LoosePaint[] }>
      )(["fills"]);
      for (const seg of segments) {
        (node.setRangeFills as (s: number, e: number, p: LoosePaint[]) => void)(
          seg.start,
          seg.end,
          bake(seg.fills),
        );
      }
    }
    if (Array.isArray(node.strokes) && node.strokes.length > 0) {
      node.strokes = bake(node.strokes as LoosePaint[]);
    }
    if (Array.isArray(node.effects) && node.effects.length > 0) {
      node.effects = (node.effects as Array<Record<string, unknown>>).map(
        (fx) =>
          (fx.type === "DROP_SHADOW" || fx.type === "INNER_SHADOW") && fx.color
            ? { ...fx, color: applyColorFilter(fx.color as Rgba, colorOps) }
            : fx,
      );
    }
  } catch {
    // Keep this node's original paints.
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children as Array<Record<string, unknown>>) {
      bakeNode(child, colorOps, imageOps, result);
    }
  }
}

/**
 * Bake the filter into `root` and every descendant. `opacity()` multiplies the
 * root's opacity (exact for overlapping children); the other functions recolor
 * paints.
 */
export function bakeColorFilter(
  root: SceneNode,
  ops: ColorFilterOp[],
  options: { imagesPrebaked?: boolean } = {},
): BakeResult {
  const result: BakeResult = { unbakedImages: 0 };
  const alpha = ops
    .filter((op) => op.name === "opacity")
    .reduce((acc, op) => acc * op.amount, 1);
  const colorOps = ops.filter((op) => op.name !== "opacity");
  const target = root as unknown as Record<string, unknown>;

  if (alpha !== 1 && typeof target.opacity === "number") {
    target.opacity = (target.opacity as number) * alpha;
  }
  if (colorOps.length === 0) return result;

  // Prebaked images were recoloured in the UI iframe — leave their paints alone.
  bakeNode(target, colorOps, options.imagesPrebaked ? [] : colorOps, result);
  return result;
}

// ============================================================================
// Raster pixels (UI iframe — the sandbox has no canvas)
// ============================================================================

/**
 * Recolour straight-alpha RGBA pixels in place with the same math the paints
 * use. `opacity()` is skipped — the layer's own opacity carries it — and alpha
 * is never touched.
 */
export function applyColorFilterToPixels(data: Uint8ClampedArray, ops: ColorFilterOp[]): void {
  const colorOps = ops.filter((op) => op.name !== "opacity");
  if (colorOps.length === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const out = applyColorFilter(
      { r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255, a: 1 },
      colorOps,
    );
    data[i] = Math.round(out.r * 255);
    data[i + 1] = Math.round(out.g * 255);
    data[i + 2] = Math.round(out.b * 255);
  }
}
