/**
 * Tests for FIX 4 — descendant hover propagation.
 *
 * Verifies that convertW2WToWireframe:
 *   - Computes hasDescendantHover bottom-up
 *   - Gates FIX 2 synthetic fallback when descendant has hover
 *   - Still synthesizes FIX 2 for interactive nodes WITHOUT descendant hover
 */

import { describe, it, expect } from 'vitest';
import { convertW2WToWireframe } from '../rendering/css-converter';

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: 'div',
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

describe('css-converter: FIX 4 hasDescendantHover + FIX 2 gating', () => {
  it('computes hasDescendantHover=true when child has pseudoStateStyles from real diff', () => {
    const curtainChild = makeFrame({
      tag: 'div',
      attr: { id: 'curtain' },
      styles: { opacity: '0', visibility: 'hidden' },
      hover: makeFrame({
        tag: 'div',
        attr: { id: 'curtain' },
        styles: { opacity: '1', visibility: 'visible' },
      }),
    });
    const parent = makeFrame({
      tag: 'div',
      classList: ['container'],
      children: [curtainChild],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(parent as any, { interactionMode: 'variants' });
    expect(result.hasDescendantHover).toBe(true);
  });

  it('computes hasDescendantHover=true when grandchild has pseudoStateStyles', () => {
    const gcStyled = makeFrame({
      tag: 'div',
      classList: ['leaf'],
      styles: { backgroundColor: 'rgb(0,0,0)' },
      hover: makeFrame({
        tag: 'div',
        classList: ['leaf'],
        styles: { backgroundColor: 'rgb(255,0,0)' },
      }),
    });
    const child = makeFrame({
      tag: 'div',
      children: [gcStyled],
    });
    const root = makeFrame({
      tag: 'section',
      children: [child],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(root as any, { interactionMode: 'variants' });
    expect(result.hasDescendantHover).toBe(true);
  });

  it('hasDescendantHover=undefined for leaf node with no hover', () => {
    const leaf = makeFrame({ tag: 'div', styles: {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(leaf as any);
    expect(result.hasDescendantHover).toBeUndefined();
  });

  it('hasDescendantHover=undefined when node has OWN hover but no descendant hover', () => {
    const btn = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0,0,0)' },
      hover: makeFrame({
        tag: 'button',
        styles: { backgroundColor: 'rgb(255,0,0)' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(btn as any, { interactionMode: 'variants' });
    expect(result.hasDescendantHover).toBeUndefined();
    // But own pseudoStateStyles should be set:
    expect(result.pseudoStateStyles?.hover).toBeDefined();
  });

  it('gates FIX 2 synthetic fallback when descendant has hover', () => {
    // A <button> parent (normally would synthesize opacity:0.8 via FIX 2)
    // that has a child with real hover. Parent should NOT get synthetic.
    const childWithHover = makeFrame({
      tag: 'div',
      classList: ['label'],
      styles: { color: 'rgb(0,0,0)' },
      hover: makeFrame({
        tag: 'div',
        classList: ['label'],
        styles: { color: 'rgb(255,0,0)' },
      }),
    });
    const btn = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0,0,0)' },
      children: [childWithHover],
      // NO own hover field
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(btn as any, { interactionMode: 'variants' });
    // Parent should NOT have synthetic FIX 2 diff:
    expect(result.pseudoStateStyles).toBeUndefined();
    // But hasDescendantHover IS set, so nodes.ts still creates ComponentSet:
    expect(result.hasDescendantHover).toBe(true);
  });

  it('synthesizes FIX 2 fallback for interactive nodes WITHOUT descendant hover and no real diff', () => {
    // Plain <button> with a passive child and no captured node.hover.
    // FIX 2 synthesizes opacity:0.8 so it becomes a ComponentSet.
    const passiveChild = makeFrame({
      tag: 'span',
      styles: { color: 'rgb(0,0,0)' },
    });
    const btn = makeFrame({
      tag: 'button',
      styles: { backgroundColor: 'rgb(0,0,0)' },
      children: [passiveChild],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(btn as any, { interactionMode: 'variants' });
    expect(result.pseudoStateStyles?.hover).toEqual({ opacity: '0.8' });
    expect(result.hasDescendantHover).toBeUndefined();
  });

  it('curtain E2E: nav item has empty self diff but hasDescendantHover=true', () => {
    const curtainChild = makeFrame({
      tag: 'div',
      attr: { id: 'globalnav-curtain' },
      styles: { opacity: '0', visibility: 'hidden' },
      hover: makeFrame({
        tag: 'div',
        attr: { id: 'globalnav-curtain' },
        styles: { opacity: '1', visibility: 'visible' },
      }),
    });
    const navItem = makeFrame({
      tag: 'li',
      classList: ['globalnav-item'],
      styles: {},
      children: [curtainChild],
      // Nav item's own hover is identical to default (no visual change)
      hover: makeFrame({
        tag: 'li',
        classList: ['globalnav-item'],
        styles: {},
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(navItem as any, { interactionMode: 'variants' });
    expect(result.pseudoStateStyles).toBeUndefined(); // no self diff (FIX 2 gated)
    expect(result.hasDescendantHover).toBe(true);
  });
});
