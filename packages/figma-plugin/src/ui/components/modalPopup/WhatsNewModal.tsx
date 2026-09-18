/** @jsx h */
import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";
import { LEGIBLY_URL } from "../../shared/whatsNew";
import { openExternal } from "../../shared/openExternal";

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fires the moment closing starts, so the banner it flies into can mount. */
  onDock?: () => void;
}

/** Length of the modal's flight into the banner under the Import button. */
const DOCK_MS = 450;

/**
 * One-time note about our other plugin, shown on a plugin open to users who
 * already import (see hooks/useWhatsNew.ts). Every way of closing it docks the
 * note: `onDock` mounts the banner, the dialog shrinks and flies into it, and
 * `onClose` follows when the flight ends. Without the Web Animations API, a
 * banner to aim at, or with reduced motion, it simply closes.
 */
export default function WhatsNewModal({ isOpen, onClose, onDock }: WhatsNewModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const closedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      closingRef.current = false;
      closedRef.current = false;
    }
  }, [isOpen]);

  const finishClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  };

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onDock?.();

    const schedule =
      window.requestAnimationFrame?.bind(window) ??
      ((cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 0));

    // Next frame: the banner has mounted, so there is somewhere to fly to.
    schedule(() => {
      const dialog = modalRef.current as HTMLElement | null;
      const target = document.querySelector("[data-news-banner]");
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!dialog || !target || typeof dialog.animate !== "function" || reduceMotion) {
        finishClose();
        return;
      }

      const from = dialog.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top - (from.top + from.height / 2);

      const flight = dialog.animate(
        [
          { transform: "none", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
        ],
        { duration: DOCK_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
      );
      overlayRef.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
        duration: DOCK_MS,
        fill: "forwards",
      });
      flight.onfinish = finishClose;
      // Safety net: never leave the modal up if `finish` doesn't arrive.
      window.setTimeout(finishClose, DOCK_MS + 150);
    });
  };

  const { modalRef } = useModal({ isOpen, onClose: requestClose });
  if (!isOpen) return null;

  const openLegibly = () => {
    openExternal(LEGIBLY_URL);
    requestClose();
  };

  return (
    <div ref={overlayRef} class={styles.modalOverlay} onClick={requestClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        class={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="whats-new-title" class={styles.modalTitle}>
            New from us: Legibly
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={requestClose}
            aria-label="Close what's new"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={styles.planNotice}>
            Is your design accessible? Legibly checks contrast, line spacing and
            tap targets against WCAG — and fixes them in one click.
          </div>
          <div class={styles.planCards}>
            <div class={`${styles.planCard} ${styles.planCardPro}`}>
              <button
                type="button"
                class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                onClick={openLegibly}
              >
                Try Legibly
              </button>
              <button type="button" class={styles.planCardBtn} onClick={requestClose}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
