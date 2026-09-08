/**
 * Pre-pass frame preprocessing.
 *
 * Web/HTML/AreaSelection/BrowserExtension import paths send the new W2W
 * content-script format to the sandbox: each frame carries `tree: null`
 * (or `{}`) plus a `capturedData.frame` payload. The actual WireframeNode
 * tree is built from `capturedData.frame` via {@link convertW2WToWireframe}.
 *
 * Historically this conversion (FIX A) lived inside `executeRender`, which
 * meant the sandbox-side font availability check (`collectAllFonts` →
 * `checkFontsAvailability`) ran on the placeholder tree and saw
 * `allFonts = ∅` — the "fonts-not-available" message was never sent and the
 * font fallback modal never opened. {@link prePassConvertFrames} runs the
 * conversion ONCE, before any sandbox code reads `frame.tree`, so font
 * check + style passes all see real data.
 *
 * Idempotent — running twice on the same frames is safe (the second pass
 * sees a populated tree and skips it).
 */
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { SkippedFrame } from "../types";
import { logger } from "./logger";

/**
 * Returns true when `tree` is one of the placeholder shapes that callers
 * use to mean "main.ts will populate this from capturedData":
 *   - `null`       (Web.tsx convention)
 *   - `undefined`  (older callers)
 *   - `{}`         (AreaSelection .w2w/.json upload)
 */
export function isPlaceholderTree(tree: unknown): boolean {
  if (tree === null || tree === undefined) return true;
  if (typeof tree === "object" && Object.keys(tree as object).length === 0) {
    return true;
  }
  return false;
}

export interface PrePassOptions {
  layoutMode: "absolute" | "autoLayout";
  interactionMode: "none" | "variants";
  /** h2d parity: true = legacy tag#id / tag.class layer names;
   *  false/absent (default) = semantic two-stage naming. */
  htmlLayerNames?: boolean;
  /** true = promote block containers whose rects prove a horizontal row to
   *  HORIZONTAL auto-layout; false/absent (default) = today's behaviour. */
  geometryRows?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FrameWithCapturedData = { tree: any; capturedData?: { frame?: unknown } };

/**
 * Convert `capturedData.frame` → WireframeNode tree for every frame whose
 * `tree` is still a placeholder. Mutates `frames[i].tree` in place.
 *
 * Does NOT touch frames without `capturedData.frame` (legacy
 * `prepareFramesForRendering` path), nor frames whose tree is already
 * populated (idempotency safety — important because `executeRender` keeps
 * a fallback FIX A loop for legacy callers).
 *
 * Returns the content-bearing subtrees the converter dropped as fully
 * transparent. They are collected here rather than reported here because the
 * render context — and with it the warning report — does not exist yet when
 * this pre-pass runs; `main.ts` replays them once it does.
 */
export function prePassConvertFrames(
  frames: FrameWithCapturedData[],
  options: PrePassOptions,
): SkippedFrame[] {
  const skipped: SkippedFrame[] = [];
  for (const frameData of frames) {
    if (frameData.capturedData?.frame && isPlaceholderTree(frameData.tree)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capturedFrame = frameData.capturedData.frame as any;
        frameData.tree = convertW2WToWireframe(capturedFrame, {
          layoutMode: options.layoutMode,
          interactionMode: options.interactionMode,
          htmlLayerNames: options.htmlLayerNames === true,
          geometryRows: options.geometryRows === true,
          onSkippedFrame: (s) => skipped.push(s),
        });
      } catch (err) {
        logger.warn("Pre-pass tree conversion failed", { error: err });
      }
    }
  }
  return skipped;
}
