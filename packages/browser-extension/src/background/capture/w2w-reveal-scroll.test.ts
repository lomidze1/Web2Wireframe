/**
 * The extension's auto-scroll records reversible scroll reveals, with the
 * expression the API's URL import runs.
 *
 * Webflow IX2 / GSAP fade elements out again once they are scrolled past, so a
 * scroll → back-to-top → read-once capture saw them all at `opacity: 0` and the
 * plugin dropped them (vaayu.tech: 58 of 83). The shared expression marks the
 * elements that were shown for the extractor. The extension used its own copy
 * of the scroll loop (`legacy.ts`, fixed 400px step) — sharing one expression
 * keeps the paths from drifting again.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  W2W_SCROLL_AND_SAMPLE_EXPRESSION,
  W2W_SCROLL_AND_SAMPLE_TIMEOUT_MS,
} from '@w2w/shared';
import { w2wAutoScrollAndSampleReveals } from './w2w';

describe('w2wAutoScrollAndSampleReveals', () => {
  it('evaluates the shared expression and awaits its promise', async () => {
    const send = vi.fn().mockResolvedValue({});

    await w2wAutoScrollAndSampleReveals({ send });

    expect(send).toHaveBeenCalledTimes(1);
    const [method, params] = send.mock.calls[0];
    expect(method).toBe('Runtime.evaluate');
    expect(params.expression).toBe(W2W_SCROLL_AND_SAMPLE_EXPRESSION);
    expect(params.awaitPromise).toBe(true);
    expect(params.timeout).toBe(W2W_SCROLL_AND_SAMPLE_TIMEOUT_MS);
  });

  it('never throws, and still returns the page to the top', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('Target closed'))
      .mockResolvedValue({});

    await expect(w2wAutoScrollAndSampleReveals({ send })).resolves.toBeUndefined();
    expect(send.mock.calls[1][1].expression).toBe('window.scrollTo(0, 0)');
  });
});
