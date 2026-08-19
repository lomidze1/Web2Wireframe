/**
 * Hard line breaks (2026-08-08 audit #1 — the largest text-fidelity gap).
 *
 * The extractor emits one TEXT node per visual line with exact rects, but
 * the converter joined every line with a space, so `<br>`-authored breaks
 * and `pre` line structure evaporated: Figma re-wrapped purely by width and
 * broke hero headings in the wrong place whenever font metrics differed.
 *
 * Heuristic: a boundary between visual rows is a HARD break when the upper
 * row ends leaving enough room for the next row's first word — the browser
 * had space to continue but didn't, so the author forced the break. Rows
 * that run out of width are soft wraps and keep the space join (Figma may
 * legitimately re-wrap those). `white-space: pre*` makes every break hard.
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

describe("hard line breaks from line geometry", () => {
  it("<br>-style break (upper line ends with room to spare) → \\n", () => {
    // 600px-wide h1; line 1 ends at x=300, leaving 300px — plenty for
    // "Surprising" (~245px at line 2's average char width). Author's break.
    const text = convertHost(makeFrame({
      children: [
        makeText('Amazing Mac.', { y: 0, width: 300 }),
        makeText('Surprising price.', { y: 40, width: 380 }),
      ],
    }));
    expect(text.textContent).toBe('Amazing Mac.\nSurprising price.');
  });

  it("soft wrap (upper line runs out of width) keeps the space join", () => {
    // Line 1 fills 560 of 600px; "extra" (~5 chars) doesn't fit in the
    // remaining 40px → the browser wrapped by width, not by author intent.
    const text = convertHost(makeFrame({
      tag: 'p',
      children: [
        makeText('A long paragraph line that fills the box', { y: 0, width: 560 }),
        makeText('extra words below', { y: 40, width: 200 }),
      ],
    }));
    expect(text.textContent).toBe('A long paragraph line that fills the box extra words below');
  });

  it("white-space: pre makes every break hard regardless of geometry", () => {
    const text = convertHost(makeFrame({
      tag: 'pre',
      styles: { display: 'block', whiteSpace: 'pre' },
      children: [
        makeText('const x = 1;', { y: 0, width: 580 }),
        makeText('const y = 2;', { y: 40, width: 580 }),
      ],
    }));
    expect(text.textContent).toBe('const x = 1;\nconst y = 2;');
  });

  it("same-row inline runs stay space-joined (no phantom breaks)", () => {
    // Two runs on ONE visual row (same y) — an inline <strong> split, not
    // a line boundary.
    const text = convertHost(makeFrame({
      tag: 'p',
      children: [
        makeText('Get', { y: 0, x: 0, width: 60 }),
        makeText('Pro today', { y: 0, x: 65, width: 150, color: 'rgb(255, 0, 0)' }),
      ],
    }));
    expect(text.textContent).toBe('Get Pro today');
    expect(String(text.textContent)).not.toContain('\n');
  });

  it("styledSegments carry the break so the composed characters match", () => {
    const text = convertHost(makeFrame({
      children: [
        makeText('Amazing Mac.', { y: 0, width: 300, color: 'rgb(0, 0, 0)' }),
        makeText('Surprising price.', { y: 40, width: 380, color: 'rgb(120, 120, 120)' }),
      ],
    }));
    const segs = text.styledSegments as Array<{ text: string }>;
    expect(segs).toBeDefined();
    expect(segs[0].text.endsWith('\n')).toBe(true);
    expect(segs[1].text).toBe('Surprising price.');
  });
});
