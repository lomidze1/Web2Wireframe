/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";
import BrowserExtension from "../../pages/import/browserExtension/BrowserExtension";

interface ExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Browser Extension info, shown as a modal popup (matching Help / Settings /
 * Plan) instead of a hidden import tab. The body reuses the existing
 * <BrowserExtension /> content component as-is.
 */
export default function ExtensionModal({ isOpen, onClose }: ExtensionModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-title"
        class={`${styles.modal} ${styles.helpModal}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="extension-title" class={styles.modalTitle}>
            Browser Extension
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close browser extension"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <BrowserExtension />
        </div>
      </div>
    </div>
  );
}
