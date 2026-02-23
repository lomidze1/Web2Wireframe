/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";

export type VariableMode = "styles" | "direct";

interface VariablesChoiceModalProps {
  isOpen: boolean;
  onChoice: (mode: VariableMode) => void;
}

export default function VariablesChoiceModal({
  isOpen,
  onChoice,
}: VariablesChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay}>
      <div class={`${styles.modal} ${styles.variablesModal}`}>
        <div class={styles.modalHeader}>
          <span>CSS Variables</span>
        </div>
        <div class={styles.modalContent}>
          <p class={styles.variablesDescription}>
            This page contains CSS variables. How would you like them handled?
          </p>

          <div class={styles.variablesOptions}>
            <button
              class={styles.variablesOption}
              onClick={() => onChoice("styles")}
            >
              <div class={styles.variablesOptionIcon}>🎨</div>
              <div class={styles.variablesOptionContent}>
                <strong>Create Figma Styles</strong>
                <span>
                  Variables become reusable color styles in your Figma file
                </span>
              </div>
            </button>

            <button
              class={styles.variablesOption}
              onClick={() => onChoice("direct")}
            >
              <div class={styles.variablesOptionIcon}>🔲</div>
              <div class={styles.variablesOptionContent}>
                <strong>Direct Value</strong>
                <span>Apply values directly to elements without Figma styles</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
