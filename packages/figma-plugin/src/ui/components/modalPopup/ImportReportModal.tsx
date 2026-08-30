/** @jsx h */
import { h } from "preact";
import styles from "./Modal.css";
import local from "./ImportReportModal.css";
import { useModal } from "../../hooks/useModal";
import type { ImportWarning, WarningCategory } from "../../../types";

/**
 * The post-import warning report.
 *
 * Before this, an import that lost work said "⚠️ 3 element(s) could not be
 * rendered" and nothing more — the user knew a number but never which layers,
 * so there was nothing to act on. Every row here names a layer, and (when the
 * node exists) clicking it selects and zooms to it on canvas.
 *
 * Groups and their order mirror `summarizeWarnings` in rendering/diagnostics.ts:
 * most severe first, so the group that actually lost work is what the user
 * reads before anything else.
 */

/** Display order — must stay in step with CATEGORY_ORDER in diagnostics.ts. */
const CATEGORY_ORDER: WarningCategory[] = [
  "fatal",
  "typography",
  "image",
  "svg",
  "layout",
  "other",
];

const CATEGORY_LABEL: Record<WarningCategory, string> = {
  fatal: "Fatal errors",
  typography: "Typography",
  image: "Images",
  svg: "SVG",
  layout: "Layout",
  other: "Other",
};

interface ImportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Warnings collected during the import, in render order. */
  warnings: ImportWarning[];
  /** Warnings dropped past the collector's cap — reported, never hidden. */
  overflow?: number;
  /** Fires with the node id when a layer row is clicked. */
  onSelectLayer?: (nodeId: string) => void;
}

export default function ImportReportModal({
  isOpen,
  onClose,
  warnings,
  overflow = 0,
  onSelectLayer,
}: ImportReportModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  // A clean import has no report to show — the success toast already said so.
  if (!isOpen || warnings.length === 0) return null;

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: warnings.filter((w) => w.category === category),
  })).filter((g) => g.items.length > 0);

  const total = warnings.length + overflow;

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-report-title"
        class={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="import-report-title" class={styles.modalTitle}>
            Import report
          </h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close import report"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={local.reportContainer}>
            <div class={local.reportLead}>
              The wireframe was created, but{" "}
              <strong>
                {total} {total === 1 ? "element" : "elements"}
              </strong>{" "}
              didn't come through exactly. Click any layer below to find it on
              the canvas.
            </div>

            <div class={styles.accordionList}>
              {groups.map(({ category, items }) => (
                <details
                  key={category}
                  class={styles.accordion}
                  open={category === groups[0].category}
                >
                  <summary>
                    {CATEGORY_LABEL[category]}
                    <span class={local.reportGroupCount}>{items.length}</span>
                  </summary>
                  <div class={styles.accordionContent}>
                    {items.map((w, i) => (
                      <div key={`${category}-${i}`} class={local.reportRow}>
                        {w.nodeId ? (
                          <button
                            type="button"
                            class={local.reportLayerLink}
                            onClick={() => onSelectLayer?.(w.nodeId as string)}
                            title="Select and zoom to this layer"
                          >
                            {w.layerName || "(unnamed)"}
                          </button>
                        ) : (
                          // No node id — the element never made it into the
                          // document, so there is nothing to select.
                          <span class={local.reportLayerPlain}>
                            {w.layerName || "(unnamed)"}
                          </span>
                        )}
                        <span class={local.reportMessage}>{w.message}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>

            {overflow > 0 && (
              <div class={local.reportOverflow}>
                …and {overflow} more not listed.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
