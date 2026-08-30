/**
 * The merged node must RENDER identically to the runs it replaced.
 *
 * `text-run-merge.test.ts` pins the tree shape; this file pins the only thing
 * that actually matters — the glyphs. It renders the original runs one by one,
 * renders the merged node, and asserts that every character and every per-range
 * call (fills, fontName, fontSize, hyperlink) lands on the same glyphs. A merge
 * that shifted a range by one character, or invented a separator space, fails
 * here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WireframeNode, RenderContext } from "../types";

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
    fontSize: 16,
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

let mockNode: ReturnType<typeof createMockTextNode>;

beforeEach(() => {
  mockNode = createMockTextNode();
  (globalThis as Record<string, unknown>).figma = {
    createText: vi.fn(() => mockNode),
    loadFontAsync: vi.fn(async () => undefined),
  };
});

import { createTextNode } from "../rendering/text";
import { mergeInlineTextRuns } from "../rendering/textRunMerge";

let _id = 0;

function run(
  value: string,
  x: number,
  width: number,
  extra: Partial<WireframeNode> = {},
): WireframeNode {
  return {
    id: `t${_id++}`,
    name: value.slice(0, 30),
    type: "text",
    tag: "span",
    x, y: 0, width, height: 18,
    layoutMode: "NONE",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    backgroundColor: null,
    backgroundGradient: null,
    textColor: "#111111",
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: value,
    fontSize: 16,
    fontWeight: 400,
    fontFamily: "Inter",
    textAlign: "left",
    lineHeight: 24,
    letterSpacing: 0,
    browserLineCount: 1,
    isPlaceholder: false,
    children: [],
    ...extra,
  } as WireframeNode;
}

function parentOf(children: WireframeNode[]): WireframeNode {
  return { ...run("", 0, 400), type: "frame", tag: "div", textContent: "", children };
}

function context(): RenderContext {
  return {
    pluginColors: {
      text: "#333333", primary: "#000", secondary: "#888",
      background: "#ffffff", surface: "#f5f5f5", accent: "#3b82f6", border: "#e0e0e0",
    },
    fontFamily: "Inter",
    variableMode: "direct",
    layoutMode: "autoLayout",
    cssVariables: [],
    colorStyleMap: new Map(),
    variableValueMap: new Map(),
    colorMode: "website",
    fontMode: "website",
    textMode: "original",
  } as unknown as RenderContext;
}

/** Every [start, end) the given range setter was called with, plus its value. */
function ranges(fn: { mock: { calls: unknown[][] } }): Array<[number, number, unknown]> {
  return fn.mock.calls.map((c) => [c[0] as number, c[1] as number, c[2]]);
}

describe("a merged run renders the same glyphs", () => {
  it("reproduces bold + link + normal exactly, in one node", async () => {
    // "The <b>fast</b> way to <a>import</a> a page" — five runs the browser
    // painted on one line, four of the gaps carrying a single space.
    const runs = [
      run("The", 0, 26),
      run("fast", 30, 30, { fontWeight: 700, tag: "b" }),
      run("way to", 64, 48),
      run("import", 116, 44, { tag: "a", href: "https://w2w.design", textColor: "#0000ee" }),
      run("a page", 164, 46),
    ];
    const parent = parentOf(runs.map((r) => ({ ...r })));

    expect(mergeInlineTextRuns(parent)).toBe(true);
    expect(parent.children).toHaveLength(1);
    const merged = parent.children[0];

    await createTextNode(merged, "Inter", context());

    // 1. The characters are the runs, separated by exactly one space each.
    expect(mockNode.characters).toBe("The fast way to import a page");

    // 2. Each run's own attributes land on its own glyphs — and nowhere else.
    const at = (needle: string): [number, number] => {
      const start = mockNode.characters.indexOf(needle);
      return [start, start + needle.length];
    };

    const bold = ranges(mockNode.setRangeFontName).find(
      (r) => (r[2] as { style: string }).style === "Bold",
    );
    expect(bold?.slice(0, 2)).toEqual(at("fast"));

    const link = ranges(mockNode.setRangeHyperlink)[0];
    expect(link.slice(0, 2)).toEqual(at("import"));
    expect((link[2] as { value: string }).value).toBe("https://w2w.design");

    // 3. No range may start or end inside a neighbour's glyphs.
    for (const [start, end] of ranges(mockNode.setRangeFills)) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(mockNode.characters.length);
      expect(end).toBeGreaterThan(start);
    }
  });

  it("renders touching runs with no space between them", async () => {
    // A price split across two spans: "$16" + "/mo", painted flush.
    const parent = parentOf([
      run("$16", 0, 28, { fontWeight: 700 }),
      run("/mo", 28, 24),
    ]);

    mergeInlineTextRuns(parent);
    await createTextNode(parent.children[0], "Inter", context());

    expect(mockNode.characters).toBe("$16/mo");
    const bold = ranges(mockNode.setRangeFontName).find(
      (r) => (r[2] as { style: string }).style === "Bold",
    );
    expect(bold?.slice(0, 2)).toEqual([0, 3]);
  });

  it("gives an unmerged run the identical rendering it had before", async () => {
    // Control: the same characters, rendered as ONE original run, produce the
    // same string. If merging changed how text is emitted, this diverges.
    const single = run("The fast way to import a page", 0, 200);
    await createTextNode(single, "Inter", context());
    expect(mockNode.characters).toBe("The fast way to import a page");
  });
});
