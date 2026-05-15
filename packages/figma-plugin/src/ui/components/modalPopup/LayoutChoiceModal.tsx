/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import { useModal } from "../../hooks/useModal";

export type LayoutMode = "autoLayout" | "absolute";

interface LayoutChoiceModalProps {
  isOpen: boolean;
  onChoice: (mode: LayoutMode) => void;
}

/**
 * Layout-mode chooser. Esc / Cancel → defaults to autoLayout (the more
 * flexible option) so keyboard users are never trapped.
 */
export default function LayoutChoiceModal({
  isOpen,
  onChoice,
}: LayoutChoiceModalProps) {
  const handleEscape = () => onChoice("autoLayout");
  const { modalRef } = useModal({ isOpen, onClose: handleEscape });
  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-choice-title"
        class={`${styles.modal} ${styles.variablesModal}`}
      >
        <div class={styles.modalHeader}>
          <h2 id="layout-choice-title" class={styles.modalTitle}>
            Layout Mode
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={handleEscape}
            aria-label="Cancel — use Auto Layout default"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <p class={styles.variablesDescription}>
            How should elements be positioned in Figma?
          </p>

          <div class={styles.variablesOptions}>
            <button
              type="button"
              class={styles.variablesOption}
              onClick={() => onChoice("autoLayout")}
            >
              <div class={styles.variablesOptionIcon} aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </div>
              <div class={styles.variablesOptionContent}>
                <strong>Auto Layout</strong>
                <span>
                  Responsive flexbox-like structure. Elements flow and resize
                  naturally. Best for design editing.
                </span>
              </div>
            </button>

            <button
              type="button"
              class={styles.variablesOption}
              onClick={() => onChoice("absolute")}
            >
              <div class={styles.variablesOptionIcon} aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div class={styles.variablesOptionContent}>
                <strong>Absolute (Pixel-perfect)</strong>
                <span>
                  Exact x, y positions for every element. 1:1 match with the
                  website. Best for reference.
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
