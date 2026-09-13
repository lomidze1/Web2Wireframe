/**
 * WebGL canvases reach Figma in an extension capture.
 *
 * A WebGL context created without `preserveDrawingBuffer` can be read back by
 * the page only until its frame is presented; after that its pixels live in the
 * compositor alone. The content script's rAF read (canvas-raster.ts) catches
 * them only while the page redraws every frame. Measured 2026-09-12 in headed
 * Chrome on stripe.com: without reduced motion the hero wave read 37.9% painted
 * and the agentic background 5.5%, the issuing card, globe, data-viz and
 * developer wave 0%; under reduced motion (which the capture now emulates)
 * every one read 0%. Six empty boxes in Figma.
 *
 * `Page.captureScreenshot` reads the compositor. Shot plainly it bakes in the
 * section behind the canvas and whatever paints over it — stripe's developer
 * wave came back with "500M+ / 10K+ / 150K+" burnt in, then drawn again as text.
 * Isolated — everything else `visibility: hidden`, transparent page background,
 * canvas styling neutralised — the PNG is the canvas's own pixels with alpha: 6
 * of 6 stripe canvases captured, a never-drawn WebGL canvas came back 0% painted
 * (so it stays blank), and linear / vercel / apple / telex had nothing to shoot.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { W2WFrameNode } from '@w2w/shared';
import { MAX_CANVAS_DATA_URL_BYTES, MAX_CANVAS_TOTAL_BYTES } from '../../content/canvas-raster';
import {
  W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION,
  captureWebglCanvases,
  w2wIsolateCanvasExpression,
  w2wWebglCanvasProbeExpression,
} from './webgl-canvas-shots';

type Rect = { x: number; y: number; width: number; height: number };

function canvasNode(rect: Rect, url?: string): W2WFrameNode {
  return { type: 'FRAME', tag: 'canvas', ...rect, children: [], ...(url ? { $url: url } : {}) } as unknown as W2WFrameNode;
}

function page(...children: W2WFrameNode[]): W2WFrameNode {
  return { type: 'FRAME', tag: 'html', x: 0, y: 0, width: 1440, height: 5000, children } as unknown as W2WFrameNode;
}

interface Probe extends Rect { idx: number; bitmapWidth: number; dpr: number }

function probe(idx: number, rect: Rect, bitmapWidth = rect.width, dpr = 1): Probe {
  return { idx, ...rect, bitmapWidth, dpr };
}

const HERO: Rect = { x: 330, y: 0, width: 1393, height: 761 };
const GLOBE: Rect = { x: 905, y: 1693, width: 447, height: 728 };

/** A CDP stand-in: routes each call by method / expression and records the order. */
function fakeClient(opts: {
  probes?: Probe[] | Error;
  isolate?: (idx: number) => boolean;
  override?: Error;
  shot?: (clip: Rect) => string | Error;
} = {}) {
  const calls: string[] = [];
  const send = vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
    if (method === 'Runtime.evaluate') {
      const expr = String(params.expression);
      if (expr === W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION) {
        calls.push('restore');
        return { result: {} };
      }
      if (expr.includes('data-w2w-canvas-shot-chain') && expr.includes('setTimeout')) {
        const idx = Number(expr.match(/querySelectorAll\('canvas'\)\[(\d+)\]/)?.[1]);
        calls.push(`isolate:${idx}`);
        return { result: { value: opts.isolate ? opts.isolate(idx) : true } };
      }
      calls.push('probe');
      if (opts.probes instanceof Error) throw opts.probes;
      return { result: { value: opts.probes ?? [] } };
    }
    if (method === 'Emulation.setDefaultBackgroundColorOverride') {
      calls.push(params.color ? 'override' : 'clear-override');
      if (params.color && opts.override) throw opts.override;
      return {};
    }
    if (method === 'Page.captureScreenshot') {
      calls.push('shot');
      const data = opts.shot ? opts.shot(params.clip as Rect) : 'AAAA';
      if (data instanceof Error) throw data;
      return { data };
    }
    calls.push(method);
    return {};
  });
  // The real client's `send` is generic over its result; the stand-in routes by hand.
  const client = { send } as unknown as Parameters<typeof captureWebglCanvases>[0];
  return { client, send, calls };
}

const notBlank = async () => false;

describe('captureWebglCanvases', () => {
  it('makes no CDP call when every canvas already carries a bitmap', async () => {
    const { client, send } = fakeClient();
    await captureWebglCanvases(client, page(canvasNode(HERO, 'data:image/png;base64,x')), notBlank);
    expect(send).not.toHaveBeenCalled();
  });

  it('isolates, makes the background transparent, shoots, then clears and restores — in that order', async () => {
    const hero = canvasNode(HERO);
    const { client, send, calls } = fakeClient({ probes: [probe(0, HERO)] });

    await captureWebglCanvases(client, page(hero), notBlank);

    expect(calls).toEqual(['probe', 'isolate:0', 'override', 'shot', 'clear-override', 'restore']);
    expect(send).toHaveBeenCalledWith('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 },
    });
    const shot = send.mock.calls.find((c) => c[0] === 'Page.captureScreenshot')![1] as Record<string, unknown>;
    expect(shot.format).toBe('png');
    expect(shot.captureBeyondViewport).toBe(true);
    expect(shot.clip).toMatchObject({ x: HERO.x, y: HERO.y, width: HERO.width, height: HERO.height });
    expect(hero.$url).toBe('data:image/png;base64,AAAA');
  });

  it('shoots at the canvas bitmap resolution, never above the device resolution', async () => {
    const scales: number[] = [];
    const rects = [HERO, GLOBE, { x: 96, y: 3975, width: 1234, height: 519 }];
    const { client, send } = fakeClient({
      probes: [
        probe(0, rects[0], 1393, 2), // bitmap at CSS size on a 2x display → 0.5
        probe(1, rects[1], 894, 2), // bitmap at device size → 1
        probe(2, rects[2], 4000, 2), // bitmap above device size → capped at 1
      ],
    });
    await captureWebglCanvases(client, page(...rects.map((r) => canvasNode(r))), notBlank);
    for (const c of send.mock.calls) if (c[0] === 'Page.captureScreenshot') scales.push((c[1] as { clip: { scale: number } }).clip.scale);
    expect(scales).toEqual([0.5, 1, 1]);
  });

  it('only asks the page about canvases whose rect a bitmap-less node has', async () => {
    const { client, send } = fakeClient();
    await captureWebglCanvases(client, page(canvasNode(GLOBE), canvasNode(HERO, 'data:x')), notBlank);
    const expr = String(send.mock.calls[0][1]!.expression);
    expect(expr).toContain(String(GLOBE.y));
    expect(expr).not.toContain(String(HERO.width));
  });

  it('skips a rect that two nodes share — a wrong image is worse than none', async () => {
    const a = canvasNode(GLOBE);
    const b = canvasNode(GLOBE);
    const { client, calls } = fakeClient({ probes: [probe(0, GLOBE)] });
    await captureWebglCanvases(client, page(a, b), notBlank);
    expect(calls).toEqual(['probe']);
    expect(a.$url).toBeUndefined();
    expect(b.$url).toBeUndefined();
  });

  it('skips a canvas that moved between the probe and the isolation', async () => {
    const hero = canvasNode(HERO);
    const { client, calls } = fakeClient({ probes: [probe(0, HERO)], isolate: () => false });
    await captureWebglCanvases(client, page(hero), notBlank);
    expect(calls).toEqual(['probe', 'isolate:0', 'restore']);
    expect(hero.$url).toBeUndefined();
  });

  it('aborts the whole pass when the transparent background cannot be set — a blank canvas would become an opaque box', async () => {
    const hero = canvasNode(HERO);
    const globe = canvasNode(GLOBE);
    const { client, calls } = fakeClient({
      probes: [probe(0, HERO), probe(1, GLOBE)],
      override: new Error('not supported'),
    });
    await expect(captureWebglCanvases(client, page(hero, globe), notBlank)).resolves.toBeUndefined();
    expect(calls).not.toContain('shot');
    expect(calls).toContain('restore');
    expect(calls.filter((c) => c.startsWith('isolate'))).toHaveLength(1);
    expect(hero.$url).toBeUndefined();
    expect(globe.$url).toBeUndefined();
  });

  it('always hands the tab back when a shot fails, and moves on to the next canvas', async () => {
    const hero = canvasNode(HERO);
    const globe = canvasNode(GLOBE);
    const { client, calls } = fakeClient({
      probes: [probe(0, HERO), probe(1, GLOBE)],
      shot: (clip) => (clip.x === HERO.x ? new Error('Target closed') : 'BBBB'),
    });
    await captureWebglCanvases(client, page(hero, globe), notBlank);
    expect(calls).toEqual([
      'probe',
      'isolate:0', 'override', 'shot', 'clear-override', 'restore',
      'isolate:1', 'override', 'shot', 'clear-override', 'restore',
    ]);
    expect(hero.$url).toBeUndefined();
    expect(globe.$url).toBe('data:image/png;base64,BBBB');
  });

  it('leaves a canvas that shows nothing blank, so the plugin can still report it', async () => {
    const hero = canvasNode(HERO);
    const { client } = fakeClient({ probes: [probe(0, HERO)] });
    await captureWebglCanvases(client, page(hero), async () => true);
    expect(hero.$url).toBeUndefined();
  });

  it('drops a shot over the per-canvas budget and stops at the page budget', async () => {
    const perShot = 'A'.repeat(MAX_CANVAS_DATA_URL_BYTES + 1);
    const third = 'B'.repeat(Math.ceil(MAX_CANVAS_TOTAL_BYTES / 3) + 16);
    const rects: Rect[] = [0, 1, 2, 3].map((i) => ({ x: 10, y: 1000 * i, width: 400, height: 300 }));
    const nodes = rects.map((r) => canvasNode(r));
    const { client } = fakeClient({
      probes: rects.map((r, i) => probe(i, r)),
      shot: (clip) => (clip.y === 0 ? perShot : third),
    });
    await captureWebglCanvases(client, page(...nodes), notBlank);
    expect(nodes[0].$url).toBeUndefined(); // over the per-canvas limit
    expect(nodes[1].$url).toBeDefined();
    expect(nodes[2].$url).toBeDefined();
    expect(nodes[3].$url).toBeUndefined(); // would pass the page total
  });

  it('never throws — a page that cannot be probed is still worth capturing', async () => {
    const { client } = fakeClient({ probes: new Error('Target closed') });
    await expect(captureWebglCanvases(client, page(canvasNode(HERO)), notBlank)).resolves.toBeUndefined();
  });
});

describe('page-side expressions', () => {
  afterEach(() => {
    vi.useRealTimers();
    (0, eval)(W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION);
    document.body.replaceChildren();
  });

  function addCanvas(width: number, height: number): HTMLCanvasElement {
    const wrap = document.createElement('div');
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    wrap.appendChild(c);
    document.body.appendChild(wrap);
    return c;
  }

  const ZERO: Rect = { x: 0, y: 0, width: 0, height: 0 }; // happy-dom lays nothing out

  it('probe: never calls getContext on a canvas with no bitmap — that would claim 2D for the page', () => {
    const empty = addCanvas(0, 0);
    const live = addCanvas(300, 150);
    const emptySpy = vi.spyOn(empty, 'getContext');
    vi.spyOn(live, 'getContext').mockReturnValue(null); // holds a WebGL context

    const out = (0, eval)(w2wWebglCanvasProbeExpression([ZERO])) as Probe[];

    expect(emptySpy).not.toHaveBeenCalled();
    expect(out.map((p) => p.idx)).toEqual([1]);
    expect(out[0].bitmapWidth).toBe(300);
  });

  it('probe: leaves 2D canvases and canvases no node asked about alone', () => {
    const twoD = addCanvas(300, 150);
    vi.spyOn(twoD, 'getContext').mockReturnValue({} as RenderingContext);
    const other = addCanvas(300, 150);
    const otherSpy = vi.spyOn(other, 'getContext').mockReturnValue(null);

    expect((0, eval)(w2wWebglCanvasProbeExpression([ZERO])) as Probe[]).toEqual([
      expect.objectContaining({ idx: 1 }),
    ]);
    otherSpy.mockClear();
    expect((0, eval)(w2wWebglCanvasProbeExpression([{ x: 50, y: 50, width: 10, height: 10 }])) as Probe[]).toEqual([]);
    expect(otherSpy).not.toHaveBeenCalled(); // no node asked about that rect
  });

  it('probe: counts a canvas whose control went to an OffscreenCanvas (getContext throws)', () => {
    const c = addCanvas(300, 150);
    vi.spyOn(c, 'getContext').mockImplementation(() => {
      throw new Error('InvalidStateError');
    });
    expect(((0, eval)(w2wWebglCanvasProbeExpression([ZERO])) as Probe[]).map((p) => p.idx)).toEqual([0]);
  });

  it('isolate marks the canvas and its ancestors and injects the style; restore removes every trace', () => {
    const c = addCanvas(300, 150);

    expect((0, eval)(w2wIsolateCanvasExpression(0, ZERO))).toBe(true);
    expect(c.hasAttribute('data-w2w-canvas-shot')).toBe(true);
    expect(c.parentElement!.hasAttribute('data-w2w-canvas-shot-chain')).toBe(true);
    expect(document.body.hasAttribute('data-w2w-canvas-shot-chain')).toBe(true);
    const css = document.getElementById('__w2w_canvas_shot')!.textContent!;
    expect(css).toMatch(/html \* \{[^}]*visibility: hidden !important/);
    expect(css).toMatch(/transition: none !important/);
    expect(css).toMatch(/background: transparent !important/);
    expect(css).toMatch(/filter: none !important/);
    expect(css).toMatch(/mix-blend-mode: normal !important/);
    expect(css).toMatch(/box-shadow: none !important/);
    expect(css).toMatch(/border-color: transparent !important/);

    (0, eval)(W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION);
    expect(document.getElementById('__w2w_canvas_shot')).toBeNull();
    expect(document.querySelectorAll('[data-w2w-canvas-shot],[data-w2w-canvas-shot-chain]')).toHaveLength(0);
  });

  it('isolate refuses a canvas whose rect no longer matches', () => {
    addCanvas(300, 150);
    expect((0, eval)(w2wIsolateCanvasExpression(0, { x: 50, y: 50, width: 10, height: 10 }))).toBe(false);
    expect(document.getElementById('__w2w_canvas_shot')).toBeNull();
  });

  it('hands the tab back on its own when the capture dies mid-shot (debugger detached, restore never sent)', () => {
    vi.useFakeTimers();
    addCanvas(300, 150);
    (0, eval)(w2wIsolateCanvasExpression(0, ZERO));
    expect(document.getElementById('__w2w_canvas_shot')).not.toBeNull();

    vi.advanceTimersByTime(10_000);

    expect(document.getElementById('__w2w_canvas_shot')).toBeNull();
    expect(document.querySelectorAll('[data-w2w-canvas-shot],[data-w2w-canvas-shot-chain]')).toHaveLength(0);
  });

  it('a restore cancels the safety timer, so it cannot strip the next isolation mid-shot', () => {
    vi.useFakeTimers();
    addCanvas(300, 150);
    (0, eval)(w2wIsolateCanvasExpression(0, ZERO));
    vi.advanceTimersByTime(4_000);
    (0, eval)(W2W_RESTORE_CANVAS_ISOLATION_EXPRESSION);
    (0, eval)(w2wIsolateCanvasExpression(0, ZERO));

    vi.advanceTimersByTime(2_000); // past the first isolation's deadline, well inside the second's

    expect(document.getElementById('__w2w_canvas_shot')).not.toBeNull();
  });
});

describe('capture order', () => {
  it('shoots WebGL canvases after the tainted pass and before the frame is banked', () => {
    const sources = import.meta.glob('./w2w.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const source = sources['./w2w.ts'];
    const tainted = source.indexOf('await captureTaintedCanvases(client, frame)');
    const webgl = source.indexOf('await captureWebglCanvases(client, frame)');
    const bank = source.indexOf('captures.push({ width: targetViewport');
    expect(tainted).toBeGreaterThan(-1);
    expect(webgl).toBeGreaterThan(tainted);
    expect(webgl).toBeLessThan(bank);
  });
});
