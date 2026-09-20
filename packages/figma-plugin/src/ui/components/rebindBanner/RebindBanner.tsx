/** @jsx h */
import { h } from "preact";
import { useRef } from "preact/hooks";
import styles from "./RebindBanner.css";

/** Length of the strip's flight into the footer icon. */
const DOCK_MS = 450;

interface RebindBannerProps {
  /** Text layers on the page still carrying a substituted font. */
  count: number;
  /** Opens the Re-apply modal — same entry point as the footer icon. */
  onReapply: () => void;
  /** Called once the strip has finished collapsing into the footer icon. */
  onDismiss: () => void;
}

/**
 * The notice that an import substituted fonts. It sits between the scrolling
 * content and the footer bar, where it owns the plugin's full 410px — the
 * footer's centre slot could only spare ~106px, which is what used to push
 * Extension and the plan pill off the right edge.
 *
 * Dismissing it flies the strip into the footer's Re-apply icon (the same
 * docking move the What's new modal makes), so the user sees where the control
 * lives once the notice is gone.
 */
export default function RebindBanner({
  count,
  onReapply,
  onDismiss,
}: RebindBannerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);

  // Both the flight's `onfinish` and the safety-net timeout below call this.
  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDismiss();
  };

  const requestDismiss = () => {
    if (startedRef.current) return;
    startedRef.current = true;

    const wrap = wrapRef.current;
    const target = document.querySelector("[data-rebind-icon]");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!wrap || !target || typeof wrap.animate !== "function" || reduceMotion) {
      finish();
      return;
    }

    const from = wrap.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    // Aim at the icon's centre, not its top edge: the target is a 32px button,
    // so a top-edge landing would visibly undershoot it.
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);

    const flight = wrap.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: DOCK_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
    );
    flight.onfinish = finish;
    // Safety net: never leave the strip up if `finish` doesn't arrive.
    window.setTimeout(finish, DOCK_MS + 150);
  };

  return (
    <div class={styles.wrap} ref={wrapRef} data-rebind-banner="">
      <div class={styles.inner}>
        <div class={styles.banner}>
          <svg
            class={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 6h10" />
            <path d="M10 6v12" />
            <path d="M16 4v4h-4" />
            <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" />
          </svg>
          <span class={styles.text}>
            {count} {count === 1 ? "font" : "fonts"} substituted
          </span>
          <button type="button" class={styles.reapply} onClick={onReapply}>
            Re-apply
          </button>
          <button
            type="button"
            class={styles.close}
            aria-label="Dismiss the substituted fonts notice"
            onClick={requestDismiss}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
