# Web2Wireframe Plan Toward html.to.design-Level Fidelity

## What Is Missing

Below is everything needed to get as close as possible to `html.to.design`-level `maximum capture fidelity`. Some items are directly confirmed by their logs/docs, and some are reasonable inferences from their behavior.

### 1. Viewport orchestration layer

- `Page.getLayoutMetrics`
- `Emulation.setDeviceMetricsOverride`
- `Emulation.clearDeviceMetricsOverride`
- Goal: put the page into a deterministic viewport before capture.
- Why: responsive layout, media queries, fixed/sticky elements, zoom/DPR effects become much more stable.
- This layer is mostly missing in our flow right now, so the same page can produce different results depending on environment.

### 2. Pseudo-state capture layer

- `CSS.forcePseudoState` for `hover`, `focus`, `active`, and when useful `focus-visible`
- Goal: capture the real visual state of interactive UI.
- This is the biggest fidelity gap.
- Without this, CTAs, nav items, menus, cards, tabs, and dropdown triggers often end up in the wrong visual state.

### 3. Full resource graph layer

- `Page.getResourceTree`
- `Page.getResourceContent`
- Goal: capture images, SVGs, font CSS, iframe resources, and sometimes icon sprites.
- We are moving in the right direction for assets already, but this needs to become a full resource layer, not just an image optimization.
- Resource tree should become a core dependency, not an auxiliary feature.

### 4. Font fidelity layer

- `CSS.getPlatformFontsForNode`
- font stylesheet fetch via `Page.getResourceContent`
- `@font-face` source parsing
- fallback chain capture
- Goal: capture not just what font the element asked for, but what font actually rendered.
- This matters especially for mixed-font text, CJK, emoji, fallback glyphs, variable fonts, and font-weight mismatches.

### 5. Live browser state layer

- Capture from authenticated/live tabs, not only fresh backend renders
- Reuse cookies/session/local storage state
- Goal: support private pages, dashboards, personalized states, A/B variants
- This is a core extension-first advantage over a pure Puppeteer path.

### 6. DOM traversal fidelity layer

- `DOM.getDocument` with deep traversal
- `pierce: true`
- iframe traversal
- shadow root traversal
- Goal: capture shadow DOM, web components, nested app shells, embedded contexts.
- `DOMSnapshot` is strong, but snapshot alone does not always give enough contextual resolution.

### 7. Element identity / mapping layer

- internal stable markers, or injected class/id/data-attr mapping
- `DOM.querySelector`
- `DOM.describeNode`
- `DOM.resolveNode`
- Goal: create 1:1 correlation between content script nodes, CDP nodes, and extracted tree nodes.
- html.to.design’s `h2d-*` style strongly suggests this layer exists.
- We do not currently have this, so correlation is more fragile in complex pages.

### 8. Matched CSS fidelity layer

- Keep `CSS.getMatchedStylesForNode`, but expand usage selectively for:
- pseudo-element styles
- border-image / mask / filters / blend
- shorthand preservation
- original author values vs computed values
- Goal: computed style loses the “how did we get here” information.
- For maximum fidelity, the originating rule often matters as much as the final computed value.

### 9. Pseudo-element extraction layer

- `::before`
- `::after`
- possibly list markers
- Goal: capture decorative icons, pills, badges, separators, bullets, underline tricks.
- Missing this loses a large amount of real UI detail.

### 10. Asset source fidelity layer

- `img.currentSrc`
- `srcset`
- `picture/source`
- CSS `image-set()`
- multiple `background-image` layers
- mixed image + gradient backgrounds
- video poster handling
- canvas fallback strategy
- Right now we are closer to `src/data-src/poster/first url(...)`, which is a good start but not enough for maximum fidelity.

### 11. SVG fidelity layer

- inline SVG serialization
- external SVG fetch via resource tree
- symbol/use resolution
- preserve `viewBox`, transforms, masks, and `clipPath` where possible
- Figma-native SVG import is better than rasterizing, but SVGs vary a lot in complexity.

### 12. Text segmentation fidelity layer

- styled text runs
- inline spans
- links/emphasis/weight changes
- actual line-break behavior
- white-space mode
- text-transform
- text-decoration variants
- Goal: typography is a major part of fidelity.
- We already have a solid base, but browser text metrics and line wrapping still need strengthening.

### 13. Layout normalization layer

- scroll offsets
- fixed/sticky resolution
- transform matrices
- stacking context
- clipping/overflow chains
- absolute vs auto-layout decision heuristics
- z-index context inheritance
- Maximum fidelity needs more than just bounds; it needs context-aware placement.

### 14. Compositing / paint layer

- `opacity`
- blend modes
- `filter`
- `backdrop-filter`
- masks / `clip-path`
- background blur equivalents
- isolation / stacking context
- This is where many HTML-to-Figma systems stop looking truly faithful.

### 15. Screenshot-assisted fallback layer

- When semantic conversion fails, use bounded raster fallback:
- problematic node screenshot
- subtree screenshot
- component-level screenshot
- Goal: keep fidelity where structural conversion breaks down.
- In practice this is almost mandatory for maximum-fidelity products.

### 16. Interaction-aware capture heuristics

- open dropdowns
- expanded accordions
- current carousel slide
- lazy-loaded sections triggered by scroll
- hovered mega menus
- Goal: drive the page into the right state before capture.
- Static DOM capture alone is often not enough.

### 17. Network/idleness stabilization layer

- wait for fonts
- wait for images
- wait for animation settle
- wait for layout stability
- optionally freeze transitions/animations
- Goal: capture in a settled state.
- Otherwise we get race-condition captures and inconsistent extraction.

### 18. Multi-frame / iframe fidelity layer

- nested iframe traversal
- same-origin deep extraction
- cross-origin fallback strategy
- frame-local resource mapping
- frame-local font/resource fetch
- html.to.design materials suggest stronger iframe handling than we currently have.

### 19. Stateful content-script bridge

- content script + CDP hybrid model
- DOM annotations
- runtime value injection
- browser-only APIs where CDP alone is awkward
- This is a very practical layer for complex SPAs.

### 20. Deterministic export contract

- raw DOM tree
- matched rules
- computed styles
- resource map
- font map
- pseudo-state variants
- fallback raster blobs
- Goal: keep a rich intermediate format between the capture engine and the Figma renderer.
- We are moving in this direction already, but the contract still needs to become richer.

## What APIs / Capabilities We Need To Use

To reach a level close to theirs, these APIs and mechanisms need to be part of the main path:

- `DOMSnapshot.captureSnapshot`
- `DOM.getDocument`
- `DOM.describeNode`
- `DOM.querySelector`
- `DOM.resolveNode`
- `DOM.getBoxModel`
- `CSS.getMatchedStylesForNode`
- `CSS.getComputedStyleForNode`
- `CSS.getPlatformFontsForNode`
- `CSS.forcePseudoState`
- `Page.getLayoutMetrics`
- `Page.getResourceTree`
- `Page.getResourceContent`
- `Page.captureScreenshot`
- `Emulation.setDeviceMetricsOverride`
- `Emulation.clearDeviceMetricsOverride`
- `Runtime.evaluate`
- `Runtime.callFunctionOn`

## Evaluation Of Our Architecture

Our current architecture is not wrong. The foundation is actually strong:

- `shared-extraction` as a unified core is the right move.
- `DOMSnapshot.captureSnapshot + selective CSS.getMatchedStylesForNode` is a good base.
- `Page.getResourceTree/Page.getResourceContent` for assets is the right direction.
- Relative URL resolution and asset propagation through the pipeline are correct architectural choices.

So the direction is correct.

What we are missing is not a core rewrite. What we are missing is a set of fidelity layers on top of the current core.

## Risks

### 1. Architecture drift risk

- If the extension path and the Puppeteer path evolve with different capabilities, we end up maintaining two effectively different products.
- This risk already exists today because some richer capture behavior is clearly extension-only.

### 2. Over-complexity risk

- If we add everything at once, the system becomes much harder to debug and reason about.
- We need to build this in layers: viewport, pseudo-states, fonts/resources, fallback raster.

### 3. Performance risk

- Per-node CDP calls become expensive very quickly.
- We must keep selective expansion. We should not run `getMatchedStylesForNode` on everything.

### 4. State mutation risk

- Pseudo-state forcing, class injection, and runtime bridge logic can mutate the page.
- We need strict cleanup and reversible instrumentation.

### 5. Cross-origin risk

- Iframes, fonts, external resources, and restricted contexts are not all equally accessible.
- We need graceful fallbacks instead of assuming full access everywhere.

### 6. Figma model mismatch risk

- Some HTML/CSS features simply do not have a true native Figma equivalent.
- In those cases, semantic conversion should give way to controlled raster fallback.

### 7. Testing gap risk

- Fidelity regressions are not fully catchable with unit tests alone.
- We need a golden capture corpus: real websites, expected outputs, snapshot diffing, and comparison tooling.

### 8. Product expectation risk

- Promising “100% identical” behavior is dangerous.
- The realistic target should be “maximum faithful import with semantic output and selective raster fallback”.

## Main Conclusion

We do not need a full pivot.

We need to add fidelity layers on top of the current architecture.

If the end goal is html.to.design-class output, the strategic direction should be:

- extension-first fidelity engine
- shared extraction core
- selective CDP enrichment
- screenshot fallback where semantic mapping breaks

So:

- the foundation is correct
- the direction is correct
- the current completeness is not enough for maximum fidelity yet
- what is needed is expansion, not abandonment of the current path
