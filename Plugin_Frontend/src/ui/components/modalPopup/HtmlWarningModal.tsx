/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";

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
  if (!isOpen) return null;

  const visibleErrors = errors.slice(0, MAX_VISIBLE_ERRORS);
  const remainingCount = errors.length - MAX_VISIBLE_ERRORS;

  return (
    <div class={styles.modalOverlay}>
      <div class={`${styles.modal} ${styles.variablesModal}`}>
        <div class={styles.modalHeader}>
          <span>{title || "HTML Quality Warning"}</span>
          <button
            class={styles.modalClose}
            onClick={onCancel}
            title="Close"
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
                <div
                  key={i}
                  style={{
                    fontSize: "12px",
                    color: "var(--muted)",
                    padding: "4px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {error}
                </div>
              ))}
              {remainingCount > 0 && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--muted)",
                    fontStyle: "italic",
                    padding: "4px 0",
                  }}
                >
                  +{remainingCount} more
                </div>
              )}
            </div>
          )}

          <div class={styles.importOptionsFooter}>
            <button
              class={styles.importOptionsCancelBtn}
              onClick={onCancel}
            >
              Go Back
            </button>
            <button
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
