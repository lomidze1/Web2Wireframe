/**
 * The content script can be loaded twice in the same page: once by the
 * manifest, once by `w2wEnsureContentScript`'s `executeScript` fallback (e.g.
 * a capture started while the page was still loading). A second listener
 * would answer every message twice, so registration is guarded by a window
 * flag.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let addListener: ReturnType<typeof vi.fn>;

beforeEach(() => {
  delete window.__w2wContentScriptLoaded;
  addListener = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: { onMessage: { addListener }, sendMessage: vi.fn() },
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__w2wContentScriptLoaded;
});

describe('content script double-injection guard', () => {
  it('registers the message listener only once when loaded twice', async () => {
    await import('./index');
    vi.resetModules();
    await import('./index');

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(window.__w2wContentScriptLoaded).toBe(true);
  });
});
