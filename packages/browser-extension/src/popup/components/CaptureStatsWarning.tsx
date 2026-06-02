import { useState } from "preact/hooks";
import type { CaptureStats } from "@w2w/shared";

interface Props {
  stats: CaptureStats;
}

// Strip "image/" from MIME so the user sees "WEBP" / "HEIC" rather than
// "image/webp". Falls back to the raw mime if it doesn't match that prefix.
function formatMime(mime: string): string {
  return mime.replace(/^image\//, "").toUpperCase();
}

/** The headline line, e.g. "1 image couldn't be included". */
function buildWarningTitle(stats: CaptureStats): string {
  const plural = stats.skippedImageCount === 1 ? "" : "s";
  return `${stats.skippedImageCount} image${plural} couldn't be included`;
}

/** The per-reason detail lines shown under the title. */
function buildWarningLines(stats: CaptureStats): string[] {
  const lines: string[] = [];

  const formatEntries = Object.entries(stats.unsupportedFormats);
  if (formatEntries.length > 0) {
    const breakdown = formatEntries
      .map(([mime, count]) => `${count} ${formatMime(mime)}`)
      .join(", ");
    lines.push(`Unsupported format(s) skipped: ${breakdown}`);
  }

  if (stats.oversizedImageCount > 0) {
    lines.push(
      `${stats.oversizedImageCount} image(s) skipped (over 2MB per image)`,
    );
  }

  if (stats.resourceMapMisses > 0) {
    lines.push(
      `${stats.resourceMapMisses} image(s) couldn't be loaded from cache`,
    );
  }

  if (stats.payloadTruncated) {
    lines.push("Total payload exceeded 30MB — some images were truncated");
  }

  return lines;
}

/**
 * Plain-text rendering of the warning (title + bulleted detail lines). Used
 * for the copy-to-clipboard button and to pre-fill the problem-report form so
 * the user doesn't have to retype what went wrong.
 */
export function buildCaptureWarningText(stats: CaptureStats): string {
  const lines = buildWarningLines(stats);
  return [buildWarningTitle(stats), ...lines.map((l) => `- ${l}`)].join("\n");
}

/**
 * Post-capture banner that surfaces images we couldn't include in the
 * wireframe. Three reason categories:
 *  - unsupportedFormats: per-MIME counts (e.g. "1 WEBP, 2 HEIC")
 *  - oversizedImageCount: hit the 2MB per-image cap
 *  - resourceMapMisses: never showed up in the browser's cache
 * The 30MB payload-truncated flag bumps to its own warning line because the
 * underlying images aren't enumerated.
 *
 * A copy button lifts the full warning text to the clipboard so the user can
 * paste it into the problem report (or the report form prefills it directly).
 */
export function CaptureStatsWarning({ stats }: Props): preact.JSX.Element {
  const lines = buildWarningLines(stats);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildCaptureWarningText(stats));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can reject if the popup lost focus — silently ignore;
      // the report form still prefills the same text.
    }
  };

  return (
    <div class="capture-stats-warning" role="status">
      <div class="capture-stats-warning__header">
        <div class="capture-stats-warning__title">
          {buildWarningTitle(stats)}
        </div>
        <button
          class="capture-stats-warning__copy"
          onClick={copy}
          title="Copy this message"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <ul class="capture-stats-warning__list">
        {lines.map((line) => (
          <li>{line}</li>
        ))}
      </ul>
    </div>
  );
}
