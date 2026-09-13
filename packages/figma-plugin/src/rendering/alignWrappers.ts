/**
 * `align-self` → `:align-<value>` wrapper — h2d's `H8`
 * (`_research/h2d-plugin/_beautified/app.beautified.js:58150`).
 *
 * Figma has no per-child cross-axis alignment that survives: a child's
 * counter-axis sizing and its `layoutAlign` are one property, so the
 * `layoutSizing*` write that nodes.ts makes right after resets any MIN/CENTER/
 * MAX back to INHERIT. A whole 3321-node stripe.com dump held zero of them,
 * and h2d's own sandbox builder only ever writes INHERIT or STRETCH.
 *
 * What h2d does instead is wrap the child in a frame that spans the parent's
 * entire cross axis and aligns its single child there:
 *
 *   h2.hds-heading:align-center  1234x116  VERTICAL  align-items: center
 *     └ h2.hds-heading           489x116   x = 372
 *
 * The wrapper is built on the WireframeNode tree — before any Figma node
 * exists — exactly as h2d builds it on their descriptor tree, so the whole
 * renderer downstream treats it as an ordinary frame with no special case.
 *
 * Which children get one is decided in css-converter (`resolveAlignSelfWrapper`),
 * where the parent's CSS is still in reach; this pass only does the surgery.
 */
import type { WireframeNode } from "../types";

let _wrapperId = 0;

/**
 * Wrap every child the converter marked, depth first.
 *
 * Runs after `simplifyTree`/`collapseMarginWrappers` so the collapse passes
 * cannot fold the wrapper away, and before `applyRoleNames` so a semantic
 * child is already named (`Heading 2:align-center`, as in h2d's own output).
 */
export function insertAlignWrappers(root: WireframeNode): void {
  const children = root.children;
  if (!children || children.length === 0) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.alignSelfWrapper) {
      children[i] = wrapForAlign(root, child, child.alignSelfWrapper);
    }
    insertAlignWrappers(children[i]);
  }
}

/**
 * The wrapper h2d builds: full cross axis, hugging the main axis, carrying the
 * child's `align-self` as its own `align-items`.
 *
 *   S === "HORIZONTAL" ? (I.y = W[0], I.$autoWidth  = true, I.height = t.height - W[0] - W[2])
 *                      : (I.x = W[3], I.$autoHeight = true, I.width  = t.width  - W[3] - W[1])
 */
function wrapForAlign(
  parent: WireframeNode,
  child: WireframeNode,
  align: string,
): WireframeNode {
  const horizontal = parent.layoutMode === "HORIZONTAL";
  const pad = parent.padding;

  const x = horizontal ? child.x : pad.left;
  const y = horizontal ? pad.top : child.y;

  const wrapper: WireframeNode = {
    id: `${child.id}-align-${_wrapperId++}`,
    name: `${child.name}:align-${align}`,
    type: "frame",
    tag: "div",
    x,
    y,
    width: horizontal ? child.width : Math.max(parent.width - pad.left - pad.right, 0),
    height: horizontal ? Math.max(parent.height - pad.top - pad.bottom, 0) : child.height,

    layoutMode: parent.layoutMode === "GRID" ? "VERTICAL" : parent.layoutMode,
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    // The whole point: the child's align-self becomes the wrapper's
    // align-items, which nodes.ts turns into counterAxisAlignItems.
    alignItems: align,
    // Cross-axis STRETCH, h2d's `constraints[crossAxis] = "STRETCH"`.
    layoutAlign: "STRETCH",
    layoutSizingHorizontal: horizontal ? "HUG" : "FILL",
    layoutSizingVertical: horizontal ? "FILL" : "HUG",

    // Paints nothing — it is a layout box, not a surface.
    backgroundColor: null,
    backgroundGradient: null,
    textColor: child.textColor,
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: child.fontSize,
    fontWeight: child.fontWeight,
    fontFamily: child.fontFamily,
    textAlign: child.textAlign,
    lineHeight: child.lineHeight,
    letterSpacing: child.letterSpacing,
    isPlaceholder: false,
    children: [child],
  };

  // The child now measures from the wrapper's origin — h2d's `H.x -= I.x`.
  child.x -= x;
  child.y -= y;
  // Both markers go: the wrapper's align-items now says what align-self said,
  // so nothing downstream re-applies it and a second pass is a no-op.
  delete child.alignSelf;
  delete child.alignSelfWrapper;

  return wrapper;
}
