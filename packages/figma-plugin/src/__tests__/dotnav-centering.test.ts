/**
 * Apple.com `.media-gallery-dotnav` centering bug reproduction.
 *
 * The dotnav is a 1440px flex row-reverse container with
 * `justify-content: center` and a single ul child (120px wide). It should
 * render with the ul centered, but renders at the left in Figma.
 *
 * This test feeds the fixture through BOTH layers (css-converter +
 * createNodeInFigma with a Figma API mock) and asserts on the final frame's
 * `primaryAxisAlignItems` to pin down the layer where centering is lost.
 */
import { describe, it, expect, vi } from "vitest";

// ============================================================================
// Figma API mocks (minimal FrameNode + TextNode surface needed by nodes.ts)
// ============================================================================

interface MockNode {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  dashPattern?: number[];
  strokeWeight?: number;
  strokeTopWeight?: number;
  strokeRightWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
  strokeAlign?: string;
  strokeStyleId?: string;
  children: MockNode[];
  characters?: string;
  fontSize?: number;
  fontName?: unknown;
  textAutoResize?: string;
  layoutMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  layoutWrap?: string;
  layoutGrow?: number;
  layoutAlign?: string;
  layoutPositioning?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  cornerRadius?: number | symbol;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  clipsContent?: boolean;
  maxWidth?: number;
  effects?: unknown[];
  opacity?: number;
  blendMode?: string;
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
    effects: [],
    opacity: 1,
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild(child: MockNode) {
      this.children.push(child);
    },
  };
  return node;
}

function createMockTextNode(): MockNode {
  const node: MockNode = {
    type: "TEXT",
    name: "",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    fills: [],
    strokes: [],
    children: [],
    fontSize: 16,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    resize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    appendChild() { /* noop */ },
  };
  return node;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => createMockTextNode()),
  createRectangle: vi.fn(() => createMockFrameNode()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  createPaintStyle: vi.fn(() => ({ id: "mock-style", name: "", paints: [] })),
  mixed: Symbol("figma.mixed"),
});

// Import AFTER mocking
import { convertW2WToWireframe } from "../rendering/css-converter";
import { createNodeInFigma } from "../rendering/nodes";
import type { RenderContext } from "../types";

// ============================================================================
// Fixture — Apple.com .media-gallery-dotnav
// ============================================================================

// Fixture derived from real capture: docs/apple_website/decoded.json line 25512+
// dotnav has TWO children: ul (position: relative, in flex flow) and button
// (position: absolute, right: 12px, OUT of flex flow).
const ulChild = {
  type: "FRAME",
  x: 608, y: 4853, width: 224, height: 24,
  quad: [608, 4853, 832, 4853, 832, 4877, 608, 4877],
  tag: "ul",
  classList: ["media-gallery-dotnav-items", "dotnav-items"],
  attr: { role: "tablist" },
  styles: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "192px",
    height: "56px",
    padding: "0px 16px",
    position: "relative",
    boxSizing: "content-box",
    flexGrow: 0,
    flexShrink: 1,
    order: 0,
    listStyleType: "none",
    backgroundColor: "rgba(0, 0, 0, 0)",
  },
  children: [],
};

const buttonChild = {
  type: "FRAME",
  x: 1404, y: 4853, width: 24, height: 24,
  quad: [1404, 4853, 1428, 4853, 1428, 4877, 1404, 4877],
  tag: "button",
  classList: ["media-gallery-dotnav-iconcontrol", "dotnav-iconcontrol"],
  attr: { ariaLabel: "Play endless entertainment gallery" },
  styles: {
    display: "block",
    width: "auto",
    height: "auto",
    position: "absolute",
    right: "12px",
    marginLeft: "16px",
    margin: "0px 0px 0px 16px",
    backgroundColor: "rgba(210, 210, 215, 0.64)",
    borderStyle: "none",
    flexGrow: 0,
    flexShrink: 1,
    order: 0,
    opacity: 1,
  },
  children: [],
};

const dotnav = {
  type: "FRAME",
  x: 0, y: 4853, width: 1440, height: 24,
  quad: [0, 4853, 1440, 4853, 1440, 4877, 0, 4877],
  tag: "div",
  classList: [
    "media-gallery-dotnav", "dotnav", "dotnav-scrim-solid",
    "dotnav-timed", "dotnav-timed-paused",
  ],
  attr: {},
  styles: {
    display: "flex",
    flexDirection: "row-reverse",
    flexGrow: 0,
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
    order: 4,
    width: "100%",   // ← real capture says 100%, not "1440px"
    height: "24px",
    boxSizing: "content-box",
    position: "relative",
    margin: "12px 0px",
    marginTop: "12px",
    marginBottom: "12px",
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderStyle: "none",
    opacity: 1,
  },
  children: [ulChild, buttonChild],
};

const mockContext: RenderContext = {
   
  fontsToLoad: new Set() as any,
  layoutMode: "autoLayout",
  colorMode: "website",
  textMode: "original",
  fontMode: "original",
  assetMode: "placeholders",
  interactionMode: "none",
  variableMode: "none",
   
  pluginColors: { text: "#11151A", primary: "#000", secondary: "#888", background: "#FFF" } as any,
  pluginFont: { family: "Inter", weight: 400 },
   
  colorStyleMap: new Map() as any,
   
  textStyleMap: new Map() as any,
  variableValueMap: new Map(),
   
} as any;

describe("Apple.com .media-gallery-dotnav centering", () => {
  it("css-converter preserves layoutMode and justifyContent", () => {
     
    const node = convertW2WToWireframe(dotnav as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });
    expect(node.layoutMode).toBe("HORIZONTAL");
    expect(node.justifyContent).toBe("center");
    expect(node.width).toBe(1440);
    expect(node.children).toHaveLength(2);
    const ul = node.children!.find((c) => c.tag === "ul")!;
    const btn = node.children!.find((c) => c.tag === "button")!;
    expect(ul.layoutSizingHorizontal).toBe("FIXED");
    expect(ul.width).toBe(224);
    expect(ul.position).toBe("relative");
    expect(btn.position).toBe("absolute");
  });

  it("nodes.ts createNodeInFigma applies primaryAxisAlignItems=CENTER to the dotnav frame", async () => {
     
    const wireframeNode = convertW2WToWireframe(dotnav as any, {
      layoutMode: "autoLayout",
      interactionMode: "none",
    });

    const created = await createNodeInFigma(wireframeNode, mockContext);
    expect(created).not.toBeNull();
    const frame = created as unknown as MockNode;

     
    console.log("Rendered dotnav frame:", JSON.stringify({
      name: frame.name,
      layoutMode: frame.layoutMode,
      layoutSizingHorizontal: frame.layoutSizingHorizontal,
      layoutSizingVertical: frame.layoutSizingVertical,
      primaryAxisAlignItems: frame.primaryAxisAlignItems,
      counterAxisAlignItems: frame.counterAxisAlignItems,
      width: frame.width,
      height: frame.height,
      childrenCount: frame.children.length,
      firstChild: frame.children[0] && {
        type: frame.children[0].type,
        name: frame.children[0].name,
        layoutMode: frame.children[0].layoutMode,
        layoutSizingHorizontal: frame.children[0].layoutSizingHorizontal,
        width: frame.children[0].width,
        x: frame.children[0].x,
      },
    }, null, 2));

    expect(frame.layoutMode).toBe("HORIZONTAL");
    expect(frame.primaryAxisAlignItems).toBe("CENTER");
    expect(frame.counterAxisAlignItems).toBe("CENTER");
  });

  // NOTE: centering fix for the margin-wrapper FILL-in-HUG feedback was
  // reverted — it caused widespread regressions on Apple.com (most of the
  // page rendered empty because FILL'd wrappers cascaded through horizontal
  // flex parents). A more targeted fix is needed. See session notes.
});
