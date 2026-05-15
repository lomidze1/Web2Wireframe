/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";

interface PurchaseProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Purchase({ isOpen, onClose }: PurchaseProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        class={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="purchase-title" class={styles.modalTitle}>
            Purchase Premium
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close purchase"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <p>Purchase options will be here.</p>
        </div>
      </div>
    </div>
  );
}
