/**
 * A frame captured at `opacity: 0` loses its whole subtree — the rule exists
 * for apple.com's flyout menus and hover cards, which must not paint over the
 * page. But scroll-reveal content sits at `opacity: 0` too until an
 * IntersectionObserver flips it, and when a capture races that observer the
 * same rule silently deletes real content: glinc.io lost 57% of its nodes,
 * dub.co lost the dashboard mock under its hero.
 *
 * Nothing in the captured styles separates the two cases — `transition`,
 * `animation` and `willChange` are not captured at all, and `position` does
 * not correlate (measured across 20 sites). So the skip stays, and the loss
 * stops being silent instead: the import report lists what went.
 *
 * Only content-bearing boxes are reported. A hidden spacer or a 20×10 trigger
 * button is noise, and `visibility: hidden` is a genuine "not shown" that no
 * scroll can undo.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("figma", { createFrame: vi.fn(), mixed: Symbol("figma.mixed") });

import { convertW2WToWireframe } from "../rendering/css-converter";
import type { SkippedFrame, WireframeNode } from "../types";

function frame(
  styles: Record<string, unknown>,
  rect: [number, number],
  children: Record<string, unknown>[] = [],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const [width, height] = rect;
  return {
    type: "FRAME",
    x: 0,
    y: 0,
    width,
    height,
    quad: [0, 0, width, 0, width, height, 0, height],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block", ...styles },
    children,
    ...extra,
  };
}

function text(value: string): Record<string, unknown> {
  return {
    type: "TEXT",
    value,
    x: 0,
    y: 0,
    width: 200,
    height: 20,
    font: { family: "Inter", size: 16, weight: 400 },
  };
}

/** Convert a page whose only section is `child`, collecting the skip reports. */
function convertWith(
  child: Record<string, unknown>,
  options: Record<string, unknown> = {},
): { tree: WireframeNode; skipped: SkippedFrame[] } {
  const skipped: SkippedFrame[] = [];
  const tree = convertW2WToWireframe(
    frame({}, [1000, 600], [frame({}, [1000, 600], [child])]) as never,
    { layoutMode: "autoLayout", onSkippedFrame: (s) => skipped.push(s), ...options },
  );
  return { tree, skipped };
}

/** Every layer name in the converted tree. */
function names(node: WireframeNode): string[] {
  return [node.name, ...node.children.flatMap(names)];
}

describe("opacity:0 content is skipped but reported", () => {
  const revealWrapper = frame(
    { opacity: 0 },
    [800, 300],
    [frame({}, [800, 300], [text("Plugins, crafted with care.")])],
    { classList: ["reveal"] },
  );

  it("still removes the subtree from the tree", () => {
    const { tree } = convertWith(revealWrapper);
    expect(names(tree).join(" ")).not.toContain("crafted with care");
  });

  it("reports it once, with the layer name and the size of what was lost", () => {
    const { skipped } = convertWith(revealWrapper);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      layerName: "div.reveal",
      width: 800,
      height: 300,
    });
    // wrapper + inner frame + text
    expect(skipped[0].nodes).toBe(3);
  });

  it("says nothing about a hidden box that carries no content", () => {
    const { skipped } = convertWith(frame({ opacity: 0 }, [800, 300]));
    expect(skipped).toEqual([]);
  });

  it("says nothing about a hidden box too small to be content", () => {
    const { skipped } = convertWith(
      frame({ opacity: 0 }, [30, 20], [text("×")], { classList: ["close"] }),
    );
    expect(skipped).toEqual([]);
  });

  it("says nothing about visibility:hidden — no scroll brings that back", () => {
    const { skipped } = convertWith(
      frame({ visibility: "hidden" }, [800, 300], [text("Screen reader only")]),
    );
    expect(skipped).toEqual([]);
  });

  // notion.com (user report 2026-09-17): its nav dropdown menus are
  // `opacity: 0` AND `visibility: hidden` — closed menus, not lost content —
  // and were reported as three "Hidden at capture time" rows.
  it("says nothing about a closed menu that is also visibility:hidden", () => {
    const { skipped } = convertWith(
      frame({ opacity: 0, visibility: "hidden" }, [826, 256], [text("Product  Docs  Pricing")]),
    );
    expect(skipped).toEqual([]);
  });

  // notion.com: a marquee's transparent measuring twin sits on the same row as
  // the visible marquee that shows the same content — nothing is lost.
  it("says nothing about a transparent twin of a visible row", () => {
    const placeholder = frame({ opacity: 0 }, [1440, 24], [text("G2's #1 knowledge base")], { classList: ["placeholder"] });
    const marquee = frame({}, [2864, 24], [text("G2's #1 knowledge base")], { classList: ["marquee"] });
    const skipped: SkippedFrame[] = [];
    convertW2WToWireframe(
      frame({}, [1440, 600], [frame({}, [1440, 24], [placeholder, marquee])]) as never,
      { layoutMode: "autoLayout", onSkippedFrame: (s) => skipped.push(s) },
    );
    expect(skipped).toEqual([]);
  });

  it("says nothing in variants mode, where the subtree is kept for hover", () => {
    const { skipped } = convertWith(revealWrapper, { interactionMode: "variants" });
    expect(skipped).toEqual([]);
  });

  it("is optional — omitting the callback changes nothing", () => {
    expect(() =>
      convertW2WToWireframe(
        frame({}, [1000, 600], [revealWrapper]) as never,
        { layoutMode: "autoLayout" },
      ),
    ).not.toThrow();
  });
});

/**
 * `subtreeCarriesContent` has three ways to say yes — text, an image `$url`,
 * and an SVG node — and only the text one was exercised. dub.co's lost
 * dashboard mock, the case the whole report was written for, is an IMAGE: it
 * would have gone unreported while every test stayed green.
 */
describe("what counts as content worth reporting", () => {
  it("reports a hidden box whose only content is an image", () => {
    const { skipped } = convertWith(
      frame({ opacity: 0 }, [900, 500], [
        frame({}, [900, 500], [], {
          tag: "img",
          classList: ["hero-mock"],
          $url: "https://dub.co/_static/dashboard.png",
        }),
      ], { classList: ["reveal"] }),
    );

    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ layerName: "div.reveal", width: 900, height: 500 });
  });

  it("reports a hidden box whose only content is an SVG", () => {
    const { skipped } = convertWith(
      frame({ opacity: 0 }, [400, 200], [
        { type: "SVG", x: 0, y: 0, width: 400, height: 200, svg: "<svg/>" },
      ], { classList: ["chart"] }),
    );

    expect(skipped).toHaveLength(1);
    expect(skipped[0].layerName).toBe("div.chart");
  });

  it("says nothing about a hidden box of empty frames", () => {
    // The negative control for the two above: nesting alone is not content, or
    // every decorative wrapper on the page would file a report.
    const { skipped } = convertWith(
      frame({ opacity: 0 }, [800, 300], [frame({}, [800, 300], [frame({}, [400, 100])])]),
    );

    expect(skipped).toEqual([]);
  });

  it("counts an image-only subtree's nodes", () => {
    const { skipped } = convertWith(
      frame({ opacity: 0 }, [900, 500], [
        frame({}, [900, 500], [], { tag: "img", $url: "https://example.com/a.png" }),
        frame({}, [900, 100], []),
      ], { classList: ["reveal"] }),
    );

    // wrapper + img + sibling frame
    expect(skipped[0].nodes).toBe(3);
  });
});
