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
  a: "Link Text",
  button: "Button",
  label: "Label",
  li: "List item",
  td: "Cell",
  th: "Header",
  input: "Input field",
  textarea: "Text area content",
  small: "Fine print",
  strong: "Important",
  em: "Emphasized",
  blockquote: "Quote text here...",
};

/**
 * Generate Lorem Ipsum text of appropriate length
 */
function generateLoremIpsum(originalLength: number): string {
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

  // Estimate word count from character length (average word ~5 chars + space)
  const targetWords = Math.max(1, Math.ceil(originalLength / 6));
  const result: string[] = [];

  for (let i = 0; i < targetWords; i++) {
    const word = loremWords[i % loremWords.length];
    // Capitalize first word
    result.push(i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word);
  }

  return result.join(" ");
}

/**
 * Get semantic placeholder based on tag name
 */
function getSemanticPlaceholder(tag: string, originalText: string): string {
  const tagLower = tag.toLowerCase();
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
        transformed.textContent = getSemanticPlaceholder(transformed.tag, transformed.textContent);
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
