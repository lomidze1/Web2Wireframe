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
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
    p: "Paragraph",
    img: "Image",
    video: "Video",
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
