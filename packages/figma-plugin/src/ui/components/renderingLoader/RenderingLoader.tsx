/** @jsx h */
import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import styles from "./RenderingLoader.css";
import {
  PHASE_LABELS,
  PHASE_ORDER,
  capturePercent,
  mapRenderPercent,
  mergeDisplay,
  renderPhase,
  type ImportPhase,
} from "../../../utils/importProgress";

export interface RenderingProgress {
  /** Current step/status message. */
  step: string;
  /**
   * Progress in the SANDBOX's own 0–100 scale (what main.ts posts). It covers
   * the render half only; the loader maps it onto 65–100. Ignored while
   * `phase` is "capture", where the estimate curve drives instead.
   */
  percent: number;
  /** True when finished successfully. */
  isComplete?: boolean;
  /** Defaults to the phase implied by `percent` — see `renderPhase`. */
  phase?: ImportPhase;
  /** When the capture phase began (`Date.now()`), for the estimate curve. */
  startedAt?: number;
  /** Calibrated expected capture duration, from previous imports. */
  estimateMs?: number;
}

interface RenderingLoaderProps {
  isVisible: boolean;
  progress?: RenderingProgress;
  /** Close after a successful render (also fired by the auto-dismiss timer). */
  onClose?: () => void;
  /** Abort the in-flight capture. Only offered while the request is in flight. */
  onCancel?: () => void;
}

/** How long the auto-dismiss progress bar runs once a render finishes. Kept
 *  in sync with the CSS keyframe duration in `RenderingLoader.css`. */
const AUTO_DISMISS_MS = 3000;

/** Fraction of the remaining distance covered each frame (~0.5s to converge). */
const EASE_PER_FRAME = 0.12;

export default function RenderingLoader({
  isVisible,
  progress,
  onClose,
  onCancel,
}: RenderingLoaderProps) {
  const isComplete = progress?.isComplete ?? false;
  const phase: ImportPhase =
    progress?.phase ?? renderPhase(progress?.percent ?? 0);
  const startedAt = progress?.startedAt;
  const estimateMs = progress?.estimateMs;

  const overlayRef = useRef<HTMLDivElement>(null);
  const doneBtnRef = useRef<HTMLButtonElement>(null);

  /**
   * What the ring actually shows. Held in state rather than derived, because
   * it must only ever move forward: the sandbox batches its messages while it
   * blocks, so milestones can arrive after the estimate curve has already
   * passed them.
   */
  const [display, setDisplay] = useState(0);

  // A fresh import starts from zero — otherwise the second import of a session
  // would open at the first one's 100%.
  useEffect(() => {
    if (isVisible) setDisplay(0);
  }, [isVisible]);

  /**
   * Was the overlay already up on the previous render? Tracked here, during
   * render, because the reset above lands one frame too late: the component is
   * never unmounted between imports (the tabs just flip `isVisible`), effects
   * run after paint, and so every import from the second one on painted one
   * frame of the previous import's full ring before dropping back.
   */
  const wasVisible = useRef(false);
  const justOpened = isVisible && !wasVisible.current;
  wasVisible.current = isVisible;

  /** Where the bar is headed right now, on the 0–100 display scale. */
  const target = isComplete
    ? 100
    : phase === "capture"
      ? capturePercent(Date.now() - (startedAt ?? Date.now()), estimateMs ?? 0)
      : mapRenderPercent(progress?.percent ?? 0);

  /** What this frame actually paints — the opening frame shows the target the
   *  effect below is about to seat, never the previous import's leftover. */
  const shown = justOpened ? target : display;

  // First paint of an import: sit on the target rather than crawling up to it
  // from zero. (For a capture that target IS zero — the curve starts there.)
  useEffect(() => {
    if (!isVisible) return;
    setDisplay((prev) => (prev === 0 ? target : prev));
    // `target` is read once, deliberately: later moves belong to the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, phase]);

  // One motion model for the whole import: ease toward the current target
  // every frame. h2d does the same thing with a fixed-duration tween per step
  // (app.js:94900) — the difference is that ours re-aims continuously, so a
  // slow capture decelerates instead of stalling, and a burst of node
  // milestones is absorbed smoothly. The ring must NOT also be CSS-
  // transitioned: a 0.8s transition restarted every frame crawls, which is
  // exactly the bug this replaced.
  useEffect(() => {
    if (!isVisible) return;
    const began = startedAt ?? Date.now();
    let frame = 0;
    const tick = () => {
      setDisplay((prev) => {
        const aim = isComplete
          ? 100
          : phase === "capture"
            ? capturePercent(Date.now() - began, estimateMs ?? 0)
            : mapRenderPercent(progress?.percent ?? 0);
        const next = mergeDisplay(prev, prev + (aim - prev) * EASE_PER_FRAME);
        return Math.abs(next - prev) < 0.05 ? prev : next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isVisible, isComplete, phase, startedAt, estimateMs, progress?.percent]);

  // When the render completes, auto-dismiss after the progress bar finishes
  // so the user doesn't have to click Done. Clicking Done early unmounts the
  // component and the cleanup clears the pending timer.
  useEffect(() => {
    if (!isVisible || !isComplete || !onClose) return;
    const timer = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [isVisible, isComplete, onClose]);

  // Move focus into the overlay when it opens so keyboard/screen-reader users
  // land on the dialog instead of staying on the page behind it.
  useEffect(() => {
    if (isVisible) overlayRef.current?.focus();
  }, [isVisible]);

  // Once the render finishes, shift focus to the Done button.
  useEffect(() => {
    if (isVisible && isComplete) doneBtnRef.current?.focus();
  }, [isVisible, isComplete]);

  if (!isVisible) return null;

  // Stroke dashoffset for the progress ring, as a 0–1 fraction of the circle.
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (shown / 100) * circumference;
  const activeIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      class={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={isComplete ? "Wireframe creation complete" : "Creating wireframe"}
    >
      <div
        class={`${styles.loaderContainer} ${isComplete ? styles.complete : ""}`}
        aria-hidden="true"
      >
        <svg class={styles.progressRing} viewBox="0 0 100 100">
          {/* Background track */}
          <circle
            class={styles.progressTrack}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke-width="4"
          />
          {/* Progress arc */}
          <circle
            class={`${styles.progressArc} ${isComplete ? styles.completeArc : ""}`}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray={circumference}
            stroke-dashoffset={strokeDashoffset}
            style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
          />
        </svg>

        {/* Center: the live number while working, a checkmark once done. */}
        <div class={styles.centerContent}>
          {isComplete ? (
            <span class={styles.checkmark}>✓</span>
          ) : (
            <span class={styles.percent}>
              <span data-testid="loader-percent">{Math.round(shown)}</span>
              <span class={styles.percentSign}>%</span>
            </span>
          )}
        </div>
      </div>

      {/* Status text — announces progress steps to screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class={`${styles.stepText} ${isComplete ? styles.successText : ""}`}
      >
        {progress?.step || "Preparing…"}
      </div>

      {/* The four phases, so the wait has a shape: what is done, what is left. */}
      <ol class={styles.phaseList} aria-hidden="true">
        {PHASE_ORDER.map((p, i) => {
          const state =
            isComplete || i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li
              key={p}
              data-testid={`step-${p}`}
              data-state={state}
              class={styles.phaseItem}
            >
              <span class={styles.phaseMark}>{state === "done" ? "✓" : ""}</span>
              {PHASE_LABELS[p]}
            </li>
          );
        })}
      </ol>

      {/* Auto-dismiss progress bar — fills left→right over AUTO_DISMISS_MS so
          the user gets a visual countdown to the auto-close instead of having
          to click Done. Done remains as an early-out. */}
      {isComplete && (
        <div class={styles.autoDismissBar} role="progressbar" aria-label="Closing in 3 seconds">
          <div class={styles.autoDismissFill}></div>
        </div>
      )}

      {/* Done button - only shows when complete */}
      {isComplete && onClose && (
        <button
          ref={doneBtnRef}
          type="button"
          class={styles.doneBtn}
          onClick={onClose}
        >
          Done
        </button>
      )}

      {/* Cancel — only while the request is in flight. Once the sandbox starts
          building nodes there is nothing left to abort. */}
      {!isComplete && phase === "capture" && onCancel && (
        <button type="button" class={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
