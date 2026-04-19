/**
 * List marker wrapper builder for the content-script extractor.
 *
 * Given a computed marker string + measured geometry + font, produces a
 * W2WFrameNode that mirrors the `__w2w-pseudo-before`/`__w2w-pseudo-after`
 * wrappers used by `injectPseudoSpan`. The Figma plugin's pseudo-wrapper
 * flatten branch then treats the marker text exactly like a ::before text.
 *
 * Pure function — no DOM access — so it can be tested in Node without
 * happy-dom. The DOM injection that produces the geometry lives in the
 * browser-extension content script.
 */

import type { W2WFrameNode, W2WTextNode, Quad } from "./w2w-types";

export interface BuildMarkerWrapperInput {
  /** Marker text already formatted by list-markers.ts (e.g. "1.", "•") */
  markerText: string;
  /** Marker box — left/top in viewport+scrollY space */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Combined font string for the TEXT child, e.g. "400 12px SF Pro Text" */
  font: string;
  /** Optional raw color string for the marker (CSS color) */
  color?: string;
  /** Optional font-size (CSS string, e.g. "12px") — REQUIRED for markers whose
      size differs from the <li>'s own font-size (e.g. Apple.com footer
      ::marker). The Figma plugin's css-converter reads fontSize from the
      wrapper's `styles`, not from the font string, so without this the
      marker falls back to a 16px default. */
  fontSize?: string;
  /** Optional font-family fallback stack (CSS string). */
  fontFamily?: string;
  /** Optional font-weight (CSS string, e.g. "400", "600"). */
  fontWeight?: string;
  /** Optional line-height (CSS string, e.g. "16px" or "1.33") */
  lineHeight?: string;
  /** Optional letter-spacing (CSS string, e.g. "-0.12px") */
  letterSpacing?: string;
  /** Optional font-style (CSS, e.g. "italic") */
  fontStyle?: string;
  /** Which side of the li the marker came from */
  pseudo: "::marker";
}

function rectToQuad(x: number, y: number, w: number, h: number): Quad {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

/**
 * Build the `__w2w-pseudo-marker` FRAME + TEXT child pair. Returns null if
 * markerText is empty (e.g. list-style-type: none yielded an empty string).
 */
export function buildMarkerWrapperNode(
  input: BuildMarkerWrapperInput
): W2WFrameNode | null {
  const text = input.markerText;
  if (!text) return null;

  const x = input.x;
  const y = input.y;
  const width = input.width;
  const height = input.height;
  const quad = rectToQuad(x, y, width, height);

  const textChild: W2WTextNode = {
    type: "TEXT",
    x,
    y,
    width,
    height,
    quad,
    value: text,
    font: input.font,
  };

  // Style keys MUST be camelCase — the Figma plugin's css-converter reads
  // `parentStyles.fontSize`, `.lineHeight`, etc. (see
  // packages/figma-plugin/src/rendering/css-converter.ts:convertTextNodeFromValue).
  // Kebab-case keys are silently ignored and the plugin falls back to 16px.
  const styles: Record<string, string | number> = {
    display: "inline",
    position: "static",
  };
  if (input.color) styles.color = input.color;
  if (input.fontSize) styles.fontSize = input.fontSize;
  if (input.fontFamily) styles.fontFamily = input.fontFamily;
  if (input.fontWeight) styles.fontWeight = input.fontWeight;
  if (input.lineHeight) styles.lineHeight = input.lineHeight;
  if (input.letterSpacing) styles.letterSpacing = input.letterSpacing;
  if (input.fontStyle && input.fontStyle !== "normal") {
    styles.fontStyle = input.fontStyle;
  }

  return {
    type: "FRAME",
    x,
    y,
    width,
    height,
    quad,
    tag: "span",
    classList: ["__w2w-pseudo-marker"],
    attr: {},
    styles,
    children: [textChild],
  };
}
