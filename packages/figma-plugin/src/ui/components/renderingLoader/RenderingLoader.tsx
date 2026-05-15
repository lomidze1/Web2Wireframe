/** @jsx h */
import { h } from "preact";
import { useEffect } from "preact/hooks";
import styles from "./RenderingLoader.css";

export interface RenderingProgress {
  step: string;           // Current step/status message
  percent: number;        // Progress percentage 0-100
  isComplete?: boolean;   // True when finished successfully
}

interface RenderingLoaderProps {
  isVisible: boolean;
  progress?: RenderingProgress;
  onClose?: () => void;  // Optional callback to close manually
}

/** How long the auto-dismiss progress bar runs once a render finishes. Kept
 *  in sync with the CSS keyframe duration in `RenderingLoader.css`. */
const AUTO_DISMISS_MS = 3000;

export default function RenderingLoader({ isVisible, progress, onClose }: RenderingLoaderProps) {
  const isComplete = progress?.isComplete ?? false;

  // When the render completes, auto-dismiss after the progress bar finishes
  // so the user doesn't have to click Done. Clicking Done early unmounts the
  // component and the cleanup clears the pending timer.
  useEffect(() => {
    if (!isVisible || !isComplete || !onClose) return;
    const timer = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [isVisible, isComplete, onClose]);

  if (!isVisible) return null;

  // Calculate stroke dashoffset for progress ring (0-100 percent)
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const percent = progress?.percent ?? 0;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div
      class={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={isComplete ? "Wireframe creation complete" : "Creating wireframe"}
    >
      <div
        class={`${styles.loaderContainer} ${isComplete ? styles.complete : ""}`}
        aria-hidden="true"
      >
        {/* SVG Circular Progress */}
        <svg class={styles.progressRing} viewBox="0 0 100 100">
          {/* Background track */}
          <circle
            class={styles.progressTrack}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke-width="6"
          />
          {/* Progress arc */}
          <circle
            class={`${styles.progressArc} ${isComplete ? styles.completeArc : ""}`}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke-width="6"
            stroke-linecap="round"
            stroke-dasharray={circumference}
            stroke-dashoffset={strokeDashoffset}
            style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
          />
        </svg>

        {/* Center content - animated dots */}
        <div class={styles.centerContent}>
          {isComplete ? (
            <span class={styles.checkmark}>✓</span>
          ) : (
            <span class={styles.dots}>
              <span class={styles.dot}></span>
              <span class={styles.dot}></span>
              <span class={styles.dot}></span>
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
        {progress?.step || "Preparing..."}
      </div>

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
        <button class={styles.doneBtn} onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}
