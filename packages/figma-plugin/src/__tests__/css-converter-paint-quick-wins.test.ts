/**
 * Paint fidelity quick wins (2026-08-08 render-quality audit):
 *
 *  1. Conic gradient `from <angle>` / `at <pos>` — parsed since forever but
 *     discarded at paint build (identity transform). CSS 0deg starts at
 *     12 o'clock while Figma's angular gradient starts at 3 o'clock, so even
 *     default conics rendered rotated by 90°.
 *  2. `outline` — captured, but only the hover diff ever read it; focus
 *     rings/button rings styled via outline lost their ring in base state.
 *     Emitted as an OUTSIDE stroke only when the element has no border
 *     (the stroke model keeps one representative stroke set per node).
 *  3. Tiled backgrounds — TILE always rendered at scalingFactor 1; a 200px
 *     texture tiled at `background-size: 40px` came out 5× too big. The
 *     converter now forwards the CSS px size so fills.ts can scale.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { calculateConicGradientTransform } from "../rendering/gradients";
import type { W2WFrameNode } from "@w2w/shared";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 200, height: 100,
    quad: [0, 0, 200, 0, 200, 100, 0, 100],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function convert(host: Record<string, unknown>): Record<string, unknown> {
  const root = makeFrame({ tag: 'body', width: 1440, height: 600, children: [host] });
  const tree = convertW2WToWireframe(root as unknown as W2WFrameNode) as unknown as Record<string, unknown>;
  const children = tree.children as Array<Record<string, unknown>>;
  return children[0];
}

const expectMatrixClose = (actual: number[][], expected: number[][]) => {
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      expect(actual[r][c]).toBeCloseTo(expected[r][c], 6);
    }
  }
};

describe("calculateConicGradientTransform", () => {
  it("CSS `from 0deg` (12 o'clock) rotates Figma's 3-o'clock start by -90°", () => {
    // rad = -90°: cos=0, sin=-1
    expectMatrixClose(calculateConicGradientTransform(0, 0.5, 0.5), [
      [0, -1, 1],
      [1, 0, 0],
    ]);
  });

  it("CSS `from 90deg` equals Figma's native start — identity", () => {
    expectMatrixClose(calculateConicGradientTransform(90, 0.5, 0.5), [
      [1, 0, 0],
      [0, 1, 0],
    ]);
  });

  it("off-center `at 25% 75%` translates the gradient center", () => {
    expectMatrixClose(calculateConicGradientTransform(90, 0.25, 0.75), [
      [1, 0, 0.25],
      [0, 1, -0.25],
    ]);
  });
});

describe("outline → OUTSIDE stroke in base state", () => {
  it("outline without border becomes an OUTSIDE stroke", () => {
    const node = convert(makeFrame({
      styles: {
        display: 'block',
        outlineStyle: 'solid',
        outlineWidth: '3px',
        outlineColor: 'rgb(0, 100, 255)',
      },
    }));
    const strokes = node.strokes as Array<Record<string, unknown>>;
    expect(strokes).toBeDefined();
    expect(strokes.length).toBe(1);
    expect(strokes[0].position).toBe('OUTSIDE');
    expect(strokes[0].weight).toBe(3);
  });

  it("border wins when both are present (one representative stroke set)", () => {
    const node = convert(makeFrame({
      styles: {
        display: 'block',
        borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderLeftWidth: '1px',
        borderTopStyle: 'solid', borderRightStyle: 'solid', borderBottomStyle: 'solid', borderLeftStyle: 'solid',
        borderTopColor: 'rgb(0, 0, 0)', borderRightColor: 'rgb(0, 0, 0)', borderBottomColor: 'rgb(0, 0, 0)', borderLeftColor: 'rgb(0, 0, 0)',
        outlineStyle: 'solid',
        outlineWidth: '3px',
        outlineColor: 'rgb(0, 100, 255)',
      },
    }));
    const strokes = node.strokes as Array<Record<string, unknown>>;
    expect(strokes.length).toBe(1);
    expect(strokes[0].position).toBe('INSIDE');
    expect(strokes[0].weight).toBe(1);
  });

  it("outline: none / zero width emits nothing", () => {
    const node = convert(makeFrame({
      styles: { display: 'block', outlineStyle: 'none', outlineWidth: '0px' },
    }));
    expect((node.strokes as unknown[] | undefined) ?? []).toHaveLength(0);
  });
});

describe("tiled background forwards its CSS px size", () => {
  it("background-size: 40px 40px + repeat → TILE with tileSize", () => {
    const node = convert(makeFrame({
      styles: {
        display: 'block',
        backgroundImage: 'url(https://x.test/pattern.png)',
        backgroundSize: '40px 40px',
        backgroundRepeat: 'repeat',
      },
    }));
    const fills = node.fills as Array<Record<string, unknown>>;
    const tile = fills.find(f => f.scaleMode === 'TILE');
    expect(tile).toBeDefined();
    expect(tile!.tileSize).toEqual({ width: 40, height: 40 });
  });

  it("single px value applies to width (height follows aspect at render)", () => {
    const node = convert(makeFrame({
      styles: {
        display: 'block',
        backgroundImage: 'url(https://x.test/pattern.png)',
        backgroundSize: '24px',
        backgroundRepeat: 'repeat',
      },
    }));
    const fills = node.fills as Array<Record<string, unknown>>;
    const tile = fills.find(f => f.scaleMode === 'TILE');
    expect(tile).toBeDefined();
    expect(tile!.tileSize).toEqual({ width: 24 });
  });
});
