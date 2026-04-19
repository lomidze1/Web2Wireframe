/**
 * Tests for text nodes with max-width constraints.
 *
 * Bug: When a block-level text element (e.g., <p>) has a CSS max-width,
 * the renderer incorrectly assigns layoutSizingHorizontal = "FILL"
 * (block-in-block default), causing the Figma text node to stretch to
 * parent width instead of being constrained to max-width.
 *
 * Expected: layoutSizingHorizontal = "FIXED" with width = computed width
 * (which reflects the max-width constraint via getBoundingClientRect).
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FRAME',
    x: 0, y: 0, width: 635, height: 400,
    quad: [0, 0, 635, 0, 635, 400, 0, 400],
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
    x: 0, y: 0, width: 200, height: 25,
    quad: [0, 0, 200, 0, 200, 25, 0, 25],
    value,
    font: '400 21px SFProDisplay',
    ...overrides,
  };
}

/** Find all text WireframeNodes in the tree */
function collectTextNodes(node: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.textContent === 'string') {
      out.push(obj);
    }
    const children = obj.children as unknown[] | undefined;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(node);
  return out;
}

// ---------------------------------------------------------------------------
// Apple Trade In .tile-subhead scenario
// ---------------------------------------------------------------------------

describe("css-converter: maxWidth text node sizing", () => {

  it("block <p> with maxWidth gets FIXED sizing, not FILL", () => {
    // 3 visual lines from content script, each 25px tall
    const line1 = makeText('Get up to $195–$685', { x: 34, y: 25, width: 197.84, height: 25 });
    const line2 = makeText('in credit when you trade in', { x: 16, y: 50, width: 233.77, height: 25 });
    const line3 = makeText('iPhone 13 or higher.', { x: 44, y: 75, width: 176.85, height: 25 });

    // The <p> element — display:block, width resolves to maxWidth (265px)
    const paragraph = makeFrame({
      tag: 'p',
      classList: ['tile-subhead'],
      x: 185, y: 200, width: 265, height: 75,
      quad: [185, 200, 450, 200, 450, 275, 185, 275],
      styles: {
        display: 'block',
        width: 'auto',
        maxWidth: '265px',
        fontSize: '21px',
        lineHeight: '25px',
        textAlign: 'center',
        color: 'rgb(29, 29, 31)',
      },
      children: [line1, line2, line3],
    });

    // Parent container — 635px wide
    const container = makeFrame({
      tag: 'div',
      classList: ['tile-content'],
      x: 0, y: 0, width: 635, height: 400,
      quad: [0, 0, 635, 0, 635, 400, 0, 400],
      styles: { display: 'block' },
      children: [paragraph],
    });

    const result = convertW2WToWireframe(container as never, { layoutMode: 'autoLayout' });

    // Find the coalesced text node from the <p>
    const textNodes = collectTextNodes(result);
    const subhead = textNodes.find(t =>
      (t.textContent as string).includes('Get up to $195')
    );

    expect(subhead).toBeDefined();
    // Text should be coalesced into one string
    expect(subhead!.textContent).toContain('iPhone 13 or higher.');
    // browserLineCount should reflect original 3 lines
    expect(subhead!.browserLineCount).toBe(3);

    // KEY ASSERTION: width should be FIXED (265px from max-width), NOT FILL
    expect(subhead!.layoutSizingHorizontal).not.toBe('FILL');
    // Width should be the computed 265px, not the parent's 635px
    expect(subhead!.width).toBe(265);
  });

  it("block <p> WITHOUT maxWidth still gets FILL sizing", () => {
    // Regular block <p> with no max-width — should remain FILL
    const line1 = makeText('Hello world', { x: 0, y: 0, width: 100, height: 20 });

    const paragraph = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 500, height: 20,
      quad: [0, 0, 500, 0, 500, 20, 0, 20],
      styles: {
        display: 'block',
        width: 'auto',
        fontSize: '16px',
        lineHeight: '20px',
      },
      children: [line1],
    });

    const container = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 500, height: 200,
      quad: [0, 0, 500, 0, 500, 200, 0, 200],
      styles: { display: 'block' },
      children: [paragraph],
    });

    const result = convertW2WToWireframe(container as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);
    const hello = textNodes.find(t => (t.textContent as string).includes('Hello world'));

    expect(hello).toBeDefined();
    // Without maxWidth, block element should be FILL
    expect(hello!.layoutSizingHorizontal).toBe('FILL');
  });

  it("block <p> with maxWidth: none still gets FILL sizing", () => {
    const line1 = makeText('Test text', { x: 0, y: 0, width: 80, height: 20 });

    const paragraph = makeFrame({
      tag: 'p',
      x: 0, y: 0, width: 500, height: 20,
      quad: [0, 0, 500, 0, 500, 20, 0, 20],
      styles: {
        display: 'block',
        width: 'auto',
        maxWidth: 'none',
        fontSize: '16px',
        lineHeight: '20px',
      },
      children: [line1],
    });

    const container = makeFrame({
      tag: 'div',
      x: 0, y: 0, width: 500, height: 200,
      quad: [0, 0, 500, 0, 500, 200, 0, 200],
      styles: { display: 'block' },
      children: [paragraph],
    });

    const result = convertW2WToWireframe(container as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);
    const test = textNodes.find(t => (t.textContent as string).includes('Test text'));

    expect(test).toBeDefined();
    expect(test!.layoutSizingHorizontal).toBe('FILL');
  });

  it("block <p> with maxWidth INSIDE FLEX COLUMN parent gets FIXED, not FILL (Apple.com tile-subhead)", () => {
    // Real-world bug: Apple.com <p class="tile-subhead"> is inside a flex-column
    // parent (.tile-copy-wrapper). The <p> has max-width:265px and browser-resolved
    // width=265. Previously getSizing flex path ignored maxWidth and returned FILL,
    // stretching the text to 635px single-line instead of wrapping at 265px.
    const line1 = makeText('Get up to $195–$685', { x: 34, y: 25, width: 197.84, height: 25 });
    const line2 = makeText('in credit when you trade in', { x: 16, y: 50, width: 233.77, height: 25 });
    const line3 = makeText('iPhone 13 or higher.', { x: 44, y: 75, width: 176.85, height: 25 });

    const paragraph = makeFrame({
      tag: 'p',
      classList: ['tile-subhead'],
      x: 185, y: 200, width: 265, height: 75,
      quad: [185, 200, 450, 200, 450, 275, 185, 275],
      styles: {
        display: 'block',
        width: 'auto',
        maxWidth: '265px',
        fontSize: '21px',
        lineHeight: '25px',
        textAlign: 'center',
        color: 'rgb(29, 29, 31)',
      },
      children: [line1, line2, line3],
    });

    // KEY: flex-column parent (the real apple.com structure)
    const flexParent = makeFrame({
      tag: 'div',
      classList: ['tile-copy-wrapper'],
      x: 0, y: 0, width: 635, height: 400,
      quad: [0, 0, 635, 0, 635, 400, 0, 400],
      styles: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      },
      children: [paragraph],
    });

    const result = convertW2WToWireframe(flexParent as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);
    const subhead = textNodes.find(t =>
      (t.textContent as string).includes('Get up to $195')
    );

    expect(subhead, 'subhead text node should exist').toBeDefined();
    // KEY ASSERTION: maxWidth must be honored even in flex parent
    expect(
      subhead!.layoutSizingHorizontal,
      'flex child with maxWidth should be FIXED, not FILL'
    ).not.toBe('FILL');
    expect(
      subhead!.width,
      'flex child width should equal maxWidth (265), not parent (635)'
    ).toBe(265);
  });

  it("COALESCE path: <p> with maxWidth propagates cssMaxWidth to WireframeNode (for Figma native maxWidth)", () => {
    // Text-only <p> becomes coalesced TEXT node. Regardless of downstream FILL/HUG
    // decisions (margin wrappers etc.), Figma native maxWidth must be applied so
    // the text can never exceed its CSS constraint.
    const line1 = makeText('Get up to $195-$685', { x: 34, y: 25, width: 197.84, height: 25 });
    const line2 = makeText('in credit when you trade in', { x: 16, y: 50, width: 233.77, height: 25 });
    const line3 = makeText('iPhone 13 or higher.', { x: 44, y: 75, width: 176.85, height: 25 });

    const paragraph = makeFrame({
      tag: 'p',
      classList: ['tile-subhead'],
      x: 185, y: 200, width: 265, height: 75,
      quad: [185, 200, 450, 200, 450, 275, 185, 275],
      styles: {
        display: 'block',
        width: 'auto',
        maxWidth: '265px',
        margin: '4px 0px 0px',
        marginTop: '4px',
        fontSize: '21px',
        lineHeight: '25px',
      },
      children: [line1, line2, line3],
    });

    const container = makeFrame({
      tag: 'div',
      classList: ['tile-copy-wrapper'],
      x: 0, y: 0, width: 635, height: 400,
      quad: [0, 0, 635, 0, 635, 400, 0, 400],
      styles: { display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
      children: [paragraph],
    });

    const result = convertW2WToWireframe(container as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);
    const subhead = textNodes.find(t => (t.textContent as string).includes('Get up to $195'));

    expect(subhead, 'coalesced text node should exist').toBeDefined();
    expect(subhead!.cssMaxWidth, 'cssMaxWidth must be 265 for Figma native enforcement').toBe(265);
  });

  it("MERGE path: <p class=\"tile-subhead\"> with <sup> footnote still inherits cssMaxWidth (Apple.com Trade In)", () => {
    // Real apple.com Trade In scenario: <p> has 3 TEXT lines + 1 FRAME (<sup>).
    // The FRAME child forces MERGE path (not COALESCE). Merged TEXT must still
    // carry the parent's max-width so Figma wraps at 265px, not the parent's 635px.
    const line1 = makeText('Get up to $195-$685', { x: 264.08, y: 3498, width: 197.84, height: 25 });
    const line2 = makeText('in credit when you trade in', { x: 246.12, y: 3523, width: 233.77, height: 25 });
    const line3 = makeText('iPhone 13 or higher.', { x: 271.13, y: 3548, width: 176.85, height: 25 });
    const supFrame: Record<string, unknown> = {
      type: 'FRAME',
      tag: 'sup',
      classList: ['footnote', 'footnote-number'],
      attr: { ariaLabel: 'Footnote 3' },
      x: 447.98, y: 3548, width: 6.88, height: 25,
      quad: [447.98, 3548, 454.86, 3548, 454.86, 3573, 447.98, 3573],
      styles: {
        display: 'inline',
        position: 'relative',
        outlineColor: 'rgb(29, 29, 31)',
        outlineWidth: '1.5px',
      },
      children: [makeText('3', { x: 447.98, y: 3548, width: 6.88, height: 25 })],
    };

    const paragraph = makeFrame({
      tag: 'p',
      classList: ['tile-subhead'],
      x: 185, y: 3498, width: 265, height: 75,
      quad: [185, 3498, 450, 3498, 450, 3573, 185, 3573],
      styles: {
        display: 'block',
        width: 'auto',
        maxWidth: '265px',
        margin: '4px 0px 0px',
        marginTop: '4px',
        fontSize: '21px',
        lineHeight: '25px',
      },
      children: [line1, line2, line3, supFrame],
    });

    const container = makeFrame({
      tag: 'div',
      classList: ['tile-copy-wrapper'],
      styles: { display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
      children: [paragraph],
    });

    const result = convertW2WToWireframe(container as never, { layoutMode: 'autoLayout' });

    // Find the <p> FRAME (kept as frame because of <sup> non-text child)
    const findByTag = (n: unknown, tag: string): Record<string, unknown> | undefined => {
      if (!n || typeof n !== 'object') return undefined;
      const obj = n as Record<string, unknown>;
      if (obj.tag === tag) return obj;
      const children = obj.children as unknown[] | undefined;
      if (Array.isArray(children)) {
        for (const c of children) {
          const found = findByTag(c, tag);
          if (found) return found;
        }
      }
      return undefined;
    };

    const pFrame = findByTag(result, 'p');
    expect(pFrame, '<p> frame should exist').toBeDefined();
    expect(pFrame!.cssMaxWidth, '<p> frame must carry cssMaxWidth=265').toBe(265);

    // Merged TEXT child inside the <p> must also inherit cssMaxWidth so that
    // even at the innermost node layer Figma enforces the constraint.
    const textNodes = collectTextNodes(result);
    const mergedText = textNodes.find(t => (t.textContent as string).includes('Get up to $195'));
    expect(mergedText, 'merged text should exist').toBeDefined();
    expect(
      mergedText!.cssMaxWidth,
      'merged text must inherit parent maxWidth so Figma wraps at 265'
    ).toBe(265);
  });

  it("single-line coalesced text in flex-column parent gets HUG, not FILL (Apple.com MacBook Neo subhead)", () => {
    // Real apple.com scenario: "Amazing Mac. Surprising price." is a
    // single-line <p> (height=33.5, one lineHeight) with natural width
    // 364.73px. It has NO max-width. Parent .tile-copy-wrapper is flex
    // column with align-items:stretch. Previously getSizing returned FILL
    // (due to stretch) and the text wrapped to the narrower Figma parent.
    // Fix: single-line (browserLineCount === 1) coalesced text must HUG
    // its natural width instead of filling.
    // Text child: natural intrinsic width 364.73 (from getClientRects of the
    // inline text run). This is wider than the parent tile.
    const singleLine = makeText('Amazing Mac. Surprising price.', {
      x: 537.63, y: 1625, width: 364.73, height: 33.5,
    });

    // <p> element: stretched to parent width (351) by block/flex behavior.
    // getBoundingClientRect returns the layout box (351), not the content
    // overflow. This mismatch between <p>.width (351) and text.width (364.73)
    // is what caused the wrap bug.
    const paragraph = makeFrame({
      tag: 'p',
      classList: ['tile-subhead'],
      x: 530, y: 1625, width: 351, height: 33.5,
      quad: [530, 1625, 881, 1625, 881, 1658.5, 530, 1658.5],
      styles: {
        display: 'block',
        width: 'auto',
        // NO maxWidth — this is the key difference from tile-subhead with max-width
        fontSize: '27px',
        lineHeight: '33.5px',
      },
      children: [singleLine],
    });

    const flexParent = makeFrame({
      tag: 'div',
      classList: ['tile-copy-wrapper'],
      x: 0, y: 0, width: 351, height: 400,  // narrower than text natural width
      quad: [0, 0, 351, 0, 351, 400, 0, 400],
      styles: { display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
      children: [paragraph],
    });

    const result = convertW2WToWireframe(flexParent as never, { layoutMode: 'autoLayout' });
    const textNodes = collectTextNodes(result);
    const subhead = textNodes.find(t => (t.textContent as string).includes('Amazing Mac'));

    expect(subhead, 'coalesced text node should exist').toBeDefined();
    // KEY: single-line text must HUG, not FILL, because the intrinsic text
    // width (364.73) exceeds the parent tile width (351).
    expect(subhead!.layoutSizingHorizontal, 'single-line text should be HUG').toBe('HUG');
    expect(subhead!.browserLineCount, 'browserLineCount must be 1').toBe(1);
  });

  it("multiple tiles with different maxWidths all get FIXED sizing", () => {
    // Apple.com pattern: multiple tile subheads with varying max-widths
    const tiles = [
      { text: 'AirPods Pro subhead', maxWidth: '250px', width: 250, lines: 2 },
      { text: 'Business subhead text here', maxWidth: '350px', width: 350, lines: 2 },
      { text: 'Trade In subhead multi', maxWidth: '265px', width: 265, lines: 3 },
      { text: 'Apple Card subhead', maxWidth: '350px', width: 350, lines: 2 },
    ];

    for (const tile of tiles) {
      const textChildren = [];
      for (let i = 0; i < tile.lines; i++) {
        textChildren.push(makeText(`${tile.text} line ${i + 1}`, {
          x: 0, y: i * 25, width: tile.width - 30, height: 25,
        }));
      }

      const paragraph = makeFrame({
        tag: 'p',
        classList: ['tile-subhead'],
        x: 0, y: 0, width: tile.width, height: tile.lines * 25,
        quad: [0, 0, tile.width, 0, tile.width, tile.lines * 25, 0, tile.lines * 25],
        styles: {
          display: 'block',
          width: 'auto',
          maxWidth: tile.maxWidth,
          fontSize: '21px',
          lineHeight: '25px',
          textAlign: 'center',
        },
        children: textChildren,
      });

      const container = makeFrame({
        tag: 'div',
        x: 0, y: 0, width: 635, height: 400,
        quad: [0, 0, 635, 0, 635, 400, 0, 400],
        styles: { display: 'block' },
        children: [paragraph],
      });

      const result = convertW2WToWireframe(container as never, { layoutMode: 'autoLayout' });
      const textNodes = collectTextNodes(result);
      const node = textNodes.find(t =>
        (t.textContent as string).includes(`${tile.text} line 1`)
      );

      expect(node, `Tile "${tile.text}" should have a text node`).toBeDefined();
      expect(
        node!.layoutSizingHorizontal,
        `Tile "${tile.text}" (maxWidth: ${tile.maxWidth}) should be FIXED, not FILL`
      ).not.toBe('FILL');
      expect(
        node!.width,
        `Tile "${tile.text}" width should be ${tile.width}px`
      ).toBe(tile.width);
    }
  });
});
