/**
 * Pseudo-state variant creation for Figma
 * Converts captured CSS pseudo-state diffs (hover/focus/active/focus-visible)
 * into Figma ComponentSet variants with prototype interactions.
 */

import { cssColorToFigmaRGB } from "./colors";
import {
  computeHoverSignature,
  type HoverComponentCache,
} from "./pseudoStateDedup";

// ============================================================================
// Types
// ============================================================================

export interface PseudoStateStyles {
  hover?: Record<string, string>;
  focus?: Record<string, string>;
  active?: Record<string, string>;
  focusVisible?: Record<string, string>;
}

/** Maps pseudo-state key to Figma variant display name */
const STATE_DISPLAY_NAMES: Record<string, string> = {
  hover: "State=Hover",
  focus: "State=Focus",
  active: "State=Active",
  focusVisible: "State=Focus Visible",
};

/** Maps pseudo-state key to Figma trigger type */
const STATE_TRIGGERS: Record<string, { type: string }> = {
  hover: { type: "ON_HOVER" },
  active: { type: "ON_PRESS" },
  focus: { type: "ON_CLICK" },
  focusVisible: { type: "ON_CLICK" },
};

// ============================================================================
// CSS Diff → Figma Property Application
// ============================================================================

/**
 * Apply a CSS property diff to a Figma FrameNode (or ComponentNode).
 * Mutates the node in-place.
 */
export interface ApplyCssDiffOpts {
  /**
   * Skip the `transform` handler entirely — no position shift, no
   * Hybrid-C drop shadow added. Used by the h2d-aligned consolidation
   * path (hoverConsolidation.ts) where hover variants must not grow
   * decorative effects that h2d doesn't emit.
   */
  skipTransform?: boolean;
}

export function applyCssDiffToNode(
  frame: FrameNode | ComponentNode,
  diff: Record<string, string>,
  opts: ApplyCssDiffOpts = {}
): void {
  for (const [prop, value] of Object.entries(diff)) {
    if (value === "__removed__") {
      applyRemovedProperty(frame, prop);
      continue;
    }

    switch (prop) {
      case "background-color":
      case "background": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          frame.fills = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
        }
        break;
      }

      case "border-color": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          frame.strokes = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
        }
        break;
      }

      case "color": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          const textNodes = frame.findAll(
            (n) => n.type === "TEXT"
          ) as TextNode[];
          for (const textNode of textNodes) {
            textNode.fills = [
              {
                type: "SOLID",
                color: parsed.color,
                opacity: parsed.opacity,
              },
            ];
          }
        }
        break;
      }

      case "opacity": {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          frame.opacity = Math.max(0, Math.min(1, num));
        }
        break;
      }

      case "border-radius": {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const maxRadius = Math.min(frame.width, frame.height) / 2;
          frame.cornerRadius = Math.min(num, maxRadius);
        }
        break;
      }

      case "border-width": {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          frame.strokeWeight = Math.max(0, num);
        }
        break;
      }

      case "box-shadow": {
        const effect = parseBoxShadow(value);
        // Replace only DROP_SHADOW effects, preserving LAYER_BLUR from filter,
        // BACKGROUND_BLUR from backdrop-filter, and INNER_SHADOW.
        setEffectsOfType(
          frame,
          ["DROP_SHADOW"],
          effect ? [effect] : [],
        );
        break;
      }

      case "outline-color": {
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          frame.strokes = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
          frame.strokeAlign = "OUTSIDE";
        }
        break;
      }

      case "text-decoration":
      case "text-decoration-line": {
        const textNodes = frame.findAll(
          (n) => n.type === "TEXT"
        ) as TextNode[];
        for (const textNode of textNodes) {
          if (value.includes("underline")) {
            textNode.textDecoration = "UNDERLINE";
          } else if (value.includes("line-through")) {
            textNode.textDecoration = "STRIKETHROUGH";
          } else if (value === "none") {
            textNode.textDecoration = "NONE";
          }
        }
        break;
      }

      // --- Expanded properties ---

      case "visibility": {
        if (value === "hidden" || value === "collapse") {
          frame.visible = false;
        } else if (value === "visible") {
          frame.visible = true;
        }
        break;
      }

      case "transform": {
        // R3 (h2d-parity): consolidation path passes skipTransform=true so
        // hover variants don't get fake drop shadows or invisible position
        // shifts that don't match h2d's actual emit.
        if (opts.skipTransform) break;
        // Parse rotation → frame.rotation (CSS clockwise → Figma counter-clockwise)
        const rotateMatch = value.match(/rotate\((-?[\d.]+)deg\)/);
        if (rotateMatch) {
          frame.rotation = -parseFloat(rotateMatch[1]);
        }

        // FIX C: Parse translateY — either from matrix(a,b,c,d,tx,ty) or
        // translateY(Npx) or translate(X, Y). This emulates the common hover
        // pattern `transform: translateY(-2px)` used for CTA buttons by
        // shifting the variant frame's y position.
        let tx = 0;
        let ty = 0;
        const matrixMatch = value.match(
          /matrix\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/,
        );
        if (matrixMatch) {
          tx = parseFloat(matrixMatch[5]);
          ty = parseFloat(matrixMatch[6]);
        } else {
          const tyMatch = value.match(/translateY\((-?[\d.]+)px\)/);
          if (tyMatch) ty = parseFloat(tyMatch[1]);
          const txMatch = value.match(/translateX\((-?[\d.]+)px\)/);
          if (txMatch) tx = parseFloat(txMatch[1]);
          const translateBoth = value.match(
            /translate\(\s*(-?[\d.]+)px\s*(?:,\s*(-?[\d.]+)px)?\s*\)/,
          );
          if (translateBoth) {
            tx = parseFloat(translateBoth[1]);
            if (translateBoth[2]) ty = parseFloat(translateBoth[2]);
          }
        }
        // Only apply if there's a meaningful shift (avoid identity matrix noise)
        const MIN_SHIFT = 0.25;
        if (!isNaN(ty) && Math.abs(ty) >= MIN_SHIFT) {
          frame.y = frame.y + ty;
        }
        if (!isNaN(tx) && Math.abs(tx) >= MIN_SHIFT) {
          frame.x = frame.x + tx;
        }

        // Hybrid C (visual hint): upward translate on interactive elements
        // gets a subtle drop-shadow so the hover state is clearly visible.
        if (!isNaN(ty) && ty <= -1) {
          const existing = Array.isArray(frame.effects) ? [...frame.effects] : [];
          existing.push({
            type: "DROP_SHADOW",
            color: { r: 0, g: 0, b: 0, a: 0.12 },
            offset: { x: 0, y: 6 },
            radius: 16,
            visible: true,
            blendMode: "NORMAL",
            showShadowBehindNode: false,
          });
          frame.effects = existing;
        }
        break;
      }

      case "outline-width": {
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0) {
          frame.strokeWeight = num;
          frame.strokeAlign = "OUTSIDE";
        }
        break;
      }

      case "letter-spacing": {
        if (value !== "normal") {
          const num = parseFloat(value);
          if (!isNaN(num)) {
            const lsTextNodes = frame.findAll(
              (n) => n.type === "TEXT"
            ) as TextNode[];
            for (const textNode of lsTextNodes) {
              textNode.letterSpacing = { value: num, unit: "PIXELS" };
            }
          }
        }
        break;
      }

      // --- FIX 3: effect-producing properties ---

      case "filter": {
        const effects = parseFilterToEffects(value);
        // Split effect types: LAYER_BLUR replaces existing blur, DROP_SHADOW
        // is appended (doesn't displace box-shadow's DROP_SHADOW).
        const blurs = effects.filter((e) => e.type === "LAYER_BLUR");
        const dropShadows = effects.filter((e) => e.type === "DROP_SHADOW");
        setEffectsOfType(frame, ["LAYER_BLUR"], blurs);
        if (dropShadows.length > 0) {
          frame.effects = [
            ...(frame.effects as readonly Effect[]),
            ...dropShadows,
          ];
        }
        break;
      }

      case "backdrop-filter": {
        const effects = parseBackdropFilterToEffects(value);
        setEffectsOfType(frame, ["BACKGROUND_BLUR"], effects);
        break;
      }

      case "text-shadow": {
        const effects = parseTextShadowToEffects(value);
        const tsTextNodes = frame.findAll(
          (n) => n.type === "TEXT",
        ) as TextNode[];
        for (const tn of tsTextNodes) {
          tn.effects = effects;
        }
        break;
      }

      case "clip-path": {
        const clips = parseClipPathToClipsContent(value);
        if (clips !== null) {
          frame.clipsContent = clips;
        }
        break;
      }

      // --- Phase 5: per-side borders, typography, geometry ---

      case "border-top-color":
      case "border-right-color":
      case "border-bottom-color":
      case "border-left-color": {
        // Figma has a single stroke color per frame (no per-side colors). We
        // approximate by setting the stroke color; per-side WIDTHs below
        // control which edge is visible — matching the Apple-nav underline
        // pattern where one side's width is 0 and another is 2px.
        const parsed = cssColorToFigmaRGB(value);
        if (parsed) {
          frame.strokes = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
        }
        break;
      }

      case "border-top-width":
      case "border-right-width":
      case "border-bottom-width":
      case "border-left-width": {
        const num = parseFloat(value);
        if (isNaN(num)) break;
        const side = prop.replace("border-", "").replace("-width", "");
        const key = `stroke${side.charAt(0).toUpperCase()}${side.slice(1)}Weight` as
          | "strokeTopWeight"
          | "strokeRightWeight"
          | "strokeBottomWeight"
          | "strokeLeftWeight";
        try {
          (frame as unknown as Record<string, number>)[key] = Math.max(0, num);
        } catch {
          // Figma may throw if strokes haven't been set yet — seed them.
          frame.strokes = frame.strokes ?? [];
        }
        break;
      }

      case "font-weight": {
        const target = parseInt(value, 10);
        if (isNaN(target)) break;
        const textNodes = frame.findAll(
          (n) => n.type === "TEXT",
        ) as TextNode[];
        const style = fontWeightToStyleName(target);
        for (const tn of textNodes) {
          const current = (tn as unknown as { fontName: FontName }).fontName;
          if (current && typeof current === "object" && "family" in current) {
            try {
              (tn as unknown as { fontName: FontName }).fontName = {
                family: current.family,
                style,
              };
            } catch {
              // Font may not be loaded in that weight — skip silently.
            }
          }
        }
        break;
      }

      case "font-size": {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) break;
        const textNodes = frame.findAll(
          (n) => n.type === "TEXT",
        ) as TextNode[];
        for (const tn of textNodes) {
          try {
            (tn as unknown as { fontSize: number }).fontSize = num;
          } catch {
            // Ignore — font may not be loaded.
          }
        }
        break;
      }

      case "text-decoration-color": {
        // Figma's text decoration color tracks the text fill; we set both.
        const parsed = cssColorToFigmaRGB(value);
        if (!parsed) break;
        const textNodes = frame.findAll(
          (n) => n.type === "TEXT",
        ) as TextNode[];
        for (const tn of textNodes) {
          tn.fills = [
            { type: "SOLID", color: parsed.color, opacity: parsed.opacity },
          ];
        }
        break;
      }

      case "text-decoration-thickness":
      case "text-underline-offset": {
        // Figma plugin API doesn't expose underline offset/thickness as
        // separate properties. The delta is captured in the hover variant's
        // style but not visually applied — documented limitation.
        break;
      }

      case "padding":
      case "padding-top":
      case "padding-right":
      case "padding-bottom":
      case "padding-left": {
        // Figma padding only applies to auto-layout frames.
        if (frame.layoutMode === "NONE") break;
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) break;
        const f = frame as unknown as {
          paddingTop: number;
          paddingRight: number;
          paddingBottom: number;
          paddingLeft: number;
        };
        if (prop === "padding") {
          f.paddingTop = num;
          f.paddingRight = num;
          f.paddingBottom = num;
          f.paddingLeft = num;
        } else if (prop === "padding-top") f.paddingTop = num;
        else if (prop === "padding-right") f.paddingRight = num;
        else if (prop === "padding-bottom") f.paddingBottom = num;
        else if (prop === "padding-left") f.paddingLeft = num;
        break;
      }

      case "gap": {
        // Legacy CSS `gap` on flex/grid → Figma itemSpacing on auto-layout.
        if (frame.layoutMode === "NONE") break;
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) break;
        (frame as unknown as { itemSpacing: number }).itemSpacing = num;
        break;
      }

      case "row-gap":
      case "column-gap": {
        if (frame.layoutMode === "NONE") break;
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) break;
        const isHorizontal = frame.layoutMode === "HORIZONTAL";
        // On horizontal layout: row-gap = counter-axis (between wrapped rows),
        //                       column-gap = main-axis (between items).
        // On vertical layout: swap.
        const isMain =
          (prop === "column-gap" && isHorizontal) ||
          (prop === "row-gap" && !isHorizontal);
        if (isMain) {
          (frame as unknown as { itemSpacing: number }).itemSpacing = num;
        } else {
          (frame as unknown as { counterAxisSpacing: number }).counterAxisSpacing = num;
        }
        break;
      }

      case "width": {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) break;
        try {
          frame.resize(num, frame.height);
        } catch {
          // Resize may throw on 0-sized frames or unsupported node types.
        }
        break;
      }

      case "height": {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) break;
        try {
          frame.resize(frame.width, num);
        } catch {
          // Ignore — see width case.
        }
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Map a numeric CSS font-weight (100-900) to the closest Figma font style
 * name. Figma uses named styles (Regular, Medium, Semibold, Bold, …) so we
 * bucket numeric weights to their nearest canonical name.
 */
function fontWeightToStyleName(weight: number): string {
  if (weight <= 150) return "Thin";
  if (weight <= 250) return "ExtraLight";
  if (weight <= 350) return "Light";
  if (weight <= 450) return "Regular";
  if (weight <= 550) return "Medium";
  if (weight <= 650) return "Semibold";
  if (weight <= 750) return "Bold";
  if (weight <= 850) return "ExtraBold";
  return "Black";
}

/**
 * Handle __removed__ marker — reset property to default
 */
function applyRemovedProperty(
  frame: FrameNode | ComponentNode,
  prop: string
): void {
  switch (prop) {
    case "background-color":
    case "background":
      frame.fills = [];
      break;
    case "border-color":
      frame.strokes = [];
      break;
    case "box-shadow":
      frame.effects = [];
      break;
    case "opacity":
      frame.opacity = 1;
      break;
    case "visibility":
      frame.visible = true;
      break;
    case "transform":
      frame.rotation = 0;
      break;
    case "outline-width":
      frame.strokeWeight = 0;
      break;

    // --- FIX 3: effect-producing property removals ---

    case "filter":
      // Clear LAYER_BLUR (and any filter-sourced DROP_SHADOW) but keep
      // BACKGROUND_BLUR from backdrop-filter. We can't distinguish
      // filter:drop-shadow from box-shadow in hindsight, so we clear all
      // DROP_SHADOW — acceptable for hover revert.
      frame.effects = (frame.effects as readonly Effect[]).filter(
        (e) => e.type !== "LAYER_BLUR" && e.type !== "DROP_SHADOW",
      );
      break;

    case "backdrop-filter":
      frame.effects = (frame.effects as readonly Effect[]).filter(
        (e) => e.type !== "BACKGROUND_BLUR",
      );
      break;

    case "text-shadow": {
      const removedTextNodes = frame.findAll(
        (n) => n.type === "TEXT",
      ) as TextNode[];
      for (const tn of removedTextNodes) {
        tn.effects = [];
      }
      break;
    }

    case "clip-path":
      frame.clipsContent = false;
      break;

    default:
      break;
  }
}

/**
 * Parse CSS box-shadow string into a Figma DROP_SHADOW effect.
 * Handles format: "Xpx Ypx Rpx [Spx] color"
 */
function parseBoxShadow(shadow: string): Effect | null {
  const match = shadow.match(
    /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s*(?:([\d.]+)px\s+)?(.*)/
  );
  if (!match) return null;

  const [, xStr, yStr, blurStr, spreadStr, colorStr] = match;
  const parsed = cssColorToFigmaRGB(colorStr.trim());
  if (!parsed) return null;

  return {
    type: "DROP_SHADOW",
    visible: true,
    color: {
      r: parsed.color.r,
      g: parsed.color.g,
      b: parsed.color.b,
      a: parsed.opacity,
    },
    offset: { x: parseFloat(xStr), y: parseFloat(yStr) },
    radius: parseFloat(blurStr),
    spread: spreadStr ? parseFloat(spreadStr) : 0,
    blendMode: "NORMAL",
    showShadowBehindNode: false,
  };
}

// ---------------------------------------------------------------------------
// FIX 3 — Effect-producing CSS parsers (filter, backdrop-filter, text-shadow,
// clip-path). All inline because the plugin doesn't depend on @w2w/shared
// at runtime.
// ---------------------------------------------------------------------------

/**
 * Replace all effects of the given type(s), preserving others.
 * Used so multiple CSS properties (filter, box-shadow, backdrop-filter) can
 * coexist in frame.effects without overwriting each other.
 */
function setEffectsOfType(
  frame: FrameNode | ComponentNode,
  typesToReplace: readonly Effect["type"][],
  newEffects: Effect[],
): void {
  const preserved = (frame.effects as readonly Effect[]).filter(
    (e) => !typesToReplace.includes(e.type),
  );
  frame.effects = [...preserved, ...newEffects];
}

/**
 * Split a CSS function string on top-level whitespace, respecting parentheses.
 *
 * Example: "blur(10px) drop-shadow(2px 2px 4px black)"
 *   → ["blur(10px)", "drop-shadow(2px 2px 4px black)"]
 */
function splitTopLevelFunctions(input: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && /\s/.test(c)) {
      const chunk = input.slice(start, i).trim();
      if (chunk) result.push(chunk);
      start = i + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last) result.push(last);
  return result;
}

/** Split on separator at top-level (outside parentheses). */
function splitTopLevelCsv(input: string, sep: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && c === sep) {
      result.push(input.slice(start, i));
      start = i + 1;
    }
  }
  result.push(input.slice(start));
  return result;
}

/**
 * Parse CSS `filter` value into Figma effects.
 * Supported: blur(Xpx) → LAYER_BLUR, drop-shadow(...) → DROP_SHADOW.
 * Ignored: brightness, contrast, saturate, hue-rotate, invert, grayscale,
 *          sepia (no Figma equivalent).
 */
function parseFilterToEffects(filter: string): Effect[] {
  if (!filter || filter === "none") return [];
  const effects: Effect[] = [];

  const functions = splitTopLevelFunctions(filter);
  for (const fn of functions) {
    const blurMatch = fn.match(/^blur\(\s*([\d.]+)px\s*\)$/);
    if (blurMatch) {
      effects.push({
        type: "LAYER_BLUR",
        visible: true,
        radius: parseFloat(blurMatch[1]),
      });
      continue;
    }

    const dsMatch = fn.match(/^drop-shadow\(\s*(.+)\s*\)$/);
    if (dsMatch) {
      const parsed = parseBoxShadow(dsMatch[1]);
      if (parsed) effects.push(parsed);
      continue;
    }
    // brightness/saturate/hue-rotate/... silently ignored — no Figma equivalent
  }
  return effects;
}

/**
 * Parse CSS `backdrop-filter` value into BACKGROUND_BLUR effects.
 * Only `blur()` maps cleanly to Figma.
 */
function parseBackdropFilterToEffects(bf: string): Effect[] {
  if (!bf || bf === "none") return [];
  const functions = splitTopLevelFunctions(bf);
  const effects: Effect[] = [];
  for (const fn of functions) {
    const blurMatch = fn.match(/^blur\(\s*([\d.]+)px\s*\)$/);
    if (blurMatch) {
      effects.push({
        type: "BACKGROUND_BLUR",
        visible: true,
        radius: parseFloat(blurMatch[1]),
      });
    }
  }
  return effects;
}

/**
 * Parse CSS `text-shadow` value into Figma DROP_SHADOW effects.
 * Handles comma-separated multiple shadows:
 *   "2px 2px 4px black, 0 0 10px blue"
 * Format per shadow: "Xpx Ypx [Blur] color" (no spread, unlike box-shadow).
 */
function parseTextShadowToEffects(ts: string): Effect[] {
  if (!ts || ts === "none") return [];
  const shadows = splitTopLevelCsv(ts, ",");
  const effects: Effect[] = [];
  for (const raw of shadows) {
    const parsed = parseBoxShadow(raw.trim());
    if (parsed) effects.push(parsed);
  }
  return effects;
}

/**
 * Parse CSS `clip-path` into a simple clipsContent boolean.
 * Returns:
 *   - true  if inset(...) — the element clips its content
 *   - false if none
 *   - null  if unsupported (circle, polygon, path, url, ellipse) — no-op
 */
function parseClipPathToClipsContent(cp: string): boolean | null {
  if (!cp || cp === "none") return false;
  if (/^inset\s*\(/.test(cp)) return true;
  return null; // unsupported
}

// ============================================================================
// Variant Creation
// ============================================================================

// ---------------------------------------------------------------------------
// FIX 4 — Descendant hover diff pluginData helpers
// ---------------------------------------------------------------------------

const HOVER_DIFF_PLUGIN_KEY = "w2w_hover_diff";

/**
 * Walk a subtree and return true if any node has a non-empty
 * `w2w_hover_diff` pluginData entry (set by nodes.ts for frames whose
 * WireframeNode had a hover diff).
 */
/**
 * FIX B: public wrapper for detectDescendantHoverDiffs so nodes.ts can
 * check before calling createPseudoStateVariants. Prevents the
 * "No active pseudo-states" throw for parents whose descendants have
 * already been turned into variant InstanceNodes.
 */
export function detectLiveDescendantHoverDiffs(
  root: FrameNode,
): boolean {
  return detectDescendantHoverDiffs(root);
}

function detectDescendantHoverDiffs(
  root: FrameNode | ComponentNode,
): boolean {
  try {
    const found = root.findOne((n) => {
      // getPluginData exists on most SceneNode types; guard with 'in'.
      if (!("getPluginData" in n)) return false;
      const data = (n as FrameNode).getPluginData(HOVER_DIFF_PLUGIN_KEY);
      return data !== "";
    });
    return found !== null;
  } catch {
    return false;
  }
}

/**
 * Walk a cloned variant and apply any pluginData-stored hover diffs to each
 * descendant. This is how parent-hover → child-visibility cases (e.g. nav
 * curtain) get their descendants transformed in the hover variant without
 * the trigger itself having a non-empty diff.
 *
 * The descendants' pluginData is preserved by Figma's `clone()` because
 * clone() deep-copies all properties including pluginData.
 */
function applyDescendantPluginDataDiffs(
  variantRoot: FrameNode | ComponentNode,
): void {
  try {
    const nodesWithDiffs = variantRoot.findAll((n) => {
      if (!("getPluginData" in n)) return false;
      return (n as FrameNode).getPluginData(HOVER_DIFF_PLUGIN_KEY) !== "";
    });

    for (const n of nodesWithDiffs) {
      // Skip the root itself — its diff is handled separately by the caller
      // via applyCssDiffToNode(variantComp, diff).
      if (n === variantRoot) continue;
      const fn = n as FrameNode;
      try {
        const diffStr = fn.getPluginData(HOVER_DIFF_PLUGIN_KEY);
        const diff = JSON.parse(diffStr) as Record<string, string>;
        applyCssDiffToNode(fn, diff);
        // Clear from the variant too so the authored file stays clean.
        fn.setPluginData(HOVER_DIFF_PLUGIN_KEY, "");
      } catch {
        // Ignore malformed pluginData
      }
    }
  } catch {
    // findAll may not be available on some mock nodes
  }
}

/**
 * Clear all `w2w_hover_diff` pluginData from a subtree so the authored
 * Figma file doesn't keep stale markers visible in the inspector.
 */
function clearHoverDiffPluginData(root: FrameNode | ComponentNode): void {
  try {
    const tagged = root.findAll((n) => {
      if (!("getPluginData" in n)) return false;
      return (n as FrameNode).getPluginData(HOVER_DIFF_PLUGIN_KEY) !== "";
    });
    for (const n of tagged) {
      try {
        (n as FrameNode).setPluginData(HOVER_DIFF_PLUGIN_KEY, "");
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore
  }
}

/**
 * Convert a rendered FrameNode into a ComponentSet with pseudo-state variants.
 * Returns the ComponentSetNode and a default InstanceNode to place in the tree.
 */
export async function createPseudoStateVariants(
  frame: FrameNode,
  pseudoStates: PseudoStateStyles,
  cache?: HoverComponentCache,
): Promise<{
  componentSet: ComponentSetNode;
  defaultInstance: InstanceNode;
  cacheHit: boolean;
}> {
  // Content-signature dedup: if this visual pattern + hover diff has already
  // produced a ComponentSet in this import, reuse it and return an instance.
  let signature: string | null = null;
  if (cache) {
    signature = computeHoverSignature(frame, pseudoStates);
    const hit = cache.get(signature);
    if (hit) {
      const parent = frame.parent as (BaseNode & ChildrenMixin) | null;
      const instance = hit.defaultComponent.createInstance();
      instance.resize(frame.width, frame.height);
      if (parent) parent.appendChild(instance);
      frame.remove();
      return {
        componentSet: hit.componentSet,
        defaultInstance: instance,
        cacheHit: true,
      };
    }
  }

  // FIX 4: accept states with empty self diff as long as the frame subtree
  // has pluginData-tagged descendant diffs. `Object.entries(pseudoStates)`
  // yields every state key that was provided, even if its value is `{}`.
  const allProvidedStates = Object.entries(pseudoStates).filter(
    ([, diff]) => diff !== undefined,
  );

  // Does the frame subtree carry any descendant hover diffs (FIX 4)?
  const hasDescendantDiffs = detectDescendantHoverDiffs(frame);

  const activeStates = allProvidedStates.filter(([, diff]) => {
    const selfHasChanges = diff && Object.keys(diff).length > 0;
    return selfHasChanges || hasDescendantDiffs;
  });

  if (activeStates.length === 0) {
    throw new Error("No active pseudo-states to create variants for");
  }

  // Phase 7: when the only captured state is hover, use the same 2D naming
  // (`variant=1, :hover=false/true`) that the registry consolidation path
  // uses. For multi-state captures we keep the legacy 1D `State=…` axis
  // because mixing 2D hover naming with 1D state names in one ComponentSet
  // would make the Figma Variants panel inconsistent.
  const singleHover =
    activeStates.length === 1 && activeStates[0][0] === "hover";

  // Step 1: Create default component from the frame
  const defaultComp = figma.createComponent();
  defaultComp.name = singleHover ? "variant=1, :hover=false" : "State=Default";
  defaultComp.resize(frame.width, frame.height);

  // Copy visual properties from frame to component
  copyFrameProperties(frame, defaultComp);

  // Move children from frame to component
  while (frame.children.length > 0) {
    defaultComp.appendChild(frame.children[0]);
  }

  // Step 2: Create variant components for each active state
  const variants = new Map<string, ComponentNode>();
  const allComponents: ComponentNode[] = [defaultComp];

  for (const [stateKey, diff] of activeStates) {
    const variantComp = defaultComp.clone();
    variantComp.name = singleHover
      ? "variant=1, :hover=true"
      : STATE_DISPLAY_NAMES[stateKey] || `State=${stateKey}`;

    // FIX 4: apply descendant hover diffs via pluginData walk BEFORE the
    // self diff, so that the self diff takes precedence on the root frame.
    if (stateKey === "hover" && hasDescendantDiffs) {
      applyDescendantPluginDataDiffs(variantComp);
    }

    // Apply the CSS diff to the variant root itself (may be empty if this
    // is a parent-hover-child case where only descendants changed).
    if (diff && Object.keys(diff).length > 0) {
      applyCssDiffToNode(variantComp, diff);
    }

    variants.set(stateKey, variantComp);
    allComponents.push(variantComp);
  }

  // FIX 4: clear pluginData markers from the default component so the
  // authored Figma file doesn't keep stale hover-diff tags visible in the
  // inspector.
  if (hasDescendantDiffs) {
    clearHoverDiffPluginData(defaultComp);
  }

  // Step 3: Combine into ComponentSet (on page level — will be moved to Components Section later)
  const componentSet = figma.combineAsVariants(
    allComponents,
    figma.currentPage as BaseNode & ChildrenMixin
  );
  componentSet.name = frame.name || "Interactive Element";

  // Step 4: Wire prototype interactions
  await wirePrototypeInteractions(defaultComp, variants);

  // Step 5: Create an instance to place in the wireframe
  const defaultInstance = defaultComp.createInstance();
  defaultInstance.resize(frame.width, frame.height);

  // Clean up original frame
  frame.remove();

  // Store in dedup cache so subsequent elements with the same signature
  // reuse this ComponentSet instead of minting a duplicate.
  if (cache && signature) {
    cache.set(signature, { componentSet, defaultComponent: defaultComp });
  }

  return { componentSet, defaultInstance, cacheHit: false };
}

/**
 * Copy visual properties from source frame to target frame/component
 */
function copyFrameProperties(
  source: FrameNode,
  target: FrameNode | ComponentNode
): void {
  target.fills = JSON.parse(JSON.stringify(source.fills));
  target.strokes = JSON.parse(JSON.stringify(source.strokes));
  target.effects = JSON.parse(JSON.stringify(source.effects));

  target.opacity = source.opacity;
  target.cornerRadius = source.cornerRadius;
  target.strokeWeight = source.strokeWeight;
  target.strokeAlign = source.strokeAlign;
  target.clipsContent = source.clipsContent;

  if (source.layoutMode !== "NONE") {
    target.layoutMode = source.layoutMode;
    target.primaryAxisSizingMode = source.primaryAxisSizingMode;
    target.counterAxisSizingMode = source.counterAxisSizingMode;
    target.paddingTop = source.paddingTop;
    target.paddingRight = source.paddingRight;
    target.paddingBottom = source.paddingBottom;
    target.paddingLeft = source.paddingLeft;
    target.itemSpacing = source.itemSpacing;
    target.primaryAxisAlignItems = source.primaryAxisAlignItems;
    target.counterAxisAlignItems = source.counterAxisAlignItems;
  }
}

// ============================================================================
// Prototype Interaction Wiring
// ============================================================================

/**
 * Wire prototype interactions on the default component.
 * - hover → ON_HOVER (auto-reverts, like CSS :hover)
 * - active → ON_PRESS (auto-reverts, like CSS :active)
 * - focus → ON_CLICK (CHANGE_TO)
 * - focusVisible → ON_CLICK (CHANGE_TO)
 */
export async function wirePrototypeInteractions(
  defaultComp: ComponentNode,
  variants: Map<string, ComponentNode>
): Promise<void> {
  const reactions: Reaction[] = [];

  const entries = Array.from(variants.entries());
  for (const [stateKey, variantComp] of entries) {
    const triggerDef = STATE_TRIGGERS[stateKey];
    if (!triggerDef) continue;

    const transition: Transition = {
      type: "SMART_ANIMATE",
      duration: stateKey === "active" ? 0.1 : 0.15,
      easing: { type: "EASE_OUT" },
    };

    reactions.push({
      trigger: triggerDef as Trigger,
      actions: [
        {
          type: "NODE",
          destinationId: variantComp.id,
          navigation: "CHANGE_TO",
          transition,
          preserveScrollPosition: false,
        },
      ],
    });
  }

  if (reactions.length > 0) {
    await defaultComp.setReactionsAsync(reactions);
  }
}
