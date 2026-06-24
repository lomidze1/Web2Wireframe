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

/** Pluginata key stamped on MIXED text nodes: a JSON array of the substituted
 *  runs `[{ start, end, family }]`, where `family` is the real (SFNT) family
 *  each range should become. Lets Re-apply rebind only those ranges and leave
 *  runs that already show their correct font (e.g. a Newsreader <em>) intact —
 *  the node-level `ORIGINAL_FONT_PLUGIN_KEY` only records the primary family. */
export const SEGMENT_FONT_PLUGIN_KEY = "w2w_original_font_segments";

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

/** Style names that read as the "default"/upright cut across foundries. Söhne
 *  ships "Buch" (German for Book), other foundries use "Roman"/"Text" — none of
 *  which appear in the conventional ladder above. */
const REGULARISH_STYLES = ["regular", "book", "buch", "normal", "roman", "text"];

/**
 * Orders a font family's ACTUAL installed styles so the most sensible cut is
 * tried first: an exact match to the requested style, then a regular-ish one,
 * then everything else. Used as a last resort when the conventional ladder
 * misses a font that only ships non-standard style names (e.g. "Buch").
 */
function orderActualStyles(preferredStyle: string, styles: string[]): string[] {
  const wanted = preferredStyle.toLowerCase();
  const rank = (s: string): number => {
    const sl = s.toLowerCase();
    if (sl === wanted) return 0;
    if (REGULARISH_STYLES.includes(sl)) return 1;
    return 2;
  };
  return [...styles].sort((a, b) => rank(a) - rank(b));
}

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
  installedStyles: Map<string, string[]>,
): Promise<string | null> {
  const tried = new Set<string>();
  // The conventional ladder first; then, as a last resort, the family's ACTUAL
  // installed styles. This is what rescues fonts that only ship non-standard
  // style names — e.g. Söhne installs as family "Copyright Klim Type Foundry"
  // + style "Buch", which neither the node's style nor the ladder ever names.
  const actual = orderActualStyles(
    preferredStyle,
    installedStyles.get(family) ?? [],
  );
  const candidates = [preferredStyle, ...STYLE_FALLBACK_LADDER, ...actual];
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

  // Map of installed family → its actual available styles, fetched once. Lets
  // loadFontWithFallback rescue fonts whose only styles are non-standard names
  // (Söhne ships "Buch", not "Regular"). Guarded so unit envs without the
  // font API simply fall back to the conventional style ladder.
  const installedStyles = new Map<string, string[]>();
  try {
    if (typeof figma.listAvailableFontsAsync === "function") {
      const avail = await figma.listAvailableFontsAsync();
      for (const f of avail) {
        const fam = f.fontName.family;
        const arr = installedStyles.get(fam);
        if (arr) arr.push(f.fontName.style);
        else installedStyles.set(fam, [f.fontName.style]);
      }
    }
  } catch {
    /* font list unavailable — ladder-only behavior */
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

  // (rebind progress logging silenced for figmaUserId debug session)

  for (const node of nodes) {
    const originalFamily = node.getPluginData(ORIGINAL_FONT_PLUGIN_KEY);
    if (!originalFamily) continue;
    total++;

    const charsPreview = (node.characters || "").slice(0, 40).replace(/\s+/g, " ");

    // Mixed-style text: a single block can mix SEVERAL real families (e.g.
    // paco.me: Söhne body + a Newsreader-italic <em>). The render stamps a
    // per-run marker recording ONLY the substituted ranges + the real family
    // each should become. We rebind exactly those ranges — runs already showing
    // their correct font (Newsreader) are never touched. Without the per-run
    // marker we can't tell the runs apart, so we skip (the safe old behavior).
    if (node.fontName === figma.mixed) {
      let segs: Array<{ start: number; end: number; family: string }> = [];
      const segJson = node.getPluginData(SEGMENT_FONT_PLUGIN_KEY);
      if (segJson) {
        try {
          const parsed: unknown = JSON.parse(segJson);
          if (Array.isArray(parsed)) {
            segs = parsed as Array<{ start: number; end: number; family: string }>;
          }
        } catch {
          /* corrupt marker — treat as no per-run data */
        }
      }

      if (segs.length === 0) {
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

      const segTrace = { nodeId: node.id, attempts: [] as Array<{ family: string; style: string; ok: boolean; error?: string }> };
      let allRunsSet = true;
      for (const s of segs) {
        if (
          typeof s.start !== "number" ||
          typeof s.end !== "number" ||
          s.end <= s.start ||
          !s.family
        ) {
          continue; // skip malformed entry without failing the whole node
        }
        // Use the range's current style to pick the matching cut of the real
        // family (loadFontWithFallback also tries the family's installed cuts).
        let curStyle = "Regular";
        try {
          const cur = node.getRangeFontName(s.start, s.end);
          if (cur !== figma.mixed) curStyle = (cur as FontName).style;
        } catch {
          /* fall back to "Regular" */
        }
        const loaded = await loadFontWithFallback(s.family, curStyle, segTrace, installedStyles);
        if (loaded === null) {
          allRunsSet = false;
          stillMissing.add(s.family);
          continue;
        }
        try {
          node.setRangeFontName(s.start, s.end, { family: s.family, style: loaded });
        } catch {
          allRunsSet = false;
          stillMissing.add(s.family);
        }
      }

      if (allRunsSet) {
        node.setPluginData(REBOUND_DONE_PLUGIN_KEY, originalFamily);
        node.setPluginData(ORIGINAL_FONT_PLUGIN_KEY, "");
        node.setPluginData(SEGMENT_FONT_PLUGIN_KEY, "");
        rebound++;
        perNode.push({
          nodeId: node.id,
          family: originalFamily,
          requestedStyle: "(mixed)",
          outcome: "rebound",
          attemptsTried: segTrace.attempts.length,
          chars: charsPreview,
        });
      } else {
        perNode.push({
          nodeId: node.id,
          family: originalFamily,
          requestedStyle: "(mixed)",
          outcome: "stillMissing",
          attemptsTried: segTrace.attempts.length,
          firstError: segTrace.attempts.find((a) => !a.ok)?.error,
          chars: charsPreview,
        });
      }
      continue;
    }

    const currentStyle = (node.fontName as FontName).style;
    const trace = { nodeId: node.id, attempts: [] as Array<{ family: string; style: string; ok: boolean; error?: string }> };
    const loadedStyle = await loadFontWithFallback(originalFamily, currentStyle, trace, installedStyles);

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

  // Per-node breakdown is collected for future diagnostics but not logged in
  // normal runs (Figma's sandbox lacks console.table; plain logs are noisy).
  void perNode;

  return {
    rebound,
    total,
    stillMissing: Array.from(stillMissing).sort(),
    skippedMixed,
    previouslyRebound,
  };
}
