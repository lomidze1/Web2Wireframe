/**
 * Tests for computeHoverDiff in css-converter.
 *
 * When Browser Extension captures hover state, css-converter must compute
 * a DIFF (only changed properties) instead of dumping all ~200 computed styles.
 * Only properties that applyCssDiffToNode() handles should be included.
 */

import { describe, it, expect } from 'vitest';
import { convertW2WToWireframe } from '../rendering/css-converter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('css-converter: hover diff computation', () => {
  it('produces pseudoStateStyles with only changed properties', () => {
    const node = makeFrame({
      tag: 'a',
      styles: {
        display: 'flex',
        backgroundColor: 'rgb(0, 0, 0)',
        color: 'rgb(255, 255, 255)',
        opacity: 1,
      },
      hover: makeFrame({
        tag: 'a',
        styles: {
          display: 'flex',                    // same — NOT in diff
          backgroundColor: 'rgb(255, 0, 0)', // changed — IN diff
          color: 'rgb(255, 255, 255)',        // same — NOT in diff
          opacity: 1,                         // same — NOT in diff
        },
      }),
    });

    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover).toBeDefined();
    // Only background-color should be in the diff
    const hoverDiff = result.pseudoStateStyles!.hover!;
    expect(hoverDiff['background-color']).toBe('rgb(255, 0, 0)');
    // Unchanged properties should NOT be present
    expect(hoverDiff['color']).toBeUndefined();
    expect(hoverDiff['opacity']).toBeUndefined();
    expect(hoverDiff['display']).toBeUndefined();
  });

  it('returns undefined pseudoStateStyles when no relevant properties changed', () => {
    // Non-interactive <div> so the synthetic hover fallback (FIX 2) doesn't
    // kick in — we want to verify that filtered-out CSS diffs yield undefined.
    const node = makeFrame({
      tag: 'div',
      styles: {
        display: 'flex',
        fontSize: '16px',
      },
      hover: makeFrame({
        tag: 'div',
        styles: {
          display: 'block',     // changed but NOT a supported hover property
          fontSize: '18px',     // changed but NOT a supported hover property
        },
      }),
    });

    const result = convertW2WToWireframe(node as any);

    // No supported hover properties changed → undefined
    expect(result.pseudoStateStyles).toBeUndefined();
  });

  it('filters to supported CSS properties only', () => {
    const node = makeFrame({
      tag: 'button',
      styles: {
        backgroundColor: 'rgb(0, 0, 0)',
        fontSize: '14px',
        fontWeight: '400',
        width: '100px',
      },
      hover: makeFrame({
        tag: 'button',
        styles: {
          backgroundColor: 'rgb(50, 50, 50)',  // supported — IN diff
          fontSize: '16px',                     // NOT supported
          fontWeight: '700',                    // NOT supported
          width: '110px',                       // NOT supported
        },
      }),
    });

    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeDefined();
    const diff = result.pseudoStateStyles!.hover!;
    expect(diff['background-color']).toBe('rgb(50, 50, 50)');
    // Unsupported properties NOT in diff
    expect(diff['font-size']).toBeUndefined();
    expect(diff['font-weight']).toBeUndefined();
    expect(diff['width']).toBeUndefined();
  });

  it('handles opacity changes', () => {
    const node = makeFrame({
      tag: 'a',
      styles: { opacity: 1 },
      hover: makeFrame({
        tag: 'a',
        styles: { opacity: 0.8 },
      }),
    });

    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeDefined();
    expect(result.pseudoStateStyles!.hover!['opacity']).toBe('0.8');
  });

  it('handles multiple property changes', () => {
    const node = makeFrame({
      tag: 'a',
      styles: {
        backgroundColor: 'rgb(0, 0, 0)',
        color: 'rgb(255, 255, 255)',
        borderColor: 'transparent',
      },
      hover: makeFrame({
        tag: 'a',
        styles: {
          backgroundColor: 'rgb(30, 30, 30)',
          color: 'rgb(200, 200, 200)',
          borderColor: 'rgb(100, 100, 100)',
        },
      }),
    });

    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeDefined();
    const diff = result.pseudoStateStyles!.hover!;
    expect(diff['background-color']).toBe('rgb(30, 30, 30)');
    expect(diff['color']).toBe('rgb(200, 200, 200)');
    expect(diff['border-color']).toBe('rgb(100, 100, 100)');
  });

  it('converts camelCase style keys to kebab-case in diff', () => {
    const node = makeFrame({
      tag: 'a',
      styles: {
        backgroundColor: 'white',
        textDecorationLine: 'none',
      },
      hover: makeFrame({
        tag: 'a',
        styles: {
          backgroundColor: 'blue',
          textDecorationLine: 'underline',
        },
      }),
    });

    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeDefined();
    const diff = result.pseudoStateStyles!.hover!;
    // Keys should be kebab-case (matching what applyCssDiffToNode expects)
    expect(diff['background-color']).toBe('blue');
    expect(diff['text-decoration-line']).toBe('underline');
    // Should NOT have camelCase keys
    expect(diff['backgroundColor']).toBeUndefined();
    expect(diff['textDecorationLine']).toBeUndefined();
  });

  it('no hover field → undefined pseudoStateStyles (non-interactive element)', () => {
    // Non-interactive <div> — synthetic fallback (FIX 2) is gated on
    // interactive tags/roles/cursor, so a plain div stays undefined.
    const node = makeFrame({
      tag: 'div',
      styles: { backgroundColor: 'black' },
      // NO hover field
    });

    const result = convertW2WToWireframe(node as any);

    expect(result.pseudoStateStyles).toBeUndefined();
  });
});

// ===========================================================================
// FIX 3 — effect-producing properties (filter, backdrop-filter, text-shadow,
// clip-path). These are CSS properties that manifest as Figma effects or
// clipsContent on the hover variant.
// ===========================================================================

describe('css-converter: FIX 3 — effect-producing hover properties', () => {
  it('captures filter diff (blur value change)', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { filter: 'none' },
      hover: makeFrame({
        tag: 'div',
        styles: { filter: 'blur(10px)' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles?.hover).toBeDefined();
    expect(result.pseudoStateStyles?.hover?.['filter']).toBe('blur(10px)');
  });

  it('captures filter diff (drop-shadow added)', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { filter: 'none' },
      hover: makeFrame({
        tag: 'div',
        styles: { filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.5))' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles?.hover?.['filter']).toContain('drop-shadow');
  });

  it("ignores filter change if both normal and hover are 'none'", () => {
    const node = makeFrame({
      tag: 'div',
      styles: { filter: 'none', backgroundColor: 'rgb(0,0,0)' },
      hover: makeFrame({
        tag: 'div',
        styles: { filter: 'none', backgroundColor: 'rgb(255,0,0)' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    // Only bg change is in diff
    expect(result.pseudoStateStyles?.hover?.['filter']).toBeUndefined();
    expect(result.pseudoStateStyles?.hover?.['background-color']).toBe('rgb(255,0,0)');
  });

  it('captures backdrop-filter diff (blur value change)', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { backdropFilter: 'blur(0)' },
      hover: makeFrame({
        tag: 'div',
        styles: { backdropFilter: 'blur(10px)' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles?.hover?.['backdrop-filter']).toBe('blur(10px)');
  });

  it("captures text-shadow diff (from 'none' to shadow)", () => {
    const node = makeFrame({
      tag: 'div',
      styles: { textShadow: 'none' },
      hover: makeFrame({
        tag: 'div',
        styles: { textShadow: '2px 2px 4px rgb(0,0,0)' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles?.hover?.['text-shadow']).toBe('2px 2px 4px rgb(0,0,0)');
  });

  it('captures text-shadow diff (multiple comma-separated shadows)', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { textShadow: 'none' },
      hover: makeFrame({
        tag: 'div',
        styles: { textShadow: '2px 2px 4px black, 0 0 10px blue' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles?.hover?.['text-shadow']).toBe(
      '2px 2px 4px black, 0 0 10px blue',
    );
  });

  it('captures clip-path diff (inset value change)', () => {
    const node = makeFrame({
      tag: 'div',
      styles: { clipPath: 'inset(0)' },
      hover: makeFrame({
        tag: 'div',
        styles: { clipPath: 'inset(10px)' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles?.hover?.['clip-path']).toBe('inset(10px)');
  });

  it("captures clip-path diff (from 'none' to inset)", () => {
    const node = makeFrame({
      tag: 'div',
      styles: { clipPath: 'none' },
      hover: makeFrame({
        tag: 'div',
        styles: { clipPath: 'inset(5px 10px)' },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    expect(result.pseudoStateStyles?.hover?.['clip-path']).toBe('inset(5px 10px)');
  });

  it('all 4 properties in a single hover yields single merged diff', () => {
    const node = makeFrame({
      tag: 'div',
      styles: {
        filter: 'none',
        backdropFilter: 'none',
        textShadow: 'none',
        clipPath: 'none',
      },
      hover: makeFrame({
        tag: 'div',
        styles: {
          filter: 'blur(2px)',
          backdropFilter: 'blur(10px)',
          textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          clipPath: 'inset(4px)',
        },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertW2WToWireframe(node as any);
    const hover = result.pseudoStateStyles?.hover;
    expect(hover).toBeDefined();
    expect(hover?.['filter']).toBe('blur(2px)');
    expect(hover?.['backdrop-filter']).toBe('blur(10px)');
    expect(hover?.['text-shadow']).toBe('0 2px 4px rgba(0,0,0,0.5)');
    expect(hover?.['clip-path']).toBe('inset(4px)');
  });
});
