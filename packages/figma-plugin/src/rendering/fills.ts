/**
 * Fill, stroke, and effect conversion for Figma
 * Converts FigmaFill[], FigmaStroke[], FigmaEffect[] to Figma native formats
 */

import type { FigmaFill, FigmaStroke, FigmaEffect, RenderContext } from "../types";
import {
  cssColorToFigmaRGB,
  hexToFigmaRGB,
  isLightColorValue,
  isSaturatedColor,
  determineColorRole,
  getAlternativePluginColor,
} from "./colors";
import {
  calculateRadialGradientTransform,
  calculateLinearGradientTransform,
} from "./gradients";

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
  className?: string
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
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              gradientTransform: calculateLinearGradientTransform(
                fill.angle || 180,
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
              gradientStops: fill.stops.map((stop) => ({
                position: stop.position,
                color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
              })),
              gradientTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
            };
            paints.push(angularPaint);
          }
        }
        break;

      case "IMAGE_PLACEHOLDER": {
        // Try to render real image if URL is available in assets map
        if (fill.imageUrl && context.assetsMap?.has(fill.imageUrl)) {
          try {
            const dataUri = context.assetsMap.get(fill.imageUrl)!;
            const commaIndex = dataUri.indexOf(",");
            if (commaIndex > 0) {
              const base64Str = dataUri.substring(commaIndex + 1);
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
                bytes[p++] = (a << 2) | (b >> 4);
                bytes[p++] = ((b & 15) << 4) | (c >> 2);
                bytes[p++] = ((c & 3) << 6) | d;
              }
              const image = figma.createImage(bytes);
              paints.push({
                type: "IMAGE",
                imageHash: image.hash,
                scaleMode: "FILL",
                visible: true,
                opacity: 1,
              } as Paint);
              console.log(`[W2W] ✅ Background image fill: ${fill.imageUrl.substring(0, 60)}...`);
              break;
            }
          } catch (err) {
            console.warn(`[W2W] Background image failed, using placeholder:`, err);
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

/**
 * Convert FigmaStroke[] to Figma strokes
 * Note: Figma doesn't support different colors per side, so we use the first stroke
 * In plugin colors mode: ALWAYS use text color (#11151A) for clean black borders
 */
export function convertStrokesToFigma(
  strokes: FigmaStroke[] | undefined,
  context?: RenderContext
): { paints: Paint[]; weight: number } {
  if (!strokes || strokes.length === 0) {
    return { paints: [], weight: 0 };
  }

  // Use first stroke for weight
  const firstStroke = strokes[0];

  // In plugin colors mode: ALL strokes/borders use text color (#11151A)
  if (context?.colorMode === "plugin" && context.pluginColors) {
    const textColor = hexToFigmaRGB(context.pluginColors.text);
    const paints: Paint[] = [
      {
        type: "SOLID",
        color: textColor,
        opacity: 1.0,
      },
    ];
    return { paints, weight: firstStroke.weight };
  }

  // Website colors mode: use original stroke color
  const paints: Paint[] = [
    {
      type: "SOLID",
      color: {
        r: firstStroke.color.r,
        g: firstStroke.color.g,
        b: firstStroke.color.b,
      },
      opacity: firstStroke.color.a,
    },
  ];

  return { paints, weight: firstStroke.weight };
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
