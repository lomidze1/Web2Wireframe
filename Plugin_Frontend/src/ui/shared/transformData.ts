/**
 * Data Transformation Utilities
 * Used during import to transform CDP-captured data based on user options.
 *
 * NOTE: Text transformation happens here (Plugin_Frontend).
 * Color/Font transformation happens in Figma Plugin backend (main.ts)
 * because it needs access to Figma API for creating styles.
 */

import type { ColorMode, FontMode, TextMode } from "../components/modalPopup/ImportOptionsModal";

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

/**
 * Generate Lorem Ipsum text with EXACT character count matching the original
 * This preserves the visual length/density of the original text in wireframes
 */
function generateLoremIpsum(originalLength: number): string {
  if (originalLength <= 0) return "";

  const loremWords = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
    "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
    "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
    "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
    "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
    "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
    "deserunt", "mollit", "anim", "id", "est", "laborum",
  ];

  // Build text by adding words until we reach or exceed target length
  const result: string[] = [];
  let currentLength = 0;
  let wordIndex = 0;

  while (currentLength < originalLength) {
    const word = loremWords[wordIndex % loremWords.length];
    const formattedWord = wordIndex === 0
      ? word.charAt(0).toUpperCase() + word.slice(1)
      : word;

    // Calculate what length would be after adding this word
    const separator = result.length > 0 ? " " : "";
    const newLength = currentLength + separator.length + formattedWord.length;

    if (newLength <= originalLength) {
      result.push(formattedWord);
      currentLength = newLength;
    } else {
      // We need to add a partial word or just padding to reach exact length
      const remainingChars = originalLength - currentLength;
      if (remainingChars > 0) {
        if (result.length > 0) {
          // Add space + partial word
          const partialWord = formattedWord.slice(0, remainingChars - 1);
          if (partialWord.length > 0) {
            result.push(partialWord);
          }
        } else {
          // First word, just truncate
          result.push(formattedWord.slice(0, remainingChars));
        }
      }
      break;
    }

    wordIndex++;
  }

  return result.join(" ");
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
function getSemanticPlaceholder(
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
}

/**
 * Transform text content in element tree based on text mode.
 * Tracks parent tag and page section for context-aware semantic placeholders.
 */
function transformTextInElement(
  element: ExtractedElement,
  textMode: TextMode,
  context?: TransformContext
): ExtractedElement {
  const transformed = { ...element };
  const tagLower = element.tag?.toLowerCase() || "";

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
      case "lorem":
        transformed.textContent = generateLoremIpsum(transformed.textContent.length);
        break;
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
          case "lorem":
            segClone.text = generateLoremIpsum(seg.text.length);
            break;
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
    }
  }

  // Recursively transform children with context
  if (transformed.children && transformed.children.length > 0) {
    const childContext: TransformContext = {
      parentTag: tagLower,
      sectionTag,
      parentIsLogo,
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
  const { textMode } = options;

  // If website mode, return as-is
  if (textMode === "website") {
    return frame;
  }

  // Transform text content in the tree
  return {
    ...frame,
    tree: transformTextInElement(frame.tree, textMode),
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
 * Transform options to backend format (for future use)
 */
export function getBackendModes(options: {
  colorMode: ColorMode;
  fontMode: FontMode;
  textMode: TextMode;
}) {
  return {
    colorMode: options.colorMode === "plugin" ? "plugin-colors" : "website-colors",
    typographyMode: options.fontMode === "plugin" ? "plugin-fonts" : "website-fonts",
    textMode: options.textMode,
  };
}
