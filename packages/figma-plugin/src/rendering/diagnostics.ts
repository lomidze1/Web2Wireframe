/**
 * Import diagnostics — the categorised, per-layer warning list.
 *
 * Every fallback in the renderer used to be silent: a substituted font, an
 * image that failed to decode into a grey surface fill, an SVG Figma refused
 * to parse, a whole subtree lost to the per-child try/catch. In prod the
 * logger is a no-op, so a 20%-incomplete import looked exactly like a perfect
 * one, and the single count we did surface ("3 elements skipped") told the
 * user nothing they could act on — they never learned WHICH layers.
 *
 * Warnings collected here carry the node id when a Figma node exists, so the
 * UI can render each one as a link that selects the offending layer.
 *
 * INVARIANT: nothing in this module may throw. A diagnostic that breaks an
 * import is strictly worse than no diagnostic — every entry point is wrapped.
 */

import type { RenderContext, ImportWarning, WarningCategory } from "../types";

// The shapes live in types/index.ts alongside RenderContext (which carries
// them); re-exported here so call sites can import type + behaviour together.
export type { ImportWarning, WarningCategory };

/**
 * Upper bound on stored warnings. A pathological page (thousands of text
 * nodes on a missing webfont) would otherwise balloon the postMessage payload
 * to the UI. Beyond the cap we count instead of storing.
 */
export const MAX_WARNINGS = 500;

/** Most-severe-first, so the report's first group is the one that lost work. */
const CATEGORY_ORDER: WarningCategory[] = [
  "fatal",
  "typography",
  "image",
  "svg",
  "layout",
  "other",
];

/** Human labels for the relaunch summary: [singular, plural]. */
const CATEGORY_PHRASE: Record<WarningCategory, [string, string]> = {
  fatal: ["element could not be rendered", "elements could not be rendered"],
  typography: ["font substituted", "fonts substituted"],
  image: ["image skipped", "images skipped"],
  svg: ["SVG skipped", "SVGs skipped"],
  layout: ["layout approximated", "layouts approximated"],
  other: ["warning", "warnings"],
};

/**
 * Append one warning to the import report. Total function: a missing context,
 * a missing renderStats, or a hostile property accessor all end as no-ops.
 */
export function recordWarning(context: RenderContext, warning: ImportWarning): void {
  try {
    const stats = context?.renderStats;
    if (!stats) return;
    if (!stats.warnings) stats.warnings = [];
    if (stats.warnings.length >= MAX_WARNINGS) {
      stats.warningOverflow = (stats.warningOverflow || 0) + 1;
      return;
    }
    stats.warnings.push({
      category: warning.category,
      message: warning.message,
      ...(warning.nodeId ? { nodeId: warning.nodeId } : {}),
      ...(warning.layerName ? { layerName: warning.layerName } : {}),
      ...(warning.detail ? { detail: warning.detail } : {}),
    });
  } catch {
    // Diagnostics must never take an import down with them.
  }
}

/** Per-category counts, severity-first, skipping empty buckets. */
export function summarizeWarnings(
  warnings: ImportWarning[] | undefined,
): { category: WarningCategory; count: number }[] {
  if (!warnings || warnings.length === 0) return [];
  const counts = new Map<WarningCategory, number>();
  for (const w of warnings) {
    counts.set(w.category, (counts.get(w.category) || 0) + 1);
  }
  return CATEGORY_ORDER.filter((c) => counts.has(c)).map((category) => ({
    category,
    count: counts.get(category) as number,
  }));
}

/** One distinct problem in the report: its message and every layer it hit. */
export interface WarningGroup {
  category: WarningCategory;
  message: string;
  count: number;
  layers: { nodeId?: string; layerName?: string; detail?: string }[];
}

/**
 * Collapse warnings into distinct problems — same category + same message is
 * one issue — so "31 layers lost their font" reads as one row, not 31.
 * Severity-first, then first appearance. Messages must therefore be stable
 * templates; per-instance specifics belong in `detail`.
 */
export function groupWarnings(warnings: ImportWarning[] | undefined): WarningGroup[] {
  if (!warnings || warnings.length === 0) return [];
  const byKey = new Map<string, WarningGroup>();
  for (const w of warnings) {
    const key = `${w.category}\u0000${w.message}`;
    let group = byKey.get(key);
    if (!group) {
      group = { category: w.category, message: w.message, count: 0, layers: [] };
      byKey.set(key, group);
    }
    group.count++;
    group.layers.push({
      ...(w.nodeId ? { nodeId: w.nodeId } : {}),
      ...(w.layerName ? { layerName: w.layerName } : {}),
      ...(w.detail ? { detail: w.detail } : {}),
    });
  }
  const groups = Array.from(byKey.values());
  return CATEGORY_ORDER.flatMap((c) => groups.filter((g) => g.category === c));
}

/**
 * The short human summary stamped onto the Section via `setRelaunchData`, so
 * the state of an import is readable from the canvas months later.
 */
export function buildRelaunchSummary(warnings: ImportWarning[] | undefined): string {
  const groups = summarizeWarnings(warnings);
  if (groups.length === 0) return "Imported with no warnings";
  return groups
    .map(({ category, count }) => {
      const [singular, plural] = CATEGORY_PHRASE[category];
      return `${count} ${count === 1 ? singular : plural}`;
    })
    .join("\n");
}

/** One-line headline for `figma.notify` — same counts, comma-separated. */
export function buildNotifySummary(warnings: ImportWarning[] | undefined): string {
  return buildRelaunchSummary(warnings).split("\n").join(", ");
}
