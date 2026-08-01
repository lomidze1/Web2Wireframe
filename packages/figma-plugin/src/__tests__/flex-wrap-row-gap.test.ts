/**
 * Cross-axis gap on wrapped flex rows.
 *
 * web2wireframe.design hero: `._actions { display:flex; flex-wrap:wrap;
 * gap:.85rem }` puts the feature list on line 1 and the CTA button on line 2,
 * 13.6px below it. Figma showed Gap 13.6 / **0** — the button sat flush
 * against the list.
 *
 * Two causes, both here:
 *   1. the converter read only the `gap` shorthand, so the row gap never left
 *      CSS (`rowGap` was consulted for grid only);
 *   2. `counterAxisSpacing` — the Figma property for the distance between
 *      wrapped tracks — was never assigned, so it stayed at its 0 default.
 *
 * Parsing the shorthand with `parseFloat` is wrong for a second reason: for
 * `gap: 10px 20px` (row column) it yields the ROW gap and hands it to a
 * horizontal frame's main axis. Each axis now reads its own longhand.
 */
import { describe, it, expect, vi } from "vitest";

function createMockFrameNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    type: "FRAME",
    name: "",
    x: 0, y: 0, width: 100, height: 100,
    fills: [], strokes: [], children: [] as unknown[],
    layoutMode: "NONE",
    layoutWrap: "NO_WRAP",
    itemSpacing: 0,
    counterAxisSpacing: 0,
    _pluginData: {} as Record<string, string>,
    setPluginData(key: string, value: string) {
      (node._pluginData as Record<string, string>)[key] = value;
    },
    getPluginData(key: string) {
      return (node._pluginData as Record<string, string>)[key] ?? "";
    },
    resize(w: number, h: number) { node.width = w; node.height = h; },
    appendChild(child: unknown) { (node.children as unknown[]).push(child); },
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

type Styles = Record<string, string>;

function frame(styles: Styles, children: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    type: "FRAME",
    tag: "div",
    classList: [],
    attr: {},
    x: 0, y: 0, width: 1180, height: 150.94,
    quad: [0, 0, 1180, 0, 1180, 150.94, 0, 150.94],
    styles,
    children,
    ...extra,
  };
}

/** `._actions` as the content script really captures it. */
const WRAPPED_ROW: Styles = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: "13.6px",
  rowGap: "13.6px",
  columnGap: "13.6px",
  justifyContent: "center",
  alignItems: "center",
};

describe("wrapped flex rows keep their cross-axis gap", () => {
  it("carries the row gap through as counterAxisSpacing", () => {
    const out = convertW2WToWireframe(frame(WRAPPED_ROW) as never, { layoutMode: "autoLayout" });

    expect(out.layoutMode).toBe("HORIZONTAL");
    expect(out.flexWrap).toBe("wrap");
    expect(out.itemSpacing).toBe(13.6);
    expect(out.counterAxisSpacing).toBe(13.6);
  });

  it("takes the main-axis gap from the matching longhand, not the shorthand", () => {
    // `gap: 10px 20px` → row 10, column 20. A horizontal row advances by the
    // COLUMN gap; the shorthand's leading number is the row gap.
    const out = convertW2WToWireframe(
      frame({ ...WRAPPED_ROW, gap: "10px 20px", rowGap: "10px", columnGap: "20px" }) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.itemSpacing).toBe(20);
    expect(out.counterAxisSpacing).toBe(10);
  });

  it("mirrors the axes for a column", () => {
    const out = convertW2WToWireframe(
      frame({
        ...WRAPPED_ROW,
        flexDirection: "column",
        flexWrap: "nowrap",
        gap: "10px 20px",
        rowGap: "10px",
        columnGap: "20px",
      }) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.layoutMode).toBe("VERTICAL");
    expect(out.itemSpacing).toBe(10);
  });

  it("treats the `normal` default as no gap", () => {
    const out = convertW2WToWireframe(
      frame({ ...WRAPPED_ROW, gap: "normal", rowGap: "normal", columnGap: "normal" }) as never,
      { layoutMode: "autoLayout" },
    );

    expect(out.itemSpacing).toBe(0);
    expect(out.counterAxisSpacing).toBeUndefined();
  });

  it("absolute mode keeps both spacings off", () => {
    const out = convertW2WToWireframe(frame(WRAPPED_ROW) as never, { layoutMode: "absolute" });

    expect(out.itemSpacing).toBe(0);
    expect(out.counterAxisSpacing).toBeUndefined();
  });

  it("falls back to the shorthand when longhands are absent", () => {
    const { rowGap: _r, columnGap: _c, ...noLonghands } = WRAPPED_ROW;
    const out = convertW2WToWireframe(frame(noLonghands) as never, { layoutMode: "autoLayout" });

    expect(out.itemSpacing).toBe(13.6);
    expect(out.counterAxisSpacing).toBe(13.6);
  });
});

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

describe("wrapped flex rows in Figma (nodes.ts)", () => {
  it("sets counterAxisSpacing alongside layoutWrap", async () => {
    const wf = convertW2WToWireframe(frame(WRAPPED_ROW) as never, { layoutMode: "autoLayout" });

    const rendered = (await createNodeInFigma(wf, mockContext(), 0)) as unknown as {
      layoutMode: string;
      layoutWrap: string;
      itemSpacing: number;
      counterAxisSpacing: number;
    } | null;

    expect(rendered).not.toBeNull();
    expect(rendered!.layoutMode).toBe("HORIZONTAL");
    expect(rendered!.layoutWrap).toBe("WRAP");
    expect(rendered!.itemSpacing).toBe(13.6);
    expect(rendered!.counterAxisSpacing).toBe(13.6);
  });

  it("leaves counterAxisSpacing alone on a non-wrapping row", async () => {
    const wf = convertW2WToWireframe(
      frame({ ...WRAPPED_ROW, flexWrap: "nowrap" }) as never,
      { layoutMode: "autoLayout" },
    );

    const rendered = (await createNodeInFigma(wf, mockContext(), 0)) as unknown as {
      layoutWrap: string;
      counterAxisSpacing: number;
    } | null;

    expect(rendered!.layoutWrap).toBe("NO_WRAP");
    expect(rendered!.counterAxisSpacing).toBe(0);
  });
});
