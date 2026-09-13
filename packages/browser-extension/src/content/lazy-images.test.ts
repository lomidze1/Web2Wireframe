/**
 * Lazy images load before the DOM is read.
 *
 * A `loading="lazy"` `<img>` the auto-scroll could not reach — inside a
 * horizontal carousel, or under a `visibility:hidden` stack — is still deferred
 * when the extractor runs: `complete` false, `currentSrc` empty. The `$url`
 * then falls back to `<img src>`, a URL the browser never requested, and no
 * asset lookup can find it: stripe.com's URL import drew 7 grey placeholders.
 *
 * `waitForRenderReadiness` already awaited `img.decode()` on pending images —
 * but decode() does not start a deferred lazy load. Measured on stripe.com:
 * 0 of 11 loaded, and the wait burnt its whole 2.5s cap. Switching them to
 * `loading="eager"` resumes the load (the browser picks the `<source>` it would
 * have picked anyway): 11 of 11 loaded, every `currentSrc` in the resource tree
 * with HTTP 200 — and with images still deferred left out of the wait, it took
 * 183ms instead of 2502ms.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imagesToAwait, promoteLazyImages, waitForRenderReadiness } from './extractor';

function img(opts: {
  loading?: 'lazy' | 'eager';
  complete?: boolean;
  naturalWidth?: number;
  box?: boolean | 'throws';
  src?: string;
  decode?: () => Promise<void>;
} = {}): HTMLImageElement {
  const el = document.createElement('img');
  if (opts.loading) el.setAttribute('loading', opts.loading);
  el.setAttribute('src', opts.src ?? 'https://x.test/fallback.jpg');
  Object.defineProperty(el, 'complete', { value: opts.complete ?? false, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: opts.naturalWidth ?? 0, configurable: true });
  if (opts.box === 'throws') {
    el.getBoundingClientRect = () => { throw new Error('detached'); };
  } else {
    const size = opts.box === false ? 0 : 100;
    el.getBoundingClientRect = () => ({ width: size, height: size, left: 0, top: 0, right: size, bottom: size, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  }
  el.decode = opts.decode ?? (() => Promise.resolve());
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('promoteLazyImages', () => {
  it('switches a lazy image that is still pending and has a box to eager', () => {
    const lazy = img({ loading: 'lazy' });
    expect(promoteLazyImages()).toBe(1);
    expect(lazy.getAttribute('loading')).toBe('eager');
  });

  it('leaves loaded, eager, unmarked and box-less images alone', () => {
    const loaded = img({ loading: 'lazy', complete: true, naturalWidth: 640 });
    const eager = img({ loading: 'eager' });
    const unmarked = img();
    const noBox = img({ loading: 'lazy', box: false }); // display:none subtree — dropped anyway
    expect(promoteLazyImages()).toBe(0);
    expect(loaded.getAttribute('loading')).toBe('lazy');
    expect(eager.getAttribute('loading')).toBe('eager');
    expect(unmarked.hasAttribute('loading')).toBe(false);
    expect(noBox.getAttribute('loading')).toBe('lazy');
  });

  it('counts complete-but-empty (naturalWidth 0) as pending and promotes it', () => {
    const broken = img({ loading: 'lazy', complete: true, naturalWidth: 0 });
    expect(promoteLazyImages()).toBe(1);
    expect(broken.getAttribute('loading')).toBe('eager');
  });

  it('promotes at most 50, in document order — a gallery cannot flood the live tab', () => {
    const all = Array.from({ length: 60 }, () => img({ loading: 'lazy' }));
    expect(promoteLazyImages()).toBe(50);
    expect(all.slice(0, 50).every((i) => i.getAttribute('loading') === 'eager')).toBe(true);
    expect(all.slice(50).every((i) => i.getAttribute('loading') === 'lazy')).toBe(true);
  });

  it('never throws — an image that cannot be measured is skipped', () => {
    const odd = img({ loading: 'lazy', box: 'throws' });
    const fine = img({ loading: 'lazy' });
    expect(() => promoteLazyImages()).not.toThrow();
    expect(odd.getAttribute('loading')).toBe('lazy');
    expect(fine.getAttribute('loading')).toBe('eager');
  });
});

describe('imagesToAwait', () => {
  it('awaits pending eager and unmarked images, never one the browser is still deferring', () => {
    const deferred = img({ loading: 'lazy', box: false });
    const eager = img({ loading: 'eager' });
    const unmarked = img();
    const loaded = img({ complete: true, naturalWidth: 10 });
    expect(imagesToAwait()).toEqual([eager, unmarked]);
    expect(imagesToAwait()).not.toContain(deferred);
    expect(imagesToAwait()).not.toContain(loaded);
  });

  it('is capped at 50', () => {
    Array.from({ length: 60 }, () => img({ loading: 'eager' }));
    expect(imagesToAwait()).toHaveLength(50);
  });
});

describe('waitForRenderReadiness', () => {
  it('does not sit out the 2.5s cap on a lazy image the browser keeps deferring', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'fonts', { value: { status: 'loaded' }, configurable: true });
    img({ loading: 'lazy', box: false, decode: () => new Promise<void>(() => undefined) }); // never settles
    const promoted = img({ loading: 'lazy' });

    let settled = false;
    const done = waitForRenderReadiness().then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(50);

    expect(settled).toBe(true);
    expect(promoted.getAttribute('loading')).toBe('eager');
    await done;
  });

  it('promotes before it picks what to await', () => {
    const sources = import.meta.glob('./extractor.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const source = sources['./extractor.ts'];
    const body = source.slice(source.indexOf('function waitForRenderReadiness'));
    const promote = body.indexOf('promoteLazyImages()');
    const pick = body.indexOf('imagesToAwait()');
    expect(promote).toBeGreaterThan(-1);
    expect(pick).toBeGreaterThan(promote);
  });
});
