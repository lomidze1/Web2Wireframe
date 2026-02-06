/** @jsx h */
import { h } from "preact";
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

export default function RenderingLoader({ isVisible, progress, onClose }: RenderingLoaderProps) {
  if (!isVisible) return null;

  // Calculate stroke dashoffset for progress ring (0-100 percent)
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const percent = progress?.percent ?? 0;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  const isComplete = progress?.isComplete ?? false;

  return (
    <div class={styles.overlay}>
      <div class={`${styles.loaderContainer} ${isComplete ? styles.complete : ""}`}>
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

      {/* Status text */}
      <div class={`${styles.stepText} ${isComplete ? styles.successText : ""}`}>
        {progress?.step || "Preparing..."}
      </div>

      {/* Done button - only shows when complete */}
      {isComplete && onClose && (
        <button class={styles.doneBtn} onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}
