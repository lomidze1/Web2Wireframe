# Pending specs

Test files written ahead of an implementation that has not landed. They live
here, outside every package's `src/`, so `pnpm test` and `pnpm type-check` stay
green — a permanently red suite stops being a signal.

Move a file back into its package when you start the implementation.

**Only `.test.ts` files belong here.** Bug analyses and fix plans live in
[`../specs/`](../specs/) — until 2026-09-20 ten of them were parked in this
folder, which contradicted the rule above and left them unindexed.

## `text-boundary-spaces.test.ts`

**Target:** `packages/browser-extension/src/content/extractor.ts` —
`extractTextNodes` and its inner `keepBoundarySpaces`.

**The bug it pins:** stripe.com's chat bubble reveals its copy one word per
`<span>`, so each text node is its span's only child. `keepBoundarySpaces` only
looks at the text node's own siblings, finds none, and `collapse().trim()` eats
every trailing space — "Absolutely.Hereareafewcomfyessentials".

**What it demands (2 changes, ~15-25 lines):**

1. `export function extractTextNodes` — the test imports it directly.
2. The rescue must climb inline ancestors: no sibling on that side → move up to
   the parent; if that parent is inline-level, repeat; stop at the first
   non-inline ancestor.

**Why it is parked and not implemented** (2026-09-03): `packages/browser-extension`
is LIVE on the Chrome Web Store, and the fix carries four risks nobody has
decided on yet —

- **Perf.** `extractTextNodes` runs per text node, tens of thousands per page.
  A `getComputedStyle()` per ancestor per boundary is real cost on a codebase
  that just took stripe.com from 216s to 51.5s. A tag-name allowlist avoids the
  style read; happy-dom returns `''` for `display` on a `<span>` anyway, so an
  `=== 'inline'` test fails these very tests.
- **Flex/grid.** `<div style="display:flex"><span>Price: </span><span>$5</span></div>`
  renders no space, but the climb sees an element sibling and invents one. The
  extracted string then disagrees with the measured rect the converter reads.
- **Whitespace text nodes.** Real markup is `<span>a </span>\n  <span>b</span>`;
  the next sibling is a whitespace TEXT node, not an element. The tests build
  DOM without it, so they would go green on a fix that still misses the common
  shape.
- **`<br>`.** An element sibling at a real line edge — the space would be kept
  where the browser drops it.

Not covered by any of the 7 cases, and worth adding when the fix is written.

**Also found while reading that function** (pre-existing, not this spec's job):

- `collapse` is `t.replace(/\s+/g, (m) => (m.includes(' ') ? ' ' : ' '))` — both
  ternary branches return a plain space, so the nbsp-preservation the comment
  above it describes does not exist.
- The multi-line branch never calls `keepBoundarySpaces` at all, so boundary
  spaces are lost on any wrapped run regardless of the fix above.

## `heading-inline-run-overlap.test.ts`

**Target:** `packages/figma-plugin/src/rendering/textRunMerge.ts` —
`mergeInlineTextRuns`.

**The bug it pins:** stripe.com's section heading is one flowing line — a bold
`<h2>` lead-in followed by a lighter continuation that wraps onto three lines.
An inline box's rect is the union of its line boxes, so BOTH runs report the
block's own origin: the h2 at (0, -3) 593.23×40 and the continuation at
(0, -3) 776.54×110.38. The block is layoutMode NONE, so Figma stacks one
directly over the other and the heading is unreadable.

**What it is NOT** (verified 2026-09-03 by experiment, reverted):

The spec's own docstring names three links, and two of them are dead ends:

1. *"drop the whitespace-only inline box"* — easy (one rule in `isUseless`),
   and it changes nothing on its own. Note the existing narrow rule is
   deliberate: `treeSimplify.ts:139-151` explains that an unpainted box at real
   size still occupies a flow slot AND an `itemSpacing` gap, so dropping it
   shifts every later sibling. Widening it to h2d's "drop them all" is its own
   decision, not a free step.
2. *"then `collapseSingleChildFrames` folds the h2 away"* — **it cannot.**
   `canCollapse` (`treeSimplify.ts:252`) refuses any parent whose only child
   carries content: *"text/image/svg payloads belong to the node that declared
   them and must never be merged into another identity."* That is a module
   contract, not an oversight.

So the ONLY route left is the third: `mergeInlineTextRuns` learning to join a
TEXT one level down with its parent's sibling TEXT, into one text node carrying
per-range styling — which is h2d's text model.

**Why it is parked** (2026-09-03): that is the text-capture architecture work
the owner scheduled for **Monday 2026-09-07, 11:00** (auto-memory
`project_text-capture-architecture`, Google Calendar event
`4hpjt6hka36kinq47qhiqgdamk`, which already carries a "do not repeat" list of
two failed attempts). Loosening a merge heuristic across a 3505-test converter
the evening before a release is the wrong order.

**Note when you pick it up:** `groupRunsByRow` already puts these two runs in
ONE row — bands −3..37 and −3..107 overlap by 40, over the 50% floor of the
shorter run. So the row grouping is not the obstacle; the merge's own
neutrality rules are. See `css-converter-row-grouping.test.ts` for what that
grouping now guarantees.
