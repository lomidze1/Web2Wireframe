/**
 * Post-import contrast count — read-only. Feeds the "Fix all via styles — Pro"
 * fake-door card: it only tells the user how many text layers fail WCAG AA and
 * how many Paint Styles those failures sit on. Nothing on the canvas changes.
 *
 * Deliberately a rough approximation: a text's background is the nearest
 * ancestor with a visible fill, and only a single opaque SOLID fill counts.
 * Gradients, images, translucent or stacked fills are skipped rather than
 * guessed, so every counted issue is a real one.
 */
import {
  isLargeText,
  passesContrast,
  requiredRatio,
  type RGBA,
} from "../utils/contrast";

/** Big files: check this many text layers at most and report "at least N". */
export const CONTRAST_AUDIT_LIMIT = 2000;

export interface ContrastAuditResult {
  /** Text layers that fail WCAG AA against their background. */
  issues: number;
  /** Unique Paint Styles those failing layers use. */
  styles: number;
  /** Unique colors of failing layers that have no Paint Style (the default
   *  "Direct" import mode creates none) — each is one style a fix would add. */
  colors: number;
  /** More text layers existed than were checked. */
  capped: boolean;
}

function visiblePaints(fills: readonly Paint[] | PluginAPI["mixed"]): Paint[] | null {
  if (!Array.isArray(fills)) return null; // figma.mixed
  return (fills as readonly Paint[]).filter((p) => p.visible !== false);
}

/** The one opaque solid color of `fills`, or null when it isn't that simple. */
function soleSolid(paints: Paint[], alphaScale = 1): RGBA | null {
  if (paints.length !== 1 || paints[0].type !== "SOLID") return null;
  const p = paints[0] as SolidPaint;
  const a = (p.opacity ?? 1) * alphaScale;
  return { r: p.color.r, g: p.color.g, b: p.color.b, a };
}

/** 8-bit RGBA key, so float noise doesn't split one CSS color into two. */
function colorKey(c: RGBA): string {
  return [c.r, c.g, c.b, c.a].map((v) => Math.round(v * 255)).join(",");
}

export function auditTextContrast(
  texts: readonly TextNode[],
  limit = CONTRAST_AUDIT_LIMIT,
): ContrastAuditResult {
  // Background per ancestor id — siblings share a parent, so most lookups hit.
  const bgCache = new Map<string, RGBA | null>();

  const backgroundOf = (node: BaseNode): RGBA | null => {
    let current = node.parent;
    const visited: string[] = [];
    let result: RGBA | null = null;
    while (current && "fills" in current) {
      const cached = bgCache.get(current.id);
      if (cached !== undefined) {
        result = cached;
        break;
      }
      visited.push(current.id);
      const paints = visiblePaints((current as GeometryMixin).fills);
      if (paints === null) break; // mixed fills → can't judge
      if (paints.length > 0) {
        const solid = soleSolid(paints);
        result = solid && solid.a >= 0.999 ? { ...solid, a: 1 } : null;
        break;
      }
      current = current.parent;
    }
    for (const id of visited) bgCache.set(id, result);
    return result;
  };

  let issues = 0;
  const styleIds = new Set<string>();
  const colorKeys = new Set<string>();
  const checked = texts.slice(0, limit);

  for (const t of checked) {
    if (t.visible === false) continue;
    const paints = visiblePaints(t.fills);
    if (!paints) continue;
    const fg = soleSolid(paints, t.opacity ?? 1);
    if (!fg) continue;
    if (typeof t.fontSize !== "number" || typeof t.fontWeight !== "number") continue;
    const bg = backgroundOf(t);
    if (!bg) continue;

    const required = requiredRatio(isLargeText(t.fontSize, t.fontWeight), "AA");
    if (passesContrast(fg, bg, required)) continue;

    issues++;
    if (typeof t.fillStyleId === "string" && t.fillStyleId !== "") {
      styleIds.add(t.fillStyleId);
    } else {
      colorKeys.add(colorKey(fg));
    }
  }

  return {
    issues,
    styles: styleIds.size,
    colors: colorKeys.size,
    capped: texts.length > limit,
  };
}
