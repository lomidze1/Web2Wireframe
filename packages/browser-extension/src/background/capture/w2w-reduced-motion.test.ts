/**
 * The extension capture reaches the state the API boots stripe.com in.
 *
 * The URL import emulates `prefers-reduced-motion: reduce` before navigation
 * (`packages/api/src/lib/cdp/w2w-extraction.ts` → `emulateReducedMotion`), and
 * Stripe's own script then jumps its graphics to their finished state. The
 * extension never did — a commit message claimed it, the code was not in it —
 * so every extension capture caught Stripe's platform graphic mid-entrance
 * (cards at opacity 0 / scale 0.94, skipped by the plugin: −72 nodes) and its
 * 31 billing bars at scaleY 0.
 *
 * The extension captures a LIVE tab it cannot reload, so emulation alone is not
 * enough: when the user already scrolled, Stripe's reduced-motion handler
 * cancels the in-flight `element.animate()` entrances and leaves their START
 * styles. Finishing the running time-based animations first captures their end
 * state. Measured 2026-09-12 (Chrome 1440×900, extension scroll timing,
 * deterministic over runs): prescroll + emulate only → capital/payouts opacity
 * 0, feature cards 4/8 hidden; finish → emulate → finish → all visible, bars
 * 31/31, the checkout graphic identical to the API's.
 *
 * Only RUNNING animations on the DOCUMENT timeline with a finite numeric end
 * may be finished:
 *   - stripe.com's checkout graphic is 57 PAUSED, scroll-scrubbed animations;
 *     finishing them jumped it to its end frame (3 of 9 items instead of 5).
 *   - scroll-driven CSS animations (`animation-timeline: scroll()/view()`)
 *     report `running` with a CSSUnitValue `endTime` ("100%"); finishing one
 *     pins it at its end and breaks the user's tab.
 *   - infinite loops (marquees, spinners) have no end to jump to.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  W2W_FINISH_RUNNING_ANIMATIONS_EXPRESSION,
  w2wClearEmulatedMedia,
  w2wEmulateReducedMotion,
  w2wFinishRunningAnimations,
} from './w2w';

interface FakeAnimation {
  playState: string;
  timeline: unknown;
  effect: { getComputedTiming: () => { endTime: unknown } };
  finish: ReturnType<typeof vi.fn>;
}

const documentTimeline = {};

function anim(
  over: { playState?: string; endTime?: unknown; timeline?: unknown; throws?: boolean } = {},
): FakeAnimation {
  return {
    playState: over.playState ?? 'running',
    timeline: 'timeline' in over ? over.timeline : documentTimeline,
    effect: { getComputedTiming: () => ({ endTime: 'endTime' in over ? over.endTime : 1000 }) },
    finish: vi.fn(() => {
      if (over.throws) throw new Error('InvalidStateError');
    }),
  };
}

function runExpression(animations: FakeAnimation[]): unknown {
  Object.defineProperty(document, 'timeline', { value: documentTimeline, configurable: true });
  Object.defineProperty(document, 'getAnimations', { value: () => animations, configurable: true });
  return (0, eval)(W2W_FINISH_RUNNING_ANIMATIONS_EXPRESSION);
}

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).getAnimations;
  delete (document as unknown as Record<string, unknown>).timeline;
});

describe('W2W_FINISH_RUNNING_ANIMATIONS_EXPRESSION', () => {
  it('finishes a running, finite, document-timeline animation and counts it', () => {
    const entrance = anim();
    expect(runExpression([entrance])).toBe(1);
    expect(entrance.finish).toHaveBeenCalledTimes(1);
  });

  it('leaves paused (scroll-scrubbed), finished and idle animations alone', () => {
    const paused = anim({ playState: 'paused' });
    const finished = anim({ playState: 'finished' });
    const idle = anim({ playState: 'idle' });
    expect(runExpression([paused, finished, idle])).toBe(0);
    for (const a of [paused, finished, idle]) expect(a.finish).not.toHaveBeenCalled();
  });

  it('leaves infinite loops alone', () => {
    const loop = anim({ endTime: Infinity });
    expect(runExpression([loop])).toBe(0);
    expect(loop.finish).not.toHaveBeenCalled();
  });

  it('leaves scroll-driven animations alone — CSSUnitValue end, non-document timeline', () => {
    const percentEnd = anim({ endTime: { value: 100, unit: 'percent' } });
    const scrollTimeline = anim({ timeline: { source: 'scroller' } });
    expect(runExpression([percentEnd, scrollTimeline])).toBe(0);
    expect(percentEnd.finish).not.toHaveBeenCalled();
    expect(scrollTimeline.finish).not.toHaveBeenCalled();
  });

  it('survives an animation whose finish() throws and still finishes the rest', () => {
    const throwing = anim({ throws: true });
    const entrance = anim();
    expect(runExpression([throwing, entrance])).toBe(1);
    expect(entrance.finish).toHaveBeenCalledTimes(1);
  });
});

describe('w2wFinishRunningAnimations', () => {
  it('evaluates the expression by value and returns the count', async () => {
    const send = vi.fn().mockResolvedValue({ result: { type: 'number', value: 7 } });

    await expect(w2wFinishRunningAnimations({ send })).resolves.toBe(7);

    const [method, params] = send.mock.calls[0];
    expect(method).toBe('Runtime.evaluate');
    expect(params.expression).toBe(W2W_FINISH_RUNNING_ANIMATIONS_EXPRESSION);
    expect(params.returnByValue).toBe(true);
  });

  it('returns 0 on a page exception — Runtime.evaluate reports it, it does not reject', async () => {
    const send = vi.fn().mockResolvedValue({
      result: { type: 'object', subtype: 'error' },
      exceptionDetails: { text: 'Uncaught' },
    });

    await expect(w2wFinishRunningAnimations({ send })).resolves.toBe(0);
  });

  it('never throws — a page that refuses is still worth capturing', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Target closed'));

    await expect(w2wFinishRunningAnimations({ send })).resolves.toBe(0);
  });
});

describe('w2wEmulateReducedMotion / w2wClearEmulatedMedia', () => {
  it('emulates prefers-reduced-motion: reduce', async () => {
    const send = vi.fn().mockResolvedValue({});

    await w2wEmulateReducedMotion({ send });

    expect(send).toHaveBeenCalledWith('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  });

  it('clears the emulated media features', async () => {
    const send = vi.fn().mockResolvedValue({});

    await w2wClearEmulatedMedia({ send });

    expect(send).toHaveBeenCalledWith('Emulation.setEmulatedMedia', { features: [] });
  });

  it('never throw', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Target closed'));

    await expect(w2wEmulateReducedMotion({ send })).resolves.toBeUndefined();
    await expect(w2wClearEmulatedMedia({ send })).resolves.toBeUndefined();
  });
});

describe('capture order', () => {
  /**
   * The step went missing once without anything noticing — a commit message
   * described it, the code was not there. Pin the order so it cannot again.
   */
  const sources = import.meta.glob('./w2w.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const source = sources['./w2w.ts'];
  const FINISH = 'await w2wFinishRunningAnimations(client)';

  it('finishes running animations, THEN emulates reduced motion, before the first viewport override', () => {
    const finish = source.indexOf(FINISH);
    const emulate = source.indexOf('await w2wEmulateReducedMotion(client)');
    const firstOverride = source.indexOf('"Emulation.setDeviceMetricsOverride"');

    expect(finish).toBeGreaterThan(-1);
    expect(emulate).toBeGreaterThan(-1);
    expect(finish).toBeLessThan(emulate);
    expect(emulate).toBeLessThan(firstOverride);
  });

  it('finishes again per viewport after the auto-scroll and the layout steps, right before EXTRACT_DOM', () => {
    const scroll = source.indexOf('await autoScrollPage(client)');
    const measure = source.indexOf('w2wScrollbarWidth(targetViewport', scroll);
    const finishAgain = source.indexOf(FINISH, scroll);
    const extract = source.indexOf('{ type: "EXTRACT_DOM" }');

    expect(finishAgain).toBeGreaterThan(measure);
    expect(finishAgain).toBeLessThan(extract);
  });

  it('clears the emulation in cleanup, before the debugger detaches', () => {
    const extract = source.indexOf('{ type: "EXTRACT_DOM" }');
    const clear = source.indexOf('await w2wClearEmulatedMedia(client)');
    const destroy = source.indexOf('await client.destroy()', extract);

    expect(clear).toBeGreaterThan(extract);
    expect(clear).toBeLessThan(destroy);
  });
});
