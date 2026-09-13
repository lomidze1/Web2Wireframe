/**
 * The in-page wait that lets a hydrating framework finish before capture.
 *
 * A React/Vue/Svelte page is HTML first and interactive second. Capture it
 * between those and the scroll-reveal wrappers are still at `opacity: 0` with
 * no IntersectionObserver registered to lift them — glinc.io lost 57% of its
 * nodes in 10 runs out of 24, and the converter's own report can only say the
 * content was hidden, never that it was about to appear.
 *
 * Kept here, in shared, because BOTH capture paths need the same wait and the
 * same bound: the API's Puppeteer session and the extension's CDP session.
 * They ran different waits for a while, and only the API's was fixed.
 *
 * Every step is bounded — a page that never goes idle is still worth
 * capturing:
 *   load event      5000ms
 *   idle callback   3000ms (or a flat 500ms where requestIdleCallback is
 *                   missing — Safari, and Chrome with the flag off)
 *   whole thing    12000ms, enforced by the caller's `Runtime.evaluate`
 */
export const W2W_HYDRATION_EXPRESSION = `
        (async () => {
          if (document.readyState !== 'complete') {
            await new Promise((resolve) => {
              const done = () => resolve();
              window.addEventListener('load', done, { once: true });
              setTimeout(done, 5000);
            });
          }
          // Two frames: one for the hydration commit, one for the effects it
          // schedules — IntersectionObservers are registered in those.
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          // Then the first idle slot, so anything the effects queued has run.
          await new Promise((resolve) => {
            if (window.requestIdleCallback) {
              window.requestIdleCallback(() => resolve(), { timeout: 3000 });
            } else {
              setTimeout(resolve, 500);
            }
          });
        })()
      `;

/** Outer bound for {@link W2W_HYDRATION_EXPRESSION}, in milliseconds. */
export const W2W_HYDRATION_TIMEOUT_MS = 12000;
