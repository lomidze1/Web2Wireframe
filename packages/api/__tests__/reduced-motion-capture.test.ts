/**
 * Sites animate content in on scroll by writing a progress variable that the
 * CSS reads — and that variable follows the scroll position *both ways*.
 * `autoScrollPage` ends with `window.scrollTo(0, 0)`, which rewinds every such
 * animation right back to its starting frame before we extract.
 *
 * Measured on stripe.com (headless Chromium, 1440x900, our own content-script
 * bundle): `.billing-plan-graphic__bar` x31, `transform: scaleY(0)`, every bar
 * 4.27 x 0 — dropped downstream by treeSimplify's DEGENERATE test, leaving an
 * empty 306x149 box where the chart belongs. Scroll the section into view and
 * the same bars measure 7, 12, 23, 33, 47, 67 ... px.
 *
 * Emulating `prefers-reduced-motion: reduce` makes the site's own script jump
 * to the finished state at page top, before any scrolling, and it never
 * rewinds: all 31 bars land on 100% of their target height. Cost measured on
 * the same page: 52 of 2916 elements differ from a normal capture, and the
 * element count is identical.
 *
 * What these tests guard is the contract a capture depends on: the feature is
 * asked for exactly, it is asked for BEFORE navigation (a site reads
 * `matchMedia` when it initialises), and a page that cannot emulate is still
 * worth capturing.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { emulateReducedMotion } from "../src/lib/cdp/w2w-extraction.js";

describe("emulateReducedMotion", () => {
  it("asks for exactly the reduced-motion feature", async () => {
    const emulateMediaFeatures = vi.fn().mockResolvedValue(undefined);
    await emulateReducedMotion({ emulateMediaFeatures });

    expect(emulateMediaFeatures).toHaveBeenCalledTimes(1);
    expect(emulateMediaFeatures.mock.calls[0][0]).toEqual([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
  });

  it("never throws — a page that will not emulate is still worth capturing", async () => {
    const emulateMediaFeatures = vi.fn().mockRejectedValue(new Error("Target closed"));
    await expect(
      emulateReducedMotion({ emulateMediaFeatures }),
    ).resolves.toBeUndefined();
  });
});

describe("htmlExtractor W2W paths", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/lib/htmlExtractor.ts", import.meta.url)),
    "utf8",
  );

  /** Body of one exported function, up to the next top-level export. */
  const bodyOf = (name: string): string => {
    const start = source.indexOf(`export async function ${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  };

  for (const [fn, navigate] of [
    ["renderWebsiteW2W", "page.goto("],
    ["renderHTMLContentW2W", "page.setContent("],
  ] as const) {
    it(`${fn} emulates reduced motion before ${navigate}`, () => {
      const body = bodyOf(fn);
      const emulate = body.indexOf("emulateReducedMotion(page)");
      const nav = body.indexOf(navigate);

      expect(emulate, "emulateReducedMotion(page) is missing").toBeGreaterThan(-1);
      expect(nav, `${navigate} is missing`).toBeGreaterThan(-1);
      // After navigation is too late: the site reads matchMedia when it boots.
      expect(emulate).toBeLessThan(nav);
    });
  }
});
