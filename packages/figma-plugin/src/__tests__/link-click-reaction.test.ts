/**
 * Non-text links (h2d app.js:53190 parity).
 *
 * A logo, an icon or an image card wrapped in `<a href>` produced NOTHING
 * clickable: only TEXT nodes ever received a link. h2d attaches a prototype
 * reaction to the FRAME instead — `{ ON_CLICK → { type: "URL" } }` — so the
 * link works in Presentation mode.
 *
 * The reaction is MERGED, never assigned: hoverConsolidation already puts
 * ON_HOVER reactions on some of these nodes and clobbering those would break
 * the hover prototype.
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
  reactions: unknown[];
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockNode): void;
  setReactionsAsync(r: unknown[]): Promise<void>;
}

function createMockFrameNode(): MockNode {
  return {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [], children: [],
    layoutMode: "NONE",
    reactions: [] as unknown[],
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) { this._pluginData[key] = value; },
    getPluginData(key: string) { return this._pluginData[key] ?? ""; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild(child: MockNode) { this.children.push(child); },
    async setReactionsAsync(r: unknown[]) { this.reactions = r; },
  } as MockNode;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => createMockFrameNode()),
  createText: vi.fn(() => ({ ...createMockFrameNode(), type: "TEXT", appendChild() {} })),
  createRectangle: vi.fn(() => createMockFrameNode()),
  loadFontAsync: vi.fn(async () => undefined),
  getLocalPaintStyles: vi.fn(() => []),
  mixed: Symbol("figma.mixed"),
});

import { convertW2WToWireframe } from "../rendering/css-converter";
import { attachLinkReaction, createNodeInFigma } from "../rendering/nodes";
import type { RenderContext, WireframeNode } from "../types";
import type { W2WFrameNode } from "@w2w/shared";

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 200, height: 60,
    quad: [0, 0, 200, 0, 200, 60, 0, 60],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function text(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "TEXT",
    x: 0, y: 0, width: 120, height: 20,
    quad: [0, 0, 120, 0, 120, 20, 0, 20],
    value,
    font: "400 16px Arial",
    ...overrides,
  };
}

function mockContext(): RenderContext {
  return {
    fontsToLoad: new Set(),
    layoutMode: "autoLayout",
    colorMode: "website",
    textMode: "original",
    fontMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    variableMode: "none",
    pluginColors: {
      text: "#000", primary: "#000", secondary: "#888",
      background: "#FFF", surface: "#EEE", accent: "#00F", border: "#DDD",
    },
    pluginFont: { family: "Inter", weight: 400 },
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
  } as unknown as RenderContext;
}

function allNodes(root: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    out.push(obj);
    const kids = obj.children as unknown[] | undefined;
    if (Array.isArray(kids)) kids.forEach(visit);
  };
  visit(root);
  return out;
}

/** `<a href>` wrapping the given children, inside a body with a baseURI. */
function linkAround(children: Array<Record<string, unknown>>): W2WFrameNode {
  return frame({
    tag: "body",
    attr: { baseURI: "https://w2w.design/" },
    children: [
      frame({
        tag: "a",
        attr: { href: "https://w2w.design/pricing" },
        styles: { display: "block" },
        children,
      }),
    ],
  }) as unknown as W2WFrameNode;
}

const iconSvg = {
  type: "SVG",
  x: 0, y: 0, width: 32, height: 32,
  quad: [0, 0, 32, 0, 32, 32, 0, 32],
  tag: "svg",
  classList: [],
  attr: {},
  styles: {},
  markup: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="15"/></svg>',
};

describe("converter: linkReactionUrl marks non-text links", () => {
  it("marks an <a> whose only content is an image", () => {
    const tree = convertW2WToWireframe(linkAround([
      frame({
        tag: "img",
        attr: { src: "https://w2w.design/logo.png" },
        width: 120, height: 40,
      }),
    ]));
    const linked = allNodes(tree).filter((n) => n.linkReactionUrl);
    expect(linked.length).toBe(1);
    expect(linked[0].linkReactionUrl).toBe("https://w2w.design/pricing");
  });

  it("marks an <a> whose only content is an icon", () => {
    const tree = convertW2WToWireframe(linkAround([iconSvg]));
    expect(allNodes(tree).filter((n) => n.linkReactionUrl).length).toBe(1);
  });

  it("does NOT mark a link that has text — the glyphs carry the hyperlink", () => {
    const tree = convertW2WToWireframe(linkAround([
      frame({ tag: "span", styles: { display: "block" }, children: [text("Get Pro")] }),
    ]));
    expect(allNodes(tree).filter((n) => n.linkReactionUrl).length).toBe(0);
  });

  it("does NOT mark a card whose text sits beside the image", () => {
    const tree = convertW2WToWireframe(linkAround([
      frame({ tag: "img", attr: { src: "https://w2w.design/card.png" }, width: 200, height: 120 }),
      frame({ tag: "h3", y: 120, styles: { display: "block" }, children: [text("Read more")] }),
    ]));
    expect(allNodes(tree).filter((n) => n.linkReactionUrl).length).toBe(0);
  });

  it("marks only the <a> itself, not its wrapper children", () => {
    const tree = convertW2WToWireframe(linkAround([
      frame({
        tag: "div",
        children: [frame({ tag: "img", attr: { src: "https://w2w.design/l.png" }, width: 80, height: 24 })],
      }),
    ]));
    expect(allNodes(tree).filter((n) => n.linkReactionUrl).length).toBe(1);
  });

  it("stays unset without a usable href", () => {
    const tree = convertW2WToWireframe(frame({
      tag: "body",
      attr: { baseURI: "https://w2w.design/" },
      children: [
        frame({
          tag: "a",
          attr: { href: "javascript:void(0)" },
          styles: { display: "block" },
          children: [{ ...iconSvg }],
        }),
      ],
    }) as unknown as W2WFrameNode);
    expect(allNodes(tree).filter((n) => n.linkReactionUrl).length).toBe(0);
  });
});

describe("attachLinkReaction: merges instead of overwriting", () => {
  it("appends an ON_CLICK URL reaction", async () => {
    const node = createMockFrameNode();
    await attachLinkReaction(node as unknown as SceneNode, "https://w2w.design/pricing");
    expect(node.reactions).toEqual([
      {
        trigger: { type: "ON_CLICK" },
        actions: [{ type: "URL", url: "https://w2w.design/pricing" }],
      },
    ]);
  });

  it("keeps an existing ON_HOVER reaction", async () => {
    const node = createMockFrameNode();
    const hover = {
      trigger: { type: "ON_HOVER" },
      actions: [{ type: "NODE", destinationId: "1:2", navigation: "CHANGE_TO" }],
    };
    node.reactions = [hover];

    await attachLinkReaction(node as unknown as SceneNode, "https://w2w.design/pricing");
    expect(node.reactions.length).toBe(2);
    expect(node.reactions[0]).toBe(hover);
    expect((node.reactions[1] as { trigger: { type: string } }).trigger.type).toBe("ON_CLICK");
  });

  it("does not add the same URL twice", async () => {
    const node = createMockFrameNode();
    await attachLinkReaction(node as unknown as SceneNode, "https://w2w.design/pricing");
    await attachLinkReaction(node as unknown as SceneNode, "https://w2w.design/pricing");
    expect(node.reactions.length).toBe(1);
  });

  it("falls back to assigning .reactions without setReactionsAsync", async () => {
    const node = createMockFrameNode();
    delete (node as unknown as Record<string, unknown>).setReactionsAsync;
    await attachLinkReaction(node as unknown as SceneNode, "https://w2w.design/x");
    expect(node.reactions.length).toBe(1);
  });
});

describe("renderer: the icon link ends up clickable", () => {
  it("attaches the reaction while rendering", async () => {
    const tree = convertW2WToWireframe(linkAround([iconSvg]));
    const anchor = allNodes(tree).find((n) => n.linkReactionUrl) as unknown as WireframeNode;
    expect(anchor).toBeDefined();

    const rendered = await createNodeInFigma(anchor, mockContext());
    const reactions = (rendered as unknown as { reactions: Array<{ trigger: { type: string } }> })
      .reactions;
    expect(reactions.some((r) => r.trigger.type === "ON_CLICK")).toBe(true);
    expect(reactions.find((r) => r.trigger.type === "ON_CLICK")).toEqual({
      trigger: { type: "ON_CLICK" },
      actions: [{ type: "URL", url: "https://w2w.design/pricing" }],
    });
  });

  it("keeps the cursor:pointer ON_HOVER reaction the same frame already had", async () => {
    // An <a> is clickable, so nodes.ts also gives it a self-referencing
    // ON_HOVER (cursor:pointer in Figma preview). Both must survive.
    const tree = convertW2WToWireframe(linkAround([iconSvg]));
    const anchor = allNodes(tree).find((n) => n.linkReactionUrl) as unknown as WireframeNode;
    expect(anchor.needsCursorPointer).toBe(true);

    const rendered = await createNodeInFigma(anchor, mockContext());
    const triggers = (rendered as unknown as { reactions: Array<{ trigger: { type: string } }> })
      .reactions.map((r) => r.trigger.type);
    expect(triggers).toEqual(["ON_HOVER", "ON_CLICK"]);
  });
});
