/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";

export type FontFallbackChoice = "fallback" | "plugin" | "continue";

interface FontFallbackModalProps {
  isOpen: boolean;
  missingFont: string;
  nextFallback: string;
  pluginDefault: string;
  onChoice: (choice: FontFallbackChoice, chosenFont: string) => void;
}

export default function FontFallbackModal({
  isOpen,
  missingFont,
  nextFallback,
  pluginDefault,
  onChoice,
}: FontFallbackModalProps) {
  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay}>
      <div class={`${styles.modal} ${styles.variablesModal}`}>
        <div class={styles.modalHeader}>
          <span>Font Not Available</span>
        </div>
        <div class={styles.modalContent}>
          <p class={styles.variablesDescription}>
            The font <strong>{missingFont}</strong> is not installed on this
            system. Choose how to proceed:
          </p>

          <div class={styles.variablesOptions}>
            {nextFallback && nextFallback !== missingFont && (
              <button
                class={styles.variablesOption}
                onClick={() => onChoice("fallback", nextFallback)}
              >
                <div class={styles.variablesOptionIcon}>Aa</div>
                <div class={styles.variablesOptionContent}>
                  <strong>Use {nextFallback}</strong>
                  <span>Next font in the website's fallback chain</span>
                </div>
              </button>
            )}

            <button
              class={styles.variablesOption}
              onClick={() => onChoice("plugin", pluginDefault)}
            >
              <div class={styles.variablesOptionIcon}>Aa</div>
              <div class={styles.variablesOptionContent}>
                <strong>Use {pluginDefault}</strong>
                <span>Your configured plugin font</span>
              </div>
            </button>

            <button
              class={styles.variablesOption}
              onClick={() => onChoice("continue", missingFont)}
            >
              <div class={styles.variablesOptionIcon}>?</div>
              <div class={styles.variablesOptionContent}>
                <strong>Continue with {missingFont}</strong>
                <span>Figma will substitute a default font</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
