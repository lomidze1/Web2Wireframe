/**
 * Tests for css-converter.ts — CSS `content` FUNCTION residue in pseudo spans.
 *
 * `getComputedStyle(el, '::before').content` returns some content functions
 * UNRESOLVED, as their literal source text. Verified in Chrome 151:
 *
 *   content: counter(step) ". "    → raw `counter(step) ". "`      LEAKS
 *   content: counters(sec,".") " " → raw `counters(sec, ".") " "`  LEAKS
 *   content: open-quote            → raw `open-quote`              LEAKS
 *   content: attr(data-label)      → raw `"Hello label"`           resolves (no bug)
 *   content: "literal"             → raw `"literal"`               resolves (control)
 *
 * `decodeContentValue` (packages/shared) only strips quotes and decodes
 * `\XXXX` escapes, so the extension writes the leaked source text straight
 * into the injected pseudo span and it lands in Figma as visible text reading
 * `counter(step) ". `. (The trailing quote is eaten by decodeContentValue's
 * unbalanced quote-strip — hence the malformed fixture values below.)
 *
 * The capture-side fix is in packages/shared + packages/browser-extension,
 * both LIVE. The plugin suppresses the residue instead, gated on the injected
 * pseudo marker classes so ordinary page text is never touched.
 *
 * Suppression drops the TEXT only — never the node. A ::before frequently
 * carries a background, border or size doing real visual work.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// Fixture helpers (same shape as css-converter-marker-flatten.test.ts)
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
    x: 0, y: 0, width: 50, height: 14,
    quad: [0, 0, 50, 0, 50, 14, 0, 14],
    value,
    font: '400 12px SFProText',
    ...overrides,
  };
}

function collectTextValues(node: unknown): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.textContent === 'string') {
      out.push(obj.textContent);
    }
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return out;
}

function countNodes(node: unknown): number {
  let n = 0;
  const visit = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    n++;
    const children = (x as Record<string, unknown>).children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return n;
}

/** <li> carrying a pseudo wrapper with `residue` plus the item's real text. */
function makeListItem(pseudoClass: string, residue: string): Record<string, unknown> {
  const pseudo = makeFrame({
    tag: 'span',
    classList: [pseudoClass],
    x: 20, y: 100, width: 18, height: 16,
    quad: [20, 100, 38, 100, 38, 116, 20, 116],
    styles: { display: 'inline', position: 'static', color: 'rgb(0,0,0)' },
    children: [makeText(residue, { x: 20, y: 100, width: 18, height: 16 })],
  });

  const li = makeFrame({
    tag: 'li',
    x: 20, y: 100, width: 400, height: 16,
    quad: [20, 100, 420, 100, 420, 116, 20, 116],
    styles: { display: 'list-item', fontSize: '12px' },
    children: [pseudo, makeText('Install the plugin', { x: 40, y: 100, width: 380, height: 16 })],
  });

  return makeFrame({
    tag: 'ol',
    x: 20, y: 100, width: 400, height: 60,
    quad: [20, 100, 420, 100, 420, 160, 20, 160],
    styles: { display: 'block', fontSize: '12px' },
    children: [li],
  });
}

// ---------------------------------------------------------------------------
// Leaked content functions must not render as text
// ---------------------------------------------------------------------------

describe("css-converter: CSS content-function residue in pseudo spans", () => {
  it("drops `counter(step) \". ` residue from a __w2w-pseudo-before", () => {
    const result = convertW2WToWireframe(
      makeListItem('__w2w-pseudo-before', 'counter(step) ". ') as never,
      { layoutMode: 'autoLayout' },
    );
    const allText = collectTextValues(result);

    expect(allText.some((t) => t.includes('counter('))).toBe(false);
    // the item's real text is untouched
    expect(allText.some((t) => t.includes('Install the plugin'))).toBe(true);
  });

  it("drops `counters(sec, \".\") \" ` residue from a __w2w-pseudo-marker", () => {
    const result = convertW2WToWireframe(
      makeListItem('__w2w-pseudo-marker', 'counters(sec, ".") " ') as never,
      { layoutMode: 'autoLayout' },
    );
    const allText = collectTextValues(result);

    expect(allText.some((t) => t.includes('counters('))).toBe(false);
    expect(allText.some((t) => t.includes('Install the plugin'))).toBe(true);
  });

  it.each([
    'open-quote',
    'close-quote',
    'no-open-quote',
    'no-close-quote',
  ])("drops the bare `%s` keyword", (keyword) => {
    const result = convertW2WToWireframe(
      makeListItem('__w2w-pseudo-before', keyword) as never,
      { layoutMode: 'autoLayout' },
    );
    const allText = collectTextValues(result);

    expect(allText.some((t) => t.includes(keyword))).toBe(false);
    expect(allText.some((t) => t.includes('Install the plugin'))).toBe(true);
  });

  it("drops residue from a __w2w-pseudo-after too", () => {
    const result = convertW2WToWireframe(
      makeListItem('__w2w-pseudo-after', 'close-quote') as never,
      { layoutMode: 'autoLayout' },
    );
    expect(collectTextValues(result).some((t) => t.includes('close-quote'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guards — the suppression must stay narrow
// ---------------------------------------------------------------------------

describe("css-converter: content-function suppression stays narrow", () => {
  it("leaves ORDINARY page text containing `counter(` completely untouched", () => {
    // Authored prose in a plain <p> — no pseudo marker class anywhere.
    // This is the half of the condition that stops the suppression from
    // eating real content.
    const prose = 'Call counter(x) to increment the value';
    const p = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 400, height: 16,
      quad: [0, 0, 400, 0, 400, 16, 0, 16],
      styles: { display: 'block', fontSize: '14px' },
      children: [makeText(prose, { x: 0, y: 0, width: 400, height: 16 })],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    expect(collectTextValues(result).some((t) => t.includes(prose))).toBe(true);
  });

  it("leaves a pseudo span carrying real literal text untouched", () => {
    const result = convertW2WToWireframe(
      makeListItem('__w2w-pseudo-before', 'Step ') as never,
      { layoutMode: 'autoLayout' },
    );
    expect(collectTextValues(result).some((t) => t.includes('Step'))).toBe(true);
  });

  it("leaves a pseudo span whose text merely mentions open-quote in a sentence", () => {
    const sentence = 'the open-quote character';
    const result = convertW2WToWireframe(
      makeListItem('__w2w-pseudo-before', sentence) as never,
      { layoutMode: 'autoLayout' },
    );
    expect(collectTextValues(result).some((t) => t.includes(sentence))).toBe(true);
  });

  it("KEEPS the node when residue is suppressed — only the text goes", () => {
    // A ::before that both leaks `counter()` AND paints a 12x12 swatch.
    // Deleting the node would remove the bullet; only the string may go.
    const pseudo = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-before'],
      x: 20, y: 100, width: 12, height: 12,
      quad: [20, 100, 32, 100, 32, 112, 20, 112],
      styles: {
        display: 'inline-block',
        position: 'static',
        width: '12px',
        height: '12px',
        backgroundColor: 'rgb(255, 0, 0)',
      },
      children: [makeText('counter(step) ". ', { x: 20, y: 100, width: 12, height: 12 })],
    });

    const li = makeFrame({
      tag: 'li',
      x: 20, y: 100, width: 400, height: 16,
      quad: [20, 100, 420, 100, 420, 116, 20, 116],
      styles: { display: 'list-item', fontSize: '12px' },
      children: [pseudo, makeText('Install the plugin', { x: 40, y: 100, width: 380, height: 16 })],
    });

    const result = convertW2WToWireframe(li as never, { layoutMode: 'autoLayout' });
    const allText = collectTextValues(result);

    expect(allText.some((t) => t.includes('counter('))).toBe(false);
    // the painted swatch survives as a node
    expect(countNodes(result)).toBeGreaterThan(1);
    const json = JSON.stringify(result);
    expect(json).toContain('"r":1');
  });
});
