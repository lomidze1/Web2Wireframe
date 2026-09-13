/**
 * Posterless `<video>` → its current frame as `$url`.
 *
 * apple.com's hero tiles play an MP4 with no `poster`. The URL import gets an
 * image only because the API emulates reduced motion before navigation: Apple
 * then never starts the video and its CSS shows a static `<picture>`. The
 * extension captures the user's live tab, where the video already played and
 * both pictures are `display:none` — so the extractor, which read only
 * `video.poster`, emitted an empty frame and the plugin drew a placeholder.
 *
 * Measured on the live page: `drawImage(video)` into a canvas is readable
 * (same-origin media), so the frame on screen can be exported like a canvas
 * bitmap. Same hardening rules as canvas-raster: every failure yields null,
 * nothing throws into the user's tab, and the payload stays inside the budget.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  captureVideoFrame,
  captureVideoFrames,
  videoFrameSize,
  VIDEO_FRAME_QUALITY,
} from './video-frame';
import { MAX_CANVAS_DATA_URL_BYTES } from './canvas-raster';

// ---------------------------------------------------------------------------
// Fakes — happy-dom has neither a video decoder nor a canvas.
// ---------------------------------------------------------------------------

interface FakeVideoOptions {
  poster?: string;
  readyState?: number;
  videoWidth?: number;
  videoHeight?: number;
  cssWidth?: number;
  cssHeight?: number;
}

function fakeVideo(o: FakeVideoOptions = {}): HTMLVideoElement {
  return {
    tagName: 'VIDEO',
    poster: o.poster ?? '',
    readyState: o.readyState ?? 4,
    videoWidth: o.videoWidth ?? 1440,
    videoHeight: o.videoHeight ?? 692,
    getBoundingClientRect: () => ({ width: o.cssWidth ?? 1440, height: o.cssHeight ?? 692 }),
  } as unknown as HTMLVideoElement;
}

interface ScratchOptions {
  /** RGBA bytes getImageData returns; default one opaque pixel. */
  pixels?: number[];
  taintedRead?: boolean;
  taintedExport?: boolean;
  dataUrl?: string;
}

interface Scratch {
  width: number;
  height: number;
  drawn: unknown[][];
  exported: unknown[][];
}

/** Stub the scratch canvas the module draws the frame onto. */
function stubScratch(o: ScratchOptions = {}): Scratch[] {
  const made: Scratch[] = [];
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return real(tag);
    const scratch: Scratch & Record<string, unknown> = {
      width: 0,
      height: 0,
      drawn: [],
      exported: [],
      getContext: (type: string) =>
        type === '2d'
          ? {
              drawImage: (...args: unknown[]) => {
                scratch.drawn.push(args);
              },
              getImageData: () => {
                if (o.taintedRead) throw securityError();
                // Default: one opaque, coloured pixel.
                return { data: o.pixels ?? [10, 20, 30, 255] };
              },
            }
          : null,
      toDataURL: (...args: unknown[]) => {
        if (o.taintedExport) throw securityError();
        scratch.exported.push(args);
        return o.dataUrl ?? 'data:image/jpeg;base64,FRAME';
      },
    };
    made.push(scratch);
    return scratch as unknown as HTMLElement;
  }) as typeof document.createElement);
  return made;
}

function securityError(): Error {
  const err = new Error('Tainted canvases may not be exported.');
  err.name = 'SecurityError';
  return err;
}

const pixels = (count: number, alpha: number): number[] =>
  Array.from({ length: count * 4 }, (_, i) => (i % 4 === 3 ? alpha : 10));

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('captureVideoFrame — which videos qualify', () => {
  it('exports the current frame of a posterless, loaded video as JPEG', () => {
    const made = stubScratch();
    const video = fakeVideo();

    expect(captureVideoFrame(video)).toBe('data:image/jpeg;base64,FRAME');
    const scratch = made[0];
    expect(scratch.drawn[0][0]).toBe(video);
    expect(scratch.exported[0]).toEqual(['image/jpeg', VIDEO_FRAME_QUALITY]);
  });

  it('leaves a video that has a poster alone — the poster keeps precedence', () => {
    const made = stubScratch();
    expect(captureVideoFrame(fakeVideo({ poster: 'https://x.test/poster.jpg' }))).toBeNull();
    expect(made).toEqual([]);
  });

  it('skips a video whose current frame is not decoded yet (readyState < 2)', () => {
    const made = stubScratch();
    expect(captureVideoFrame(fakeVideo({ readyState: 1 }))).toBeNull();
    expect(captureVideoFrame(fakeVideo({ readyState: 0 }))).toBeNull();
    expect(made).toEqual([]);
  });

  it('skips a video with no intrinsic size', () => {
    const made = stubScratch();
    expect(captureVideoFrame(fakeVideo({ videoWidth: 0 }))).toBeNull();
    expect(made).toEqual([]);
  });
});

describe('captureVideoFrame — never throws, never ships junk', () => {
  it('returns null for a cross-origin video that taints the read', () => {
    stubScratch({ taintedRead: true });
    expect(captureVideoFrame(fakeVideo())).toBeNull();
  });

  it('returns null when the export itself is refused', () => {
    stubScratch({ taintedExport: true });
    expect(captureVideoFrame(fakeVideo())).toBeNull();
  });

  it('returns null for a fully transparent frame — nothing was painted', () => {
    stubScratch({ pixels: pixels(8, 0) });
    expect(captureVideoFrame(fakeVideo())).toBeNull();
  });

  it('returns null for a solid black frame — what a DRM-protected video draws', () => {
    const black = Array.from({ length: 8 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 0));
    stubScratch({ pixels: black });
    expect(captureVideoFrame(fakeVideo())).toBeNull();
  });

  it('keeps a dark frame that is not solid black', () => {
    const dark = Array.from({ length: 8 * 4 }, (_, i) => (i % 4 === 3 ? 255 : i === 4 ? 3 : 0));
    stubScratch({ pixels: dark });
    expect(captureVideoFrame(fakeVideo())).toBe('data:image/jpeg;base64,FRAME');
  });

  it('skips a video the page does not show (zero-size box) before drawing anything', () => {
    const made = stubScratch();
    expect(captureVideoFrame(fakeVideo({ cssWidth: 0, cssHeight: 0 }))).toBeNull();
    expect(made).toEqual([]);
  });

  it('drops a frame over the per-image payload ceiling', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubScratch({ dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(MAX_CANVAS_DATA_URL_BYTES) });
    expect(captureVideoFrame(fakeVideo())).toBeNull();
  });
});

describe('videoFrameSize — no bigger than the page shows it, or than Figma takes', () => {
  it('keeps the intrinsic size when it is within 2x the CSS box', () => {
    expect(
      videoFrameSize(fakeVideo({ videoWidth: 3008, videoHeight: 1384, cssWidth: 3008, cssHeight: 692 })),
    ).toEqual({ width: 3008, height: 1384 });
  });

  it('downscales a 4K video shown at 1440 to 2x the box, keeping the aspect', () => {
    expect(
      videoFrameSize(fakeVideo({ videoWidth: 7680, videoHeight: 4320, cssWidth: 1440, cssHeight: 810 })),
    ).toEqual({ width: 2880, height: 1620 });
  });

  it('never exceeds 4096px on the long side', () => {
    expect(
      videoFrameSize(fakeVideo({ videoWidth: 8000, videoHeight: 2000, cssWidth: 3000, cssHeight: 750 })),
    ).toEqual({ width: 4096, height: 1024 });
  });

  it('falls back to the intrinsic size capped at 4096 when the box has no size', () => {
    expect(
      videoFrameSize(fakeVideo({ videoWidth: 1920, videoHeight: 1080, cssWidth: 0, cssHeight: 0 })),
    ).toEqual({ width: 1920, height: 1080 });
  });

  it('draws the scratch canvas at that size', () => {
    const made = stubScratch();
    captureVideoFrame(fakeVideo({ videoWidth: 7680, videoHeight: 4320, cssWidth: 1440, cssHeight: 810 }));
    const scratch = made[0];
    expect([scratch.width, scratch.height]).toEqual([2880, 1620]);
    expect(scratch.drawn[0].slice(1)).toEqual([0, 0, 2880, 1620]);
  });
});

describe('captureVideoFrames — the page pass', () => {
  function withVideos(list: HTMLVideoElement[]): void {
    vi.spyOn(document, 'querySelectorAll').mockReturnValue(
      list as unknown as NodeListOf<Element>,
    );
  }

  it('fills the map and reports the bytes it spent', () => {
    stubScratch();
    const a = fakeVideo();
    const b = fakeVideo({ poster: 'https://x.test/p.jpg' });
    const map = new WeakMap<HTMLVideoElement, string>();
    withVideos([a, b]);

    const spent = captureVideoFrames(map, 1_000_000);

    expect(map.get(a)).toBe('data:image/jpeg;base64,FRAME');
    expect(map.has(b)).toBe(false);
    expect(spent).toBe('data:image/jpeg;base64,FRAME'.length);
  });

  it('stops at the budget it is given, first come first served', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const url = 'data:image/jpeg;base64,' + 'B'.repeat(1000);
    stubScratch({ dataUrl: url });
    const videos = [fakeVideo(), fakeVideo(), fakeVideo()];
    const map = new WeakMap<HTMLVideoElement, string>();
    withVideos(videos);

    const spent = captureVideoFrames(map, url.length * 2 + 10);

    expect(videos.map((v) => map.has(v))).toEqual([true, true, false]);
    expect(spent).toBe(url.length * 2);
  });

  it('drops a stale frame when the next viewport cannot re-read it', () => {
    const video = fakeVideo();
    const map = new WeakMap<HTMLVideoElement, string>();
    withVideos([video]);

    stubScratch({ dataUrl: 'data:image/jpeg;base64,DESKTOP' });
    captureVideoFrames(map, 1_000_000);
    expect(map.get(video)).toBe('data:image/jpeg;base64,DESKTOP');

    vi.mocked(document.createElement).mockRestore();
    stubScratch({ taintedExport: true });
    captureVideoFrames(map, 1_000_000);

    expect(map.has(video)).toBe(false);
  });

  it('returns 0 when the document cannot be queried at all', () => {
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw new Error('detached');
    });
    expect(captureVideoFrames(new WeakMap(), 1_000_000)).toBe(0);
  });
});

describe('extractor wiring', () => {
  const sources = import.meta.glob('./extractor.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const source = sources['./extractor.ts'];

  it('uses the poster first and the captured frame only as a fallback', () => {
    expect(source).toMatch(/\.poster\s*\|\|\s*videoFrames\.get\(/);
  });

  it('captures frames after the canvas pass and before the traversal', () => {
    const canvasPass = source.indexOf('await rasterizeCanvases(canvasBitmaps)');
    const videoPass = source.indexOf('captureVideoFrames(videoFrames');
    const traversal = source.indexOf('const frame = traverseElement(');
    expect(canvasPass).toBeGreaterThan(-1);
    expect(videoPass).toBeGreaterThan(canvasPass);
    expect(traversal).toBeGreaterThan(videoPass);
  });
});
