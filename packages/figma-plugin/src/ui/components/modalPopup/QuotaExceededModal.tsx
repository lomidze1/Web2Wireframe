/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";

interface QuotaExceededModalProps {
  isOpen: boolean;
  onUpgrade: () => void;
  onClose: () => void;
}

/**
 * Hard block shown when a Free user hits the 11th import in their monthly
 * cycle. `Get Pro` opens the in-plugin checkout flow (Plan modal); the
 * header × dismisses.
 */
export default function QuotaExceededModal({
  isOpen,
  onUpgrade,
  onClose,
}: QuotaExceededModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  if (!isOpen) return null;
  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quota-title"
        class={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="quota-title" class={styles.modalTitle}>
            You've reached your free limit
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close upgrade prompt"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={styles.planNotice}>
            You've used all 3 free imports this month. The Free plan now includes
            3 imports a month — upgrade to Pro for 30 days of unlimited imports.
          </div>
          <div class={styles.planSummary}>
            <span class={styles.planLabel}>Pro</span>
            <span class={styles.planBadge}>$16 / 30 days</span>
          </div>
          <div class={styles.planCards}>
            <div class={`${styles.planCard} ${styles.planCardPro}`}>
              <ul class={styles.planList}>
                <li class={styles.planListItem}>Unlimited imports — no monthly cap</li>
                <li class={styles.planListItem}>Keep every feature you already use, with no limit</li>
                <li class={styles.planListItem}>Priority email support</li>
                <li class={styles.planListItem}>
                  One-time payment — you're charged once, no auto-renewal
                </li>
              </ul>
              <button
                type="button"
                class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                onClick={onUpgrade}
              >
                Get Pro
              </button>
            </div>
          </div>
          <p class={styles.planTrustNote}>
            Secure checkout by Flitt · Apple Pay, Google Pay & all major cards
          </p>
        </div>
      </div>
    </div>
  );
}
