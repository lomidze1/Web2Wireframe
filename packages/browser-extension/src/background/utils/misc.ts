import type { ExtractedElement } from "@w2w/shared";
import { generateId } from "@w2w/shared";

/**
 * Build a placeholder element that fills the user-selected area. Used by
 * area-capture flows when the actual DOM tree is unavailable so the
 * resulting wireframe still has correct geometry.
 */
export function createEmptyElement(
  width: number,
  height: number,
): ExtractedElement {
  return {
    id: generateId(),
    type: "frame",
    tag: "div",
    name: "Selected Area",
    x: 0,
    y: 0,
    width,
    height,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fills: [],
    strokes: [],
    effects: [],
    backgroundColor: null,
    backgroundGradient: null,
    textColor: null,
    borderColor: null,
    borderWidth: 0,
    borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    boxShadow: null,
    fontFamily: "Inter",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: "left",
    textContent: "",
    opacity: 1,
    isPlaceholder: false,
    children: [],
  };
}

/**
 * Bucket a CSS custom property into a coarse design-token category. Used
 * downstream to populate Figma's variable collections (Colors, Typography,
 * Spacing, Radius, Shadow, Border) without forcing the user to triage
 * hundreds of raw `--foo` definitions by hand.
 *
 * Name patterns win over value patterns — a `--text-bg` variable holding
 * `16px` is still a "color" bucket because the *name* says so. Falls back
 * to value-based hints (`#`, `rgb()`, `hsl()`, length units) and finally
 * to `"other"`.
 */
export function categorizeCSSVariable(name: string, value: string): string {
  const nameLower = name.toLowerCase();

  if (
    nameLower.includes("color") ||
    nameLower.includes("bg") ||
    nameLower.includes("text")
  ) {
    return "color";
  }
  if (
    nameLower.includes("font") ||
    nameLower.includes("text-size") ||
    nameLower.includes("line-height")
  ) {
    return "typography";
  }
  if (
    nameLower.includes("spacing") ||
    nameLower.includes("gap") ||
    nameLower.includes("padding") ||
    nameLower.includes("margin")
  ) {
    return "spacing";
  }
  if (nameLower.includes("radius") || nameLower.includes("rounded")) {
    return "radius";
  }
  if (nameLower.includes("shadow")) {
    return "shadow";
  }
  if (nameLower.includes("border")) {
    return "border";
  }

  const valueLower = value.toLowerCase();
  if (
    valueLower.startsWith("#") ||
    valueLower.startsWith("rgb") ||
    valueLower.startsWith("hsl")
  ) {
    return "color";
  }
  if (
    valueLower.includes("px") ||
    valueLower.includes("rem") ||
    valueLower.includes("em")
  ) {
    if (nameLower.includes("size")) {
      return "typography";
    }
    return "spacing";
  }

  return "other";
}
