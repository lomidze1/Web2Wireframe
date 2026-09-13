/**
 * Images over 4096px reach Figma instead of a grey placeholder.
 *
 * `figma.createImage` accepts PNG/JPEG/GIF up to 4096px in width and height and
 * throws on anything larger ("Image is too large") — it never downscales. The
 * extension captures at the display's native DPR, so on a Retina screen a
 * srcset resolves to its 2x candidate: apple.com's 3008×692 hero arrived as a
 * 6016×1384 JPEG and was drawn as "Image could not be decoded", while the same
 * capture's 2524×1160 promos rendered. The URL import (DPR 1) got the 1x file.
 *
 * The sandbox cannot resize (no canvas), so oversized images ride the existing
 * UI-iframe conversion that already turns WebP/AVIF into PNG/JPEG. Which images
 * to check is read off the converted tree — the exact keys the renderer asks
 * the assets map for — so every import flow is covered, including frames whose
 * assets arrive prefilled.
 */
import { describe, expect, it } from 'vitest';
import {
  FIGMA_MAX_IMAGE_DIMENSION,
  dataUriImageSize,
  exceedsFigmaImageLimit,
  fitWithinFigmaLimit,
  planOversizedImages,
} from '../utils/figmaImageLimit';
import type { WireframeFrame } from '../types';

const toB64 = (bytes: number[] | Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

function pngHeader(width: number, height: number): number[] {
  const b = new Array(33).fill(0);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((v, i) => (b[i] = v));
  b[16] = (width >>> 24) & 255; b[17] = (width >>> 16) & 255; b[18] = (width >>> 8) & 255; b[19] = width & 255;
  b[20] = (height >>> 24) & 255; b[21] = (height >>> 16) & 255; b[22] = (height >>> 8) & 255; b[23] = height & 255;
  return b;
}

function jpegHeader(width: number, height: number, appPadding = 0): number[] {
  const out = [0xff, 0xd8];
  let left = appPadding;
  while (left > 0) {
    // APP1 segments are capped at 65533 payload bytes — chain as many as needed.
    const payload = Math.min(left, 65533);
    out.push(0xff, 0xe1, ((payload + 2) >> 8) & 255, (payload + 2) & 255, ...new Array(payload).fill(0));
    left -= payload;
  }
  out.push(0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  // Some scan data, as any real JPEG has — parseImageSize ignores inputs under 24 bytes.
  out.push(0xff, 0xda, ...new Array(16).fill(0), 0xff, 0xd9);
  return out;
}

function gifHeader(width: number, height: number): number[] {
  return [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, width >> 8, height & 255, height >> 8, ...new Array(20).fill(0)];
}

const png = (w: number, h: number) => `data:image/png;base64,${toB64(pngHeader(w, h))}`;
const jpeg = (w: number, h: number, pad = 0) => `data:image/jpeg;base64,${toB64(jpegHeader(w, h, pad))}`;
const gif = (w: number, h: number) => `data:image/gif;base64,${toB64(gifHeader(w, h))}`;

describe('dataUriImageSize', () => {
  it('reads PNG, JPEG and GIF sizes from their headers', () => {
    expect(dataUriImageSize(png(800, 600))).toEqual({ width: 800, height: 600 });
    expect(dataUriImageSize(jpeg(6016, 1384))).toEqual({ width: 6016, height: 1384 });
    expect(dataUriImageSize(gif(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('finds a JPEG frame header that sits past a large APP segment', () => {
    expect(dataUriImageSize(jpeg(5000, 3000, 300_000))).toEqual({ width: 5000, height: 3000 });
  });

  it('answers null for formats it cannot read and for broken input', () => {
    expect(dataUriImageSize('data:image/webp;base64,UklGRgAAAABXRUJQ')).toBeNull();
    expect(dataUriImageSize('data:image/svg+xml,%3Csvg%2F%3E')).toBeNull();
    expect(dataUriImageSize('https://x.test/a.jpg')).toBeNull();
    expect(dataUriImageSize('data:image/png;base64,@@@')).toBeNull();
  });
});

describe('exceedsFigmaImageLimit', () => {
  it('flags anything wider or taller than 4096', () => {
    expect(FIGMA_MAX_IMAGE_DIMENSION).toBe(4096);
    expect(exceedsFigmaImageLimit(jpeg(6016, 1384))).toBe(true);
    expect(exceedsFigmaImageLimit(png(4097, 1))).toBe(true);
    expect(exceedsFigmaImageLimit(png(1, 4097))).toBe(true);
  });

  it('passes 4096 exactly and everything it cannot measure', () => {
    expect(exceedsFigmaImageLimit(png(4096, 4096))).toBe(false);
    expect(exceedsFigmaImageLimit('data:image/svg+xml,%3Csvg%2F%3E')).toBe(false);
    expect(exceedsFigmaImageLimit('data:image/webp;base64,UklGRgAAAABXRUJQ')).toBe(false);
    expect(exceedsFigmaImageLimit('https://x.test/a.jpg')).toBe(false);
  });
});

describe('fitWithinFigmaLimit', () => {
  it('scales the longest side to 4096, keeping the aspect ratio', () => {
    expect(fitWithinFigmaLimit(6016, 1384)).toEqual({ width: 4096, height: 942 });
    expect(fitWithinFigmaLimit(1000, 5000)).toEqual({ width: 819, height: 4096 });
  });

  it('never upscales and never collapses to zero', () => {
    expect(fitWithinFigmaLimit(4096, 100)).toEqual({ width: 4096, height: 100 });
    expect(fitWithinFigmaLimit(10, 10)).toEqual({ width: 10, height: 10 });
    expect(fitWithinFigmaLimit(100_000, 1)).toEqual({ width: 4096, height: 1 });
  });
});

type Tree = Record<string, unknown>;
function frame(tree: Tree, assets?: Record<string, string>): WireframeFrame {
  return { viewportWidth: 1440, viewportHeight: 900, tree: tree as never, ...(assets ? { assets } : {}) };
}
const node = (extra: Tree = {}, children: Tree[] = []): Tree => ({ type: 'FRAME', children, ...extra });

describe('planOversizedImages', () => {
  const BIG = jpeg(6016, 1384);
  const SMALL = jpeg(2524, 1160);

  it('checks the urls the renderer will ask for — img and background, from assets or inline', () => {
    const inlineCanvas = png(5000, 100);
    const plan = planOversizedImages([
      frame(
        node({}, [
          node({ imageUrl: 'https://x.test/hero_2x.jpg' }),
          node({ imageUrl: 'https://x.test/promo.jpg' }),
          node({ fills: [{ type: 'IMAGE_PLACEHOLDER', imageUrl: 'https://x.test/bg.jpg' }] }),
          node({ imageUrl: inlineCanvas }),
        ]),
        { 'https://x.test/hero_2x.jpg': BIG, 'https://x.test/promo.jpg': SMALL, 'https://x.test/bg.jpg': BIG },
      ),
    ]);
    expect(plan.map((p) => p.url).sort()).toEqual(
      ['https://x.test/bg.jpg', 'https://x.test/hero_2x.jpg', inlineCanvas].sort(),
    );
    expect(plan.find((p) => p.url === 'https://x.test/hero_2x.jpg')!.dataUri).toBe(BIG);
    expect(plan.find((p) => p.url === inlineCanvas)!.dataUri).toBe(inlineCanvas);
  });

  it('converts a url shared by several viewport frames once, and remembers every frame', () => {
    const tree = node({}, [node({ imageUrl: 'https://x.test/hero_2x.jpg' })]);
    const assets = { 'https://x.test/hero_2x.jpg': BIG };
    const plan = planOversizedImages([frame(tree, assets), frame(tree, assets)]);
    expect(plan).toHaveLength(1);
    expect(plan[0].frameIdxs).toEqual([0, 1]);
  });

  it('covers frames whose assets arrived prefilled, with no capturedData', () => {
    const f = frame(node({ imageUrl: 'https://x.test/legacy.jpg' }), { 'https://x.test/legacy.jpg': BIG });
    expect(f.capturedData).toBeUndefined();
    expect(planOversizedImages([f]).map((p) => p.url)).toEqual(['https://x.test/legacy.jpg']);
  });

  it('uses the fill url verbatim, so quoted and multi-layer backgrounds keep their map key', () => {
    const quoted = 'https://x.test/a b (1).jpg';
    const plan = planOversizedImages([
      frame(node({ fills: [{ type: 'GRADIENT_LINEAR' }, { type: 'IMAGE_PLACEHOLDER', imageUrl: quoted }] }), { [quoted]: BIG }),
    ]);
    expect(plan.map((p) => p.url)).toEqual([quoted]);
  });

  it('leaves small, svg, unknown and missing images alone', () => {
    const plan = planOversizedImages([
      frame(
        node({}, [
          node({ imageUrl: 'https://x.test/small.jpg' }),
          node({ imageUrl: 'data:image/svg+xml,%3Csvg%2F%3E' }),
          node({ imageUrl: 'https://x.test/photo.webp' }),
          node({ imageUrl: 'https://x.test/never-harvested.jpg' }),
        ]),
        { 'https://x.test/small.jpg': SMALL, 'https://x.test/photo.webp': 'data:image/webp;base64,UklGRgAAAABXRUJQ' },
      ),
    ]);
    expect(plan).toEqual([]);
  });
});
