/**
 * The shared auto-scroll records what the page actually showed while it
 * scrolled.
 *
 * Webflow IX2 / GSAP reveals are REVERSIBLE: an element fades in while it is in
 * the viewport and fades out again once scrolled past. Both capture paths scroll
 * the page, return to the top and read styles once — so every such element
 * outside the first viewport was `opacity: 0` and the plugin dropped it
 * (vaayu.tech: 58 of 83 transparent elements had been visible mid-scroll).
 *
 * The expression samples opacity during the scroll and marks elements that were
 * shown but are transparent again at the top with `data-w2w-reveal-transform`
 * (the transform they had while shown). Never-shown UI (menus, modals) is left
 * alone.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  W2W_REVEAL_MARKER_ATTR,
  W2W_SCROLL_AND_SAMPLE_EXPRESSION,
  W2W_SCROLL_AND_SAMPLE_TIMEOUT_MS,
} from "../w2w-reveal-scroll";

interface FakeEl {
  name: string;
  /** opacity + transform (+ position) as a function of the current scrollY */
  style: (scrollY: number) => { opacity: string; transform: string; position?: string };
  parentElement: FakeEl | null;
  attrs: Record<string, string>;
  setAttribute(k: string, v: string): void;
}

function el(name: string, style: FakeEl["style"], parentElement: FakeEl | null = null): FakeEl {
  return {
    name,
    style,
    parentElement,
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
  };
}

const saved: Record<string, unknown> = {};

function installPage(elements: FakeEl[], pageHeight = 4000) {
  const g = globalThis as Record<string, unknown>;
  for (const k of ["window", "document", "getComputedStyle", "scrollTo", "scrollBy", "innerHeight"]) {
    saved[k] = g[k];
  }
  const win = { scrollY: 0, innerHeight: 900 };
  const scrolls: number[] = [];
  g.window = win;
  g.innerHeight = 900;
  g.scrollTo = (x: number | { top?: number }, y?: number) => {
    win.scrollY = typeof x === "object" ? x.top ?? 0 : y ?? 0;
    scrolls.push(win.scrollY);
  };
  g.scrollBy = (_x: number, y: number) => {
    win.scrollY = Math.min(win.scrollY + y, pageHeight);
    scrolls.push(win.scrollY);
  };
  g.getComputedStyle = (e: FakeEl) => ({ position: "static", ...e.style(win.scrollY) });
  g.document = {
    documentElement: { scrollHeight: pageHeight },
    body: { querySelectorAll: () => elements },
  };
  return { win, scrolls };
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  for (const [k, v] of Object.entries(saved)) g[k] = v;
});

async function run(): Promise<void> {
  // The expression's timings are real setTimeouts — shrink them for the test.
  const fast = W2W_SCROLL_AND_SAMPLE_EXPRESSION.replace(/setTimeout\(r, \d+\)/g, "setTimeout(r, 0)");
  await (0, eval)(fast);
}

describe("W2W_SCROLL_AND_SAMPLE_EXPRESSION", () => {
  it("marks a reveal that was shown mid-page and is transparent again at the top", async () => {
    const reveal = el("proud", (y) =>
      y >= 1000 && y <= 2000
        ? { opacity: "1", transform: "none" }
        : { opacity: "0", transform: "matrix(1, 0, 0, 1, 0, 14.4)" },
    );
    const { win } = installPage([reveal]);

    await run();

    expect(win.scrollY).toBe(0);
    expect(reveal.attrs[W2W_REVEAL_MARKER_ATTR]).toBe("none");
  });

  it("records the transform the element had while it was shown", async () => {
    const reveal = el("card", (y) =>
      y >= 1500
        ? { opacity: "0.6", transform: "matrix(1, 0, 0, 1, 0, 4)" }
        : { opacity: "0", transform: "matrix(1, 0, 0, 1, 0, 40)" },
    );
    installPage([reveal]);

    await run();

    expect(reveal.attrs[W2W_REVEAL_MARKER_ATTR]).toBe("matrix(1, 0, 0, 1, 0, 4)");
  });

  it("leaves UI that was never shown alone (menus, modals)", async () => {
    const dropdown = el("dropdown", () => ({ opacity: "0", transform: "none" }));
    installPage([dropdown]);

    await run();

    expect(dropdown.attrs[W2W_REVEAL_MARKER_ATTR]).toBeUndefined();
  });

  it("leaves elements visible at the top alone", async () => {
    const hero = el("hero", () => ({ opacity: "1", transform: "none" }));
    const fadedAtBottom = el("header-fade", (y) => ({ opacity: y > 2000 ? "0" : "1", transform: "none" }));
    installPage([hero, fadedAtBottom]);

    await run();

    expect(hero.attrs[W2W_REVEAL_MARKER_ATTR]).toBeUndefined();
    expect(fadedAtBottom.attrs[W2W_REVEAL_MARKER_ATTR]).toBeUndefined();
  });

  /**
   * vaayu.tech (owner's import 2026-09-17): `div.page-cover` is a
   * `position: fixed` full-screen loader, opaque at load and faded out for
   * good. Marked as a reveal it came back as an opaque sheet over the whole
   * page. Fixed overlays — loaders, popups, cookie banners — are UI state,
   * not page content.
   */
  it("never marks a fixed overlay, or anything inside one", async () => {
    let t = 0;
    const cover = el("page-cover", () => ({ opacity: t++ < 2 ? "1" : "0", transform: "none", position: "fixed" }));
    let u = 0;
    const popup = el("popup", () => ({ opacity: "0", transform: "none", position: "fixed" }));
    const popupBody = el("popup-body", () => ({ opacity: u++ < 2 ? "1" : "0", transform: "none" }), popup);
    installPage([cover, popup, popupBody]);

    await run();

    expect(cover.attrs[W2W_REVEAL_MARKER_ATTR]).toBeUndefined();
    expect(popupBody.attrs[W2W_REVEAL_MARKER_ATTR]).toBeUndefined();
  });

  /**
   * vaayu.tech footer (owner's import 2026-09-18): the footer items, CTA
   * buttons and closing line fade in only once the page sits at the very
   * bottom, and the fade starts ~100–200ms after the scroll. The loop left the
   * bottom after two or three 100ms samples, all still at 0, so nothing was
   * marked and the plugin dropped them.
   */
  it("dwells at the bottom so a late bottom-of-page reveal is seen", async () => {
    let bottomSamples = 0;
    const footer = el("footer-item", (y) => {
      if (y >= 4000) bottomSamples++;
      return y >= 4000 && bottomSamples > 4
        ? { opacity: "1", transform: "none" }
        : { opacity: "0", transform: "matrix(1, 0, 0, 1, 0, 14)" };
    });
    installPage([footer], 4000);

    await run();

    expect(footer.attrs[W2W_REVEAL_MARKER_ATTR]).toBe("none");
  });

  /**
   * Back at the top a reversible reveal can still be mid-fade-out (vaayu.tech
   * footer read 0.0001 and 6e-06): invisible, but not exactly 0, so it was
   * never marked.
   */
  it("marks a reveal that is still fading out, nearly transparent, at the top", async () => {
    const reveal = el("fading", (y) =>
      y >= 1000 && y <= 2000
        ? { opacity: "1", transform: "none" }
        : { opacity: "0.0001", transform: "none" },
    );
    installPage([reveal]);

    await run();

    expect(reveal.attrs[W2W_REVEAL_MARKER_ATTR]).toBe("none");
  });

  /**
   * vaayu.tech's CTA buttons were still at 0.96 when the marks were set (their
   * fade-out starts late) and at 0 by extraction. Marking every element the
   * scroll revealed is safe: the extractor only honours a marker on an element
   * that is transparent when it reads it.
   */
  it("marks a scroll reveal that has not started fading out yet", async () => {
    let t = 0;
    const reveal = el("cta", (y) => {
      if (t++ === 0) return { opacity: "0", transform: "none" }; // at load
      return y >= 1000 || y === 0
        ? { opacity: "0.96", transform: "none" }
        : { opacity: "0", transform: "none" };
    });
    installPage([reveal]);

    await run();

    expect(reveal.attrs[W2W_REVEAL_MARKER_ATTR]).toBe("none");
  });

  /**
   * vaayu.tech side-scroll `div.texture-holder`: shown at load, faded by the
   * scroll-scrubbed section and still at 0 back at the top. Not "revealed" by
   * the scroll (its peak was at load), but shown and hidden again all the same.
   */
  it("marks an element shown at load that the scroll hid again", async () => {
    let t = 0;
    const texture = el("texture-holder", () =>
      t++ === 0 ? { opacity: "1", transform: "none" } : { opacity: "0", transform: "scale(0.2)" },
    );
    installPage([texture]);

    await run();

    expect(texture.attrs[W2W_REVEAL_MARKER_ATTR]).toBe("none");
  });

  it("scrolls the whole page before returning to the top", async () => {
    const { scrolls } = installPage([], 4000);

    await run();

    expect(Math.max(...scrolls)).toBeGreaterThanOrEqual(4000);
    expect(scrolls[scrolls.length - 1]).toBe(0);
  });

  it("the bound covers the 30s scroll cap", () => {
    expect(W2W_SCROLL_AND_SAMPLE_TIMEOUT_MS).toBeGreaterThan(30000);
  });
});
