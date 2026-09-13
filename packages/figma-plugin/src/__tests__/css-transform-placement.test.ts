/**
 * Turning a decomposed CSS transform into a Figma placement.
 *
 * Figma's `relativeTransform` must have UNIT axes — it cannot carry scale
 * ("Not used for scaling, see width and height instead"). So the placement
 * splits the matrix in two: the scale is baked into the node's width/height,
 * and only the unit-axis rotation+shear goes into the matrix. Translation is
 * derived by anchoring the result to the captured AABB, which is also why
 * transform-origin never enters the math (see the css-converter header).
 */
import { describe, it, expect } from "vitest";
import {
  computeTransformPlacement,
  computeRotatedPlacement,
  applyCssTransform,
  cssBoundScales,
} from "../rendering/nodes";
import type { CssTransform, WireframeNode } from "../types";

/** Build a CssTransform from raw matrix components, as the converter would. */
function tx(a: number, b: number, c: number, d: number): CssTransform {
  const scaleX = Math.hypot(a, b);
  return {
    a, b, c, d,
    translateX: 0,
    translateY: 0,
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
    scaleX,
    skewX: (Math.atan2(a * c + b * d, scaleX * scaleX) * 180) / Math.PI,
    scaleY: (a * d - b * c) / scaleX,
  };
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const TAN8 = Math.tan((8 * Math.PI) / 180);

/** Figma reads rotation back as atan2(-m10, m00). */
function figmaRotationOf(t: number[][]): number {
  return (Math.atan2(-t[1][0], t[0][0]) * 180) / Math.PI;
}

describe("computeTransformPlacement — rotation", () => {
  it("reproduces the legacy rotation placement exactly", () => {
    // The 30° AABB of a 100x50 box.
    const W = 100 * COS30 + 50 * SIN30;
    const H = 100 * SIN30 + 50 * COS30;
    const p = computeTransformPlacement(10, 20, W, H, tx(COS30, SIN30, -SIN30, COS30));

    expect(p).not.toBeNull();
    // No scale in the matrix → node size is the recovered CSS box.
    expect(p!.width).toBeCloseTo(100, 3);
    expect(p!.height).toBeCloseTo(50, 3);
    expect(figmaRotationOf(p!.transform)).toBeCloseTo(-30, 3);
    // Same anchor the rotation-only path produced.
    expect(p!.transform[0][2]).toBeCloseTo(35, 3);
    expect(p!.transform[1][2]).toBeCloseTo(20, 3);

    const legacy = computeRotatedPlacement(10, 20, W, H, 30)!;
    expect(p!.width).toBeCloseTo(legacy.width, 3);
    expect(p!.height).toBeCloseTo(legacy.height, 3);
    expect(p!.transform[0][2]).toBeCloseTo(legacy.x, 3);
    expect(p!.transform[1][2]).toBeCloseTo(legacy.y, 3);
    expect(figmaRotationOf(p!.transform)).toBeCloseTo(legacy.figmaRotation, 3);
  });

  it("returns null near the degenerate 45° case", () => {
    const r = Math.SQRT1_2;
    expect(computeTransformPlacement(0, 0, 100, 100, tx(r, r, -r, r))).toBeNull();
  });
});

describe("computeTransformPlacement — scale is baked into the size", () => {
  it("keeps the rendered size and leaves the matrix at identity", () => {
    // scale(1.2) on a 100x50 box → AABB 120x60.
    const p = computeTransformPlacement(0, 0, 120, 60, tx(1.2, 0, 0, 1.2))!;
    expect(p).not.toBeNull();
    // The node must render at the SCALED size. Dividing here (h2d's
    // compensation) would be wrong: Figma's matrix carries no scale to
    // double-apply, so a divide would shrink the node to 0.83x.
    expect(p.width).toBeCloseTo(120, 3);
    expect(p.height).toBeCloseTo(60, 3);
    expect(p.transform[0][0]).toBeCloseTo(1, 6);
    expect(p.transform[1][1]).toBeCloseTo(1, 6);
    expect(p.transform[0][1]).toBeCloseTo(0, 6);
    expect(p.transform[1][0]).toBeCloseTo(0, 6);
    // Reported so callers can scale min/max constraints and text metrics.
    expect(p.scaleX).toBeCloseTo(1.2, 6);
    expect(p.scaleY).toBeCloseTo(1.2, 6);
  });

  it("handles a non-uniform scale", () => {
    // scale(2, 0.5) on 100x50 → AABB 200x25.
    const p = computeTransformPlacement(0, 0, 200, 25, tx(2, 0, 0, 0.5))!;
    expect(p.width).toBeCloseTo(200, 3);
    expect(p.height).toBeCloseTo(25, 3);
    expect(p.scaleX).toBeCloseTo(2, 6);
    expect(p.scaleY).toBeCloseTo(0.5, 6);
  });

  it("mirrors scaleX(-1) and re-anchors so the flip lands on the AABB", () => {
    const p = computeTransformPlacement(0, 0, 100, 50, tx(-1, 0, 0, 1))!;
    expect(p).not.toBeNull();
    expect(p.width).toBeCloseTo(100, 3);
    expect(p.height).toBeCloseTo(50, 3);
    expect(p.transform[0][0]).toBeCloseTo(-1, 6);
    expect(p.transform[1][1]).toBeCloseTo(1, 6);
    // Mirrored box extends to -width, so the origin shifts right by width.
    expect(p.transform[0][2]).toBeCloseTo(100, 3);
    expect(p.transform[1][2]).toBeCloseTo(0, 3);
  });

  it("returns null for a collapsed scale rather than emitting a singular matrix", () => {
    expect(computeTransformPlacement(0, 0, 100, 50, tx(0, 0, 0, 1))).toBeNull();
    expect(computeTransformPlacement(0, 0, 100, 50, tx(1, 0, 0, 0))).toBeNull();
    expect(computeTransformPlacement(0, 0, 100, 50, tx(1e-5, 0, 0, 1e-5))).toBeNull();
  });
});

describe("computeTransformPlacement — skew", () => {
  it("folds the sheared edge length into the height", () => {
    // skewX(8deg) on 100x50 → AABB width grows by h*tan8, height unchanged.
    const p = computeTransformPlacement(0, 0, 100 + 50 * TAN8, 50, tx(1, 0, TAN8, 1))!;
    expect(p).not.toBeNull();
    expect(p.width).toBeCloseTo(100, 3);
    // The y-edge is longer than 50 once sheared; that length lives in height,
    // because a unit-axis matrix cannot express it.
    expect(p.height).toBeCloseTo(50 * Math.hypot(TAN8, 1), 3);
    expect(p.transform[0][1]).toBeCloseTo(TAN8 / Math.hypot(TAN8, 1), 6);
  });
});

describe("computeTransformPlacement — Figma's unit-axis invariant", () => {
  const cases: Array<[string, CssTransform, number, number]> = [
    ["rotate30", tx(COS30, SIN30, -SIN30, COS30), 100 * COS30 + 50 * SIN30, 100 * SIN30 + 50 * COS30],
    ["scale1.2", tx(1.2, 0, 0, 1.2), 120, 60],
    ["scaleX(-1)", tx(-1, 0, 0, 1), 100, 50],
    ["skewX8", tx(1, 0, TAN8, 1), 100 + 50 * TAN8, 50],
    ["rotate+skew", tx(COS30, SIN30, COS30 * TAN8 - SIN30, SIN30 * TAN8 + COS30), 140, 120],
  ];

  it.each(cases)("%s produces unit-length axes", (_name, t, W, H) => {
    const p = computeTransformPlacement(0, 0, W, H, t);
    expect(p).not.toBeNull();
    const m = p!.transform;
    // sqrt(m00^2 + m10^2) == sqrt(m01^2 + m11^2) == 1
    expect(Math.hypot(m[0][0], m[1][0])).toBeCloseTo(1, 9);
    expect(Math.hypot(m[0][1], m[1][1])).toBeCloseTo(1, 9);
    expect(m.every((row) => row.every(Number.isFinite))).toBe(true);
  });
});

describe("cssBoundScales — CSS min/max are in untransformed px", () => {
  it("is a no-op without a transform", () => {
    expect(cssBoundScales(undefined)).toEqual({ sx: 1, sy: 1 });
  });

  it("reports the axis scales so min/max track the scaled node size", () => {
    // The node's size always comes from the scaled AABB, but cssMinWidth &co
    // are the untransformed CSS values — without this they disagree.
    const s = cssBoundScales(tx(1.2, 0, 0, 1.5));
    expect(s.sx).toBeCloseTo(1.2, 6);
    expect(s.sy).toBeCloseTo(1.5, 6);
  });

  it("reports positive scales for a mirrored matrix", () => {
    const s = cssBoundScales(tx(-1, 0, 0, 1));
    expect(s.sx).toBeCloseTo(1, 6);
    expect(s.sy).toBeCloseTo(1, 6);
  });

  it("falls back to 1 for a collapsed or non-finite scale", () => {
    expect(cssBoundScales(tx(0, 0, 0, 1)).sx).toBe(1);
    expect(cssBoundScales({ ...tx(1, 0, 0, 1), a: NaN, b: NaN }).sx).toBe(1);
  });
});

describe("applyCssTransform — never throws", () => {
  function stubNode(overrides: Record<string, unknown> = {}) {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      resize(w: number, h: number) {
        (this as unknown as { width: number; height: number }).width = w;
        (this as unknown as { width: number; height: number }).height = h;
      },
      relativeTransform: [[1, 0, 0], [0, 1, 0]],
      ...overrides,
    };
  }

  const child = (transform: CssTransform): WireframeNode =>
    ({ width: 120, height: 60, transform } as unknown as WireframeNode);

  it("applies size and matrix for a scaled node", () => {
    const node = stubNode();
    applyCssTransform(node as unknown as SceneNode, child(tx(1.2, 0, 0, 1.2)), 0, 0);
    expect(node.width).toBeCloseTo(120, 3);
    expect(node.height).toBeCloseTo(60, 3);
  });

  it("swallows a throwing resize instead of losing the subtree", () => {
    const node = stubNode({
      resize() {
        throw new Error("resize blew up");
      },
    });
    expect(() =>
      applyCssTransform(node as unknown as SceneNode, child(tx(1.2, 0, 0, 1.2)), 0, 0),
    ).not.toThrow();
  });

  it("swallows a throwing relativeTransform setter", () => {
    const node = stubNode();
    Object.defineProperty(node, "relativeTransform", {
      set() {
        throw new Error("read-only in this parent");
      },
      get() {
        return [[1, 0, 0], [0, 1, 0]];
      },
    });
    expect(() =>
      applyCssTransform(node as unknown as SceneNode, child(tx(COS30, SIN30, -SIN30, COS30)), 0, 0),
    ).not.toThrow();
  });

  it("no-ops when the node carries no transform", () => {
    const node = stubNode();
    applyCssTransform(node as unknown as SceneNode, { width: 100, height: 50 } as WireframeNode, 0, 0);
    expect(node.width).toBe(100);
    expect(node.height).toBe(50);
  });
});
