/**
 * End-to-end guard for the `flex-grow` exact-fit gate.
 *
 * `growFitsContainer` (rendering/layout.ts) already has unit tests, but nothing
 * covered the WIRING that carries its verdict to a rendered frame:
 *
 *   createNodeInFigma → evaluateGrowEligibility(frame, children)
 *                     → childContext.growEligible
 *                     → applyChildInAutoLayout: `grows = layoutGrow === 1 && growEligible !== false`
 *
 * Delete any link in that chain and every unit test still passes while the
 * import regresses. stripe.com's bento is the case that exposed it: six cards
 * measuring 816/400/400/400/400/1232 all declare `flex: 1 1 0%` inside a 1232px
 * wrapping row. They occupy three lines in the browser, so `layoutGrow = 1`
 * packed all six onto ONE Figma line at (1232 − 5×16) / 6 = 191.67px each —
 * the card contents then overflowed their frames and the section spilled 871px
 * past its own width.
 *
 * Both directions are asserted, so the test cannot pass by simply never
 * growing: an exact-fit row of the same shape must still FILL.
 */
import { describe, it, expect, vi } from "vitest";

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  children: MockNode[];
  layoutMode: string;
  layoutWrap: string;
  itemSpacing: number;
  counterAxisSpacing: number;
  layoutGrow: number;
  layoutAlign: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  minWidth: number | null;
  minHeight: number | null;
  effects: unknown[];
  opacity: number;
  layoutSizingHorizontal: string;
  layoutSizingVertical: string;
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
}

function createMockFrameNode(): MockNode {
  const node: MockNode = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    children: [],
    layoutMode: "NONE",
    layoutWrap: "NO_WRAP",
    itemSpacing: 0,
    counterAxisSpacing: 0,
    layoutGrow: 0,
    layoutAlign: "INHERIT",
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    minWidth: null,
    minHeight: null,
    effects: [],
    opacity: 1,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    _pluginData: {},
    setPluginData(key, value) {
      this._pluginData[key] = value;
    },
    getPluginData(key) {
      return this._pluginData[key] ?? "";
    },
    resize(w, h) {
      this.width = w;
      this.height = h;
    },
    appendChild(child) {
      this.children.push(child);
    },
  };
  return node;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT", appendChild() {} })),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext } from "../types";

type Styles = Record<string, string | number>;

/** `display:flex; flex-wrap:wrap; gap:16px` — the bento row. */
const ROW: Styles = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: "16px",
  rowGap: "16px",
  columnGap: "16px",
};

/** `flex: 1 1 0%` on a column card — the declaration every bento card carries. */
const CARD: Styles = {
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: "0%",
  width: "auto",
  height: "auto",
};

function w2w(
  styles: Styles,
  x: number,
  y: number,
  width: number,
  height: number,
  children: unknown[] = [],
) {
  return {
    type: "FRAME",
    tag: "div",
    classList: [],
    attr: {},
    x,
    y,
    width,
    height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    styles,
    children,
  };
}

const mockContext = {
  fontsToLoad: new Set(),
  layoutMode: "autoLayout",
  colorMode: "website",
  textMode: "original",
  fontMode: "original",
  assetMode: "placeholders",
  interactionMode: "none",
  variableMode: "none",
  pluginColors: { text: "#000", primary: "#000", secondary: "#888", background: "#FFF" },
  pluginFont: { family: "Inter", weight: 400 },
  colorStyleMap: new Map(),
  textStyleMap: new Map(),
  variableValueMap: new Map(),
} as unknown as RenderContext;

async function render(root: unknown): Promise<MockNode> {
  const wireframe = convertW2WToWireframe(root as never, { layoutMode: "autoLayout" });
  const rendered = await createNodeInFigma(wireframe, mockContext, 0);
  expect(rendered).not.toBeNull();
  return rendered as unknown as MockNode;
}

describe("flex-grow in a wrapped row (stripe.com bento)", () => {
  /** Six cards on three lines: 816+400 / 400+400+400 / 1232, 16px gaps. */
  function bentoRow() {
    const cards = [
      { x: 0, y: 0, w: 816, h: 606 },
      { x: 832, y: 0, w: 400, h: 606 },
      { x: 0, y: 622, w: 400, h: 562 },
      { x: 416, y: 622, w: 400, h: 562 },
      { x: 832, y: 622, w: 400, h: 562 },
      { x: 0, y: 1200, w: 1232, h: 456 },
    ].map((c) => w2w(CARD, c.x, c.y, c.w, c.h));
    return w2w(ROW, 0, 0, 1232, 1834, cards);
  }

  it("builds a wrapping row whose cards carry their measured widths", async () => {
    const row = await render(bentoRow());

    expect(row.layoutMode).toBe("HORIZONTAL");
    expect(row.layoutWrap).toBe("WRAP");
    // Scene check, not the guard: the mock frame has no layout engine, so no
    // assertion here can observe Figma redistributing the row. The two tests
    // below carry the actual guard by asserting the properties that would make
    // Figma redistribute.
    expect(row.children.map((c) => c.width)).toEqual([816, 400, 400, 400, 400, 1232]);
  });

  it("does not hand any card layoutGrow or FILL", async () => {
    const row = await render(bentoRow());

    for (const card of row.children) {
      expect(card.layoutGrow).toBe(0);
      expect(card.layoutSizingHorizontal).toBe("FIXED");
    }
  });

  it("still grows an exact-fit row — the gate is not a blanket refusal", async () => {
    // 3 × 400 + 2 × 16 = 1232: one line, measured children fill the container.
    const cards = [0, 416, 832].map((x) => w2w(CARD, x, 0, 400, 562));
    const row = await render(w2w(ROW, 0, 0, 1232, 562, cards));

    for (const card of row.children) {
      expect(card.layoutGrow).toBe(1);
      expect(card.layoutSizingHorizontal).toBe("FILL");
    }
  });
});
