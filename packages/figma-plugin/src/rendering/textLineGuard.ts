/**
 * Guarantee a text node never renders MORE lines than the browser measured.
 *
 * The converter joins soft-wrapped rows with a space on purpose — the copy
 * stays re-flowable in Figma, which is what a designer wants when the font
 * matches. But it also hands the wrap decision to Figma, and Figma wraps with
 * whatever font actually resolved. On stripe.com's stats heading the site font
 * ("Söhne VF") was unavailable, the node came out `fontName: MIXED`, the
 * substituted glyphs measured wider, and 2 browser lines became 3 Figma lines:
 * the box grew 115.34px → 176px and shoved the stats row 54px into the chart
 * image below it.
 *
 * h2d avoids this class of bug by never letting Figma wrap at all — it bakes
 * every measured line break as `\n` and hugs. That costs re-flowability on
 * every node. This guard takes the same insurance only where it is actually
 * needed: measure first, and re-bake the measured rows just for the nodes that
 * diverged.
 *
 * The rewrite replaces one separator character per row boundary with `\n` —
 * exactly the same length — so styled-range indices set during creation stay
 * valid without replaying them.
 */
import type { WireframeNode } from "../types";
import { bisectFontSizeToFit, TEXT_RESIZE_SLACK } from "./text";

/** The subset of TextNode this guard measures and mutates. */
type MeasurableText = Pick<
  TextNode,
  "characters" | "width" | "height" | "fontSize" | "lineHeight" | "textAutoResize"
> & { resize(width: number, height: number): void };

/**
 * Character offset of each row separator in `characters`, assuming the node
 * still holds exactly `lines` joined by one character each. Returns null when
 * that assumption fails — lorem/semantic modes rewrite `characters` after the
 * converter ran, and a stale rewrite would corrupt the copy.
 */
function separatorOffsets(characters: string, lines: string[]): number[] | null {
  const offsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    if (characters.slice(cursor, cursor + lines[i].length) !== lines[i]) return null;
    cursor += lines[i].length;
    if (i === lines.length - 1) break;
    const sep = characters[cursor];
    if (sep !== " " && sep !== "\n") return null;
    offsets.push(cursor);
    cursor += 1;
  }
  return cursor === characters.length ? offsets : null;
}

/** Resolved px line height, or null when the node carries no pixel value. */
function pixelLineHeight(textNode: MeasurableText): number | null {
  const lh = textNode.lineHeight;
  if (lh && typeof lh === "object" && "unit" in lh && lh.unit === "PIXELS") {
    const value = (lh as { value: number }).value;
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * Re-bake `node.measuredLines` as hard breaks when the node renders taller
 * than those lines account for. Returns whether anything was changed.
 *
 * Safe to call on any text node: every precondition it cannot verify makes it
 * a no-op rather than a guess.
 */
export function enforceMeasuredLineCount(
  textNode: MeasurableText,
  node: WireframeNode,
): boolean {
  const lines = node.measuredLines;
  if (!lines || lines.length < 2) return false;

  // `applyLineHeightFromCss` pins a px value on every multi-line node, so a
  // missing one means this node took a path where line counting is not
  // meaningful (mixed ranges, AUTO leading).
  const lineHeightPx = pixelLineHeight(textNode);
  if (lineHeightPx === null) return false;

  const renderedLines = Math.round(textNode.height / lineHeightPx);
  if (renderedLines <= lines.length) return false;

  const offsets = separatorOffsets(textNode.characters, lines);
  if (offsets === null) return false;

  const chars = textNode.characters.split("");
  for (const offset of offsets) chars[offset] = "\n";
  textNode.characters = chars.join("");

  // Hug to learn the widest baked line, then fall back on the same
  // shrink-to-fit bisection the sizing ladder uses when it overflows the
  // captured box. A mixed-range fontSize (figma.mixed) is not a finite number,
  // so bisectFontSizeToFit declines it and the box simply widens instead —
  // the line COUNT, which is what overflows the layout, is already fixed.
  textNode.textAutoResize = "WIDTH_AND_HEIGHT";
  const boxWidth = Math.max(node.width || 1, 1);
  if (textNode.width > boxWidth + 1) {
    const originalFontSize = textNode.fontSize as number;
    const winner = bisectFontSizeToFit(originalFontSize, (fs) => {
      textNode.fontSize = fs;
      return textNode.width <= boxWidth + 1;
    });
    textNode.fontSize = winner ?? originalFontSize;
  }

  const fittedWidth = textNode.width;
  textNode.resize(
    Math.max(fittedWidth, boxWidth) + TEXT_RESIZE_SLACK,
    Math.max(node.height || lineHeightPx * lines.length, 1),
  );
  textNode.textAutoResize = "NONE";
  return true;
}
