/**
 * Scroll-reveal content is released by an IntersectionObserver that a
 * client-rendered page only attaches after hydration. `waitForNetworkSettled`
 * can return before that happens, and auto-scrolling past an observer that
 * does not exist yet leaves every reveal at `opacity: 0` — which the plugin
 * deletes, subtree and all (glinc.io lost 57% of its nodes that way).
 *
 * Measured on glinc.io at 6x CPU throttle + slow network, 24 runs per arm:
 * without the wait 14 clean / 10 lost content; with it 24 clean / 0 lost.
 *
 * What this test guards is the safety contract, because that is what a capture
 * depends on: the wait is bounded, and a page that never goes quiet must not
 * take the import down with it.
 */
import { describe, it, expect, vi } from "vitest";
import { waitForHydration } from "../src/lib/cdp/w2w-extraction.js";

describe("waitForHydration", () => {
  it("asks the page once, and waits for the promise it returns", async () => {
    const send = vi.fn().mockResolvedValue({});
    await waitForHydration({ send });

    expect(send).toHaveBeenCalledTimes(1);
    const [method, params] = send.mock.calls[0];
    expect(method).toBe("Runtime.evaluate");
    expect(params.awaitPromise).toBe(true);
    expect(params.timeout).toBeGreaterThan(0);
  });

  it("bounds every wait inside the page, so nothing can hang forever", async () => {
    const send = vi.fn().mockResolvedValue({});
    await waitForHydration({ send });

    const expression: string = send.mock.calls[0][1].expression;
    // `load` gets a timeout, and so does the idle callback.
    expect(expression).toMatch(/setTimeout\(done, \d+\)/);
    expect(expression).toMatch(/timeout: \d+/);
  });

  it("waits for a commit frame AND the frame after it", () => {
    const send = vi.fn().mockResolvedValue({});
    void waitForHydration({ send });
    const expression: string = send.mock.calls[0][1].expression;
    // Observers are registered in the effects the commit schedules, so one
    // frame is not enough.
    expect(expression).toMatch(
      /requestAnimationFrame\(\(\) =>\s*requestAnimationFrame\(resolve\)/,
    );
  });

  it("never throws — a page that will not go quiet is still worth capturing", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Execution context destroyed"));
    await expect(waitForHydration({ send })).resolves.toBeUndefined();
  });
});
