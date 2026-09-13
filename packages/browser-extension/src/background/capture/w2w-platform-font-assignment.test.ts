/**
 * Platform-font assignment: the measurement has to land on the element it was
 * taken from, and it has to describe the text we captured.
 *
 * Three ways it did not, all seen on stripe.com (2026-09-08):
 *
 * 1. The content script numbers `data-w2w-idx` in POST-order — a host is
 *    tagged after its children have been traversed — while the assignment walk
 *    counted PRE-order. Every host that contains another host (a <p> with an
 *    inline <a>) swapped measurements with it: 222 of 831 hosts on stripe.com.
 *
 * 2. Pseudo-element and list-marker wrappers are FRAMEs with a TEXT child that
 *    the content script never tags (they are synthesized, not traversed), so
 *    counting them shifts every host after them by one.
 *
 * 3. The measurement runs seconds after the DOM was read. stripe.com's payment
 *    mockup cycles its labels through locales in place, so "Tap, insert, or
 *    swipe to pay" was measured while the same element showed Japanese and came
 *    back as Hiragino Sans W2; 17 Latin labels landed on Hiragino / PingFang.
 *    Comparing the element's live text with the captured text catches this —
 *    and catches any residual numbering mismatch the same way.
 */
import { describe, expect, it, vi } from 'vitest';
import type { W2WFrameNode, W2WTextNode } from '@w2w/shared';
import { w2wEnrichAllTextNodes, w2wReadHostText } from './w2w';

const text = (value: string): W2WTextNode => ({
  type: 'TEXT',
  x: 0, y: 0, width: 10, height: 10,
  quad: [0, 0, 10, 0, 10, 10, 0, 10],
  value,
  font: 'sohne-var',
});

const frame = (
  children: W2WFrameNode['children'],
  classList: string[] = [],
): W2WFrameNode => ({
  type: 'FRAME',
  x: 0, y: 0, width: 100, height: 100,
  quad: [0, 0, 100, 0, 100, 100, 0, 100],
  tag: 'div',
  classList,
  attr: {},
  styles: {},
  children,
});

const SOHNE = { familyName: 'Söhne VF', postScriptName: 'SohneVF-Buch' };
const MONO = { familyName: 'Söhne Mono', postScriptName: 'SohneMono-Buch' };
const HIRAGINO = { familyName: 'Hiragino Sans', postScriptName: 'HiraginoSans-W2' };

const textOf = (host: W2WFrameNode): W2WTextNode =>
  host.children.find((c): c is W2WTextNode => c.type === 'TEXT')!;

describe('w2wEnrichAllTextNodes — numbering', () => {
  it('numbers hosts in POST-order, the way the content script tags them', () => {
    const inner = frame([text('link')]);
    const outer = frame([text('Read the '), inner]);
    const root = frame([outer]);
    // Content script: inner is traversed (and tagged 0) before outer (tagged 1).
    const fonts = new Map([[0, MONO], [1, SOHNE]]);

    w2wEnrichAllTextNodes(root, fonts);

    expect(textOf(inner).platformFont?.familyName).toBe('Söhne Mono');
    expect(textOf(outer).platformFont?.familyName).toBe('Söhne VF');
  });

  it('does not count synthesized pseudo/marker wrappers — they were never tagged', () => {
    const marker = frame([text('•')], ['__w2w-pseudo-marker']);
    const before = frame([text('"')], ['__w2w-pseudo-before']);
    const first = frame([before, text('quoted')]);
    const second = frame([marker, text('item')]);
    const root = frame([first, second]);
    const fonts = new Map([[0, SOHNE], [1, MONO]]);

    w2wEnrichAllTextNodes(root, fonts);

    expect(textOf(first).platformFont?.familyName).toBe('Söhne VF');
    expect(textOf(second).platformFont?.familyName).toBe('Söhne Mono');
    expect(textOf(marker).platformFont).toBeUndefined();
    expect(textOf(before).platformFont).toBeUndefined();
  });
});

describe('w2wEnrichAllTextNodes — live-text guard', () => {
  it('rejects a measurement when the element no longer shows the captured text', () => {
    const host = frame([text('Tap, insert, or swipe to pay')]);
    const root = frame([host]);
    const live = new Map([[0, 'タップ、挿入、またはスワイプ']]);

    w2wEnrichAllTextNodes(root, new Map([[0, HIRAGINO]]), live);

    expect(textOf(host).platformFont).toBeUndefined();
    expect(textOf(host).font).toBe('sohne-var');
  });

  it('accepts a measurement whose live text matches, ignoring whitespace and line splits', () => {
    // The content script splits a text node into visual lines and trims them.
    const host = frame([text('Accept payments'), text('globally')]);
    const root = frame([host]);
    const live = new Map([[0, '  Accept payments\n   globally ']]);

    w2wEnrichAllTextNodes(root, new Map([[0, SOHNE]]), live);

    expect(textOf(host).platformFont?.familyName).toBe('Söhne VF');
    expect(textOf(host).font).toBe('Söhne VF');
  });

  it('rejects when the element has left the page (no live entry)', () => {
    const host = frame([text('gone')]);
    const root = frame([host]);

    w2wEnrichAllTextNodes(root, new Map([[0, SOHNE]]), new Map());

    expect(textOf(host).platformFont).toBeUndefined();
  });

  it('assigns unguarded when no live text could be read at all', () => {
    const host = frame([text('hello')]);
    const root = frame([host]);

    w2wEnrichAllTextNodes(root, new Map([[0, SOHNE]]), undefined);

    expect(textOf(host).platformFont?.familyName).toBe('Söhne VF');
  });

  it('still drops a measurement whose name table is not a family name', () => {
    const host = frame([text('hello')]);
    const root = frame([host]);
    const klim = { familyName: 'Copyright Klim Type Foundry', postScriptName: 'SohneVF-Buch' };

    w2wEnrichAllTextNodes(root, new Map([[0, klim]]), new Map([[0, 'hello']]));

    expect(textOf(host).platformFont).toBeUndefined();
    expect(textOf(host).font).toBe('sohne-var');
  });
});

describe('w2wReadHostText', () => {
  it('reads every tagged host\'s own text in one round trip', async () => {
    const send = vi.fn().mockResolvedValue({
      result: { value: [['0', 'Card'], ['1', 'カード']] },
    });

    const live = await w2wReadHostText({ send });

    expect(send).toHaveBeenCalledTimes(1);
    const [method, params] = send.mock.calls[0];
    expect(method).toBe('Runtime.evaluate');
    expect(params.returnByValue).toBe(true);
    // Only the element's OWN text nodes: the captured TEXT children come from
    // direct child text nodes, and descendants are hosts of their own.
    expect(String(params.expression)).toMatch(/childNodes/);
    expect(String(params.expression)).toContain('[data-w2w-idx]');
    expect(live?.get(0)).toBe('Card');
    expect(live?.get(1)).toBe('カード');
  });

  it('returns undefined when the page cannot be read — the caller then assigns unguarded', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Target closed'));

    await expect(w2wReadHostText({ send })).resolves.toBeUndefined();
  });
});
