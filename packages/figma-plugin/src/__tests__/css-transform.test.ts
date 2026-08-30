/**
 * Full 2D affine CSS transform decomposition.
 *
 * The converter used to extract only a rotation angle, rejecting skew and
 * ignoring scale magnitude entirely, so `scale(1.2)`, `skewX(8deg)`,
 * `scaleX(-1)` and every `matrix3d` rendered axis-aligned and at the wrong
 * size. It now decomposes the whole 2D matrix; nodes.ts turns that into a
 * Figma `relativeTransform` plus a compensated node size.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { CssTransform } from "../types";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 400, height: 300,
    quad: [0, 0, 400, 0, 400, 300, 0, 300],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: 'body', width: 1440, height: 800, styles: { height: '100%' }, children });
  return makeFrame({
    tag: 'html', width: 1440, height: 800,
    styles: { height: '100%' },
    children: [body],
    isScrollingElt: true,
  });
}

function findByClass(node: unknown, cls: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.className === 'string' && obj.className.split(' ').includes(cls)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

/** Decomposed transform of an element carrying `transform: <value>`. */
function transformOf(transform: string): CssTransform | undefined {
  const el = makeFrame({
    styles: { display: 'block', transform },
    classList: ['tx'],
  });
  const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
  return findByClass(root, 'tx')?.transform as CssTransform | undefined;
}

const COS30 = Math.cos(Math.PI / 6); // 0.8660254
const SIN30 = 0.5;

describe("parseCssTransform — rotation (existing behaviour preserved)", () => {
  it("extracts 30° clockwise from matrix", () => {
    const t = transformOf(`matrix(${COS30}, ${SIN30}, ${-SIN30}, ${COS30}, 0, 0)`);
    expect(t?.rotation).toBeCloseTo(30, 1);
    expect(t?.scaleX).toBeCloseTo(1, 4);
    expect(t?.scaleY).toBeCloseTo(1, 4);
    expect(t?.skewX).toBeCloseTo(0, 4);
  });

  it("extracts negative rotation", () => {
    const t = transformOf(`matrix(${COS30}, ${-SIN30}, ${SIN30}, ${COS30}, 0, 0)`);
    expect(t?.rotation).toBeCloseTo(-30, 1);
  });

  it("ignores identity, translate-only and none", () => {
    // Translation is absorbed by the captured AABB, so it is not a transform
    // worth applying.
    expect(transformOf('matrix(1, 0, 0, 1, 10, 20)')).toBeUndefined();
    expect(transformOf('matrix(1, 0, 0, 1, 0, 0)')).toBeUndefined();
    expect(transformOf('none')).toBeUndefined();
    expect(transformOf('')).toBeUndefined();
  });

  it("ignores tiny rotations (mid-transition noise)", () => {
    expect(transformOf('matrix(0.9999985, 0.0017453, -0.0017453, 0.9999985, 0, 0)')).toBeUndefined();
  });
});

describe("parseCssTransform — scale", () => {
  it("recovers a uniform scale that used to be ignored entirely", () => {
    const t = transformOf('matrix(1.2, 0, 0, 1.2, 0, 0)');
    expect(t).toBeDefined();
    expect(t!.scaleX).toBeCloseTo(1.2, 4);
    expect(t!.scaleY).toBeCloseTo(1.2, 4);
    expect(t!.rotation).toBeCloseTo(0, 4);
    expect(t!.skewX).toBeCloseTo(0, 4);
  });

  it("recovers a non-uniform scale", () => {
    const t = transformOf('matrix(2, 0, 0, 0.5, 0, 0)');
    expect(t!.scaleX).toBeCloseTo(2, 4);
    expect(t!.scaleY).toBeCloseTo(0.5, 4);
  });

  it("represents scaleX(-1) as a negative determinant, not a 180° rotation", () => {
    const t = transformOf('matrix(-1, 0, 0, 1, 0, 0)');
    expect(t).toBeDefined();
    // hypot(-1, 0) is +1, so the mirror lands in scaleY's signed term.
    expect(t!.scaleX).toBeCloseTo(1, 4);
    expect(t!.scaleY).toBeCloseTo(-1, 4);
    expect(t!.a * t!.d - t!.b * t!.c).toBeLessThan(0);
  });

  it("keeps a scale even when the rotation is below the noise threshold", () => {
    // Near-identity early-out must test scale too, not just the angle.
    const t = transformOf('matrix(1.5, 0, 0, 1.5, 0, 0)');
    expect(t).toBeDefined();
    expect(t!.scaleX).toBeCloseTo(1.5, 4);
  });
});

describe("parseCssTransform — skew (previously rejected outright)", () => {
  it("decomposes skewX instead of returning undefined", () => {
    // skewX(30deg) → matrix(1, 0, tan30, 1, 0, 0)
    const t = transformOf('matrix(1, 0, 0.57735, 1, 0, 0)');
    expect(t).toBeDefined();
    expect(t!.skewX).toBeCloseTo(30, 1);
    expect(t!.rotation).toBeCloseTo(0, 4);
    expect(t!.scaleX).toBeCloseTo(1, 4);
    expect(t!.scaleY).toBeCloseTo(1, 4);
  });

  it("decomposes rotation combined with skew", () => {
    // rotate(30deg) skewX(8deg): R * [[1, tan8],[0,1]]
    const k = Math.tan((8 * Math.PI) / 180);
    const a = COS30, b = SIN30;
    const c = COS30 * k - SIN30, d = SIN30 * k + COS30;
    const t = transformOf(`matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`);
    expect(t!.rotation).toBeCloseTo(30, 1);
    expect(t!.skewX).toBeCloseTo(8, 1);
    expect(t!.scaleX).toBeCloseTo(1, 3);
    expect(t!.scaleY).toBeCloseTo(1, 3);
  });
});

describe("parseCssTransform — matrix3d", () => {
  it("takes the 2D submatrix of a Z-rotation matrix3d (used to bail)", () => {
    const t = transformOf(
      `matrix3d(${COS30}, ${SIN30}, 0, 0, ${-SIN30}, ${COS30}, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)`,
    );
    expect(t).toBeDefined();
    expect(t!.rotation).toBeCloseTo(30, 1);
    expect(t!.droppedZ).toBeUndefined();
  });

  it("reads translation from elements 13 and 14", () => {
    const t = transformOf(
      'matrix3d(1.5, 0, 0, 0, 0, 1.5, 0, 0, 0, 0, 1, 0, 40, 60, 0, 1)',
    );
    expect(t!.translateX).toBeCloseTo(40, 4);
    expect(t!.translateY).toBeCloseTo(60, 4);
    expect(t!.scaleX).toBeCloseTo(1.5, 4);
  });

  it("flags a dropped perspective component rather than mangling it silently", () => {
    // perspective(500px) rotateY(45deg) — 2D part is a 0.7071 x-squash.
    const t = transformOf(
      'matrix3d(0.7071, 0, -0.7071, -0.0014142, 0, 1, 0, 0, 0.7071, 0, 0.7071, -0.0014142, 0, 0, 0, 1)',
    );
    expect(t).toBeDefined();
    expect(t!.droppedZ).toBe(true);
    expect(t!.scaleX).toBeCloseTo(0.7071, 3);
  });

  it("returns undefined for a malformed matrix3d", () => {
    expect(transformOf('matrix3d(1, 0, 0)')).toBeUndefined();
    expect(transformOf('matrix(nope, 0, 0, 1, 0, 0)')).toBeUndefined();
  });
});
