/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import local from "./RebindFontsModal.css";
import { useModal } from "../../hooks/useModal";

interface RebindFontsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Text layers on the current page still carrying a substituted font. */
  count: number;
  /** Families those layers are waiting for (from the sandbox's
   *  `rebindable-count` message). */
  missingFonts: string[];
  /** Fires the actual `rebind-original-fonts` action. */
  onReapply: () => void;
}

/**
 * Info + action modal behind the footer "Re-apply fonts" button (matching
 * the Extension button's modal pattern). Leads with how much text is
 * affected, names the fonts to install, then walks the install → select →
 * re-apply flow.
 */
export default function RebindFontsModal({
  isOpen,
  onClose,
  count,
  missingFonts,
  onReapply,
}: RebindFontsModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  if (!isOpen) return null;

  const layerWord = count === 1 ? "text layer" : "text layers";

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rebind-fonts-title"
        class={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="rebind-fonts-title" class={styles.modalTitle}>
            Re-apply original fonts
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close re-apply fonts"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={local.rebindContainer}>
            <div class={local.rebindLead}>
              Some text was imported with Inter because the website's fonts
              weren't installed in Figma.
            </div>

            <div class={local.rebindCard}>
              <div class={local.rebindCount}>
                <em>{count}</em> {layerWord} still showing Inter
              </div>
              {missingFonts.length > 0 && (
                <div class={local.rebindFontList}>
                  Waiting for: <strong>{missingFonts.join(", ")}</strong>
                </div>
              )}
            </div>

            <ol class={local.rebindSteps}>
              <li>
                Install these fonts from the downloaded{" "}
                <strong>fonts.zip</strong>.
              </li>
              <li>
                Select the frame you want to fix — or select nothing to scan
                the whole page.
              </li>
              <li>
                Click <strong>Re-apply fonts</strong> below.
              </li>
            </ol>

            <button
              type="button"
              class={local.rebindBtn}
              onClick={onReapply}
              aria-label="Re-apply original fonts now"
            >
              Re-apply fonts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
