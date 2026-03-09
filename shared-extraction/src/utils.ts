/**
 * Shared Utility Functions
 * Helper functions used during DOM extraction
 */

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

  // const values = value.split(" ").map((v) => parseInt(v) || 0);
  const values = value.split(" ").map((v) => parseFloat(v) || 0);

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

/**
 * Generate unique ID for elements
 */
export function generateId(): string {
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
): "NONE" | "HORIZONTAL" | "VERTICAL" {
  const display = computedStyles.display;

  // Flexbox
  if (display === "flex" || display === "inline-flex") {
    const flexDirection = computedStyles["flex-direction"];
    return flexDirection === "column" || flexDirection === "column-reverse"
      ? "VERTICAL"
      : "HORIZONTAL";
  }

  // Grid
  if (display === "grid" || display === "inline-grid") {
    const gridAutoFlow = computedStyles["grid-auto-flow"];
    if (gridAutoFlow?.includes("column")) {
      return "HORIZONTAL";
    }

    const gridColumns = computedStyles["grid-template-columns"];
    if (gridColumns && gridColumns !== "none") {
      // auto-fit/auto-fill grids are responsive - treat as HORIZONTAL (wrap)
      if (
        gridColumns.includes("auto-fit") ||
        gridColumns.includes("auto-fill")
      ) {
        return "HORIZONTAL";
      }

      // Check if multiple columns by counting column values
      const normalizedColumns = gridColumns
        .replace(/repeat\s*\(\s*(\d+)\s*,/g, (_, count) => {
          return Array(parseInt(count)).fill("1fr").join(" ") + " ";
        })
        .trim();

      const columnCount = normalizedColumns
        .split(/\s+/)
        .filter((v) => v && v !== "none" && !v.includes("(")).length;

      if (columnCount > 1) {
        return "HORIZONTAL";
      }
    }

    return "VERTICAL";
  }

  // Inline elements
  if (display === "inline" || display === "inline-block") {
    return "HORIZONTAL";
  }

  // List containers should use VERTICAL auto layout
  if (tag === "ul" || tag === "ol") {
    return "VERTICAL";
  }

  // List items with default display should use HORIZONTAL for inline content
  if (display === "list-item") {
    return "HORIZONTAL";
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
    direction: "HORIZONTAL" | "VERTICAL" | "NONE";
    alignItems?: string;
    contentWidth?: number;
    contentHeight?: number;
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

  let horizontal: "FIXED" | "HUG" | "FILL" | undefined;
  let vertical: "FIXED" | "HUG" | "FILL" | undefined;

  if (parentIsColumn) {
    // Parent is VERTICAL layout
    // Main axis = vertical: flex-grow → FILL, else → FIXED
    vertical = flexGrow > 0 ? "FILL" : "FIXED";
    // Cross axis = horizontal: stretch → FILL, else → FIXED
    horizontal = effectiveAlignSelf === "stretch" ? "FILL" : "FIXED";
  } else {
    // Parent is HORIZONTAL layout
    // Main axis = horizontal: flex-grow → FILL, else → FIXED
    horizontal = flexGrow > 0 ? "FILL" : "FIXED";
    // Cross axis = vertical: stretch → FILL, else → FIXED
    vertical = effectiveAlignSelf === "stretch" ? "FILL" : "FIXED";
  }

  return { horizontal, vertical };
}
