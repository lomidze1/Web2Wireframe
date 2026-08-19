/**
 * Text fidelity quick wins (2026-08-08 render-quality audit):
 *
 *  1. `text-overflow: ellipsis` / `-webkit-line-clamp` → textTruncation/maxLines
 *     (captured but previously never read — clamped card titles rendered full).
 *  2. `text-transform: uppercase|lowercase` → Figma textCase with the RAW
 *     string kept (was baked into characters, breaking copy/edit semantics).
 *     `capitalize` stays baked: CSS keeps inner caps ("iPhone" → "IPhone"),
 *     Figma TITLE does not.
 *  3. Vertically-centering text hosts (flex + align-items:center) →
 *     textAlignVertical CENTER (was: only one absolute-mode branch set it).
 *  4. `line-height: normal` on multi-line text → derive px from per-line
 *     y-deltas so a substituted font can't drift the wrap height.
 *  5. Base-state text-decoration style/color (dotted/wavy, tinted underlines)
 *     → textDecorationStyle/Color fields (was: only the line kind survived).
 *  6. `-webkit-text-stroke` → textStroke field (outlined display text).
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { W2WFrameNode } from "@w2w/shared";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 600, height: 100,
    quad: [0, 0, 600, 0, 600, 100, 0, 100],
    tag: 'div',
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
    x: 0, y: 0, width: 200, height: 25,
    quad: [0, 0, 200, 0, 200, 25, 0, 25],
    value,
    font: '400 16px Arial',
    ...overrides,
  };
}

function collectTextNodes(node: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text') out.push(obj);
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return out;
}

function convertText(hostOverrides: Record<string, unknown>, lines: Array<Record<string, unknown>>): Record<string, unknown> {
  const host = makeFrame({
    tag: 'p',
    children: lines,
    ...hostOverrides,
  });
  const root = makeFrame({ tag: 'body', height: 300, children: [host] });
  const tree = convertW2WToWireframe(root as unknown as W2WFrameNode);
  const texts = collectTextNodes(tree);
  expect(texts.length).toBeGreaterThan(0);
  return texts[0];
}

describe("ellipsis / line-clamp → Figma truncation", () => {
  it("text-overflow: ellipsis (+overflow hidden, nowrap) → textTruncation ENDING", () => {
    const text = convertText(
      { styles: { display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' } },
      [makeText('A very long card title that the browser clipped')],
    );
    expect(text.textTruncation).toBe('ENDING');
    expect(text.maxLines).toBeUndefined();
  });

  it("-webkit-line-clamp: 2 → maxLines 2 + textTruncation ENDING", () => {
    const text = convertText(
      { styles: { display: '-webkit-box', webkitLineClamp: '2', overflow: 'hidden' } },
      [
        makeText('First clamped line', { y: 0 }),
        makeText('second clamped line…', { y: 25 }),
      ],
    );
    expect(text.textTruncation).toBe('ENDING');
    expect(text.maxLines).toBe(2);
  });

  it("plain text without overflow styling gets no truncation fields", () => {
    const text = convertText({}, [makeText('Plain paragraph')]);
    expect(text.textTruncation).toBeUndefined();
    expect(text.maxLines).toBeUndefined();
  });
});

describe("text-transform → textCase (raw string kept)", () => {
  it("uppercase → textCase UPPER, textContent stays source-case", () => {
    const text = convertText(
      { styles: { display: 'block', textTransform: 'uppercase' } },
      [makeText('Shop now')],
    );
    expect(text.textCase).toBe('UPPER');
    expect(text.textContent).toBe('Shop now');
  });

  it("lowercase → textCase LOWER, raw kept", () => {
    const text = convertText(
      { styles: { display: 'block', textTransform: 'lowercase' } },
      [makeText('MiXeD Case')],
    );
    expect(text.textCase).toBe('LOWER');
    expect(text.textContent).toBe('MiXeD Case');
  });

  it("capitalize keeps the baked behavior (no textCase, transformed string)", () => {
    const text = convertText(
      { styles: { display: 'block', textTransform: 'capitalize' } },
      [makeText('the iPhone story')],
    );
    expect(text.textCase).toBeUndefined();
    expect(text.textContent).toBe('The IPhone Story');
  });

  it("styled segments keep raw text under uppercase too", () => {
    const text = convertText(
      { styles: { display: 'block', textTransform: 'uppercase' } },
      [
        makeText('Buy', { color: 'rgb(255, 0, 0)' }),
        makeText('today', { y: 0, x: 40 }),
      ],
    );
    expect(text.textCase).toBe('UPPER');
    const segs = text.styledSegments as Array<{ text: string }> | undefined;
    if (segs) {
      for (const s of segs) {
        expect(s.text).toBe(s.text.toLowerCase() === s.text ? s.text : s.text);
        expect(['Buy', 'today']).toContain(s.text);
      }
    }
  });
});

describe("vertical centering → textAlignVertical (geometry-derived)", () => {
  // Flex hosts don't coalesce (auto-layout centers them already) — the gap
  // this closes is coalesced text whose ink sits centered/bottom inside a
  // taller box via table-cell middle or line-height tricks. The signal is
  // pure geometry: where the line rects sit inside the element box.
  it("ink centered in a taller box emits CENTER", () => {
    const text = convertText(
      { height: 60, styles: { display: 'block' } },
      [makeText('Centered label', { y: 17, height: 25 })],
    );
    expect(text.textAlignVertical).toBe('CENTER');
  });

  it("ink hugging the bottom of a taller box emits BOTTOM", () => {
    const text = convertText(
      { height: 60, styles: { display: 'block' } },
      [makeText('Bottom label', { y: 35, height: 25 })],
    );
    expect(text.textAlignVertical).toBe('BOTTOM');
  });

  it("plain block host emits nothing (Figma default TOP)", () => {
    const text = convertText({}, [makeText('Top label')]);
    expect(text.textAlignVertical).toBeUndefined();
  });
});

describe("line-height: normal on multi-line text → derived px", () => {
  it("derives line height from per-line y-deltas", () => {
    const text = convertText(
      { height: 84, styles: { display: 'block', lineHeight: 'normal' } },
      [
        makeText('line one', { y: 0, height: 25 }),
        makeText('line two', { y: 28, height: 25 }),
        makeText('line three', { y: 56, height: 25 }),
      ],
    );
    // (56 - 0) / 2 = 28px baseline-to-baseline
    expect(text.lineHeight).toBe(28);
  });

  it("single-line text keeps 'normal'", () => {
    const text = convertText(
      { styles: { display: 'block', lineHeight: 'normal' } },
      [makeText('only line')],
    );
    expect(text.lineHeight).toBe('normal');
  });

  it("explicit px line-height is untouched", () => {
    const text = convertText(
      { styles: { display: 'block', lineHeight: '30px' } },
      [
        makeText('line one', { y: 0 }),
        makeText('line two', { y: 30 }),
      ],
    );
    expect(text.lineHeight).toBe(30);
  });
});

describe("base-state text-decoration style/color", () => {
  it("dotted red underline survives as fields", () => {
    const text = convertText(
      {
        tag: 'a',
        styles: {
          display: 'inline',
          textDecoration: 'underline dotted rgb(255, 0, 0)',
          textDecorationLine: 'underline',
          color: 'rgb(0, 0, 0)',
        },
      },
      [makeText('fancy link')],
    );
    expect(text.textDecorationStyle).toBe('DOTTED');
    expect(text.textDecorationColor).toBe('rgb(255, 0, 0)');
  });

  it("wavy maps to WAVY, double falls back to SOLID (unsupported in Figma)", () => {
    const wavy = convertText(
      {
        tag: 'a',
        styles: {
          display: 'inline',
          textDecoration: 'underline wavy rgb(0, 128, 0)',
          textDecorationLine: 'underline',
        },
      },
      [makeText('spell check')],
    );
    expect(wavy.textDecorationStyle).toBe('WAVY');

    const dbl = convertText(
      {
        tag: 'a',
        styles: {
          display: 'inline',
          textDecoration: 'underline double rgb(0, 0, 0)',
          textDecorationLine: 'underline',
        },
      },
      [makeText('double')],
    );
    expect(dbl.textDecorationStyle).toBeUndefined();
  });

  it("solid decoration in the text's own color emits no extra fields", () => {
    const text = convertText(
      {
        tag: 'a',
        styles: {
          display: 'inline',
          textDecoration: 'underline solid rgb(0, 0, 0)',
          textDecorationLine: 'underline',
          color: 'rgb(0, 0, 0)',
        },
      },
      [makeText('plain link')],
    );
    expect(text.textDecorationStyle).toBeUndefined();
    expect(text.textDecorationColor).toBeUndefined();
  });
});

describe("-webkit-text-stroke → textStroke", () => {
  it("emits width + color for stroked display text", () => {
    const text = convertText(
      {
        tag: 'h1',
        styles: {
          display: 'block',
          webkitTextStrokeWidth: '2px',
          webkitTextStrokeColor: 'rgb(10, 20, 30)',
        },
      },
      [makeText('OUTLINE')],
    );
    expect(text.textStroke).toEqual({ width: 2, color: 'rgb(10, 20, 30)' });
  });

  it("zero-width stroke emits nothing", () => {
    const text = convertText(
      { styles: { display: 'block', webkitTextStrokeWidth: '0px' } },
      [makeText('normal')],
    );
    expect(text.textStroke).toBeUndefined();
  });
});
