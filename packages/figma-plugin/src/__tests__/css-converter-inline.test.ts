/**
 * Tests for css-converter.ts: inline children text coalescing
 *
 * Bug: <h2>$0 <span>/forever</span></h2> renders as column (VERTICAL)
 * because <span> is FRAME type, making hasNonTextChildren=true,
 * which prevents text coalescing.
 *
 * Fix: inline FRAME children (span, a, strong, em) with only TEXT children
 * should be coalesced into parent's text content with styled segments.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// Helper: minimal W2W nodes
function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 100, height: 50,
    quad: [0, 0, 100, 0, 100, 50, 0, 50],
    tag: 'div',
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function makeText(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 50, height: 20,
    quad: [0, 0, 50, 0, 50, 20, 0, 20],
    value,
    font: '400 16px Arial',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Inline children coalescing
// ---------------------------------------------------------------------------

describe("css-converter: inline children text coalescing", () => {
  it("h2 with TEXT + inline FRAME(span) children → type=text with combined content", () => {
    // <h2>$0 <span>/forever</span></h2>
    const h2 = makeFrame({
      tag: 'h2',
      styles: { fontSize: '32', fontWeight: '700', display: 'block' },
      children: [
        makeText('$0'),
        makeFrame({
          tag: 'span',
          styles: { fontSize: '16', fontWeight: '400', display: 'inline' },
          children: [makeText('/forever')],
        }),
      ],
    });

    const result = convertW2WToWireframe(h2 as any);

    // Should be a text node, not a frame with stacked children
    expect(result.type).toBe('text');
    // Combined text content
    expect(result.textContent).toContain('$0');
    expect(result.textContent).toContain('/forever');
    // Should not have frame children (everything coalesced into text)
    expect(result.children?.filter(c => c.type === 'frame').length ?? 0).toBe(0);
  });

  it("h2 with TEXT + inline FRAME(a) children → type=text", () => {
    // <h2>Questions about billing <a>billing@w2w.design</a></h2>
    const h2 = makeFrame({
      tag: 'h2',
      styles: { fontSize: '24', fontWeight: '700', display: 'block' },
      children: [
        makeText('Questions about billing '),
        makeFrame({
          tag: 'a',
          styles: { fontSize: '24', fontWeight: '700', display: 'inline', textDecorationLine: 'underline' },
          attr: { href: 'mailto:billing@w2w.design' },
          children: [makeText('billing@w2w.design')],
        }),
      ],
    });

    const result = convertW2WToWireframe(h2 as any);
    expect(result.type).toBe('text');
    expect(result.textContent).toContain('Questions about billing');
    expect(result.textContent).toContain('billing@w2w.design');

    // Styled segments should preserve inline <a> styles
    expect(result.styledSegments).toBeDefined();
    expect(result.styledSegments!.length).toBe(2);
    // First segment: parent text (no underline)
    expect(result.styledSegments![0].textDecoration).toBeUndefined();
    // Second segment: <a> with underline
    expect(result.styledSegments![1].textDecoration).toBe('underline');
    expect(result.styledSegments![1].isLink).toBe(true);
  });

  it("inline <span> with custom color preserves color in styled segments", () => {
    // <h2>$20 <span style="color: rgb(107,114,128)">/month</span></h2>
    const h2 = makeFrame({
      tag: 'h2',
      styles: { fontSize: '32', fontWeight: '700', color: 'rgb(0, 0, 0)', display: 'block' },
      children: [
        makeText('$20 '),
        makeFrame({
          tag: 'span',
          styles: { fontSize: '16', fontWeight: '400', color: 'rgb(107, 114, 128)', display: 'inline' },
          children: [makeText('/month')],
        }),
      ],
    });

    const result = convertW2WToWireframe(h2 as any);
    expect(result.type).toBe('text');
    expect(result.styledSegments).toBeDefined();
    expect(result.styledSegments!.length).toBe(2);
    // First segment: parent color
    expect(result.styledSegments![0].color).toBe('rgb(0, 0, 0)');
    // Second segment: span's custom color
    expect(result.styledSegments![1].color).toBe('rgb(107, 114, 128)');
  });

  it("p with TEXT + block FRAME(div) children → stays frame (no coalescing)", () => {
    // <p>Text <div>Block</div></p> — block child breaks inline flow
    const p = makeFrame({
      tag: 'p',
      styles: { display: 'block' },
      children: [
        makeText('Text'),
        makeFrame({
          tag: 'div',
          styles: { display: 'block' },
          children: [makeText('Block')],
        }),
      ],
    });

    const result = convertW2WToWireframe(p as any);
    // div is not inline → should NOT coalesce
    expect(result.type).toBe('frame');
  });

  it("span with only TEXT children → type=text (baseline, already works)", () => {
    const span = makeFrame({
      tag: 'span',
      styles: { display: 'inline' },
      children: [makeText('hello'), makeText('world')],
    });

    const result = convertW2WToWireframe(span as any);
    expect(result.type).toBe('text');
    expect(result.textContent).toContain('hello');
    expect(result.textContent).toContain('world');
  });

  it("h2 with inline span that has nested inline → coalesces all text", () => {
    // <h2>Price: <strong><em>$20</em>/mo</strong></h2>
    const h2 = makeFrame({
      tag: 'h2',
      styles: { fontSize: '32', fontWeight: '700', display: 'block' },
      children: [
        makeText('Price: '),
        makeFrame({
          tag: 'strong',
          styles: { display: 'inline', fontWeight: '700' },
          children: [
            makeFrame({
              tag: 'em',
              styles: { display: 'inline', fontStyle: 'italic' },
              children: [makeText('$20')],
            }),
            makeText('/mo'),
          ],
        }),
      ],
    });

    const result = convertW2WToWireframe(h2 as any);
    expect(result.type).toBe('text');
    expect(result.textContent).toContain('Price:');
    expect(result.textContent).toContain('$20');
    expect(result.textContent).toContain('/mo');
  });

  it("li with absolute ::before pseudo → bullet as separate absolute child", () => {
    // <li>Colors: plugin only</li> with ::before { content: "•"; position: absolute; color: blue }
    const li = makeFrame({
      tag: 'li',
      styles: { display: 'list-item', position: 'relative' },
      children: [
        // __w2w-pseudo-before wrapper
        makeFrame({
          tag: 'div',
          classList: ['__w2w-pseudo-before'],
          styles: { position: 'absolute', left: '0', color: 'rgb(59, 130, 246)' },
          children: [makeText('•')],
        }),
        makeText('Colors: plugin only'),
      ],
    });

    const result = convertW2WToWireframe(li as any);
    // Bullet should be a separate child with absolute position
    const bulletChild = result.children?.find(c => c.textContent === '•');
    expect(bulletChild).toBeDefined();
    expect(bulletChild!.position).toBe('absolute');
    // Bullet should have the pseudo-element's color
    expect(bulletChild!.textColor).toBe('rgb(59, 130, 246)');
  });
});
