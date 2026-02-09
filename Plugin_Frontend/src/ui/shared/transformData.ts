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
 * Semantic placeholder text based on HTML tag type
 */
const SEMANTIC_PLACEHOLDERS: Record<string, string> = {
  h1: "Page Title",
  h2: "Section Heading",
  h3: "Subsection Heading",
  h4: "Group Heading",
  h5: "Minor Heading",
  h6: "Small Heading",
  p: "Body text paragraph with sample content.",
  span: "Text",
  a: "Link",
  button: "Button",
  label: "Label",
  li: "•",  // Bullet point for list items
  td: "Cell",
  th: "Header",
  input: "Input field",
  textarea: "Text area content",
  small: "Fine print",
  strong: "Text",  // Generic text instead of "Important"
  em: "Text",      // Generic text instead of "Emphasized"
  blockquote: "Quote text here...",
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
 * Check if text contains a price with period/unit (e.g., "/forever", "/month")
 */
function hasPricePeriod(text: string): boolean {
  return /\/\s*(forever|month|year|week|day|mo|yr|wk|annual|quarterly)/i.test(text);
}

/**
 * Get semantic placeholder based on tag name and context
 */
function getSemanticPlaceholder(
  tag: string,
  originalText: string,
  className?: string,
  elementName?: string
): string {
  const tagLower = tag.toLowerCase();

  // Check for logo - class name, element name, or text content contains "logo"
  const isLogo =
    (className && /\blogo\b/i.test(className)) ||
    (elementName && /\blogo\b/i.test(elementName)) ||
    (originalText && /^logo$/i.test(originalText.trim()));

  if (isLogo) {
    return "Logo";
  }

  // Preserve price patterns with periods (e.g., "$0 /forever" -> "$0 /period")
  if (hasPricePeriod(originalText)) {
    // Replace the price amount but keep the period indicator
    const periodMatch = originalText.match(/(\/\s*\w+)/);
    const period = periodMatch ? periodMatch[1] : "/period";
    return `$0 ${period}`;
  }

  // Preserve simple price patterns (e.g., "$99" -> "$0")
  if (isPricePattern(originalText)) {
    // Extract currency symbol if present
    const currencyMatch = originalText.match(/[$€£¥₹]/);
    const currency = currencyMatch ? currencyMatch[0] : "$";
    return `${currency}0`;
  }

  const placeholder = SEMANTIC_PLACEHOLDERS[tagLower];

  if (placeholder) {
    return placeholder;
  }

  // For unknown tags, create a generic placeholder based on original length
  const length = originalText.length;
  if (length <= 10) return "Text";
  if (length <= 50) return "Short description text";
  if (length <= 150) return "Medium length paragraph text for this section.";
  return "Longer paragraph with detailed content that spans multiple lines for proper layout testing.";
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
  // ... other properties not needed for text transformation
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
 * Transform text content in element tree based on text mode
 */
function transformTextInElement(element: ExtractedElement, textMode: TextMode): ExtractedElement {
  // Clone the element to avoid mutation
  const transformed = { ...element };

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
          transformed.name
        );
        break;
      case "website":
      default:
        // Keep original text
        break;
    }
  }

  // Recursively transform children
  if (transformed.children && transformed.children.length > 0) {
    transformed.children = transformed.children.map((child) =>
      transformTextInElement(child, textMode)
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
