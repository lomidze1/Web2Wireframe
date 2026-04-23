/**
 * Tests for adjacent per-line TEXT node merging in css-converter.ts.
 *
 * When a content script splits a paragraph into per-visual-line TEXT nodes
 * (e.g., 8 lines of a footnote), and the parent has mixed children (marker +
 * TEXT), the `else if (hasTextChildren)` path fires. These tests verify that
 * consecutive TEXT entries with matching font/x/height are merged into a
 * single text WireframeNode — matching h2d's rendering behavior.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
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
    x: 247, y: 0, width: 900, height: 14.5,
    quad: [247, 0, 1147, 0, 1147, 14.5, 247, 14.5],
    value,
    font: '400 12px SFProText',
    ...overrides,
  };
}

/** Flatten all text WireframeNodes in tree */
function collectTextNodes(
  node: unknown,
): Array<{ textContent: string; browserLineCount?: number; renderedTextWidths?: number[] }> {
  const out: Array<{ textContent: string; browserLineCount?: number; renderedTextWidths?: number[] }> = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.textContent === 'string') {
      out.push({
        textContent: obj.textContent,
        browserLineCount: obj.browserLineCount as number | undefined,
        renderedTextWidths: obj.renderedTextWidths as number[] | undefined,
      });
    }
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return out;
}

/** Find first WireframeNode matching a predicate (BFS). */
function findNode(node: unknown, predicate: (n: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== 'object') continue;
    const obj = cur as Record<string, unknown>;
    if (predicate(obj)) return obj;
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) stack.push(...children);
  }
  return null;
}

/** Count direct children of the first li WireframeNode found */
function findLiChildCount(node: unknown): number {
  const visit = (n: unknown): number | null => {
    if (!n || typeof n !== 'object') return null;
    const obj = n as WireframeNode;
    if (obj.tag === 'li' && Array.isArray(obj.children)) {
      return obj.children.length;
    }
    if (Array.isArray(obj.children)) {
      for (const c of obj.children) {
        const r = visit(c);
        if (r !== null) return r;
      }
    }
    return null;
  };
  return visit(node) ?? -1;
}

// ---------------------------------------------------------------------------
// Test: Apple.com footnote scenario
// ---------------------------------------------------------------------------

describe("css-converter: adjacent per-line TEXT merging", () => {

  it("merges 8 per-line TEXT nodes into 1 text node (li with marker)", () => {
    const lineHeight = 16;
    const lines = [
      "Trade-in values will vary based on the condition, year, and configuration of your eligible trade-in device. Not all devices are eligible for credit. You must be at least the age",
      "of majority to be eligible to trade in for credit or for an Apple Gift Card.",
      "Apple Gift Card. Actual value awarded is based on receipt of a qualifying device.",
      "on full value of a new device purchase.",
      "in all stores and may vary between in-store and online trade-in.",
      "cancel, or limit quantity of any trade-in transaction for any reason.",
      "More details are available from Apple's trade-in partner.",
      "Restrictions and limitations may apply.",
    ];

    const marker = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 233, y: 4932, width: 10, height: 16,
      quad: [233, 4932, 243, 4932, 243, 4948, 233, 4948],
      styles: { display: 'inline', position: 'static' },
      children: [makeText('2.', { x: 233, y: 4932, width: 10, height: 16, font: '400 12px SFProText' })],
    });

    const textChildren = lines.map((text, i) => makeText(text, {
      x: 247,
      y: 4932 + i * lineHeight,
      width: 939,
      height: 14.5,
    }));

    const li = makeFrame({
      tag: 'li',
      x: 233, y: 4932, width: 946, height: 121,
      quad: [233, 4932, 1179, 4932, 1179, 5053, 233, 5053],
      styles: { display: 'list-item', fontSize: '12px' },
      children: [marker, ...textChildren],
    });

    const ol = makeFrame({
      tag: 'ol',
      x: 233, y: 4932, width: 946, height: 500,
      quad: [233, 4932, 1179, 4932, 1179, 5432, 233, 5432],
      styles: { display: 'block', fontSize: '12px' },
      children: [li],
    });

    const result = convertW2WToWireframe(ol as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);

    // Marker text should be present
    expect(textNodes.some(t => t.textContent.includes('2.'))).toBe(true);

    // All 8 lines should be merged into ONE text node
    const mergedNode = textNodes.find(t => t.textContent.includes('Trade-in values'));
    expect(mergedNode).toBeDefined();
    expect(mergedNode!.textContent).toContain('Restrictions and limitations may apply.');

    // browserLineCount should reflect original line count
    expect(mergedNode!.browserLineCount).toBe(8);

    // li should have exactly 2 children: marker + merged text
    expect(findLiChildCount(result)).toBe(2);
  });

  it("single-line text with marker: no merge needed (already 1 node)", () => {
    const marker = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 0, y: 0, width: 8, height: 14,
      quad: [0, 0, 8, 0, 8, 14, 0, 14],
      styles: { display: 'inline', position: 'static' },
      children: [makeText('•', { x: 0, y: 0, width: 8, height: 14 })],
    });

    const text = makeText('Item one', { x: 12, y: 0, width: 60, height: 14 });

    const li = makeFrame({
      tag: 'li',
      x: 0, y: 0, width: 100, height: 14,
      quad: [0, 0, 100, 0, 100, 14, 0, 14],
      styles: { display: 'list-item', fontSize: '12px' },
      children: [marker, text],
    });

    const ul = makeFrame({
      tag: 'ul',
      styles: { display: 'block' },
      children: [li],
    });

    const result = convertW2WToWireframe(ul as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);

    expect(textNodes.some(t => t.textContent.includes('•'))).toBe(true);
    expect(textNodes.some(t => t.textContent === 'Item one')).toBe(true);
  });

  it("does not merge across non-text children (div with text + link + text)", () => {
    const text1 = makeText('Hello ', { x: 0, y: 0, width: 30, height: 14 });
    const link = makeFrame({
      tag: 'a',
      x: 30, y: 0, width: 40, height: 14,
      quad: [30, 0, 70, 0, 70, 14, 30, 14],
      styles: { display: 'inline', color: 'rgb(0,102,204)' },
      children: [makeText('link', { x: 30, y: 0, width: 40, height: 14 })],
    });
    const text2 = makeText(' world', { x: 70, y: 0, width: 35, height: 14 });

    const div = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 200, height: 14,
      quad: [0, 0, 200, 0, 200, 14, 0, 14],
      styles: { display: 'block', fontSize: '14px' },
      children: [text1, link, text2],
    });

    const result = convertW2WToWireframe(div as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);

    // text1 and text2 should NOT be merged (link breaks them)
    const helloNode = textNodes.find(t => t.textContent.includes('Hello'));
    const worldNode = textNodes.find(t => t.textContent.includes('world'));
    expect(helloNode).toBeDefined();
    expect(worldNode).toBeDefined();
    // They should be separate nodes
    expect(helloNode!.textContent).not.toContain('world');
  });

  it("does not merge TEXT nodes with different fonts", () => {
    const text1 = makeText('Normal text', {
      x: 247, y: 0, width: 200, height: 14.5,
      font: '400 12px SFProText',
    });
    const text2 = makeText('Bold text', {
      x: 247, y: 16, width: 200, height: 14.5,
      font: '700 12px SFProText-Bold',
    });

    const marker = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 233, y: 0, width: 10, height: 16,
      quad: [233, 0, 243, 0, 243, 16, 233, 16],
      styles: { display: 'inline', position: 'static' },
      children: [makeText('1.', { x: 233, y: 0, width: 10, height: 16 })],
    });

    const li = makeFrame({
      tag: 'li',
      x: 233, y: 0, width: 946, height: 30,
      quad: [233, 0, 1179, 0, 1179, 30, 233, 30],
      styles: { display: 'list-item', fontSize: '12px' },
      children: [marker, text1, text2],
    });

    const ol = makeFrame({
      tag: 'ol',
      styles: { display: 'block' },
      children: [li],
    });

    const result = convertW2WToWireframe(ol as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);

    const normalNode = textNodes.find(t => t.textContent.includes('Normal text'));
    const boldNode = textNodes.find(t => t.textContent.includes('Bold text'));
    expect(normalNode).toBeDefined();
    expect(boldNode).toBeDefined();
    expect(normalNode!.textContent).not.toContain('Bold text');
  });

  it("does not merge TEXT nodes with large vertical gap", () => {
    const text1 = makeText('Paragraph one', {
      x: 247, y: 0, width: 200, height: 14.5,
    });
    const text2 = makeText('Paragraph two', {
      x: 247, y: 100, width: 200, height: 14.5, // 100px gap — separate paragraph
    });

    const marker = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 233, y: 0, width: 10, height: 16,
      quad: [233, 0, 243, 0, 243, 16, 233, 16],
      styles: { display: 'inline', position: 'static' },
      children: [makeText('1.', { x: 233, y: 0, width: 10, height: 16 })],
    });

    const li = makeFrame({
      tag: 'li',
      x: 233, y: 0, width: 946, height: 115,
      quad: [233, 0, 1179, 0, 1179, 115, 233, 115],
      styles: { display: 'list-item', fontSize: '12px' },
      children: [marker, text1, text2],
    });

    const ol = makeFrame({
      tag: 'ol',
      styles: { display: 'block' },
      children: [li],
    });

    const result = convertW2WToWireframe(ol as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);

    const p1 = textNodes.find(t => t.textContent.includes('Paragraph one'));
    const p2 = textNodes.find(t => t.textContent.includes('Paragraph two'));
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1!.textContent).not.toContain('Paragraph two');
  });
});

// ---------------------------------------------------------------------------
// Per-line widths preservation for FILLR multi-line rendering
// ---------------------------------------------------------------------------

describe("css-converter: renderedTextWidths preservation", () => {
  it("mixed-children merge: preserves per-line widths [535, 550, 240] in reading order", () => {
    // 3-line paragraph nested inside a <li> with a marker — forces the
    // mixed-children merge path (mergeAdjacentTextEntries).
    const lineHeight = 24;
    const widths = [535, 550, 240];

    const textChildren = widths.map((w, i) => makeText(`line ${i + 1}`, {
      x: 247,
      y: i * lineHeight,
      width: w,
      height: 20,
    }));

    const marker = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-marker'],
      x: 233, y: 0, width: 10, height: 16,
      quad: [233, 0, 243, 0, 243, 16, 233, 16],
      styles: { display: 'inline', position: 'static' },
      children: [makeText('1.', { x: 233, y: 0, width: 10, height: 16 })],
    });

    const li = makeFrame({
      tag: 'li',
      x: 233, y: 0, width: 946, height: 3 * lineHeight,
      quad: [233, 0, 1179, 0, 1179, 72, 233, 72],
      styles: { display: 'list-item', fontSize: '12px' },
      children: [marker, ...textChildren],
    });

    const ol = makeFrame({
      tag: 'ol',
      styles: { display: 'block' },
      children: [li],
    });

    const result = convertW2WToWireframe(ol as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);

    const merged = textNodes.find(t => t.browserLineCount === 3);
    expect(merged).toBeDefined();
    expect(merged!.renderedTextWidths).toEqual([535, 550, 240]);
  });

  it("FRAME-is-text path: <p> with 3 text children surfaces renderedTextWidths", () => {
    // Pure-text <p> — no frame children — hits TEXT_COALESCE_TAGS branch
    // where renderedTextWidths is emitted directly from textChildValues.
    const lineHeight = 22;
    const widths = [600, 580, 180];

    const textChildren = widths.map((w, i) => makeText(`lorem ${i}`, {
      x: 0,
      y: i * lineHeight,
      width: w,
      height: 20,
    }));

    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 620, height: 3 * lineHeight,
      quad: [0, 0, 620, 0, 620, 66, 0, 66],
      styles: { display: 'block', fontSize: '16px' },
      children: textChildren,
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    const pNode = findNode(result, (n) => n.tag === 'p' && n.type === 'text');

    expect(pNode).toBeDefined();
    expect(pNode!.browserLineCount).toBe(3);
    expect(pNode!.renderedTextWidths).toEqual([600, 580, 180]);
    // Max is still surfaced on the legacy single-width field
    expect(pNode!.renderedTextWidth).toBe(600);
  });

  it("single-line text: renderedTextWidths is undefined (only max is surfaced)", () => {
    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 400, height: 20,
      quad: [0, 0, 400, 0, 400, 20, 0, 20],
      styles: { display: 'block', fontSize: '16px' },
      children: [makeText('single line', { x: 0, y: 0, width: 120, height: 20 })],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    const pNode = findNode(result, (n) => n.tag === 'p' && n.type === 'text');

    expect(pNode).toBeDefined();
    expect(pNode!.renderedTextWidths).toBeUndefined();
    expect(pNode!.renderedTextWidth).toBe(120);
  });

  it("same-Y inline parts: renderedTextWidths is undefined (1 visual line)", () => {
    // <p>Hello <strong>world</strong>! More text.</p> — 3 text parts at same Y.
    // Must NOT trigger FILLR multi-line rendering since it's 1 visual line.
    // (collectTextFromFrame inlines <strong>'s text into the parent's textChildValues
    //  — simulated directly here with 3 same-Y W2WTextNode children.)
    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 400, height: 20,
      quad: [0, 0, 400, 0, 400, 20, 0, 20],
      styles: { display: 'block', fontSize: '16px' },
      children: [
        makeText('Hello ', { x: 0, y: 0, width: 40, height: 18 }),
        makeText('world', { x: 40, y: 0, width: 40, height: 18 }),
        makeText('! More text.', { x: 80, y: 0, width: 80, height: 18 }),
      ],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    const pNode = findNode(result, (n) => n.tag === 'p' && n.type === 'text');

    expect(pNode).toBeDefined();
    // 3 inline parts but 1 visual line — renderedTextWidths MUST be undefined
    // so FILLR renders a single squiggly, not three stacked ones.
    expect(pNode!.renderedTextWidths).toBeUndefined();
  });

  it("multi-line text: renderedTextWidths reflects unique Y-rows only", () => {
    // 2 visual lines, line 1 has inline parts.
    // Expected: [sum of line-1 widths, line-2 width] = [160, 100]
    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 400, height: 40,
      quad: [0, 0, 400, 0, 400, 40, 0, 40],
      styles: { display: 'block', fontSize: '16px' },
      children: [
        makeText('line1 part A', { x: 0, y: 0, width: 80, height: 18 }),
        makeText('line1 part B', { x: 80, y: 0, width: 80, height: 18 }),
        makeText('line 2 content', { x: 0, y: 20, width: 100, height: 18 }),
      ],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    const pNode = findNode(result, (n) => n.tag === 'p' && n.type === 'text');

    expect(pNode).toBeDefined();
    expect(pNode!.renderedTextWidths).toEqual([160, 100]);
  });
});
