/**
 * Regression tests for css-converter.ts — text-only inline wrapper elements
 * (span, a, strong, em, …) must NOT be collapsed into their parent's text
 * content when they carry load-bearing box CSS: margin, padding, display:
 * block/inline-block/flex/grid, or an explicit width/max-width/min-width.
 *
 * Concrete bug fixed here: Apple.com footer directory where
 *   <h3 class="ac-gf-directory-column-section-title">
 *     <span class="ac-gf-directory-column-section-title-text"
 *           style="display:block; margin-bottom:9.6px; margin-inline-end:20px">
 *       Shop and Learn
 *     </span>
 *   </h3>
 * was losing its 9.6px gap because the <span> got flattened into the <h3>'s
 * text, dropping the wrapper's margin.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

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
    x: 0, y: 0, width: 80, height: 16,
    quad: [0, 0, 80, 0, 80, 16, 0, 16],
    value,
    font: '600 12px SFProText',
    ...overrides,
  };
}

type Tree = Record<string, unknown>;
type MarginSides = { top: number; right: number; bottom: number; left: number };

function findChildByTag(parent: Tree, tag: string): Tree | null {
  const children = parent.children as Tree[] | undefined;
  if (!Array.isArray(children)) return null;
  return children.find((c) => c.tag === tag) ?? null;
}

describe("css-converter: text-only wrapper preserves box CSS", () => {
  // -----------------------------------------------------------------------
  // 1. Apple.com footer regression — <span> with display:block + margins
  // -----------------------------------------------------------------------
  it("1. <h3><span display:block margin-bottom:9.6 margin-right:20>…</span></h3> keeps the span as a framed child with margins", () => {
    const span = makeFrame({
      tag: 'span',
      classList: ['ac-gf-directory-column-section-title-text'],
      x: 0, y: 0, width: 120, height: 16,
      quad: [0, 0, 120, 0, 120, 16, 0, 16],
      styles: {
        display: 'block',
        marginTop: '0',
        marginRight: '20',
        marginBottom: '9.6',
        marginLeft: '0',
        fontSize: '12',
        fontWeight: '600',
      },
      children: [
        makeText('Shop and Learn', { x: 0, y: 0, width: 120, height: 16 }),
      ],
    });

    const h3 = makeFrame({
      tag: 'h3',
      classList: ['ac-gf-directory-column-section-title'],
      x: 0, y: 0, width: 180, height: 26,
      quad: [0, 0, 180, 0, 180, 26, 0, 26],
      styles: { display: 'block' },
      children: [span],
    });

    const result = convertW2WToWireframe(h3 as never, { layoutMode: 'autoLayout' });
    // Span's margin bubbles UP to <h3>. <h3> coalesces its child text into
    // itself (it's now a text-bearing coalesce-tag with no non-text
    // children), producing a single text node that carries the margin.
    // This is what gives Figma auto-layout the correct bottom gap between
    // <h3> and its next sibling (Apple footer: 9.6px above the link list).
    expect((result as Tree).type).toBe('text');
    expect((result as Tree).textContent).toContain('Shop and Learn');
    const margin = (result as Tree).margin as { top: number; right: number; bottom: number; left: number } | undefined;
    expect(margin).toBeDefined();
    expect(margin!.bottom).toBeCloseTo(9.6, 2);
    expect(margin!.right).toBe(20);
  });

  // -----------------------------------------------------------------------
  // 2. Regression guard — plain inline <span> still coalesces
  // -----------------------------------------------------------------------
  it("2. <p><span>plain</span></p> with NO box CSS still coalesces into a single text node", () => {
    const span = makeFrame({
      tag: 'span',
      classList: [],
      x: 0, y: 0, width: 50, height: 14,
      quad: [0, 0, 50, 0, 50, 14, 0, 14],
      styles: { display: 'inline' },
      children: [makeText('plain', { x: 0, y: 0, width: 50, height: 14 })],
    });

    const p = makeFrame({
      tag: 'p',
      classList: [],
      x: 0, y: 0, width: 300, height: 18,
      quad: [0, 0, 300, 0, 300, 18, 0, 18],
      styles: { display: 'block' },
      children: [span],
    });

    const result = convertW2WToWireframe(p as never, { layoutMode: 'autoLayout' });
    // The <p> itself should be type 'text' (single-text coalesce path).
    expect((result as Tree).type).toBe('text');
    expect((result as Tree).textContent).toBe('plain');
  });

  // -----------------------------------------------------------------------
  // 3. Padding alone triggers non-coalesce
  // -----------------------------------------------------------------------
  it("3. <a><span padding:4,8>Click</span></a> preserves span padding in a frame child", () => {
    const span = makeFrame({
      tag: 'span',
      x: 0, y: 0, width: 60, height: 24,
      quad: [0, 0, 60, 0, 60, 24, 0, 24],
      styles: {
        display: 'inline',
        paddingTop: '4',
        paddingRight: '8',
        paddingBottom: '4',
        paddingLeft: '8',
      },
      children: [makeText('Click', { x: 8, y: 4, width: 44, height: 16 })],
    });

    const a = makeFrame({
      tag: 'a',
      x: 0, y: 0, width: 60, height: 24,
      quad: [0, 0, 60, 0, 60, 24, 0, 24],
      styles: { display: 'inline' },
      children: [span],
    });

    const result = convertW2WToWireframe(a as never, { layoutMode: 'autoLayout' });
    // <a> stays as frame because its span child carries padding and is not coalesced.
    expect((result as Tree).type).toBe('frame');
    const spanNode = findChildByTag(result as Tree, 'span');
    expect(spanNode).not.toBeNull();
    const padding = spanNode!.padding as { top: number; right: number; bottom: number; left: number };
    expect(padding.top).toBe(4);
    expect(padding.left).toBe(8);
    expect(padding.right).toBe(8);
  });

  // -----------------------------------------------------------------------
  // 4. max-width triggers non-coalesce
  // -----------------------------------------------------------------------
  it("4. <h3><span max-width:300>Heading</span></h3> is not coalesced (span kept as frame)", () => {
    const span = makeFrame({
      tag: 'span',
      x: 0, y: 0, width: 120, height: 16,
      quad: [0, 0, 120, 0, 120, 16, 0, 16],
      styles: {
        display: 'inline',
        maxWidth: '300',
      },
      children: [makeText('Heading', { x: 0, y: 0, width: 120, height: 16 })],
    });

    const h3 = makeFrame({
      tag: 'h3',
      x: 0, y: 0, width: 400, height: 20,
      quad: [0, 0, 400, 0, 400, 20, 0, 20],
      styles: { display: 'block' },
      children: [span],
    });

    const result = convertW2WToWireframe(h3 as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).type).toBe('frame');
    const spanNode = findChildByTag(result as Tree, 'span');
    expect(spanNode).not.toBeNull();
    expect(spanNode!.textContent).toContain('Heading');
  });

  // -----------------------------------------------------------------------
  // 5. Margin-top on a direct <a> child preserves the 10px of leading space.
  //    As the sole flow child, collapseMarginWrappers folds that margin into
  //    the <div>'s padding-top instead of building an `a:margin` wrapper —
  //    the same rendered offset, one layer fewer.
  // -----------------------------------------------------------------------
  it("5. <div><a margin-top:10>Link</a></div> preserves <a>'s leading 10px", () => {
    const a = makeFrame({
      tag: 'a',
      x: 0, y: 10, width: 60, height: 16,
      quad: [0, 10, 60, 10, 60, 26, 0, 26],
      styles: {
        display: 'inline',
        marginTop: '10',
      },
      children: [makeText('Link', { x: 0, y: 10, width: 60, height: 16 })],
    });

    const div = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 100, height: 26,
      quad: [0, 0, 100, 0, 100, 26, 0, 26],
      styles: { display: 'block' },
      children: [a],
    });

    const result = convertW2WToWireframe(div as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).type).toBe('frame');
    const aNode = findChildByTag(result as Tree, 'a');
    expect(aNode).not.toBeNull();
    const margin = aNode!.margin as { top: number } | undefined;
    const padding = (result as Tree).padding as { top: number };
    expect((margin?.top ?? 0) + padding.top).toBe(10);
  });

  // -----------------------------------------------------------------------
  // 6. display:block alone on a sole child → plain collapse (no margin to bubble,
  //    and display:block on a sole text-only child of a block parent is a
  //    structural no-op: the parent is already a block). No framed nesting
  //    needed; visually identical.
  // -----------------------------------------------------------------------
  it("6. <h3><span display:block>Heading</span></h3> (no margin) coalesces to h3 as a text node", () => {
    const span = makeFrame({
      tag: 'span',
      x: 0, y: 0, width: 120, height: 16,
      quad: [0, 0, 120, 0, 120, 16, 0, 16],
      styles: { display: 'block' },
      children: [makeText('Heading', { x: 0, y: 0, width: 120, height: 16 })],
    });

    const h3 = makeFrame({
      tag: 'h3',
      x: 0, y: 0, width: 400, height: 20,
      quad: [0, 0, 400, 0, 400, 20, 0, 20],
      styles: { display: 'block' },
      children: [span],
    });

    const result = convertW2WToWireframe(h3 as never, { layoutMode: 'autoLayout' });
    expect((result as Tree).type).toBe('text');
    expect((result as Tree).textContent).toContain('Heading');
    // No margin on h3 — nothing to bubble, nothing captured on h3's own styles.
    const margin = (result as Tree).margin as MarginSides | undefined;
    // margin is either undefined or all zeros.
    if (margin) {
      expect(margin.top + margin.right + margin.bottom + margin.left).toBe(0);
    }
  });
  // -----------------------------------------------------------------------
  // 7. A flex/grid wrapper establishes its own formatting context — it is a
  //    layout container, not a text wrapper, however text-only its subtree
  //    looks. glinc.io "what we build": the Legibly card is
  //      <a class=card>          (grid: icon | body | arrow)
  //        <span class=body display:flex flex-direction:column>
  //          <span class=head><span class=name>Legibly</span></span>
  //          <span class=desc>…</span>
  //          <span class=tags>…</span>
  //    Collapsing `.body` into the <a>'s text dumped five bare runs straight
  //    into the grid frame, and Figma's grid auto-placement scattered them
  //    across a 3x2 cell layout. The sibling Web2Wireframe card only escaped
  //    because its "Live" badge carries a ::before dot, which makes the
  //    subtree non-text-only by accident.
  // -----------------------------------------------------------------------
  it("7. <a display:grid><span display:flex column>name + tags</span></a> keeps the flex wrapper as a frame", () => {
    const name = makeFrame({
      tag: 'span',
      classList: ['name'],
      x: 0, y: 0, width: 200, height: 20,
      quad: [0, 0, 200, 0, 200, 20, 0, 20],
      styles: { display: 'block' },
      children: [makeText('Legibly', { x: 0, y: 0, width: 200, height: 20 })],
    });

    // `.tags` — a flex row of padded badges, so it stays its own frame and the
    // wrapper keeps two distinct children (the badge's padding is what makes
    // classifyWrapper frame it, exactly as on the real card).
    const badge = makeFrame({
      tag: 'span',
      classList: ['badge'],
      x: 0, y: 28, width: 115, height: 28,
      quad: [0, 28, 115, 28, 115, 56, 0, 56],
      styles: { display: 'flex', paddingLeft: '12', paddingRight: '12' },
      children: [makeText('Figma Plugin', { x: 12, y: 34, width: 91, height: 16 })],
    });

    const tags = makeFrame({
      tag: 'span',
      classList: ['tags'],
      x: 0, y: 28, width: 200, height: 28,
      quad: [0, 28, 200, 28, 200, 56, 0, 56],
      styles: { display: 'flex' },
      children: [badge],
    });

    const body = makeFrame({
      tag: 'span',
      classList: ['body'],
      x: 0, y: 0, width: 200, height: 56,
      quad: [0, 0, 200, 0, 200, 56, 0, 56],
      styles: { display: 'flex', flexDirection: 'column' },
      children: [name, tags],
    });

    const anchor = makeFrame({
      tag: 'a',
      x: 0, y: 0, width: 400, height: 56,
      quad: [0, 0, 400, 0, 400, 56, 0, 56],
      styles: { display: 'grid' },
      children: [body],
    });

    const result = convertW2WToWireframe(anchor as never, { layoutMode: 'autoLayout' });
    const children = (result as Tree).children as Tree[];
    // The wrapper survives as ONE frame child, not two loose text runs.
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe('frame');
    expect(children[0].layoutMode).toBe('VERTICAL');
    expect((children[0].children as Tree[])).toHaveLength(2);
  });
});
