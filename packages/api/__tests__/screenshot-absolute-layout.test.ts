import { describe, it, expect } from "vitest";
import {
  createIdGenerator,
  convertAbsoluteElement,
  type WireframeNode,
} from "../src/lib/wireframeConverter.js";

// ---------------------------------------------------------------------------
// Absolute-mode server-side layout pass.
//
// The plugin renders screenshot imports with layoutMode "absolute", where
// nested auto-layout is DISABLED (nodes.ts shouldUseAutoLayout returns false)
// and every node is drawn at its explicit x/y/width/height. Composite
// converters (table/card/grid/...) used to emit children with zero geometry
// (HUG/FILL) → everything collapsed to 1×1 at (0,0). The layout pass assigns
// real parent-relative geometry to every descendant server-side.
// ---------------------------------------------------------------------------

const TEST_COLORS = {
  text: "#11151A",
  background: "#F1F2F0",
  secondary: "#BDC1B2",
  surface: "#AAB5C3",
  accent: "#AFC6DC",
};

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    viewportWidth: 1440,
    breakpoint: "desktop",
    colors: TEST_COLORS,
    font: "Montserrat",
    nextId: createIdGenerator(),
    ...overrides,
  } as any;
}

/** Every descendant must have positive width/height (plugin clamps 0 → 1px dot). */
function assertNoCollapsedDescendants(node: WireframeNode, path = node.name): void {
  for (const child of node.children || []) {
    expect(child.width, `${path} > ${child.name} width`).toBeGreaterThan(1);
    expect(child.height, `${path} > ${child.name} height`).toBeGreaterThan(1);
    assertNoCollapsedDescendants(child, `${path} > ${child.name}`);
  }
}

describe("table — absolute layout", () => {
  const el = {
    type: "table",
    x: 31, y: 28, width: 1379, height: 689,
    headers: ["Feature", "Free", "Pro"],
    rows: [["Imports per month", "10", "Unlimited"], ["Colors", "Full access", "Full access"]],
  } as any;

  it("keeps the AI box on the table itself", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    expect(node.x).toBe(31);
    expect(node.width).toBe(1379);
    expect(node.height).toBe(689);
  });

  it("rows get real widths and stack vertically without overlap", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    const rows = node.children;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.width).toBeGreaterThan(1000); // ~full inner width
      expect(row.height).toBeGreaterThan(10);
    }
    // strictly increasing y, no overlap
    expect(rows[1].y).toBeGreaterThanOrEqual(rows[0].y + rows[0].height);
    expect(rows[2].y).toBeGreaterThanOrEqual(rows[1].y + rows[1].height);
  });

  it("cells split the row width into equal columns, side by side", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    const header = node.children[0];
    const cells = header.children;
    expect(cells).toHaveLength(3);
    // equal-ish thirds
    const third = header.width / 3;
    for (const cell of cells) {
      expect(cell.width).toBeGreaterThan(third * 0.6);
      expect(cell.width).toBeLessThan(third * 1.4);
    }
    // side by side, increasing x
    expect(cells[1].x).toBeGreaterThan(cells[0].x);
    expect(cells[2].x).toBeGreaterThan(cells[1].x);
  });

  it("no descendant is collapsed", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    assertNoCollapsedDescendants(node);
  });
});

describe("card — absolute layout", () => {
  const el = {
    type: "card",
    x: 100, y: 200, width: 400, height: 300,
    elements: [
      { type: "heading", text: "Plan", level: 3 },
      { type: "paragraph", text: "Everything you need to get started with the product." },
      { type: "button", text: "Get Pro", variant: "primary", size: "md" },
    ],
  } as any;

  it("children stack vertically inside the card box with padding", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    const [h, p, b] = node.children;
    expect(h.y).toBeGreaterThan(0); // padding.top
    expect(p.y).toBeGreaterThanOrEqual(h.y + h.height);
    expect(b.y).toBeGreaterThanOrEqual(p.y + p.height);
    // text children fill inner width
    expect(h.width).toBeGreaterThan(300);
    expect(h.width).toBeLessThanOrEqual(400);
  });

  it("button label gets a real box inside the button", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    const button = node.children[2];
    const label = button.children[0];
    expect(label.width).toBeGreaterThan(1);
    expect(label.height).toBeGreaterThan(1);
  });

  it("no descendant is collapsed", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    assertNoCollapsedDescendants(node);
  });
});

describe("grid — absolute layout", () => {
  const el = {
    type: "grid",
    x: 0, y: 0, width: 1200, height: 400,
    columns: 3,
    elements: [
      { type: "card", elements: [{ type: "heading", text: "A", level: 3 }] },
      { type: "card", elements: [{ type: "heading", text: "B", level: 3 }] },
      { type: "card", elements: [{ type: "heading", text: "C", level: 3 }] },
    ],
  } as any;

  it("grid items share the width side by side", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    const items = node.children;
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.width).toBeGreaterThan(250);
      expect(item.width).toBeLessThan(500);
    }
    expect(items[1].x).toBeGreaterThanOrEqual(items[0].x + items[0].width);
    expect(items[2].x).toBeGreaterThanOrEqual(items[1].x + items[1].width);
  });

  it("no descendant is collapsed", () => {
    const node = convertAbsoluteElement(el, makeCtx())!;
    assertNoCollapsedDescendants(node);
  });
});

describe("long text wraps — height grows", () => {
  it("a long paragraph in a narrow card is taller than a short one", () => {
    const short = convertAbsoluteElement({
      type: "card", x: 0, y: 0, width: 300, height: 400,
      elements: [{ type: "paragraph", text: "Short." }],
    } as any, makeCtx())!;
    const long = convertAbsoluteElement({
      type: "card", x: 0, y: 0, width: 300, height: 400,
      elements: [{ type: "paragraph", text: "This is a much longer paragraph of text that will definitely need to wrap onto several lines inside a narrow three-hundred-pixel card container." }],
    } as any, makeCtx())!;
    expect(long.children[0].height).toBeGreaterThan(short.children[0].height * 2);
  });
});

describe("plain text elements are untouched", () => {
  it("a top-level heading keeps its AI box exactly", () => {
    const node = convertAbsoluteElement({ type: "heading", text: "Title", level: 1, x: 50, y: 60, width: 500, height: 56 } as any, makeCtx())!;
    expect(node.x).toBe(50);
    expect(node.y).toBe(60);
    expect(node.width).toBe(500);
    expect(node.height).toBe(56);
    expect(node.children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// browserLineCount — the plugin treats text without it as SINGLE-line and, via
// its hug-width acceptance path, renders wrapped paragraphs as one long line
// overflowing the card. The layout pass must annotate multi-line text.
// ---------------------------------------------------------------------------
describe("browserLineCount annotation", () => {
  it("long paragraph in a narrow card gets browserLineCount > 1", () => {
    const node = convertAbsoluteElement({
      type: "card", x: 0, y: 0, width: 330, height: 300,
      elements: [{ type: "paragraph", text: "Choose which screen widths are captured for each import." }],
    } as any, makeCtx())!;
    const p = node.children[0] as any;
    expect(p.browserLineCount).toBeGreaterThan(1);
  });

  it("short text gets no browserLineCount (single-line logic keeps working)", () => {
    const node = convertAbsoluteElement({
      type: "card", x: 0, y: 0, width: 330, height: 300,
      elements: [{ type: "heading", text: "Viewports", level: 3 }],
    } as any, makeCtx())!;
    const h = node.children[0] as any;
    expect(h.browserLineCount).toBeUndefined();
  });

  it("top-level paragraph with a narrow AI box gets browserLineCount > 1", () => {
    const node = convertAbsoluteElement({
      type: "paragraph",
      text: "Set up viewports, colors, fonts, text, assets, variables, and layout once, then reuse them across all imports.",
      x: 100, y: 100, width: 400, height: 66,
    } as any, makeCtx()) as any;
    expect(node.browserLineCount).toBeGreaterThan(1);
    // AI box itself must stay untouched
    expect(node.width).toBe(400);
    expect(node.height).toBe(66);
  });

  it("top-level short heading stays unannotated", () => {
    const node = convertAbsoluteElement({
      type: "heading", text: "Title", level: 1, x: 0, y: 0, width: 500, height: 56,
    } as any, makeCtx()) as any;
    expect(node.browserLineCount).toBeUndefined();
  });
});

describe("explicit small sizes survive the pass", () => {
  it("divider keeps its 1px height", () => {
    const node = convertAbsoluteElement({ type: "divider", x: 0, y: 10, width: 800, height: 1 } as any, makeCtx())!;
    expect(node.height).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fix 1 — HUG frames must center their content against their FINAL hug width,
// not the parent-offered width (badge text used to land at x≈624 in a 64px badge).
// ---------------------------------------------------------------------------
describe("HUG frame centering", () => {
  it("badge text stays inside the badge box", () => {
    const node = convertAbsoluteElement({
      type: "card", x: 55, y: 398, width: 1335, height: 246,
      elements: [{ type: "badge", text: "● LIVE", variant: "accent" }],
    } as any, makeCtx())!;
    const badge = node.children[0];
    const label = badge.children[0];
    expect(label.x + label.width).toBeLessThanOrEqual(badge.width + 1);
    expect(label.x).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Fix 3 — card/grid children MAY carry their own page-coordinate bboxes; the
// converter turns them into exact parent-relative placement (icon-left /
// text-right survives instead of collapsing into a vertical stack).
// ---------------------------------------------------------------------------
describe("positioned card children", () => {
  const card = {
    type: "card", x: 55, y: 398, width: 1335, height: 246,
    elements: [
      { type: "icon", size: "lg", x: 95, y: 480, width: 83, height: 83 },
      { type: "heading", text: "Web2Wireframe", level: 3, x: 214, y: 444, width: 225, height: 29 },
      { type: "paragraph", text: "Turn any live website into a wireframe.", x: 214, y: 496, width: 735, height: 51 },
    ],
  } as any;

  it("children with bboxes are placed parent-relative with exact sizes", () => {
    const node = convertAbsoluteElement(card, makeCtx())!;
    const [icon, heading, para] = node.children;
    expect(icon.x).toBe(95 - 55);
    expect(icon.y).toBe(480 - 398);
    expect(icon.width).toBe(83);
    expect(heading.x).toBe(214 - 55);
    expect(heading.y).toBe(444 - 398);
    expect(heading.width).toBe(225);
    expect(para.height).toBe(51);
  });

  it("mixed: geometry-less children stack below positioned ones", () => {
    const mixed = {
      ...card,
      elements: [...card.elements, { type: "badge", text: "Figma Plugin" }],
    };
    const node = convertAbsoluteElement(mixed, makeCtx())!;
    const badge = node.children[3];
    expect(badge.width).toBeGreaterThan(1);
    // stacked after the lowest positioned child (icon bottom = 82+83 = 165)
    expect(badge.y).toBeGreaterThanOrEqual(165);
  });
});
