/**
 * "Links" import option (`RenderContext.originLinks`).
 *
 * An import used to ALWAYS carry the source site's links into Figma, in three
 * different shapes:
 *   1. `<a href>` on text      → `TextNode.hyperlink` / `setRangeHyperlink`
 *   2. text-less `<a>` (logo)  → frame `ON_CLICK` → URL  (attachLinkReaction)
 *   3. same-page `#anchor`     → `SCROLL_TO` reaction    (anchorLinks.ts)
 *
 * `originLinks: false` must silence all three — and nothing else. The gate sits
 * at the RENDER sites, never in the converter: `href` also feeds `isLink`
 * (textRunMerge.ts) which drives link colouring in plugin-colour mode, so
 * stripping it upstream would change the picture, not just the links.
 *
 * Absent (`undefined`) means ON — old payloads and every caller that doesn't
 * pass the option keep today's behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RenderContext, TextSegment, WireframeNode } from "../types";

// ---------------------------------------------------------------------------
// Figma mocks
// ---------------------------------------------------------------------------

interface MockFrame {
  type: string;
  id: string;
  name: string;
  x: number; y: number; width: number; height: number;
  fills: unknown[];
  strokes: unknown[];
  children: MockFrame[];
  layoutMode: string;
  reactions: unknown[];
  _pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  resize(w: number, h: number): void;
  appendChild(child: MockFrame): void;
  setReactionsAsync(r: unknown[]): Promise<void>;
}

let frameSeq = 0;

function createMockFrameNode(): MockFrame {
  return {
    type: "FRAME",
    id: `1:${++frameSeq}`,
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [], children: [],
    layoutMode: "NONE",
    reactions: [] as unknown[],
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) { this._pluginData[key] = value; },
    getPluginData(key: string) { return this._pluginData[key] ?? ""; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    appendChild(child: MockFrame) { this.children.push(child); },
    async setReactionsAsync(r: unknown[]) { this.reactions = r; },
  } as MockFrame;
}

function createMockTextNode() {
  let _characters = "";
  return {
    type: "TEXT",
    name: "",
    width: 400,
    height: 20,
    fills: [] as unknown[],
    effects: [] as unknown[],
    hyperlink: null as unknown,
    fontSize: 14,
    fontName: { family: "Inter", style: "Regular" },
    textAutoResize: "NONE",
    textAlignHorizontal: "LEFT",
    lineHeight: { unit: "AUTO" },
    letterSpacing: { value: 0, unit: "PIXELS" },
    textTruncation: undefined as string | undefined,
    textDecoration: "NONE",
    fillStyleId: "",
    textStyleId: "",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    get characters() { return _characters; },
    set characters(v: string) { _characters = v; },
    resize(w: number, h: number) { this.width = w; this.height = h; },
    setRangeFills: vi.fn(),
    setRangeFillStyleId: vi.fn(),
    setRangeFontName: vi.fn(),
    setRangeFontSize: vi.fn(),
    setRangeTextDecoration: vi.fn(),
    setRangeTextStyleId: vi.fn(),
    setRangeHyperlink: vi.fn(),
  };
}

let mockText: ReturnType<typeof createMockTextNode>;

beforeEach(() => {
  mockText = createMockTextNode();
  (globalThis as Record<string, unknown>).figma = {
    createFrame: vi.fn(() => createMockFrameNode()),
    createText: vi.fn(() => mockText),
    createRectangle: vi.fn(() => createMockFrameNode()),
    loadFontAsync: vi.fn(async () => undefined),
    getLocalPaintStyles: vi.fn(() => []),
    mixed: Symbol("figma.mixed"),
  };
});

import { createTextNode } from "../rendering/text";
import { createNodeInFigma } from "../rendering/nodes";
import { convertW2WToWireframe } from "../rendering/css-converter";
import { createAnchorScope, resolveAnchorReactions } from "../rendering/anchorLinks";
import type { W2WFrameNode } from "@w2w/shared";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    pluginColors: {
      text: "#333333", primary: "#000", secondary: "#888",
      background: "#ffffff", surface: "#f5f5f5", accent: "#3b82f6", border: "#e0e0e0",
    },
    fontFamily: "Inter",
    pluginFont: { family: "Inter", weight: 400 },
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    textStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    textMode: "original",
    assetMode: "placeholders",
    interactionMode: "none",
    ...overrides,
  } as unknown as RenderContext;
}

function segment(text: string, extra: Partial<TextSegment> = {}): TextSegment {
  return {
    text,
    color: "#333333",
    fontWeight: 400,
    fontSize: 16,
    fontFamily: "Inter",
    ...extra,
  };
}

function makeTextNode(overrides: Partial<WireframeNode>): WireframeNode {
  return {
    id: "t1",
    name: "Text",
    type: "text",
    tag: "p",
    x: 0, y: 0, width: 400, height: 24,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#333333",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 24,
    letterSpacing: 0,
    isPlaceholder: false,
    children: [],
    browserLineCount: 1,
    ...overrides,
  } as WireframeNode;
}

function w2wFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

/** The `<a>` wrapping a lone icon — the non-text link case. */
function iconLinkNode(): WireframeNode {
  const tree = convertW2WToWireframe(w2wFrame({
    tag: "body",
    attr: { baseURI: "https://w2w.design/" },
    children: [
      w2wFrame({
        tag: "a",
        attr: { href: "https://w2w.design/pricing" },
        styles: { display: "block" },
        children: [{ ...iconSvg }],
      }),
    ],
  }) as unknown as W2WFrameNode);
  const anchor = allNodes(tree).find((n) => n.linkReactionUrl);
  expect(anchor).toBeDefined();
  return anchor as unknown as WireframeNode;
}

function reactionTriggers(node: SceneNode | null): string[] {
  const reactions = (node as unknown as { reactions?: Array<{ trigger: { type: string } }> })
    ?.reactions;
  return Array.isArray(reactions) ? reactions.map((r) => r.trigger.type) : [];
}

// ---------------------------------------------------------------------------
// 1 + 2. Text hyperlinks
// ---------------------------------------------------------------------------

describe("originLinks: false — text hyperlinks", () => {
  it("leaves the node-level hyperlink unset", async () => {
    const node = makeTextNode({ href: "https://w2w.design/pricing", textContent: "See pricing" });
    const textNode = await createTextNode(node, "Inter", makeContext({ originLinks: false }));
    expect(textNode!.hyperlink).toBeNull();
  });

  it("leaves a run-level link unset (segments carry the href, node does not)", async () => {
    const node = makeTextNode({
      styledSegments: [
        segment("Get ", { isLink: true, tag: "a", href: "https://w2w.design/plus" }),
        segment("Plus", { isLink: true, tag: "a", href: "https://w2w.design/plus", fontWeight: 700 }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext({ originLinks: false }));
    expect(textNode!.hyperlink).toBeNull();
    expect(mockText.setRangeHyperlink).not.toHaveBeenCalled();
  });

  it("never calls setRangeHyperlink for a multi-link paragraph", async () => {
    const node = makeTextNode({
      styledSegments: [
        segment("Read the "),
        segment("docs", { isLink: true, tag: "a", href: "https://w2w.design/docs" }),
        segment(" or the "),
        segment("pricing", { isLink: true, tag: "a", href: "https://w2w.design/pricing" }),
      ],
    });
    const textNode = await createTextNode(node, "Inter", makeContext({ originLinks: false }));
    expect(mockText.setRangeHyperlink).not.toHaveBeenCalled();
    // The text itself is untouched — only the link is gone.
    expect(textNode!.characters).toContain("pricing");
  });
});

describe("originLinks default (absent / true) — text hyperlinks still applied", () => {
  it("applies the node-level hyperlink when the option is absent", async () => {
    const node = makeTextNode({ href: "https://w2w.design/pricing", textContent: "See pricing" });
    const textNode = await createTextNode(node, "Inter", makeContext());
    expect(textNode!.hyperlink).toEqual({ type: "URL", value: "https://w2w.design/pricing" });
  });

  it("applies per-range hyperlinks when the option is true", async () => {
    const node = makeTextNode({
      styledSegments: [
        segment("Read the "),
        segment("docs", { isLink: true, tag: "a", href: "https://w2w.design/docs" }),
        segment(" or the "),
        segment("pricing", { isLink: true, tag: "a", href: "https://w2w.design/pricing" }),
      ],
    });
    await createTextNode(node, "Inter", makeContext({ originLinks: true }));
    expect(mockText.setRangeHyperlink).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Non-text links (logo / icon frames)
// ---------------------------------------------------------------------------

describe("originLinks: false — non-text links", () => {
  it("attaches no ON_CLICK reaction to an icon link", async () => {
    const rendered = await createNodeInFigma(iconLinkNode(), makeContext({ originLinks: false }));
    expect(reactionTriggers(rendered)).not.toContain("ON_CLICK");
  });

  it("keeps the cursor:pointer ON_HOVER reaction — that is an affordance, not a link", async () => {
    const rendered = await createNodeInFigma(iconLinkNode(), makeContext({ originLinks: false }));
    expect(reactionTriggers(rendered)).toEqual(["ON_HOVER"]);
  });

  it("still attaches ON_CLICK when the option is absent", async () => {
    const rendered = await createNodeInFigma(iconLinkNode(), makeContext());
    expect(reactionTriggers(rendered)).toContain("ON_CLICK");
  });
});

// ---------------------------------------------------------------------------
// 4. Same-page #anchor links
// ---------------------------------------------------------------------------

describe("originLinks: false — same-page #anchor links", () => {
  const linkNode = () => makeTextNode({
    id: "a1", type: "frame", tag: "a", linkAnchorId: "pricing", textContent: "",
  });
  const targetNode = () => makeTextNode({
    id: "s1", type: "frame", tag: "section", anchorId: "pricing", textContent: "",
  });

  it("registers neither the link nor its target", async () => {
    const scope = createAnchorScope();
    const context = makeContext({ originLinks: false, anchorScope: scope });
    await createNodeInFigma(targetNode(), context);
    await createNodeInFigma(linkNode(), context);
    expect(scope.pending.length).toBe(0);
    expect(scope.targets.size).toBe(0);
  });

  it("creates no SCROLL_TO reaction", async () => {
    const scope = createAnchorScope();
    const context = makeContext({ originLinks: false, anchorScope: scope });
    await createNodeInFigma(targetNode(), context);
    const rendered = await createNodeInFigma(linkNode(), context);
    await resolveAnchorReactions(scope);
    expect(reactionTriggers(rendered)).not.toContain("ON_CLICK");
  });

  it("still wires the anchor when the option is absent", async () => {
    const scope = createAnchorScope();
    const context = makeContext({ anchorScope: scope });
    await createNodeInFigma(targetNode(), context);
    const rendered = await createNodeInFigma(linkNode(), context);
    expect(scope.targets.size).toBe(1);
    await resolveAnchorReactions(scope);
    expect(reactionTriggers(rendered)).toContain("ON_CLICK");
  });
});
