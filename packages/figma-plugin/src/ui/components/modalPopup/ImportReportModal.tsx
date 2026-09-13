/** @jsx h */
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import styles from "./Modal.css";
import local from "./ImportReportModal.css";
import { useModal } from "../../hooks/useModal";
import { groupWarnings, type WarningGroup } from "../../../rendering/diagnostics";
import type { ImportSourceKind, ImportWarning, WarningCategory } from "../../../types";
import { sendImportReport, sendImportReportNote } from "../../shared/importReportClient";

/**
 * The post-import warning report.
 *
 * Organised by PROBLEM, not by element: identical warnings collapse into one
 * issue row that says how many layers it hit ("31 layers lost their font" is
 * one problem — listing it 31 times made a nearly-good import read as a
 * broken one). Expanding an issue lists its layers; clicking a layer (when
 * the node exists) selects and zooms to it on canvas.
 *
 * Grouping and severity order come from `groupWarnings` in
 * rendering/diagnostics.ts.
 *
 * "Report this to the developer" sends the grouped issues (never layer names
 * or node ids) with the page URL in ONE click — no form. The optional note is
 * asked only after the report is already on its way.
 */

/** Where the import came from — enables "Report this to the developer". */
export interface ReportSource {
  sourceUrl: string;
  kind?: ImportSourceKind;
  viewports: number[];
}

/** Only URL and extension imports carry a page the developer can re-import. */
function isReportable(
  source: ReportSource | undefined,
): source is ReportSource & { kind: "url" | "extension" } {
  return (
    !!source &&
    (source.kind === "url" || source.kind === "extension") &&
    /^https?:\/\//i.test(source.sourceUrl)
  );
}

type ReportState =
  | { status: "idle" | "sending" | "failed" }
  | { status: "sent"; reportId: string };

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
  /** The import's origin; without a reportable one there is no report button. */
  source?: ReportSource;
}

// Category names never contain ":", so this key is unique per issue.
const issueKey = (issue: WarningGroup) => `${issue.category}:${issue.message}`;

export default function ImportReportModal({
  isOpen,
  onClose,
  warnings,
  overflow = 0,
  onSelectLayer,
  source,
}: ImportReportModalProps) {
  const { modalRef } = useModal({ isOpen, onClose });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [report, setReport] = useState<ReportState>({ status: "idle" });
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  // A new import brings a new warnings list, and its report starts from
  // scratch — a "Thanks" left over from the last import is about another page.
  useEffect(() => {
    setReport({ status: "idle" });
    setNote("");
    setNoteStatus("idle");
    setExpanded(new Set());
  }, [warnings]);
  // A clean import has no report to show — the success toast already said so.
  if (!isOpen || warnings.length === 0) return null;

  // groupWarnings is severity-ordered, so issues of one category are adjacent.
  const issues = groupWarnings(warnings);
  const categories: { category: WarningCategory; issues: WarningGroup[] }[] = [];
  for (const issue of issues) {
    const last = categories[categories.length - 1];
    if (last && last.category === issue.category) last.issues.push(issue);
    else categories.push({ category: issue.category, issues: [issue] });
  }

  const sendReport = async () => {
    if (!isReportable(source) || report.status === "sending") return;
    setReport({ status: "sending" });
    try {
      const reportId = await sendImportReport({
        sourceUrl: source.sourceUrl,
        kind: source.kind,
        viewports: source.viewports,
        issues: issues.map(({ category, message, count }) => ({ category, message, count })),
        overflow,
      });
      setReport({ status: "sent", reportId });
    } catch {
      setReport({ status: "failed" });
    }
  };

  const sendNote = async () => {
    const text = note.trim();
    if (report.status !== "sent" || !text || noteStatus === "sending") return;
    setNoteStatus("sending");
    try {
      await sendImportReportNote(report.reportId, text);
      setNoteStatus("sent");
    } catch {
      setNoteStatus("failed");
    }
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
              The wireframe was created, but we found{" "}
              <strong>
                {issues.length} {issues.length === 1 ? "issue" : "issues"}
              </strong>
              . Open an issue to find its layers on the canvas.
            </div>

            <div class={styles.accordionList}>
              {categories.map(({ category, issues: categoryIssues }) => (
                <details
                  key={category}
                  class={styles.accordion}
                  open={category === categories[0].category}
                >
                  <summary>
                    {CATEGORY_LABEL[category]}
                    <span class={local.reportGroupCount}>{categoryIssues.length}</span>
                  </summary>
                  <div class={styles.accordionContent}>
                    {categoryIssues.map((issue) => {
                      const key = issueKey(issue);
                      const isExpanded = expanded.has(key);
                      return (
                        <div key={key} class={local.reportIssue}>
                          <button
                            type="button"
                            class={local.reportIssueToggle}
                            aria-expanded={isExpanded ? "true" : "false"}
                            onClick={() => toggle(key)}
                          >
                            <span class={local.reportIssueMessage}>{issue.message}</span>
                            <span class={local.reportIssueCount}>
                              {issue.count} {issue.count === 1 ? "layer" : "layers"}
                            </span>
                          </button>
                          {isExpanded && (
                            <div class={local.reportLayers}>
                              {issue.layers.map((layer, i) => (
                                <div key={i} class={local.reportLayer}>
                                  {layer.nodeId ? (
                                    <button
                                      type="button"
                                      class={local.reportLayerLink}
                                      onClick={() => onSelectLayer?.(layer.nodeId as string)}
                                      title="Select and zoom to this layer"
                                    >
                                      {layer.layerName || "(unnamed)"}
                                    </button>
                                  ) : (
                                    // No node id — the element never made it into
                                    // the document, so there is nothing to select.
                                    <span class={local.reportLayerPlain}>
                                      {layer.layerName || "(unnamed)"}
                                    </span>
                                  )}
                                  {layer.detail && (
                                    <span class={local.reportLayerDetail}>{layer.detail}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>

            {overflow > 0 && (
              <div class={local.reportOverflow}>
                …and {overflow} more not listed.
              </div>
            )}

            {isReportable(source) && (
              <div class={local.reportAction}>
                {report.status === "sent" ? (
                  <div class={local.reportThanks}>
                    <p class={local.reportThanksText}>
                      ✓ Thanks — we read every report. We'll open this page
                      ourselves and reply to your Figma email.
                    </p>
                    {noteStatus === "sent" ? (
                      <p class={local.reportNoteDone}>Note sent — thank you.</p>
                    ) : (
                      <div class={local.reportNote}>
                        <label class={local.reportNoteLabel} for="import-report-note">
                          Anything specific look wrong? (optional)
                        </label>
                        <textarea
                          id="import-report-note"
                          class={local.reportNoteInput}
                          rows={2}
                          maxLength={2000}
                          value={note}
                          onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
                        />
                        <div class={local.reportNoteRow}>
                          {noteStatus === "failed" && (
                            <span class={local.reportNoteError}>
                              Couldn't send the note — try again.
                            </span>
                          )}
                          <button
                            type="button"
                            class={`${styles.planFooterLink} ${styles.subscribeBtn}`}
                            disabled={!note.trim() || noteStatus === "sending"}
                            onClick={sendNote}
                          >
                            {noteStatus === "sending" ? "Sending…" : "Send"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    class={`${styles.planFooterLink} ${styles.subscribeBtn}${
                      report.status === "failed" ? ` ${styles.subscribeError}` : ""
                    }`}
                    disabled={report.status === "sending"}
                    onClick={sendReport}
                  >
                    {report.status === "sending"
                      ? "Sending…"
                      : report.status === "failed"
                        ? "Couldn't send — try again"
                        : "Report this to the developer →"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
