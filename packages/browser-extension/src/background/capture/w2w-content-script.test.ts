/**
 * Orphaned content script after an extension reload / auto-update.
 *
 * Tabs that were open before the reload keep the OLD instance's content
 * script, which can no longer receive messages. The capture never reloads the
 * page, so its first `EXTRACT_DOM` threw Chrome's raw "Could not establish
 * connection. Receiving end does not exist." straight into the popup.
 *
 * `w2wEnsureContentScript` pings first, injects `content/index.js` when nobody
 * answers, and turns an impossible injection into a human message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  w2wEnsureContentScript,
  W2W_REFRESH_PAGE_MESSAGE,
  W2W_RESTRICTED_PAGE_MESSAGE,
} from './w2w';

const NO_RECEIVER = 'Could not establish connection. Receiving end does not exist.';

let sendMessage: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendMessage = vi.fn();
  executeScript = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('chrome', {
    tabs: { sendMessage },
    scripting: { executeScript },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('w2wEnsureContentScript', () => {
  it('does not inject when the content script answers the ping', async () => {
    sendMessage.mockResolvedValue({ status: 'ready' });

    await w2wEnsureContentScript(7);

    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'PING' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('injects content/index.js when nobody is listening, then re-pings', async () => {
    sendMessage
      .mockRejectedValueOnce(new Error(NO_RECEIVER))
      .mockResolvedValueOnce({ status: 'ready' });

    await expect(w2wEnsureContentScript(7)).resolves.toBeUndefined();

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['content/index.js'],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('injects when the ping resolves without a ready status', async () => {
    sendMessage
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ status: 'ready' });

    await w2wEnsureContentScript(7);

    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it('explains chrome:// pages instead of leaking the raw error', async () => {
    sendMessage.mockRejectedValue(new Error(NO_RECEIVER));
    executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));

    await expect(w2wEnsureContentScript(7)).rejects.toThrow(W2W_RESTRICTED_PAGE_MESSAGE);
  });

  it('explains the Chrome Web Store instead of leaking the raw error', async () => {
    sendMessage.mockRejectedValue(new Error(NO_RECEIVER));
    executeScript.mockRejectedValue(new Error('The extensions gallery cannot be scripted.'));

    await expect(w2wEnsureContentScript(7)).rejects.toThrow(W2W_RESTRICTED_PAGE_MESSAGE);
  });

  it('asks for a refresh when injection fails for any other reason', async () => {
    sendMessage.mockRejectedValue(new Error(NO_RECEIVER));
    executeScript.mockRejectedValue(new Error('Frame with ID 0 was removed.'));

    await expect(w2wEnsureContentScript(7)).rejects.toThrow(W2W_REFRESH_PAGE_MESSAGE);
  });

  it('asks for a refresh when the injected script still does not answer', async () => {
    sendMessage.mockRejectedValue(new Error(NO_RECEIVER));

    const err = await w2wEnsureContentScript(7).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(W2W_REFRESH_PAGE_MESSAGE);
    expect((err as Error).message).not.toContain('Receiving end');
    expect(executeScript).toHaveBeenCalledTimes(1);
  });
});

describe('capture order', () => {
  /**
   * Source-order guard (same pattern as w2w-hydration.test.ts): the ensure
   * must run before the CDP attach (so restricted pages fail before the
   * debugger infobar appears) and before the first content-script message.
   */
  it('ensures the content script BEFORE attaching CDP and extracting the DOM', () => {
    const sources = import.meta.glob('./w2w.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const source = sources['./w2w.ts'];

    const ensure = source.indexOf('await w2wEnsureContentScript(tabId)');
    const attach = source.indexOf('await createCDPClient(tabId)');
    const extract = source.indexOf('type: "EXTRACT_DOM"');

    expect(ensure).toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(-1);
    expect(extract).toBeGreaterThan(-1);
    expect(ensure).toBeLessThan(attach);
    expect(attach).toBeLessThan(extract);
  });
});
