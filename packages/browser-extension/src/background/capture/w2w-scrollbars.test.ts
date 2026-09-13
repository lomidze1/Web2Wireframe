/**
 * The extension hides the page scrollbar BEFORE it measures the layout.
 *
 * Scrollbar compensation assumed the scrollbar would stay: measure the layout
 * viewport (1425 at a 1440 override on a Mac with classic scrollbars), widen the
 * override by the difference (1455), and the content lands on 1440. But the
 * content script then hides the scrollbar for the extraction, the 15px come
 * back, and everything laid out from `100vw` — stripe.com's `main`, its
 * section padding `(100vw - 1266px) / 2` — measures 1455 / 94.5 instead of the
 * 1440 / 87 a URL import of the same page gives. The API path never sees this
 * because headless Chromium has no scrollbar to begin with.
 *
 * Hiding first makes the measured width 1440, the compensation 0, and the two
 * capture paths agree. Measured 2026-09-08 in a 1440x900 tab on stripe.com:
 * scrollbar shown → main 1425, hidden → main 1440.
 */
import { describe, expect, it, vi } from 'vitest';
import { w2wHideScrollbars, w2wShowScrollbars } from './w2w';

describe('w2wHideScrollbars', () => {
  it('injects a style that removes the scrollbar from layout', async () => {
    const send = vi.fn().mockResolvedValue({});

    await w2wHideScrollbars({ send });

    expect(send).toHaveBeenCalledTimes(1);
    const [method, params] = send.mock.calls[0];
    expect(method).toBe('Runtime.evaluate');
    const expr = String(params.expression);
    // `scrollbar-width: none` is what actually gives the width back to the
    // layout; the -webkit rule alone only hides the paint.
    expect(expr).toMatch(/scrollbar-width:\s*none/);
    expect(expr).toContain('__w2w_hide_scrollbar');
    // The root scroller can be either element depending on the page's CSS.
    expect(expr).toMatch(/html/);
    expect(expr).toMatch(/body/);
  });

  it('never throws — a page that refuses the style is still worth capturing', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Target closed'));

    await expect(w2wHideScrollbars({ send })).resolves.toBeUndefined();
  });
});

describe('w2wShowScrollbars', () => {
  it('removes exactly the style it injected', async () => {
    const send = vi.fn().mockResolvedValue({});

    await w2wShowScrollbars({ send });

    const [method, params] = send.mock.calls[0];
    expect(method).toBe('Runtime.evaluate');
    expect(String(params.expression)).toContain('__w2w_hide_scrollbar');
    expect(String(params.expression)).toMatch(/remove\(\)/);
  });

  it('never throws — cleanup must not mask the capture result', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Target closed'));

    await expect(w2wShowScrollbars({ send })).resolves.toBeUndefined();
  });
});

describe('capture order', () => {
  it('hides the scrollbar BEFORE the first viewport override and the width measurement, and restores it in cleanup', () => {
    const sources = import.meta.glob('./w2w.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const source = sources['./w2w.ts'];

    const hide = source.indexOf('await w2wHideScrollbars(client)');
    const firstOverride = source.indexOf('"Emulation.setDeviceMetricsOverride"');
    const measure = source.indexOf('w2wScrollbarWidth(targetViewport');
    const restore = source.indexOf('await w2wShowScrollbars(client)');
    const clearOverride = source.indexOf('"Emulation.clearDeviceMetricsOverride"');

    expect(hide).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(-1);
    expect(hide).toBeLessThan(firstOverride);
    expect(hide).toBeLessThan(measure);
    // Restored alongside the other session-end cleanup, so the user's tab is
    // handed back exactly as it was.
    expect(restore).toBeGreaterThan(measure);
    expect(Math.abs(restore - clearOverride)).toBeLessThan(2000);
  });
});
