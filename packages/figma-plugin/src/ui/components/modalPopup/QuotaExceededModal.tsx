/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";

interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Shown when the server answers an import with 403 `limit_exceeded`. W2W is
 * free; the only cap left is the 1000-imports-a-month fair-use guard
 * (PLAN_LIMITS.free in packages/api), so this explains it and nothing more.
 */
export default function QuotaExceededModal({ isOpen, onClose }: QuotaExceededModalProps) {
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
            Monthly limit reached
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={styles.planNotice}>
            You've made 1000 imports this month — the fair-use limit. It resets
            next month.
          </div>
        </div>
      </div>
    </div>
  );
}
