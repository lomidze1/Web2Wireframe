/**
 * Component documentation FRAME wrapping (Phase C, h2d-parity).
 *
 * Wraps a hover ComponentSet in a "Component N" doc-frame that contains:
 *   - the ComponentSet (styled: gray fill @0.7, black stroke 0.5, radius 5)
 *   - x-axis-legend FRAME ("default" | "hover" labels)
 *   - y-axis-legend FRAME ("variant 1" … "variant N" labels)
 *
 * Mirrors the exact struct h2d emits — see docs/studyH2D/decoded/H2D-pricing.json
 * (Component 1: wrapper FRAME 491×356 = 371+120 wide × 326+30 tall).
 */
import { logger } from "../utils/logger";

export interface DocFrameOpts {
  componentSet: ComponentSetNode;
  componentIndex: number;
  variantCount: number;
  /** Legend font (default: Inter Light, matches h2d). */
  font?: { family: string; style: string };
}

const DEFAULT_FONT = { family: "Inter", style: "Light" };
const LEGEND_FONT_SIZE = 12;
const Y_LEGEND_WIDTH = 120;
const X_LEGEND_HEIGHT = 30;

// h2d styling values (extracted from H2D-pricing.json apple.com Component 1).
const CS_FILL_R = 245 / 255;
const CS_FILL_G = 245 / 255;
const CS_FILL_B = 245 / 255;
const CS_FILL_OPACITY = 0.7;
const CS_STROKE_WEIGHT = 0.5;
const CS_CORNER_RADIUS = 5;

/**
 * Apply h2d ComponentSet styling. The ComponentSet itself is what holds the
 * gray "card" appearance in h2d's emit — variants render on top of this.
 */
function applyComponentSetStyling(cs: ComponentSetNode, componentIndex: number): void {
  cs.name = `Component ${componentIndex}`;
  cs.fills = [
    {
      type: "SOLID",
      color: { r: CS_FILL_R, g: CS_FILL_G, b: CS_FILL_B },
      opacity: CS_FILL_OPACITY,
    },
  ];
  cs.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
  cs.strokeWeight = CS_STROKE_WEIGHT;
  cs.cornerRadius = CS_CORNER_RADIUS;
}

/** Create a TEXT node with the legend font + given characters. */
function createLegendText(
  characters: string,
  font: { family: string; style: string },
): TextNode {
  const t = figma.createText();
  // Set fontName before .characters — Figma rejects characters set on text
  // with an unloaded font.
  try {
    (t as unknown as { fontName: { family: string; style: string } }).fontName = font;
  } catch {
    // Mock environments may not allow fontName mutation; harmless.
  }
  try {
    (t as unknown as { fontSize: number }).fontSize = LEGEND_FONT_SIZE;
  } catch {
    // ditto
  }
  try {
    (t as unknown as { characters: string }).characters = characters;
  } catch {
    // If font failed to load, characters set throws — leave empty.
  }
  return t;
}

function createXAxisLegend(
  font: { family: string; style: string },
  width: number,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = "x-axis-legend";
  frame.fills = [];
  try {
    frame.layoutMode = "HORIZONTAL";
    frame.itemSpacing = 16;
    frame.paddingTop = 8;
    frame.paddingBottom = 8;
    frame.paddingLeft = 16;
    frame.paddingRight = 16;
  } catch {
    // Mock environments may not have layoutMode setters.
  }
  const defaultLabel = createLegendText("default", font);
  defaultLabel.name = "default";
  const hoverLabel = createLegendText("hover", font);
  hoverLabel.name = "hover";
  frame.appendChild(defaultLabel);
  frame.appendChild(hoverLabel);
  try {
    if (typeof frame.resize === "function") {
      frame.resize(width, X_LEGEND_HEIGHT);
    }
  } catch {
    // Best-effort sizing.
  }
  return frame;
}

function createYAxisLegend(
  font: { family: string; style: string },
  variantCount: number,
  height: number,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = "y-axis-legend";
  frame.fills = [];
  try {
    frame.layoutMode = "VERTICAL";
    frame.itemSpacing = 16;
    frame.paddingTop = 8;
    frame.paddingBottom = 8;
    frame.paddingLeft = 16;
    frame.paddingRight = 16;
  } catch {
    // Mock environments may not have layoutMode setters.
  }
  for (let i = 1; i <= variantCount; i++) {
    const label = createLegendText(`variant\n${i}`, font);
    label.name = `variant ${i}`;
    frame.appendChild(label);
  }
  try {
    if (typeof frame.resize === "function") {
      frame.resize(Y_LEGEND_WIDTH, height);
    }
  } catch {
    // Best-effort sizing.
  }
  return frame;
}

/**
 * Wrap a ComponentSet in an h2d-style "Component N" documentation frame.
 *
 * Mutates the ComponentSet (renames + restyles) and returns a new wrapper
 * FrameNode parent. The caller is responsible for placing the wrapper in
 * the section.
 */
export async function wrapInDocFrame(opts: DocFrameOpts): Promise<FrameNode> {
  const { componentSet, componentIndex, variantCount } = opts;
  const font = opts.font ?? DEFAULT_FONT;

  // Apply h2d ComponentSet styling FIRST so wrapper sees final size.
  applyComponentSetStyling(componentSet, componentIndex);

  // Font load required before TEXT.characters in real Figma; non-fatal.
  try {
    if (typeof (figma as { loadFontAsync?: (f: { family: string; style: string }) => Promise<void> }).loadFontAsync === "function") {
      await figma.loadFontAsync(font);
    }
  } catch (err) {
    logger.warn("wrapInDocFrame: legend font load failed — labels may be empty", {
      font,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const csWidth = componentSet.width || 200;
  const csHeight = componentSet.height || 100;

  const xLegend = createXAxisLegend(font, csWidth);
  const yLegend = createYAxisLegend(font, variantCount, csHeight);

  const wrapper = figma.createFrame();
  wrapper.name = `Component ${componentIndex}`;
  wrapper.fills = [];
  // Use absolute positioning (h2d does not auto-layout the wrapper):
  //   ComponentSet at (0, X_LEGEND_HEIGHT)
  //   x-axis-legend at (0, 0)         spanning ComponentSet width
  //   y-axis-legend at (csWidth, X_LEGEND_HEIGHT) spanning ComponentSet height
  try {
    wrapper.layoutMode = "NONE";
  } catch {
    // ignore
  }

  wrapper.appendChild(componentSet);
  wrapper.appendChild(xLegend);
  wrapper.appendChild(yLegend);

  try {
    (componentSet as unknown as { x: number; y: number }).x = 0;
    (componentSet as unknown as { x: number; y: number }).y = X_LEGEND_HEIGHT;
    (xLegend as unknown as { x: number; y: number }).x = 0;
    (xLegend as unknown as { x: number; y: number }).y = 0;
    (yLegend as unknown as { x: number; y: number }).x = csWidth;
    (yLegend as unknown as { x: number; y: number }).y = X_LEGEND_HEIGHT;
  } catch {
    // Mock components in tests may not expose x/y setters.
  }

  try {
    if (typeof wrapper.resizeWithoutConstraints === "function") {
      wrapper.resizeWithoutConstraints(csWidth + Y_LEGEND_WIDTH, csHeight + X_LEGEND_HEIGHT);
    }
  } catch {
    // Best-effort sizing.
  }

  return wrapper;
}
