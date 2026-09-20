# opacity: 0 — why content goes missing (research 2026-09-17)

Trigger: user import reports (Juliette, 2026-09-16) — "Hidden at capture time (opacity: 0) — skipped" on
vaayu.tech 55, clearstreet.io 38, crojungle.com 31, melius.com 27, notion.com 4 layers.

## Method
Harness = API container Chromium, same steps as `/import-url` (reduced-motion emulation, hydration wait,
auto-scroll, back to top). For every outermost `opacity:0` element (≥8px) we sampled its opacity while
scrolling the page in 600px steps with 900ms dwell, then compared with the state at the top (where we extract).
Live-browser check on vaayu.tech confirmed the mechanism.

## Findings

| site | opacity 0 at top | shown at some point while scrolling | never shown (really hidden UI) |
|---|---|---|---|
| vaayu.tech (Webflow) | 83 | **58** (all inline-style JS) | 25 |
| clearstreet.io (GSAP) | 46 | **8** | 38 — a11y widget, cookie banner, dropdowns, tooltips |
| crojungle.com | 42 | 1 | 41 — nav overlay, modals, testimonial slides, hover titles |
| melius.com | 8 | 0 | 8 — hover cards |
| notion.com | 3 | 0 | 3 — nav dropdowns, marquee placeholder |

### Cause 1 — reversible scroll reveals (real content loss)
Webflow IX2 / GSAP ScrollTrigger write inline `opacity`/`transform` and **fade elements out again when they
leave the viewport** (vaayu.tech live: "We are proud to collaborate" 0 → 1 in view → 0 when scrolled past; the
lower text blocks 1 → 0 after scrolling back to top). Capture scrolls, returns to the top and reads styles once,
so every reversible reveal outside the first viewport is 0 → the plugin drops the subtree.
`prefers-reduced-motion` and the hydration wait do not help: these libraries ignore reduced motion and the
reveal is not latched.

### Cause 2 — the report overstates loss (noise)
Most skipped layers are UI that is hidden on the real page too (menus, cookie banners, modals, carousel slides,
hover states). Reporting them as "skipped" made a user send them as bugs.

## h2d
- Keeps `opacity:0` elements as layers with opacity 0 (not dropped).
- Scrolls the page, injects `transition-duration: 2147483647s; animation-play-state: paused` and only then
  scrolls to top → CSS-transition reveals freeze in their revealed state.
- No handling of JS inline-style reveals (Webflow/GSAP/framer) — same loss as ours.

## Implemented 2026-09-17 (uncommitted) — cause 1
`packages/shared/src/w2w-reveal-scroll.ts` (`W2W_SCROLL_AND_SAMPLE_EXPRESSION`) replaces both auto-scroll copies
(API `autoScrollPage`, extension `w2wAutoScrollAndSampleReveals`); samples opacity during the scroll and marks
shown-then-faded elements with `data-w2w-reveal-transform`; extractor `extractStyles` emits the revealed state,
`cleanupMarkers` removes it. Harness (API container, real bundle): vaayu.tech outermost opacity-0 79 → 9, hidden
nodes 126 → 23; clearstreet.io hidden nodes 437 → 274 ("The financial industry…" now visible); notion.com and
crojungle.com 0 markers (no false positives). Scroll time unchanged (1.4–3s).

## Proposed fix (original)
1. **Capture (shared content script + API auto-scroll + extension — LIVE):** while auto-scrolling, sample the
   elements that start at opacity 0; remember max opacity and the transform at that moment; the extractor emits
   the revealed values for elements that were ever shown (≥ ~0.4 → treat as 1). Plus h2d's transition freeze
   before scrolling back. Fixes JS and CSS reversible reveals.
2. **Plugin:** report only likely loss — subtrees with text/images that are not `visibility:hidden` overlays;
   stop reporting menus/modals/slides as problems.
3. Optional: keep never-shown hidden UI as `visible:false` layers instead of deleting (h2d-like, user can toggle).
