/**
 * Re-apply Original Fonts (post-render action)
 *
 * Workflow this serves: the user imports a website with `fontMode = "website"`
 * + `Create Styles = OFF` and picks "Use original fonts" in the
 * FontFallbackModal. Because the originals aren't installed, every text node
 * renders with Inter — but `createTextNode` stamps the original family onto
 * each substituted node as `w2w_original_font` pluginData. Later, after the
 * user installs the fonts shipped in the .zip download, clicking the footer
 * "Re-apply fonts" button calls `rebindOriginalFonts` to swap each node's
 * fontName back to the family the user actually wanted.
 *
 * MVP scope (matches the approved plan):
 *   - Per-node primary font only — mixed-fontName nodes are counted under
 *     `skippedMixed` and left untouched. Per-segment rebind is a future
 *     extension.
 *   - Style preservation: we attempt the node's current style first
 *     ("Medium"/"Bold"/etc.) and fall back through a small ladder if the
 *     installed font lacks that exact cut.
 *   - Idempotent: on success we clear the marker so a second invocation is
 *     a no-op for the same node.
 */

/** Pluginata key written by `createTextNode` and consumed here. */
export const ORIGINAL_FONT_PLUGIN_KEY = "w2w_original_font";

/** Pluginata key stamped on a text node *after* a successful rebind. Carries
 *  the family the node was rebound to. Survives the clearing of
 *  `ORIGINAL_FONT_PLUGIN_KEY` so subsequent Re-apply passes can count
 *  cumulative rebinds in scope and produce a non-misleading toast (e.g.
 *  "All 30 font(s) already re-applied" rather than "0 / 0"). */
export const REBOUND_DONE_PLUGIN_KEY = "w2w_rebound_done";

/** Style ladder tried in order when the node's current style isn't available
 *  on the now-installed font (e.g. user installed PSA Regular but the node
 *  was rendered with Medium). Mirrors the conventional cuts most fonts ship
 *  with. */
const STYLE_FALLBACK_LADDER = ["Regular", "Bold", "Medium", "Light", "Normal"];

export interface RebindResult {
  /** Number of text nodes that successfully had their fontName swapped. */
  rebound: number;
  /** Total number of nodes that carried the marker (rebound + still-missing
   *  + skippedMixed). Lets the UI compute "X of Y rebound". */
  total: number;
  /** Unique original families that still couldn't be loaded — surfaced in
   *  the toast so the user knows what's left to install. */
  stillMissing: string[];
  /** Mixed-fontName nodes we deliberately skipped (MVP limitation). */
  skippedMixed: number;
  /** Nodes in scope that already carried `REBOUND_DONE_PLUGIN_KEY` from a
   *  prior Re-apply pass. Lets the toast show cumulative ("X new of Y total")
   *  instead of just the misleading "remaining-pending" count. */
  previouslyRebound: number;
}

/**
 * Walk the supplied roots, find every TEXT descendant, and dedupe by node id.
 *
 * `figma.SceneNode` has a `findAll` for FRAME/GROUP/etc., but stand-alone
 * TEXT nodes also count — when the user selects a single text element we
 * still want to operate on it.
 */
export function collectTextNodesIn(roots: SceneNode[]): TextNode[] {
  const seen = new Set<string>();
  const out: TextNode[] = [];

  const visit = (n: SceneNode) => {
    if (n.type === "TEXT") {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        out.push(n);
      }
      return;
    }
    // Container nodes expose findAll; use it to collect descendants in one
    // pass instead of recursing manually.
    const container = n as SceneNode & {
      findAll?: (predicate: (node: SceneNode) => boolean) => SceneNode[];
    };
    if (typeof container.findAll === "function") {
      const descendants = container.findAll((d) => d.type === "TEXT");
      for (const d of descendants) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          out.push(d as TextNode);
        }
      }
    }
  };

  for (const root of roots) visit(root);
  return out;
}

/**
 * Try to load `family` with the requested style first, then walk a small
 * ladder of common cuts. Returns the style that loaded, or `null` if every
 * attempt failed.
 *
 * Each attempt is logged so the user can see exactly which (family, style)
 * pairs succeeded vs threw, and what the underlying error message was — key
 * for diagnosing partial-rebind cases (some text reattaches without a Figma
 * restart, others stay on Inter, and we want to understand why).
 */
async function loadFontWithFallback(
  family: string,
  preferredStyle: string,
  trace: { nodeId: string; attempts: Array<{ family: string; style: string; ok: boolean; error?: string }> },
): Promise<string | null> {
  const tried = new Set<string>();
  const candidates = [preferredStyle, ...STYLE_FALLBACK_LADDER];
  for (const style of candidates) {
    if (tried.has(style)) continue;
    tried.add(style);
    try {
      await figma.loadFontAsync({ family, style });
      trace.attempts.push({ family, style, ok: true });
      return style;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      trace.attempts.push({ family, style, ok: false, error: message });
    }
  }
  return null;
}

/**
 * Rebind each supplied text node back to its original CSS-declared family
 * when the marker is present and the family is now loadable. Mutates each
 * node's `fontName` and clears the marker on success.
 */
export async function rebindOriginalFonts(
  nodes: TextNode[],
): Promise<RebindResult> {
  let rebound = 0;
  let skippedMixed = 0;
  let total = 0;
  const stillMissing = new Set<string>();

  // Pre-pass: count nodes already stamped from earlier rebind runs in this
  // scope. We do this before the rebind loop so the count reflects the state
  // the user "earned" prior to clicking Re-apply again. Counted regardless of
  // whether the node also carries an active ORIGINAL marker — in practice
  // that combination shouldn't happen (success clears the original marker),
  // but counting independently keeps the metric robust to edge cases.
  let previouslyRebound = 0;
  for (const node of nodes) {
    if (node.getPluginData(REBOUND_DONE_PLUGIN_KEY)) previouslyRebound++;
  }

  // Per-node breakdown so the user can correlate "X rebound, Y missing" in
  // the toast with the exact families & styles each node tried. Logged at the
  // end as a single console.table for easy scanning.
  const perNode: Array<{
    nodeId: string;
    family: string;
    requestedStyle: string;
    outcome: "rebound" | "stillMissing" | "skippedMixed" | "setFailed";
    appliedStyle?: string;
    attemptsTried: number;
    firstError?: string;
    chars?: string;
  }> = [];

  console.log(
    `%c[W2W-REBIND] Starting rebind on ${nodes.length} candidate text node(s)`,
    "color:#4caf50;font-weight:bold",
  );

  for (const node of nodes) {
    const originalFamily = node.getPluginData(ORIGINAL_FONT_PLUGIN_KEY);
    if (!originalFamily) continue;
    total++;

    const charsPreview = (node.characters || "").slice(0, 40).replace(/\s+/g, " ");

    // Mixed-style text needs per-segment handling — out of MVP scope. Leave
    // the marker in place so a future segment-aware rebind can pick it up.
    if (node.fontName === figma.mixed) {
      skippedMixed++;
      perNode.push({
        nodeId: node.id,
        family: originalFamily,
        requestedStyle: "(mixed)",
        outcome: "skippedMixed",
        attemptsTried: 0,
        chars: charsPreview,
      });
      continue;
    }

    const currentStyle = (node.fontName as FontName).style;
    const trace = { nodeId: node.id, attempts: [] as Array<{ family: string; style: string; ok: boolean; error?: string }> };
    const loadedStyle = await loadFontWithFallback(originalFamily, currentStyle, trace);

    if (loadedStyle === null) {
      stillMissing.add(originalFamily);
      perNode.push({
        nodeId: node.id,
        family: originalFamily,
        requestedStyle: currentStyle,
        outcome: "stillMissing",
        attemptsTried: trace.attempts.length,
        firstError: trace.attempts.find((a) => !a.ok)?.error,
        chars: charsPreview,
      });
      continue;
    }

    try {
      node.fontName = { family: originalFamily, style: loadedStyle };
      // Stamp the "done" marker first (carries the family for diagnostics
      // and so a future Re-apply pass can count cumulative rebinds even
      // after the original marker is gone). Then clear the original marker
      // — empty string deletes the entry per Figma plugin API contract.
      node.setPluginData(REBOUND_DONE_PLUGIN_KEY, originalFamily);
      node.setPluginData(ORIGINAL_FONT_PLUGIN_KEY, "");
      rebound++;
      perNode.push({
        nodeId: node.id,
        family: originalFamily,
        requestedStyle: currentStyle,
        outcome: "rebound",
        appliedStyle: loadedStyle,
        attemptsTried: trace.attempts.length,
        chars: charsPreview,
      });
    } catch (err) {
      // Setting fontName failed despite the load succeeding — extremely rare
      // (e.g. font cache desync). Treat as still-missing so the user retries.
      stillMissing.add(originalFamily);
      perNode.push({
        nodeId: node.id,
        family: originalFamily,
        requestedStyle: currentStyle,
        outcome: "setFailed",
        appliedStyle: loadedStyle,
        attemptsTried: trace.attempts.length,
        firstError: err instanceof Error ? err.message : String(err),
        chars: charsPreview,
      });
    }
  }

  // ------------------------------------------------------------------
  // Diagnostic dump — read top-down to understand which families Figma
  // accepted via loadFontAsync mid-session vs which still need a desktop
  // restart for the OS font cache to expose them.
  //
  // Implementation note: Figma's plugin sandbox doesn't implement
  // `console.table`, so calling it throws and tears down the function
  // mid-run. We log per-node results as a plain JSON-stringified array
  // instead — same data, no API surface gamble.
  // ------------------------------------------------------------------
  if (total > 0) {
    console.log(
      `%c[W2W-REBIND] Per-node results (${total} marked):`,
      "color:#2196f3;font-weight:bold",
    );
    for (const r of perNode) {
      console.log(
        `  ${r.outcome.padEnd(13)} family="${r.family}" reqStyle="${r.requestedStyle}"` +
          (r.appliedStyle ? ` applied="${r.appliedStyle}"` : "") +
          ` attempts=${r.attemptsTried}` +
          (r.firstError ? ` error="${r.firstError.slice(0, 80)}"` : "") +
          (r.chars ? ` chars="${r.chars}"` : ""),
      );
    }

    // Group by outcome so the high-level pattern jumps out at a glance.
    const byOutcome: Record<string, number> = {};
    const familiesByOutcome: Record<string, Set<string>> = {};
    for (const r of perNode) {
      byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
      if (!familiesByOutcome[r.outcome]) familiesByOutcome[r.outcome] = new Set();
      familiesByOutcome[r.outcome].add(r.family);
    }
    console.log(
      `%c[W2W-REBIND] Outcome summary:`,
      "color:#2196f3;font-weight:bold",
      JSON.stringify(byOutcome),
    );
    for (const [outcome, families] of Object.entries(familiesByOutcome)) {
      console.log(
        `  ${outcome}: families = [${Array.from(families).sort().join(", ")}]`,
      );
    }
  }
  console.log(
    `%c[W2W-REBIND] Done. rebound=${rebound} stillMissing=${stillMissing.size} skippedMixed=${skippedMixed} total=${total} previouslyRebound=${previouslyRebound}`,
    "color:#4caf50;font-weight:bold",
  );

  return {
    rebound,
    total,
    stillMissing: Array.from(stillMissing).sort(),
    skippedMixed,
    previouslyRebound,
  };
}
