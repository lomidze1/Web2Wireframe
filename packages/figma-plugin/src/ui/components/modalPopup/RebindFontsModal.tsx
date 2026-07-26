/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import local from "./RebindFontsModal.css";
import { useModal } from "../../hooks/useModal";

/** One pending text layer (mirrors `RebindableLayer` from the sandbox). */
export interface RebindLayerInfo {
  id: string;
  name: string;
  families: string[];
}

interface RebindFontsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Text layers on the current page still carrying a substituted font. */
  count: number;
  /** How many of those layers fall inside the current Figma selection. When
   *  > 0, Re-apply targets the selection, so the modal says so. */
  selectionCount?: number;
  /** Families those layers are waiting for (from the sandbox's
   *  `rebindable-count` message). */
  missingFonts: string[];
  /** Per-layer detail for the collapsible per-font list. Optional — without
   *  it the modal falls back to the plain "Waiting for:" line. */
  layers?: RebindLayerInfo[];
  /** Fires when a layer row is clicked — the sandbox selects & zooms to it. */
  onSelectLayer?: (id: string) => void;
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
  selectionCount = 0,
  missingFonts,
  layers = [],
  onSelectLayer,
  onReapply,
}: RebindFontsModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  if (!isOpen) return null;

  const layerWord = count === 1 ? "text layer" : "text layers";
  const scopedToSelection = selectionCount > 0;
  const showLayerList = missingFonts.length > 0 && layers.length > 0;

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
              {showLayerList ? (
                <div class={styles.accordionList}>
                  {missingFonts.map((family) => {
                    const familyLayers = layers.filter((l) =>
                      l.families.includes(family),
                    );
                    if (familyLayers.length === 0) return null;
                    return (
                      <details key={family} class={styles.accordion}>
                        <summary>
                          {family}
                          <span class={local.rebindLayerCount}>
                            {familyLayers.length}
                          </span>
                        </summary>
                        <div class={styles.accordionContent}>
                          {familyLayers.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              class={local.rebindLayerRow}
                              onClick={() => onSelectLayer?.(l.id)}
                              title="Select and zoom to this layer"
                            >
                              {l.name}
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : (
                missingFonts.length > 0 && (
                  <div class={local.rebindFontList}>
                    Waiting for: <strong>{missingFonts.join(", ")}</strong>
                  </div>
                )
              )}
              {scopedToSelection && (
                <div class={local.rebindFontList}>
                  Your selection holds <strong>{selectionCount}</strong> of these —
                  Re-apply will target the selection.
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
              {scopedToSelection ? "Re-apply to selection" : "Re-apply fonts"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
