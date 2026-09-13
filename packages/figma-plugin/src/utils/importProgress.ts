/**
 * The import loader's progress model — shared by both realms (the UI iframe
 * draws it, the sandbox feeds it).
 *
 * An import has two halves with very different amounts of information:
 *
 *   0–65   capture   the API round-trip. One request, one response, nothing in
 *                    between — 44s of stripe.com's 51.5s with no signal at all.
 *   65–100 render    the sandbox pipeline, which knows exactly what it is doing
 *                    and reports it (the frame band is driven by a node counter).
 *
 * The capture half is therefore *estimated*, h2d-style (`qG`, app.js:94900):
 * animate toward the segment end and never actually arrive. Ours uses an
 * exponential approach rather than their fixed-duration easing, because their
 * steps have known durations and our single request does not — the curve
 * decelerates on its own when a site takes longer than the estimate, so it can
 * neither stall on a round number nor overrun into the render segment.
 */

/** The capture segment owns everything below this; the curve approaches it. */
export const CAPTURE_CAP = 65;
/** …and the sandbox's own 0–100 scale is mapped onto what is left. */
export const RENDER_START = 65;
/** Used until the user has imported enough for {@link medianEstimate}. */
export const DEFAULT_CAPTURE_MS = 25_000;

/**
 * The frame-render band, in the SANDBOX's 0–100 scale (main.ts): the stretch
 * that used to jump 30 → 85 in one silent leap is now filled by the node
 * counter. Ends one point below the "frames complete" milestone (85) so the
 * counter can never step on the real event.
 */
export const NODE_BAND_START = 25;
export const NODE_BAND_END = 84;

/**
 * How many rendered nodes go by between progress messages. stripe.com renders
 * ~15k nodes; one message each would be pure noise across the realm boundary,
 * one per 50 is ~300 for the whole import.
 */
export const NODE_EMIT_EVERY = 50;

/** Time constant divisor: at `elapsed === estimate` the curve sits at ~80%. */
const TAU_DIVISOR = 1.6;

/**
 * Hard ceiling for the estimate. The curve is asymptotic in maths but not in
 * floats — `e^-48` rounds to zero and hands back the cap exactly. h2d guards
 * the same edge by scaling their step target to 0.95 (app.js:94955).
 */
const CAPTURE_CEILING = CAPTURE_CAP - 1;

export type ImportPhase = "capture" | "styles" | "building" | "finalizing";

/** The four steps shown under the ring, in order. */
export const PHASE_ORDER: ImportPhase[] = [
  "capture",
  "styles",
  "building",
  "finalizing",
];

export const PHASE_LABELS: Record<ImportPhase, string> = {
  capture: "Capturing",
  styles: "Styles",
  building: "Building",
  finalizing: "Finalizing",
};

/**
 * Estimated capture progress: `CAP × (1 − e^(−t/τ))`.
 *
 * Monotonic, starts at 0, asymptotic to {@link CAPTURE_CAP} — so a slow site
 * slows the bar down instead of freezing it or overshooting into the render
 * segment.
 */
export function capturePercent(elapsedMs: number, estimateMs: number): number {
  const estimate =
    Number.isFinite(estimateMs) && estimateMs > 0 ? estimateMs : DEFAULT_CAPTURE_MS;
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const tau = estimate / TAU_DIVISOR;
  return Math.min(CAPTURE_CEILING, CAPTURE_CAP * (1 - Math.exp(-elapsed / tau)));
}

/** Map the sandbox's own 0–100 render scale onto the 65–100 tail. */
export function mapRenderPercent(sandboxPercent: number): number {
  const p = Math.min(100, Math.max(0, sandboxPercent));
  return RENDER_START + (p / 100) * (100 - RENDER_START);
}

/**
 * Which of the four steps a sandbox percent belongs to. Inferred rather than
 * tagged onto all ten `render-progress` sites in main.ts — the bands are the
 * pipeline's own milestones (styles < 20 ≤ frames < 88 ≤ finalize).
 */
export function renderPhase(sandboxPercent: number): ImportPhase {
  if (sandboxPercent < 20) return "styles";
  if (sandboxPercent < 88) return "building";
  return "finalizing";
}

/**
 * Real render progress, in the sandbox scale. The renderer drops some captured
 * nodes and invents wrapper frames, so `rendered` and `total` never match
 * exactly — the band end is a clamp, not a target.
 */
export function nodeProgressPercent(rendered: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return NODE_BAND_START;
  const ratio = Math.min(1, Math.max(0, rendered / total));
  return NODE_BAND_START + ratio * (NODE_BAND_END - NODE_BAND_START);
}

/** Whether the n-th rendered node should trigger a progress message. */
export function shouldEmitNodeProgress(rendered: number): boolean {
  return rendered > 0 && rendered % NODE_EMIT_EVERY === 0;
}

/**
 * Fold a newly computed percent into the displayed one. The bar only ever
 * moves forward: milestones can arrive out of order (the sandbox batches
 * messages while it blocks) and the estimate curve can lag a real milestone.
 */
export function mergeDisplay(prev: number, next: number): number {
  if (!Number.isFinite(next)) return prev;
  return Math.min(100, Math.max(prev, next));
}

/**
 * Estimate the next capture from previous ones. Median, not mean: one
 * pathological site (or a cold API dyno) must not poison the following import.
 */
export function medianEstimate(samples: number[]): number {
  const clean = samples
    .filter((s) => Number.isFinite(s) && s > 0)
    .sort((a, b) => a - b);
  if (clean.length === 0) return DEFAULT_CAPTURE_MS;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 1 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}
