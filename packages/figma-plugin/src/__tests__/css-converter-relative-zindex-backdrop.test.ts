/**
 * Relative + negative z-index backdrop (2026-08-08 audit — iwm.org.uk
 * div.hero__media class of bug).
 *
 * The stacking pass only reorders out-of-flow children (absolute|fixed):
 * they carry layoutPositioning ABSOLUTE, so moving them affects paint only.
 * A `position: relative; z-index: -1` backdrop satisfies neither test and
 * stayed in DOM order — painting OVER the hero's absolutely-positioned nav
 * and content.
 *
 * Reordering an in-flow child under auto-layout is NOT safe in general
 * (order = layout), so the converter normalizes only the provably-safe
 * backdrop pattern to `absolute`: the child covers (almost) the whole
 * element and every other child is already out of flow — removing its flow
 * slot shifts nothing, and the battle-tested absolute machinery (constraints,
 * behind-hoist) takes over.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { W2WFrameNode } from "@w2w/shared";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 600, height: 400,
    quad: [0, 0, 600, 0, 600, 400, 0, 400],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function findByClass(node: unknown, cls: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.name === 'string' && obj.name.includes(cls)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

function heroWith(backdropOverrides: Record<string, unknown>, siblingOverrides: Record<string, unknown>) {
  const backdrop = makeFrame({
    classList: ['hero__media'],
    styles: {
      display: 'block',
      position: 'relative',
      zIndex: '-1',
      backgroundColor: 'rgb(20, 20, 20)',
    },
    ...backdropOverrides,
  });
  const sibling = makeFrame({
    classList: ['hero__nav'],
    x: 0, y: 0, width: 600, height: 80,
    quad: [0, 0, 600, 0, 600, 80, 0, 80],
    ...siblingOverrides,
  });
  const hero = makeFrame({ classList: ['hero'], children: [backdrop, sibling] });
  const root = makeFrame({ tag: 'body', height: 800, children: [hero] });
  return convertW2WToWireframe(root as unknown as W2WFrameNode);
}

describe("relative negative-z backdrop → absolute normalization", () => {
  it("full-cover backdrop among out-of-flow siblings becomes absolute", () => {
    const tree = heroWith(
      {},
      { styles: { display: 'block', position: 'absolute', zIndex: '2' } },
    );
    const backdrop = findByClass(tree, 'hero__media');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.position).toBe('absolute');
    expect(backdrop!.zIndex).toBe(-1);
  });

  it("stays relative when a sibling is in normal flow (its slot matters)", () => {
    const tree = heroWith(
      {},
      { styles: { display: 'block' } }, // static, in-flow sibling
    );
    const backdrop = findByClass(tree, 'hero__media');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.position).not.toBe('absolute');
  });

  it("stays relative when it covers only part of the element (not a backdrop)", () => {
    const tree = heroWith(
      {
        width: 300, height: 150,
        quad: [0, 0, 300, 0, 300, 150, 0, 150],
      },
      { styles: { display: 'block', position: 'absolute' } },
    );
    const backdrop = findByClass(tree, 'hero__media');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.position).not.toBe('absolute');
  });

  it("positive z-index relative children are untouched (front case is flow-unsafe)", () => {
    const tree = heroWith(
      { styles: { display: 'block', position: 'relative', zIndex: '5', backgroundColor: 'rgb(20,20,20)' } },
      { styles: { display: 'block', position: 'absolute' } },
    );
    const backdrop = findByClass(tree, 'hero__media');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.position).not.toBe('absolute');
  });
});
