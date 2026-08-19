/**
 * `flex-shrink: 0` must survive the FILL upgrades in getSizing.
 *
 * Two places promote a flex child to FILL: an explicit `width: 100%`, and the
 * cross-axis heuristic that upgrades a FIXED child whose pixel width matches
 * the parent's content box. Neither consulted `flex-shrink`. An item declared
 * `flex-shrink: 0` is one the browser refuses to shrink — handing it to Figma
 * as FILL means the opposite: it now resizes with its container.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function findNode(
  node: unknown,
  predicate: (n: WireframeNode) => boolean,
): WireframeNode | null {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== 'object') continue;
    const obj = cur as WireframeNode;
    if (predicate(obj)) return obj;
    if (Array.isArray(obj.children)) stack.push(...obj.children);
  }
  return null;
}

function convert(tree: Record<string, unknown>): WireframeNode {
  return convertW2WToWireframe(tree as never, {});
}

/** Horizontal flex row with one `width: 100%` child. */
function row(childStyles: Record<string, unknown>) {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 800, height: 100,
    quad: [0, 0, 800, 0, 800, 100, 0, 100],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'flex', flexDirection: 'row' },
    children: [
      {
        type: 'FRAME',
        x: 0, y: 0, width: 800, height: 100,
        quad: [0, 0, 800, 0, 800, 100, 0, 100],
        tag: 'aside',
        classList: [],
        attr: {},
        styles: { display: 'block', width: '100%', ...childStyles },
        children: [],
      },
    ],
  };
}

const aside = (root: WireframeNode) => findNode(root, n => n.tag === 'aside')!;

describe("width: 100% in a flex row", () => {
  it("becomes FILL with the default shrink", () => {
    expect(aside(convert(row({}))).layoutSizingHorizontal).toBe('FILL');
  });

  it("becomes FILL with an explicit shrink of 1", () => {
    expect(aside(convert(row({ flexShrink: 1 }))).layoutSizingHorizontal).toBe('FILL');
  });

  it("stays FIXED when the item cannot shrink", () => {
    expect(aside(convert(row({ flexShrink: 0 }))).layoutSizingHorizontal).toBe('FIXED');
  });

  it("still fills when the item both grows and cannot shrink", () => {
    // `flex: 1 0 auto` — growing is an explicit intent to take the free space.
    expect(
      aside(convert(row({ flexShrink: 0, flexGrow: 1 }))).layoutSizingHorizontal,
    ).toBe('FILL');
  });
});

describe("cross-axis FILL upgrade is not a flex-shrink concern", () => {
  /**
   * Vertical flex parent 600px wide with 20px side padding → 560px of content.
   * The child's CSS width resolves to exactly that, which is the signal the
   * heuristic looks for.
   *
   * `flex-shrink` only governs the MAIN axis. In a column parent the horizontal
   * axis is the cross axis, so the upgrade must happen regardless of shrink —
   * these cases exist to keep the §3 guard from over-reaching.
   */
  function column(childStyles: Record<string, unknown>) {
    return {
      type: 'FRAME',
      x: 0, y: 0, width: 600, height: 400,
      quad: [0, 0, 600, 0, 600, 400, 0, 400],
      tag: 'div',
      classList: [],
      attr: {},
      styles: {
        display: 'flex',
        flexDirection: 'column',
        paddingLeft: '20px',
        paddingRight: '20px',
      },
      children: [
        {
          type: 'FRAME',
          x: 20, y: 0, width: 560, height: 100,
          quad: [20, 0, 580, 0, 580, 100, 20, 100],
          tag: 'section',
          classList: [],
          attr: {},
          styles: { display: 'block', width: '560px', ...childStyles },
          children: [],
        },
      ],
    };
  }

  const section = (root: WireframeNode) => findNode(root, n => n.tag === 'section')!;

  it("upgrades a matching width to FILL", () => {
    expect(section(convert(column({}))).layoutSizingHorizontal).toBe('FILL');
  });

  it("still upgrades when the item cannot shrink — wrong axis for shrink", () => {
    expect(
      section(convert(column({ flexShrink: 0 }))).layoutSizingHorizontal,
    ).toBe('FILL');
  });
});
