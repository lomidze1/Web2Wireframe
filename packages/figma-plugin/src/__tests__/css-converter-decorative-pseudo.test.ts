/**
 * Tests for css-converter.ts: decorative pseudo-element rendering
 *
 * Covers Apple.com footer pipe separators — li::after with
 * `content: ""; width: 1px; height: 10px; background: rgba(0,0,0,0.48);
 * position: absolute; right: -1px; top: 0`.
 *
 * The extractor materializes decorative pseudos as FRAME wrappers with
 * class __w2w-pseudo-after and empty children. css-converter must render
 * these as standalone child frames (not drop them like the original
 * flatten-children-only logic did).
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
    tag: 'div',
    classList: [],
    attr: {},
    styles: { display: 'block' },
    children: [],
    ...overrides,
  };
}

function makeText(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 50, height: 14,
    quad: [0, 0, 50, 0, 50, 14, 0, 14],
    value,
    font: '400 12px SFProText',
    ...overrides,
  };
}

function findFramesByClass(
  node: unknown,
  cls: string,
): unknown[] {
  const matches: unknown[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    const className = obj.className as string | undefined;
    if (typeof className === 'string' && className.split(/\s+/).includes(cls)) {
      matches.push(obj);
    }
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return matches;
}

// ---------------------------------------------------------------------------
// Apple footer pipe separator
// ---------------------------------------------------------------------------

describe("css-converter: decorative pseudo-element (empty children)", () => {
  it("renders li::after pipe separator as child frame (apple.com footer)", () => {
    const pseudoAfter = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-after'],
      x: 610, y: 5920, width: 1, height: 10,
      quad: [610, 5920, 611, 5920, 611, 5930, 610, 5930],
      styles: {
        display: 'block',
        position: 'absolute',
        width: '1px',
        height: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.48)',
        right: '-1px',
        top: '0px',
        margin: '3px 0',
      },
      children: [],
    });

    const anchor = makeFrame({
      tag: 'a',
      classList: ['ac-gf-footer-legal-link'],
      x: 526, y: 5920, width: 85, height: 14,
      quad: [526, 5920, 611, 5920, 611, 5934, 526, 5934],
      styles: { display: 'inline-block', fontSize: '12px' },
      children: [makeText('Privacy Policy', { x: 526, width: 85 })],
    });

    const li = makeFrame({
      tag: 'li',
      classList: ['ac-gf-footer-legal-links-item'],
      x: 526, y: 5920, width: 85, height: 16,
      quad: [526, 5920, 611, 5920, 611, 5936, 526, 5936],
      styles: {
        display: 'inline-block',
        position: 'relative',
        marginRight: '6px',
        fontSize: '12px',
      },
      children: [anchor, pseudoAfter],
    });

    const ul = makeFrame({
      tag: 'ul',
      classList: ['ac-gf-footer-legal-links'],
      x: 526, y: 5920, width: 420, height: 21,
      quad: [526, 5920, 946, 5920, 946, 5941, 526, 5941],
      styles: { display: 'block', fontSize: '12px' },
      children: [li],
    });

    const result = convertW2WToWireframe(ul as never, { layoutMode: 'autoLayout' });

    // Find all rendered pseudo-after frames in the tree
    const pseudoFrames = findFramesByClass(result, '__w2w-pseudo-after');
    expect(pseudoFrames.length).toBe(1);

    const pseudoFrame = pseudoFrames[0] as Record<string, unknown>;
    expect(pseudoFrame.type).toBe('frame');
    expect(pseudoFrame.position).toBe('absolute');

    // Dimensions carried through
    expect(pseudoFrame.width).toBe(1);
    expect(pseudoFrame.height).toBe(10);

    // Fill present (background color from pseudo)
    const fills = pseudoFrame.fills as unknown[] | undefined;
    expect(Array.isArray(fills)).toBe(true);
    expect(fills!.length).toBeGreaterThan(0);
  });

  it("renders decorative ::before with border only (no text, no background)", () => {
    const pseudoBefore = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-before'],
      x: 10, y: 10, width: 20, height: 20,
      quad: [10, 10, 30, 10, 30, 30, 10, 30],
      styles: {
        display: 'inline-block',
        width: '20px',
        height: '20px',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: 'rgb(255, 0, 0)',
      },
      children: [],
    });

    const parent = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 100, height: 50,
      quad: [0, 0, 100, 0, 100, 50, 0, 50],
      styles: { display: 'block' },
      children: [pseudoBefore],
    });

    const result = convertW2WToWireframe(parent as never, { layoutMode: 'autoLayout' });

    const frames = findFramesByClass(result, '__w2w-pseudo-before');
    expect(frames.length).toBe(1);
    const pf = frames[0] as Record<string, unknown>;
    expect(pf.type).toBe('frame');
    // Stroke carried through
    const strokes = pf.strokes as unknown[] | undefined;
    expect(Array.isArray(strokes) && strokes!.length > 0).toBe(true);
  });

  it("mixed: decorative pseudo + text-child pseudo in same parent", () => {
    // Decorative ::after (pipe)
    const decoAfter = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-after'],
      x: 90, y: 0, width: 1, height: 10,
      quad: [90, 0, 91, 0, 91, 10, 90, 10],
      styles: {
        display: 'block',
        position: 'absolute',
        width: '1px',
        height: '10px',
        backgroundColor: 'rgb(128, 128, 128)',
      },
      children: [],
    });

    // Text ::before (bullet)
    const bulletText = makeText('•', { x: 0, width: 6 });
    const textBefore = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-before'],
      x: 0, y: 0, width: 6, height: 14,
      quad: [0, 0, 6, 0, 6, 14, 0, 14],
      styles: { display: 'inline', color: 'rgb(0, 0, 0)' },
      children: [bulletText],
    });

    const li = makeFrame({
      tag: 'li',
      x: 0, y: 0, width: 100, height: 16,
      quad: [0, 0, 100, 0, 100, 16, 0, 16],
      styles: { display: 'inline-block', position: 'relative' },
      children: [textBefore, makeText('Item text', { x: 10, width: 80 }), decoAfter],
    });

    const result = convertW2WToWireframe(li as never, { layoutMode: 'autoLayout' });

    // Decorative pseudo rendered as standalone frame
    const decoFrames = findFramesByClass(result, '__w2w-pseudo-after');
    expect(decoFrames.length).toBe(1);

    // Text pseudo NOT rendered as a wrapper frame — its text was flattened
    // into the parent via the existing text coalescing path
    const textFrames = findFramesByClass(result, '__w2w-pseudo-before');
    expect(textFrames.length).toBe(0);
  });

  it("does not route text-only pseudo through decorative branch (regression)", () => {
    const bulletText = makeText('▸', { x: 0, width: 10 });
    const textBefore = makeFrame({
      tag: 'span',
      classList: ['__w2w-pseudo-before'],
      x: 0, y: 0, width: 10, height: 14,
      quad: [0, 0, 10, 0, 10, 14, 0, 14],
      styles: { display: 'inline', color: 'rgb(0, 0, 0)', fontSize: '12px' },
      children: [bulletText],
    });

    const parent = makeFrame({
      tag: 'li',
      x: 0, y: 0, width: 100, height: 16,
      quad: [0, 0, 100, 0, 100, 16, 0, 16],
      styles: { display: 'inline-block' },
      children: [textBefore, makeText('Label', { x: 15, width: 60 })],
    });

    const result = convertW2WToWireframe(parent as never, { layoutMode: 'autoLayout' });

    // The pseudo wrapper itself must NOT appear as a frame — its text was
    // flattened into the parent. This asserts the non-empty-children branch
    // still runs.
    const framesByClass = findFramesByClass(result, '__w2w-pseudo-before');
    expect(framesByClass.length).toBe(0);
  });
});
