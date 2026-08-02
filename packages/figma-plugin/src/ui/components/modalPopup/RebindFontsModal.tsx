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

/** Outcome of a `rebind-original-fonts` run, posted back by the sandbox as
 *  a `rebind-result` message so the modal can show it inline (the toast
 *  alone was easy to miss — the modal used to close before it appeared). */
export interface RebindResultInfo {
  rebound?: number;
  total?: number;
  stillMissing?: string[];
  skippedMixed?: number;
  previouslyRebound?: number;
  /** True when the sandbox handler threw — show a retry message. */
  error?: boolean;
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
  /** True while the sandbox is walking & rebinding nodes — the button shows
   *  a busy label and ignores clicks; the modal stays open throughout. */
  isReapplying?: boolean;
  /** Last run's outcome, rendered as an inline banner above the button. */
  result?: RebindResultInfo | null;
}

/** Compose the inline banner for a finished run, or null before any run. */
function describeResult(
  result: RebindResultInfo | null,
): { kind: "success" | "warning" | "error"; message: string } | null {
  if (!result) return null;
  if (result.error) {
    return { kind: "error", message: "Couldn't re-apply fonts. Try again." };
  }
  const rebound = result.rebound ?? 0;
  const total = result.total ?? 0;
  const stillMissing = result.stillMissing ?? [];
  const previouslyRebound = result.previouslyRebound ?? 0;
  if (total === 0 && previouslyRebound > 0) {
    return {
      kind: "success",
      message: `All ${previouslyRebound} font(s) already re-applied. ✓`,
    };
  }
  if (rebound === total && stillMissing.length === 0) {
    const word = rebound === 1 ? "text layer" : "text layers";
    return { kind: "success", message: `Re-applied ${rebound} ${word}. ✓` };
  }
  const list = stillMissing.slice(0, 3).join(", ");
  const more =
    stillMissing.length > 3 ? ` (+${stillMissing.length - 3} more)` : "";
  const missingPart =
    stillMissing.length > 0
      ? ` — still missing: ${list}${more}. Install the missing fonts, then click again.`
      : "";
  return {
    kind: "warning",
    message: `Re-applied ${rebound} / ${total}${missingPart}`,
  };
}

/**
 * Info + action modal behind the footer "Re-apply fonts" button (matching
 * the Extension button's modal pattern). Leads with how much text is
 * affected, names the fonts to install, then walks the install → select →
 * re-apply flow. The Re-apply button reports progress and outcome inline —
 * the modal stays open so the user sees what actually happened.
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
  isReapplying = false,
  result = null,
}: RebindFontsModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  if (!isOpen) return null;

  const layerWord = count === 1 ? "text layer" : "text layers";
  const scopedToSelection = selectionCount > 0;
  const showLayerList = missingFonts.length > 0 && layers.length > 0;
  const resultBanner = describeResult(result);

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
                  Your selection holds{" "}
                  <strong class={local.rebindSelCount}>{selectionCount}</strong> of these —
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

            {resultBanner && (
              <div
                role="status"
                class={
                  resultBanner.kind === "success"
                    ? local.rebindResultSuccess
                    : resultBanner.kind === "warning"
                      ? local.rebindResultWarning
                      : local.rebindResultError
                }
              >
                {resultBanner.message}
              </div>
            )}

            <button
              type="button"
              class={local.rebindBtn}
              onClick={onReapply}
              disabled={isReapplying}
              aria-label="Re-apply original fonts now"
            >
              {isReapplying
                ? "Re-applying…"
                : scopedToSelection
                  ? "Re-apply to selection"
                  : "Re-apply fonts"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
