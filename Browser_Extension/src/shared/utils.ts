/**
 * Utility functions for the extension
 */

/**
 * Parse color string to hex
 */
export function parseColor(color: string | null | undefined): string | null {
  if (!color || color === "transparent") {
    return null;
  }

  // Trim whitespace
  const trimmed = color.trim();

  // Check for fully transparent colors
  if (trimmed === "rgba(0, 0, 0, 0)" ||
      trimmed === "rgba(0,0,0,0)" ||
      trimmed.match(/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/)) {
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

  // RGB/RGBA - more flexible regex that handles various whitespace patterns
  const rgbMatch = trimmed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    // Skip if fully transparent
    if (a !== undefined && parseFloat(a) === 0) {
      return null;
    }
    const hex = `#${parseInt(r).toString(16).padStart(2, "0")}${parseInt(g).toString(16).padStart(2, "0")}${parseInt(b).toString(16).padStart(2, "0")}`.toUpperCase();
    return hex;
  }

  // Try to extract numbers directly as fallback
  const numbers = trimmed.match(/\d+/g);
  if (numbers && numbers.length >= 3) {
    const [r, g, b, a] = numbers.map(n => parseInt(n));
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
 * Check if a value is a gradient
 */
export function isGradient(value: string): boolean {
  return value.includes("linear-gradient") ||
         value.includes("radial-gradient") ||
         value.includes("conic-gradient");
}

/**
 * Extract gradient from background-image
 */
export function extractGradient(value: string): string | null {
  const gradientMatch = value.match(/(linear-gradient|radial-gradient|conic-gradient)\([^)]+\)/);
  return gradientMatch ? gradientMatch[0] : null;
}

/**
 * Parse box-shadow string
 */
export function parseBoxShadow(shadow: string): {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
} | null {
  if (!shadow || shadow === "none") return null;

  const isInset = shadow.includes("inset");
  const cleanShadow = shadow.replace("inset", "").trim();

  // Match: offsetX offsetY blur spread color
  const match = cleanShadow.match(/([\d.-]+)px\s+([\d.-]+)px\s+([\d.-]+)px\s*([\d.-]+)?px?\s*(.*)/);
  if (!match) return null;

  const [, offsetX, offsetY, blur, spread, color] = match;

  return {
    offsetX: parseFloat(offsetX) || 0,
    offsetY: parseFloat(offsetY) || 0,
    blur: parseFloat(blur) || 0,
    spread: parseFloat(spread) || 0,
    color: color?.trim() || "rgba(0,0,0,0.1)",
    inset: isInset,
  };
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

  const values = value.split(" ").map(v => parseInt(v) || 0);

  if (values.length === 1) {
    return { topLeft: values[0], topRight: values[0], bottomRight: values[0], bottomLeft: values[0] };
  }
  if (values.length === 2) {
    return { topLeft: values[0], topRight: values[1], bottomRight: values[0], bottomLeft: values[1] };
  }
  if (values.length === 3) {
    return { topLeft: values[0], topRight: values[1], bottomRight: values[2], bottomLeft: values[1] };
  }
  return { topLeft: values[0], topRight: values[1], bottomRight: values[2], bottomLeft: values[3] };
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `n${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get semantic name for element
 */
export function getSemanticName(tag: string, attributes: Record<string, string>): string {
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
 * Compress data using gzip (browser-compatible)
 */
export async function compressData(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });

  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  const reader = compressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Calculate luminance of a hex color (0-1, 0=black, 1=white)
 */
function getLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Check if color is too close to white (likely default background)
 */
function isNearWhite(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Consider colors with all components > 250 as near-white
  return r > 250 && g > 250 && b > 250;
}

/**
 * Check if color is too close to black
 */
function isNearBlack(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r < 5 && g < 5 && b < 5;
}

/**
 * Check if two colors are similar (within threshold)
 */
function areColorsSimilar(hex1: string, hex2: string, threshold = 30): boolean {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
  return diff < threshold;
}

/**
 * Detected colors result type
 */
export interface DetectedColorsResult {
  background: string;
  text: string;
  accent: string;
  surface: string;
  border: string;
  main: string;
  source: {
    totalElements: number;
    backgroundSamples: number;
    textSamples: number;
    accentSamples: number;
  };
}

/**
 * Element data for color analysis
 */
interface AnalyzableElement {
  tag: string;
  type: "frame" | "text" | "placeholder";
  backgroundColor?: string | null;
  textColor?: string | null;
  borderColor?: string | null;
  fills?: Array<{ type: string; color?: { r: number; g: number; b: number; a: number } }>;
  width: number;
  height: number;
  children: AnalyzableElement[];
}

/**
 * Analyze element tree and detect dominant colors
 * Returns a smart color palette based on actual website colors
 */
export function analyzeColorsFromTree(tree: AnalyzableElement): DetectedColorsResult {
  // Collect colors by category
  const backgroundColors: Array<{ color: string; area: number }> = [];
  const textColors: Array<{ color: string; count: number }> = [];
  const accentColors: Array<{ color: string; count: number }> = [];
  const borderColors: Array<{ color: string; count: number }> = [];
  const surfaceColors: Array<{ color: string; area: number }> = [];

  let totalElements = 0;

  // Recursive traversal
  function traverse(node: AnalyzableElement, depth: number): void {
    totalElements++;
    const area = node.width * node.height;

    // Extract background color
    let bgColor: string | null = null;

    // Try fills array first (Figma format)
    if (node.fills && node.fills.length > 0) {
      for (const fill of node.fills) {
        if (fill.type === "SOLID" && fill.color) {
          const { r, g, b } = fill.color;
          const hex = `#${Math.round(r * 255).toString(16).padStart(2, "0")}${Math.round(g * 255).toString(16).padStart(2, "0")}${Math.round(b * 255).toString(16).padStart(2, "0")}`.toUpperCase();
          if (parseColor(hex)) {
            bgColor = hex;
            break;
          }
        }
      }
    }

    // Fall back to backgroundColor string
    if (!bgColor && node.backgroundColor) {
      bgColor = parseColor(node.backgroundColor);
    }

    if (bgColor) {
      // Root level = page background
      if (depth === 0 && area > 100000) {
        backgroundColors.push({ color: bgColor, area });
      }
      // Cards, containers (medium-large elements at depth > 0)
      else if (depth > 0 && area > 5000 && area < 500000) {
        surfaceColors.push({ color: bgColor, area });
      }
      // Hero sections, large colored areas
      else if (area > 200000 && !isNearWhite(bgColor) && !isNearBlack(bgColor)) {
        // This could be a "main" brand color
        backgroundColors.push({ color: bgColor, area });
      }
    }

    // Extract text color
    if (node.type === "text" && node.textColor) {
      const textCol = parseColor(node.textColor);
      if (textCol) {
        textColors.push({ color: textCol, count: 1 });
      }
    }

    // Extract border color
    if (node.borderColor) {
      const borderCol = parseColor(node.borderColor);
      if (borderCol) {
        borderColors.push({ color: borderCol, count: 1 });
      }
    }

    // Detect accent colors from interactive elements
    const isInteractive = ["a", "button", "input"].includes(node.tag?.toLowerCase() || "");
    if (isInteractive && bgColor && !isNearWhite(bgColor) && !isNearBlack(bgColor)) {
      accentColors.push({ color: bgColor, count: 1 });
    }

    // Links often have colored text
    if (node.tag?.toLowerCase() === "a" && node.textColor) {
      const linkColor = parseColor(node.textColor);
      if (linkColor && !isNearBlack(linkColor)) {
        accentColors.push({ color: linkColor, count: 1 });
      }
    }

    // Recurse children
    if (node.children) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(tree, 0);

  // Helper: Get most common color from array
  function getMostCommon(items: Array<{ color: string; count?: number; area?: number }>, sortBy: "count" | "area" = "count"): string | null {
    if (items.length === 0) return null;

    // Group by similar colors
    const groups: Map<string, { color: string; total: number }> = new Map();

    for (const item of items) {
      let foundGroup = false;
      for (const [key, group] of groups) {
        if (areColorsSimilar(item.color, key)) {
          group.total += (sortBy === "area" ? item.area : item.count) || 1;
          foundGroup = true;
          break;
        }
      }
      if (!foundGroup) {
        groups.set(item.color, {
          color: item.color,
          total: (sortBy === "area" ? item.area : item.count) || 1
        });
      }
    }

    // Sort by total
    const sorted = Array.from(groups.values()).sort((a, b) => b.total - a.total);
    return sorted[0]?.color || null;
  }

  // Determine each color role
  const detectedBg = getMostCommon(backgroundColors, "area");
  const detectedText = getMostCommon(textColors, "count");
  const detectedAccent = getMostCommon(accentColors, "count");
  const detectedSurface = getMostCommon(surfaceColors, "area");
  const detectedBorder = getMostCommon(borderColors, "count");

  // Find "main" color - distinct brand color from large elements
  // Filter out white/near-white backgrounds
  const mainCandidates = backgroundColors.filter(
    b => !isNearWhite(b.color) && !isNearBlack(b.color) && b.area > 50000
  );
  const detectedMain = getMostCommon(mainCandidates, "area");

  // Build result with smart defaults
  const result: DetectedColorsResult = {
    // Page background: detected or white
    background: detectedBg || "#FFFFFF",

    // Text: detected dark color or default dark gray
    text: detectedText || "#333333",

    // Accent: detected interactive color or blue
    accent: detectedAccent || "#3B82F6",

    // Surface: detected card background or light gray
    surface: detectedSurface || "#F5F5F5",

    // Border: detected or light gray
    border: detectedBorder || "#E0E0E0",

    // Main/brand: detected hero color or use accent, or default blue-gray
    main: detectedMain || detectedAccent || "#1F3A5F",

    source: {
      totalElements,
      backgroundSamples: backgroundColors.length,
      textSamples: textColors.length,
      accentSamples: accentColors.length,
    }
  };

  // Smart adjustments:
  // If background is dark, invert text expectation
  if (result.background && getLuminance(result.background) < 0.3) {
    // Dark mode site - text should be light
    if (detectedText && getLuminance(detectedText) < 0.5) {
      result.text = "#FFFFFF";
    }
  }

  // Ensure surface is different from background
  if (result.surface === result.background) {
    const bgLum = getLuminance(result.background);
    // Make surface slightly darker or lighter than background
    if (bgLum > 0.5) {
      result.surface = "#F0F0F0";
    } else {
      result.surface = "#2A2A2A";
    }
  }

  return result;
}
