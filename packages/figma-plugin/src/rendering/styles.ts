/**
 * Figma style linking and creation
 * Creates and links PaintStyles from CSS variables, plugin colors, and website paints
 * Supports: solid (opaque + semi-transparent), linear/radial/conic gradients
 */

import type {
  ExtractedCSSVariable,
  FigmaColor,
  FigmaEffect,
  FigmaFill,
  FigmaGradientStop,
  RenderContext,
  RenderWireframeData,
  WireframeFrame,
  WireframeNode,
} from "../types";
import {
  cssColorToFigmaRGB,
  figmaRGBToHex,
  normalizeColorForLookup,
  paintKeyFromCSSColor,
} from "./colors";
import {
  calculateRadialGradientTransform,
  calculateLinearGradientTransform,
} from "./gradients";
import { convertEffectsToFigma } from "./fills";
import { parseGridTemplate } from "@w2w/shared";
import { logger } from "../utils/logger";

// ============================================================================
// Paint Key Serialization
// ============================================================================

/**
 * Convert a FigmaColor (r,g,b in 0-1) to hex string (ignoring alpha)
 */
function figmaColorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Compute a deterministic lookup key from a FigmaFill (tree data).
 *
 * Key formats:
 * - Solid opaque:          "#rrggbb"
 * - Solid semi-transparent: "#rrggbb@NN"  (NN = rounded opacity %)
 * - Gradient:              "GRADIENT_LINEAR:angle:stop1|stop2|..."
 */
export function paintKeyFromFigmaFill(fill: FigmaFill): string {
  if (!fill.visible) return "";

  if (fill.type === "SOLID" && fill.color) {
    const hex = figmaColorToHex(fill.color);
    const normalized = normalizeColorForLookup(hex);
    const effectiveOpacity = fill.opacity * fill.color.a;
    if (effectiveOpacity >= 0.99) return normalized;
    return `${normalized}@${Math.round(effectiveOpacity * 100)}`;
  }

  if (
    (fill.type === "GRADIENT_LINEAR" ||
      fill.type === "GRADIENT_RADIAL" ||
      fill.type === "GRADIENT_CONIC") &&
    fill.stops &&
    fill.stops.length >= 2
  ) {
    const stopsKey = fill.stops
      .map(
        (s) =>
          `${Math.round(s.color.r * 255)},${Math.round(s.color.g * 255)},${Math.round(s.color.b * 255)},${Math.round(s.color.a * 100)}@${Math.round(s.position * 1000)}`
      )
      .join("|");
    return `${fill.type}:${fill.angle || 0}:${stopsKey}`;
  }

  return "";
}

/**
 * Compute a lookup key from an applied Figma Paint object.
 * Only handles solid paints. Gradients need sourceFills for matching
 * (because gradientTransform is a derived value, not the original angle).
 */
export function paintKeyFromPaint(paint: Paint): string {
  if (paint.type === "SOLID") {
    const solid = paint as SolidPaint;
    const hex = figmaRGBToHex(solid.color);
    const normalized = normalizeColorForLookup(hex);
    const opacity = solid.opacity ?? 1;
    if (opacity >= 0.99) return normalized;
    return `${normalized}@${Math.round(opacity * 100)}`;
  }
  return "";
}

/**
 * Create a compound key for a multi-fill FigmaFill array.
 * Returns single key if only one visible fill.
 */
function compoundPaintKey(fills: FigmaFill[]): string {
  const keys = fills
    .filter((f) => f.visible)
    .map((f) => paintKeyFromFigmaFill(f))
    .filter(Boolean);
  if (keys.length === 0) return "";
  if (keys.length === 1) return keys[0];
  return keys.join("+");
}

// ============================================================================
// Style Linking
// ============================================================================

/**
 * Link fill style to a frame if a matching style exists in colorStyleMap.
 * Call this AFTER setting frame.fills.
 *
 * @param sourceFills Optional original FigmaFill[] from the wireframe node.
 *   When provided, enables gradient and semi-transparent style matching.
 *   Without sourceFills, only solid fills can be matched (via Paint key).
 */
export async function linkFillStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext,
  sourceFills?: FigmaFill[]
): Promise<void> {
  if (context.variableMode !== "styles") return;

  const fills = frame.fills as readonly Paint[];
  if (!fills || fills.length === 0) return;

  // Strategy 0: Variable-first lookup (direct CSS variable → PaintStyle)
  if (sourceFills && context.variableStyleMap) {
    const visibleFills = sourceFills.filter((f) => f.visible);
    if (visibleFills.length === 1 && visibleFills[0].cssVariable) {
      const style = context.variableStyleMap.get(visibleFills[0].cssVariable);
      if (style) {
        await frame.setFillStyleIdAsync(style.id);
        return;
      }
    }
  }

  // Strategy 1: Use sourceFills to derive key (supports ALL paint types)
  if (sourceFills && sourceFills.length > 0) {
    const visibleFills = sourceFills.filter((f) => f.visible);
    if (visibleFills.length === 1) {
      const key = paintKeyFromFigmaFill(visibleFills[0]);
      if (key) {
        const style = context.colorStyleMap.get(key);
        if (style) {
          await frame.setFillStyleIdAsync(style.id);
          return;
        }
      }
    }
    // Multi-fill: try compound key
    if (visibleFills.length > 1) {
      const compound = compoundPaintKey(sourceFills);
      if (compound) {
        const style = context.colorStyleMap.get(compound);
        if (style) {
          await frame.setFillStyleIdAsync(style.id);
          return;
        }
      }
    }
  }

  // Strategy 2: Fallback — derive key from applied Paint (solid fills only)
  if (fills.length === 1) {
    const key = paintKeyFromPaint(fills[0]);
    if (key) {
      const style = context.colorStyleMap.get(key);
      if (style) {
        await frame.setFillStyleIdAsync(style.id);
      }
    }
  }
}

/**
 * Link stroke style to a frame if a matching style exists in colorStyleMap.
 * Call this AFTER setting frame.strokes.
 * Supports both opaque and semi-transparent strokes via compound keys.
 */
export async function linkStrokeStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext,
  sourceStrokes?: import("../types").FigmaStroke[]
): Promise<void> {
  if (context.variableMode !== "styles") return;

  const strokes = frame.strokes as readonly Paint[];
  if (!strokes || strokes.length === 0) return;

  // Strategy 0: Variable-first lookup
  if (sourceStrokes && sourceStrokes.length > 0 && context.variableStyleMap) {
    if (sourceStrokes[0].cssVariable) {
      const style = context.variableStyleMap.get(sourceStrokes[0].cssVariable);
      if (style) {
        await frame.setStrokeStyleIdAsync(style.id);
        return;
      }
    }
  }

  // Strategy 1: Fallback — derive key from applied Paint
  if (strokes.length === 1) {
    const key = paintKeyFromPaint(strokes[0]);
    if (key) {
      const style = context.colorStyleMap.get(key);
      if (style) {
        await frame.setStrokeStyleIdAsync(style.id);
      }
    }
  }
}

// ============================================================================
// Versioning Helpers (Hybrid V2 Strategy)
// ============================================================================
//
// Two matching strategies live side-by-side in this file:
//
//   Category A — Named styles (semantic, stable name)
//     Examples: "apple.com/--primary", "apple.com/Plugin/--background",
//               "apple.com/--Inter-Bold-24"
//     Algorithm: name lookup → value check → skip if match, else -V2/-V3 suffix.
//     Helper: findOrCreateVersionedPaintStyle / findOrCreateVersionedTextStyle
//
//   Category B — Auto-numbered styles (positional, unstable name)
//     Examples: "apple.com/--created-variable-01", future "--shadow-01"
//     Algorithm: value-first lookup across ALL slots in the namespace →
//                reuse any slot that matches; else create with next counter.
//     Helper: findOrCreateValueMatchedPaintStyle
//
// Category B avoids the "shifting counter" bloat: when a website's colors
// are re-numbered (one color removed, others shift by one), the value-first
// match reuses existing slots instead of creating V2 copies for every slot.

/** Escape regex special chars so a style name can be embedded literally. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministic value key for a single Paint (Figma native).
 * Handles: SOLID (hex + opacity), gradients (stops, order).
 * Image paints return their type only (not expected in style pipelines).
 */
export function paintValueKey(paint: Paint): string {
  if (paint.type === "SOLID") {
    const solid = paint as SolidPaint;
    const r = Math.round(solid.color.r * 255);
    const g = Math.round(solid.color.g * 255);
    const b = Math.round(solid.color.b * 255);
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    const op = Math.round((solid.opacity ?? 1) * 100);
    return op >= 99 ? `SOLID:${hex}` : `SOLID:${hex}@${op}`;
  }
  if (
    paint.type === "GRADIENT_LINEAR" ||
    paint.type === "GRADIENT_RADIAL" ||
    paint.type === "GRADIENT_ANGULAR" ||
    paint.type === "GRADIENT_DIAMOND"
  ) {
    const grad = paint as GradientPaint;
    const stopsKey = grad.gradientStops
      .map(
        (s) =>
          `${Math.round(s.color.r * 255)},${Math.round(s.color.g * 255)},${Math.round(s.color.b * 255)},${Math.round(s.color.a * 100)}@${Math.round(s.position * 1000)}`
      )
      .join("|");
    return `${paint.type}:${stopsKey}`;
  }
  return paint.type;
}

/** Compound key for a Paint[] (order-sensitive — visual layering matters). */
export function paintsValueKey(paints: readonly Paint[]): string {
  return paints.map(paintValueKey).join("+");
}

/**
 * Value key for a TextStyle (family + style + size + lineHeight + letterSpacing).
 * Used to detect "same name + same value → skip" for TextStyles.
 *
 * Two normalization requirements:
 *
 * 1. Zero-value normalization: Figma's runtime ALWAYS returns a concrete
 *    LetterSpacing object on existing TextStyles (e.g. `{value: 0, unit:
 *    "PIXELS"}`), but the combo side may pass `undefined` when letterSpacing
 *    is zero. Treat "zero letterSpacing" (undefined OR {value:0}) as the
 *    same key "0". Same strategy for lineHeight AUTO vs {value:0}.
 *
 * 2. Float-precision normalization: CSS-derived font sizes like `15.2`
 *    arrive via `0.95 * 16 = 15.200000000000001` when the CSS is `0.95rem`,
 *    or similar IEEE-754 drift through various paths. Figma stores and
 *    returns the exact number it was given, so a combo with 15.200000000001
 *    producing key `...|15.200000000000001|...` won't match an existing
 *    style stored with 15.2 producing key `...|15.2|...`. Rounding fontSize
 *    (2 dp), lineHeight value (2 dp), letterSpacing (1 dp) to consistent
 *    precision eliminates this drift.
 */
function roundFs(n: number): number {
  return Math.round(n * 100) / 100;
}

function textStyleValueKey(s: {
  fontName: { family: string; style: string };
  fontSize: number;
  lineHeight?: LineHeight;
  letterSpacing?: LetterSpacing;
}): string {
  let lh = "AUTO";
  if (s.lineHeight && "value" in s.lineHeight && s.lineHeight.value > 0) {
    lh = `${roundFs(s.lineHeight.value)}${s.lineHeight.unit}`;
  }
  let ls = "0";
  if (s.letterSpacing && "value" in s.letterSpacing && s.letterSpacing.value !== 0) {
    ls = `${Math.round(s.letterSpacing.value * 10) / 10}${s.letterSpacing.unit}`;
  }
  const fs = roundFs(s.fontSize);
  return `${s.fontName.family}|${s.fontName.style}|${fs}|${lh}|${ls}`;
}

/**
 * Collect all versioned variants of `baseName` from existing styles.
 * Matches the base name itself and any `{base}-V{N}` sibling.
 */
function findVersionedVariants<T extends { name: string }>(
  baseName: string,
  existingStyles: readonly T[]
): T[] {
  const pattern = new RegExp(`^${escapeRegex(baseName)}(?:-V\\d+)?$`);
  return existingStyles.filter((s) => pattern.test(s.name));
}

/**
 * Given a base name (e.g. "apple.com/--primary") and a set of version
 * numbers already in use (V1 = base name; V2+ = `-V2`, `-V3`, ...), pick
 * the smallest N ≥ 1 that is free. Returns the final style name.
 */
function nextAvailableVersionName(baseName: string, usedVersions: Set<number>): string {
  let v = 1;
  while (usedVersions.has(v)) v++;
  return v === 1 ? baseName : `${baseName}-V${v}`;
}

/**
 * Category A — Named PaintStyle with V2/V3 versioning on value mismatch.
 *
 * Algorithm:
 *   1. Same-run cache hit → return cached (and re-assign paints in case the
 *      caller is updating within-run, e.g. Pass 1 → Pass 4 same name).
 *   2. Gather all existing styles matching `baseName` or `{baseName}-V{N}`.
 *   3. If any has matching value → reuse (no write, no new style).
 *   4. Else pick the smallest unused version and create a new style.
 */
export function findOrCreateVersionedPaintStyle(
  baseName: string,
  newPaints: Paint[],
  existingStyles: readonly PaintStyle[],
  createdInThisRun: Map<string, PaintStyle>
): PaintStyle {
  const cached = createdInThisRun.get(baseName);
  if (cached) {
    cached.paints = newPaints;
    return cached;
  }

  const newKey = paintsValueKey(newPaints);
  const variants = findVersionedVariants(baseName, existingStyles);

  // Try value-match across base + all -V{N} siblings.
  const match = variants.find((s) => paintsValueKey(s.paints as readonly Paint[]) === newKey);
  if (match) {
    createdInThisRun.set(baseName, match);
    createdInThisRun.set(match.name, match);
    return match;
  }

  // No match → determine used version numbers (existing + same-run).
  const usedVersions = new Set<number>();
  for (const v of variants) {
    if (v.name === baseName) usedVersions.add(1);
    else {
      const m = v.name.match(/-V(\d+)$/);
      if (m) usedVersions.add(parseInt(m[1], 10));
    }
  }
  for (const key of Array.from(createdInThisRun.keys())) {
    if (key === baseName) usedVersions.add(1);
    else {
      const mm = key.match(new RegExp(`^${escapeRegex(baseName)}-V(\\d+)$`));
      if (mm) usedVersions.add(parseInt(mm[1], 10));
    }
  }

  const finalName = nextAvailableVersionName(baseName, usedVersions);
  const style = figma.createPaintStyle();
  style.name = finalName;
  style.paints = newPaints;
  createdInThisRun.set(baseName, style);
  createdInThisRun.set(finalName, style);
  return style;
}

/**
 * Category B — Auto-numbered PaintStyle with VALUE-FIRST matching.
 *
 * Used for `{hostname}/--created-variable-NN` and (Phase 2) `--shadow-NN`.
 * Caller passes a pre-computed `valueKey` (e.g. paintKey from the tree) for
 * the same-run cache, plus a shared `counterState` so multiple calls in one
 * run share the sequence.
 *
 * Matching compares `paintsValueKey(newPaints)` against `paintsValueKey` of
 * each existing slot's paints — this guarantees format parity regardless of
 * what `valueKey` format the caller uses externally.
 *
 * Critical: this function NEVER appends `-V2`. If the value is new, it
 * creates the next sequential slot. If the value matches ANY existing slot
 * in the `{hostnamePrefix}/` namespace, it reuses that slot.
 */
export function findOrCreateValueMatchedPaintStyle(
  hostnamePrefix: string,
  valueKey: string,
  newPaints: Paint[],
  existingStyles: readonly PaintStyle[],
  createdInThisRun: Map<string, PaintStyle>,
  counterState: { next: number }
): PaintStyle {
  // Same-run cache by external value key
  const cached = createdInThisRun.get(`__val:${valueKey}`);
  if (cached) return cached;

  // Value-first lookup: compute internal key from newPaints, compare to
  // internal key of each slot's paints (both computed via paintsValueKey
  // for format parity).
  const internalNewKey = paintsValueKey(newPaints);
  const slotPattern = new RegExp(
    `^${escapeRegex(hostnamePrefix)}/--created-variable-\\d+$`
  );
  for (const s of existingStyles) {
    if (!slotPattern.test(s.name)) continue;
    if (paintsValueKey(s.paints as readonly Paint[]) === internalNewKey) {
      createdInThisRun.set(`__val:${valueKey}`, s);
      createdInThisRun.set(s.name, s);
      return s;
    }
  }

  // New value → create next slot
  const slotNum = String(counterState.next).padStart(2, "0");
  const finalName = `${hostnamePrefix}/--created-variable-${slotNum}`;
  counterState.next++;

  const style = figma.createPaintStyle();
  style.name = finalName;
  style.paints = newPaints;
  createdInThisRun.set(`__val:${valueKey}`, style);
  createdInThisRun.set(finalName, style);
  return style;
}

/**
 * Scan existing styles in a namespace for the highest occupied auto-numbered
 * slot. Returns `maxSlot + 1` so callers can initialize the counter to
 * continue from where prior imports left off (instead of starting at 1 and
 * colliding with existing slots).
 */
export function nextAutoCounterStart(
  hostnamePrefix: string,
  existingStyles: readonly { name: string }[]
): number {
  const pattern = new RegExp(
    `^${escapeRegex(hostnamePrefix)}/--created-variable-(\\d+)$`
  );
  let maxSlot = 0;
  for (const s of existingStyles) {
    const m = s.name.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSlot) maxSlot = n;
    }
  }
  return maxSlot + 1;
}

/**
 * Category A — Versioned TextStyle (async: loads font before creating).
 *
 * TextStyle name fully encodes value (family, style, size, lh/ls collision),
 * so name match usually implies value match. This helper still double-checks
 * because external edits or earlier buggy imports can leave a style with a
 * mismatched value.
 */
export async function findOrCreateVersionedTextStyle(
  baseName: string,
  fontFamily: string,
  fontStyle: string,
  fontSize: number,
  lineHeight: LineHeight,
  letterSpacing: number,
  existingStyles: readonly TextStyle[],
  createdInThisRun: Map<string, TextStyle>
): Promise<TextStyle> {
  const cached = createdInThisRun.get(baseName);
  if (cached) return cached;

  const newKey = textStyleValueKey({
    fontName: { family: fontFamily, style: fontStyle },
    fontSize,
    lineHeight,
    letterSpacing:
      letterSpacing !== 0
        ? ({ value: letterSpacing, unit: "PIXELS" } as LetterSpacing)
        : undefined,
  });

  const variants = findVersionedVariants(baseName, existingStyles);
  const match = variants.find(
    (s) =>
      textStyleValueKey({
        fontName: s.fontName as { family: string; style: string },
        fontSize: s.fontSize as number,
        lineHeight: s.lineHeight as LineHeight,
        letterSpacing: s.letterSpacing as LetterSpacing | undefined,
      }) === newKey
  );
  if (match) {
    createdInThisRun.set(baseName, match);
    createdInThisRun.set(match.name, match);
    return match;
  }

  const usedVersions = new Set<number>();
  for (const v of variants) {
    if (v.name === baseName) usedVersions.add(1);
    else {
      const m = v.name.match(/-V(\d+)$/);
      if (m) usedVersions.add(parseInt(m[1], 10));
    }
  }

  const finalName = nextAvailableVersionName(baseName, usedVersions);
  await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
  const style = figma.createTextStyle();
  style.name = finalName;
  style.fontName = { family: fontFamily, style: fontStyle };
  style.fontSize = fontSize;
  style.lineHeight = lineHeight;
  if (letterSpacing !== 0) {
    style.letterSpacing = { value: letterSpacing, unit: "PIXELS" };
  }
  createdInThisRun.set(baseName, style);
  createdInThisRun.set(finalName, style);
  return style;
}

// ============================================================================
// Style Creation
// ============================================================================

/**
 * Check if a color value is a valid color (not a spacing/size value)
 */
export function isColorValue(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();

  // Check for hex colors
  if (trimmed.startsWith("#")) return true;

  // Check for rgb/rgba/hsl/hsla
  if (
    trimmed.startsWith("rgb") ||
    trimmed.startsWith("hsl") ||
    trimmed.startsWith("oklab") ||
    trimmed.startsWith("oklch")
  )
    return true;

  // Check for named colors (common ones)
  const namedColors = [
    "black",
    "white",
    "red",
    "green",
    "blue",
    "yellow",
    "transparent",
  ];
  if (namedColors.includes(trimmed)) return true;

  return false;
}

// createColorStylesFromVariables removed — replaced by createUnifiedWebsiteColorStyles

/**
 * Create Figma color styles from plugin colors (for Plugin Colors mode).
 *
 * `prefix` controls the group under which styles land in the Figma Styles
 * panel. Main.ts passes `${hostname}/Plugin` so multi-site imports stay
 * isolated (e.g. `apple.com/Plugin/--accent` vs `tesla.com/Plugin/--accent`).
 * The default `"W2W"` keeps backward compatibility for any direct caller
 * that hasn't been updated.
 */
export async function createPluginColorStyles(
  pluginColors: RenderWireframeData["pluginColors"],
  prefix: string = "W2W"
): Promise<Map<string, PaintStyle>> {
  const styleMap = new Map<string, PaintStyle>();

  // Plugin color roles (5 colors total)
  const colorRoles: (keyof typeof pluginColors)[] = [
    "text",
    "background",
    "secondary",
    "surface",
    "accent",
  ];

  logger.info("Creating plugin color styles", {
    colorCount: colorRoles.length,
  });

  // Hoist getLocalPaintStyles() to once per function (was called 5× before).
  const existingStyles = await figma.getLocalPaintStylesAsync();
  const createdInThisRun = new Map<string, PaintStyle>();

  for (const key of colorRoles) {
    try {
      const colorValue = pluginColors[key];
      // Skip if color value is undefined
      if (!colorValue) continue;
      const parsed = cssColorToFigmaRGB(colorValue);
      if (!parsed) continue;

      // Style name under the caller-supplied prefix. When main.ts passes
      // `${hostname}/Plugin`, names become e.g. "apple.com/Plugin/--accent".
      const baseName = `${prefix}/--${key}`;
      const paints: Paint[] = [
        {
          type: "SOLID",
          color: parsed.color,
          opacity: parsed.opacity,
        },
      ];

      // Category A: Named + Versioned. Same value → skip (no API write).
      // Different value → creates `{baseName}-V2`, `-V3`, …
      const style = findOrCreateVersionedPaintStyle(
        baseName,
        paints,
        existingStyles,
        createdInThisRun
      );
      styleMap.set(key, style);
    } catch (err) {
      logger.warn("Failed to create plugin color style", {
        colorRole: key,
        error: err,
      });
    }
  }

  return styleMap;
}

// ============================================================================
// Website Paint Styles — Unified Creation
// ============================================================================

/**
 * Recursively collect ALL unique paints from the wireframe tree.
 * Collects: solid fills (opaque + semi-transparent), gradients, strokes, text colors.
 *
 * Uses opacity-aware paint keys so semi-transparent colors are tracked separately.
 *
 * @param paints  Map of paintKey → FigmaFill data (fills + strokes as synthetic fills)
 * @param textColors  Map of paintKey → CSS color string (text colors with opacity)
 */
function collectAllPaintsFromTree(
  node: WireframeNode,
  paints: Map<string, FigmaFill>,
  textColors: Map<string, string>
): void {
  // Collect from fills (ALL types: solid, gradient, etc.)
  if (node.fills) {
    for (const fill of node.fills) {
      if (!fill.visible) continue;
      if (fill.type === "IMAGE_PLACEHOLDER") continue;
      const key = paintKeyFromFigmaFill(fill);
      if (key && !paints.has(key)) {
        paints.set(key, fill);
      }
    }
  }

  // Collect from strokes (as synthetic solid FigmaFills)
  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.color) {
        const hex = figmaColorToHex(stroke.color);
        const normalized = normalizeColorForLookup(hex);
        const effectiveOpacity = stroke.color.a;
        const key =
          effectiveOpacity >= 0.99
            ? normalized
            : `${normalized}@${Math.round(effectiveOpacity * 100)}`;
        if (key && !paints.has(key)) {
          paints.set(key, {
            type: "SOLID",
            visible: true,
            opacity: 1,
            color: stroke.color,
          });
        }
      }
    }
  }

  // Collect from effects (shadow colors)
  if (node.effects) {
    for (const effect of node.effects) {
      if (effect.color) {
        const hex = figmaColorToHex(effect.color);
        const normalized = normalizeColorForLookup(hex);
        const effectiveOpacity = effect.color.a;
        const key =
          effectiveOpacity >= 0.99
            ? normalized
            : `${normalized}@${Math.round(effectiveOpacity * 100)}`;
        if (key && key !== "transparent" && !paints.has(key)) {
          paints.set(key, {
            type: "SOLID",
            visible: true,
            opacity: effectiveOpacity >= 0.99 ? 1 : effectiveOpacity,
            color: { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: 1 },
          });
        }
      }
    }
  }

  // Collect text colors with opacity-aware keys
  if (node.textColor) {
    const key = paintKeyFromCSSColor(node.textColor);
    if (key && key !== "transparent" && !paints.has(key)) {
      textColors.set(key, node.textColor);
    }
  }

  if (node.styledSegments) {
    for (const seg of node.styledSegments) {
      if (seg.color) {
        const key = paintKeyFromCSSColor(seg.color);
        if (key && key !== "transparent" && !paints.has(key)) {
          textColors.set(key, seg.color);
        }
      }
    }
  }

  // Collect legacy color fields with opacity-aware keys
  if (node.backgroundColor) {
    const key = paintKeyFromCSSColor(node.backgroundColor);
    if (key && key !== "transparent" && !paints.has(key)) {
      textColors.set(key, node.backgroundColor);
    }
  }

  if (node.borderColor) {
    const key = paintKeyFromCSSColor(node.borderColor);
    if (key && key !== "transparent" && !paints.has(key)) {
      textColors.set(key, node.borderColor);
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      collectAllPaintsFromTree(child, paints, textColors);
    }
  }
}

/**
 * Collect multi-fill combinations from the tree for compound PaintStyle creation.
 * For nodes with 2+ visible non-placeholder fills, stores the fills keyed by compound key.
 */
function collectCompoundFillsFromTree(
  node: WireframeNode,
  compounds: Map<string, FigmaFill[]>
): void {
  if (node.fills) {
    const visible = node.fills.filter(
      (f) => f.visible && f.type !== "IMAGE_PLACEHOLDER"
    );
    if (visible.length > 1) {
      const key = visible
        .map((f) => paintKeyFromFigmaFill(f))
        .filter(Boolean)
        .join("+");
      if (key && !compounds.has(key)) {
        compounds.set(key, visible);
      }
    }
  }
  if (node.children) {
    for (const child of node.children) {
      collectCompoundFillsFromTree(child, compounds);
    }
  }
}

/**
 * Convert a FigmaFill to a native Figma Paint object.
 * Handles solid, linear/radial/conic gradients.
 */
function figmaFillToPaint(fill: FigmaFill): Paint | null {
  if (fill.type === "SOLID" && fill.color) {
    const effectiveOpacity = fill.opacity * fill.color.a;
    return {
      type: "SOLID",
      color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
      opacity: effectiveOpacity,
    } as SolidPaint;
  }

  if (fill.type === "GRADIENT_LINEAR" && fill.stops && fill.stops.length >= 2) {
    return {
      type: "GRADIENT_LINEAR",
      gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
      })),
      gradientTransform: calculateLinearGradientTransform(
        fill.angle || 180,
        fill.elementWidth,
        fill.elementHeight
      ),
    } as GradientPaint;
  }

  if (fill.type === "GRADIENT_RADIAL" && fill.stops && fill.stops.length >= 2) {
    const radialTransform = calculateRadialGradientTransform(fill);
    return {
      type: "GRADIENT_RADIAL",
      gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
      })),
      gradientTransform: radialTransform,
    } as GradientPaint;
  }

  if (fill.type === "GRADIENT_CONIC" && fill.stops && fill.stops.length >= 2) {
    return {
      type: "GRADIENT_ANGULAR",
      gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
      })),
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    } as GradientPaint;
  }

  return null;
}

/**
 * Create Figma PaintStyles for ALL unique colors in the wireframe tree.
 * Unified function: replaces createColorStylesFromVariables + createWebsiteColorStyles.
 *
 * Naming convention:
 * - CSS variable colors:    WEB/--variable-name
 * - Auto-generated colors:  WEB/--created-variable-01, WEB/--created-variable-02, ...
 *
 * Same hex+opacity = same style (reused via paintKey Map).
 * All website styles use WEB/ prefix. Plugin styles use W2W/ prefix (unchanged).
 */
export async function createUnifiedWebsiteColorStyles(
  frames: WireframeFrame[],
  cssVariables: ExtractedCSSVariable[],
  hostnamePrefix: string = "WEB"
): Promise<{ colorStyleMap: Map<string, PaintStyle>; variableStyleMap: Map<string, PaintStyle> }> {
  const colorStyleMap = new Map<string, PaintStyle>();
  const variableStyleMap = new Map<string, PaintStyle>();

  // Get existing styles once (avoid repeated queries)
  const existingStyles = await figma.getLocalPaintStylesAsync();

  // Track styles created during THIS run (shared across Pass 1 / 3 / 4 so
  // within-run dedupe works; value-first cache entries use `__val:{key}`).
  const createdInThisRun = new Map<string, PaintStyle>();

  // Counter for auto-numbered slots — seeded from highest existing slot so
  // re-imports continue the sequence instead of colliding with existing
  // `{hostname}/--created-variable-NN` styles.
  const counterState = {
    next: nextAutoCounterStart(hostnamePrefix, existingStyles),
  };

  // Category A shortcut — named + versioned. Used by Pass 1 (CSS variables)
  // and Pass 4 (compound fills). Value match → skip; mismatch → `-V2`, ….
  function createOrUpdateVersionedStyle(
    styleName: string,
    paints: Paint[]
  ): PaintStyle {
    return findOrCreateVersionedPaintStyle(
      styleName,
      paints,
      existingStyles,
      createdInThisRun
    );
  }

  // Category B shortcut — auto-numbered + value-first. Used by Pass 3
  // (tree-walked colors). Reuses any existing slot in this namespace whose
  // value matches; otherwise creates the next sequential slot.
  function createOrReuseAutoNumberedStyle(
    valueKey: string,
    paints: Paint[]
  ): PaintStyle {
    return findOrCreateValueMatchedPaintStyle(
      hostnamePrefix,
      valueKey,
      paints,
      existingStyles,
      createdInThisRun,
      counterState
    );
  }

  // =========================================================================
  // PASS 1: Create PaintStyles for ALL color CSS variables
  // Priority: variable names are preserved exactly as they appear on the website
  // =========================================================================

  for (const variable of cssVariables) {
    if (variable.category !== "color" && !isColorValue(variable.value)) continue;
    const parsed = cssColorToFigmaRGB(variable.value);
    if (!parsed) continue;

    try {
      const styleName = `${hostnamePrefix}/${variable.name}`;
      const paints: Paint[] = [
        {
          type: "SOLID",
          color: parsed.color,
          opacity: parsed.opacity,
        },
      ];

      const style = createOrUpdateVersionedStyle(styleName, paints);

      // Store by variable name (for variable-first linking)
      variableStyleMap.set(variable.name, style);

      // Also store by paintKey (for hex-based fallback linking)
      const hex = figmaRGBToHex(parsed.color);
      const normalized = normalizeColorForLookup(hex);
      const paintKey =
        parsed.opacity >= 0.99
          ? normalized
          : `${normalized}@${Math.round(parsed.opacity * 100)}`;
      // First variable wins per paintKey (don't overwrite)
      if (!colorStyleMap.has(paintKey)) {
        colorStyleMap.set(paintKey, style);
      }
    } catch (err) {
      logger.warn("Failed to create CSS variable style", {
        variable: variable.name,
        error: err,
      });
    }
  }

  logger.info("Pass 1: Created CSS variable styles", {
    variableStyleCount: variableStyleMap.size,
    colorStyleMapCount: colorStyleMap.size,
  });

  // =========================================================================
  // PASS 2: Collect non-variable paints from tree
  // =========================================================================

  const allPaints = new Map<string, FigmaFill>();
  const textColors = new Map<string, string>();
  const compoundFills = new Map<string, FigmaFill[]>();
  for (const frame of frames) {
    if (frame.tree) {
      collectAllPaintsFromTree(frame.tree, allPaints, textColors);
      collectCompoundFillsFromTree(frame.tree, compoundFills);
    }
  }

  // Add text colors as solid paint entries
  for (const [key, cssColor] of Array.from(textColors)) {
    if (!allPaints.has(key)) {
      const parsed = cssColorToFigmaRGB(cssColor);
      if (parsed) {
        allPaints.set(key, {
          type: "SOLID",
          visible: true,
          opacity: parsed.opacity,
          color: { r: parsed.color.r, g: parsed.color.g, b: parsed.color.b, a: 1 },
        });
      }
    }
  }

  // =========================================================================
  // PASS 3: Create auto-named styles for paints NOT covered by CSS variables
  // =========================================================================

  // Reverse lookup: hex→variable name (fallback for when extraction doesn't have var())
  const paintKeyToVarName = new Map<string, string>();
  for (const [varName] of Array.from(variableStyleMap)) {
    const variable = cssVariables.find((v) => v.name === varName);
    if (variable) {
      const parsed = cssColorToFigmaRGB(variable.value);
      if (parsed) {
        const hex = figmaRGBToHex(parsed.color);
        const normalized = normalizeColorForLookup(hex);
        const pk =
          parsed.opacity >= 0.99
            ? normalized
            : `${normalized}@${Math.round(parsed.opacity * 100)}`;
        if (!paintKeyToVarName.has(pk)) {
          paintKeyToVarName.set(pk, varName);
        }
      }
    }
  }

  // Track gradient style names used in this run to prevent duplicates
  const usedGradientNames = new Set<string>();

  function gradientVarName(
    fillType: string,
    angle: number | undefined,
    stops: FigmaGradientStop[]
  ): string | null {
    if (!stops || stops.length === 0) return null;

    // Strategy 1: Direct read from per-stop cssVariableName (tracked at extraction)
    const names: string[] = [];
    for (const stop of stops) {
      if (stop.cssVariableName && !names.includes(stop.cssVariableName)) {
        names.push(stop.cssVariableName);
      }
    }

    // Strategy 2: Fallback — reverse-match stop hex colors to CSS variables
    if (names.length === 0) {
      for (const stop of stops) {
        const hex = figmaColorToHex(stop.color);
        const norm = normalizeColorForLookup(hex);
        const effectiveA = stop.color.a;
        const stopKey =
          effectiveA >= 0.99
            ? norm
            : `${norm}@${Math.round(effectiveA * 100)}`;
        const matched = paintKeyToVarName.get(stopKey);
        if (matched && !names.includes(matched)) {
          names.push(matched);
        }
      }
    }

    if (names.length === 0) return null;

    // Build descriptive name: --gradient(--var1, --var2, 135deg)
    const typePrefix =
      fillType === "GRADIENT_RADIAL" ? "--radial" :
      fillType === "GRADIENT_CONIC" ? "--conic" : "--gradient";
    const angleStr = angle != null ? `, ${Math.round(angle)}deg` : "";
    let baseName = `${typePrefix}(${names.join(", ")}${angleStr})`;

    // Deduplicate: if this exact name was already used, append suffix
    if (usedGradientNames.has(baseName)) {
      let suffix = 2;
      while (usedGradientNames.has(`${baseName}-${suffix}`)) suffix++;
      baseName = `${baseName}-${suffix}`;
    }
    usedGradientNames.add(baseName);
    return baseName;
  }

  let newStylesCreated = 0;
  for (const [key, fill] of Array.from(allPaints)) {
    // Skip if already covered by a CSS variable style
    if (colorStyleMap.has(key)) continue;

    try {
      // styleName = null signals Category B (auto-numbered, value-first lookup).
      // styleName = string signals Category A (named, versioned with -V2/...).
      let styleName: string | null;
      let paints: Paint[];

      if (fill.type === "SOLID" && fill.color) {
        const effectiveOpacity = fill.opacity * fill.color.a;
        // SOLID fills without a CSS variable name → auto-numbered.
        styleName = null;

        paints = [
          {
            type: "SOLID",
            color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
            opacity: effectiveOpacity,
          },
        ];
      } else if (
        fill.type === "GRADIENT_LINEAR" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const gradName = gradientVarName(fill.type, fill.angle, fill.stops);
        if (gradName) {
          styleName = `${hostnamePrefix}/${gradName}`;
        } else {
          styleName = null; // Category B: auto-numbered with value-first lookup
        }

        paints = [
          {
            type: "GRADIENT_LINEAR",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
            })),
            gradientTransform: calculateLinearGradientTransform(
              fill.angle || 180,
              fill.elementWidth,
              fill.elementHeight
            ),
          } as GradientPaint,
        ];
      } else if (
        fill.type === "GRADIENT_RADIAL" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const gradName = gradientVarName(fill.type, fill.angle, fill.stops);
        if (gradName) {
          styleName = `${hostnamePrefix}/${gradName}`;
        } else {
          styleName = null; // Category B: auto-numbered with value-first lookup
        }

        const radialTransform = calculateRadialGradientTransform(fill);
        paints = [
          {
            type: "GRADIENT_RADIAL",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
            })),
            gradientTransform: radialTransform,
          } as GradientPaint,
        ];
      } else if (
        fill.type === "GRADIENT_CONIC" &&
        fill.stops &&
        fill.stops.length >= 2
      ) {
        const gradName = gradientVarName(fill.type, fill.angle, fill.stops);
        if (gradName) {
          styleName = `${hostnamePrefix}/${gradName}`;
        } else {
          styleName = null; // Category B: auto-numbered with value-first lookup
        }

        paints = [
          {
            type: "GRADIENT_ANGULAR",
            gradientStops: fill.stops.map((s: FigmaGradientStop) => ({
              position: s.position,
              color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
            })),
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          } as GradientPaint,
        ];
      } else {
        continue;
      }

      const style = styleName
        ? createOrUpdateVersionedStyle(styleName, paints)
        : createOrReuseAutoNumberedStyle(key, paints);
      colorStyleMap.set(key, style);
      newStylesCreated++;
    } catch (err) {
      logger.warn("Failed to create website paint style", {
        key,
        error: err,
      });
    }
  }

  // `paintsProcessed` counts paints inspected (reused + newly created).
  // The actual number of figma.createPaintStyle() calls may be lower when
  // value-first matching reuses existing slots across re-imports.
  logger.info("Pass 3: Processed auto-numbered paint styles", {
    paintsProcessed: newStylesCreated,
    totalColorStyles: colorStyleMap.size,
  });

  // =========================================================================
  // PASS 4: Create compound PaintStyles for multi-fill nodes
  // Figma's fillStyleId is per-frame (all fills), so multi-fill frames need
  // a single PaintStyle containing ALL their fills to be linkable.
  // =========================================================================

  let compoundStylesCreated = 0;
  for (const [compoundKey, fills] of Array.from(compoundFills)) {
    if (colorStyleMap.has(compoundKey)) continue;

    try {
      // Build compound name from individual fill info
      const parts: string[] = [];
      for (const fill of fills) {
        if (fill.cssVariable) {
          parts.push(fill.cssVariable);
        } else if (
          (fill.type === "GRADIENT_LINEAR" ||
            fill.type === "GRADIENT_RADIAL" ||
            fill.type === "GRADIENT_CONIC") &&
          fill.stops &&
          fill.stops.length >= 2
        ) {
          const gName = gradientVarName(fill.type, fill.angle, fill.stops);
          const prefix =
            fill.type === "GRADIENT_RADIAL" ? "--radial" :
            fill.type === "GRADIENT_CONIC" ? "--conic" : "--gradient";
          parts.push(gName || prefix);
        } else if (fill.type === "SOLID" && fill.color) {
          parts.push(figmaColorToHex(fill.color));
        } else {
          parts.push("fill");
        }
      }

      const styleName = `${hostnamePrefix}/--compound(${parts.join(", ")})`;

      // Convert each fill to a native Figma Paint
      // CSS order is top-to-bottom, Figma order is bottom-to-top → reverse
      const paints: Paint[] = [];
      for (const fill of fills) {
        const paint = figmaFillToPaint(fill);
        if (paint) paints.push(paint);
      }

      if (paints.length > 1) {
        const style = createOrUpdateVersionedStyle(styleName, paints.reverse());
        colorStyleMap.set(compoundKey, style);
        compoundStylesCreated++;
      }
    } catch (err) {
      logger.warn("Failed to create compound style", {
        key: compoundKey,
        error: err,
      });
    }
  }

  if (compoundStylesCreated > 0) {
    logger.info("Pass 4: Created compound styles for multi-fill nodes", {
      compoundStylesCreated,
      totalColorStyles: colorStyleMap.size,
    });
  }

  return { colorStyleMap, variableStyleMap };
}

// ============================================================================
// Text Styles
// ============================================================================

const MAX_TEXT_STYLES = 50;

/**
 * Map a numeric CSS font-weight (100…900) to ordered Figma style candidates.
 * Index 0 = preferred style; later entries are perceptual fallbacks for fonts
 * that lack the preferred variant (e.g. Space Grotesk without Semibold).
 *
 * Buckets follow the CSS standard: 600 = Semibold, 700 = Bold, 800 = ExtraBold.
 *
 * Each bucket includes alternative spellings used by various fonts in Figma
 * ("SemiBold", "Semi Bold", "DemiBold", …) before falling back to neighbour
 * weights. Within neighbour fallbacks the LIGHTER neighbour comes first
 * (perceptually closer for wireframe rendering — going heavier makes text
 * look bolder than the source).
 */
export function fontWeightToStyleCandidates(weight: number): string[] {
  if (weight <= 150) return ["Thin", "Hairline", "ExtraLight", "Extra Light", "UltraLight", "Ultra Light", "Light", "Regular"];
  // 200 — ExtraLight first (with spellings), then LIGHTER neighbour (Thin)
  // before HEAVIER (Light). Same perceptual rule as 600 — don't overshoot.
  if (weight <= 250) return ["ExtraLight", "Extra Light", "UltraLight", "Ultra Light", "Thin", "Light", "Regular"];
  if (weight <= 350) return ["Light", "ExtraLight", "Extra Light", "Regular"];
  if (weight <= 450) return ["Regular", "Normal", "Book"];
  if (weight <= 550) return ["Medium", "Regular", "Semibold", "SemiBold", "Semi Bold"];
  // 600 — Semibold first (with all spellings), then LIGHTER neighbour (Medium)
  // before HEAVIER (Bold). Going heavier visually overshoots the source weight.
  if (weight <= 650) return ["Semibold", "SemiBold", "Semi Bold", "DemiBold", "Demi Bold", "Medium", "Bold"];
  if (weight <= 750) return ["Bold", "Semibold", "SemiBold", "Semi Bold", "ExtraBold", "Extra Bold"];
  if (weight <= 850) return ["ExtraBold", "Extra Bold", "UltraBold", "Ultra Bold", "Bold", "Black"];
  return ["Black", "Heavy", "ExtraBold", "Extra Bold", "Bold"];
}

/**
 * Map a numeric font weight to its preferred Figma font style.
 * For fallback handling when the preferred style isn't available, use
 * `fontWeightToStyleCandidates()` directly.
 */
export function fontWeightToStyle(weight: number): string {
  return fontWeightToStyleCandidates(weight)[0];
}

/**
 * Parse a node's lineHeight value to Figma LineHeight format.
 * Handles: number (px), "NNpx", "NN%", ratio "1.5", "normal", undefined.
 */
export function parseFigmaLineHeight(
  lineHeight: number | string | undefined
): LineHeight {
  if (!lineHeight || lineHeight === "normal") {
    return { unit: "AUTO" };
  }
  if (typeof lineHeight === "number") {
    if (lineHeight <= 0) return { unit: "AUTO" };
    return { value: lineHeight, unit: "PIXELS" };
  }
  const str = String(lineHeight);
  if (str.endsWith("%")) {
    const pct = parseFloat(str);
    if (!isNaN(pct) && pct > 0) return { value: pct, unit: "PERCENT" };
  }
  if (str.endsWith("px")) {
    const px = parseFloat(str);
    if (!isNaN(px) && px > 0) return { value: px, unit: "PIXELS" };
  }
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    // Ratios < 10 → convert to percent (1.5 → 150%)
    if (num < 10) return { value: num * 100, unit: "PERCENT" };
    return { value: num, unit: "PIXELS" };
  }
  return { unit: "AUTO" };
}

/**
 * Create a deterministic key segment from a Figma LineHeight.
 * Returns "" for AUTO (omitted from key), or "lhNNpx" / "lhNNpct".
 */
export function lineHeightKeyStr(lh: LineHeight): string {
  if ("value" in lh) {
    const rounded = Math.round(lh.value);
    return lh.unit === "PIXELS" ? `lh${rounded}` : `lh${rounded}pct`;
  }
  return "";
}

export interface TypographyCombo {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: LineHeight;
  letterSpacing: number;
}

/**
 * Build a deterministic key for TextStyle lookup.
 * Used by both collectTypographyFromTree (creation) and linkTextStyleIfApplicable (linking)
 * to guarantee key consistency.
 */
export function buildTextStyleKey(
  fontFamily: string,
  fontWeight: number,
  fontSize: number,
  lineHeight: number | string | undefined,
  letterSpacing: number
): string {
  const styleStr = fontWeightToStyle(fontWeight);
  const actualFontSize = Math.max(fontSize || 14, 8);
  const lh = parseFigmaLineHeight(lineHeight);
  const lhKey = lineHeightKeyStr(lh);
  const ls = Math.round((letterSpacing || 0) * 10) / 10;
  const lsKey = ls !== 0 ? `ls${Math.round(ls * 10)}` : "";
  return [fontFamily, styleStr, actualFontSize, lhKey, lsKey].filter(Boolean).join("-");
}

/**
 * Recursively collect unique typography combinations from the wireframe tree.
 * Includes lineHeight and letterSpacing in the key for accurate TextStyle matching.
 */
export function collectTypographyFromTree(
  node: WireframeNode,
  combos: Map<string, TypographyCombo>,
  pluginFontFamily: string,
  fontMode: "plugin" | "website" | "lines"
): void {
  // Only collect from text nodes
  if ((node.type === "text" || node.textContent) && node.fontSize) {
    const family = fontMode === "plugin" || fontMode === "lines" ? pluginFontFamily : (node.fontFamily || pluginFontFamily);
    const fontSize = Math.max(node.fontSize || 14, 8);
    const fontWeight = node.fontWeight || 400;
    const key = buildTextStyleKey(family, fontWeight, node.fontSize, node.lineHeight, node.letterSpacing || 0);
    const lh = parseFigmaLineHeight(node.lineHeight);
    const ls = Math.round((node.letterSpacing || 0) * 10) / 10;

    if (!combos.has(key)) {
      combos.set(key, { fontFamily: family, fontSize, fontWeight, lineHeight: lh, letterSpacing: ls });
    }

    // Also collect from styledSegments (multi-segment text like "$12 /month")
    if (node.styledSegments) {
      for (const seg of node.styledSegments) {
        if (seg.fontSize) {
          const segFamily = fontMode === "plugin" ? pluginFontFamily : (seg.fontFamily || node.fontFamily || pluginFontFamily);
          const segFontSize = Math.max(seg.fontSize || 14, 8);
          const segFontWeight = seg.fontWeight || node.fontWeight || 400;
          const segKey = buildTextStyleKey(segFamily, segFontWeight, seg.fontSize, node.lineHeight, node.letterSpacing || 0);
          if (!combos.has(segKey)) {
            combos.set(segKey, { fontFamily: segFamily, fontSize: segFontSize, fontWeight: segFontWeight, lineHeight: lh, letterSpacing: ls });
          }
        }
      }
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      collectTypographyFromTree(child, combos, pluginFontFamily, fontMode);
    }
  }
}

/**
 * Create Figma TextStyles from unique typography combinations in the tree.
 *
 * Naming:
 * - Plugin mode: W2W/--Montserrat-Bold-24  (lh suffix only when disambiguating collisions)
 * - Website mode: WEB/--SpaceGrotesk-Bold-24
 *
 * TextStyles include lineHeight and letterSpacing so linking won't detach.
 */
export async function createTextStyles(
  frames: WireframeFrame[],
  fontFamily: string,
  fontMode: "plugin" | "website" | "lines",
  originalFontNames?: Record<string, string>,
  hostnamePrefix: string = "WEB"
): Promise<Map<string, TextStyle>> {
  const textStyleMap = new Map<string, TextStyle>();

  // Collect unique typography combos (including lineHeight + letterSpacing)
  const combos = new Map<string, TypographyCombo>();
  for (const frame of frames) {
    if (frame.tree) {
      collectTypographyFromTree(frame.tree, combos, fontFamily, fontMode);
    }
  }

  if (combos.size === 0) {
    return textStyleMap;
  }

  logger.info("Creating text styles", {
    uniqueCombos: combos.size,
    fontMode,
  });

  // Get existing text styles once
  const existingTextStyles = await figma.getLocalTextStylesAsync();
  let stylesCreated = 0;
  const skippedMissingFont = new Set<string>();
  // All modes nest under the site's hostname folder so multi-site imports
  // never collide. Plugin/Lines modes add a sub-folder so the same hostname
  // can host multiple modes side-by-side without overwrites:
  //   Website fonts → `{hostname}/--Inter-Bold-24`
  //   Plugin fonts  → `{hostname}/Plugin/--Inter-Bold-24`
  //   Lines fonts   → `{hostname}/Lines/--Inter-Bold-24`
  const prefix =
    fontMode === "plugin" ? `${hostnamePrefix}/Plugin` :
    fontMode === "lines" ? `${hostnamePrefix}/Lines` :
    hostnamePrefix;

  // Detect lineHeight collisions: same base key (font+style+size+ls) with different lineHeights.
  // Only include lh in the display name when needed to disambiguate.
  const baseKeyLhMap = new Map<string, Set<string>>();
  for (const [, combo] of Array.from(combos)) {
    const s = fontWeightToStyle(combo.fontWeight);
    const ls = combo.letterSpacing !== 0 ? `ls${Math.round(combo.letterSpacing * 10)}` : "";
    const base = [combo.fontFamily, s, combo.fontSize, ls].filter(Boolean).join("-");
    const lh = lineHeightKeyStr(combo.lineHeight);
    if (!baseKeyLhMap.has(base)) baseKeyLhMap.set(base, new Set());
    baseKeyLhMap.get(base)!.add(lh);
  }
  const lhCollisionBases = new Set<string>();
  for (const [base, lhSet] of Array.from(baseKeyLhMap)) {
    if (lhSet.size > 1) lhCollisionBases.add(base);
  }

  // Track styles created/reused within this run (shared across combos so
  // same-run dedupe works and V2 counter is consistent).
  const createdInThisRun = new Map<string, TextStyle>();

  for (const [key, combo] of Array.from(combos)) {
    if (stylesCreated >= MAX_TEXT_STYLES) break;

    const styleStr = fontWeightToStyle(combo.fontWeight);
    const lhKey = lineHeightKeyStr(combo.lineHeight);
    const lsKey = combo.letterSpacing !== 0 ? `ls${Math.round(combo.letterSpacing * 10)}` : "";
    const baseKey = [combo.fontFamily, styleStr, combo.fontSize, lsKey].filter(Boolean).join("-");
    const needsLh = lhCollisionBases.has(baseKey);
    const nameParts = [combo.fontFamily, styleStr, combo.fontSize];
    if (needsLh && lhKey) nameParts.push(lhKey);
    if (lsKey) nameParts.push(lsKey);
    const styleName = `${prefix}/--${nameParts.join("-")}`;

    try {
      // Category A: Named + Versioned. Same value → skip; mismatch → `-V2`.
      const textStyle = await findOrCreateVersionedTextStyle(
        styleName,
        combo.fontFamily,
        styleStr,
        combo.fontSize,
        combo.lineHeight,
        combo.letterSpacing,
        existingTextStyles,
        createdInThisRun
      );

      textStyleMap.set(key, textStyle);
      // stylesCreated counts all successfully-produced styles, reused or new —
      // the MAX_TEXT_STYLES cap applies to unique combos processed, not API writes.
      stylesCreated++;
    } catch {
      // Font not available — fall back to Inter if "Use original fonts" was chosen
      if (originalFontNames && originalFontNames[combo.fontFamily]) {
        try {
          const textStyle = await findOrCreateVersionedTextStyle(
            styleName,
            "Inter",
            styleStr,
            combo.fontSize,
            combo.lineHeight,
            combo.letterSpacing,
            existingTextStyles,
            createdInThisRun
          );
          textStyleMap.set(key, textStyle);
          stylesCreated++;
        } catch {
          logger.warn("Skipping text style (Inter style variant not available)", {
            font: combo.fontFamily,
            style: styleStr,
          });
        }
      } else {
        logger.warn("Skipping text style (font not available)", {
          font: combo.fontFamily,
          style: styleStr,
        });
        skippedMissingFont.add(`${combo.fontFamily}-${styleStr}-${combo.fontSize}`);
      }
    }
  }

  if (skippedMissingFont.size > 0) {
    logger.warn("Skipped text styles due to missing fonts", {
      skipCount: skippedMissingFont.size,
    });
  }

  return textStyleMap;
}

// ============================================================================
// Effect Styles (Phase 2)
// ============================================================================

/**
 * Deterministic value key for a single FigmaEffect.
 * Includes all fields that affect visual output — offset, radius, spread,
 * color (with alpha), blur radius.
 */
function effectValueKey(e: FigmaEffect): string {
  const colorKey = e.color
    ? `#${Math.round(e.color.r * 255).toString(16).padStart(2, "0")}${Math.round(e.color.g * 255).toString(16).padStart(2, "0")}${Math.round(e.color.b * 255).toString(16).padStart(2, "0")}@${Math.round(e.color.a * 100)}`
    : "";
  const offsetKey = e.offset ? `${e.offset.x},${e.offset.y}` : "";
  const r = e.radius ?? 0;
  const s = e.spread ?? 0;
  const br = e.blurRadius ?? 0;
  return `${e.type}:${offsetKey}:r${r}:s${s}:b${br}:${colorKey}`;
}

/**
 * Deterministic value key for an ordered FigmaEffect[] array.
 * Order matters: [shadow, blur] renders differently than [blur, shadow]
 * when composed in Figma.
 */
export function effectsKey(effects: FigmaEffect[]): string {
  return effects.map(effectValueKey).join("|");
}

/**
 * Same shape as `effectValueKey` but operates on Figma-native `Effect`
 * objects (used to hash effects stored on existing EffectStyle.effects for
 * value-first matching against an incoming FigmaEffect[]).
 */
function nativeEffectValueKey(e: Effect): string {
  const anyE = e as unknown as {
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    offset?: { x: number; y: number };
    radius?: number;
    spread?: number;
  };
  const colorKey = anyE.color
    ? `#${Math.round(anyE.color.r * 255).toString(16).padStart(2, "0")}${Math.round(anyE.color.g * 255).toString(16).padStart(2, "0")}${Math.round(anyE.color.b * 255).toString(16).padStart(2, "0")}@${Math.round(anyE.color.a * 100)}`
    : "";
  const offsetKey = anyE.offset ? `${anyE.offset.x},${anyE.offset.y}` : "";
  const r = anyE.radius ?? 0;
  const s = anyE.spread ?? 0;
  // Native `Effect` stores blur amount in `radius` for LAYER_BLUR/BACKGROUND_BLUR
  const br = (anyE.type === "LAYER_BLUR" || anyE.type === "BACKGROUND_BLUR") ? (anyE.radius ?? 0) : 0;
  return `${anyE.type}:${offsetKey}:r${r}:s${s}:b${br}:${colorKey}`;
}

function nativeEffectsKey(effects: readonly Effect[]): string {
  return effects.map(nativeEffectValueKey).join("|");
}

/**
 * Walk the wireframe tree and collect every unique effects array (by value
 * key). Skipped: nodes with no effects, plugin-color mode (shadows stripped
 * by convertEffectsToFigma anyway).
 */
function collectEffectsFromTree(
  node: WireframeNode,
  out: Map<string, FigmaEffect[]>
): void {
  if (node.effects && node.effects.length > 0) {
    const visible = node.effects.filter((e) => e.visible);
    if (visible.length > 0) {
      const key = effectsKey(visible);
      if (!out.has(key)) out.set(key, visible);
    }
  }
  if (node.children) {
    for (const child of node.children) {
      collectEffectsFromTree(child, out);
    }
  }
}

/**
 * Scan existing styles for highest occupied `--shadow-NN` slot in this
 * namespace. Returns maxSlot + 1 for counter seeding.
 */
function nextEffectCounterStart(
  hostnamePrefix: string,
  existingStyles: readonly { name: string }[]
): number {
  const pattern = new RegExp(`^${escapeRegex(hostnamePrefix)}/--shadow-(\\d+)$`);
  let maxSlot = 0;
  for (const s of existingStyles) {
    const m = s.name.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSlot) maxSlot = n;
    }
  }
  return maxSlot + 1;
}

/**
 * Category B helper for EffectStyles — value-first matching across
 * existing `--shadow-NN` slots. Same contract as
 * findOrCreateValueMatchedPaintStyle but for EffectStyle.
 */
function findOrCreateValueMatchedEffectStyle(
  hostnamePrefix: string,
  valueKey: string,
  nativeEffects: Effect[],
  existingStyles: readonly EffectStyle[],
  createdInThisRun: Map<string, EffectStyle>,
  counterState: { next: number }
): EffectStyle {
  const cached = createdInThisRun.get(`__val:${valueKey}`);
  if (cached) return cached;

  const slotPattern = new RegExp(
    `^${escapeRegex(hostnamePrefix)}/--shadow-\\d+$`
  );
  for (const s of existingStyles) {
    if (!slotPattern.test(s.name)) continue;
    if (nativeEffectsKey(s.effects as readonly Effect[]) === valueKey) {
      createdInThisRun.set(`__val:${valueKey}`, s);
      createdInThisRun.set(s.name, s);
      return s;
    }
  }

  const slotNum = String(counterState.next).padStart(2, "0");
  const finalName = `${hostnamePrefix}/--shadow-${slotNum}`;
  counterState.next++;

  const style = figma.createEffectStyle();
  style.name = finalName;
  style.effects = nativeEffects;
  createdInThisRun.set(`__val:${valueKey}`, style);
  createdInThisRun.set(finalName, style);
  return style;
}

/**
 * Create Figma EffectStyles for every unique effects combination in the
 * wireframe tree.
 *
 * Keyed by `effectsKey(effects)` (FigmaEffect format) so the resulting map
 * can be consumed by `linkEffectStyleIfAvailable` with the node's raw
 * effects array.
 *
 * In plugin color mode this function returns an empty map — shadows and
 * background blur are stripped by `convertEffectsToFigma` for clean
 * wireframes, so there are no effects worth promoting to styles.
 */
export async function createEffectStyles(
  frames: WireframeFrame[],
  hostnamePrefix: string,
  colorMode: "plugin" | "website"
): Promise<Map<string, EffectStyle>> {
  const styleMap = new Map<string, EffectStyle>();
  if (colorMode === "plugin") return styleMap;

  // Collect unique effects arrays from all frames' trees
  const unique = new Map<string, FigmaEffect[]>();
  for (const frame of frames) {
    if (frame.tree) collectEffectsFromTree(frame.tree, unique);
  }
  if (unique.size === 0) return styleMap;

  const existingStyles = await figma.getLocalEffectStylesAsync();
  const createdInThisRun = new Map<string, EffectStyle>();
  const counterState = {
    next: nextEffectCounterStart(hostnamePrefix, existingStyles),
  };

  for (const [srcKey, effects] of Array.from(unique)) {
    try {
      // Convert FigmaEffect[] → native Effect[] once. Skip entirely if
      // conversion produces no effects (e.g. plugin mode stripped them all).
      const nativeEffects = convertEffectsToFigma(effects);
      if (nativeEffects.length === 0) continue;

      const nativeKey = nativeEffectsKey(nativeEffects);
      const style = findOrCreateValueMatchedEffectStyle(
        hostnamePrefix,
        nativeKey,
        nativeEffects,
        existingStyles,
        createdInThisRun,
        counterState
      );
      // Store by BOTH the source FigmaEffect key (so link-time lookup works)
      // and the native key (for internal dedupe correctness).
      styleMap.set(srcKey, style);
    } catch (err) {
      logger.warn("Failed to create effect style", { key: srcKey, error: err });
    }
  }

  logger.info("Created effect styles", { count: styleMap.size });
  return styleMap;
}

/**
 * If a matching EffectStyle exists in the context, attach it to the frame
 * via `setEffectStyleIdAsync` and return true. Caller must skip
 * `frame.effects = ...` when this returns true (setting `effects` after
 * `effectStyleId` would detach the link).
 */
export async function linkEffectStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext,
  sourceEffects: FigmaEffect[] | undefined
): Promise<boolean> {
  if (!context.effectStyleMap) return false;
  if (!sourceEffects || sourceEffects.length === 0) return false;
  const visible = sourceEffects.filter((e) => e.visible);
  if (visible.length === 0) return false;

  const key = effectsKey(visible);
  const style = context.effectStyleMap.get(key);
  if (!style) return false;

  await frame.setEffectStyleIdAsync(style.id);
  return true;
}

// ============================================================================
// Grid Styles (Phase 3 — Mode A: Root Containers Only)
// ============================================================================

/**
 * Identify whether a node is a "root" CSS-Grid container worth promoting
 * to a global GridStyle. Mode A hybrid heuristic:
 *   - CSS max-width set (likely a centered page-level container), OR
 *   - Semantic HTML tag (main / body), OR
 *   - Shallow depth (≤ 2) — unlikely to be a nested sub-grid.
 *
 * Sub-grids at depth > 2 without max-width stay inline via `applyGridLayout`.
 */
export function isRootGridContainer(
  node: WireframeNode,
  depth: number
): boolean {
  if (node.layoutMode !== "GRID") return false;
  if (typeof node.cssMaxWidth === "number") return true;
  if (node.tag === "main" || node.tag === "body") return true;
  if (depth <= 2) return true;
  return false;
}

/** Value hash for a grid configuration — columns, rows, gaps, auto-flow. */
export function gridKey(node: WireframeNode): string {
  const cols = node.gridTemplateColumns || "";
  const rows = node.gridTemplateRows || "";
  const colGap = typeof node.gridColumnGap === "number" ? node.gridColumnGap : 0;
  const rowGap = typeof node.gridRowGap === "number" ? node.gridRowGap : 0;
  const flow = node.gridAutoFlow || "row";
  return `cols=${cols}|rows=${rows}|colGap=${colGap}|rowGap=${rowGap}|flow=${flow}`;
}

/** Descriptive GridStyle name segment: e.g. `--grid-12col-24gap`. */
function gridStyleNameSegment(node: WireframeNode): string {
  const cols = parseGridTemplate(node.gridTemplateColumns || "");
  const colCount = cols.length || 1;
  const colGap =
    typeof node.gridColumnGap === "number" ? Math.round(node.gridColumnGap) : 0;
  const parts = [`--grid`, `${colCount}col`];
  if (colGap > 0) parts.push(`${colGap}gap`);
  return parts.join("-");
}

/** Compute LayoutGrid[] for a WireframeNode's grid config. */
function buildLayoutGrids(node: WireframeNode): LayoutGrid[] {
  const cols = parseGridTemplate(node.gridTemplateColumns || "");
  const count = cols.length || 1;
  const colGap =
    typeof node.gridColumnGap === "number" ? Math.max(0, node.gridColumnGap) : 0;

  // Stretch columns across the container — simplest mapping for CSS `1fr` tracks.
  const col: LayoutGrid = {
    pattern: "COLUMNS",
    alignment: "STRETCH",
    gutterSize: colGap,
    count,
    visible: true,
  } as LayoutGrid;

  return [col];
}

/** Compare two LayoutGrid[] arrays for value equality (value-match test). */
function layoutGridsKey(grids: readonly LayoutGrid[]): string {
  return grids
    .map((g) => {
      const anyG = g as unknown as {
        pattern: string;
        count?: number;
        sectionSize?: number;
        gutterSize?: number;
        offset?: number;
        alignment?: string;
      };
      return `${anyG.pattern}:${anyG.count ?? 0}:${anyG.sectionSize ?? 0}:${anyG.gutterSize ?? 0}:${anyG.offset ?? 0}:${anyG.alignment ?? ""}`;
    })
    .join("|");
}

/**
 * Category A — Named + Versioned GridStyle. Same shape as
 * findOrCreateVersionedPaintStyle but operates on GridStyle / LayoutGrid[].
 */
function findOrCreateVersionedGridStyle(
  baseName: string,
  newGrids: LayoutGrid[],
  existingStyles: readonly GridStyle[],
  createdInThisRun: Map<string, GridStyle>
): GridStyle {
  const cached = createdInThisRun.get(baseName);
  if (cached) {
    cached.layoutGrids = newGrids;
    return cached;
  }

  const newKey = layoutGridsKey(newGrids);
  const variants = findVersionedVariants(baseName, existingStyles);

  const match = variants.find(
    (s) => layoutGridsKey(s.layoutGrids as readonly LayoutGrid[]) === newKey
  );
  if (match) {
    createdInThisRun.set(baseName, match);
    createdInThisRun.set(match.name, match);
    return match;
  }

  const usedVersions = new Set<number>();
  for (const v of variants) {
    if (v.name === baseName) usedVersions.add(1);
    else {
      const m = v.name.match(/-V(\d+)$/);
      if (m) usedVersions.add(parseInt(m[1], 10));
    }
  }

  const finalName = nextAvailableVersionName(baseName, usedVersions);
  const style = figma.createGridStyle();
  style.name = finalName;
  style.layoutGrids = newGrids;
  createdInThisRun.set(baseName, style);
  createdInThisRun.set(finalName, style);
  return style;
}

/**
 * Walk the tree with depth tracking and collect unique root-level grid
 * containers by `gridKey`. Nested sub-grids below depth 2 without max-width
 * are excluded (`isRootGridContainer` returns false).
 */
function collectRootGridsFromTree(
  node: WireframeNode,
  depth: number,
  out: Map<string, WireframeNode>
): void {
  if (isRootGridContainer(node, depth)) {
    const k = gridKey(node);
    if (!out.has(k)) out.set(k, node);
  }
  if (node.children) {
    for (const child of node.children) {
      collectRootGridsFromTree(child, depth + 1, out);
    }
  }
}

/**
 * Create Figma GridStyles for every unique root-level CSS Grid in the tree.
 * Uses Category A versioning (descriptive name + value check + -V2 suffix).
 */
export async function createGridStyles(
  frames: WireframeFrame[],
  hostnamePrefix: string
): Promise<Map<string, GridStyle>> {
  const styleMap = new Map<string, GridStyle>();

  const unique = new Map<string, WireframeNode>();
  for (const frame of frames) {
    if (frame.tree) collectRootGridsFromTree(frame.tree, 0, unique);
  }
  if (unique.size === 0) return styleMap;

  const existingStyles = await figma.getLocalGridStylesAsync();
  const createdInThisRun = new Map<string, GridStyle>();

  for (const [key, node] of Array.from(unique)) {
    try {
      const nameSegment = gridStyleNameSegment(node);
      const baseName = `${hostnamePrefix}/${nameSegment}`;
      const layoutGrids = buildLayoutGrids(node);

      const style = findOrCreateVersionedGridStyle(
        baseName,
        layoutGrids,
        existingStyles,
        createdInThisRun
      );
      styleMap.set(key, style);
    } catch (err) {
      logger.warn("Failed to create grid style", { key, error: err });
    }
  }

  logger.info("Created grid styles", { count: styleMap.size });
  return styleMap;
}

/**
 * Link a GridStyle to the frame if a matching style exists in
 * `context.gridStyleMap`. When linked, the caller (applyGridLayout) should
 * skip its inline gridColumnSizes / gridRowSizes / gridColumnGap setters —
 * the style governs the whole grid configuration.
 */
export async function linkGridStyleIfAvailable(
  frame: FrameNode,
  context: RenderContext,
  node: WireframeNode
): Promise<boolean> {
  if (!context.gridStyleMap) return false;
  const key = gridKey(node);
  const style = context.gridStyleMap.get(key);
  if (!style) return false;

  await frame.setGridStyleIdAsync(style.id);
  return true;
}
