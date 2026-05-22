/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";

interface ExpiringSoonModalProps {
  isOpen: boolean;
  daysRemaining: number;
  onExtend: () => void;
  onClose: () => void;
}

/**
 * Soft heads-up shown on plugin open when the user's Pro subscription has
 * ≤3 days left. Re-shows every plugin open inside the window — no persistent
 * dismissal, since each remaining day reduces the warning's relevance and we
 * want the message to stay visible until they act or lapse.
 *
 * `Extend Pro` opens the Plan modal (which then runs the existing checkout
 * flow). `Maybe later` dismisses the prompt for this session.
 */
export default function ExpiringSoonModal({
  isOpen,
  daysRemaining,
  onExtend,
  onClose,
}: ExpiringSoonModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  if (!isOpen) return null;

  const daysPhrase =
    daysRemaining <= 1
      ? "today" // 0 or 1 — treat as same urgency tier
      : `in ${daysRemaining} days`;
  const headline =
    daysRemaining <= 1
      ? "Your Pro access ends today"
      : `Your Pro access ends ${daysPhrase}`;

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expiring-title"
        class={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="expiring-title" class={styles.modalTitle}>
            {headline}
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close expiry reminder"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={styles.planNotice}>
            Extend now to keep unlimited imports. Buying stacks 30 days onto
            your remaining time — no days are lost.
          </div>
          <div class={styles.planCards}>
            <div class={`${styles.planCard} ${styles.planCardPro}`}>
              <div class={styles.planCardHeader}>PRO — $16 / 30 days</div>
              <button
                type="button"
                class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                onClick={onExtend}
              >
                Extend Pro
              </button>
              <p class={styles.planTrustNote}>
                Secure checkout by Flitt · Apple Pay, Google Pay & all major
                cards
              </p>
              <button
                type="button"
                class={styles.planCtaLink}
                onClick={onClose}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
