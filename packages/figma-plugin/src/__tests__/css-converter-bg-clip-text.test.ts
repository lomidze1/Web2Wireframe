/**
 * css-converter — `background-clip: text` (gradient text)
 *
 * Bug (web2wireframe.design "Capture / Analyze / Output" headings, Figma
 * node 4467-1588): the three <h3> headings imported as a SOLID BLUE BOX with
 * no visible text.
 *
 * Live CSS on `.featureGroupHead h3` (verified via getComputedStyle):
 *   background-image        : linear-gradient(135deg, rgb(59,130,246), rgb(36,109,255))
 *   background-clip         : text          ← paint clipped to glyph shapes
 *   color                   : rgba(0,0,0,0) ← the text itself is transparent
 *   -webkit-text-fill-color : rgba(0,0,0,0)
 *
 * Root cause (two independent defects):
 *   1. parseFills() read backgroundImage and emitted a GRADIENT_LINEAR fill
 *      WITHOUT checking background-clip → the gradient painted the whole box.
 *   2. textColor = webkitTextFillColor || color = rgba(0,0,0,0) → invisible text.
 *
 * Downstream the coalesced <h3> text node carried the gradient in `fills`, so
 * nodes.ts saw hasBackgroundFills and called createTextWithBackground() →
 * wrapper FRAME with the gradient + inner TextNode at opacity 0.
 *
 * Fix: when background-clip is `text`, gradient/image layers move out of
 * `fills` (box) into `textFills` (glyphs), and a transparent textColor falls
 * back to the gradient's first stop so non-website modes stay visible.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaFill } from "../types";

type Tree = Record<string, unknown>;

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width: 235,
    height: 27,
    quad: [0, 0, 235, 0, 235, 27, 0, 27],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function makeText(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "TEXT",
    x: 0,
    y: 0,
    width: 80,
    height: 27,
    quad: [0, 0, 80, 0, 80, 27, 0, 27],
    value,
    font: "800 16.8px Inter",
    ...overrides,
  };
}

/** The real `.featureGroupHead h3` from web2wireframe.design. */
function makeGradientHeading(extraStyles: Record<string, unknown> = {}): Record<string, unknown> {
  return makeFrame({
    tag: "h3",
    classList: ["featureGroupHead"],
    styles: {
      display: "block",
      fontSize: "16.8px",
      fontWeight: "800",
      backgroundImage:
        "linear-gradient(135deg, rgb(59, 130, 246), rgb(36, 109, 255))",
      backgroundClip: "text",
      color: "rgba(0, 0, 0, 0)",
      webkitTextFillColor: "rgba(0, 0, 0, 0)",
      ...extraStyles,
    },
    children: [makeText("Capture")],
  });
}

function fillsOf(node: Tree): FigmaFill[] {
  return (node.fills as FigmaFill[] | undefined) ?? [];
}

function textFillsOf(node: Tree): FigmaFill[] {
  return (node.textFills as FigmaFill[] | undefined) ?? [];
}

/** Parse "rgba(r, g, b, a)" / "rgb(r, g, b)" → alpha. */
function alphaOf(css: string): number {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
  return parts.length >= 4 ? parts[3] : 1;
}

describe("css-converter — background-clip: text", () => {
  // -------------------------------------------------------------------------
  // 1. The box must NOT be painted
  // -------------------------------------------------------------------------
  it("does not paint the gradient on the box", () => {
    const result = convertW2WToWireframe(makeGradientHeading() as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    expect(result.type).toBe("text");
    expect(fillsOf(result).some((f) => f.type.startsWith("GRADIENT_"))).toBe(false);
    // Legacy mirror field must not resurrect the box gradient either
    // (nodes.ts falls back to node.backgroundGradient when fills are absent).
    expect(result.backgroundGradient).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. The gradient must survive — as a TEXT fill
  // -------------------------------------------------------------------------
  it("moves the gradient onto textFills with element dims intact", () => {
    const result = convertW2WToWireframe(makeGradientHeading() as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const gradient = textFillsOf(result).find((f) => f.type === "GRADIENT_LINEAR");

    expect(gradient).toBeDefined();
    expect(gradient!.angle).toBe(135);
    expect(gradient!.stops!.length).toBeGreaterThanOrEqual(2);
    // Dims are required for a correct gradient transform (see css-converter-gradients).
    expect(gradient!.elementWidth).toBe(235);
    expect(gradient!.elementHeight).toBe(27);
  });

  // -------------------------------------------------------------------------
  // 3. Transparent textColor must fall back to a visible color
  //    (this is what keeps `lines` / `plugin` modes from rendering nothing)
  // -------------------------------------------------------------------------
  it("falls back from transparent textColor to the gradient's first stop", () => {
    const result = convertW2WToWireframe(makeGradientHeading() as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    const textColor = result.textColor as string;
    expect(alphaOf(textColor)).toBeGreaterThan(0);
    // First stop of the CSS gradient is rgb(59, 130, 246).
    expect(textColor).toMatch(/\b59\b/);
    expect(textColor).toMatch(/\b130\b/);
    expect(textColor).toMatch(/\b246\b/);
  });

  // -------------------------------------------------------------------------
  // 4. A real background-color under a clipped gradient stays on the box
  //    (CSS: only the *image* is clipped when it is the only clipped layer —
  //     but background-clip applies to the color too, so it must NOT paint.)
  // -------------------------------------------------------------------------
  it("does not paint background-color on the box either when clipped to text", () => {
    const result = convertW2WToWireframe(
      makeGradientHeading({ backgroundColor: "rgb(255, 0, 0)" }) as never,
      { layoutMode: "autoLayout" },
    ) as Tree;

    expect(fillsOf(result).some((f) => f.type === "SOLID")).toBe(false);
    expect(result.backgroundColor).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 5. Regression guard — normal (unclipped) gradients still paint the box
  // -------------------------------------------------------------------------
  it("leaves a normal gradient background on the box (no regression)", () => {
    const normal = makeFrame({
      tag: "div",
      width: 375,
      height: 600,
      quad: [0, 0, 375, 0, 375, 600, 0, 600],
      styles: {
        display: "block",
        backgroundImage: "linear-gradient(145deg, rgb(36, 109, 255), rgb(255, 255, 255))",
      },
    });

    const result = convertW2WToWireframe(normal as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    expect(fillsOf(result).some((f) => f.type === "GRADIENT_LINEAR")).toBe(true);
    expect(textFillsOf(result)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 6. background-clip: text with a plain color (no gradient) — text must
  //    still not be transparent, and the box must stay unpainted.
  // -------------------------------------------------------------------------
  it("keeps text visible when clipped background is a solid color", () => {
    const solidClipped = makeFrame({
      tag: "h3",
      styles: {
        display: "block",
        backgroundColor: "rgb(20, 40, 60)",
        backgroundClip: "text",
        color: "rgba(0, 0, 0, 0)",
        webkitTextFillColor: "rgba(0, 0, 0, 0)",
      },
      children: [makeText("Solid clipped")],
    });

    const result = convertW2WToWireframe(solidClipped as never, {
      layoutMode: "autoLayout",
    }) as Tree;

    expect(fillsOf(result)).toHaveLength(0);
    expect(alphaOf(result.textColor as string)).toBeGreaterThan(0);
    expect(result.textColor).toMatch(/\b20\b/);
  });
});

// ---------------------------------------------------------------------------
// Multi-layer background-clip — stripe.com
// ---------------------------------------------------------------------------

/**
 * `background-clip` is a LIST: one value per background layer. stripe.com's
 * "500M+" / "10K+" / "150K+" carry two gradient layers, so getComputedStyle
 * reports `"text, text"` — and the strict `=== "text"` test missed it, leaving
 * the three numbers as solid gradient boxes with invisible glyphs.
 */
describe("css-converter — background-clip with several layers", () => {
  it("recognises stripe.com's `text, text` and moves the gradient onto the glyphs", () => {
    const result = convertW2WToWireframe(
      makeGradientHeading({ backgroundClip: "text, text" }) as never,
      { layoutMode: "autoLayout" },
    ) as Tree;

    expect(result.type).toBe("text");
    expect(fillsOf(result).some((f) => f.type.startsWith("GRADIENT_"))).toBe(false);
    expect(textFillsOf(result).some((f) => f.type.startsWith("GRADIENT_"))).toBe(true);
  });

  it("tolerates the whitespace a browser may report", () => {
    const result = convertW2WToWireframe(
      makeGradientHeading({ backgroundClip: "  text ,  text  " }) as never,
      { layoutMode: "autoLayout" },
    ) as Tree;

    expect(textFillsOf(result).some((f) => f.type.startsWith("GRADIENT_"))).toBe(true);
  });

  it("leaves a MIXED list alone — only some layers clip to the glyphs", () => {
    // Figma paints one thing per node, so a half-and-half clip has no faithful
    // rendering. Keeping the old box behaviour is the safer half.
    const result = convertW2WToWireframe(
      makeGradientHeading({ backgroundClip: "text, border-box" }) as never,
      { layoutMode: "autoLayout" },
    ) as Tree;

    expect(textFillsOf(result).some((f) => f.type.startsWith("GRADIENT_"))).toBe(false);
  });

  it("still ignores an ordinary background-clip", () => {
    const result = convertW2WToWireframe(
      makeGradientHeading({ backgroundClip: "border-box" }) as never,
      { layoutMode: "autoLayout" },
    ) as Tree;

    expect(textFillsOf(result).some((f) => f.type.startsWith("GRADIENT_"))).toBe(false);
  });
});
