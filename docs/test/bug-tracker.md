# Bug Tracker — Manual Testing

> Generated: 2026-04-09
> Updated: 2026-04-22
> Branch: `dev` (new-way merged; `old-way` kept as backup)

---

## სტატუსი

| #      | ტესტი                                                   | სტატუსი |
| ------ | ------------------------------------------------------- | ------- |
| BUG-01 | W-03 (🟢 easy): hover component coverage incomplete     | ❌      |

### Legend

| Icon | მნიშვნელობა       |
| ---- | ----------------- |
| ✅   | Pass / სწორია     |
| ❌   | Fail / ბაგია      |
| ⚠️   | გადასახედი / TODO |
| ⬜   | არ შემოწმებულა    |

---

## BUG-01 — W-03 hover component coverage incomplete

**Test:** W-03 (Web tab, Full features — Colors=Website, Fonts=Website, Text=Website, Assets=Real, CSS Vars=Styles, Layout=AL, Interactions=**Hover**)
**Difficulty:** 🟢 მარტივი
**URL:** https://www.web2wireframe.design/pricing
**Date:** 2026-04-22
**Severity:** ❌ Fail — missing hover coverage

### Problem summary

Live page has **16 DOM elements** that react to `:hover`, but the Figma W-03 import created only **6 hover components**. 10 hoverable elements have no interactive state in the resulting Figma file.

### Live site analysis

16 hover-reactive elements collapse into **3 unique CSS hover patterns**:

#### Pattern 1 — Top nav link (3 elements)
- **Selector:** `._link_s3iw9_50:hover`
- **Applies to:** How It Works, Pricing, Docs (header nav)
- **Default → Hover:**
  - `color: #5A6072` → `var(--text)` (darker)
  - `background: transparent` → `rgba(12,13,18,0.05)`
  - `transition: color/background 0.15s`

#### Pattern 2 — Light text link on dark background (9 elements)
- **Selector:** `._columns_rue7f_48 a:hover`
- **Applies to:** 3 header CTA links + 6 footer links
- **Default → Hover:**
  - `color: rgba(242,244,248,0.9)` → `#FFFFFF`
  - `transition: all`

#### Pattern 3 — Button lift (4 elements)
- **Selector:** `.btn:hover`
- **Applies to:** Upgrade to Pro, Start Free, Get Plus, Get Pro
- **Default → Hover:**
  - `transform: none` → `translateY(-2px)`
  - `transition: transform/box-shadow/border/background 0.16s`
- **Note:** Same motion for `.btn-primary` (blue gradient) and `.btn-secondary` (gray); base styles differ.

### Expected vs Actual

| Metric                             | Expected | Actual | Gap  |
| ---------------------------------- | -------- | ------ | ---- |
| Unique hover patterns (components) | 3 (or 4 if `.btn-primary` vs `.btn-secondary` split) | 6 | — |
| Hover-reactive DOM elements covered | 16       | ?      | ≥10  |

Current 6 components are visible in the screenshot: `a._brand_s3i...`, `a.btn` (×4), `a._brandBlock_rue7f_17`. The `a.btn` appears duplicated per instance instead of reused, and Pattern 1 (nav) + Pattern 2 (light links) seem missing or under-represented.

### Investigation TODO

1. Enumerate every existing hover component in W-03 Figma file (name, node id, which live-site element it maps to).
2. For each of the 16 live hover-reactive elements, check whether a matching Figma hover component exists. Produce gap table:
   | Live element (selector + text) | Pattern | Figma hover exists? | Figma node/name |
3. Flag Figma hover components whose values do NOT match live CSS (wrong color, transform distance, easing, duration).
4. Decide minimum set: 3 components (shared `.btn`) or 4 components (primary vs secondary).
5. Output action list: add / fix / delete-duplicate.

### Constraints

- Do **not** invent hover behaviors not present in live CSS.
- Elements with identical CSS rules = single reusable component in Figma, even if repeated in layout.
- Ignore `:focus`, `:active`, `:visited` — only `:hover` in scope.

### Root cause — CONFIRMED (code audit 2026-04-22)

Plugin creates a ComponentSet **per DOM instance with non-empty hover delta**, no deduplication by matched CSS rule.

**Evidence chain:**

1. **CDP capture is per-element, selector discarded:**
   - `packages/shared/src/pseudo-states.ts:71-98` — `flattenMatchedRules()` flattens `matchedCSSRules[].rule.selectorList` into a plain property map. The original selector (`.btn:hover`, `._link_s3iw9_50:hover`) is **never preserved**.
   - `packages/shared/src/pseudo-states.ts:194-252` — `capturePseudoStatesForNodes()` returns `Map<backendNodeId, PseudoStateStyles>` — keyed per DOM element.

2. **Render is per-node, unconditional component creation:**
   - `packages/figma-plugin/src/rendering/nodes.ts:771-811` — recursive builder calls `createPseudoStateVariants()` per WireframeNode that carries `pseudoStateStyles`.
   - `packages/figma-plugin/src/rendering/pseudoStates.ts:662-750` — unconditionally calls `figma.createComponent()` (line 689) + `combineAsVariants()` (line 733) every invocation.
   - No cache, no `Map<selector, ComponentSet>`, append-only `context.componentSets.push(...)` at `nodes.ts:806`.

3. **Why 6 instead of 16:**
   - `pseudoStates.ts:679-682` — empty-diff filter drops elements whose hover only changes cursor.
   - `nodes.ts:782-793` — `hasDescendantHover` path coalesces parent-hover-child cases (one ComponentSet at parent covers multiple DOM descendants).
   - Remaining: each non-empty-diff DOM instance mints its own ComponentSet. On pricing page 6 `.btn` / link instances survive filtering → 6 duplicate ComponentSets instead of 3-4 shared ones.

### Fix shape (minimum change)

Two options, additive:

**Option A — content-signature dedup (quick, no schema change):**
- In render pass (`nodes.ts`), maintain a `Map<string, ComponentSet>` keyed by canonical signature: `frame visual signature + sorted JSON.stringify(pseudoStateStyles)`.
- On cache hit: return `existing.defaultVariant.createInstance()` instead of new `createPseudoStateVariants()`.

**Option B — selector-based dedup (correct, requires schema change):**
- Preserve `matchedCSSRules[].selectorList` through `flattenMatchedRules()` in `packages/shared/src/pseudo-states.ts`.
- Add `pseudoStateSelectors: string[]` field on `PseudoStateStyles` and `WireframeNode`.
- Dedup key = matched hover selector from CDP (`".btn:hover"`, `"._link_s3iw9_50:hover"`).
- Natural match with live-site CSS; makes the 3-pattern collapse explicit.

**Recommended: Option B** — aligns Figma output with live CSS semantics (3 unique components for 3 unique selectors), matches user expectation exactly.

### Relevant files

| File                                                          | Lines        | Role                                        |
| ------------------------------------------------------------- | ------------ | ------------------------------------------- |
| `packages/shared/src/pseudo-states.ts`                        | 71-98        | `flattenMatchedRules` — drops selectors     |
| `packages/shared/src/pseudo-states.ts`                        | 117-167      | `captureForcedPseudoStyles` — per-node      |
| `packages/shared/src/pseudo-states.ts`                        | 194-252      | `capturePseudoStatesForNodes` — keyed by id |
| `packages/shared/src/tree-builder.ts`                         | 1838         | Attaches delta to WireframeNode             |
| `packages/figma-plugin/src/rendering/nodes.ts`                | 771-811      | Recursive builder, invokes pseudo creation  |
| `packages/figma-plugin/src/rendering/pseudoStates.ts`         | 662-750      | `createPseudoStateVariants` — no dedup      |
| `packages/figma-plugin/src/rendering/pseudoStates.ts`         | 679-682      | Empty-diff filter                           |
| `packages/api/src/lib/cdp/w2w-extraction.ts`                  | 232-248      | Hover candidate collection (node-level only)|

### h2d reverse-engineering — how the competitor solves it

Source: Scripter audit run on h2d-imported `web2wireframe.design/pricing`, 2026-04-22.
Spy script: [`docs/test/figma-spy-scripts/h2d-hover-audit.js`](./figma-spy-scripts/h2d-hover-audit.js)

**h2d output on the same page:**

- **Only 2 ComponentSets** (vs W2W's 6):
  - `Component 1` — W logo brand block (no hover), 2 instances
  - `Component 2` — all interactive links+buttons merged in ONE set, 6 variants, 13 instances
- **17 nodes with Reactions** (15 `ON_HOVER` + 2 `ON_CLICK` for URL brand)
- **15 instances from 5 masters** — heavy instance reuse

**Component 2 uses 2D variant properties:**

| `variant` | `:hover` | instances | live-site mapping                                   |
| --------- | -------- | --------- | --------------------------------------------------- |
| 1         | false    | 9         | Light-text link (header CTA + 6 footer) = Pattern 2 |
| 1         | true     | (target)  | Pattern 2 hover variant                             |
| 2         | false    | 1         | Primary btn (Upgrade to Pro or Get Pro)             |
| 3         | false    | 2         | Secondary btn (Start Free, Get Plus)                |
| 4         | false    | 1         | Other btn style                                     |
| 4         | true     | (target)  | Variant 4 hover variant                             |

**Hover trigger mechanism:** each hoverable instance has
```json
{ "trigger": { "type": "ON_HOVER" },
  "actions": [{ "type": "NODE", "destinationId": "<hover-variant-id>", "navigation": "CHANGE_TO" }] }
```
i.e. Figma-native `ON_HOVER` reaction that swaps to the hover variant in the same ComponentSet.

**Comparison:**

| Dimension            | W2W (current)                  | h2d                                   | Winner        |
| -------------------- | ------------------------------ | ------------------------------------- | ------------- |
| ComponentSets (hover)| 6                              | 1                                     | h2d -83%      |
| Instance reuse       | None (new component per DOM)   | Yes (9× same master)                  | h2d           |
| Hover coverage       | 6 / 16 (37%)                   | **15 / 16 (94%)**                     | h2d           |
| Trigger mechanism    | Variants only, no reaction     | `ON_HOVER` → `CHANGE_TO` reaction     | h2d (actually works in Figma prototype) |
| Dedup key            | None                           | Visual style signature                | h2d           |
| Variant dimensions   | 1D (State=Default/Hover)       | 2D (variant × :hover)                 | h2d           |

### Proposed fix — 3 changes (adopt h2d approach)

**1. Style-signature dedup (new):**
- Group hovered elements by canonical style signature (fills + strokes + effects + text styles + size).
- One ComponentSet per unique signature; the rest become `createInstance()` calls.
- Place in `packages/figma-plugin/src/rendering/pseudoStates.ts` or a new helper module.

**2. `ON_HOVER` Reactions on every hoverable instance (new):**
- After ComponentSet creation, attach to every instance:
  ```ts
  instance.reactions = [{
    trigger: { type: 'ON_HOVER' },
    actions: [{ type: 'NODE', destinationId: hoverVariantId, navigation: 'CHANGE_TO' }],
  }];
  ```
- Requires knowing the `hoverVariantId` at instance-placement time → cache `Map<signature, { componentSetId, defaultVariantId, hoverVariantId }>`.

**3. Remove empty-diff filter (or soften):**
- Current: `pseudoStates.ts:679-682` drops elements whose hover delta is empty.
- New: keep them in the tree; if delta is truly empty, attach the reaction anyway (hover still "activates" the component — matches live-site behavior for cursor changes, delayed transitions). Target: 16/16 coverage.

**Expected result on pricing page:**
- ComponentSets: 6 → 3-4 (one per visual pattern, matches live CSS)
- Hover-reactive instances: 6 → 16 (all DOM elements with `:hover` on live page)
- Figma prototype mode: hovering any CTA/link actually triggers the swap (currently doesn't work)

---

<!-- ახალი ბაგების ჩანაწერები აქ დაამატე -->
