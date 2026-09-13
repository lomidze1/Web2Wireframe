# Bleed-wrapped child loses its whole subtree to `set_maxWidth` (2026-09-13)

## Symptom

apple.com (both import paths): the import report lists a fatal
`p.tile-callout — Could not be rendered — skipped (set_maxWidth: Can only set
maxWidth on auto layout nodes and their children)`. The paragraph never appears.

## Root cause (verified on `~/Downloads/apple_com_1440_wireframe.w2w`)

apple.com has 5 `p.tile-callout` nodes. All carry a negative bottom margin
(`margin: 9px 0 -3px` / `8px 0 -4px`). Exactly one also carries
`max-width: 515px` — that is the one that fails.

1. A negative margin routes `createMarginWrapper` → `createBleedWrapper`
   (`rendering/layout.ts`), which builds a `layoutMode: "NONE"` `:margin` frame
   and positions the child inside it.
2. `applyChildInAutoLayout` (`rendering/nodes.ts` ~1980) then writes
   `childNode.maxWidth = cssMaxWidth`. The child's parent is now the NONE
   wrapper, and the child (TEXT) has no auto layout of its own.
3. Figma throws. The per-child catch records it as a dropped node → `fatal`.

The same class of write happens for `minWidth`, `minHeight` and `maxHeight`
(~1993–2021). The comment there ("Only legal on auto-layout children — which is
exactly this code path") stopped being true when the bleed wrapper was added.

Not affected: `wrapper.maxWidth` (~1986) and `target.maxWidth` (~2065/2110) —
the wrapper is always appended to `parentFrame`, which is auto layout here.

## Fix (plugin only, `rendering/nodes.ts`)

Guard the four child-level writes with one predicate: the write is legal only
when the node itself has auto layout (`layoutMode !== "NONE"`) or its parent
does. For a bleed-wrapped child this skips them.

Nothing visible is lost: a bleed-wrapped child is FIXED at its browser-measured
size (css-converter's `hasNegativeInlineMargin` gate / bleed wrapper contract),
and inside a NONE frame min/max constraints have no layout effect anyway. The
wrapper still receives `wrapperMaxW`.

## Tests first — `src/__tests__/render-bleed-wrapper-constraints.test.ts`

Render through `createNodeInFigma` with a Figma mock whose
`maxWidth/minWidth/minHeight/maxHeight` setters throw the real message unless
the node or its parent has auto layout (mock tracks `parent` in `appendChild`).

1. apple.com shape — auto-layout parent, TEXT child with `cssMaxWidth: 515`,
   `margin {9,0,-3,0}` → no dropped node, the text exists inside a NONE
   `:margin` wrapper, the wrapper carries maxWidth 515.
2. Same with `cssMinWidth` / `cssMinHeight` / `cssMaxHeight` → no drop.
3. Regression guard — positive margin (auto-layout padding wrapper) and no
   margin: the child still receives maxWidth / min / max exactly as before.

## Review (second agent, 2026-09-13) — "plan OK with changes", both applied

- Root cause confirmed: only the four child-level writes are unconditional;
  every other sizing write targets `wrapper || childNode` or is gated by
  `!wrapper`. `createBleedWrapper` sets nothing illegal; `collapseMarginWrappers`
  works on the WireframeNode tree and already skips negative-margin parents.
- Guard on the in-scope `wrapper` plus the child's own `layoutMode`, not on
  `.parent` (most render mocks don't track `parent`). An `if`, never a catch —
  a catch would also mask unrelated setter errors.
- Added test 4: a bleed-wrapped FRAME with its own auto layout must still get
  `maxWidth`, so a wrapper-only guard cannot pass.

## Verification

`vitest` + `tsc` in the plugin; owner re-imports the apple `.w2w` via
`npm run watch` and confirms the paragraph renders and the fatal row is gone.
