/**
 * Auto-scroll that records what the page actually showed while it scrolled.
 *
 * Both capture paths scroll the page (lazy content, IntersectionObservers),
 * return to the top and read styles once. Webflow IX2 / GSAP scroll reveals are
 * REVERSIBLE — an element fades in while it is in the viewport and out again
 * once scrolled past — so at that single read every reveal outside the first
 * viewport is `opacity: 0` and the plugin drops it, subtree and all. Measured
 * 2026-09-17 in the API's Chromium: vaayu.tech had 83 transparent elements at
 * the top, 58 of them visible at some point during the scroll; clearstreet.io 8
 * of 46. Reduced-motion emulation does not stop these libraries, and the reveal
 * does not latch.
 *
 * The expression samples every element's computed opacity after load and after
 * each scroll step. Back at the top, an element that is transparent again but
 * was shown gets `data-w2w-reveal-transform` = the transform it had at its most
 * visible sample. The extractor reads that marker (a DOM attribute, because the
 * extension's extractor runs in the content script's isolated world) and emits
 * the revealed state. UI that never showed — menus, cookie banners, modals —
 * gets no marker and stays hidden.
 *
 * Shared by the API's Puppeteer session and the extension's CDP session, like
 * `W2W_HYDRATION_EXPRESSION`, so the two scroll loops cannot drift. The loop
 * itself is the API's: a step just under one viewport so every band is inside
 * the viewport at some sample, 100ms dwell, grow-until-stable, 30s cap.
 * Never throws — a page that fights the scroll is still worth capturing.
 */

/** Marker set on revealed elements; value = computed transform while shown. */
export const W2W_REVEAL_MARKER_ATTR = "data-w2w-reveal-transform";
export const W2W_SCROLL_AND_SAMPLE_EXPRESSION = `
        (async () => {
          const seen = new Map();
          // initial = opacity at load; an element first seen mid-scroll
          // (lazy content) counts from 0.
          let atLoad = true;
          const sample = () => {
            try {
              for (const el of document.body.querySelectorAll('*')) {
                const cs = getComputedStyle(el);
                const opacity = parseFloat(cs.opacity);
                if (!(opacity >= 0)) continue;
                const rec = seen.get(el);
                if (!rec) seen.set(el, { initial: atLoad ? opacity : 0, max: opacity, transform: cs.transform });
                else if (opacity > rec.max) { rec.max = opacity; rec.transform = cs.transform; }
              }
            } catch (e) { /* sampling is best-effort */ }
            atLoad = false;
          };
          try {
            sample();
            const scrollStep = Math.max(200, innerHeight - 100);
            const maxTime = 30000;
            const startTime = Date.now();
            let totalHeight = 0;
            let lastHeight = document.documentElement.scrollHeight;
            while (Date.now() - startTime < maxTime) {
              const currentHeight = document.documentElement.scrollHeight;
              scrollBy(0, scrollStep);
              totalHeight += scrollStep;
              await new Promise(r => setTimeout(r, 100));
              sample();
              if (totalHeight >= currentHeight + 1000) {
                if (document.documentElement.scrollHeight > lastHeight) {
                  lastHeight = document.documentElement.scrollHeight;
                  continue;
                }
                break;
              }
            }
            // Bottom-of-page reveals (vaayu.tech footer) start their fade only
            // once the page sits at the very bottom, ~100–200ms late; the loop
            // above leaves after two or three samples, all still at 0.
            scrollTo(0, document.documentElement.scrollHeight);
            for (let i = 0; i < 8; i++) {
              await new Promise(r => setTimeout(r, 100));
              sample();
            }
          } catch (e) { /* keep going: return to the top below */ }
          scrollTo(0, 0);
          await new Promise(r => setTimeout(r, 500));
          // Fixed overlays — loaders, timed popups, cookie banners — are UI
          // state, not page content: vaayu.tech's full-screen page-cover loader
          // is opaque at load and gone for good, and a marker brought it back
          // over the whole page.
          const inFixed = (el) => {
            for (let p = el; p; p = p.parentElement) {
              if (getComputedStyle(p).position === 'fixed') return true;
            }
            return false;
          };
          try {
            for (const [el, rec] of seen) {
              // Revealed by the scroll (shown more than at load) or hidden
              // again below its peak (vaayu.tech side-scroll textures, shown at
              // load). A reveal is not gated on the opacity right now: back at
              // the top it can still be fading out, or not have started yet
              // (vaayu.tech CTA: 0.96 here, 0 at extraction). The extractor
              // honours the marker only on an element that is transparent
              // when it reads it.
              if (rec.max <= 0) continue;
              const revealed = rec.max > rec.initial;
              const hidden = parseFloat(getComputedStyle(el).opacity) < rec.max;
              if (!revealed && !hidden) continue;
              if (inFixed(el)) continue;
              el.setAttribute('${W2W_REVEAL_MARKER_ATTR}', rec.transform || 'none');
            }
          } catch (e) { /* marking is best-effort */ }
        })()
`;

/** Outer bound for {@link W2W_SCROLL_AND_SAMPLE_EXPRESSION}: 30s scroll cap + slack. */
export const W2W_SCROLL_AND_SAMPLE_TIMEOUT_MS = 35000;
