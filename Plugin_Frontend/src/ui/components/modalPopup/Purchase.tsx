/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";

interface PurchaseProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Purchase({ isOpen, onClose }: PurchaseProps) {
  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div class={styles.modalHeader}>
          <span>Purchase Premium</span>
          <button class={styles.modalClose} onClick={onClose}>
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
