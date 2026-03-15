/**
 * Lightweight HTML validator for detecting structural syntax errors.
 * Uses stack-based tag matching to find unclosed/mismatched tags
 * and missing closing brackets.
 *
 * Does NOT validate: attribute syntax, semantic correctness, nesting rules.
 * Only targets errors that would cause unexpected rendering.
 */

export interface HtmlValidationResult {
  isValid: boolean;
  errorCount: number;
  errors: string[];
}

/** HTML void elements that never need a closing tag */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Strip content that could cause false positives:
 * - HTML comments: <!-- ... -->
 * - Script blocks: <script>...</script>
 * - Style blocks: <style>...</style>
 */
function stripIgnoredContent(html: string): string {
  // Remove comments
  let result = html.replace(/<!--[\s\S]*?-->/g, "");
  // Remove script content (keep tags for matching, replace inner content)
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  // Remove style content
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  return result;
}

/**
 * Parse a tag's content to find the actual closing `>`, respecting quoted attributes.
 * Returns the index of `>` relative to the start of the search, or -1 if not found
 * before the next `<`.
 */
function findTagEnd(html: string, startAfterLt: number): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = startAfterLt; i < html.length; i++) {
    const ch = html[i];

    if (inSingleQuote) {
      if (ch === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (ch === '"') inDoubleQuote = false;
      continue;
    }

    if (ch === "'") { inSingleQuote = true; continue; }
    if (ch === '"') { inDoubleQuote = true; continue; }
    if (ch === ">") return i;
    if (ch === "<") return -1; // Next tag started before this one closed
  }
  return -1; // Reached end of string without finding >
}

export function validateHtml(html: string): HtmlValidationResult {
  const errors: string[] = [];

  if (!html.trim()) {
    return { isValid: true, errorCount: 0, errors: [] };
  }

  const cleaned = stripIgnoredContent(html);

  // Check if content has any HTML tags at all
  const hasHtmlTags = /<[a-zA-Z]/.test(cleaned);
  if (!hasHtmlTags) {
    const hasCssPatterns = /[.#@a-zA-Z][^<]*\{[^}]*\}/.test(cleaned);
    const message = hasCssPatterns
      ? "No HTML tags found — this looks like CSS code. Did you paste it in the wrong field?"
      : "No HTML tags found. Please enter valid HTML code.";
    errors.push(message);
    return { isValid: false, errorCount: 1, errors };
  }

  // Stack of open tag names
  const stack: string[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const ltIndex = cleaned.indexOf("<", i);
    if (ltIndex === -1) break;

    // Skip DOCTYPE, processing instructions
    if (cleaned.substring(ltIndex, ltIndex + 2) === "<!") {
      const gtIndex = cleaned.indexOf(">", ltIndex);
      i = gtIndex === -1 ? cleaned.length : gtIndex + 1;
      continue;
    }

    // Check if this is a closing tag
    const isClosing = cleaned[ltIndex + 1] === "/";
    const tagStart = isClosing ? ltIndex + 2 : ltIndex + 1;

    // Find the end of the tag
    const tagEnd = findTagEnd(cleaned, tagStart);

    if (tagEnd === -1) {
      // Missing closing bracket — next `<` appeared or end of string
      // Extract what tag name we can see
      const partial = cleaned.substring(tagStart, tagStart + 20).match(/^[a-zA-Z][a-zA-Z0-9]*/);
      const tagName = partial ? partial[0] : "unknown";
      errors.push(`Missing closing bracket ">" for <${tagName}>`);
      // Skip past this broken tag — advance to next <
      const nextLt = cleaned.indexOf("<", ltIndex + 1);
      i = nextLt === -1 ? cleaned.length : nextLt;
      continue;
    }

    // Extract tag content between < and >
    const fullTag = cleaned.substring(ltIndex + 1, tagEnd);

    // Extract tag name
    const nameMatch = fullTag.replace(/^\//, "").match(/^[a-zA-Z][a-zA-Z0-9]*/);
    if (!nameMatch) {
      // Not a real tag (e.g., < followed by non-alpha)
      i = tagEnd + 1;
      continue;
    }

    const tagName = nameMatch[0].toLowerCase();

    // Check for self-closing (ends with /)
    const isSelfClosing = fullTag.trimEnd().endsWith("/");

    if (isClosing) {
      // Closing tag: try to match with stack
      if (stack.length === 0) {
        errors.push(`Tag mismatch: unexpected closing tag </${tagName}>`);
      } else if (stack[stack.length - 1] === tagName) {
        stack.pop();
      } else {
        // Try to find matching tag deeper in stack
        const matchIndex = stack.lastIndexOf(tagName);
        if (matchIndex >= 0) {
          // Report all unclosed tags between match and top
          for (let j = stack.length - 1; j > matchIndex; j--) {
            errors.push(`Tag mismatch: expected </${stack[j]}>, found </${tagName}>`);
          }
          // Remove from match point to top
          stack.splice(matchIndex);
        } else {
          errors.push(`Tag mismatch: unexpected closing tag </${tagName}>`);
        }
      }
    } else if (!VOID_ELEMENTS.has(tagName) && !isSelfClosing) {
      // Opening tag (non-void, non-self-closing): push to stack
      stack.push(tagName);
    }

    i = tagEnd + 1;
  }

  // Any remaining tags on stack are unclosed
  for (const tag of stack) {
    errors.push(`Unclosed tag: <${tag}>`);
  }

  return {
    isValid: errors.length === 0,
    errorCount: errors.length,
    errors,
  };
}
