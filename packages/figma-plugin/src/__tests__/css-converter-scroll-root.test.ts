/**
 * Scroll-root height expansion.
 *
 * Sites like paco.me use `html, body { height: 100% }` + `overflow-y: scroll`,
 * so the captured html/body geometry equals the viewport (e.g. 900px) while the
 * real content lives in a taller child (e.g. div#__next at 1424px). Without
 * intervention the root frame is sized to 900px and clips the rest of the page.
 *
 * The converter must expand scroll-root nodes (html / body / scrollingElement)
 * to their content height and stop them from clipping.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe, maxDescendantBottom } from "../rendering/css-converter";

// ---------------------------------------------------------------------------
// Fixture helpers (minimal W2WFrameNode shape)
// ---------------------------------------------------------------------------

interface RawNode {
  type: "FRAME";
  x: number;
  y: number;
  width: number;
  height: number;
  quad: number[];
  tag: string;
  classList: string[];
  attr: Record<string, unknown>;
  styles: Record<string, string | number | undefined>;
  children: RawNode[];
  isScrollingElt?: boolean;
}

function frame(
  tag: string,
  geom: { x?: number; y?: number; width: number; height: number },
  styles: Record<string, string | number | undefined>,
  children: RawNode[] = [],
  extra: Partial<RawNode> = {},
): RawNode {
  const x = geom.x ?? 0;
  const y = geom.y ?? 0;
  return {
    type: "FRAME",
    x,
    y,
    width: geom.width,
    height: geom.height,
    quad: [x, y, x + geom.width, y, x + geom.width, y + geom.height, x, y + geom.height],
    tag,
    classList: [],
    attr: {},
    styles,
    children,
    ...extra,
  };
}

/** paco.me shape: html(900) → body(900) → div#__next(1424). */
function pacoTree(): RawNode {
  const next = frame(
    "div",
    { y: 0, width: 1440, height: 1424 },
    { display: "block", height: "1424px" },
  );
  const body = frame(
    "body",
    { y: 0, width: 1440, height: 900 },
    { height: "100%", overflowY: "scroll", display: "block" },
    [next],
  );
  return frame(
    "html",
    { y: 0, width: 1440, height: 900 },
    { height: "100%", display: "block" },
    [body],
    { isScrollingElt: true },
  );
}

// ---------------------------------------------------------------------------
// maxDescendantBottom
// ---------------------------------------------------------------------------

describe("maxDescendantBottom", () => {
  it("finds a deep descendant taller than its viewport-constrained ancestors", () => {
    // html(900) and body(900) are shorter than div#__next(1424)
    expect(maxDescendantBottom(pacoTree() as never)).toBe(1424);
  });

  it("accounts for child vertical offset (y) when computing bottom edge", () => {
    const child = frame("section", { y: 400, width: 100, height: 300 }, {}); // bottom 700
    const root = frame("div", { y: 0, width: 100, height: 200 }, {}, [child]);
    expect(maxDescendantBottom(root as never)).toBe(700);
  });

  it("returns the node's own height when no child is taller", () => {
    const child = frame("span", { y: 0, width: 100, height: 50 }, {});
    const root = frame("div", { y: 0, width: 100, height: 300 }, {}, [child]);
    expect(maxDescendantBottom(root as never)).toBe(300);
  });

  /**
   * chroniclehq.com: the page came out 286px taller than the site.
   *
   * Its footer is `overflow: hidden` and 939px tall, and inside it a Lottie
   * wrapper is 783px tall in a 410px box, reaching 285px past the end of the
   * page. The browser never scrolls for it — the footer clips it — but the
   * walk counted it anyway and the root frame grew to fit, leaving a dead band
   * under the footer.
   *
   * A clipping ancestor's children cannot extend the scrollable page, so the
   * walk stops there and keeps that ancestor's own bottom edge.
   */
  describe("clipped subtrees", () => {
    it("stops at an overflow:hidden ancestor instead of counting what it clips", () => {
      const lottie = frame("div", { y: 5655, width: 1212, height: 783 }, {});
      const inner = frame("div", { y: 5655, width: 1212, height: 410 }, {}, [lottie]);
      const footer = frame(
        "footer",
        { y: 5215, width: 1440, height: 939 },
        { overflow: "hidden", position: "relative" },
        [inner],
      );
      const app = frame("div", { y: 0, width: 1440, height: 6153 }, {}, [footer]);
      const body = frame("body", { y: 0, width: 1440, height: 6153 }, { overflow: "auto" }, [app]);
      const html = frame("html", { y: 0, width: 1440, height: 6153 }, {}, [body]);

      // The footer's own bottom (5215 + 939), not the Lottie's 6438.
      expect(maxDescendantBottom(html as never)).toBe(6154);
    });

    it("keeps walking through a scroll root that declares its own overflow", () => {
      // paco.me's body is `overflow-y: scroll` — it scrolls the page rather
      // than clipping it, so the taller child behind it must still be found.
      expect(maxDescendantBottom(pacoTree() as never)).toBe(1424);
    });

    it("keeps walking through a scrolling element marked by the capture", () => {
      const tall = frame("div", { y: 0, width: 100, height: 1200 }, {});
      const scroller = frame(
        "div",
        { y: 0, width: 100, height: 400 },
        { overflow: "auto" },
        [tall],
        { isScrollingElt: true },
      );
      const root = frame("html", { y: 0, width: 100, height: 400 }, {}, [scroller]);
      expect(maxDescendantBottom(root as never)).toBe(1200);
    });

    it("ignores a horizontal-only scroller — it clips nothing vertically", () => {
      const tall = frame("div", { y: 0, width: 3000, height: 900 }, {});
      const strip = frame(
        "div",
        { y: 0, width: 1440, height: 300 },
        { overflowX: "auto", overflowY: "visible" },
        [tall],
      );
      const root = frame("html", { y: 0, width: 1440, height: 400 }, {}, [strip]);
      expect(maxDescendantBottom(root as never)).toBe(900);
    });

    it("still counts the clipping node itself when it is the tallest thing", () => {
      const clipped = frame(
        "section",
        { y: 200, width: 100, height: 800 },
        { overflow: "hidden" },
        [frame("div", { y: 200, width: 100, height: 5000 }, {})],
      );
      const root = frame("html", { y: 0, width: 100, height: 400 }, {}, [clipped]);
      expect(maxDescendantBottom(root as never)).toBe(1000);
    });
  });
});

// ---------------------------------------------------------------------------
// convertW2WToWireframe — scroll-root expansion + no clip
// ---------------------------------------------------------------------------

const CLIPPING = new Set(["hidden", "scroll", "auto"]);

describe("convertW2WToWireframe — scroll-root expansion", () => {
  for (const layoutMode of ["absolute", "autoLayout"] as const) {
    it(`expands the root html height to content (${layoutMode})`, () => {
      const root = convertW2WToWireframe(pacoTree() as never, { layoutMode });
      expect(root.height).toBe(1424);
    });

    it(`does not clip the scroll-root nodes (${layoutMode})`, () => {
      const root = convertW2WToWireframe(pacoTree() as never, { layoutMode });
      expect(CLIPPING.has(String(root.overflow))).toBe(false);
      const body = root.children?.[0];
      expect(body).toBeDefined();
      expect(body!.height).toBe(1424);
      expect(CLIPPING.has(String(body!.overflow))).toBe(false);
    });
  }

  it("leaves a non-scroll-root overflow:hidden container untouched (still clips, height preserved)", () => {
    // A short page: html(600) → body(600) → div.box(overflow:hidden, 200) with a
    // taller child that the box legitimately clips.
    const inner = frame("div", { y: 0, width: 100, height: 500 }, {});
    const box = frame(
      "div",
      { y: 0, width: 100, height: 200 },
      { overflow: "hidden", display: "block" },
      [inner],
    );
    const body = frame("body", { y: 0, width: 800, height: 600 }, { height: "100%" }, [box]);
    const html = frame("html", { y: 0, width: 800, height: 600 }, { height: "100%" }, [body]);

    const root = convertW2WToWireframe(html as never, { layoutMode: "absolute" });
    const convertedBody = root.children?.[0];
    const convertedBox = convertedBody?.children?.[0];
    expect(convertedBox).toBeDefined();
    // The inner overflow:hidden box keeps its CSS height and still clips.
    expect(convertedBox!.height).toBe(200);
    expect(convertedBox!.overflow).toBe("hidden");
  });
});

// ---------------------------------------------------------------------------
// Full-bleed horizontal scroller — drop spacer pseudo-elements
// ---------------------------------------------------------------------------
//
// paco.me's Building/Projects/Writing band lives in a `[basics-scroller]` that
// escapes its 640px article via the `width:100vw; left:50%; margin-left:-50vw`
// breakout and scrolls horizontally (`overflow-x: auto`). Its `::before`/
// `::after` are pure spacer pseudos (content:"") sized to re-center the content
// inside the full-width strip. A wireframe doesn't scroll, and Figma auto-layout
// can't reproduce a child wider than its parent, so the spacers lose their
// anchor and crush the real content. The converter must drop them.

interface ConvertedNode {
  className?: string;
  tag?: string;
  children?: ConvertedNode[];
}

function findNode(
  node: ConvertedNode,
  pred: (n: ConvertedNode) => boolean,
): ConvertedNode | null {
  if (pred(node)) return node;
  for (const c of node.children ?? []) {
    const hit = findNode(c, pred);
    if (hit) return hit;
  }
  return null;
}

function hasPseudoSpacer(root: ConvertedNode): boolean {
  return !!findNode(
    root,
    (n) =>
      typeof n.className === "string" &&
      (n.className.includes("__w2w-pseudo-before") ||
        n.className.includes("__w2w-pseudo-after")),
  );
}

/** paco.me band: article(640) → scroller(1440, overflow-x:auto) → [::before, .stack(3 cols), ::after]. */
function fullBleedScrollerTree(): RawNode {
  const spacerBefore = frame(
    "span",
    { x: 0, width: 376, height: 340 },
    { display: "block" },
    [],
    { classList: ["__w2w-pseudo-before"] },
  );
  const spacerAfter = frame(
    "span",
    { x: 1060, width: 376, height: 340 },
    { display: "block" },
    [],
    { classList: ["__w2w-pseudo-after"] },
  );
  const col = (x: number) =>
    frame("div", { x, width: 192, height: 340 }, { display: "block" }, [], {
      classList: ["column"],
    });
  const stack = frame(
    "div",
    { x: 400, width: 640, height: 340 },
    { display: "flex" },
    [col(400), col(620), col(848)],
    { classList: ["stack"] },
  );
  const scroller = frame(
    "div",
    { x: 0, width: 1440, height: 380 },
    { display: "flex", overflowX: "auto" },
    [spacerBefore, stack, spacerAfter],
  );
  const article = frame(
    "article",
    { x: 400, width: 640, height: 380 },
    { display: "block" },
    [scroller],
  );
  const body = frame("body", { width: 1440, height: 900 }, { height: "100%" }, [article]);
  return frame("html", { width: 1440, height: 900 }, { height: "100%" }, [body], {
    isScrollingElt: true,
  });
}

describe("convertW2WToWireframe — full-bleed horizontal scroller", () => {
  for (const layoutMode of ["absolute", "autoLayout"] as const) {
    it(`drops the ::before/::after spacer pseudos of a full-bleed scroller (${layoutMode})`, () => {
      const root = convertW2WToWireframe(fullBleedScrollerTree() as never, {
        layoutMode,
      });
      // The real content (.stack) survives…
      expect(
        findNode(root, (n) => !!n.className?.includes("stack")),
      ).toBeTruthy();
      // …but the pure scroll spacers are gone.
      expect(hasPseudoSpacer(root)).toBe(false);
    });
  }

  it("keeps a decorative pseudo when the parent is NOT a full-bleed scroller", () => {
    // Apple-footer-style pipe separator: in-flow ::before in a normal container
    // (overflow visible, same width as parent). Must NOT be dropped.
    const pseudo = frame(
      "span",
      { x: 0, width: 8, height: 16 },
      { display: "inline-block", backgroundColor: "rgb(0,0,0)" },
      [],
      { classList: ["__w2w-pseudo-before"] },
    );
    const container = frame(
      "div",
      { x: 0, width: 640, height: 40 },
      { display: "flex" },
      [pseudo],
    );
    const body = frame("body", { width: 640, height: 200 }, { height: "100%" }, [container]);
    const html = frame("html", { width: 640, height: 200 }, { height: "100%" }, [body], {
      isScrollingElt: true,
    });
    const root = convertW2WToWireframe(html as never, { layoutMode: "autoLayout" });
    expect(hasPseudoSpacer(root)).toBe(true);
  });
});
