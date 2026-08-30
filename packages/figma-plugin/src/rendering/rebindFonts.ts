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

import { fontCutExactStyles, fontStyleCandidates, orderStylesByProximity, parseStyleName } from "./styles";
import { normalizeFamilyKey, resolveInstalledCandidates } from "./fontIndex";
import { isServerFallbackFamily } from "../utils/fontUtils";
import { logger } from "../utils/logger";

// Re-exported so the rebind-side callers (text.ts, tests) keep importing the
// predicate from here even though it now lives with the other font-family
// classifiers in fontUtils.
export { isServerFallbackFamily };

/** Pluginata key written by `createTextNode` and consumed here. */
export const ORIGINAL_FONT_PLUGIN_KEY = "w2w_original_font";

/** Pluginata key stamped on MIXED text nodes: a JSON array of the substituted
 *  runs `[{ start, end, family }]`, where `family` is the real (SFNT) family
 *  each range should become. Lets Re-apply rebind only those ranges and leave
 *  runs that already show their correct font (e.g. a Newsreader <em>) intact —
 *  the node-level `ORIGINAL_FONT_PLUGIN_KEY` only records the primary family. */
export const SEGMENT_FONT_PLUGIN_KEY = "w2w_original_font_segments";

/** Pluginata key stamped when the FAMILY rendered correctly but the WEIGHT
 *  didn't — a 600 heading drawn with the family's Bold because no 600 file is
 *  installed. JSON `{ families, weight, italic }`; `families` lists the CSS
 *  name and its real (SFNT) name, real first, because a later install may
 *  register under either. Self-contained so {@link countRebindableNodes} stays
 *  a pure read of pluginData. */
export const ORIGINAL_CUT_PLUGIN_KEY = "w2w_original_cut";

/** Parsed {@link ORIGINAL_CUT_PLUGIN_KEY} payload. */
export interface PendingCut {
  families: string[];
  weight: number;
  italic: boolean;
}

/** Read a cut marker, tolerating corrupt/legacy payloads (→ `null`). */
export function parsePendingCut(json: string): PendingCut | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    const cut = parsed as Partial<PendingCut> | null;
    if (!cut || typeof cut.weight !== "number" || !Array.isArray(cut.families)) {
      return null;
    }
    const families = cut.families.filter(
      (f): f is string => typeof f === "string" && !isServerFallbackFamily(f),
    );
    if (families.length === 0) return null;
    return { families, weight: cut.weight, italic: cut.italic === true };
  } catch {
    return null;
  }
}

/** Pluginata key stamped on a text node *after* a successful rebind. Carries
 *  the family the node was rebound to. Survives the clearing of
 *  `ORIGINAL_FONT_PLUGIN_KEY` so subsequent Re-apply passes can count
 *  cumulative rebinds in scope and produce a non-misleading toast (e.g.
 *  "All 30 font(s) already re-applied" rather than "0 / 0"). */
export const REBOUND_DONE_PLUGIN_KEY = "w2w_rebound_done";

/** One pending text layer in {@link RebindableCount}: enough for the modal
 *  to render a clickable per-font list ("h1.u-text" → select & zoom). */
export interface RebindableLayer {
  id: string;
  name: string;
  /** Sorted non-fallback families this layer is still waiting for. */
  families: string[];
}

/** Result of {@link countRebindableNodes}: how many text nodes still await a
 *  re-apply, plus the (sorted, de-duped) families they're waiting for. */
export interface RebindableCount {
  count: number;
  families: string[];
  layers: RebindableLayer[];
}

/**
 * Count the text nodes in `nodes` that still carry an original-font marker
 * (node-level or per-segment), collecting the families they need re-applied.
 *
 * Pure over the node list — the sandbox runs it over the whole page (footer
 * button visibility) and over the current selection (its scoped label) from
 * one implementation. Only `getPluginData` is read, so callers can pass real
 * TextNodes or lightweight stand-ins.
 */
export function countRebindableNodes(
  nodes: Array<Pick<TextNode, "getPluginData" | "id" | "name">>,
): RebindableCount {
  const families = new Set<string>();
  const layers: RebindableLayer[] = [];
  let count = 0;
  for (const n of nodes) {
    const fam = n.getPluginData(ORIGINAL_FONT_PLUGIN_KEY);
    const segJson = n.getPluginData(SEGMENT_FONT_PLUGIN_KEY);
    // A cut marker counts on its own: the family is already right, so the
    // family/segment markers stay empty even though a weight is pending.
    const cut = fam || segJson
      ? null
      : parsePendingCut(n.getPluginData(ORIGINAL_CUT_PLUGIN_KEY));
    if (cut) {
      count++;
      families.add(cut.families[0]);
      layers.push({ id: n.id, name: n.name, families: [cut.families[0]] });
      continue;
    }
    if (!fam && !segJson) continue;
    // Server-fallback families (Liberation Sans, Noto * CJK …) are dead
    // markers — never installable via the ZIP. Exclude them so the footer
    // badge and modal only advertise families the user can actually act on.
    const nodeFamilies = new Set<string>();
    if (fam && !isServerFallbackFamily(fam)) nodeFamilies.add(fam);
    if (segJson) {
      try {
        const parsed: unknown = JSON.parse(segJson);
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            const segFam = (s as { family?: unknown } | null)?.family;
            if (typeof segFam === "string" && !isServerFallbackFamily(segFam)) {
              nodeFamilies.add(segFam);
            }
          }
        }
      } catch {
        /* corrupt segment marker — family list stays best-effort */
      }
    }
    if (nodeFamilies.size === 0) continue; // only dead fallback markers
    count++;
    nodeFamilies.forEach((f) => families.add(f));
    layers.push({
      id: n.id,
      name: n.name,
      families: Array.from(nodeFamilies).sort(),
    });
  }
  return { count, families: Array.from(families).sort(), layers };
}

/** What the sandbox posts to the Re-apply modal: {@link RebindableCount} for
 *  the scope Re-apply will actually act on, plus the page total for context. */
export interface RebindableCountPayload extends RebindableCount {
  /** Rebindable layers inside the current selection. `0` means page scope. */
  selectionCount: number;
  /** Rebindable layers on the whole page, whatever the scope. */
  pageCount: number;
}

/**
 * Describe the scope Re-apply will act on.
 *
 * `rebindOriginalFonts` runs over the SELECTION when it holds rebindable text
 * and over the page otherwise, so the numbers the modal shows must follow the
 * same rule. Reporting page-wide totals beside a "Re-apply to selection"
 * button promised 1069 layers where 6 would change.
 */
export function buildRebindableCountPayload(
  pageNodes: Array<Pick<TextNode, "getPluginData" | "id" | "name">>,
  selectionNodes: Array<Pick<TextNode, "getPluginData" | "id" | "name">>,
): RebindableCountPayload {
  const page = countRebindableNodes(pageNodes);
  const selection =
    selectionNodes.length > 0
      ? countRebindableNodes(selectionNodes)
      : { count: 0, families: [], layers: [] };

  // A selection holding nothing rebindable falls back to page scope, matching
  // what the rebind handler does with it.
  const scoped = selection.count > 0 ? selection : page;
  return {
    count: scoped.count,
    families: scoped.families,
    layers: scoped.layers,
    selectionCount: selection.count,
    pageCount: page.count,
  };
}

/** Style ladder tried in order when the node's current style isn't available
 *  on the now-installed font (e.g. user installed PSA Regular but the node
 *  was rendered with Medium). Mirrors the conventional cuts most fonts ship
 *  with. */
const STYLE_FALLBACK_LADDER = ["Regular", "Bold", "Medium", "Light", "Normal"];

/** How many ranked index candidates a rebind will try to load before falling
 *  back to the legacy ladder. A face rarely registers more than a handful of
 *  spellings; the cap keeps a pathological family from issuing hundreds of
 *  rejected loads per node. */
const MAX_INDEX_CANDIDATES = 12;

/** All spelling variants for the requested style's weight bucket ("Semi Bold"
 *  → Semibold, SemiBold, Semi Bold, DemiBold, …), so a node rendered as Inter
 *  "Semi Bold" rebinds to the target family's "Semibold" cut instead of
 *  collapsing to Regular via the generic ladder. */
function styleSpellingCandidates(preferredStyle: string): string[] {
  const { weight, italic } = parseStyleName(preferredStyle);
  return fontStyleCandidates(weight, italic);
}

/**
 * Orders a font family's ACTUAL installed styles so the closest cut to the one
 * we want is tried first. Used as a last resort when the conventional ladder
 * misses a font that only ships non-standard style names (e.g. Söhne's "Buch").
 *
 * Ranking by weight proximity — rather than "exact name, then regular-ish,
 * then everything else" — is what stops a family without a Regular from
 * rebinding every 400 run to whatever Figma happens to list first (which is
 * alphabetical, i.e. "Black Italic").
 */
function orderActualStyles(preferredStyle: string, styles: string[]): string[] {
  const { weight, italic } = parseStyleName(preferredStyle);
  return orderStylesByProximity(styles, weight, italic);
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
 * Resolve `family` to a cut that is actually installed, and load it. Returns
 * the (family, style) pair that loaded — never the requested spelling — or
 * `null` if every attempt failed.
 *
 * The returned FAMILY matters as much as the style: the name a face registers
 * under is frequently not the name we asked for. stripe.com's Söhne VF names
 * itself "Söhne VF" in its `name` table but installs as "S?hne VF" (mangled
 * ö), and the site's CSS asks for "SourceCodePro" while the installed font is
 * "Source Code Pro". Handing the requested spelling to `node.fontName` throws
 * in both cases.
 *
 * So we ask the shared font index first — the same resolution the renderer
 * uses (text.ts `resolveFamilyCut`). It matches on a normalized family key and
 * returns the exact installed strings. The legacy ladder stays as the fallback
 * for hosts with no `listAvailableFontsAsync`.
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
): Promise<{ family: string; style: string } | null> {
  const attempt = async (fam: string, style: string): Promise<boolean> => {
    try {
      await figma.loadFontAsync({ family: fam, style });
      trace.attempts.push({ family: fam, style, ok: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      trace.attempts.push({ family: fam, style, ok: false, error: message });
      return false;
    }
  };

  const { weight, italic } = parseStyleName(preferredStyle);
  // Walk the ranked candidates rather than trusting the single best: Figma
  // lists fonts it cannot load, so the winner may throw while a real cut of
  // the same face waits one place down (see rankInIndex).
  const indexCandidates = await resolveInstalledCandidates({ family, weight, italic });
  for (const cut of indexCandidates.slice(0, MAX_INDEX_CANDIDATES)) {
    if (await attempt(cut.family, cut.style)) {
      return { family: cut.family, style: cut.style };
    }
  }

  const tried = new Set<string>();
  // The conventional ladder first; then, as a last resort, the family's ACTUAL
  // installed styles. This is what rescues fonts that only ship non-standard
  // style names — e.g. Söhne installs as family "Copyright Klim Type Foundry"
  // + style "Buch", which neither the node's style nor the ladder ever names.
  const actual = orderActualStyles(
    preferredStyle,
    installedStyles.get(normalizeFamilyKey(family)) ?? [],
  );
  const candidates = [
    preferredStyle,
    ...styleSpellingCandidates(preferredStyle),
    ...STYLE_FALLBACK_LADDER,
    ...actual,
  ];
  for (const style of candidates) {
    if (tried.has(style)) continue;
    tried.add(style);
    if (await attempt(family, style)) return { family, style };
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
  // (Söhne ships "Buch", not "Regular"). Keyed NORMALIZED so a face installed
  // under a mangled or differently-spaced spelling is still reachable when the
  // index itself is unavailable. Guarded so unit envs without the font API
  // simply fall back to the conventional style ladder.
  const installedStyles = new Map<string, string[]>();
  try {
    if (typeof figma.listAvailableFontsAsync === "function") {
      const avail = await figma.listAvailableFontsAsync();
      for (const f of avail) {
        const key = normalizeFamilyKey(f.fontName.family);
        // "" is what a CJK-only name normalizes to — bucketing those together
        // would offer one CJK family's cuts for another (see isSameFamilyName).
        if (!key) continue;
        const arr = installedStyles.get(key);
        if (arr) arr.push(f.fontName.style);
        else installedStyles.set(key, [f.fontName.style]);
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
    outcome: "rebound" | "stillMissing" | "skippedMixed" | "setFailed" | "healedFallback";
    appliedStyle?: string;
    attemptsTried: number;
    firstError?: string;
    chars?: string;
  }> = [];

  // (rebind progress logging silenced for figmaUserId debug session)

  for (const node of nodes) {
    const originalFamily = node.getPluginData(ORIGINAL_FONT_PLUGIN_KEY);
    const segJson = node.getPluginData(SEGMENT_FONT_PLUGIN_KEY);
    const pendingCut =
      originalFamily || segJson
        ? null
        : parsePendingCut(node.getPluginData(ORIGINAL_CUT_PLUGIN_KEY));
    if (!originalFamily && !segJson && !pendingCut) continue;
    total++;

    const charsPreview = (node.characters || "").slice(0, 40).replace(/\s+/g, " ");

    // Cut-level pending: the family is already correct, only the weight is
    // wrong. Accept the EXACT cut and nothing else — the ladder used below for
    // family rebinds would happily re-apply the same near cut the user is
    // trying to replace, clear the marker, and call it a success.
    if (pendingCut) {
      const requestedStyle = fontCutExactStyles(pendingCut.weight, pendingCut.italic)[0];
      if (node.fontName === figma.mixed) {
        skippedMixed++;
        perNode.push({
          nodeId: node.id, family: pendingCut.families[0], requestedStyle,
          outcome: "skippedMixed", attemptsTried: 0, chars: charsPreview,
        });
        continue;
      }

      let applied: { family: string; style: string } | null = null;
      let attempts = 0;
      for (const family of pendingCut.families) {
        for (const style of fontCutExactStyles(pendingCut.weight, pendingCut.italic)) {
          attempts++;
          try {
            await figma.loadFontAsync({ family, style });
            applied = { family, style };
            break;
          } catch {
            /* try the next spelling / family */
          }
        }
        if (applied) break;
      }

      if (!applied) {
        stillMissing.add(pendingCut.families[0]);
        perNode.push({
          nodeId: node.id, family: pendingCut.families[0], requestedStyle,
          outcome: "stillMissing", attemptsTried: attempts, chars: charsPreview,
        });
        continue;
      }

      try {
        node.fontName = applied;
        node.setPluginData(ORIGINAL_CUT_PLUGIN_KEY, "");
        node.setPluginData(REBOUND_DONE_PLUGIN_KEY, applied.family);
        rebound++;
        perNode.push({
          nodeId: node.id, family: applied.family, requestedStyle,
          outcome: "rebound", appliedStyle: applied.style,
          attemptsTried: attempts, chars: charsPreview,
        });
      } catch (err) {
        perNode.push({
          nodeId: node.id, family: applied.family, requestedStyle,
          outcome: "setFailed", appliedStyle: applied.style,
          attemptsTried: attempts, chars: charsPreview,
          firstError: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // Mixed-style text: a single block can mix SEVERAL real families (e.g.
    // paco.me: Söhne body + a Newsreader-italic <em>). The render stamps a
    // per-run marker recording ONLY the substituted ranges + the real family
    // each should become. We rebind exactly those ranges — runs already showing
    // their correct font (Newsreader) are never touched. Nodes with per-run
    // markers are handled here even when the node-level marker is absent
    // (e.g. only one inline icon run was substituted).
    if (node.fontName === figma.mixed || segJson) {
      let segs: Array<{ start: number; end: number; family: string }> = [];
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
        // No per-run markers (imports predating segment stamping). The render
        // pipeline's only substitute font is Inter, so every Inter run in a
        // marked mixed node is OUR substitution artifact — rebinding exactly
        // those runs to the node's marker family is safe. Runs showing any
        // other family (their own correct font) are left untouched.
        let interRuns: Array<{ start: number; end: number; fontName: FontName }> = [];
        if (originalFamily) {
          try {
            const styled = (node as TextNode & {
              getStyledTextSegments?: (
                fields: string[],
              ) => Array<{ start: number; end: number; fontName: FontName }>;
            }).getStyledTextSegments?.(["fontName"]);
            if (Array.isArray(styled)) {
              interRuns = styled.filter((r) => r.fontName && r.fontName.family === "Inter");
            }
          } catch {
            /* runs API unavailable — keep the safe skip behavior */
          }
        }

        if (interRuns.length === 0) {
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

        // Dead server-fallback marker (pre-fix server import): if the family
        // won't load, heal the node instead of reporting it missing forever.
        if (isServerFallbackFamily(originalFamily)) {
          const probe = { nodeId: node.id, attempts: [] as Array<{ family: string; style: string; ok: boolean; error?: string }> };
          const probeStyle = await loadFontWithFallback(
            originalFamily,
            interRuns[0].fontName.style,
            probe,
            installedStyles,
          );
          if (probeStyle === null) {
            node.setPluginData(ORIGINAL_FONT_PLUGIN_KEY, "");
            total--;
            perNode.push({
              nodeId: node.id,
              family: originalFamily,
              requestedStyle: "(mixed:inter-runs)",
              outcome: "healedFallback",
              attemptsTried: probe.attempts.length,
              chars: charsPreview,
            });
            continue;
          }
        }

        const fbTrace = { nodeId: node.id, attempts: [] as Array<{ family: string; style: string; ok: boolean; error?: string }> };
        let allRunsSet = true;
        for (const r of interRuns) {
          const loaded = await loadFontWithFallback(originalFamily, r.fontName.style, fbTrace, installedStyles);
          if (loaded === null) {
            allRunsSet = false;
            stillMissing.add(originalFamily);
            continue;
          }
          try {
            node.setRangeFontName(r.start, r.end, loaded);
          } catch (err) {
            allRunsSet = false;
            stillMissing.add(originalFamily);
            fbTrace.attempts.push({
              family: loaded.family,
              style: loaded.style,
              ok: false,
              error: `setRangeFontName(${r.start},${r.end}): ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }

        if (allRunsSet) {
          node.setPluginData(REBOUND_DONE_PLUGIN_KEY, originalFamily);
          node.setPluginData(ORIGINAL_FONT_PLUGIN_KEY, "");
          rebound++;
          perNode.push({
            nodeId: node.id,
            family: originalFamily,
            requestedStyle: "(mixed:inter-runs)",
            outcome: "rebound",
            attemptsTried: fbTrace.attempts.length,
            chars: charsPreview,
          });
        } else {
          perNode.push({
            nodeId: node.id,
            family: originalFamily,
            requestedStyle: "(mixed:inter-runs)",
            outcome: "stillMissing",
            attemptsTried: fbTrace.attempts.length,
            firstError: fbTrace.attempts.find((a) => !a.ok)?.error,
            chars: charsPreview,
          });
        }
        continue;
      }

      const segTrace = { nodeId: node.id, attempts: [] as Array<{ family: string; style: string; ok: boolean; error?: string }> };
      let allRunsSet = true;
      let anyRunSet = false;
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
          // Dead server-fallback run (pre-fix server import) — heal by
          // ignoring it; the marker clears below if nothing real failed.
          if (isServerFallbackFamily(s.family)) continue;
          allRunsSet = false;
          stillMissing.add(s.family);
          continue;
        }
        try {
          node.setRangeFontName(s.start, s.end, loaded);
          anyRunSet = true;
        } catch (err) {
          allRunsSet = false;
          stillMissing.add(s.family);
          // Record WHY the set failed (e.g. "Range outside the bounds of the
          // node" when instance text was overridden after the marker was
          // stamped) — a font-load failure it is not, and the trace must say so.
          segTrace.attempts.push({
            family: loaded.family,
            style: loaded.style,
            ok: false,
            error: `setRangeFontName(${s.start},${s.end}): ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      if (allRunsSet && !anyRunSet) {
        // Every run was a healed server-fallback — clear the dead markers
        // without claiming a rebind (nothing was actually swapped).
        node.setPluginData(ORIGINAL_FONT_PLUGIN_KEY, "");
        node.setPluginData(SEGMENT_FONT_PLUGIN_KEY, "");
        total--;
        perNode.push({
          nodeId: node.id,
          family: originalFamily || segs.map((s) => s.family).join(", "),
          requestedStyle: "(mixed)",
          outcome: "healedFallback",
          attemptsTried: segTrace.attempts.length,
          chars: charsPreview,
        });
        continue;
      }

      if (allRunsSet) {
        // Segment-only nodes have no node-level marker — record the run
        // families instead so the "done" stamp is never empty (an empty
        // value would delete the key and break the cumulative count).
        node.setPluginData(
          REBOUND_DONE_PLUGIN_KEY,
          originalFamily || segs.map((s) => s.family).join(", "),
        );
        node.setPluginData(ORIGINAL_FONT_PLUGIN_KEY, "");
        node.setPluginData(SEGMENT_FONT_PLUGIN_KEY, "");
        rebound++;
        perNode.push({
          nodeId: node.id,
          family: originalFamily || segs.map((s) => s.family).join(", "),
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
    const loaded = await loadFontWithFallback(originalFamily, currentStyle, trace, installedStyles);

    if (loaded === null) {
      // Self-heal: a server-fallback family (Liberation Sans, Noto * CJK …)
      // that fails to load is a dead marker from a pre-fix server import —
      // clear it silently instead of reporting an un-installable family.
      if (isServerFallbackFamily(originalFamily)) {
        node.setPluginData(ORIGINAL_FONT_PLUGIN_KEY, "");
        total--;
        perNode.push({
          nodeId: node.id,
          family: originalFamily,
          requestedStyle: currentStyle,
          outcome: "healedFallback",
          attemptsTried: trace.attempts.length,
          chars: charsPreview,
        });
        continue;
      }
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
      // The RESOLVED pair, not the requested spelling — see
      // loadFontWithFallback: the installed family name is often different.
      node.fontName = loaded;
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
        appliedStyle: loaded.style,
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
        appliedStyle: loaded.style,
        attemptsTried: trace.attempts.length,
        firstError: err instanceof Error ? err.message : String(err),
        chars: charsPreview,
      });
    }
  }

  // Surface every non-success in the dev log (logger is a no-op in prod).
  // "149/181 rebound" alone can't say WHY 32 nodes stayed behind — the
  // per-node firstError distinguishes a font that won't load from a
  // setRangeFontName that throws on stale segment offsets.
  const failures = perNode.filter(
    (p) => p.outcome !== "rebound" && p.outcome !== "healedFallback",
  );
  if (failures.length > 0) {
    logger.info("Re-apply failures", {
      count: failures.length,
      installedStylesForMissing: Array.from(stillMissing).map((f) => ({
        family: f,
        styles:
          installedStyles.get(normalizeFamilyKey(f)) ??
          "(absent from listAvailableFontsAsync)",
      })),
      failures: failures.slice(0, 40),
    });
  }

  return {
    rebound,
    total,
    stillMissing: Array.from(stillMissing).sort(),
    skippedMixed,
    previouslyRebound,
  };
}
