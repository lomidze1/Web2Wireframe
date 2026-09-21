/**
 * Deterministic WCAG 2 contrast math.
 *
 * Copied from Legibly (`plugin/src/shared/contrast.ts`). The one change:
 * culori's `wcagContrast` is inlined as the WCAG 2 relative-luminance formula
 * below, so the plugin takes on no new dependency. Same math, same results.
 */

/** Channels 0–1, as Figma stores them. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type WcagLevel = "AA" | "AAA";

/** Alpha-composite `top` over an opaque `bottom` (simple alpha, NORMAL blend). */
export function compositeOver(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
    a,
  };
}

/** Flatten a back-to-front stack of layers into one color. Bottom layer first. */
export function flattenStack(layers: RGBA[]): RGBA {
  let acc: RGBA = { r: 0, g: 0, b: 0, a: 0 };
  for (const layer of layers) acc = compositeOver(layer, acc);
  return acc;
}

/** WCAG 2 relative luminance of an sRGB color (alpha ignored). */
function luminance(c: RGBA): number {
  const lin = (v: number) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * WCAG 2 contrast ratio between a (possibly translucent) fg and an opaque bg.
 * The fg is composited over the bg first, per WCAG's effective-color method.
 */
export function wcagRatio(fg: RGBA, bg: RGBA): number {
  const effFg = fg.a < 1 ? compositeOver(fg, { ...bg, a: 1 }) : fg;
  const l1 = luminance(effFg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * WCAG "large text": ≥ 24 CSS px, or ≥ 18.66 px (14 pt) with bold weight (≥ 700).
 * (W3C Understanding 1.4.3.)
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  if (fontSizePx >= 24) return true;
  return fontSizePx >= 18.66 && fontWeight >= 700;
}

/** Required ratio for text at the given level (SC 1.4.3 AA / 1.4.6 AAA). */
export function requiredRatio(large: boolean, level: WcagLevel): number {
  if (level === "AAA") return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}

/** The single pass/fail judge. */
export function passesContrast(fg: RGBA, bg: RGBA, required: number): boolean {
  return wcagRatio(fg, bg) >= required;
}
