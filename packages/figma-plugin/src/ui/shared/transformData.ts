/**
 * Data Transformation Utilities
 * Used during import to transform CDP-captured data based on user options.
 *
 * NOTE: Text transformation happens here (Plugin_Frontend).
 * Color/Font transformation happens in Figma Plugin backend (main.ts)
 * because it needs access to Figma API for creating styles.
 */

import type { ColorMode, FontMode, TextMode } from "./types";

/**
 * Semantic placeholder text based on HTML tag type.
 * Covers all standard HTML text-containing elements.
 * Each tag gets a unique, informative placeholder to avoid a sea of "Text".
 */
const SEMANTIC_PLACEHOLDERS: Record<string, string> = {
  // Headings
  h1: "Page Title",
  h2: "Section Heading",
  h3: "Subsection Heading",
  h4: "Group Heading",
  h5: "Minor Heading",
  h6: "Small Heading",

  // Block text
  p: "Body text paragraph with sample content.",
  blockquote: "Quote",
  address: "Contact info",
  figcaption: "Caption text",

  // Code / technical
  pre: "Code snippet",
  code: "Code snippet",
  kbd: "Code snippet",
  samp: "Code snippet",
  var: "Code snippet",

  // Inline formatting (differentiated by role)
  span: "Text",
  strong: "Bold text",
  b: "Bold text",
  em: "Emphasis",
  i: "Emphasis",
  u: "Inline text",
  s: "Inline text",
  del: "Inline text",
  ins: "Inline text",
  mark: "Highlight",
  small: "Fine print",
  sub: "Script",
  sup: "Script",
  abbr: "Inline text",
  dfn: "Inline text",
  cite: "Quote",
  q: "Quote",
  time: "Time",
  data: "Time",

  // Links & interactive
  a: "Link",
  button: "Button",
  label: "Label",
  legend: "Label",
  option: "Option",
  output: "Result",

  // Lists
  li: "List item",
  dt: "Term",
  dd: "Definition text",

  // Tables
  td: "Cell",
  th: "Header",
  caption: "Table Caption",

  // Form
  input: "Input field",
  textarea: "Text area content",

  // Interactive
  summary: "Summary",
  details: "Details text",
};

const LOREM_WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum",
];

/**
 * Approximate relative character widths for proportional (sans-serif) fonts.
 * Used to detect when a Lorem replacement would be visually wider than
 * the original text, so we can trim 1 character to prevent overflow.
 */
const CHAR_WIDTH: Record<string, number> = {
  // Lowercase — narrow
  i: 0.25, j: 0.25, l: 0.25, f: 0.30, t: 0.33, r: 0.35,
  // Lowercase — medium-narrow
  s: 0.45, c: 0.48, z: 0.45, x: 0.48,
  // Lowercase — medium
  a: 0.53, b: 0.55, d: 0.55, e: 0.52, g: 0.55, h: 0.55, k: 0.50,
  n: 0.55, o: 0.55, p: 0.55, q: 0.55, u: 0.55, v: 0.50, y: 0.50,
  // Lowercase — wide
  m: 0.83, w: 0.75,
  // Uppercase — narrow
  I: 0.28, J: 0.45, F: 0.50, E: 0.53, L: 0.50, T: 0.55,
  // Uppercase — medium
  A: 0.63, B: 0.60, C: 0.60, D: 0.65, G: 0.65, H: 0.65, K: 0.60,
  N: 0.65, O: 0.67, P: 0.58, Q: 0.67, R: 0.60, S: 0.55, U: 0.65,
  V: 0.60, X: 0.58, Y: 0.58, Z: 0.55,
  // Uppercase — wide
  M: 0.83, W: 0.88,
};

/** Estimate the visual width of a string using per-character width table */
export function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += CHAR_WIDTH[ch] ?? 0.50;
  }
  return width;
}

/**
 * Generate Lorem Ipsum that preserves all non-alphabetic characters in place.
 * Only alphabetic runs ([a-zA-Z]+) are replaced with Lorem words; symbols,
 * numbers, punctuation, spaces, and other characters stay exactly where they were.
 *
 * Always produces exact character count replacement (no per-word trimming).
 * Width-based trimming is handled separately by trimLoremToFitWidth() when needed.
 *
 * Examples:
 *   "$12 /month"     → "$12 /lorem"
 *   "Hello, World!"  → "Lorem, Ipsum!"
 *   "$99"            → "$99"           (no letters → unchanged)
 *   "Read more →"    → "Lorem ipsum →"
 *   "Pricing"        → "Loremip"       (exact 7 chars, no trimming)
 */
export function generateLoremPreservingSymbols(originalText: string): string {
  if (!originalText) return "";
  if (!/[a-zA-Z]/.test(originalText)) return originalText;

  let wordIdx = 0;

  return originalText.replace(/[a-zA-Z]+/g, (match) => {
    const target = match.length;
    let replacement = "";

    // Fill replacement with Lorem words until we reach the target length
    while (replacement.length < target) {
      const word = LOREM_WORDS[wordIdx % LOREM_WORDS.length];
      wordIdx++;
      const remaining = target - replacement.length;
      replacement += word.length <= remaining ? word : word.slice(0, remaining);
    }

    // Match original capitalization of first letter
    if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
      replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }

    return replacement;
  });
}

/**
 * Trim lorem text to fit within the width of the original text.
 * Removes alphabetic characters from the end while preserving symbols/punctuation.
 * Used for plugin font mode where width matching is important.
 */
export function trimLoremToFitWidth(loremText: string, originalText: string): string {
  if (!loremText || !originalText) return loremText;
  const targetWidth = estimateTextWidth(originalText);
  if (estimateTextWidth(loremText) <= targetWidth) return loremText;

  const chars = Array.from(loremText);
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/[a-zA-Z]/.test(chars[i])) {
      chars.splice(i, 1);
      if (estimateTextWidth(chars.join("")) <= targetWidth) break;
    }
  }
  return chars.join("");
}

/**
 * Check if text looks like a price/currency pattern (e.g., "$0", "$99", "€50")
 */
function isPricePattern(text: string): boolean {
  // Match currency symbols followed by numbers, or numbers followed by currency
  return /^[$€£¥₹]?\s*\d+([.,]\d+)?\s*[$€£¥₹]?$/.test(text.trim());
}

/**
 * Check if text contains a price WITH period/unit (e.g., "$0 /forever", "$12 /month").
 * Requires a number before the period indicator — standalone "/month" won't match.
 */
function hasPricePeriod(text: string): boolean {
  return /[$€£¥₹]?\s*\d+([.,]\d+)?\s*\/\s*(forever|month|year|week|day|mo|yr|wk|annual|quarterly)/i.test(text.trim());
}

/**
 * Context passed down during recursive text transformation.
 * Tracks parent element and page section for context-aware placeholders.
 */
interface TransformContext {
  parentTag: string;
  sectionTag?: string;
  parentIsLogo?: boolean;
  fontMode?: FontMode;
}

/** Section-level HTML tags that define page regions */
const SECTION_TAGS = new Set(["header", "footer", "nav", "main", "aside", "section", "article"]);

/** Parent tags whose children inherit the parent's semantic meaning */
const PARENT_OVERRIDES: Record<string, string> = {
  li: "List item",
  button: "Button",
  a: "Link",
  label: "Label",
  legend: "Label",
  dt: "Term",
  dd: "Definition text",
  figcaption: "Caption text",
  blockquote: "Quote",
  summary: "Summary",
};

/** Section-aware paragraph placeholders */
const SECTION_PARAGRAPH: Record<string, string> = {
  footer: "Footer description text.",
  header: "Header description text.",
  nav: "Navigation description.",
};

/**
 * Get semantic placeholder based on tag name, original text, and hierarchy context
 */
export function getSemanticPlaceholder(
  tag: string,
  originalText: string,
  className?: string,
  elementName?: string,
  context?: TransformContext
): string {
  const tagLower = tag.toLowerCase();
  const trimmed = originalText.trim();

  // Logo detection: own class/name OR inherited from parent
  const isLogo =
    context?.parentIsLogo ||
    (className && /\b(logo|brand)\b/i.test(className)) ||
    (elementName && /\b(logo|brand)\b/i.test(elementName)) ||
    /^logo$/i.test(trimmed);

  if (isLogo) return "Logo";

  // Price with period in single element (e.g., "$50 /month" → "$price /text")
  if (hasPricePeriod(originalText)) {
    const currencyMatch = originalText.match(/[$€£¥₹]/);
    const currency = currencyMatch ? currencyMatch[0] : "$";
    return `${currency}price /text`;
  }

  // Simple price (e.g., "$99", "$0") → "$price"
  if (isPricePattern(originalText)) {
    const currencyMatch = originalText.match(/[$€£¥₹]/);
    const currency = currencyMatch ? currencyMatch[0] : "$";
    return `${currency}price`;
  }

  // Preserve very short text (1-2 chars) as-is: ".", ",", "/", "?", "•", "©"
  if (trimmed.length <= 2) return trimmed;

  // Preserve text with no alphabetic characters (pure punctuation, symbols, numbers)
  if (!/[a-zA-Z]/.test(trimmed)) return trimmed;

  // Standalone period indicators (e.g., "/month", "/forever") → "/text"
  if (/^\/\s*[a-zA-Z]/.test(trimmed)) return "/text";

  // Parent tag override: child text inherits parent's semantic meaning
  if (context?.parentTag) {
    const override = PARENT_OVERRIDES[context.parentTag];
    if (override) return override;
  }

  // Section-aware paragraph text
  if (tagLower === "p" && context?.sectionTag) {
    const sectionPlaceholder = SECTION_PARAGRAPH[context.sectionTag];
    if (sectionPlaceholder) return sectionPlaceholder;
  }

  return SEMANTIC_PLACEHOLDERS[tagLower] || "Text";
}

/**
 * Styled text segment within a mixed-content element (e.g., <h2>text <a>link</a></h2>).
 * Each segment preserves its inline styling from CDP extraction.
 */
interface StyledSegment {
  text: string;
  tag?: string;
  [key: string]: unknown;
}

/**
 * ExtractedElement type (matches Browser Extension types)
 */
interface ExtractedElement {
  id: string;
  type: "frame" | "text" | "placeholder";
  tag: string;
  textContent: string;
  children: ExtractedElement[];
  className?: string;  // CSS class names for detection (logo, etc.)
  name?: string;       // Element name for logo detection
  styledSegments?: StyledSegment[];  // Multi-segment text (inline children like <a> in <h2>)
  [key: string]: unknown;
}

/**
 * Frame from CDP capture
 */
interface CapturedFrame {
  viewport: { width: number; height: number };
  tree: ExtractedElement;
  viewportWidth?: number;
  viewportHeight?: number;
  assets?: Record<string, string>;
}

/**
 * Transform text content in element tree based on text mode.
 * Tracks parent tag and page section for context-aware semantic placeholders.
 */
function transformTextInElement(
  element: ExtractedElement,
  textMode: TextMode,
  context?: TransformContext,
  fontMode?: FontMode
): ExtractedElement {
  const transformed = { ...element };
  const tagLower = element.tag?.toLowerCase() || "";
  const effectiveFontMode = fontMode ?? context?.fontMode;

  // Determine section context: inherit from parent or set from current element
  const sectionTag = SECTION_TAGS.has(tagLower) ? tagLower : context?.sectionTag;

  // Determine if this element is a logo container (propagates to children)
  const parentIsLogo =
    context?.parentIsLogo ||
    !!(element.className && /\b(logo|brand)\b/i.test(element.className)) ||
    !!(element.name && /\b(logo|brand)\b/i.test(element.name));

  // Transform text content if present
  if (transformed.textContent && transformed.type === "text") {
    switch (textMode) {
      case "lorem": {
        transformed.textContent = generateLoremPreservingSymbols(transformed.textContent);
        if (effectiveFontMode === "plugin") {
          transformed.textContent = trimLoremToFitWidth(transformed.textContent, element.textContent);
        }
        break;
      }
      case "semantic":
        transformed.textContent = getSemanticPlaceholder(
          transformed.tag,
          transformed.textContent,
          transformed.className,
          transformed.name,
          context
        );
        break;
      case "website":
      default:
        break;
    }

    // Also transform styledSegments (for mixed-content elements like <h2>text <a>link</a></h2>).
    // Rendering prioritizes styledSegments over textContent, so both must be transformed.
    if (transformed.styledSegments && transformed.styledSegments.length > 0) {
      transformed.styledSegments = transformed.styledSegments.map((seg) => {
        const segClone = { ...seg };
        switch (textMode) {
          case "lorem": {
            const segTag = seg.tag?.toLowerCase() || "";
            const isPseudo = segTag === "::marker" || segTag === "::before" || segTag === "::after";
            // Preserve single-char pseudo-element content (bullets: •, -, ▸, etc.)
            if (isPseudo && seg.text.trim().length <= 1) break;
            segClone.text = generateLoremPreservingSymbols(seg.text);
            break;
          }
          case "semantic":
            segClone.text = getSemanticPlaceholder(
              seg.tag || transformed.tag || "",
              seg.text,
              transformed.className,
              transformed.name,
              context
            );
            break;
        }
        return segClone;
      });

      // Post-process: for plugin font, trim total width from last non-pseudo segment
      if (textMode === "lorem" && effectiveFontMode === "plugin" && element.styledSegments) {
        const originalTotal = element.styledSegments.reduce((w, s) => w + estimateTextWidth(s.text), 0);
        const loremTotal = transformed.styledSegments.reduce((w, s) => w + estimateTextWidth(s.text), 0);

        if (loremTotal > originalTotal) {
          for (let i = transformed.styledSegments.length - 1; i >= 0; i--) {
            const segTag = transformed.styledSegments[i].tag?.toLowerCase() || "";
            const isPseudo = segTag === "::marker" || segTag === "::before" || segTag === "::after";
            if (!isPseudo && /[a-zA-Z]/.test(transformed.styledSegments[i].text)) {
              const excess = loremTotal - originalTotal;
              const segWidth = estimateTextWidth(transformed.styledSegments[i].text);
              const targetSegWidth = segWidth - excess;
              if (targetSegWidth > 0) {
                const chars = Array.from(transformed.styledSegments[i].text);
                for (let j = chars.length - 1; j >= 0; j--) {
                  if (estimateTextWidth(chars.join("")) <= targetSegWidth) break;
                  if (/[a-zA-Z]/.test(chars[j])) {
                    chars.splice(j, 1);
                  }
                }
                transformed.styledSegments[i] = { ...transformed.styledSegments[i], text: chars.join("") };
              }
              break;
            }
          }
        }
      }
    }
  }

  // Recursively transform children with context
  if (transformed.children && transformed.children.length > 0) {
    const childContext: TransformContext = {
      parentTag: tagLower,
      sectionTag,
      parentIsLogo,
      fontMode: effectiveFontMode,
    };
    transformed.children = transformed.children.map((child) =>
      transformTextInElement(child, textMode, childContext)
    );
  }

  return transformed;
}

/**
 * Transform frame data based on import options
 * NOTE: Color and Font transformation happens in Figma Plugin backend
 */
export function transformFrameData(
  frame: CapturedFrame,
  options: { colorMode: ColorMode; fontMode: FontMode; textMode: TextMode }
): CapturedFrame {
  const { textMode, fontMode } = options;

  // If website mode, return as-is
  if (textMode === "website") {
    return frame;
  }

  // W2W content-script frames use `tree: null` and carry the real node tree
  // on `capturedData.frame`; `transformW2WTreeText` handles those separately.
  // Skip here so we don't crash dereferencing `element.tag` on a null tree.
  if (!frame.tree) {
    return frame;
  }

  // Transform text content in the tree
  return {
    ...frame,
    tree: transformTextInElement(frame.tree, textMode, undefined, fontMode),
  };
}

/**
 * Transform multiple frames
 */
export function transformFramesData(
  frames: CapturedFrame[],
  options: { colorMode: ColorMode; fontMode: FontMode; textMode: TextMode }
): CapturedFrame[] {
  return frames.map((frame) => transformFrameData(frame, options));
}

/**
 * Transform options to backend format
 */
export function getBackendModes(options: {
  colorMode: ColorMode;
  fontMode: FontMode;
  textMode: TextMode;
}) {
  return {
    colorMode: options.colorMode,
    typographyMode: options.fontMode,
    textMode: options.textMode,
  };
}

// ---------------------------------------------------------------------------
// W2W Tree Text Transformation
// ---------------------------------------------------------------------------

/** Minimal W2W tree node shape for text transformation */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type W2WTreeNode = Record<string, any>;

/** Section-level tags for context-aware semantic placeholders */
const W2W_SECTION_TAGS = new Set(["header", "footer", "nav", "main", "aside", "section", "article"]);

/**
 * Recursively transform text in a W2W raw tree (before conversion to WireframeNode).
 * Mutates `node.value` on TEXT nodes in-place.
 *
 * @param node - W2W tree node (FRAME, TEXT, or SVG)
 * @param textMode - "semantic" | "lorem" | "website"
 * @param parentTag - parent FRAME's tag (provides semantic context for TEXT children)
 * @param sectionTag - nearest ancestor section tag (header/footer/nav/etc.)
 */
export function transformW2WTreeText(
  node: W2WTreeNode,
  textMode: "semantic" | "lorem" | "website",
  parentTag?: string,
  sectionTag?: string,
): void {
  if (textMode === "website") return;

  if (node.type === "TEXT" && typeof node.value === "string" && node.value) {
    if (textMode === "semantic") {
      node.value = getSemanticPlaceholder(
        parentTag || "#text",
        node.value,
        undefined,
        undefined,
        { parentTag: parentTag || "", sectionTag, parentIsLogo: false },
      );
    } else if (textMode === "lorem") {
      node.value = generateLoremPreservingSymbols(node.value);
    }
    return;
  }

  if (node.type === "FRAME" && Array.isArray(node.children)) {
    const tag = typeof node.tag === "string" ? node.tag.toLowerCase() : "";
    const newSection = W2W_SECTION_TAGS.has(tag) ? tag : sectionTag;

    for (const child of node.children) {
      if (child && typeof child === "object" && "type" in child) {
        transformW2WTreeText(
          child as W2WTreeNode,
          textMode,
          tag,
          newSection,
        );
      }
    }
  }
}
