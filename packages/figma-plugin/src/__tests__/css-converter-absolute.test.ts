/**
 * Tests for css-converter.ts: coordinate conversion + absolute mode overrides
 */
import { describe, it, expect } from "vitest";
import { convertH2DToWireframe } from "../rendering/css-converter";

// Helper: minimal H2D frame node
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

function makeSVG(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'SVG',
    x: 0, y: 0, width: 24, height: 24,
    quad: [0, 0, 24, 0, 24, 24, 0, 24],
    svg: '<svg></svg>',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Coordinate conversion: absolute → parent-relative
// ---------------------------------------------------------------------------

describe("css-converter: coordinate conversion", () => {
  it("root node keeps original coordinates (no parent)", () => {
    const root = makeFrame({ x: 0, y: 100, width: 1440, height: 900 });
    const result = convertH2DToWireframe(root as any);
    expect(result.x).toBe(0);
    expect(result.y).toBe(100);
  });

  it("direct child gets parent-relative coordinates", () => {
    const child = makeFrame({ x: 50, y: 300, width: 200, height: 100 });
    const root = makeFrame({
      x: 0, y: 100, width: 1440, height: 900,
      children: [child],
    });

    const result = convertH2DToWireframe(root as any);
    expect(result.children[0].x).toBe(50);     // 50 - 0 = 50
    expect(result.children[0].y).toBe(200);    // 300 - 100 = 200
  });

  it("nested grandchild gets parent-relative coordinates", () => {
    const leaf = makeFrame({ x: 150, y: 350, width: 80, height: 40 });
    const mid = makeFrame({
      x: 100, y: 200, width: 300, height: 400,
      children: [leaf],
    });
    const root = makeFrame({
      x: 0, y: 0, width: 1440, height: 900,
      children: [mid],
    });

    const result = convertH2DToWireframe(root as any);
    const midNode = result.children[0];
    expect(midNode.x).toBe(100);   // 100 - 0
    expect(midNode.y).toBe(200);   // 200 - 0

    const leafNode = midNode.children[0];
    expect(leafNode.x).toBe(50);   // 150 - 100
    expect(leafNode.y).toBe(150);  // 350 - 200
  });

  it("SVG child gets parent-relative coordinates", () => {
    const svg = makeSVG({ x: 150, y: 350, width: 24, height: 24 });
    const parent = makeFrame({
      x: 100, y: 200, width: 300, height: 400,
      children: [svg],
    });

    const result = convertH2DToWireframe(parent as any);
    const svgNode = result.children[0];
    expect(svgNode.x).toBe(50);   // 150 - 100
    expect(svgNode.y).toBe(150);  // 350 - 200
  });
});

// ---------------------------------------------------------------------------
// Absolute mode: layout overrides
// ---------------------------------------------------------------------------

describe("css-converter: absolute mode overrides", () => {
  it("forces layoutMode NONE for flex containers", () => {
    const root = makeFrame({
      styles: { display: 'flex', flexDirection: 'row' },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'absolute' });
    expect(result.layoutMode).toBe('NONE');
  });

  it("forces FIXED sizing", () => {
    const root = makeFrame({
      styles: { display: 'flex', flexGrow: '1' },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'absolute' });
    expect(result.layoutSizingHorizontal).toBe('FIXED');
    expect(result.layoutSizingVertical).toBe('FIXED');
  });

  it("strips grid properties", () => {
    const root = makeFrame({
      styles: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'auto',
        gridAutoFlow: 'row',
        gap: '20px',
      },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'absolute' });
    expect(result.gridTemplateColumns).toBeUndefined();
    expect(result.gridTemplateRows).toBeUndefined();
    expect(result.gridAutoFlow).toBeUndefined();
  });

  it("sets itemSpacing to 0", () => {
    const root = makeFrame({
      styles: { display: 'flex', gap: '20px' },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'absolute' });
    expect(result.itemSpacing).toBe(0);
  });

  it("strips flex properties", () => {
    const root = makeFrame({
      styles: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
      },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'absolute' });
    expect(result.justifyContent).toBeUndefined();
    expect(result.alignItems).toBeUndefined();
    expect(result.flexWrap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AutoLayout mode: unchanged behavior
// ---------------------------------------------------------------------------

describe("css-converter: autoLayout mode unchanged", () => {
  it("preserves HORIZONTAL layoutMode for flex row", () => {
    const root = makeFrame({
      styles: { display: 'flex', flexDirection: 'row' },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'autoLayout' });
    expect(result.layoutMode).toBe('HORIZONTAL');
  });

  it("preserves itemSpacing from gap", () => {
    const root = makeFrame({
      styles: { display: 'flex', gap: '16px' },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'autoLayout' });
    expect(result.itemSpacing).toBe(16);
  });

  it("preserves grid properties", () => {
    const root = makeFrame({
      styles: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
      },
    });

    const result = convertH2DToWireframe(root as any, { layoutMode: 'autoLayout' });
    expect(result.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });
});

// ---------------------------------------------------------------------------
// TEXT node geometry in mixed-content containers (icon + text)
// ---------------------------------------------------------------------------

function makeText(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'TEXT',
    x: 0, y: 0, width: 50, height: 20,
    quad: [0, 0, 50, 0, 50, 20, 0, 20],
    value: 'Hello',
    font: 'Arial Regular',
    ...overrides,
  };
}

describe("css-converter: TEXT node geometry in mixed containers", () => {
  it("TEXT child in mixed container gets parent-relative coordinates", () => {
    const icon = makeFrame({ x: 810, y: 210, width: 18, height: 16, tag: 'i' });
    const text = makeText({ x: 850, y: 210, width: 82, height: 20, value: '6 Sections' });
    const li = makeFrame({
      x: 800, y: 200, width: 300, height: 40,
      tag: 'li',
      styles: { display: 'flex', gap: '9px' },
      children: [icon, text],
    });

    const result = convertH2DToWireframe(li as any);
    // Find the text child (type === 'text')
    const textChild = result.children.find(c => c.type === 'text' && c.textContent === '6 Sections');
    expect(textChild).toBeDefined();
    expect(textChild!.x).toBe(50);   // 850 - 800
    expect(textChild!.y).toBe(10);   // 210 - 200
  });

  it("TEXT child preserves width and height", () => {
    const icon = makeFrame({ x: 10, y: 10, width: 16, height: 16, tag: 'i' });
    const text = makeText({ x: 40, y: 10, width: 82, height: 20, value: 'Test' });
    const li = makeFrame({
      x: 0, y: 0, width: 200, height: 40,
      tag: 'li',
      children: [icon, text],
    });

    const result = convertH2DToWireframe(li as any);
    const textChild = result.children.find(c => c.type === 'text' && c.textContent === 'Test');
    expect(textChild).toBeDefined();
    expect(textChild!.width).toBe(82);
    expect(textChild!.height).toBe(20);
  });

  it("coalesced text in pure text container still works (no regression)", () => {
    const text1 = makeText({ x: 10, y: 10, width: 100, height: 20, value: 'Hello' });
    const text2 = makeText({ x: 10, y: 30, width: 100, height: 20, value: 'World' });
    const p = makeFrame({
      x: 0, y: 0, width: 200, height: 60,
      tag: 'p',
      children: [text1, text2],
    });

    const result = convertH2DToWireframe(p as any);
    expect(result.type).toBe('text');
    expect(result.textContent).toBe('Hello World');
    // Coalesced = no separate text children
    expect(result.children.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// __w2w-pseudo-before/after children → x=0, y=0
// ---------------------------------------------------------------------------

describe("css-converter: pseudo-element children positioned at 0,0", () => {
  it("__w2w-pseudo-before child gets x=0, y=0 (not parent-relative)", () => {
    const pseudoSpan = makeFrame({
      x: 215.41, y: 1201.02, width: 22.41, height: 22.4,
      tag: 'span',
      classList: ['__w2w-pseudo-before'],
      children: [{
        type: 'TEXT', x: 215.41, y: 1201.02, width: 22.41, height: 22.4,
        quad: [], value: '\uf5ae', font: 'Font Awesome 6 Free Solid',
      }],
    });
    const icon = makeFrame({
      x: 193, y: 1201.02, width: 22.41, height: 22.4,
      tag: 'i',
      classList: ['fa-solid', 'fa-pen-ruler'],
      children: [pseudoSpan],
    });

    const root = makeFrame({
      x: 0, y: 0, width: 1440, height: 2000,
      children: [icon],
    });

    const result = convertH2DToWireframe(root as any);
    const iconNode = result.children[0];
    expect(iconNode.x).toBe(193);  // parent-relative from root

    const pseudoNode = iconNode.children[0];
    expect(pseudoNode.x).toBe(0);  // NOT 22.41 (which would be outside frame)
    expect(pseudoNode.y).toBe(0);
  });

  it("__w2w-pseudo-after child also gets x=0, y=0", () => {
    const pseudoSpan = makeFrame({
      x: 500, y: 300, width: 10, height: 10,
      tag: 'span',
      classList: ['__w2w-pseudo-after'],
    });
    const parent = makeFrame({
      x: 400, y: 200, width: 50, height: 50,
      children: [pseudoSpan],
    });

    const result = convertH2DToWireframe(parent as any);
    const pseudoNode = result.children[0];
    expect(pseudoNode.x).toBe(0);
    expect(pseudoNode.y).toBe(0);
  });

  it("regular child still uses parent-relative coords", () => {
    const child = makeFrame({ x: 250, y: 350, width: 100, height: 50 });
    const parent = makeFrame({
      x: 200, y: 300, width: 400, height: 400,
      children: [child],
    });

    const result = convertH2DToWireframe(parent as any);
    expect(result.children[0].x).toBe(50);  // 250 - 200
    expect(result.children[0].y).toBe(50);  // 350 - 300
  });
});
