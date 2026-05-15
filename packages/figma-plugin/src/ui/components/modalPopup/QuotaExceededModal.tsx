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
 * cycle. Two CTAs: `Get Pro` opens the in-plugin checkout flow (Plan
 * modal), `Maybe later` dismisses.
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
            Free quota reached
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
            You've used all 10 free imports this month. Upgrade to Pro for
            unlimited imports — your cycle resets when you renew.
          </div>
          <div class={styles.planSummary}>
            <span class={styles.planLabel}>Pro</span>
            <span class={styles.planBadge}>$16 / month</span>
          </div>
          <div class={styles.planCards}>
            <div class={`${styles.planCard} ${styles.planCardPro}`}>
              <ul class={styles.planList}>
                <li class={styles.planListItem}>Unlimited imports</li>
                <li class={styles.planListItem}>All viewports & full styles</li>
                <li class={styles.planListItem}>Priority email support</li>
                <li class={styles.planListItem}>Cancel anytime</li>
              </ul>
              <button
                type="button"
                class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                onClick={onUpgrade}
              >
                Get Pro
              </button>
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
