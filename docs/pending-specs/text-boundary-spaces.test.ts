/**
 * Inter-word spaces must survive a word-by-word DOM.
 *
 * stripe.com's chat bubble reveals its copy one word at a time, so the markup
 * is `<span>Absolutely. </span><span>Here </span><span>are </span>…`. Each
 * span's text node is that span's ONLY child, so it has no siblings — the
 * boundary-space rescue never fired and `collapse().trim()` dropped every
 * trailing space.
 *
 * The measured rect keeps the space (a Range over "Absolutely. " includes the
 * trailing advance), so the runs abut at gap 0. All three of the converter's
 * separator rules read that geometry and correctly conclude "no space here",
 * exactly as they must for glinc.io's `<a>GL<span>inc</span></a>`. The result
 * was 'Absolutely.Hereareafewcomfyessentials'.
 *
 * The plugin cannot tell the two apart — the string is already damaged at
 * capture. So the rescue has to look past inline wrappers the run is flush
 * against, which is what these tests pin.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractTextNodes } from './extractor';

// happy-dom gives Ranges no geometry, and extractTextNodes drops zero-sized
// runs. Stub just enough for the single-line path — these tests assert the
// extracted STRING, never the rect.
beforeEach(() => {
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue({
    length: 1,
    item: () => null,
  } as unknown as DOMRectList);
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 16,
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** `el("span", "word ")` → `<span>word </span>`. Children may be text or nodes. */
function el(tag: string, ...children: Array<string | Node>): HTMLElement {
  const node = document.createElement(tag);
  for (const c of children) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** Mount `root`, extract `textNode`, return the extracted `value` strings. */
function extract(root: HTMLElement, textNode: Text): string[] {
  document.body.appendChild(root);
  const parentEl = textNode.parentElement as HTMLElement;
  return extractTextNodes(
    textNode,
    parentEl,
    window.getComputedStyle(parentEl),
  ).map((n) => n.value);
}

/** The text node directly inside `element`. */
const textOf = (element: HTMLElement): Text => element.firstChild as Text;

describe('boundary spaces across inline wrappers', () => {
  it('keeps the trailing space of a word-per-span reveal', () => {
    // THE BUG: the text node is the span's only child, so the sibling-only
    // test found nothing and the space was trimmed.
    const first = el('span', 'Absolutely. ');
    const root = el('div', first, el('span', 'Here'));
    expect(extract(root, textOf(first))).toEqual(['Absolutely. ']);
  });

  it('keeps a leading space the same way', () => {
    const second = el('span', ' are');
    const root = el('div', el('span', 'Here'), second);
    expect(extract(root, textOf(second))).toEqual([' are']);
  });

  it('drops the space at a block edge, as CSS does', () => {
    // Nothing follows the span inside the div, so the browser collapses this
    // space away — keeping it would widen the run past what was measured.
    const only = el('span', 'word ');
    expect(extract(el('div', only), textOf(only))).toEqual(['word']);
  });

  it('still keeps a space when the sibling itself is the element', () => {
    // The original case this rescue was written for: `<p>shop: <a>Store</a></p>`.
    const p = el('p', 'shop: ', el('a', 'Store'));
    expect(extract(p, textOf(p))).toEqual(['shop: ']);
  });

  it('invents nothing when the raw text has no boundary space (glinc.io)', () => {
    // `<a>GL<span>inc</span></a>` must stay "GLinc" — the runs touch because
    // there genuinely is no space, not because one was trimmed.
    const a = el('a', 'GL', el('span', 'inc'));
    expect(extract(a, textOf(a))).toEqual(['GL']);
  });

  it('sees past a nested inline wrapper', () => {
    const em = el('em', 'word ');
    const root = el('div', el('span', em), el('span', 'next'));
    expect(extract(root, textOf(em))).toEqual(['word ']);
  });

  it('stops at a block wrapper even when an element follows it', () => {
    // The inner text ends at a block edge; the space collapses there.
    const inner = el('span', 'word ');
    const block = el('div', inner);
    const root = el('div', block, el('span', 'next'));
    expect(extract(root, textOf(inner))).toEqual(['word']);
  });
});
