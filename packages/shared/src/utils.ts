/**
 * Shared Utility Functions
 * Helper functions used during DOM extraction
 */

/**
 * Resolve a potentially relative URL against a base document URL.
 *
 * - `""` / `undefined` → `undefined`
 * - Already absolute (`https:`, `http:`, `//`, `data:`, `blob:`) → pass-through
 * - Relative + valid baseUrl → `new URL(url, baseUrl).href`
 * - Relative + missing/invalid baseUrl → as-is (backward compat)
 */
export function resolveUrl(
  url: string | undefined,
  baseUrl: string | undefined
): string | undefined {
  if (!url) return undefined;

  // Already absolute — pass through
  if (
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("//") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  // No base → can't resolve, return as-is
  if (!baseUrl) return url;

  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

/**
 * Parse color string to hex format
 */
export function parseColor(color: string | null | undefined): string | null {
  if (!color || color === "transparent") {
    return null;
  }

  const trimmed = color.trim();

  // Check for fully transparent colors
  if (
    trimmed === "rgba(0, 0, 0, 0)" ||
    trimmed === "rgba(0,0,0,0)" ||
    trimmed.match(/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/)
  ) {
    return null;
  }

  // Already hex
  if (trimmed.startsWith("#")) {
    // Handle shorthand hex (#RGB -> #RRGGBB)
    if (trimmed.length === 4) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return trimmed.toUpperCase();
  }

  // RGB/RGBA
  const rgbMatch = trimmed.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i
  );
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    // Skip if fully transparent
    if (a !== undefined && parseFloat(a) === 0) {
      return null;
    }
    const hex = `#${parseInt(r).toString(16).padStart(2, "0")}${parseInt(g)
      .toString(16)
      .padStart(2, "0")}${parseInt(b).toString(16).padStart(2, "0")}`.toUpperCase();
    return hex;
  }

  // Try to extract numbers directly as fallback
  const numbers = trimmed.match(/\d+/g);
  if (numbers && numbers.length >= 3) {
    const [r, g, b, a] = numbers.map((n) => parseInt(n));
    // Skip if has alpha and it's 0
    if (a === 0) {
      return null;
    }
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
  }

  console.warn("[parseColor] Could not parse color:", color);
  return null;
}

/**
 * Check if a value is a CSS gradient
 */
export function isGradient(value: string): boolean {
  return (
    value.includes("linear-gradient") ||
    value.includes("radial-gradient") ||
    value.includes("conic-gradient")
  );
}

/**
 * Parse border-radius (handles all 4 corners)
 */
export function parseBorderRadius(value: string): {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
} {
  if (!value || value === "0px") {
    return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
  }

  // Handle slash syntax: "10px 20px / 30px 40px" (horizontal / vertical radii)
  // Figma only supports circular radii, so use horizontal values (before slash)
  const slashIndex = value.indexOf("/");
  const horizontalPart = slashIndex >= 0 ? value.substring(0, slashIndex).trim() : value;

  const values = horizontalPart.split(" ").map((v) => parseFloat(v) || 0);

  if (values.length === 1) {
    return {
      topLeft: values[0],
      topRight: values[0],
      bottomRight: values[0],
      bottomLeft: values[0],
    };
  }
  if (values.length === 2) {
    return {
      topLeft: values[0],
      topRight: values[1],
      bottomRight: values[0],
      bottomLeft: values[1],
    };
  }
  if (values.length === 3) {
    return {
      topLeft: values[0],
      topRight: values[1],
      bottomRight: values[2],
      bottomLeft: values[1],
    };
  }
  return {
    topLeft: values[0],
    topRight: values[1],
    bottomRight: values[2],
    bottomLeft: values[3],
  };
}

// ============================================================================
// ELEMENT IDENTITY (Layer #7)
// ============================================================================

/**
 * FNV-1a hash → 7-char base36 string.
 * Deterministic: same input → same output.
 */
export function hashSelector(selector: string): string {
  let hash = 2166136261;
  for (let i = 0; i < selector.length; i++) {
    hash ^= selector.charCodeAt(i);
    hash = (hash * 16777619) | 0;
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

/**
 * CSS.escape polyfill for Node.js environments.
 * Escapes special CSS characters in identifiers.
 */
export function escapeCSSIdentifier(value: string): string {
  if (!value) return "";
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    // Alphanumeric, hyphen, underscore — pass through
    if (
      (ch >= 0x30 && ch <= 0x39) || // 0-9
      (ch >= 0x41 && ch <= 0x5a) || // A-Z
      (ch >= 0x61 && ch <= 0x7a) || // a-z
      ch === 0x2d || // -
      ch === 0x5f    // _
    ) {
      result += value[i];
    } else {
      result += "\\" + value[i];
    }
  }
  return result;
}

/**
 * Check if an id attribute is likely auto-generated (not human-authored).
 * Filters: numeric-only, UUID-like, ember*, react*, ng-*, :r* (React useId).
 */
function isValidCSSId(id: string): boolean {
  if (!id) return false;
  // Numeric-only
  if (/^\d+$/.test(id)) return false;
  // UUID-like
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
  // Framework-generated prefixes
  if (/^ember/i.test(id)) return false;
  if (/^react/i.test(id)) return false;
  if (/^ng-/i.test(id)) return false;
  // React 18 useId pattern: :r0:, :r1a:, etc.
  if (/^:r/.test(id)) return false;
  return true;
}

/**
 * Compute a deterministic structural CSS selector path for a node.
 *
 * Format: `body > div:nth-of-type(2) > nav > a:nth-of-type(3)`
 * - Uses nth-of-type (not nth-child) — text nodes don't interfere
 * - Shortcuts via human-authored `id` attributes: `#main > p`
 * - Performance: O(depth) per node
 */
export function computeStructuralSelector(
  nodeIndex: number,
  nodes: Array<{ index: number; nodeName: string; parentIndex: number; nodeType: number; attributes: Record<string, string> }>,
  childrenMap: Map<number, number[]>,
  prefix?: string
): string {
  const MAX_DEPTH = 15;
  const parts: string[] = [];
  let currentIndex = nodeIndex;

  for (let d = 0; d < MAX_DEPTH; d++) {
    const node = nodes[currentIndex];
    if (!node) break;

    const tag = node.nodeName;

    // If this node has a valid (human-authored) id, use it as anchor and stop
    const nodeId = node.attributes?.id;
    if (nodeId && isValidCSSId(nodeId)) {
      parts.unshift(`#${escapeCSSIdentifier(nodeId)}`);
      // Anchor found — no need to go higher
      if (prefix) {
        parts.unshift(prefix);
      }
      return parts.join(" > ");
    }

    // Root (body or no parent) — add tag and stop
    if (node.parentIndex < 0 || tag === "body") {
      parts.unshift(tag);
      break;
    }

    // Determine if we need nth-of-type
    const siblingIndices = childrenMap.get(node.parentIndex) || [];
    // Count same-tag element siblings (skip text nodes: nodeType !== 1)
    const sameTagSiblings = siblingIndices.filter((idx) => {
      const sibling = nodes[idx];
      return sibling && sibling.nodeType === 1 && sibling.nodeName === tag;
    });

    if (sameTagSiblings.length > 1) {
      // Find 1-based position among same-tag siblings
      const position = sameTagSiblings.indexOf(node.index) + 1;
      parts.unshift(`${tag}:nth-of-type(${position})`);
    } else {
      parts.unshift(tag);
    }

    currentIndex = node.parentIndex;
  }

  if (prefix) {
    parts.unshift(prefix);
  }
  return parts.join(" > ");
}

/**
 * Generate unique ID for elements.
 * With selectorPath: deterministic (same structure → same ID).
 * Without: random (backward compatible).
 */
export function generateId(selectorPath?: string): string {
  if (selectorPath) {
    return `n${hashSelector(selectorPath)}`;
  }
  return `n${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get semantic name for element based on tag and attributes
 */
export function getSemanticName(
  tag: string,
  attributes: Record<string, string>
): string {
  // Check aria-label first
  if (attributes["aria-label"]) {
    return attributes["aria-label"].substring(0, 40);
  }

  // Check id
  if (attributes["id"]) {
    return attributes["id"].replace(/-/g, " ").substring(0, 25);
  }

  // Check class patterns
  const className = attributes["class"] || "";
  const patterns: [RegExp, string][] = [
    [/header/i, "Header"],
    [/nav/i, "Navigation"],
    [/footer/i, "Footer"],
    [/hero/i, "Hero"],
    [/card/i, "Card"],
    [/sidebar/i, "Sidebar"],
    [/menu/i, "Menu"],
    [/button/i, "Button"],
    [/banner/i, "Banner"],
    [/container/i, "Container"],
    [/content/i, "Content"],
    [/section/i, "Section"],
    [/form/i, "Form"],
    [/search/i, "Search"],
    [/logo/i, "Logo"],
  ];

  for (const [pattern, name] of patterns) {
    if (pattern.test(className)) return name;
  }

  // Fallback to tag-based names
  const tagNames: Record<string, string> = {
    header: "Header",
    nav: "Navigation",
    main: "Main",
    section: "Section",
    article: "Article",
    aside: "Sidebar",
    footer: "Footer",
    form: "Form",
    ul: "List",
    ol: "List",
    li: "List Item",
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
    h4: "Heading 4",
    h5: "Heading 5",
    h6: "Heading 6",
    p: "Paragraph",
    span: "Text",
    a: "Link",
    button: "Button",
    img: "Image",
    video: "Video",
    div: "Container",
  };

  return tagNames[tag] || "Container";
}

/**
 * Get layout mode from computed styles
 */
export function getLayoutMode(
  computedStyles: Record<string, string>,
  tag?: string
): "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID" {
  const display = computedStyles.display;

  // Flexbox
  if (display === "flex" || display === "inline-flex") {
    const flexDirection = computedStyles["flex-direction"];
    return flexDirection === "column" || flexDirection === "column-reverse"
      ? "VERTICAL"
      : "HORIZONTAL";
  }

  // Grid — native Figma Grid layout
  if (display === "grid" || display === "inline-grid") {
    return "GRID";
  }

  // Inline elements
  if (display === "inline" || display === "inline-block") {
    return "HORIZONTAL";
  }

  // List containers should use VERTICAL auto layout
  if (tag === "ul" || tag === "ol") {
    return "VERTICAL";
  }

  // list-item is block-level flow; children stack vertically.
  // The ::marker lives outside the content box (or inside as inline prefix),
  // it does NOT make the li itself a horizontal row.
  if (display === "list-item") {
    return "VERTICAL";
  }

  return "NONE";
}

/**
 * Determine Figma sizing mode from CSS properties.
 *
 * Uses parent's layout context to correctly map axes:
 * - Main axis: flex-grow > 0 → FILL, otherwise → HUG
 * - Cross axis: align-items/align-self stretch → FILL, otherwise → HUG
 *
 * Without parentContext (root/absolute elements), returns undefined.
 */
export function getLayoutSizing(
  computedStyles: Record<string, string>,
  flexGrow: number,
  alignSelf: string | undefined,
  parentContext?: {
    direction: "HORIZONTAL" | "VERTICAL" | "NONE" | "GRID";
    alignItems?: string;
    contentWidth?: number;
    contentHeight?: number;
    isGridChild?: boolean;
  }
): {
  horizontal: "FIXED" | "HUG" | "FILL" | undefined;
  vertical: "FIXED" | "HUG" | "FILL" | undefined;
} {
  // No parent context or parent is not auto layout → can't determine sizing
  if (!parentContext || parentContext.direction === "NONE") {
    return { horizontal: undefined, vertical: undefined };
  }

  const parentIsColumn = parentContext.direction === "VERTICAL";
  // CSS flex default align-items is "stretch" (normal resolves to stretch for flex)
  const parentAlignItems = parentContext.alignItems || "stretch";
  const normalizedAlignItems =
    parentAlignItems === "normal" ? "stretch" : parentAlignItems;

  // Effective align-self: "auto"/undefined → inherit parent's align-items
  const effectiveAlignSelf =
    !alignSelf || alignSelf === "auto" ? normalizedAlignItems : alignSelf;

  // CSS Grid children: track sizes control dimensions, use FIXED sizing
  if (parentContext.direction === "GRID") {
    return { horizontal: "FIXED", vertical: "FIXED" };
  }

  // CSS Grid children always fill their cell on the main axis (like flex-grow: 1)
  const effectiveFlexGrow = parentContext.isGridChild ? 1 : flexGrow;

  let horizontal: "FIXED" | "HUG" | "FILL" | undefined;
  let vertical: "FIXED" | "HUG" | "FILL" | undefined;

  if (parentIsColumn) {
    // Parent is VERTICAL layout
    // Main axis = vertical: flex-grow → FILL, else → FIXED
    vertical = effectiveFlexGrow > 0 ? "FILL" : "FIXED";
    // Cross axis = horizontal: stretch → FILL, else → FIXED
    horizontal = effectiveAlignSelf === "stretch" ? "FILL" : "FIXED";
  } else {
    // Parent is HORIZONTAL layout
    // Main axis = horizontal: flex-grow → FILL, else → FIXED
    horizontal = effectiveFlexGrow > 0 ? "FILL" : "FIXED";
    // Cross axis = vertical: stretch → FILL, else → FIXED
    vertical = effectiveAlignSelf === "stretch" ? "FILL" : "FIXED";
  }

  return { horizontal, vertical };
}
