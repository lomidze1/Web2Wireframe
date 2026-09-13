/**
 * Logical `text-align` — `start` / `end` resolved against `direction`
 * (00-MASTER-REPORT.md §9 V5).
 *
 * CSS `start`/`end` name the leading/trailing edge of the element's writing
 * direction, not left/right. We used to hardcode left-to-right, and the two
 * rendering paths disagreed: `alignMap` mapped `start→LEFT` / `end→RIGHT`,
 * while the fillr ladder had no case for either and dropped BOTH to LEFT —
 * so `end` was wrong even on an LTR page.
 *
 * h2d's rule (their `z7`) is a 2x2:
 *
 *     start + ltr -> left      start + rtl -> right
 *     end   + ltr -> right     end   + rtl -> left
 *
 * The resolution happens ONCE, in the converter, so no downstream consumer
 * ever sees a logical value — `textAlign` is compared by string in four
 * places and teaching each one about `start`/`end` guarantees the fifth
 * forgets. The invariant is asserted at the bottom of this file.
 *
 * `direction` is resolved per element by getComputedStyle, so it is read from
 * the node's own captured styles — there is no inheritance walk to do.
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

function collectAllNodes(node: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    out.push(obj);
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return out;
}

/**
 * Coalesced path — a <p> whose only children are TEXT, so the text collapses
 * onto the host frame. Exercises the `convertFrame` assignment site.
 */
function convertCoalesced(styles: Record<string, unknown>): Record<string, unknown> {
  const host = makeFrame({
    tag: 'p',
    styles: { display: 'block', ...styles },
    children: [makeText('محتوى نصي')],
  });
  const root = makeFrame({ tag: 'body', height: 300, children: [host] });
  const texts = collectTextNodes(convertW2WToWireframe(root as unknown as W2WFrameNode));
  expect(texts.length).toBeGreaterThan(0);
  return texts[0];
}

/**
 * Mixed-children path — a <p> holding TEXT *and* a FRAME, so the text cannot
 * coalesce and goes through `convertTextNodeFromValue` instead. This is the
 * second assignment site; a fix applied only to the coalesced path leaves
 * inline runs on the old behaviour.
 */
function convertMixed(styles: Record<string, unknown>): Record<string, unknown> {
  const host = makeFrame({
    tag: 'p',
    styles: { display: 'block', ...styles },
    children: [
      makeText('محتوى نصي'),
      makeFrame({
        tag: 'span', y: 30, height: 30,
        quad: [0, 30, 600, 30, 600, 60, 0, 60],
        styles: { display: 'block', backgroundColor: 'rgb(200, 0, 0)' },
      }),
    ],
  });
  const root = makeFrame({ tag: 'body', height: 300, children: [host] });
  const texts = collectTextNodes(convertW2WToWireframe(root as unknown as W2WFrameNode));
  expect(texts.length).toBeGreaterThan(0);
  return texts[0];
}

const PATHS: Array<[string, (s: Record<string, unknown>) => Record<string, unknown>]> = [
  ['coalesced (convertFrame)', convertCoalesced],
  ['mixed children (convertTextNodeFromValue)', convertMixed],
];

describe.each(PATHS)('logical text-align — %s', (_label, convert) => {
  // ---- the 2x2 -----------------------------------------------------------

  it('start + ltr → left', () => {
    expect(convert({ textAlign: 'start', direction: 'ltr' }).textAlign).toBe('left');
  });

  it('start + rtl → right', () => {
    expect(convert({ textAlign: 'start', direction: 'rtl' }).textAlign).toBe('right');
  });

  it('end + ltr → right', () => {
    expect(convert({ textAlign: 'end', direction: 'ltr' }).textAlign).toBe('right');
  });

  it('end + rtl → left', () => {
    expect(convert({ textAlign: 'end', direction: 'rtl' }).textAlign).toBe('left');
  });

  // ---- absent direction defaults to ltr ----------------------------------

  it('start with no direction → left (ltr default)', () => {
    expect(convert({ textAlign: 'start' }).textAlign).toBe('left');
  });

  it('end with no direction → right (ltr default)', () => {
    expect(convert({ textAlign: 'end' }).textAlign).toBe('right');
  });

  it('an unrecognised direction is treated as ltr', () => {
    expect(convert({ textAlign: 'end', direction: 'auto' }).textAlign).toBe('right');
  });

  // ---- physical values are never rewritten -------------------------------

  it.each(['left', 'right', 'center', 'justify'])(
    'physical %s passes through unchanged in ltr',
    (align) => {
      expect(convert({ textAlign: align, direction: 'ltr' }).textAlign).toBe(align);
    },
  );

  it.each(['left', 'right', 'center', 'justify'])(
    'physical %s passes through unchanged in rtl (direction must NOT flip it)',
    (align) => {
      expect(convert({ textAlign: align, direction: 'rtl' }).textAlign).toBe(align);
    },
  );
});

describe('no WireframeNode ever carries a logical text-align', () => {
  it('a tree mixing start/end in both directions converts to physical values only', () => {
    const section = (align: string, direction: string, y: number) => makeFrame({
      tag: 'section', y, height: 60,
      quad: [0, y, 600, y, 600, y + 60, 0, y + 60],
      styles: { display: 'block', textAlign: align, direction },
      children: [
        makeText('نص', { y, quad: [0, y, 200, y, 200, y + 25, 0, y + 25] }),
        makeFrame({
          tag: 'span', y: y + 30, height: 25,
          quad: [0, y + 30, 600, y + 30, 600, y + 55, 0, y + 55],
          styles: { display: 'block', backgroundColor: 'rgb(0, 0, 200)' },
        }),
      ],
    });

    const root = makeFrame({
      tag: 'body', height: 600,
      children: [
        section('start', 'ltr', 0),
        section('start', 'rtl', 60),
        section('end', 'ltr', 120),
        section('end', 'rtl', 180),
        section('start', '', 240),
      ],
    });

    const all = collectAllNodes(convertW2WToWireframe(root as unknown as W2WFrameNode));
    expect(all.length).toBeGreaterThan(5);

    const logical = all.filter(
      (n) => n.textAlign === 'start' || n.textAlign === 'end',
    );
    expect(logical).toEqual([]);
  });
});
