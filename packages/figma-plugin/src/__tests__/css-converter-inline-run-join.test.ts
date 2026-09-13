/**
 * Regression tests for css-converter.ts — two text runs that the browser laid
 * out on ONE line must be joined by the separator their measured gap implies,
 * not by an unconditional space.
 *
 * Concrete bug fixed here: glinc.io's nav brand
 *   <a class="brand">GL<span class="inc">inc</span></a>
 * where "GL" ends at x=243.56 and "inc" starts at exactly 243.56 — no gap, no
 * whitespace in the DOM. The converter still wrote "GL inc", which no longer
 * fits the 56px box, so Figma wrapped the logo onto two lines.
 *
 * `rowSeparator()` in textRunMerge.ts already encodes the right rule for the
 * sibling-merge pass; this is the same rule inside the coalescing path.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

type Tree = Record<string, unknown>;

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

function makeText(value: string, x: number, width: number): Record<string, unknown> {
  return {
    type: 'TEXT',
    x, y: 0, width, height: 24,
    quad: [x, 0, x + width, 0, x + width, 24, x, 24],
    value,
    font: 'Archivo Bold',
  };
}

/** <a>GL<span>inc</span></a> with `inc` starting `incX` px from the origin. */
function brand(incX: number): Record<string, unknown> {
  const inc = makeFrame({
    tag: 'span',
    classList: ['inc'],
    x: incX, y: 0, width: 29, height: 24,
    quad: [incX, 0, incX + 29, 0, incX + 29, 24, incX, 24],
    styles: { display: 'inline', fontSize: '20px' },
    children: [makeText('inc', incX, 29)],
  });

  return makeFrame({
    tag: 'a',
    classList: ['brand'],
    x: 0, y: 0, width: incX + 29, height: 30,
    quad: [0, 0, incX + 29, 0, incX + 29, 30, 0, 30],
    styles: { display: 'block', fontSize: '20px' },
    children: [makeText('GL', 0, 27), inc],
  });
}

describe("css-converter: same-row run join follows the measured gap", () => {
  it("1. runs that touch (gap 0) join with no separator", () => {
    const result = convertW2WToWireframe(brand(27) as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).type).toBe('text');
    expect((result as Tree).textContent).toBe('GLinc');
  });

  it("2. runs separated by a visible gap still join with a space", () => {
    const result = convertW2WToWireframe(brand(33) as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).type).toBe('text');
    expect((result as Tree).textContent).toBe('GL inc');
  });

  // -------------------------------------------------------------------------
  // Runs are not lines. `browserLineCount` drives the renderer's whole sizing
  // branch (layout.ts `applyChildInAutoLayout`, text.ts `resolveTextSizing`):
  // >1 means "the browser wrapped this", so the node is pinned to the captured
  // width with textAutoResize NONE. Counting inline RUNS there reported the
  // one-line logo as two lines, and 56.36px of Archivo in Figma no longer fit
  // the 56.36px box — so it wrapped, exactly as the count claimed.
  //
  // `renderedTextWidths` (plural) already groups by row for the same reason;
  // these two just never got the memo.
  // -------------------------------------------------------------------------
  it("3. two runs on one row count as ONE browser line", () => {
    const result = convertW2WToWireframe(brand(27) as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).browserLineCount).toBe(1);
  });

  it("4. renderedTextWidth is the widest ROW, not the widest run", () => {
    const result = convertW2WToWireframe(brand(27) as never, { layoutMode: 'autoLayout' });
    // 27 ("GL") + 29 ("inc") on one row — not max(27, 29).
    expect((result as Tree).renderedTextWidth).toBe(56);
  });

  it("5. runs on separate rows still count as separate lines", () => {
    const second = makeText('inc', 0, 29);
    (second as Record<string, unknown>).y = 30;
    (second as Record<string, unknown>).quad = [0, 30, 29, 30, 29, 54, 0, 54];

    const el = makeFrame({
      tag: 'a',
      x: 0, y: 0, width: 40, height: 60,
      quad: [0, 0, 40, 0, 40, 60, 0, 60],
      styles: { display: 'block', fontSize: '20px' },
      children: [makeText('GL', 0, 27), second],
    });

    const result = convertW2WToWireframe(el as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).browserLineCount).toBe(2);
  });
});
