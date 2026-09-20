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

/**
 * State duplicates — the report's biggest source of false alarms.
 *
 * chroniclehq.com (user report 2026-09-20) produced eight "Hidden at capture
 * time" rows, and all eight were UI that is hidden on the live page too: three
 * hover-state label copies, four logo-rotator copies and one accordion panel.
 * `hasVisibleRowTwin` missed every one for the same structural reason — a
 * staged copy is not laid out exactly on top of the copy it replaces:
 *
 *   rotator / hover copy   staged with `transform: translateY(20px)`, so the
 *                          CAPTURED box is 20px off the visible twin's, even
 *                          though the two occupy the same layout slot
 *   accordion panel        same element, same class, different text length —
 *                          so a different height
 *   hover label            neither box nor class in common with the visible
 *                          copy, only the words
 *
 * The drop itself is unchanged; these boxes still leave the tree. What changes
 * is that we stop calling them lost content.
 */
describe("state duplicates are dropped quietly", () => {
  /** A frame at an explicit offset — the default helper pins everything to 0,0. */
  function at(
    x: number,
    y: number,
    styles: Record<string, unknown>,
    rect: [number, number],
    children: Record<string, unknown>[] = [],
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const [width, height] = rect;
    return {
      ...frame(styles, rect, children, extra),
      x,
      y,
      quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    };
  }

  /** Two siblings in one row wrapper; only the reports come back. */
  function convertSiblings(...siblings: Record<string, unknown>[]): SkippedFrame[] {
    const skipped: SkippedFrame[] = [];
    convertW2WToWireframe(
      frame({}, [1440, 600], [frame({}, [1440, 200], siblings)]) as never,
      { layoutMode: "autoLayout", onSkippedFrame: (s) => skipped.push(s) },
    );
    return skipped;
  }

  // chroniclehq `div.logos_two` ×4 — a logo rotator whose off copies are
  // staged 20px down. Untransformed, both copies share the same slot.
  it("says nothing about a copy staged with translateY over its visible twin", () => {
    expect(
      convertSiblings(
        at(145, 0, {}, [191, 80], [text("Adobe")], { classList: ["logo"] }),
        at(145, 20, { opacity: 0, transform: "matrix(1, 0, 0, 1, 0, 20)" }, [191, 80],
          [text("Meta")], { classList: ["logo"] }),
      ),
    ).toEqual([]);
  });

  // chroniclehq `div.musefeatures_item` — the closed accordion panels carry the
  // same class as the open one but hold longer copy, so they are taller.
  it("says nothing about a same-class panel of a different height", () => {
    expect(
      convertSiblings(
        at(732, 0, {}, [504, 45], [text("Generate impressive slides")],
          { classList: ["item", "open"] }),
        at(732, 0, { opacity: 0 }, [504, 67], [text("Edit with AI, on brand, every time")],
          { classList: ["item"] }),
      ),
    ).toEqual([]);
  });

  // chroniclehq `a.button_wrapper` — the hover label is a second copy of the
  // same words, 10px lower and 20px taller. No box and no class in common.
  it("says nothing about a hover copy that repeats the visible words", () => {
    expect(
      convertSiblings(
        at(1183, 19.5, {}, [111, 14], [text("Try for free")]),
        at(1183, 29.5, { opacity: 0, transform: "matrix(1, 0, 0, 1, 0, 20)" }, [111, 34],
          [text("Try for free")]),
      ),
    ).toEqual([]);
  });

  it("still reports a hidden block whose content appears nowhere else", () => {
    const skipped = convertSiblings(
      at(0, 0, {}, [600, 80], [text("Trusted by 5000+ teams")], { classList: ["intro"] }),
      at(0, 120, { opacity: 0 }, [600, 300], [text("The financial industry runs on us")],
        { classList: ["reveal"] }),
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ layerName: "div.reveal" });
  });

  // Guard for the keep/drop path: `isCrossfadeSlide` decides what is RENDERED,
  // and it must keep comparing captured boxes. Measured on the stripe.com
  // capture, teaching it untransformed boxes turns 11 reported rows into 21 —
  // slides it was keeping start being dropped instead.
  it("still keeps a crossfade slide stacked exactly on its visible twin", () => {
    const skipped: SkippedFrame[] = [];
    const tree = convertW2WToWireframe(
      frame({}, [1440, 600], [frame({}, [870, 520], [
        at(0, 0, {}, [870, 520], [text("Slide one")], { classList: ["slide", "current"] }),
        at(0, 0, { opacity: 0 }, [870, 520], [text("Slide two")], { classList: ["slide"] }),
      ])]) as never,
      { layoutMode: "autoLayout", onSkippedFrame: (s) => skipped.push(s) },
    ) as WireframeNode;

    expect(skipped).toEqual([]);
    expect(names(tree).join(" ")).toContain("Slide two");
  });
});

/**
 * Backdrops, stacked states and controls — stripe.com's remaining six rows.
 *
 * A fresh stripe.com import (2026-09-20) still listed six "Hidden at capture
 * time" rows after the state-duplicate rules landed. Checked against the
 * capture, five of the six are nothing a user lost:
 *
 *   canvas fallback   `div.hero-wave-animation__static` is the still image
 *                     behind a live `<canvas>` sibling — 337,-107 1392x975
 *                     wrapped around the canvas at 337,0 1393x761
 *   second state      `div.connect-platform-graphic__payment-screen` is the
 *                     "Thank you!" face of a payment card, stacked on the
 *                     visible "Order Summary" face at the same x/y/width and
 *                     a slightly different height (277 vs 257/264/260)
 *   control           `button.platform-graphic__replay-button`, 40x40, no text
 *
 * The unifying idea for the first two: a transparent box that a VISIBLE
 * sibling sits inside is not a hole. Siblings only overlap when one of them is
 * out of flow, so the test fires on backdrops and stacked faces and on very
 * little else.
 */
describe("backdrops and controls are dropped quietly", () => {
  function at(
    x: number, y: number,
    styles: Record<string, unknown>,
    rect: [number, number],
    children: Record<string, unknown>[] = [],
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const [width, height] = rect;
    return {
      ...frame(styles, rect, children, extra),
      x, y,
      quad: [x, y, x + width, y, x + width, y + height, x, y + height],
    };
  }

  function convertSiblings(...siblings: Record<string, unknown>[]): SkippedFrame[] {
    const skipped: SkippedFrame[] = [];
    convertW2WToWireframe(
      frame({}, [1440, 1200], [frame({}, [1440, 1000], siblings)]) as never,
      { layoutMode: "autoLayout", onSkippedFrame: (s) => skipped.push(s) },
    );
    return skipped;
  }

  const icon = { type: "SVG", x: 0, y: 0, width: 16, height: 16,
    quad: [0, 0, 16, 0, 16, 16, 0, 16], svg: "<svg/>" };

  // stripe `hero-wave-animation__static` behind `hero-wave-animation__canvas`.
  it("says nothing about a still image wrapped around a visible canvas", () => {
    expect(
      convertSiblings(
        at(337, 0, {}, [1393, 761], [text("live canvas")], { tag: "canvas" }),
        at(337, -107, { opacity: 0, position: "absolute" }, [1392, 975], [], {
          classList: ["static"], $url: "https://example.com/wave.png",
        }),
      ),
    ).toEqual([]);
  });

  // stripe `connect-platform-graphic__payment-screen` — same slot, taller.
  it("says nothing about a second face stacked on the visible one", () => {
    expect(
      convertSiblings(
        at(93, 2552, {}, [260, 257], [text("Order Summary Single class £20.00")],
          { classList: ["screen", "screen--summary"] }),
        at(93, 2552, { opacity: 0, position: "absolute" }, [260, 277],
          [text("Thank you! Your payment was successful.")],
          { classList: ["screen", "screen--success"] }),
      ),
    ).toEqual([]);
  });

  it("still reports a block that merely overlaps a small visible icon", () => {
    // Covers 100% of the icon but only ~1% of itself — a real hole around it.
    const skipped = convertSiblings(
      at(0, 0, {}, [24, 24], [icon], { classList: ["badge"] }),
      at(0, 0, { opacity: 0, position: "absolute" }, [600, 400],
        [text("The financial industry runs on us")], { classList: ["reveal"] }),
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ layerName: "div.reveal" });
  });

  it("still reports a block that only sits next to a visible sibling", () => {
    const skipped = convertSiblings(
      at(0, 0, {}, [600, 300], [text("Trusted by 5000+ teams")], { classList: ["intro"] }),
      at(0, 320, { opacity: 0 }, [600, 300], [text("Built for serious business")],
        { classList: ["reveal"] }),
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ layerName: "div.reveal" });
  });

  // stripe `platform-graphic__replay-button`: its icon is the only reason
  // `subtreeCarriesContent` passes it, and 40x40 just clears REPORTABLE_MIN.
  it("says nothing about a small icon-only button", () => {
    expect(
      convertSiblings(
        at(0, 0, {}, [1200, 600], [text("dashboard")], { classList: ["graphic"] }),
        at(1288, 440, { opacity: 0, position: "absolute" }, [40, 40], [icon],
          { tag: "button", classList: ["replay"] }),
      ),
    ).toEqual([]);
  });

  it("still reports a small button that carries words", () => {
    const skipped = convertSiblings(
      at(0, 0, {}, [1200, 600], [text("dashboard")], { classList: ["graphic"] }),
      at(1288, 440, { opacity: 0, position: "absolute" }, [44, 40], [text("Buy")],
        { tag: "button", classList: ["cta"] }),
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ layerName: "button.cta" });
  });

  it("still reports a large icon-only button — too big to be an affordance", () => {
    const skipped = convertSiblings(
      at(0, 0, {}, [300, 100], [text("heading")], { classList: ["intro"] }),
      at(0, 200, { opacity: 0, position: "absolute" }, [200, 120], [icon],
        { tag: "button", classList: ["tile"] }),
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ layerName: "button.tile" });
  });
});
