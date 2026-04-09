/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";

export type LayoutMode = "autoLayout" | "absolute";

interface LayoutChoiceModalProps {
  isOpen: boolean;
  onChoice: (mode: LayoutMode) => void;
}

export default function LayoutChoiceModal({
  isOpen,
  onChoice,
}: LayoutChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay}>
      <div class={`${styles.modal} ${styles.variablesModal}`}>
        <div class={styles.modalHeader}>
          <span>Layout Mode</span>
        </div>
        <div class={styles.modalContent}>
          <p class={styles.variablesDescription}>
            How should elements be positioned in Figma?
          </p>

          <div class={styles.variablesOptions}>
            <button
              class={styles.variablesOption}
              onClick={() => onChoice("autoLayout")}
            >
              <div class={styles.variablesOptionIcon}>📐</div>
              <div class={styles.variablesOptionContent}>
                <strong>Auto Layout</strong>
                <span>
                  Responsive flexbox-like structure. Elements flow and resize
                  naturally. Best for design editing.
                </span>
              </div>
            </button>

            <button
              class={styles.variablesOption}
              onClick={() => onChoice("absolute")}
            >
              <div class={styles.variablesOptionIcon}>📍</div>
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
