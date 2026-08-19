/**
 * CSS `aspect-ratio` → Figma `constrainProportions`.
 *
 * Geometry still comes from the browser measurement, so there is no visual
 * delta at import time; the point is that a box which declared a ratio keeps
 * it when the designer resizes the frame afterwards.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { applySharedDecorations } from "../rendering/nodes";
import type { RenderContext, WireframeNode } from "../types";

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

function convert(styles: Record<string, unknown>): WireframeNode {
  const tree = {
    type: 'FRAME',
    x: 0, y: 0, width: 400, height: 300,
    quad: [0, 0, 400, 0, 400, 300, 0, 300],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [
      {
        type: 'FRAME',
        x: 0, y: 0, width: 320, height: 180,
        quad: [0, 0, 320, 0, 320, 180, 0, 180],
        tag: 'figure',
        classList: [],
        attr: {},
        styles: { display: 'block', ...styles },
        children: [],
      },
    ],
  };
  return findNode(convertW2WToWireframe(tree as never, {}), n => n.tag === 'figure')!;
}

describe("converter emits constrainProportions", () => {
  it("for a ratio written with a slash", () => {
    expect(convert({ aspectRatio: '16 / 9' }).constrainProportions).toBe(true);
  });

  it("for a bare number", () => {
    expect(convert({ aspectRatio: '1.7777' }).constrainProportions).toBe(true);
  });

  it("for the square shorthand", () => {
    expect(convert({ aspectRatio: '1 / 1' }).constrainProportions).toBe(true);
  });

  it("not for `auto`", () => {
    expect(convert({ aspectRatio: 'auto' }).constrainProportions).toBeUndefined();
  });

  it("not when the property is absent", () => {
    expect(convert({}).constrainProportions).toBeUndefined();
  });

  it("not for a degenerate zero ratio", () => {
    expect(convert({ aspectRatio: '0 / 1' }).constrainProportions).toBeUndefined();
  });

  it("not for `auto 16 / 9` — the fallback form is a hint, not a constraint", () => {
    expect(convert({ aspectRatio: 'auto 16 / 9' }).constrainProportions).toBeUndefined();
  });
});

describe("applySharedDecorations sets it on the Figma node", () => {
  const context = { colorMode: "original" } as unknown as RenderContext;

  function target() {
    return {
      opacity: 1,
      blendMode: "NORMAL",
      visible: true,
      constrainProportions: false,
      setPluginData: () => undefined,
    } as unknown as SceneNode & { constrainProportions: boolean };
  }

  it("applies the flag", () => {
    const t = target();
    applySharedDecorations(t, { constrainProportions: true } as WireframeNode, context);
    expect(t.constrainProportions).toBe(true);
  });

  it("leaves the node untouched when the flag is absent", () => {
    const t = target();
    applySharedDecorations(t, {} as WireframeNode, context);
    expect(t.constrainProportions).toBe(false);
  });

  it("does not throw on a node that lacks the property", () => {
    const bare = { opacity: 1, blendMode: "NORMAL", visible: true } as unknown as SceneNode;
    expect(() =>
      applySharedDecorations(bare, { constrainProportions: true } as WireframeNode, context),
    ).not.toThrow();
  });
});
