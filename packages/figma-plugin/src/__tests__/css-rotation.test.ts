/**
 * Static CSS transform rotation.
 *
 * Captured geometry comes from getBoundingClientRect — the axis-aligned
 * bounding box of the transformed element — so a rotated card used to render
 * as an oversized upright rectangle. The converter now extracts the rotation
 * angle from the computed transform matrix, and nodes.ts recovers the
 * unrotated dimensions + Figma placement from the AABB.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { computeRotatedPlacement } from "../rendering/nodes";

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

function convertWithTransform(transform: string): Record<string, unknown> | null {
  const el = makeFrame({
    styles: { display: 'block', transform },
    classList: ['rotated'],
  });
  const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
  return findByClass(root, 'rotated');
}

describe("rotation extraction from computed transform", () => {
  it("extracts 30° clockwise from matrix", () => {
    // rotate(30deg) → matrix(cos, sin, -sin, cos, 0, 0)
    const node = convertWithTransform('matrix(0.866025, 0.5, -0.5, 0.866025, 0, 0)');
    expect(node?.rotation as number).toBeCloseTo(30, 1);
  });

  it("extracts negative rotation", () => {
    const node = convertWithTransform('matrix(0.866025, -0.5, 0.5, 0.866025, 0, 0)');
    expect(node?.rotation as number).toBeCloseTo(-30, 1);
  });

  it("ignores identity / translate-only matrices", () => {
    expect(convertWithTransform('matrix(1, 0, 0, 1, 10, 20)')?.rotation).toBeUndefined();
    expect(convertWithTransform('none')?.rotation).toBeUndefined();
  });

  it("ignores tiny rotations (mid-transition noise)", () => {
    // ~0.1° — below threshold
    const node = convertWithTransform('matrix(0.9999985, 0.0017453, -0.0017453, 0.9999985, 0, 0)');
    expect(node?.rotation).toBeUndefined();
  });

  it("skips skewed matrices (no faithful Figma equivalent)", () => {
    // skewX(30deg) → matrix(1, 0, 0.577, 1, 0, 0)
    const node = convertWithTransform('matrix(1, 0, 0.57735, 1, 0, 0)');
    expect(node?.rotation).toBeUndefined();
  });
});

describe("computeRotatedPlacement", () => {
  it("recovers unrotated 100×50 box from its 30° AABB", () => {
    const W = 100 * Math.cos(Math.PI / 6) + 50 * Math.sin(Math.PI / 6); // ≈111.6
    const H = 100 * Math.sin(Math.PI / 6) + 50 * Math.cos(Math.PI / 6); // ≈93.3
    const p = computeRotatedPlacement(10, 20, W, H, 30);
    expect(p).not.toBeNull();
    expect(p!.width).toBeCloseTo(100, 1);
    expect(p!.height).toBeCloseTo(50, 1);
    expect(p!.figmaRotation).toBeCloseTo(-30, 5);
    // origin: min corner offset x = -h·sin = -25 → x = 10 + 25
    expect(p!.x).toBeCloseTo(35, 1);
    expect(p!.y).toBeCloseTo(20, 1);
  });

  it("returns null near the degenerate 45° case", () => {
    expect(computeRotatedPlacement(0, 0, 100, 100, 45)).toBeNull();
  });

  it("handles negative angles", () => {
    const W = 100 * Math.cos(Math.PI / 6) + 50 * Math.sin(Math.PI / 6);
    const H = 100 * Math.sin(Math.PI / 6) + 50 * Math.cos(Math.PI / 6);
    const p = computeRotatedPlacement(0, 0, W, H, -30);
    expect(p!.width).toBeCloseTo(100, 1);
    expect(p!.height).toBeCloseTo(50, 1);
    expect(p!.figmaRotation).toBeCloseTo(30, 5);
  });
});
