/**
 * Regression tests for the nicepage.io comparison fixes (2026-07-21).
 *
 * Reference site: https://site11363061.nicepage.io/Home.html imported with
 * both W2W and html.to.design; four W2W defects were verified against the
 * live site:
 *
 *  1. Single-line captured text far wider than its parent (block-5 quotes,
 *     1095px in a 373px card — `display:table` capture anomaly) got HUG →
 *     rendered as one overflowing nowrap line overlapping siblings.
 *  2. Multi-line text wider than its parent (hero h1, 514px via negative
 *     margin-right in a 399px column) got FILL → re-wrapped at 399px and
 *     broke "ADVENTURE" mid-word.
 *  3. Same-row inline runs with different fonts ("03.05.2026 " + bold
 *     "Porto, Portugal") stayed separate text nodes; Figma trims trailing
 *     spaces in auto-width text, gluing them together.
 *  4. Clearfix spacer pseudos (content:"", display:table, height:0) arrive
 *     as 1140×1 junk frames (getComputedStyle reports USED width) and
 *     occupy auto-layout flow.
 *  5. Same-row hacks via large negative margin-top (header nav -32px,
 *     block-4 headings -64px) — margin wrappers clamp negatives to 0 and
 *     drop the element a full row down.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Helpers
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
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
    value,
    font: '400 18px Open Sans',
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// Fix 1 — gross single-line overflow must wrap at parent width (FILL)
// ---------------------------------------------------------------------------

describe("single-line text far wider than parent wraps instead of HUG", () => {
  const quote = '“Northmile Journal helped us completely rethink the way we travel.”';

  function card(pWidth: number, cardWidth: number, display = 'table') {
    return makeFrame({
      tag: 'div', width: cardWidth, height: 353,
      children: [
        makeFrame({
          tag: 'p', width: pWidth, height: 29,
          styles: { display, fontSize: '18px', fontFamily: '"Open Sans", sans-serif' },
          children: [makeText(quote, { width: pWidth, height: 29 })],
        }),
      ],
    });
  }

  it("display:table single-line 1095px text in 373px card → FILL (wraps)", () => {
    const root = convert(card(1095, 373));
    const p = findNode(root, n => n.type === 'text' && n.tag === 'p');
    expect(p).not.toBeNull();
    expect(p!.layoutSizingHorizontal).toBe('FILL');
  });

  it("display:block single-line 1095px text in 373px card → FILL (wraps)", () => {
    const root = convert(card(1095, 373, 'block'));
    const p = findNode(root, n => n.type === 'text' && n.tag === 'p');
    expect(p).not.toBeNull();
    expect(p!.layoutSizingHorizontal).toBe('FILL');
  });

  it("modest natural overflow (364px in 351px tile) keeps HUG override", () => {
    // Apple.com "Amazing Mac. Surprising price." case — must NOT regress.
    const root = convert(card(364, 351, 'block'));
    const p = findNode(root, n => n.type === 'text' && n.tag === 'p');
    expect(p).not.toBeNull();
    expect(p!.layoutSizingHorizontal).toBe('HUG');
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — multi-line text wider than parent keeps its captured width (FIXED)
// ---------------------------------------------------------------------------

describe("multi-line text wider than parent keeps captured width", () => {
  function hero(h1Width: number, columnWidth: number) {
    // h1 is 514px wide (width:auto + margin-right:-115px) inside a 399px column;
    // three per-line TEXT runs as the content script splits them.
    const lines = [
      makeText('Adventure', { x: 0, y: 0, width: 478, height: 106, font: 'Oswald Bold' }),
      makeText('Travel', { x: 0, y: 106, width: 300, height: 106, font: 'Oswald Bold' }),
      makeText('Diary', { x: 0, y: 212, width: 250, height: 106, font: 'Oswald Bold' }),
    ];
    return makeFrame({
      tag: 'div', width: columnWidth, height: 544,
      children: [
        makeFrame({
          tag: 'h1', width: h1Width, height: 317,
          styles: {
            display: 'block', fontSize: '96px', fontWeight: '700',
            fontFamily: 'Oswald, sans-serif', marginRight: '-115px',
          },
          children: lines,
        }),
      ],
    });
  }

  it("h1 514px wide in 399px column → FIXED (no re-wrap mid-word)", () => {
    const root = convert(hero(514, 399));
    const h1 = findNode(root, n => n.type === 'text' && n.tag === 'h1');
    expect(h1).not.toBeNull();
    expect(h1!.browserLineCount).toBe(3);
    expect(h1!.layoutSizingHorizontal).toBe('FIXED');
    expect(h1!.width).toBe(514);
  });

  it("multi-line block text NARROWER than parent keeps FILL", () => {
    const root = convert(hero(380, 399));
    const h1 = findNode(root, n => n.type === 'text' && n.tag === 'h1');
    expect(h1).not.toBeNull();
    expect(h1!.layoutSizingHorizontal).toBe('FILL');
  });
});

// ---------------------------------------------------------------------------
// Fix 2b — multi-line coalesced text never gets HUG (nowrap) sizing
// ---------------------------------------------------------------------------

describe("multi-line text in a flex parent never HUGs", () => {
  it("4-line quote in a flex-column card → FIXED (browser wrap width kept)", () => {
    // nicepage block-5 card: u-container-layout is flex-column with
    // align-items not stretch → getSizing gives the quote HUG, which renders
    // the merged 4-line value as one nowrap run.
    const lines = [
      makeText('“Northmile Journal helped us completely', { x: 0, y: 0, width: 339, height: 24 }),
      makeText('rethink the way we travel. The', { x: 0, y: 28, width: 251, height: 24 }),
      makeText('recommendations felt personal, calm, and', { x: 0, y: 57, width: 354, height: 24 }),
      makeText('genuinely local.”', { x: 0, y: 86, width: 135, height: 24 }),
    ];
    const root = convert(makeFrame({
      tag: 'div', width: 373, height: 353,
      styles: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
      children: [
        makeFrame({
          tag: 'p', width: 363, height: 115,
          styles: { display: 'table', fontSize: '18px' },
          children: lines,
        }),
      ],
    }));
    const p = findNode(root, n => n.type === 'text' && n.tag === 'p');
    expect(p).not.toBeNull();
    expect(p!.browserLineCount).toBe(4);
    expect(p!.layoutSizingHorizontal).toBe('FIXED');
  });
});

// ---------------------------------------------------------------------------
// Fix 3 — same-row inline runs merge into one text node with styledSegments
// ---------------------------------------------------------------------------

describe("same-row inline TEXT runs merge with styledSegments", () => {
  function accordionLink() {
    // <a> with date run + bold city run on the same visual row, plus an icon
    // frame → mixed-children path. The date run carries its trailing space.
    return makeFrame({
      tag: 'a', width: 693, height: 78,
      styles: { display: 'block', fontSize: '24px', textTransform: 'uppercase' },
      children: [
        makeText('03.05.2026 ', { x: 0, y: 10, width: 164, height: 58, font: 'Oswald' }),
        makeText('Porto, Portugal', { x: 164, y: 10, width: 274, height: 58, font: 'Oswald Bold' }),
        makeFrame({
          tag: 'span', classList: ['u-accordion-link-icon'],
          x: 663, y: 24, width: 30, height: 30,
          styles: { display: 'inline-block', backgroundColor: 'rgb(40, 140, 100)' },
        }),
      ],
    });
  }

  it("merges date + city into one text node preserving the space", () => {
    const root = convert(accordionLink());
    const merged = findNode(root, n =>
      n.type === 'text' && typeof n.textContent === 'string' && n.textContent.includes('03.05.2026'));
    expect(merged).not.toBeNull();
    // Since the 2026-08-08 audit, uppercase rides Figma textCase with the raw
    // string preserved — visually identical, but source casing survives edits.
    expect(merged!.textContent).toBe('03.05.2026 Porto, Portugal');
    expect(merged!.textCase).toBe('UPPER');
    expect(merged!.styledSegments).toBeDefined();
    expect(merged!.styledSegments!.length).toBe(2);
    expect(merged!.styledSegments![0].text).toBe('03.05.2026 ');
    expect(merged!.styledSegments![1].text).toBe('Porto, Portugal');
    expect(merged!.styledSegments![1].fontWeight).toBe(700);
    // No second standalone text node for the city
    const city = findNode(root, n =>
      n.type === 'text' && n.textContent === 'PORTO, PORTUGAL');
    expect(city).toBeNull();
  });

  it("heals a lost boundary space from the geometric gap (old-extractor data)", () => {
    // Pre-e6f8979 extractors trimmed the date's trailing space, but the
    // captured geometry still shows the gap the browser painted (city run
    // starts ~7px after the date ink ends). Merge with an inserted space.
    const root = convert(makeFrame({
      tag: 'a', width: 693, height: 78,
      styles: { display: 'block', fontSize: '24px' },
      children: [
        makeText('03.05.2026', { x: 0, y: 10, width: 157, height: 58, font: 'Oswald' }),
        makeText('Porto, Portugal', { x: 164.45, y: 10, width: 274, height: 58, font: 'Oswald Bold' }),
        makeFrame({
          tag: 'span', x: 663, y: 24, width: 30, height: 30,
          styles: { display: 'inline-block', backgroundColor: 'rgb(40, 140, 100)' },
        }),
      ],
    }));
    const merged = findNode(root, n =>
      n.type === 'text' && typeof n.textContent === 'string' && n.textContent.includes('03.05.2026'));
    expect(merged).not.toBeNull();
    expect(merged!.textContent).toBe('03.05.2026 Porto, Portugal');
    expect(merged!.styledSegments!.length).toBe(2);
    expect(merged!.styledSegments![0].text).toBe('03.05.2026 ');
  });

  it("does NOT invent a space between truly contiguous runs (gap 0)", () => {
    const root = convert(makeFrame({
      tag: 'div', width: 300, height: 14,
      styles: { display: 'block' },
      children: [
        makeText('Web2', { x: 0, y: 0, width: 40, height: 14, font: 'Oswald' }),
        makeText('Wireframe', { x: 40, y: 0, width: 80, height: 14, font: 'Oswald Bold' }),
        makeFrame({
          tag: 'span', x: 200, y: 0, width: 30, height: 14,
          styles: { display: 'inline-block', backgroundColor: 'rgb(0,0,0)' },
        }),
      ],
    }));
    // The inline run merge (rendering/textRunMerge.ts) now joins contiguous
    // runs too — but ONLY by concatenating them: no space is invented, so the
    // glyphs stay exactly where the browser painted them. Each run keeps its
    // own font as a range, which is what used to require separate nodes.
    const merged = findNode(root, n => n.type === 'text' && n.textContent === 'Web2Wireframe');
    expect(merged).not.toBeNull();
    expect(merged!.styledSegments!.map(s => s.text)).toEqual(['Web2', 'Wireframe']);
    expect(findNode(root, n => n.type === 'text' && n.textContent === 'Web2 Wireframe')).toBeNull();
  });

  it("keeps runs on different rows separate (no false row merge)", () => {
    const frame = makeFrame({
      tag: 'div', width: 693, height: 156,
      styles: { display: 'block', fontSize: '24px' },
      children: [
        makeText('Row one', { x: 0, y: 10, width: 164, height: 58, font: 'Oswald' }),
        makeText('Row two', { x: 0, y: 88, width: 274, height: 58, font: 'Oswald Bold' }),
        makeFrame({
          tag: 'span', x: 663, y: 24, width: 30, height: 30,
          styles: { display: 'inline-block', backgroundColor: 'rgb(40, 140, 100)' },
        }),
      ],
    });
    const root = convert(frame);
    // Different fonts AND different rows → two separate text nodes
    expect(findNode(root, n => n.type === 'text' && n.textContent === 'Row one')).not.toBeNull();
    expect(findNode(root, n => n.type === 'text' && n.textContent === 'Row two')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fix 4 — invisible clearfix spacer pseudos are dropped
// ---------------------------------------------------------------------------

describe("invisible spacer pseudo frames are dropped", () => {
  it("drops 1140×1 clearfix ::before with no paint and no children", () => {
    const root = convert(makeFrame({
      tag: 'div', width: 1140, height: 80,
      children: [
        makeFrame({
          tag: 'span', classList: ['__w2w-pseudo-before'],
          x: 0, y: 0, width: 1140, height: 1,
          styles: { display: 'table' },
        }),
        makeFrame({ tag: 'div', x: 0, y: 0, width: 64, height: 32, styles: { display: 'block', backgroundColor: 'rgb(0,0,0)' } }),
      ],
    }));
    const pseudo = findNode(root, n => (n.className || '').includes('pseudo'));
    expect(pseudo).toBeNull();
  });

  it("keeps thin decorative pseudo WITH a background (divider line)", () => {
    const root = convert(makeFrame({
      tag: 'div', width: 200, height: 40,
      children: [
        makeFrame({
          tag: 'span', classList: ['__w2w-pseudo-after'],
          x: 0, y: 38, width: 200, height: 2,
          styles: { display: 'block', backgroundColor: 'rgb(200, 200, 200)' },
        }),
      ],
    }));
    const pseudo = findNode(root, n => (n.className || '').includes('pseudo'));
    expect(pseudo).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fix 9 — transparent border takes layout space → converted to padding
// ---------------------------------------------------------------------------

describe("transparent border becomes padding (nicepage gutter)", () => {
  const borderSides = (w: string, c: string, st = 'solid') => ({
    borderTopWidth: w, borderRightWidth: w, borderBottomWidth: w, borderLeftWidth: w,
    borderTopColor: c, borderRightColor: c, borderBottomColor: c, borderLeftColor: c,
    borderTopStyle: st, borderRightStyle: st, borderBottomStyle: st, borderLeftStyle: st,
  });

  it("border:10px solid transparent → 10px padding + zero-opacity stroke (h2d parity)", () => {
    // .u-gutter-20 .u-layout .u-layout-cell { border: 10px solid transparent }
    // h2d represents this as BOTH: p-[10px] AND a 10-weight rgba(0,0,0,0)
    // INSIDE stroke — the stroke keeps the website's truth inspectable, the
    // padding provides the layout space (INSIDE strokes take none in Figma).
    const root = convert(makeFrame({
      tag: 'div', width: 386.66, height: 399,
      styles: { display: 'block', ...borderSides('10px', 'rgba(0, 0, 0, 0)') },
      children: [
        makeFrame({ tag: 'div', x: 10, y: 10, width: 366.66, height: 379, styles: { display: 'block' } }),
      ],
    }));
    expect(root.padding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(root.strokes).toBeDefined();
    expect(root.strokes!.length).toBe(1);
    expect(root.strokes![0].weight).toBe(10);
    expect(root.strokes![0].color.a).toBe(0);
    expect(root.strokes![0].position).toBe('INSIDE');
  });

  it("visible border keeps strokes and does NOT add padding", () => {
    const root = convert(makeFrame({
      tag: 'div', width: 200, height: 100,
      styles: { display: 'block', ...borderSides('2px', 'rgb(255, 0, 0)') },
    }));
    expect(root.strokes).toBeDefined();
    expect(root.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("border-style:none with width does not add padding", () => {
    const root = convert(makeFrame({
      tag: 'div', width: 200, height: 100,
      styles: { display: 'block', ...borderSides('10px', 'rgba(0, 0, 0, 0)', 'none') },
    }));
    expect(root.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("transparent border adds ON TOP of existing padding", () => {
    const root = convert(makeFrame({
      tag: 'div', width: 200, height: 100,
      styles: {
        display: 'block',
        paddingTop: '5px', paddingRight: '5px', paddingBottom: '5px', paddingLeft: '5px',
        ...borderSides('10px', 'rgba(0, 0, 0, 0)'),
      },
    }));
    expect(root.padding).toEqual({ top: 15, right: 15, bottom: 15, left: 15 });
  });
});

// ---------------------------------------------------------------------------
// Fix 5 — large negative margin-top → absolute child (same-row hack)
// ---------------------------------------------------------------------------

describe("large negative margin-top children become absolute", () => {
  function block4Item(h5MarginTop: string) {
    return makeFrame({
      tag: 'div', width: 753, height: 129,
      styles: { display: 'block' },
      children: [
        makeFrame({
          tag: 'span', x: 0, y: 0, width: 64, height: 64,
          styles: { display: 'block', backgroundColor: 'rgb(40,140,100)' },
        }),
        makeFrame({
          tag: 'h5', x: 94, y: 0, width: 199, height: 48,
          styles: {
            display: 'block', fontSize: '20px',
            marginTop: h5MarginTop, marginLeft: '94px',
          },
          children: [makeText('Personalized City Guides', { x: 94, y: 0, width: 199, height: 48, font: 'Oswald Bold' })],
        }),
      ],
    });
  }

  it("h5 with margin-top:-64px is absolutely positioned at captured coords", () => {
    const root = convert(block4Item('-64px'));
    const h5 = findNode(root, n => n.tag === 'h5');
    expect(h5).not.toBeNull();
    expect(h5!.position).toBe('absolute');
    expect(h5!.x).toBe(94);
    expect(h5!.y).toBe(0);
  });

  it("siblings of a pulled-up child also keep captured coords (absolute)", () => {
    // block-4 item: icon + h5(margin-top:-64) + p. In the browser the
    // negative margin shifts the FOLLOWING flow too (p lands at y=35, not
    // 64+margin). Auto-layout can't reproduce that — the whole container's
    // children must take captured coords.
    const root = convert(makeFrame({
      tag: 'div', width: 753, height: 105,
      styles: { display: 'block' },
      children: [
        makeFrame({
          tag: 'span', x: 0, y: 0, width: 64, height: 64,
          styles: { display: 'block', backgroundColor: 'rgb(40,140,100)' },
        }),
        makeFrame({
          tag: 'h5', x: 94, y: 0, width: 199, height: 24,
          styles: { display: 'block', fontSize: '20px', marginTop: '-64px', marginLeft: '94px' },
          children: [makeText('Slow Travel Planning', { x: 94, y: 0, width: 181, height: 24, font: 'Oswald Bold' })],
        }),
        makeFrame({
          tag: 'p', x: 94, y: 35, width: 659, height: 58,
          styles: { display: 'block', fontSize: '18px', marginTop: '11px', marginLeft: '94px' },
          children: [makeText('Multi-country rail routes', { x: 94, y: 35, width: 588, height: 58 })],
        }),
      ],
    }));
    const p = findNode(root, n => n.tag === 'p');
    expect(p).not.toBeNull();
    expect(p!.position).toBe('absolute');
    expect(p!.y).toBe(35);
    const icon = findNode(root, n => n.tag === 'span' && n.type !== 'text');
    expect(icon!.position).toBe('absolute');
  });

  it("small negative margin (-2px) stays in flow", () => {
    const root = convert(block4Item('-2px'));
    const h5 = findNode(root, n => n.tag === 'h5');
    expect(h5).not.toBeNull();
    expect(h5!.position).not.toBe('absolute');
  });

  it("already-absolute children are untouched", () => {
    const tree = makeFrame({
      tag: 'div', width: 753, height: 129,
      children: [
        makeFrame({
          tag: 'h5', x: 94, y: 0, width: 199, height: 48,
          styles: { display: 'block', position: 'absolute', marginTop: '-64px' },
        }),
      ],
    });
    const root = convert(tree);
    const h5 = findNode(root, n => n.tag === 'h5');
    expect(h5!.position).toBe('absolute');
  });
});
