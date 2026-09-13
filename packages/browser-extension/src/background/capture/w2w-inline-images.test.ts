/**
 * Inline image payloads are not stored twice.
 *
 * A `<canvas>` bitmap (content-script export, tainted shot, WebGL shot) rides
 * in its node's `$url` as a `data:` URL. `w2wCollectImageUrls` used to hand
 * those to the asset harvest too: the resource tree cannot hold a data URL, so
 * each counted as a miss, the page-context fallback `fetch()`ed it, and the
 * payload was stored AGAIN under the whole data URL as its key. stripe.com's
 * `.w2w` went from 9MB to 27MB once the WebGL pass put 10MB of PNG into
 * `$url` — 20MB of it the same bytes twice more.
 *
 * The plugin reads a `data:` `$url` directly when the map has no entry
 * (nodes.ts / fills.ts), and builds each asset as `data:${mime};base64,${content}`
 * (main.ts) — the identical string for a canonical PNG/JPEG/GIF. Anything the
 * fetch-and-sniff path still normalises is left to it, because the plugin's
 * inline fallback would not: an uppercase `DATA:` scheme (the fallback is
 * case-sensitive), a mislabelled payload (webp bytes declared png — the sniff
 * routes them through the plugin's format conversion), non-canonical base64
 * (`fetch()` percent-decodes; the plugin's decoder does not), and every format
 * Figma cannot take as-is (webp, avif, svg).
 */
import { describe, expect, it, vi } from 'vitest';
import type { W2WFrameNode } from '@w2w/shared';
import type { CDPClient } from '../cdp/client';
import { w2wCollectImageUrls, w2wHarvestImageAssets, w2wIsInlineReadyImage } from './w2w';

const b64 = (bytes: string): string => btoa(bytes);

// Magic bytes w2wSniffImageMime recognises, padded to a few bytes of body.
const PNG = b64('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR');
const JPEG = b64('\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01');
const GIF = b64('GIF89a\x01\x00\x01\x00\x80\x00');
const WEBP = b64('RIFF\x24\x00\x00\x00WEBPVP8 ');

function frame(url: string | undefined, children: W2WFrameNode[] = []): W2WFrameNode {
  return {
    type: 'FRAME',
    tag: 'img',
    classList: [],
    attr: {},
    styles: {},
    ...(url ? { $url: url } : {}),
    children,
    x: 0, y: 0, width: 10, height: 10,
    quad: [0, 0, 10, 0, 10, 10, 0, 10],
  } as unknown as W2WFrameNode;
}

describe('w2wIsInlineReadyImage', () => {
  it.each([
    ['PNG', `data:image/png;base64,${PNG}`],
    ['JPEG', `data:image/jpeg;base64,${JPEG}`],
    ['GIF', `data:image/gif;base64,${GIF}`],
  ])('a canonical base64 %s whose bytes match its label is ready as-is', (_kind, url) => {
    expect(w2wIsInlineReadyImage(url)).toBe(true);
  });

  it.each([
    ['an http(s) URL', 'https://x.test/a.png'],
    ['an uppercase scheme — the plugin fallback is case-sensitive', `DATA:image/png;base64,${PNG}`],
    ['an uppercase base64 marker', `data:image/png;BASE64,${PNG}`],
    ['webp bytes labelled png — the sniff sends them through conversion', `data:image/png;base64,${WEBP}`],
    ['real webp — Figma cannot take it', `data:image/webp;base64,${WEBP}`],
    ['image/jpg — not the label the plugin builds', `data:image/jpg;base64,${JPEG}`],
    ['svg, base64', `data:image/svg+xml;base64,${b64('<svg xmlns="http://www.w3.org/2000/svg"/>')}`],
    ['svg, percent-encoded', 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'],
    ['a percent-encoded payload', `data:image/png;base64,${PNG.replace(/=/g, '%3D')}`],
    ['whitespace in the payload', `data:image/png;base64,${PNG.slice(0, 8)}\n${PNG.slice(8)}`],
    ['a payload missing its padding', `data:image/png;base64,${PNG.replace(/=+$/, '')}`],
    ['a charset parameter', `data:image/png;charset=utf-8;base64,${PNG}`],
  ])('keeps %s on the harvest path', (_why, url) => {
    // Guard the fixture itself: the padding case only means something if the
    // canonical payload actually carries padding.
    if (_why.startsWith('a payload missing')) expect(PNG.endsWith('=')).toBe(true);
    expect(w2wIsInlineReadyImage(url)).toBe(false);
  });
});

describe('w2wCollectImageUrls', () => {
  it('returns every image url except the inline payloads the plugin uses as they are', () => {
    const ready = `data:image/png;base64,${PNG}`;
    const webp = `data:image/webp;base64,${WEBP}`;
    const tree = frame(undefined, [
      frame('https://x.test/a.jpg'),
      frame(ready, [frame(`data:image/jpeg;base64,${JPEG}`)]),
      frame(webp),
      frame(`DATA:image/png;base64,${PNG}`),
    ]);

    expect(w2wCollectImageUrls(tree)).toEqual([
      'https://x.test/a.jpg',
      webp,
      `DATA:image/png;base64,${PNG}`,
    ]);
  });
});

describe('w2wHarvestImageAssets', () => {
  it('neither looks up, counts as missed, nor stores a canvas bitmap — so no page-context fetch is triggered for it', async () => {
    const send = vi.fn(async (method: string) => {
      if (method === 'Page.getResourceTree') {
        return { frameTree: { frame: { id: 'F1', url: 'https://x.test/' }, resources: [] } };
      }
      throw new Error(`unexpected CDP method ${method}`);
    });
    const assets: Record<string, { base64Encoded: boolean; content: string; mimeType: string }> = {};

    const result = await w2wHarvestImageAssets(
      { send } as unknown as CDPClient,
      [frame(undefined, [frame(`data:image/png;base64,${PNG}`)])],
      assets,
    );

    expect(result).toEqual({ extracted: 0, missed: 0 });
    expect(Object.keys(assets)).toHaveLength(0);
    expect(send.mock.calls.map((c) => c[0])).not.toContain('Page.getResourceContent');
  });
});
