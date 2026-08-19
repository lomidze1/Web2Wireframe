/**
 * The cross-axis FILL heuristic must measure the parent's real content box.
 *
 * getSizing upgrades a FIXED flex child to FILL when its CSS pixel width
 * matches the parent's content width, computed as
 *   parentDims.width - paddingLeft - paddingRight
 * `parentDims.width` is `node.width`, i.e. the browser's BORDER box, so the
 * parent's own border widths were still counted as content. With the ±2px
 * tolerance any parent with a border thicker than 1px per side silently lost
 * the upgrade and its `width: 100%` child stayed FIXED.
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

describe("horizontal cross-axis upgrade (column parent)", () => {
  /**
   * 600px border box, 4px border + 20px padding per side → 552px of content.
   */
  function column(border: string, childWidth: string) {
    const b = parseFloat(border);
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
        borderLeftWidth: border,
        borderRightWidth: border,
        borderLeftStyle: 'solid',
        borderRightStyle: 'solid',
      },
      children: [
        {
          type: 'FRAME',
          x: 20 + b, y: 0, width: parseFloat(childWidth), height: 100,
          quad: [0, 0, 1, 0, 1, 1, 0, 1],
          tag: 'section',
          classList: [],
          attr: {},
          styles: { display: 'block', width: childWidth },
          children: [],
        },
      ],
    };
  }

  const section = (root: WireframeNode) => findNode(root, n => n.tag === 'section')!;

  it("upgrades to FILL through a 4px border", () => {
    expect(section(convert(column('4px', '552px'))).layoutSizingHorizontal).toBe('FILL');
  });

  it("keeps working with no border at all", () => {
    expect(section(convert(column('0px', '560px'))).layoutSizingHorizontal).toBe('FILL');
  });

  it("does not upgrade a child that is genuinely narrower", () => {
    expect(section(convert(column('4px', '400px'))).layoutSizingHorizontal).toBe('FIXED');
  });
});

describe("vertical cross-axis upgrade (row parent)", () => {
  /**
   * 300px tall border box, 6px border + 10px padding top and bottom → 268px.
   */
  function row(border: string, childHeight: string) {
    return {
      type: 'FRAME',
      x: 0, y: 0, width: 800, height: 300,
      quad: [0, 0, 800, 0, 800, 300, 0, 300],
      tag: 'div',
      classList: [],
      attr: {},
      styles: {
        display: 'flex',
        flexDirection: 'row',
        paddingTop: '10px',
        paddingBottom: '10px',
        borderTopWidth: border,
        borderBottomWidth: border,
        borderTopStyle: 'solid',
        borderBottomStyle: 'solid',
      },
      children: [
        {
          type: 'FRAME',
          x: 0, y: 16, width: 200, height: parseFloat(childHeight),
          quad: [0, 0, 1, 0, 1, 1, 0, 1],
          tag: 'section',
          classList: [],
          attr: {},
          styles: { display: 'block', width: '200px', height: childHeight },
          children: [],
        },
      ],
    };
  }

  const section = (root: WireframeNode) => findNode(root, n => n.tag === 'section')!;

  it("upgrades to FILL through a 6px border", () => {
    expect(section(convert(row('6px', '268px'))).layoutSizingVertical).toBe('FILL');
  });

  it("keeps working with no border at all", () => {
    expect(section(convert(row('0px', '280px'))).layoutSizingVertical).toBe('FILL');
  });
});
