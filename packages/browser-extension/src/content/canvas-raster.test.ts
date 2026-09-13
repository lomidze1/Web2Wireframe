/**
 * `<canvas>` rasterization — h2d parity plus the guards h2d lacks.
 *
 * stripe.com's "What's happening" carousel paints every card into a single
 * `<canvas class="squeezy-carousel__canvas">` (CSS 1232x460). The eight source
 * images live only in a `display:none` mobile carousel and never load, so the
 * canvas bitmap is the ONLY pixel source on the page — and the extractor, which
 * read `$url` for `<img>` and `<video>` only, emitted an empty frame. The
 * imported section came out blank.
 *
 * h2d exports the bitmap (`km` -> `Sm` -> `Wa` -> `Em` in its content script),
 * which is what these helpers port. The tests also pin four hardening rules
 * h2d does NOT have, and which matter because this code runs inside a live
 * capture on a page we do not control:
 *
 *   1. a tainted canvas throws SecurityError — it must yield null, never throw
 *   2. the WebGL rAF read must not hang when requestAnimationFrame never fires
 *      (a hidden tab stops rAF entirely; h2d's promise would never settle)
 *   3. zero-sized canvases are skipped
 *   4. an implausibly large data URL is dropped rather than shipped
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  canvasExportType,
  rasterizeCanvas,
  rasterizeCanvases,
  MAX_CANVAS_DATA_URL_BYTES,
  MAX_CANVAS_TOTAL_BYTES,
} from './canvas-raster';

// ---------------------------------------------------------------------------
// Fake canvas — happy-dom has no canvas implementation, and these helpers only
// ever touch getContext / toDataURL / width / height.
// ---------------------------------------------------------------------------

interface FakeOptions {
  width?: number;
  height?: number;
  /** RGBA bytes returned by getImageData; omit for a canvas with no 2D context. */
  pixels?: number[];
  /** getImageData throws (tainted canvas). */
  taintedRead?: boolean;
  /** toDataURL throws (tainted canvas). */
  taintedExport?: boolean;
  /** Present when the canvas holds a WebGL context instead of a 2D one. */
  webgl?: { preserveDrawingBuffer: boolean };
  dataUrl?: string;
}

function fakeCanvas(o: FakeOptions = {}): HTMLCanvasElement {
  const width = o.width ?? 100;
  const height = o.height ?? 100;
  const calls: string[] = [];

  const ctx2d = o.webgl
    ? null
    : {
        getImageData: (): { data: number[] } => {
          if (o.taintedRead) {
            const err = new Error('Tainted canvases may not be exported.');
            err.name = 'SecurityError';
            throw err;
          }
          // Default: one fully opaque pixel.
          return { data: o.pixels ?? [0, 0, 0, 255] };
        },
      };

  const canvas = {
    width,
    height,
    __calls: calls,
    getContext(type: string): unknown {
      calls.push(type);
      if (type === 'webgl2' || type === 'webgl') {
        return o.webgl
          ? { getContextAttributes: () => ({ preserveDrawingBuffer: o.webgl!.preserveDrawingBuffer }) }
          : null;
      }
      if (type === '2d') return ctx2d;
      return null;
    },
    toDataURL(type?: string, quality?: number): string {
      if (o.taintedExport) {
        const err = new Error('Tainted canvases may not be exported.');
        err.name = 'SecurityError';
        throw err;
      }
      calls.push(`toDataURL:${type}:${quality ?? ''}`);
      return o.dataUrl ?? `data:${type};base64,AAAA`;
    },
  };

  return canvas as unknown as HTMLCanvasElement;
}

const callsOf = (c: HTMLCanvasElement): string[] =>
  (c as unknown as { __calls: string[] }).__calls;

/** RGBA byte array of `count` pixels, all with the given alpha. */
const pixels = (count: number, alpha: number): number[] =>
  Array.from({ length: count * 4 }, (_, i) => (i % 4 === 3 ? alpha : 10));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('canvasExportType — h2d Em', () => {
  it('picks PNG for a small opaque canvas (under 1 megapixel)', () => {
    const type = canvasExportType(fakeCanvas({ width: 400, height: 300, pixels: pixels(4, 255) }));
    expect(type).toEqual({ type: 'image/png' });
  });

  it('picks PNG when any pixel is translucent, however large the canvas', () => {
    const type = canvasExportType(fakeCanvas({ width: 2464, height: 920, pixels: pixels(4, 128) }));
    expect(type).toEqual({ type: 'image/png' });
  });

  it('picks JPEG for a fully opaque canvas over 1 megapixel', () => {
    const type = canvasExportType(fakeCanvas({ width: 2464, height: 920, pixels: pixels(4, 255) }));
    expect(type).toEqual({ type: 'image/jpeg', quality: 0.75 });
  });

  it('skips a fully transparent canvas — nothing was ever painted', () => {
    expect(canvasExportType(fakeCanvas({ pixels: pixels(8, 0) }))).toBeNull();
  });

  it('assumes alpha for a WebGL canvas, whose pixels it cannot read', () => {
    const type = canvasExportType(
      fakeCanvas({ width: 2783, height: 1277, webgl: { preserveDrawingBuffer: true } }),
    );
    expect(type).toEqual({ type: 'image/png' });
  });

  it('returns null instead of throwing when the canvas is tainted', () => {
    expect(canvasExportType(fakeCanvas({ taintedRead: true }))).toBeNull();
  });
});

describe('rasterizeCanvas', () => {
  it('exports a 2D canvas straight away', async () => {
    const canvas = fakeCanvas({ width: 400, height: 300, pixels: pixels(4, 255) });
    const url = await rasterizeCanvas(canvas);

    expect(url).toBe('data:image/png;base64,AAAA');
    expect(callsOf(canvas)).toContain('toDataURL:image/png:');
  });

  it('skips a zero-sized canvas without touching it', async () => {
    const canvas = fakeCanvas({ width: 0, height: 150 });
    expect(await rasterizeCanvas(canvas)).toBeNull();
    expect(callsOf(canvas)).toEqual([]);
  });

  it('returns null for a tainted canvas rather than throwing', async () => {
    await expect(rasterizeCanvas(fakeCanvas({ taintedExport: true }))).resolves.toBeNull();
    await expect(rasterizeCanvas(fakeCanvas({ taintedRead: true }))).resolves.toBeNull();
  });

  it('reads a WebGL canvas inside requestAnimationFrame when the buffer is not preserved', async () => {
    const raf = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        setTimeout(() => cb(0), 0);
        return 1;
      });

    const canvas = fakeCanvas({ webgl: { preserveDrawingBuffer: false } });
    const url = await rasterizeCanvas(canvas);

    expect(raf).toHaveBeenCalled();
    expect(url).toBe('data:image/png;base64,AAAA');
  });

  it('reads a WebGL canvas directly when it preserves its drawing buffer', async () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');

    const url = await rasterizeCanvas(fakeCanvas({ webgl: { preserveDrawingBuffer: true } }));

    expect(raf).not.toHaveBeenCalled();
    expect(url).toBe('data:image/png;base64,AAAA');
  });

  it('gives up instead of hanging when requestAnimationFrame never fires', async () => {
    // A hidden tab stops rAF. h2d's promise would never settle and the whole
    // capture would stall behind it.
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);

    const url = await rasterizeCanvas(fakeCanvas({ webgl: { preserveDrawingBuffer: false } }));

    expect(url).toBeNull();
  });

  it('drops a data URL larger than the payload budget', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_CANVAS_DATA_URL_BYTES);

    const url = await rasterizeCanvas(
      fakeCanvas({ width: 400, height: 300, pixels: pixels(4, 255), dataUrl: huge }),
    );

    expect(url).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

/**
 * The map outlives the page.
 *
 * The capture emulates each viewport in place — deliberately, with no
 * `Page.reload` ("Emulation reflows the page live", w2w.ts) — so both the
 * canvas ELEMENTS and this module-level WeakMap survive into the next
 * viewport. A canvas that exported at 1440 and then fails at 375 (the WebGL
 * read gives up after a 200ms rAF timeout, which is flaky under load) keeps
 * its previous entry, and the mobile frame renders the desktop bitmap.
 *
 * Invisible until the renderer actually painted these bitmaps — every canvas
 * was a grey placeholder before — so it has to be pinned now.
 */
describe('rasterizeCanvases across viewports', () => {
  function withCanvases(list: HTMLCanvasElement[]): void {
    vi.spyOn(document, 'querySelectorAll').mockReturnValue(
      list as unknown as NodeListOf<Element>,
    );
  }

  it('drops a stale bitmap when the re-read fails', async () => {
    const canvas = fakeCanvas({ dataUrl: 'data:image/png;base64,DESKTOP' });
    const map = new WeakMap<HTMLCanvasElement, string>();

    withCanvases([canvas]);
    await rasterizeCanvases(map);
    expect(map.get(canvas)).toBe('data:image/png;base64,DESKTOP');

    // Same element, next viewport, export now fails.
    const failing = fakeCanvas({ taintedExport: true });
    Object.defineProperty(canvas, 'toDataURL', {
      value: failing.toDataURL.bind(failing),
      configurable: true,
    });

    await rasterizeCanvases(map);

    expect(map.has(canvas)).toBe(false);
  });

  it('keeps the fresh bitmap when the re-read succeeds', async () => {
    const canvas = fakeCanvas({ dataUrl: 'data:image/png;base64,DESKTOP' });
    const map = new WeakMap<HTMLCanvasElement, string>();

    withCanvases([canvas]);
    await rasterizeCanvases(map);

    Object.defineProperty(canvas, 'toDataURL', {
      value: () => 'data:image/png;base64,MOBILE',
      configurable: true,
    });
    await rasterizeCanvases(map);

    expect(map.get(canvas)).toBe('data:image/png;base64,MOBILE');
  });

  it('one canvas failing does not stop the rest', async () => {
    const bad = fakeCanvas({ taintedExport: true });
    const good = fakeCanvas({ dataUrl: 'data:image/png;base64,OK' });
    const map = new WeakMap<HTMLCanvasElement, string>();

    withCanvases([bad, good]);
    await rasterizeCanvases(map);

    expect(map.has(bad)).toBe(false);
    expect(map.get(good)).toBe('data:image/png;base64,OK');
  });

  it('resolves when the document cannot be queried at all', async () => {
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw new Error('detached');
    });

    await expect(rasterizeCanvases(new WeakMap())).resolves.toBeUndefined();
  });
});

/**
 * Two hardening rules that only matter now that these bitmaps actually render.
 *
 * The payload: a data URL rides in `$url`, once per node, and the same canvas
 * is captured once per viewport. At the old 12 MB ceiling a single canvas over
 * three viewports was 36 MB before the rest of the page, against the API's
 * 50 MB body limit — and a 413 fails the WHOLE import, where a dropped canvas
 * costs one image.
 *
 * The probe: `getContext` is a claim, not a query. On a canvas the page has not
 * initialized yet, the first type asked for is the type it is stuck with — and
 * this runs inside the user's real browsing tab, on a page we do not control.
 */
describe('canvas payload budget', () => {
  it('drops a canvas past the per-canvas ceiling', async () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_CANVAS_DATA_URL_BYTES);
    expect(await rasterizeCanvas(fakeCanvas({ dataUrl: huge }))).toBeNull();
  });

  it('keeps a ceiling small enough for three viewports to fit the body limit', () => {
    // 50 MB body, and the same canvas is serialized once per viewport.
    expect(MAX_CANVAS_DATA_URL_BYTES * 3).toBeLessThan(20 * 1024 * 1024);
  });

  it('stops once the page total is spent, and keeps what came first', async () => {
    const big = (n: number) =>
      fakeCanvas({ dataUrl: 'data:image/png;base64,' + String(n).repeat(3 * 1024 * 1024) });
    const canvases = [big(1), big(2), big(3), big(4)];
    vi.spyOn(document, 'querySelectorAll').mockReturnValue(
      canvases as unknown as NodeListOf<Element>,
    );
    const map = new WeakMap<HTMLCanvasElement, string>();

    await rasterizeCanvases(map);

    const kept = canvases.filter((c) => map.has(c));
    const bytes = kept.reduce((sum, c) => sum + map.get(c)!.length, 0);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(canvases.length);
    expect(bytes).toBeLessThanOrEqual(MAX_CANVAS_TOTAL_BYTES);
    // First come, first served — the ones the page painted first.
    expect(map.has(canvases[0])).toBe(true);
  });
});

describe('the context probe claims the least harmful type', () => {
  it('asks for 2D before WebGL', async () => {
    // A canvas the page has not touched yet: whichever type we ask for first is
    // the one it is stuck with. `getContext('2d')` is by far the most common
    // later call, so claiming 2D leaves that working; claiming webgl2 — the old
    // order — made the page's own `getContext('2d')` return null forever.
    const canvas = fakeCanvas();
    await rasterizeCanvas(canvas);

    const contextCalls = callsOf(canvas).filter((c) => !c.startsWith('toDataURL'));
    expect(contextCalls[0]).toBe('2d');
  });

  it('never probes WebGL on a canvas that already answers 2D', async () => {
    const canvas = fakeCanvas();
    await rasterizeCanvas(canvas);

    expect(callsOf(canvas)).not.toContain('webgl2');
    expect(callsOf(canvas)).not.toContain('webgl');
  });

  it('still finds the WebGL context when 2D is not the canvas kind', async () => {
    // A canvas holding a WebGL context returns null for '2d' without creating
    // anything, so the WebGL branch is reached exactly as before.
    const canvas = fakeCanvas({ webgl: { preserveDrawingBuffer: true } });
    const url = await rasterizeCanvas(canvas);

    expect(callsOf(canvas)).toContain('webgl2');
    expect(url).toBeTruthy();
  });
});


// ---------------------------------------------------------------------------
// Empty WebGL buffer
// ---------------------------------------------------------------------------

/**
 * Stub `document.createElement('canvas')` — the scratch canvas the WebGL
 * emptiness probe draws onto. happy-dom has no canvas implementation, so
 * without this the probe cannot read anything back.
 */
function stubScratchCanvas(data: number[] | 'throws'): void {
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return real(tag);
    return {
      width: 0,
      height: 0,
      getContext: (type: string) =>
        type === '2d'
          ? {
              drawImage: (): void => {},
              getImageData: (): { data: number[] } => {
                if (data === 'throws') {
                  const err = new Error('Tainted canvases may not be exported.');
                  err.name = 'SecurityError';
                  throw err;
                }
                return { data };
              },
            }
          : null,
    } as unknown as HTMLElement;
  }) as typeof document.createElement);
}

describe('canvasExportType — empty WebGL drawing buffer', () => {
  /**
   * A WebGL canvas cannot be read through `getImageData`, so h2d's `Em` assumes
   * it has content. Measured on stripe.com 2026-09-08: with
   * `prefers-reduced-motion: reduce` three.js stops rendering, the buffer
   * (`preserveDrawingBuffer: false`) is never repainted, and five canvases —
   * the hero wave, the globe, the data-viz burst, both developer waves —
   * exported as 100%-transparent PNGs. Worse than losing them: a transparent
   * `$url` also SUPPRESSES the `captureTaintedCanvases` screenshot fallback,
   * which only fires on a node with no `$url` at all.
   *
   * Drawing the canvas onto a scratch 2D canvas reads back what WebGL will not.
   */
  it('skips a WebGL canvas whose buffer is empty', () => {
    stubScratchCanvas(pixels(8, 0));

    const type = canvasExportType(
      fakeCanvas({ width: 1393, height: 761, webgl: { preserveDrawingBuffer: false } }),
    );

    expect(type).toBeNull();
  });

  it('keeps a WebGL canvas that actually painted something', () => {
    stubScratchCanvas(pixels(8, 200));

    const type = canvasExportType(
      fakeCanvas({ width: 1393, height: 761, webgl: { preserveDrawingBuffer: false } }),
    );

    expect(type).toEqual({ type: 'image/png' });
  });

  it('assumes content when the buffer cannot be read back at all', () => {
    // A tainted canvas taints the scratch canvas too. Unreadable is not proof
    // of empty, so h2d's assumption stands and `toDataURL` decides — it throws
    // for a tainted canvas, and the screenshot fallback takes over.
    stubScratchCanvas('throws');

    const type = canvasExportType(
      fakeCanvas({ width: 1393, height: 761, webgl: { preserveDrawingBuffer: true } }),
    );

    expect(type).toEqual({ type: 'image/png' });
  });

  it('leaves an empty WebGL canvas without a bitmap, so the screenshot fallback can run', async () => {
    stubScratchCanvas(pixels(8, 0));

    const url = await rasterizeCanvas(
      fakeCanvas({ width: 1393, height: 761, webgl: { preserveDrawingBuffer: true } }),
    );

    expect(url).toBeNull();
  });

  it('never probes a 2D canvas that way — its own pixels are readable', () => {
    stubScratchCanvas(pixels(8, 0));

    // Opaque pixels via the canvas's OWN getImageData: the scratch canvas (all
    // transparent) must not get a say, or every 2D canvas would read as empty.
    const type = canvasExportType(fakeCanvas({ width: 400, height: 300, pixels: pixels(4, 255) }));

    expect(type).toEqual({ type: 'image/png' });
  });
});
