/**
 * The URL import's auto-scroll records reversible scroll reveals.
 *
 * Webflow IX2 / GSAP fade an element out again once it is scrolled past, so a
 * scroll → back-to-top → read-once capture saw them all at `opacity: 0`
 * (vaayu.tech: 58 of 83 transparent elements had been visible mid-scroll). The
 * scroll now runs the shared sampling expression, which marks those elements
 * for the extractor — the same expression the extension runs, so the two
 * capture paths cannot drift.
 */
import { describe, it, expect, vi } from "vitest";
import {
  W2W_SCROLL_AND_SAMPLE_EXPRESSION,
  W2W_SCROLL_AND_SAMPLE_TIMEOUT_MS,
} from "@w2w/shared";
import { autoScrollPage } from "../src/lib/cdp/w2w-extraction.js";

describe("autoScrollPage", () => {
  it("runs the shared scroll-and-sample expression and waits for it", async () => {
    const send = vi.fn().mockResolvedValue({});
    await autoScrollPage({ send });

    expect(send).toHaveBeenCalledTimes(1);
    const [method, params] = send.mock.calls[0];
    expect(method).toBe("Runtime.evaluate");
    expect(params.expression).toBe(W2W_SCROLL_AND_SAMPLE_EXPRESSION);
    expect(params.awaitPromise).toBe(true);
    expect(params.timeout).toBe(W2W_SCROLL_AND_SAMPLE_TIMEOUT_MS);
  });

  it("never throws, and still returns the page to the top", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("Execution context was destroyed"))
      .mockResolvedValue({});
    await expect(autoScrollPage({ send })).resolves.toBeUndefined();
    expect(send.mock.calls[1][1].expression).toBe("window.scrollTo(0, 0)");
  });
});
