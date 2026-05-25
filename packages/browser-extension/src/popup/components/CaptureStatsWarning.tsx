import type { CaptureStats } from "@w2w/shared";

interface Props {
  stats: CaptureStats;
}

// Strip "image/" from MIME so the user sees "WEBP" / "HEIC" rather than
// "image/webp". Falls back to the raw mime if it doesn't match that prefix.
function formatMime(mime: string): string {
  return mime.replace(/^image\//, "").toUpperCase();
}

/**
 * Post-capture banner that surfaces images we couldn't include in the
 * wireframe. Three reason categories:
 *  - unsupportedFormats: per-MIME counts (e.g. "1 WEBP, 2 HEIC")
 *  - oversizedImageCount: hit the 2MB per-image cap
 *  - resourceMapMisses: never showed up in the browser's cache
 * The 30MB payload-truncated flag bumps to its own warning line because the
 * underlying images aren't enumerated.
 */
export function CaptureStatsWarning({ stats }: Props): preact.JSX.Element {
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

  return (
    <div class="capture-stats-warning" role="status">
      <div class="capture-stats-warning__title">
        {stats.skippedImageCount} image{stats.skippedImageCount === 1 ? "" : "s"} couldn't be included
      </div>
      <ul class="capture-stats-warning__list">
        {lines.map((line) => (
          <li>{line}</li>
        ))}
      </ul>
    </div>
  );
}
