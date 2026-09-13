import { describe, expect, it } from "vitest";

import { w2wScrollbarWidth, w2wViewportMetrics } from "./w2w";

describe("w2wViewportMetrics", () => {
  it("inherits the host DPR instead of overriding it", () => {
    // deviceScaleFactor 0 = "use the host's native DPR". Sending anything else
    // makes the page resolve srcset against a fictional density — a 0.5 here is
    // what shipped every Contentful image at its smallest candidate.
    expect(w2wViewportMetrics(1440, 1).deviceScaleFactor).toBe(0);
    expect(w2wViewportMetrics(375, 2).deviceScaleFactor).toBe(0);
  });

  it("leaves the emulated size alone at 100% zoom", () => {
    const m = w2wViewportMetrics(1440, 1);
    expect(m.width).toBe(1440);
    expect(m.screenWidth).toBe(1440);
    expect(m.height).toBe(900);
    expect(m.screenHeight).toBe(900);
  });

  it("scales the emulated size by browser zoom so the CSS viewport stays put", () => {
    const m = w2wViewportMetrics(1440, 1.5);
    expect(m.width).toBe(2160);
    expect(m.screenWidth).toBe(2160);
    expect(m.height).toBe(1350);
    expect(m.screenHeight).toBe(1350);
  });

  it("rounds fractional zoom to whole device pixels", () => {
    const m = w2wViewportMetrics(1440, 1.1);
    expect(m.width).toBe(1584);
    expect(Number.isInteger(m.width)).toBe(true);
    expect(Number.isInteger(m.height)).toBe(true);
  });

  it("adds scrollbar compensation before applying zoom", () => {
    const m = w2wViewportMetrics(1440, 1.5, 15);
    expect(m.width).toBe(Math.round((1440 + 15) * 1.5));
    expect(m.screenWidth).toBe(m.width);
  });

  it("keeps mobile emulation width-based", () => {
    expect(w2wViewportMetrics(768, 1).mobile).toBe(true);
    expect(w2wViewportMetrics(769, 1).mobile).toBe(false);
  });

  it("keeps screenOrientation consistent with the mobile flag", () => {
    // The two used to contradict each other: mobile:true was sent alongside
    // screenOrientation landscapePrimary.
    expect(w2wViewportMetrics(375, 1).screenOrientation.type).toBe("portraitPrimary");
    expect(w2wViewportMetrics(1440, 1).screenOrientation.type).toBe("landscapePrimary");
  });

  it("decides mobile from the CSS viewport, not the zoomed device width", () => {
    // 375 CSS px at 2x zoom is still a phone-width capture.
    expect(w2wViewportMetrics(375, 2).mobile).toBe(true);
    expect(w2wViewportMetrics(375, 2).screenOrientation.type).toBe("portraitPrimary");
  });
});

/**
 * Scrollbar compensation reads the layout viewport back after emulation and
 * widens the override by the difference, so the CSS viewport the page lays out
 * in is the one that was asked for.
 *
 * `Page.getLayoutMetrics` returns that width twice: `layoutViewport` (which
 * CDP documents as DEVICE pixels and marks deprecated) and `cssLayoutViewport`.
 * The subtraction is against `targetViewport`, which is CSS. Reading the
 * deprecated field made the difference negative on any Retina display and at
 * any zoom above 100% — and the `> 0` guard then skipped compensation
 * entirely, silently, which is the bug the zoom work was meant to end.
 */
describe("w2wScrollbarWidth", () => {
  it("measures against the CSS viewport, not the device one", () => {
    // 1440 CSS asked for, 15px scrollbar, Retina: the device figure is 2850.
    expect(
      w2wScrollbarWidth(1440, {
        cssLayoutViewport: { clientWidth: 1425 },
        layoutViewport: { clientWidth: 2850 },
      }),
    ).toBe(15);
  });

  it("returns 0 when the page has no scrollbar", () => {
    expect(
      w2wScrollbarWidth(1440, { cssLayoutViewport: { clientWidth: 1440 } }),
    ).toBe(0);
  });

  it("never returns a negative width", () => {
    // A layout viewport wider than asked for is not a negative scrollbar.
    expect(
      w2wScrollbarWidth(1440, { cssLayoutViewport: { clientWidth: 1460 } }),
    ).toBe(0);
  });

  it("falls back to the deprecated field when the CSS one is absent", () => {
    // Older Chrome builds only carry `layoutViewport`; better an approximate
    // compensation than none.
    expect(w2wScrollbarWidth(1440, { layoutViewport: { clientWidth: 1425 } })).toBe(15);
  });

  it("survives a response with neither field", () => {
    expect(w2wScrollbarWidth(1440, {})).toBe(0);
  });
});

