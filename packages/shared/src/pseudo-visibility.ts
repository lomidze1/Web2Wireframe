/**
 * Pseudo-element visibility decision.
 *
 * Pure helper — takes a snapshot of computed-style values and decides whether
 * a ::before/::after should be materialized as a wireframe node, plus extracts
 * the text value (decoding CSS unicode escapes for icon fonts).
 *
 * Rule: a pseudo renders if it has *any* visual presence — text content
 * OR background color / background image / border / outline / box-shadow /
 * explicit width / explicit height. `content: ""` alone is NOT a reason to
 * skip; it just means there is no text. An empty <div> with dimensions and a
 * fill renders — an empty pseudo with the same styling must do the same.
 */

export interface PseudoVisibilityInput {
  /** Raw value from getComputedStyle(el, '::pseudo').content */
  content: string | null | undefined;
  display: string;
  visibility: string;
  backgroundColor: string;
  backgroundImage: string;
  borderWidth: string;
  borderStyle: string;
  outlineWidth: string;
  outlineStyle: string;
  boxShadow: string;
  /** Explicit CSS width (not the resolved box width) */
  width: string;
  /** Explicit CSS height (not the resolved box height) */
  height: string;
}

export interface PseudoVisibilityResult {
  /** Should the pseudo be materialized at all? */
  render: boolean;
  /** Did the pseudo have non-empty text content? */
  hasText: boolean;
  /** Decoded text value (unicode escapes resolved). Empty string when no text. */
  textValue: string;
  /** Was any visual presence (background/border/shadow/dimensions) detected? */
  hasVisualPresence: boolean;
}

/**
 * Strip surrounding quotes from a CSS content value and decode unicode
 * escapes (`\f5ae` → `\uf5ae`) used by icon fonts.
 */
function decodeContentValue(raw: string): string {
  const stripped = raw.replace(/^["']|["']$/g, '');
  return stripped.replace(
    /\\([0-9a-fA-F]{1,6})\s?/g,
    (_m, hex) => String.fromCodePoint(parseInt(hex, 16))
  );
}

export function shouldRenderPseudo(
  input: PseudoVisibilityInput
): PseudoVisibilityResult {
  const empty: PseudoVisibilityResult = {
    render: false,
    hasText: false,
    textValue: '',
    hasVisualPresence: false,
  };

  const content = input.content;
  // Property absent entirely — no pseudo declared
  if (content == null) return empty;
  // CSS keywords signalling "no pseudo"
  if (content === 'none' || content === 'normal') return empty;

  // Hidden
  if (input.display === 'none' || input.visibility === 'hidden') return empty;

  // Text presence
  const textValue = decodeContentValue(content);
  const hasText = textValue.length > 0;

  // Visual presence — any of: background color, background image,
  // border, outline, box-shadow, explicit dimensions
  const hasBackgroundColor =
    input.backgroundColor !== '' &&
    input.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
    input.backgroundColor !== 'transparent';

  const hasBackgroundImage =
    input.backgroundImage !== '' && input.backgroundImage !== 'none';

  const hasBorder =
    input.borderWidth !== '' &&
    input.borderWidth !== '0px' &&
    input.borderStyle !== '' &&
    input.borderStyle !== 'none';

  const hasOutline =
    input.outlineWidth !== '' &&
    input.outlineWidth !== '0px' &&
    input.outlineStyle !== '' &&
    input.outlineStyle !== 'none';

  const hasBoxShadow =
    input.boxShadow !== '' && input.boxShadow !== 'none';

  const hasExplicitWidth =
    input.width !== '' && input.width !== '0px' && input.width !== 'auto';

  const hasExplicitHeight =
    input.height !== '' && input.height !== '0px' && input.height !== 'auto';

  const hasVisualPresence =
    hasBackgroundColor ||
    hasBackgroundImage ||
    hasBorder ||
    hasOutline ||
    hasBoxShadow ||
    hasExplicitWidth ||
    hasExplicitHeight;

  return {
    render: hasText || hasVisualPresence,
    hasText,
    textValue,
    hasVisualPresence,
  };
}
