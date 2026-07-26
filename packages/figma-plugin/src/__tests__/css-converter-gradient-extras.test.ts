/**
 * Gradient parsing robustness: conic gradients, repeating-* variants and the
 * full CSS angle grammar (negative/decimal angles, turn/rad/grad units,
 * diagonal `to <corner>` keywords). Previously only `^\d+deg` and 4 cardinal
 * keywords parsed; everything else silently fell back to 180deg, and
 * conic/repeating gradients were dropped or mis-rendered.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

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

interface GradFill {
  type: string;
  angle?: number;
  stops?: Array<{ position: number }>;
}

function findGradientFill(node: unknown): GradFill | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as { fills?: GradFill[]; children?: unknown[] };
  const fill = obj.fills?.find(f => f.type.startsWith('GRADIENT_'));
  if (fill) return fill;
  for (const c of obj.children ?? []) {
    const hit = findGradientFill(c);
    if (hit) return hit;
  }
  return null;
}

function gradDiv(backgroundImage: string): Record<string, unknown> {
  return makeFrame({ styles: { display: 'block', backgroundImage } });
}

function convert(bg: string): GradFill | null {
  const root = convertW2WToWireframe(page([gradDiv(bg)]) as never, { layoutMode: "autoLayout" });
  return findGradientFill(root);
}

describe("conic gradients", () => {
  it("parses conic-gradient into GRADIENT_CONIC", () => {
    const fill = convert('conic-gradient(rgb(255, 0, 0), rgb(0, 0, 255))');
    expect(fill?.type).toBe('GRADIENT_CONIC');
    expect(fill?.stops?.length).toBe(2);
  });

  it("parses conic-gradient with from/at prefix", () => {
    const fill = convert('conic-gradient(from 90deg at 50% 50%, rgb(255, 0, 0), rgb(0, 255, 0), rgb(0, 0, 255))');
    expect(fill?.type).toBe('GRADIENT_CONIC');
    expect(fill?.stops?.length).toBe(3);
  });
});

describe("repeating gradients", () => {
  it("repeating-linear-gradient parses as linear (approximation) without crashing", () => {
    const fill = convert('repeating-linear-gradient(45deg, rgb(255, 0, 0) 0px, rgb(0, 0, 255) 20px)');
    expect(fill?.type).toBe('GRADIENT_LINEAR');
    // px positions must be normalized into [0, 1]
    for (const s of fill?.stops ?? []) {
      expect(s.position).toBeGreaterThanOrEqual(0);
      expect(s.position).toBeLessThanOrEqual(1);
    }
  });
});

describe("angle grammar", () => {
  it("negative angle normalizes to [0, 360)", () => {
    expect(convert('linear-gradient(-45deg, rgb(255, 0, 0), rgb(0, 0, 255))')?.angle).toBe(315);
  });

  it("decimal angle parses", () => {
    expect(convert('linear-gradient(22.5deg, rgb(255, 0, 0), rgb(0, 0, 255))')?.angle).toBeCloseTo(22.5);
  });

  it("turn unit converts to degrees", () => {
    expect(convert('linear-gradient(0.25turn, rgb(255, 0, 0), rgb(0, 0, 255))')?.angle).toBeCloseTo(90);
  });

  it("'to bottom right' resolves via element aspect ratio", () => {
    // 400x300 box: to top right = atan(400/300) ≈ 53.13°, bottom right = 180 − 53.13
    expect(convert('linear-gradient(to bottom right, rgb(255, 0, 0), rgb(0, 0, 255))')?.angle).toBeCloseTo(126.87, 1);
  });

  it("'to top left' resolves via element aspect ratio", () => {
    expect(convert('linear-gradient(to top left, rgb(255, 0, 0), rgb(0, 0, 255))')?.angle).toBeCloseTo(306.87, 1);
  });

  it("cardinal keywords still work", () => {
    expect(convert('linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))')?.angle).toBe(90);
    expect(convert('linear-gradient(to top, rgb(255, 0, 0), rgb(0, 0, 255))')?.angle).toBe(0);
  });
});
