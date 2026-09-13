/**
 * Installed-font index + CSS Fonts Level 4 matching.
 *
 * The resolution path used to GUESS: it built a list of plausible Figma style
 * names for a weight ("Semibold", "SemiBold", "Semi Bold", …) and called
 * `loadFontAsync` on each until one stopped throwing. That can only ever find
 * a cut whose style name we thought of in advance, it models nothing about
 * stretch, and every miss is a rejected promise — thousands of them on a
 * font-heavy page, repeated for every text node.
 *
 * Here we do it the way the CSS engine does: list the installed fonts ONCE,
 * parse (weight, stretch, slant) out of every name, and run the spec's
 * matching algorithm against that index.
 *
 * The one non-obvious move — and the reason "Space Grotesk SemiBold" becomes
 * reachable from a request for "Space Grotesk" — is that each font is indexed
 * TWICE: under its literal family name, and again under its family name with
 * the style words stripped, carrying the attributes those words encoded.
 */

import { parseVariableFontAxes, deriveWeightFromPlatformFont } from "@w2w/shared";

// ============================================================================
// Word tables
// ============================================================================

/** Style words that name a weight. Keys are the token-joined, lowercased form
 *  ("Semi Bold", "SemiBold" and "semibold" all arrive here as "semibold"). */
const WEIGHT_WORDS: Readonly<Record<string, number>> = {
  thin: 100, hairline: 100,
  extralight: 200, ultralight: 200, slim: 200,
  light: 300,
  regular: 400, normal: 400, book: 400, buch: 400, roman: 400, text: 400,
  medium: 500, medm: 500, median: 500,
  semibold: 600, demibold: 600, smbld: 600, demi: 600,
  bold: 700, bulky: 700,
  extrabold: 800, ultrabold: 800, solid: 800,
  black: 900, heavy: 900,
  extrablack: 950, ultrablack: 950,
};

/** Style words that name a stretch, as the standard CSS percentages. */
const STRETCH_WORDS: Readonly<Record<string, number>> = {
  ultracondensed: 50,
  extracondensed: 62.5,
  condensed: 75,
  semicondensed: 87.5,
  normal: 100,
  semiexpanded: 112.5,
  expanded: 125,
  extraexpanded: 150,
  ultraexpanded: 200,
};

const SLANT_WORDS: ReadonlySet<string> = new Set(["italic", "italics", "oblique"]);

/** Longest phrase (in tokens) any table entry spans — "Extra Bold", "Semi
 *  Condensed". Tried before single tokens so "Semi Bold" is 600, not 700. */
const MAX_PHRASE_TOKENS = 2;

const DEFAULT_WEIGHT = 400;
const DEFAULT_STRETCH = 100;

// ============================================================================
// Parsing
// ============================================================================

export interface ParsedFontWords {
  weight: number;
  stretch: number;
  italic: boolean;
  /** True when NO weight word matched — the 400 is a default, not a reading.
   *  Exact parses win ties during matching. */
  weightDefaulted: boolean;
  /** True when no stretch word matched. */
  stretchDefaulted: boolean;
  /** Tokens left over once the style words are removed — the family's own
   *  name. This is what makes "Space Grotesk SemiBold" → "Space Grotesk". */
  rest: string[];
}

/** Split a font name into lowercase word tokens, breaking camelCase so
 *  "SemiBold" and "Semi Bold" tokenize identically. */
function tokenize(name: string): string[] {
  return String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Read (weight, stretch, slant) out of a font name — a style name or a family
 * name; the tables are the same for both.
 */
export function parseFontWords(name: string): ParsedFontWords {
  const tokens = tokenize(name);
  const rest: string[] = [];
  let weight = DEFAULT_WEIGHT;
  let stretch = DEFAULT_STRETCH;
  let italic = false;
  let weightDefaulted = true;
  let stretchDefaulted = true;

  let i = 0;
  while (i < tokens.length) {
    let consumed = 0;
    for (let len = Math.min(MAX_PHRASE_TOKENS, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join("");
      // Weight is checked first: "Normal" lives in both tables, and as a
      // Figma style name it means the 400 cut far more often than it means
      // 100% stretch (which is the default anyway, so nothing is lost).
      // Multi-token phrases are still tried before single tokens, so
      // "Semi Condensed" is read as a stretch, not as "semi" + "condensed".
      if (weightDefaulted && phrase in WEIGHT_WORDS) {
        weight = WEIGHT_WORDS[phrase];
        weightDefaulted = false;
        consumed = len;
        break;
      }
      if (stretchDefaulted && phrase in STRETCH_WORDS) {
        stretch = STRETCH_WORDS[phrase];
        stretchDefaulted = false;
        consumed = len;
        break;
      }
      if (SLANT_WORDS.has(phrase)) {
        italic = true;
        consumed = len;
        break;
      }
    }
    if (consumed === 0) {
      rest.push(tokens[i]);
      i += 1;
    } else {
      i += consumed;
    }
  }

  return { weight, stretch, italic, weightDefaulted, stretchDefaulted, rest };
}

/** Lookup key for a family name: lowercase, letters and digits only. */
export function normalizeFamilyKey(name: string): string {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * True when two family names denote the same family once normalized.
 *
 * Use this rather than comparing {@link normalizeFamilyKey} outputs directly:
 * a name built entirely from non-ASCII characters normalizes to the EMPTY
 * string ("蘋方-簡", "ヒラギノ角ゴ" and "黑体" all do), and equal-empty would
 * fuse every CJK family into one. stripe.com measures both PingFang and
 * Hiragino, so this is a live case, not a hypothetical.
 */
export function isSameFamilyName(a: string, b: string): boolean {
  const key = normalizeFamilyKey(a);
  return key.length > 0 && key === normalizeFamilyKey(b);
}

/**
 * True when drawing `family` + `style` gives the face `requested` names.
 *
 * A measured font name is often the face's FULL name — "Helvetica Neue LT GEO
 * 55 Roman" for a family "Helvetica Neue LT GEO" whose style is "55 Roman".
 * Comparing family to family calls that a substitution and stamps a Re-apply
 * marker on a node that is already showing exactly the font the page asked
 * for: goodwill.ge reported 90 layers as "still showing Inter" while every one
 * of them was drawn in the right face.
 */
export function isSameFaceName(
  requested: string,
  family: string,
  style: string,
): boolean {
  if (isSameFamilyName(requested, family)) return true;
  const key = normalizeFamilyKey(`${family}${style}`);
  return key.length > 0 && key === normalizeFamilyKey(requested);
}

/** Emoji fonts must never satisfy a text run (and vice versa). */
export function isEmojiFamilyName(name: string): boolean {
  return /emoji/i.test(String(name || ""));
}

// ============================================================================
// Index
// ============================================================================

export interface IndexedFont {
  /** Exactly what `loadFontAsync` needs — never a normalized name. */
  family: string;
  style: string;
  weight: number;
  stretch: number;
  italic: boolean;
  weightDefaulted: boolean;
  stretchDefaulted: boolean;
  isEmoji: boolean;
}

export type FontIndex = Map<string, IndexedFont[]>;

function pushEntry(index: FontIndex, key: string, entry: IndexedFont): void {
  if (!key) return;
  const list = index.get(key);
  if (list) list.push(entry);
  else index.set(key, [entry]);
}

/**
 * Build the lookup from a flat installed-font list.
 *
 * Pure (no `figma`) so the matching rules are testable on their own.
 */
export function buildFontIndex(
  fonts: ReadonlyArray<{ family: string; style: string }>,
): FontIndex {
  const index: FontIndex = new Map();

  for (const font of fonts) {
    const family = font?.family;
    const style = font?.style ?? "";
    if (!family) continue;

    const s = parseFontWords(style);
    const isEmoji = isEmojiFamilyName(family);

    pushEntry(index, normalizeFamilyKey(family), {
      family, style,
      weight: s.weight,
      stretch: s.stretch,
      italic: s.italic,
      weightDefaulted: s.weightDefaulted,
      stretchDefaulted: s.stretchDefaulted,
      isEmoji,
    });

    // Second registration under the style-word-stripped family name.
    const f = parseFontWords(family);
    const familyCarriesStyleWords =
      !f.weightDefaulted || !f.stretchDefaulted || f.italic;
    if (!familyCarriesStyleWords || f.rest.length === 0) continue;

    const strippedKey = normalizeFamilyKey(f.rest.join(""));
    if (!strippedKey || strippedKey === normalizeFamilyKey(family)) continue;

    // The STYLE wins where it says something other than the default — a
    // "Space Grotesk SemiBold" file whose cut is Bold really is a 700. Where
    // the style is silent (or just "Regular"), the family name is the only
    // thing that knows the weight, so it supplies it.
    const styleSaysWeight = !s.weightDefaulted && s.weight !== DEFAULT_WEIGHT;
    const styleSaysStretch = !s.stretchDefaulted && s.stretch !== DEFAULT_STRETCH;

    pushEntry(index, strippedKey, {
      family, style,
      weight: styleSaysWeight ? s.weight : f.weightDefaulted ? s.weight : f.weight,
      stretch: styleSaysStretch ? s.stretch : f.stretchDefaulted ? s.stretch : f.stretch,
      italic: s.italic || f.italic,
      weightDefaulted: s.weightDefaulted && f.weightDefaulted,
      stretchDefaulted: s.stretchDefaulted && f.stretchDefaulted,
      isEmoji,
    });
  }

  return index;
}

// ============================================================================
// Matching (CSS Fonts Level 4, §5.2 font style matching)
// ============================================================================

/**
 * The spec's weight fallback ordering.
 *
 * - desired 400: 400, then 500, then descending below 400, then ascending above
 * - desired 500: 500, then 400, then descending below 400, then ascending above
 * - desired < 400: descending below first, then ascending above
 * - desired > 500: ascending above first, then descending below
 *
 * Our old ladder had the last rule inverted (600 reached for Medium before
 * Bold), which is why a 600 heading on a family without a Semibold rendered
 * a step too light.
 */
export function orderWeightsBySpec(desired: number, available: number[]): number[] {
  const distinct = Array.from(new Set(available));
  const below = distinct.filter((w) => w < desired).sort((a, b) => b - a);
  const above = distinct.filter((w) => w > desired).sort((a, b) => a - b);
  const out: number[] = [];

  if (distinct.includes(desired)) out.push(desired);

  if (desired >= 400 && desired <= 500) {
    if (desired < 500) {
      out.push(...above.filter((w) => w <= 500));
      out.push(...below);
      out.push(...above.filter((w) => w > 500));
    } else {
      out.push(...below.filter((w) => w >= 400));
      out.push(...below.filter((w) => w < 400));
      out.push(...above);
    }
  } else if (desired < 400) {
    out.push(...below, ...above);
  } else {
    out.push(...above, ...below);
  }

  return out;
}

export interface FontRequest {
  family: string;
  weight?: number;
  /** CSS percentage (100 = normal). Never captured from CSS — see the module
   *  header of text.ts; it comes from parsed font names and PostScript names. */
  stretch?: number;
  italic?: boolean;
  /** Require the weight and slant to match exactly (no nearest-cut fallback).
   *  Used where switching families is only justified by an exact hit. */
  exact?: boolean;
  /** Defaults to "the requested family is itself an emoji family". */
  allowEmoji?: boolean;
}

/** Ordering of equally-distant stretches: narrower first at or below normal,
 *  wider first above it (CSS Fonts 4, §5.2). */
function stretchComparator(desired: number): (a: number, b: number) => number {
  return (a, b) => {
    const da = Math.abs(a - desired);
    const db = Math.abs(b - desired);
    if (da !== db) return da - db;
    return desired <= DEFAULT_STRETCH ? a - b : b - a;
  };
}

/**
 * Resolve a request against the index. Returns `null` when the family is not
 * installed at all — never throws, and never returns a cut from a different
 * family than the one the key resolved to.
 */
export function matchInIndex(index: FontIndex, req: FontRequest): IndexedFont | null {
  return rankInIndex(index, req)[0] ?? null;
}

/**
 * Split a face's FULL name into an installed family plus the style it names.
 *
 * `CSS.getPlatformFontsForNode` reports the font that actually rendered, and
 * for a Linotype-style face that string is the full name (`name` ID 4):
 * "Helvetica Neue LT GEO 55 Roman". macOS — and therefore Figma — registers
 * the same file as family "Helvetica Neue LT GEO" + style "55 Roman", so the
 * full name matches no family key and the face reads as missing. The
 * style-word strip above can't rescue it either: it consumes "Roman" but
 * leaves the numeric "55" in the family key.
 *
 * A prefix is accepted ONLY when the remainder is a style that family really
 * ships — the index is the evidence. Guessing from the words alone would let
 * the (always installed) "Helvetica" answer for "Helvetica Neue LT GEO 55
 * Roman": a silent substitution under the wrong name, which is exactly the
 * failure the marker/rebind flow exists to prevent.
 *
 * Longest prefix first, so a family whose own name ends in a style word keeps
 * its cuts rather than losing them to a shorter namesake.
 */
function splitFullName(
  index: FontIndex,
  name: string,
): { entries: IndexedFont[]; styleTail: string } | null {
  const tokens = tokenize(name);
  for (let k = tokens.length - 1; k >= 1; k--) {
    const entries = index.get(normalizeFamilyKey(tokens.slice(0, k).join("")));
    if (!entries || entries.length === 0) continue;

    const tail = tokens.slice(k);
    const tailKey = normalizeFamilyKey(tail.join(""));
    if (!tailKey) continue;
    if (entries.some((e) => normalizeFamilyKey(e.style) === tailKey)) {
      return { entries, styleTail: tail.join(" ") };
    }
  }
  return null;
}

/**
 * Every cut the index can offer for `req`, best first — {@link matchInIndex}
 * is this list's head.
 *
 * Callers that LOAD a font need the tail as well: Figma lists fonts it cannot
 * load. stripe.com's Söhne installs as "S?hne VF" (mangled ö) and Figma also
 * reports a "Söhne VF" with Light/Regular whose every `loadFontAsync` throws.
 * Both spellings share one normalized key, so a caller holding only the winner
 * can draw the phantom, fail, and report the whole family missing — while the
 * loadable cut sat one place further down the list.
 */
export function rankInIndex(index: FontIndex, req: FontRequest): IndexedFont[] {
  const familyName = String(req.family || "");
  if (!familyName) return [];

  let weight = req.weight ?? DEFAULT_WEIGHT;
  let stretch = req.stretch ?? DEFAULT_STRETCH;
  const italic = !!req.italic;

  let entries = index.get(normalizeFamilyKey(familyName));

  // The request's own name may carry style words the installed family doesn't
  // ("Font Awesome 6 Brands Regular" ← the measured name, vs the installed
  // "Font Awesome 6 Brands"). Strip and retry — the mirror of the index's
  // family re-parse.
  if (!entries || entries.length === 0) {
    const p = parseFontWords(familyName);
    if (p.rest.length > 0) {
      const stripped = index.get(normalizeFamilyKey(p.rest.join("")));
      if (stripped && stripped.length > 0) {
        entries = stripped;
        if (weight === DEFAULT_WEIGHT && !p.weightDefaulted) weight = p.weight;
        if (stretch === DEFAULT_STRETCH && !p.stretchDefaulted) stretch = p.stretch;
      }
    }
  }
  // Still nothing: the name may be the face's FULL name rather than its
  // family — "Helvetica Neue LT GEO 55 Roman" for an installed family
  // "Helvetica Neue LT GEO" + style "55 Roman". Split it against the index.
  if (!entries || entries.length === 0) {
    const split = splitFullName(index, familyName);
    if (split) {
      entries = split.entries;
      // The split-off tail IS the style, so it — not the family name — knows
      // the cut. Only defaults are filled in, same as the strip above.
      const tail = parseFontWords(split.styleTail);
      if (weight === DEFAULT_WEIGHT && !tail.weightDefaulted) weight = tail.weight;
      if (stretch === DEFAULT_STRETCH && !tail.stretchDefaulted) stretch = tail.stretch;
    }
  }
  if (!entries || entries.length === 0) return [];

  // Emoji partition: an emoji font in a CSS stack must not satisfy text.
  const emojiOK = req.allowEmoji ?? isEmojiFamilyName(familyName);
  let pool = entries.filter((e) => e.isEmoji === emojiOK);
  if (pool.length === 0) {
    // An emoji request may settle for a text font; a text run may not settle
    // for an emoji one.
    if (!emojiOK) return [];
    pool = entries;
  }

  // 1. Slant. Only when the family has no cut of the requested slant at all do
  //    we take the other one — never as a trade against weight.
  const sameSlant = pool.filter((e) => e.italic === italic);
  if (req.exact && sameSlant.length === 0) return [];
  const slanted = sameSlant.length > 0 ? sameSlant : pool;

  // 2. Stretch — nearest by absolute distance.
  const stretches = Array.from(new Set(slanted.map((e) => e.stretch)));
  stretches.sort(stretchComparator(stretch));

  // 3. Weight — the spec's directional fallback ordering, walked in full so
  //    the runner-up cuts stay reachable.
  if (req.exact) {
    const byStretch = slanted.filter((e) => e.stretch === stretches[0]);
    return rankTies(byStretch.filter((e) => e.weight === weight));
  }

  const out: IndexedFont[] = [];
  for (const s of stretches) {
    const byStretch = slanted.filter((e) => e.stretch === s);
    for (const w of orderWeightsBySpec(weight, byStretch.map((e) => e.weight))) {
      out.push(...rankTies(byStretch.filter((e) => e.weight === w)));
    }
  }
  return out;
}

/** Order equally-good candidates the way {@link pickBest} chooses among them:
 *  a name we actually parsed beats one that fell through to the defaults, and
 *  earlier registrations beat later ones. Stable, so the head matches. */
function rankTies(candidates: IndexedFont[]): IndexedFont[] {
  const score = (e: IndexedFont): number =>
    (e.weightDefaulted ? 1 : 0) + (e.stretchDefaulted ? 1 : 0);
  return candidates
    .map((e, i) => ({ e, i }))
    .sort((a, b) => score(a.e) - score(b.e) || a.i - b.i)
    .map((x) => x.e);
}

/** Among equally-good candidates, a name we actually parsed beats one that
 *  fell through to the defaults, and earlier registrations beat later ones. */
function pickBest(candidates: IndexedFont[]): IndexedFont | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    const score = (e: IndexedFont) =>
      (e.weightDefaulted ? 1 : 0) + (e.stretchDefaulted ? 1 : 0);
    if (score(c) < score(best)) best = c;
  }
  return best;
}

// ============================================================================
// PostScript-name refinement
// ============================================================================

/**
 * Refine a request from the PostScript name of the font that ACTUALLY
 * rendered. A PostScript name encodes the cut ("Newsreader-Italic",
 * "RobotoCondensed-Bold") and, for variable fonts, the resolved axis values
 * ("...-Buch_wght1900000" → wght 400; the axis value is 16.16 fixed point, so
 * reading those digits as a decimal weight would be wrong).
 *
 * ONLY weight, stretch and slant are ever taken from it. A family name is
 * never derived here: a malformed `name` table can put a copyright string
 * where the family belongs (stripe.com), and the capture-side
 * `isObfuscatedFont` guard exists precisely to keep that out of the file.
 *
 * A value the CSS explicitly stated is never overridden — only defaults are
 * filled in.
 */
export function refineRequestFromPostScript(
  req: FontRequest,
  postScriptName?: string,
): FontRequest {
  const ps = String(postScriptName || "").trim();
  if (!ps) return req;

  const out: FontRequest = { ...req };

  // Variable-font axes first — they are the resolved, rendered values.
  let axisWeight: number | null = null;
  try {
    const axes = parseVariableFontAxes(ps);
    if (axes && axes.wght != null) {
      axisWeight = deriveWeightFromPlatformFont({
        familyName: "",
        postScriptName: ps,
        isCustomFont: true,
        glyphCount: 1,
      });
    }
  } catch {
    // A malformed name must never cost us a text node.
  }

  // Strip the axis suffixes, then read the cut words. The part before the
  // first hyphen is the family portion ("RobotoCondensed"), which is where a
  // stretch usually hides; the part after is the cut ("Bold", "Buch").
  const bare = ps.replace(/_[a-zA-Z]{4}[0-9a-fA-F]+/g, "");
  const parsed = parseFontWords(bare);

  if ((out.weight ?? DEFAULT_WEIGHT) === DEFAULT_WEIGHT) {
    if (axisWeight != null) out.weight = axisWeight;
    else if (!parsed.weightDefaulted) out.weight = parsed.weight;
  }
  if ((out.stretch ?? DEFAULT_STRETCH) === DEFAULT_STRETCH && !parsed.stretchDefaulted) {
    out.stretch = parsed.stretch;
  }
  if (!out.italic && parsed.italic) out.italic = true;

  return out;
}

// ============================================================================
// figma-backed index + per-import memoization
// ============================================================================

interface IndexCacheEntry {
  index: Promise<FontIndex | null>;
  memo: Map<string, IndexedFont | null>;
}

// Keyed on the `figma` global so a fresh mock (or a fresh plugin session) gets
// a fresh index. One `listAvailableFontsAsync` per import, not per text node.
const indexCache = new WeakMap<object, IndexCacheEntry>();

function cacheFor(): IndexCacheEntry | null {
  try {
    if (typeof figma === "undefined") return null;
    if (typeof figma.listAvailableFontsAsync !== "function") return null;
    const key = figma as unknown as object;
    let entry = indexCache.get(key);
    if (!entry) {
      entry = {
        index: figma
          .listAvailableFontsAsync()
          .then((fonts) =>
            buildFontIndex(
              fonts.map((f) => ({
                family: f.fontName.family,
                style: f.fontName.style,
              })),
            ),
          )
          .catch(() => null),
        memo: new Map(),
      };
      indexCache.set(key, entry);
    }
    return entry;
  } catch {
    return null;
  }
}

/** True when this environment can answer index queries at all. Callers use it
 *  to decide whether the legacy guess-ladder still has to run. */
export function hasFontIndex(): boolean {
  return cacheFor() !== null;
}

/**
 * Resolve a request against the installed fonts. Memoized per request key for
 * the life of the `figma` global, so a page with thousands of text nodes
 * sharing a handful of type styles does the work a handful of times.
 *
 * Never throws — a failure here is a cosmetic wrong cut, and losing the node
 * would be far worse.
 */
export async function resolveInstalledCut(
  req: FontRequest,
): Promise<IndexedFont | null> {
  try {
    const cache = cacheFor();
    if (!cache) return null;

    const key = [
      normalizeFamilyKey(req.family),
      req.weight ?? DEFAULT_WEIGHT,
      req.stretch ?? DEFAULT_STRETCH,
      req.italic ? "i" : "n",
      req.exact ? "x" : "-",
      req.allowEmoji === undefined ? "?" : req.allowEmoji ? "e" : "t",
    ].join("|");

    const memoized = cache.memo.get(key);
    if (memoized !== undefined) return memoized;

    const index = await cache.index;
    const match = index ? matchInIndex(index, req) : null;
    cache.memo.set(key, match);
    return match;
  } catch {
    return null;
  }
}

/**
 * Every installed cut that could satisfy `req`, best first — the list form of
 * {@link resolveInstalledCut}, for callers that must actually LOAD the font
 * and need somewhere to go when the best match refuses (see
 * {@link rankInIndex}). Never throws; `[]` when nothing matches.
 */
export async function resolveInstalledCandidates(
  req: FontRequest,
): Promise<IndexedFont[]> {
  try {
    const cache = cacheFor();
    if (!cache) return [];
    const index = await cache.index;
    return index ? rankInIndex(index, req) : [];
  } catch {
    return [];
  }
}

/** The styles a family actually ships, for callers that still rank names
 *  themselves (the Re-apply flow and the legacy ladder). */
export async function getInstalledStylesFor(family: string): Promise<string[]> {
  try {
    const cache = cacheFor();
    if (!cache) return [];
    const index = await cache.index;
    if (!index) return [];
    const entries = index.get(normalizeFamilyKey(family));
    if (!entries) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of entries) {
      // Only cuts that really belong to this family name — the stripped-key
      // registrations point at a DIFFERENT family and must not be loaded
      // under this one.
      if (normalizeFamilyKey(e.family) !== normalizeFamilyKey(family)) continue;
      if (seen.has(e.style)) continue;
      seen.add(e.style);
      out.push(e.style);
    }
    return out;
  } catch {
    return [];
  }
}
