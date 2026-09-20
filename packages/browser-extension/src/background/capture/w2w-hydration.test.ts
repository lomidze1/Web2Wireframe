/**
 * The extension capture waits for hydration, like the API path does.
 *
 * `waitForHydration` landed on the API's Puppeteer session only. The
 * extension's own capture still went `setTimeout(500)` → `autoScrollPage`,
 * so the scroll-reveal loss it was written for — glinc.io dropping 57% of its
 * nodes in 10 runs out of 24 — stayed live for every extension capture, while
 * the bug read as fixed.
 *
 * Both paths now run the SAME expression from `@w2w/shared`, so they cannot
 * drift again.
 */
import { describe, expect, it, vi } from 'vitest';
import { W2W_HYDRATION_EXPRESSION, W2W_HYDRATION_TIMEOUT_MS } from '@w2w/shared';
import { w2wWaitForHydration } from './w2w';

describe('w2wWaitForHydration', () => {
  it('evaluates the shared expression and awaits its promise', async () => {
    const send = vi.fn().mockResolvedValue({});

    await w2wWaitForHydration({ send });

    expect(send).toHaveBeenCalledTimes(1);
    const [method, params] = send.mock.calls[0];
    expect(method).toBe('Runtime.evaluate');
    expect(params.expression).toBe(W2W_HYDRATION_EXPRESSION);
    expect(params.awaitPromise).toBe(true);
  });

  it('bounds the wait, so a page that never settles cannot hang the capture', async () => {
    const send = vi.fn().mockResolvedValue({});

    await w2wWaitForHydration({ send });

    const { timeout } = send.mock.calls[0][1];
    expect(timeout).toBe(W2W_HYDRATION_TIMEOUT_MS);
    // The in-page waits (5000 load + 3000 idle) must fit inside it, or the
    // outer bound is not the one that wins.
    expect(timeout).toBeGreaterThan(5000 + 3000);
  });

  it('never throws — an unhydrated page is still worth capturing', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Target closed'));

    await expect(w2wWaitForHydration({ send })).resolves.toBeUndefined();
  });
});

describe('capture order', () => {
  /**
   * A source-order guard, in the spirit of the API's `networkidle0` one. The
   * wait is worthless after the scroll: `w2wAutoScrollAndSampleReveals` is what triggers the
   * IntersectionObservers, so they have to exist first. Nothing else can pin
   * an ordering that lives inside a 900-line handler.
   */
  it('waits for hydration BEFORE auto-scrolling', () => {
    // Read through Vite rather than node:fs — this package's tsconfig carries
    // no node types.
    const sources = import.meta.glob('./w2w.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const source = sources['./w2w.ts'];

    const hydrate = source.indexOf('await w2wWaitForHydration(client)');
    const scroll = source.indexOf('await w2wAutoScrollAndSampleReveals(client)');

    expect(hydrate).toBeGreaterThan(-1);
    expect(scroll).toBeGreaterThan(-1);
    expect(hydrate).toBeLessThan(scroll);
  });
});
