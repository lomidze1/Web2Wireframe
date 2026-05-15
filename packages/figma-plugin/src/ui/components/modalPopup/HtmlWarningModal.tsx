/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";

interface HtmlWarningModalProps {
  isOpen: boolean;
  title?: string;
  errorCount: number;
  errors: string[];
  onContinue: () => void;
  onCancel: () => void;
}

const MAX_VISIBLE_ERRORS = 5;

export default function HtmlWarningModal({
  isOpen,
  title,
  errorCount,
  errors,
  onContinue,
  onCancel,
}: HtmlWarningModalProps) {
  // Destructive-confirmation modal — Esc still cancels (treated as "Go Back")
  const { modalRef } = useModal({ isOpen, onClose: onCancel });
  if (!isOpen) return null;

  const visibleErrors = errors.slice(0, MAX_VISIBLE_ERRORS);
  const remainingCount = errors.length - MAX_VISIBLE_ERRORS;

  return (
    <div class={styles.modalOverlay}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="html-warning-title"
        class={`${styles.modal} ${styles.variablesModal}`}
      >
        <div class={styles.modalHeader}>
          <h2 id="html-warning-title" class={styles.modalTitle}>
            {title || "HTML Quality Warning"}
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onCancel}
            aria-label="Close warning"
          >
            &times;
          </button>
        </div>
        <div class={styles.modalContent}>
          <p class={styles.variablesDescription}>
            Found {errorCount} potential issue{errorCount !== 1 ? "s" : ""} in
            your HTML code. The generated wireframe may not match your intent.
          </p>

          {visibleErrors.length > 0 && (
            <div class={styles.variablesOptions}>
              {visibleErrors.map((error, i) => (
                <div key={i} class={styles.warningErrorRow}>
                  {error}
                </div>
              ))}
              {remainingCount > 0 && (
                <div class={styles.warningErrorMore}>
                  +{remainingCount} more
                </div>
              )}
            </div>
          )}

          <div class={styles.importOptionsFooter}>
            <button
              type="button"
              class={styles.importOptionsCancelBtn}
              onClick={onCancel}
            >
              Go Back
            </button>
            <button
              type="button"
              class={styles.importOptionsConfirmBtn}
              onClick={onContinue}
            >
              Continue Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
