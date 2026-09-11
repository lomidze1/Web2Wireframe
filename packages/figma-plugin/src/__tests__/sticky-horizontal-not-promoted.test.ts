/**
 * A `position: sticky` element is only a Figma fixed child when it sticks
 * VERTICALLY. Per CSS, sticky with every inset `auto` never sticks at all — it
 * is ordinary flow — and a sticky that only pins sideways cannot be expressed
 * by Figma's `numberOfFixedChildren`, which belongs to the frame's vertical
 * scroll.
 *
 * stripe.com's nav buttons are exactly that case: `ul.navigation-buttons` is
 * `position: sticky; top: auto; right: 0` inside a horizontally scrollable
 * `<nav>`. Promoting it broke the render twice over:
 *
 *   - `insertFixedSpacer` dropped a 44px FIXED spacer beside it inside its own
 *     44px-tall `:margin` wrapper. The ul is FILL-height in that wrapper
 *     (createMarginWrapper), so it was squeezed to 1px and `ABSOLUTE` froze it
 *     there — a 1px frame with two 44px buttons hanging out of it.
 *   - The promotion overrides x/y from `cssTop`/`cssLeft` only. With
 *     `top: auto; left: auto` the ul kept its wrapper-local x (262.19) while
 *     being re-read against the page root, landing at x≈262 instead of x≈1098.
 *
 * Live geometry below measured in Chrome at a 1440px viewport.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Figma API mocks
// ============================================================================

interface PluginDataStore {
  [key: string]: string;
}

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  effects: unknown[];
  children: MockNode[];
  parent: MockNode | null;
  layoutMode: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  layoutPositioning?: string;
  visible?: boolean;
  clipsContent?: boolean;
  overflowDirection?: string;
  numberOfFixedChildren?: number;
  opacity?: number;
  constraints?: unknown;
  _pluginData: PluginDataStore;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  insertChild(index: number, child: MockNode): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  setFillStyleIdAsync(id: string): Promise<void>;
  setEffectStyleIdAsync(id: string): Promise<void>;
}

function createMockFrameNode(): MockNode {
  const node = {
    type: "FRAME",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fills: [] as unknown[],
    strokes: [] as unknown[],
    effects: [] as unknown[],
    children: [] as MockNode[],
    parent: null as MockNode | null,
    layoutMode: "NONE",
    visible: true,
    opacity: 1,
    constraints: { horizontal: "MIN", vertical: "MIN" },
    _pluginData: {} as PluginDataStore,
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild(child: MockNode) {
      if (child.parent && child.parent !== this) {
        const i = child.parent.children.indexOf(child);
        if (i >= 0) child.parent.children.splice(i, 1);
      }
      this.children.push(child);
      child.parent = this as unknown as MockNode;
    },
    insertChild(index: number, child: MockNode) {
      if (child.parent && child.parent !== this) {
        const i = child.parent.children.indexOf(child);
        if (i >= 0) child.parent.children.splice(i, 1);
      }
      this.children.splice(index, 0, child);
      child.parent = this as unknown as MockNode;
    },
    setPluginData(key: string, value: string) {
      this._pluginData[key] = value;
    },
    getPluginData(key: string) {
      return this._pluginData[key] ?? "";
    },
    async setFillStyleIdAsync() { /* noop */ },
    async setEffectStyleIdAsync() { /* noop */ },
  } as unknown as MockNode;
  return node;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT" })),
  createRectangle: vi.fn(() => createMockFrameNode()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  viewport: { center: { x: 0, y: 0 } },
  mixed: Symbol("figma.mixed"),
});

// Import AFTER the figma mock
import { convertW2WToWireframe } from "../rendering/css-converter";
import { createWireframeFrame } from "../rendering/nodes";
import type { RenderContext, WireframeFrame } from "../types";

// ============================================================================
// Fixture — stripe.com's header nav at 1440px
// ============================================================================

function box(
  tag: string,
  classList: string[],
  rect: [number, number, number, number],
  styles: Record<string, unknown>,
  children: Record<string, unknown>[] = [],
): Record<string, unknown> {
  const [x, y, width, height] = rect;
  return {
    type: "FRAME",
    x, y, width, height,
    quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    tag,
    classList,
    attr: {},
    styles: { display: "block", ...styles },
    children,
  };
}

const BUTTON_BG = { backgroundColor: "rgb(99, 91, 255)" };

/**
 * `<html><body><header><div><nav><ul.navigation-buttons><li>×2`.
 *
 * `ulStyles` overrides the sticky insets so one fixture can play both the
 * horizontal-only case and the vertically-pinned control.
 */
function makeStripeNav(ulStyles: Record<string, unknown>): Record<string, unknown> {
  return box("html", [], [0, 0, 1440, 14661], {}, [
    box("body", [], [0, 0, 1440, 14661], {}, [
      box("header", ["hds-color-mode"], [0, 0, 1440, 76], { position: "relative" }, [
        box("div", ["section-container"], [0, 0, 1440, 76], { position: "relative" }, [
          box(
            "nav",
            ["hds-navigation-menu"],
            [89, 6, 1262, 64],
            { display: "flex", position: "relative", overflow: "scroll" },
            [
              box(
                "ul",
                ["navigation-buttons"],
                [1098.03, 16, 229.47, 44],
                {
                  display: "flex",
                  position: "sticky",
                  marginLeft: "384.156px",
                  ...ulStyles,
                },
                [
                  box("li", ["hds-navigation-menu__item"], [1098.03, 16, 84.09, 44], BUTTON_BG),
                  box("li", ["hds-navigation-menu__item"], [1190.13, 16, 137.38, 44], BUTTON_BG),
                ],
              ),
            ],
          ),
        ]),
      ]),
    ]),
  ]);
}

/** `top: auto; right: 0` — sticks sideways only. The stripe.com defect. */
const HORIZONTAL_ONLY = { top: "auto", right: "0px", bottom: "auto", left: "auto" };

/** `bottom: 0` — a genuinely pinned bar, and the `cssBottom` parsing check. */
const PINNED_TO_BOTTOM = { top: "auto", right: "0px", bottom: "0px", left: "auto" };

const mockContext = {
  layoutMode: "autoLayout",
  colorMode: "website",
  textMode: "original",
  fontMode: "original",
  assetMode: "placeholders",
  interactionMode: "none",
  variableMode: "none",
  fontFamily: "Inter",
  pluginColors: {
    text: "#000",
    background: "#FFF",
    secondary: "#888",
    surface: "#EEE",
    accent: "#00F",
  },
  colorStyleMap: new Map(),
  textStyleMap: new Map(),
  variableValueMap: new Map(),
  assets: {},
} as unknown as RenderContext;

async function render(ulStyles: Record<string, unknown>): Promise<MockNode> {
  const tree = convertW2WToWireframe(makeStripeNav(ulStyles) as any, {
    layoutMode: "autoLayout",
    interactionMode: "none",
    // The assertions below find subtrees by their DOM-derived names, which is
    // all that survives onto a SceneNode.
    htmlLayerNames: true,
  });
  const frameData = {
    viewportWidth: 1440,
    viewportHeight: 900,
    tree,
    assets: {},
  } as unknown as WireframeFrame;
  const root = await createWireframeFrame(
    frameData,
    "https://stripe.com",
    mockContext,
    0,
  );
  return root as unknown as MockNode;
}

function findByName(node: MockNode, match: (name: string) => boolean): MockNode[] {
  const out: MockNode[] = [];
  const walk = (n: MockNode): void => {
    if (match(n.name)) out.push(n);
    (n.children || []).forEach(walk);
  };
  walk(node);
  return out;
}

/** The ul itself — not the `:margin` wrapper the renderer puts around it. */
function findNavButtons(root: MockNode): MockNode | undefined {
  return findByName(root, (n) => n.includes("navigation-buttons") && !n.endsWith(":margin"))[0];
}

function collectSpacers(node: MockNode): MockNode[] {
  return findByName(node, () => true).filter(
    (n) => n.getPluginData?.("w2w_sticky_spacer") === "1",
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("horizontally-sticky elements stay in flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not tag a sticky element whose insets are all auto but `right`", async () => {
    const root = await render(HORIZONTAL_ONLY);
    const ul = findNavButtons(root);

    expect(ul).toBeDefined();
    expect(ul!.getPluginData("w2w_position_fixed")).toBe("");
  });

  it("promotes nothing to a root fixed child", async () => {
    const root = await render(HORIZONTAL_ONLY);

    expect(root.numberOfFixedChildren).toBeUndefined();
    const rootChildNames = root.children.map((c) => c.name);
    expect(rootChildNames.some((n) => n.includes("navigation-buttons"))).toBe(false);
  });

  it("leaves no flow spacer behind", async () => {
    const root = await render(HORIZONTAL_ONLY);

    expect(collectSpacers(root)).toEqual([]);
  });

  it("leaves the buttons in the nav subtree at their measured height", async () => {
    const root = await render(HORIZONTAL_ONLY);
    const ul = findNavButtons(root)!;

    expect(ul.height).toBe(44);

    // Still inside the <nav>, however many wrappers the renderer inserted.
    const ancestors: string[] = [];
    for (let n = ul.parent; n; n = n.parent) ancestors.push(n.name);
    expect(ancestors.some((n) => n.includes("nav"))).toBe(true);
  });

  it("still promotes the same element when it pins to the bottom", async () => {
    const root = await render(PINNED_TO_BOTTOM);
    const ul = findNavButtons(root);

    expect(ul).toBeDefined();
    expect(ul!.getPluginData("w2w_position_fixed")).toBe("1");
    expect(root.numberOfFixedChildren).toBe(1);
  });
});
