/**
 * Shared Extraction Constants
 * Tags and configuration used during DOM extraction
 */

// Skip these tags during extraction (invisible/non-content elements)
export const SKIP_TAGS = [
  "script",
  "style",
  "meta",
  "noscript",
  "link",
  "head",
  "title",
  "br",
  "base",
  "template",
  "dialog",
  "colgroup",
  "col",
  "datalist",
] as const;

// Text tags that should extract content as Figma text nodes
// NOTE: "li" is NOT included - list items are handled as frames with bullet + text children
export const TEXT_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "label",
  "td",
  "th",
  "button",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "mark",
  "sub",
  "sup",
] as const;

// Media tags that become placeholders (images, videos, etc.)
export const MEDIA_TAGS = [
  "img",
  "video",
  "iframe",
  "picture",
  "canvas",
  "svg",
] as const;

// List-related tags
export const LIST_ITEM_TAG = "li" as const;
export const LIST_CONTAINER_TAGS = ["ul", "ol"] as const;

// Maximum recursion depth for tree building
export const MAX_TREE_DEPTH = 15;

// Minimum element size to include (skip tiny elements)
export const MIN_ELEMENT_SIZE = 1;

// Type exports
export type SkipTag = (typeof SKIP_TAGS)[number];
export type TextTag = (typeof TEXT_TAGS)[number];
export type MediaTag = (typeof MEDIA_TAGS)[number];
