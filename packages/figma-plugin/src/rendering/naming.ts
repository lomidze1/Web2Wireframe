/**
 * Semantic layer naming — h2d parity.
 *
 * Two stages, matching html.to.design's observed output (confirmed against
 * their real stripe.com import):
 *
 *   Stage 1 (here: {@link getSemanticElementName}) — a name from the element
 *   itself: h2d's tag→role map (`U2`, app.js:38220) plus structural tags,
 *   with `role`, `aria-label` and `alt` taken into account. Generic
 *   containers (div/span/p and media) deliberately get NO name.
 *
 *   Stage 2 ({@link applyRoleNames}) — a name from what the node paints,
 *   applied post-conversion when fills/strokes/effects are known (h2d `iq`,
 *   app.js:51842): "Horizontal Divider", "Paragraph",
 *   "Background+Border+Shadow", image layers named by filename, final
 *   fallback "Container".
 *
 * Contract: naming never throws and never leaves an empty string — a bad
 * name is cosmetic, a thrown error would lose a whole subtree.
 */

import type { WireframeNode } from "../types";

/** h2d's `U2` tag→role map, ported as-is, + structural tags capitalized. */
const TAG_ROLE_MAP: Record<string, string> = {
  // U2 (app.js:38220)
  a: "Link",
  li: "Item",
  ul: "List",
  ol: "Ordered List",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  tr: "Row",
  td: "Data",
  th: "Cell",
  thead: "Header",
  tbody: "Body",
  tfoot: "Footer",
  dl: "Descriptions",
  dt: "Term",
  dd: "Details",
  hr: "Separator",
  q: "Quote",
  select: "Options",
  svg: "SVG",
  em: "Emphasis",
  kbd: "Keyboard",
  var: "Variable",
  samp: "Sample",
  s: "Strikethrough",
  sub: "Subscript",
  sup: "Superscript",
  menu: "Menu item",
  // Structural tags keep their own name, capitalized
  header: "Header",
  footer: "Footer",
  nav: "Nav",
  main: "Main",
  section: "Section",
  form: "Form",
  table: "Table",
  aside: "Aside",
  article: "Article",
  button: "Button",
  iframe: "Iframe",
};

/**
 * ARIA `role` values that don't collide with a tag name but clearly map onto
 * an entry above. Lets `<div role="listitem">` read "Item" like `<li>` does.
 */
const ROLE_ALIASES: Record<string, string> = {
  listitem: "Item",
  list: "List",
  navigation: "Nav",
  banner: "Header",
  contentinfo: "Footer",
  link: "Link",
  heading: "Heading",
  separator: "Separator",
  img: "Image",
  image: "Image",
};

/**
 * Tags stage 1 deliberately leaves unnamed so stage 2 can name them from
 * what they paint: div/span (pure containers), p (all-TEXT children →
 * "Paragraph"), media (filename / "Image").
 */
const GENERIC_TAGS = new Set(["div", "span", "p", "img", "picture", "video", "canvas", "source"]);

const LABEL_MAX = 40;

function cleanLabel(label: unknown): string {
  if (typeof label !== "string") return "";
  return label.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
}

type AttrMap = Record<string, string | number | boolean | undefined>;

/**
 * Stage 1: semantic name from the element itself, or "" when the element
 * has none (generic container — stage 2 names it from its paints).
 */
export function getSemanticElementName(tag: string, attr: AttrMap): string {
  try {
    const role = typeof attr?.role === "string" ? attr.role.toLowerCase() : "";
    if (role === "presentation" || role === "none") return "";

    const label = cleanLabel(attr?.["aria-label"]);

    // Precedence: role attribute → tag map → custom element → tag itself.
    let base = "";
    if (role) base = TAG_ROLE_MAP[role] || ROLE_ALIASES[role] || "";
    if (!base) {
      const t = typeof tag === "string" ? tag.toLowerCase() : "";
      if (TAG_ROLE_MAP[t]) {
        base = TAG_ROLE_MAP[t];
      } else if (t === "img") {
        // Images are named by filename in stage 2 — unless alt gives a
        // human label, which beats a filename.
        const alt = cleanLabel(attr?.alt);
        return alt ? `Image - ${alt}` : "";
      } else if (GENERIC_TAGS.has(t)) {
        return "";
      } else if (t.includes("-")) {
        base = t; // custom element keeps its tag verbatim
      } else {
        base = t; // unmapped non-generic tag keeps the tag itself
      }
    }

    if (!base) return "";
    return label ? `${base} - ${label}` : base;
  } catch {
    return "";
  }
}

/**
 * Join collapse-chain name segments with " → ", h2d-style
 * (`List → Item → Link - Pricing`). Caps the chain at `max` segments,
 * keeping the INNERMOST ones — the deepest element is the one the user is
 * looking at.
 */
export function chainNames(segments: string[], max = 3): string {
  const parts = segments
    .flatMap((s) => (s ? s.split(" → ") : []))
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(-max).join(" → ");
}

// ---------------------------------------------------------------------------
// Stage 2 — role name from what the node paints (h2d `iq`, app.js:51842)
// ---------------------------------------------------------------------------

/** Last path segment of an image URL, or "" when there is no usable name. */
function imageFilename(url: unknown): string {
  if (typeof url !== "string" || !url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return "";
  try {
    const path = url.split(/[?#]/)[0];
    // Strip protocol+host so a bare "https://cdn.example.com" never yields
    // the hostname as a "filename".
    const afterHost = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
    const seg = decodeURIComponent(afterHost.split("/").filter(Boolean).pop() || "");
    if (!seg || !seg.includes(".")) return "";
    return seg.slice(0, LABEL_MAX);
  } catch {
    return "";
  }
}

function hasImageFill(node: WireframeNode): boolean {
  return !!node.fills?.some(
    (f) => f.type === "IMAGE_PLACEHOLDER" || f.isImagePlaceholder || !!f.imageUrl,
  );
}

function hasGradientFill(node: WireframeNode): boolean {
  return !!node.fills?.some((f) => f.type.startsWith("GRADIENT"));
}

function hasSolidFill(node: WireframeNode): boolean {
  return !!node.fills?.some((f) => f.type === "SOLID") || node.backgroundColor != null;
}

/** Name a single unnamed node from geometry, children and paints. */
function paintRoleName(node: WireframeNode): string {
  const hasFills =
    (node.fills?.length ?? 0) > 0 || node.backgroundColor != null;
  const hasStrokes =
    (node.strokes?.length ?? 0) > 0 ||
    (node.borderColor != null && (node.borderWidth ?? 0) > 0);
  const hasEffects = (node.effects?.length ?? 0) > 0;

  // Thin, long and painted → a divider line.
  if (hasFills || hasStrokes) {
    if (node.width <= 2 && node.height > 4) return "Vertical Divider";
    if (node.height <= 2 && node.width > 4) return "Horizontal Divider";
  }

  // A frame whose children are all TEXT reads as a paragraph.
  if (
    node.children?.length > 0 &&
    node.children.every((c) => c.type === "text")
  ) {
    return "Paragraph";
  }

  const parts: string[] = [];

  if (hasFills) {
    if (hasImageFill(node)) parts.push("Image");
    else if (hasGradientFill(node)) parts.push("Gradient");
    else if (hasSolidFill(node) && node.opacity <= 0.9) parts.push("Overlay");
    else parts.push("Background");
  }

  if (hasStrokes) {
    const sides = node.strokes?.[0]?.sides;
    if (sides) {
      const horizontalOnly = (sides.top || sides.bottom) && !sides.left && !sides.right;
      const verticalOnly = (sides.left || sides.right) && !sides.top && !sides.bottom;
      if (horizontalOnly) parts.push("HorizontalBorder");
      else if (verticalOnly) parts.push("VerticalBorder");
      else parts.push("Border");
    } else {
      parts.push("Border");
    }
  }

  if (hasEffects) {
    const types = new Set(node.effects!.map((e) => e.type));
    if (types.has("DROP_SHADOW") || types.has("INNER_SHADOW")) parts.push("Shadow");
    if (types.has("LAYER_BLUR")) parts.push("Blur");
    if (types.has("BACKGROUND_BLUR")) parts.push("OverlayBlur");
  }

  return parts.length > 0 ? parts.join("+") : "Container";
}

/**
 * Stage 2 pass: walk the converted WireframeNode tree and name every node
 * stage 1 left unnamed. Runs after `collapseMarginWrappers` so it sees the
 * final tree shape; fills/strokes/effects are already set by then.
 * Guarantees the never-empty contract for the whole tree.
 */
export function applyRoleNames(root: WireframeNode): void {
  const visit = (node: WireframeNode): void => {
    if (!node.name) {
      try {
        if (node.type === "text") {
          node.name = "Text";
        } else {
          // Image layers are named by their filename (h2d: "decagon.png").
          const file =
            node.type === "placeholder" || hasImageFill(node)
              ? imageFilename(node.imageUrl) ||
                imageFilename(node.fills?.find((f) => f.imageUrl)?.imageUrl)
              : "";
          node.name = file || paintRoleName(node);
        }
      } catch {
        node.name = "Container";
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
}
