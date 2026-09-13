/**
 * `measuredLines` — the browser's per-visual-line text, carried to the
 * renderer as the ground truth for how many lines this node MUST occupy.
 *
 * The hard/soft break heuristic (see css-converter-hard-line-breaks) is
 * unchanged and stays correct: a width-exhausted wrap really is soft, and a
 * space join keeps the text re-flowable in Figma. But a soft join hands the
 * wrap decision to Figma, and Figma wraps with a SUBSTITUTED font. On
 * stripe.com's stats heading that turned 2 browser lines into 3 Figma lines,
 * grew the text box by 60px and pushed the stats row 54px into the chart
 * below it.
 *
 * `measuredLines` gives `enforceMeasuredLineCount` (rendering/textLineGuard)
 * the exact strings to re-bake as hard breaks when — and only when — Figma's
 * rendered line count actually diverges.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { W2WFrameNode } from "@w2w/shared";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 600, height: 100,
    quad: [0, 0, 600, 0, 600, 100, 0, 100],
    tag: 'h1',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function makeText(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 300, height: 40,
    quad: [0, 0, 300, 0, 300, 40, 0, 40],
    value,
    font: '600 32px Arial',
    ...overrides,
  };
}

function firstText(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'text') return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = firstText(c);
    if (hit) return hit;
  }
  return null;
}

function convertHost(host: Record<string, unknown>): Record<string, unknown> {
  const root = makeFrame({ tag: 'body', height: 400, styles: { display: 'block' }, children: [host] });
  const text = firstText(convertW2WToWireframe(root as unknown as W2WFrameNode));
  expect(text).not.toBeNull();
  return text!;
}

describe("measuredLines", () => {
  it("stripe.com heading: a soft wrap still records both measured lines", () => {
    const text = convertHost(makeFrame({
      tag: 'p',
      children: [
        makeText('A long paragraph line that fills the box', { y: 0, width: 560 }),
        makeText('extra words below', { y: 40, width: 200 }),
      ],
    }));

    // The soft join is unchanged — Figma may still re-wrap freely.
    expect(text.textContent).toBe('A long paragraph line that fills the box extra words below');
    expect(text.measuredLines).toEqual([
      'A long paragraph line that fills the box',
      'extra words below',
    ]);
  });

  it("records the lines around a HARD break too", () => {
    const text = convertHost(makeFrame({
      children: [
        makeText('Amazing Mac.', { y: 0, width: 300 }),
        makeText('Surprising price.', { y: 40, width: 380 }),
      ],
    }));

    expect(text.textContent).toBe('Amazing Mac.\nSurprising price.');
    expect(text.measuredLines).toEqual(['Amazing Mac.', 'Surprising price.']);
  });

  it("single-line text carries no measuredLines (nothing to enforce)", () => {
    const text = convertHost(makeFrame({
      children: [makeText('One line only', { y: 0, width: 300 })],
    }));

    expect(text.measuredLines).toBeUndefined();
  });

  it("same-row inline runs are ONE measured line, not two", () => {
    const text = convertHost(makeFrame({
      tag: 'p',
      children: [
        makeText('Get', { y: 0, x: 0, width: 60 }),
        makeText('Pro today', { y: 0, x: 65, width: 150, color: 'rgb(255, 0, 0)' }),
      ],
    }));

    expect(text.measuredLines).toBeUndefined();
  });

  it("applies the same baked text-transform as textContent", () => {
    const text = convertHost(makeFrame({
      tag: 'p',
      styles: { display: 'block', textTransform: 'capitalize' },
      children: [
        makeText('A long paragraph line that fills the box', { y: 0, width: 560 }),
        makeText('extra words below', { y: 40, width: 200 }),
      ],
    }));

    const lines = text.measuredLines as string[];
    expect(lines).toHaveLength(2);
    // Whatever transform textContent got, the lines must reproduce it exactly —
    // otherwise the guard's verify step can never match.
    expect(lines.join(' ')).toBe(text.textContent);
  });
});
