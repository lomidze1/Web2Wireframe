/**
 * Font utility functions for Level 2 multi-font resolution.
 *
 * Extracted from main.ts to enable:
 * - Checking ALL fonts across all frames (not just root font)
 * - Building multi-font mapping for popup
 * - Smart default mapping (serif→Georgia, mono→Courier, etc.)
 */

import type { WireframeNode, FontMapping } from "../types";
import { fontCutExactStyles, isItalicStyle } from "../rendering/styles";

// ============================================================================
// Icon Font Detection
// ============================================================================

/** Known icon font name patterns (lowercase). Must stay in sync with shared-extraction. */
const ICON_FONT_PATTERNS = [
  "font awesome", "fontawesome", "fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-thin",
  "material icons", "material symbols",
  "bootstrap-icons", "remixicon", "icomoon", "ionicons",
  "boxicons", "phosphor", "tabler-icons", "lucide",
  "typicons", "linearicons", "simple-line-icons", "feather",
  "sf pro icons",
];

/**
 * Check if a font family is an icon font (Font Awesome, Material Icons, etc.).
 * Icon fonts must NOT be remapped to the plugin font — their glyphs are
 * Unicode codepoints that only render correctly with the original font.
 */
export function isIconFont(fontFamily: string): boolean {
  if (!fontFamily) return false;
  const lower = fontFamily.toLowerCase().replace(/['"]/g, "").trim();
  return ICON_FONT_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * True when the text is nothing but Private Use Area codepoints (plus
 * whitespace) — the signature of an icon-font glyph rendered as text.
 * Site-specific icon fonts (e.g. CS-Cart's "glyphs" / "uni2-icons") never
 * match ICON_FONT_PATTERNS by name, so PUA-only content is the reliable
 * signal that a text run is an icon and must never fall back to a text font
 * (Arial/Inter render PUA codepoints as mojibake like "Ï").
 */
export function isPuaOnlyText(text: string): boolean {
  const chars = text.replace(/\s+/g, "");
  if (!chars) return false;
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0xe000 || cp > 0xf8ff) return false;
  }
  return true;
}

// ============================================================================
// Font Style Suffix Stripping
// ============================================================================

/**
 * Common font style suffixes that CDP sometimes appends to family names.
 * e.g., "Font Awesome 6 Brands Regular" → family "Font Awesome 6 Brands" + style "Regular"
 * Ordered longest-first to avoid partial matches (e.g., "ExtraBold" before "Bold").
 */
const FONT_STYLE_SUFFIXES = [
  "ExtraBold", "SemiBold", "ExtraLight", "UltraLight", "UltraBold",
  "Regular", "Solid", "Light", "Thin", "Medium", "Bold", "Black",
  "Italic", "Heavy", "Normal",
];

/**
 * Strip a style suffix from a font family name.
 * CDP's CSS.getPlatformFontsForNode sometimes returns "Font Awesome 6 Brands Regular"
 * instead of family "Font Awesome 6 Brands" + style "Regular".
 *
 * Returns null if no suffix found.
 */
export function stripFontStyleSuffix(family: string): { family: string; style: string } | null {
  if (!family) return null;
  for (const suffix of FONT_STYLE_SUFFIXES) {
    if (family.endsWith(" " + suffix)) {
      const stripped = family.slice(0, -(suffix.length + 1)).trim();
      if (stripped.length > 0) {
        return { family: stripped, style: suffix };
      }
    }
  }
  return null;
}

// ============================================================================
// CSS Generic Font Keywords
// ============================================================================

/** CSS generic font families that should NOT be checked against Figma */
export const CSS_GENERIC_FONTS: ReadonlySet<string> = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

/** Linux server (Render) fallback families. Server-side URL imports resolve
 *  any family without a loaded @font-face to one of these via
 *  `CSS.getPlatformFontsForNode` — they are render artifacts of the capture
 *  container, never something the user should install. Conservative list:
 *  plain "Noto Sans" (a legitimate Google web font) is NOT matched. */
const SERVER_FALLBACK_PATTERNS = [
  /^Liberation (Sans|Serif|Mono)/i,
  /^DejaVu (Sans|Serif)/i,
  /^Noto (Sans|Serif) CJK/i,
  /^Noto Color Emoji$/i,
  /^Free(Sans|Serif|Mono)$/i,
];

/** True when `family` is a known Linux server fallback (see list above). */
export function isServerFallbackFamily(family: string): boolean {
  return SERVER_FALLBACK_PATTERNS.some((p) => p.test(family));
}

/** Websafe / OS-bundled families. A site references these but never serves
 *  them as @font-face, so they can never appear in the download ZIP — and
 *  browsers synthesize the weights a family doesn't ship (Arial has no real
 *  Semibold). Demanding them keeps the font modal open on something the user
 *  can never install. */
const WEBSAFE_SYSTEM_FONTS: ReadonlySet<string> = new Set([
  "arial",
  "arial black",
  "helvetica",
  "helvetica neue",
  "times",
  "times new roman",
  "georgia",
  "courier",
  "courier new",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "palatino",
  "palatino linotype",
  "garamond",
  "impact",
  "comic sans ms",
  "lucida grande",
  "lucida sans",
  "lucida sans unicode",
  "segoe ui",
  "microsoft sans serif",
  "ms sans serif",
]);

/** True when `family` is an OS-bundled websafe family (see set above). */
export function isWebsafeSystemFont(family: string): boolean {
  return WEBSAFE_SYSTEM_FONTS.has(family.trim().toLowerCase());
}

/**
 * Families that must never drive the font modal or the download ZIP: they
 * have no shippable web font file, so any demand for them is unsatisfiable.
 */
function isUnshippableFamily(family: string): boolean {
  return isServerFallbackFamily(family) || isWebsafeSystemFont(family);
}

/** CSS keywords that are not valid font names */
export const CSS_FONT_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

/**
 * Check if a font name is valid (not a CSS keyword, variable, or junk value).
 * Filters out:
 * - CSS variables: var(--font-sans)
 * - CSS keywords: inherit, initial, unset
 * - CSS generic families: serif, sans-serif, etc.
 */
export function isValidFontName(font: string): boolean {
  if (!font || font.length === 0) return false;
  if (font.startsWith("var(")) return false;
  if (CSS_FONT_KEYWORDS.has(font.toLowerCase())) return false;
  if (CSS_GENERIC_FONTS.has(font.toLowerCase())) return false;
  return true;
}

// ============================================================================
// collectAllFonts
// ============================================================================

/**
 * Walk all frames' trees to collect unique font families.
 * Includes fonts from node.fontFamily and styledSegments.
 */
export function collectAllFonts(
  frames: Array<{ viewport?: { width: number; height: number }; tree: WireframeNode }>
): Set<string> {
  const fonts = new Set<string>();

  function walkNode(node: WireframeNode): void {
    if (node.fontFamily && isValidFontName(node.fontFamily)) {
      fonts.add(node.fontFamily);
    }
    if (node.styledSegments) {
      for (const seg of node.styledSegments) {
        if (seg.fontFamily && isValidFontName(seg.fontFamily)) {
          fonts.add(seg.fontFamily);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        walkNode(child);
      }
    }
  }

  for (const frame of frames) {
    if (frame.tree) {
      walkNode(frame.tree);
    }
  }

  return fonts;
}

// ============================================================================
// collectFontUsage
// ============================================================================

/**
 * One concrete file of a family: weight + upright/italic. "SF Pro Text" is a
 * family; "SF Pro Text Light 300 Italic" is a cut.
 */
export interface FontCut {
  weight: number;
  italic: boolean;
}

const cutKey = (c: FontCut): string => `${c.weight}:${c.italic ? 1 : 0}`;

/**
 * Walk all frames and record which cuts each family is actually used at.
 * This is the demand side of the font check — only cuts the page really
 * renders can be "missing", so an unused Black Italic never drags a family
 * into the download modal.
 */
export function collectFontUsage(
  frames: Array<{ viewport?: { width: number; height: number }; tree: WireframeNode }>
): Map<string, FontCut[]> {
  const usage = new Map<string, FontCut[]>();
  const seen = new Map<string, Set<string>>();

  const add = (family: string | undefined, weight: number | undefined, style?: string | null) => {
    if (!family || !isValidFontName(family)) return;
    if (typeof weight !== "number" || !Number.isFinite(weight)) return;
    const cut: FontCut = { weight, italic: isItalicStyle(style) };
    let keys = seen.get(family);
    if (!keys) {
      keys = new Set<string>();
      seen.set(family, keys);
      usage.set(family, []);
    }
    const k = cutKey(cut);
    if (keys.has(k)) return;
    keys.add(k);
    usage.get(family)!.push(cut);
  };

  function walkNode(node: WireframeNode): void {
    add(node.fontFamily, node.fontWeight, node.fontStyle);
    if (node.styledSegments) {
      for (const seg of node.styledSegments) {
        add(seg.fontFamily || node.fontFamily, seg.fontWeight ?? node.fontWeight, seg.fontStyle ?? node.fontStyle);
      }
    }
    if (node.children) {
      for (const child of node.children) walkNode(child);
    }
  }

  for (const frame of frames) {
    if (frame.tree) walkNode(frame.tree);
  }

  return usage;
}

// ============================================================================
// checkFontsAvailability
// ============================================================================

/** Style names that read as the "default"/upright cut across foundries.
 *  Mirrors rebindFonts.ts REGULARISH_STYLES — kept in sync manually. */
const REGULARISH_STYLE_TOKENS = ["regular", "book", "buch", "normal", "roman", "text"];

/**
 * Check each font against Figma's loadFontAsync.
 * Filters out CSS generic keywords before checking.
 * For icon fonts, tries extra styles (Solid, Brands, etc.) and suffix stripping.
 *
 * Two granularities, because neither alone is right:
 *   - `missing`     — families with NO installed cut at all. These lose their
 *                     identity entirely (→ Inter + rebind marker), so they're
 *                     the ones the modal must offer to substitute.
 *   - `missingCuts` — for families that ARE installed, the specific cuts the
 *                     page uses but Figma can't load. The family still renders
 *                     under its own name (the renderer's same-family rescue
 *                     picks the nearest cut), but the download should ship
 *                     exactly these files — not the family's whole set.
 *
 * Pass `usage` (from {@link collectFontUsage}) to get per-cut results; without
 * it the check stays family-level for back-compat. Icon fonts are always
 * family-level — their glyphs don't vary by weight.
 */
export async function checkFontsAvailability(
  allFonts: Set<string>,
  usage?: Map<string, FontCut[]>
): Promise<{ available: string[]; missing: string[]; missingCuts: Record<string, FontCut[]> }> {
  const available: string[] = [];
  const missing: string[] = [];
  const missingCuts: Record<string, FontCut[]> = {};

  // Try multiple styles — some fonts only have Bold/Medium/Light, not Regular
  const stylesToTry = ["Regular", "Bold", "Medium", "Light", "Normal"];
  // Icon fonts use extra styles like "Solid", "Brands"
  const iconStylesExtra = ["Solid", "Brands", "Thin"];

  // Set of every installed family name, used as a final check for fonts whose
  // ONLY cut is a non-standard style name the ladder above never names — e.g.
  // Söhne installs as "Copyright Klim Type Foundry" with the single style
  // "Buch". Without this, such an installed font is wrongly reported missing.
  let installedFamilies = new Set<string>();
  const installedStyles = new Map<string, string[]>();
  try {
    if (typeof figma.listAvailableFontsAsync === "function") {
      const avail = await figma.listAvailableFontsAsync();
      installedFamilies = new Set(avail.map((f) => f.fontName.family));
      for (const f of avail) {
        const list = installedStyles.get(f.fontName.family);
        if (list) list.push(f.fontName.style);
        else installedStyles.set(f.fontName.family, [f.fontName.style]);
      }
    }
  } catch {
    /* font list unavailable — rely on the style-ladder checks below */
  }

  /** True when the family really ships this cut. Uses EXACT weight spellings —
   *  the renderer's neighbour fallbacks (300 → Regular) would otherwise report
   *  an absent Light as present and hide it from the download. */
  const cutLoads = async (families: string[], cut: FontCut): Promise<boolean> => {
    for (const fam of families) {
      for (const style of fontCutExactStyles(cut.weight, cut.italic)) {
        try {
          await figma.loadFontAsync({ family: fam, style });
          return true;
        } catch {
          /* try next candidate */
        }
      }
    }
    // Body weights are also covered by a family that only ships a
    // non-standard default cut name (Söhne "Buch", "55 Roman") — the
    // renderer's same-family rescue lands on it.
    if (!cut.italic && cut.weight >= 350 && cut.weight <= 450) {
      for (const fam of families) {
        const actual = installedStyles.get(fam) ?? [];
        if (actual.some((s) => {
          const sl = s.toLowerCase();
          return REGULARISH_STYLE_TOKENS.some((t) => sl.includes(t));
        })) {
          return true;
        }
      }
    }
    return false;
  };

  for (const font of Array.from(allFonts)) {
    // Skip CSS generic keywords
    if (CSS_GENERIC_FONTS.has(font)) {
      continue;
    }
    // Skip families the download can never satisfy — Linux capture-container
    // fallbacks and OS-bundled websafe families. Reporting them as missing (or
    // as missing a cut) reopens the font modal on every import for something
    // the user has no way to install, and an unmatchable entry in `missing`
    // also defeats buildFontDownloads' narrowing, re-bundling the whole ZIP.
    if (isUnshippableFamily(font)) {
      continue;
    }

    const isIcon = isIconFont(font);
    const styles = isIcon ? [...stylesToTry, ...iconStylesExtra] : stylesToTry;

    // Per-cut path. Icon fonts stay family-level — one glyph set, no weights.
    const cuts = !isIcon ? usage?.get(font) : undefined;
    if (cuts && cuts.length > 0) {
      const stripped = stripFontStyleSuffix(font);
      const familiesToTry = stripped ? [font, stripped.family] : [font];
      const absent: FontCut[] = [];
      let anyLoaded = false;
      for (const cut of cuts) {
        if (await cutLoads(familiesToTry, cut)) anyLoaded = true;
        else absent.push(cut);
      }

      if (anyLoaded || familiesToTry.some((f) => installedFamilies.has(f))) {
        // The family exists in Figma — it keeps its name on every node via the
        // renderer's same-family rescue. Only the absent cuts are worth shipping.
        available.push(font);
        if (absent.length > 0) missingCuts[font] = absent;
      } else {
        // Nothing of this family loads — it degrades to Inter, so it's the
        // modal's business as a whole family.
        missing.push(font);
      }
      continue;
    }

    let isAvailable = false;
    for (const style of styles) {
      try {
        await figma.loadFontAsync({ family: font, style });
        isAvailable = true;
        break;
      } catch {
        // Try next style
      }
    }

    // If not found, try suffix stripping (e.g., "Font Awesome 6 Brands Regular" → "Font Awesome 6 Brands")
    if (!isAvailable) {
      const stripped = stripFontStyleSuffix(font);
      if (stripped) {
        const strippedStyles = isIcon ? [stripped.style, ...styles] : [stripped.style, ...stylesToTry];
        for (const style of strippedStyles) {
          try {
            await figma.loadFontAsync({ family: stripped.family, style });
            isAvailable = true;
            break;
          } catch { /* try next */ }
        }
      }
    }

    // If still not found and icon font, try version variants (v6→v5, v5→v6)
    if (!isAvailable && isIcon) {
      const vMatch = font.match(/^(.+?)(\d+)(.+)$/);
      if (vMatch) {
        const [, prefix, version, suffix] = vMatch;
        const altVersions = version === "6" ? ["5"] : version === "5" ? ["6"] : [];
        for (const v of altVersions) {
          const altFamily = `${prefix}${v}${suffix}`;
          for (const style of styles) {
            try {
              await figma.loadFontAsync({ family: altFamily, style });
              isAvailable = true;
              break;
            } catch { /* try next */ }
          }
          if (isAvailable) break;
        }
      }
    }

    // Final check: the family is installed, but only under a style name none
    // of the ladders tried (e.g. Söhne's "Buch"). Presence in the installed
    // list is enough — the rebind step resolves the exact cut later.
    if (!isAvailable && installedFamilies.has(font)) {
      isAvailable = true;
    }

    if (isAvailable) {
      available.push(font);
    } else {
      missing.push(font);
    }
  }

  return { available, missing, missingCuts };
}

// ============================================================================
// buildDefaultFontMapping
// ============================================================================

/**
 * Create smart default mapping for missing fonts.
 * - Font name contains "serif" (not "sans") → Georgia
 * - Font name contains "mono" → Courier
 * - Otherwise → pluginFont
 */
export function buildDefaultFontMapping(
  missingFonts: string[],
  pluginFont: string
): FontMapping {
  const mapping: FontMapping = {};

  for (const font of missingFonts) {
    // Icon fonts: identity mapping — preserve original font for Unicode glyphs
    if (isIconFont(font)) {
      mapping[font] = font;
      continue;
    }

    const lower = font.toLowerCase();
    if (lower.includes("mono")) {
      mapping[font] = "Courier";
    } else if (lower.includes("serif") && !lower.includes("sans")) {
      mapping[font] = "Georgia";
    } else {
      mapping[font] = pluginFont;
    }
  }

  return mapping;
}

// ============================================================================
// partitionMissingFonts / buildChoiceRenderPlan
// ============================================================================

/**
 * Split "missing" CSS families into auto-resolvable vs genuinely missing.
 * A missing CSS family whose real (SFNT) name is already installed — Söhne's
 * "Copyright Klim Type Foundry" — renders via the marker + rebind path with
 * no user interaction. Only the rest belongs in the Download-Fonts modal.
 */
export function partitionMissingFonts(
  missing: string[],
  realNames: FontMapping,
  installedFamilies: Set<string>
): { autoOriginal: FontMapping; stillMissing: string[] } {
  const autoOriginal: FontMapping = {};
  const stillMissing: string[] = [];

  for (const css of missing) {
    const real = realNames[css];
    if (real && real !== css && installedFamilies.has(real)) {
      autoOriginal[css] = real;
    } else {
      stillMissing.push(css);
    }
  }

  return { autoOriginal, stillMissing };
}

/**
 * Build the render plan for a font-fallback-choice. The modal only sees the
 * still-missing fonts; auto-resolvable ones must ALWAYS render Inter with an
 * original-name marker so the post-render rebind can swap in the installed
 * real font — regardless of what the user picked for the rest.
 */
export function buildChoiceRenderPlan(
  choice: string,
  fontMapping: FontMapping,
  autoOriginal: FontMapping
): { primaryFont: string; renderMapping: FontMapping; originalFontNames?: FontMapping } {
  if (choice === "continue") {
    // "Use original fonts": render with Inter, preserve original names for
    // Text Styles + rebind markers.
    const renderMapping: FontMapping = {};
    for (const original of Object.keys(fontMapping)) renderMapping[original] = "Inter";
    for (const original of Object.keys(autoOriginal)) renderMapping[original] = "Inter";
    return {
      primaryFont: "Inter",
      renderMapping,
      originalFontNames: { ...fontMapping, ...autoOriginal },
    };
  }

  // "fallback" or "plugin": use the modal's mapping directly; auto-resolved
  // fonts still take the Inter + marker route.
  const renderMapping: FontMapping = { ...fontMapping };
  for (const original of Object.keys(autoOriginal)) renderMapping[original] = "Inter";
  return {
    primaryFont: Object.values(fontMapping)[0] || "Inter",
    renderMapping,
    originalFontNames: Object.keys(autoOriginal).length > 0 ? { ...autoOriginal } : undefined,
  };
}

// ============================================================================
// buildDownloadCuts
// ============================================================================

/**
 * Merge the cuts that should narrow the download ZIP for every family the modal
 * offers, keyed by CSS family:
 *
 *   - Partial families (installed, some cuts absent) keep their `missingCuts`
 *     entry — only the absent cuts are worth shipping.
 *   - Fully-missing families (nothing installed → whole family degrades to
 *     Inter) get their *used* cuts from `fontUsage`, so the ZIP carries only the
 *     weights the page actually renders instead of every declared @font-face.
 *
 * A fully-missing family with no recorded usage is omitted, so the downstream
 * `filterExtractedFontsToCuts` safety net still ships its full set rather than
 * an empty one.
 */
export function buildDownloadCuts(
  missing: string[],
  missingCuts: Record<string, FontCut[]>,
  fontUsage: Map<string, FontCut[]>,
): Record<string, FontCut[]> {
  const result: Record<string, FontCut[]> = { ...missingCuts };
  for (const family of missing) {
    // Partial families already carry their (absent) cuts — don't overwrite.
    if (result[family]) continue;
    const used = fontUsage.get(family);
    if (used && used.length > 0) result[family] = used;
  }
  return result;
}

// ============================================================================
// buildFontDeclaredCuts / filterMissingCutsToDeclared
// ============================================================================

/** CSS weight value(s) → numeric weights. Handles keywords, plain numbers and
 *  variable-font ranges ("100 900" → both endpoints). Unparseable → [400]. */
function parseCssWeights(value: string): number[] {
  const weights: number[] = [];
  for (const token of value.trim().split(/\s+/)) {
    const lower = token.toLowerCase();
    if (lower === "normal") weights.push(400);
    else if (lower === "bold") weights.push(700);
    else {
      const n = Number.parseInt(lower, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 1000) weights.push(n);
    }
  }
  return weights.length > 0 ? weights : [400];
}

/**
 * Map each CSS family to the cuts its @font-face entries actually DECLARE —
 * the supply side of the font check. Accepts both metadata shapes
 * (extension `{family, weight, style}` / API `{fontFamily, fontWeight,
 * fontStyle}`). Variable-font ranges contribute their endpoints.
 */
export function buildFontDeclaredCuts(
  extractedFonts?: unknown[],
): Record<string, FontCut[]> {
  const map: Record<string, FontCut[]> = {};
  if (!extractedFonts) return map;
  for (const ef of extractedFonts) {
    const font = ef as {
      family?: string;
      fontFamily?: string;
      weight?: string | number;
      fontWeight?: string | number;
      style?: string;
      fontStyle?: string;
    };
    const family = font.fontFamily || font.family;
    if (!family) continue;
    const italic = /italic|oblique/i.test(String(font.fontStyle ?? font.style ?? ""));
    for (const weight of parseCssWeights(String(font.fontWeight ?? font.weight ?? "400"))) {
      const list = map[family] ?? (map[family] = []);
      if (!list.some((c) => c.weight === weight && c.italic === italic)) {
        list.push({ weight, italic });
      }
    }
  }
  return map;
}

/**
 * Drop missing cuts that no declared @font-face can actually provide.
 *
 * telex.ge's BPG Nino Mtavruli ships ONE 400 file and the page fakes bold —
 * the used-but-uninstallable 700 cut reopened the download modal on every
 * import, offering a file that exists nowhere. A missing cut stays only when
 * the site declares a same-slant face at that weight (or a range/pair of
 * declared weights brackets it). Families absent from `declaredCuts` pass
 * through untouched — no declaration info is not evidence of absence.
 */
export function filterMissingCutsToDeclared(
  missingCuts: Record<string, FontCut[]>,
  declaredCuts: Record<string, FontCut[]>,
): Record<string, FontCut[]> {
  const result: Record<string, FontCut[]> = {};
  for (const [family, cuts] of Object.entries(missingCuts)) {
    const declared = declaredCuts[family];
    if (!declared || declared.length === 0) {
      result[family] = cuts;
      continue;
    }
    const kept = cuts.filter((cut) => {
      const sameSlant = declared.filter((d) => d.italic === cut.italic);
      if (sameSlant.length === 0) return false;
      const weights = sameSlant.map((d) => d.weight);
      return (
        weights.includes(cut.weight) ||
        (cut.weight > Math.min(...weights) && cut.weight < Math.max(...weights))
      );
    });
    if (kept.length > 0) result[family] = kept;
  }
  return result;
}

// ============================================================================
// buildFontsNotAvailableMessage
// ============================================================================

/**
 * Build the `fonts-not-available` message to send from sandbox to UI.
 */
export function buildFontsNotAvailableMessage(
  missingFonts: string[],
  pluginFont: string,
  pluginFontOptions: string[],
  missingCuts?: Record<string, FontCut[]>
): {
  type: "fonts-not-available";
  data: {
    missingFonts: string[];
    defaultMapping: FontMapping;
    pluginFont: string;
    pluginFontOptions: string[];
    /** Per family, the specific cuts the page needs but Figma lacks. The UI
     *  narrows the download ZIP to these files instead of shipping the whole
     *  family. Absent/empty for families missing in their entirety. */
    missingCuts?: Record<string, FontCut[]>;
  };
} {
  const defaultMapping = buildDefaultFontMapping(missingFonts, pluginFont);

  return {
    type: "fonts-not-available",
    data: {
      missingFonts,
      defaultMapping,
      pluginFont,
      pluginFontOptions,
      missingCuts,
    },
  };
}

// ============================================================================
// buildPluginModeFontMapping
// ============================================================================

/**
 * For plugin mode: map ALL website fonts to the single pluginFont.
 * Excludes CSS generic keywords.
 */
export function buildPluginModeFontMapping(
  allFonts: Set<string>,
  pluginFont: string
): FontMapping {
  const mapping: FontMapping = {};

  for (const font of Array.from(allFonts)) {
    // Skip CSS generic keywords and icon fonts
    if (!CSS_GENERIC_FONTS.has(font) && !isIconFont(font)) {
      mapping[font] = pluginFont;
    }
  }

  return mapping;
}

// ============================================================================
// parseFontSrcUrls
// ============================================================================

/**
 * Parse font download URLs from a CSS-like `src` declaration.
 * Handles two shapes that show up in practice:
 *   1. Standard CSS:        `url('https://...woff2') format('woff2')`
 *   2. W2W API cleanSrc:    `https://...woff2` (the `url(...)` wrapper is
 *                           stripped by the backend before sending)
 * Ignores data URIs and relative paths — only absolute http/https URLs.
 */
export function parseFontSrcUrls(src: string): string[] {
  const urls: string[] = [];

  // Pass 1: url('...')-wrapped form
  const wrappedRegex = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/g;
  let match: RegExpExecArray | null;
  while ((match = wrappedRegex.exec(src)) !== null) {
    urls.push(match[1]);
  }

  // Pass 2 (fallback): bare http(s):// URLs anywhere in the string. Only
  // run when no wrapped URLs were found, so we don't double-emit on
  // standard CSS input.
  if (urls.length === 0) {
    const bareRegex = /https?:\/\/[^\s'"),]+/g;
    while ((match = bareRegex.exec(src)) !== null) {
      urls.push(match[0]);
    }
  }

  return urls;
}
