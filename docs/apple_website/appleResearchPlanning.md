# Apple.com Nav — h2d vs W2W Comparison & Multi-Phase Improvement Plan

**Date:** 2026-04-13
**Purpose:** Deep analysis of differences, root causes, and phased implementation plan

---

## Part 1: Side-by-Side Comparison

### Nav Structure Output

| Aspect | h2d (URL import) | W2W (current) | Gap |
|--------|-------------------|---------------|-----|
| ul children count | **14** (flattened) | **4** (nested) | display:contents not effective |
| Nav items layout | HORIZONTAL, gap=19.1 | Inside 93x1 VERTICAL flyout | Broken |
| SVG rendering | Vector (VECTOR), editable | Image Icon (FRAME), placeholder | No SVG->Vector |
| Components | 4 types (Component 3,4,7,8) | 0 (all FRAME) | No component system |
| Dropdown triggers | opacity=0, hidden by default | Rendered as 1px-height items | No interaction filtering |
| justify-content | space-between -> gap=19.1 | gap=0, space-between lost | Missing CSS conversion |
| backdrop-filter | blur captured | Code exists, data flow unclear | Verify pipeline |
| position:fixed | Not rendered (no Figma equivalent) | Not rendered | Equal (Figma limitation) |
| Naming | Semantic ("Nav - Global") | Class-based ("nav#globalnav") | Style difference |
| 0x0 elements | 0 | 0 | Equal |
| Margin -> padding | Yes (208,0,208,0) | Yes (208,0,208,0) | Equal |

### Interaction Handling

| Aspect | h2d | W2W (interactionMode=none) | W2W (interactionMode=variants) |
|--------|-----|---------------------------|-------------------------------|
| Hover state | Component variant, ON_HOVER trigger | Not rendered | Should create variants (pseudoStates.ts) |
| Dropdown button | opacity=0 component, toggles on hover | Rendered as 1px frame | Should be hidden or component |
| Curtain overlay | Not visible in spy | Not rendered (opacity:0 filtered) | Should be component backdrop |
| Submenu content | visibility:hidden, part of component | Filtered by css-converter | Should be variant state |

### What Each Does Well

**h2d advantages:**
- display:contents flattening -> correct child count
- SVG -> real Figma Vector
- Component system with interaction wiring
- Semantic naming
- gap calculation from element positions

**W2W advantages:**
- Margin wrapper pattern (same as h2d)
- Padding extraction accurate
- backdrop-filter parsing code exists
- Pseudo-state variant system exists (just needs data)
- Zero-size element handling (min 1px)
- All menu items preserved (11/11)

---

## Part 2: Root Cause Analysis

### Problem 1: display:contents (CRITICAL)

**Root cause chain:**
1. Browser extension extractor.ts (lines 209-222) DOES handle display:contents
2. Tree-builder.ts (lines 286-307) DOES have flattenDisplayContents()
3. **BUT:** The computed style `display: contents` may not survive the extraction pipeline intact
4. If the DOMSnapshot captures the element with `display: contents`, the element gets 0x0 bounds
5. Zero-size wrapper flattening (css-converter.ts lines 201-224) partially compensates but creates wrong structure

**Investigation needed:**
- Does `computedStyles["display"]` actually contain "contents" in extracted data?
- Is flattenDisplayContents() called at the right stage?
- Does the zero-size flattening in css-converter interfere?

### Problem 2: Flyout layout broken

**Root cause:**
- display:contents elements not flattened -> flyout wrapper preserved
- Flyout wrapper gets 0x0 bounds from DOM (display:contents elements have no box)
- css-converter bumps 0-height to 1px, sets VERTICAL layout (wrong)
- 11 items stack vertically inside 93x1 container instead of spreading horizontally

**Fix:** Properly flatten display:contents -> items become direct ul children -> HORIZONTAL layout applies

### Problem 3: Interaction mode behavior

**interactionMode="none" current behavior:**
- All nodes rendered as FRAME (no components)
- Hidden elements (opacity:0, visibility:hidden) filtered out by css-converter
- Dropdown triggers rendered as visible 1px-height items
- No hover/active states

**interactionMode="variants" current behavior:**
- Nodes with pseudoStateStyles get ComponentSet with variants
- Default + hover/active variants created
- Prototype interactions wired (ON_HOVER, ON_PRESS)
- ComponentSets placed in "Components" section

**What's MISSING in both modes:**
- No dropdown/submenu mechanism (open/close state)
- No curtain/overlay backdrop component
- No multi-state components (default + open dropdown state)
- Interactive elements only get hover CSS diff, not visibility toggle

### Problem 4: Dropdown/Submenu mechanism

**Apple's dropdown architecture:**
```
[Default state]
  nav-item (visible)         -> links text "Store"
  submenu-trigger (hidden)   -> button, visibility:hidden
  submenu-content (hidden)   -> div, visibility:hidden
  curtain (hidden)           -> div, opacity:0, backdrop behind dropdown

[Hover/Open state]  
  nav-item (visible)         -> still visible
  submenu-trigger (visible)  -> button visible, indicates open state
  submenu-content (visible)  -> dropdown panel with links
  curtain (visible)          -> dark overlay, opacity:1, backdrop-filter: blur
```

**This is a COMPONENT STATE CHANGE, not a simple CSS hover diff.**

The current pseudoStates.ts only handles CSS property changes (color, opacity, background).
It does NOT handle:
- visibility: hidden -> visible toggle
- Child element show/hide
- Multi-element coordinated state changes

---

## Part 3: Multi-Phase Implementation Plan

### Phase 1: display:contents Fix (Foundation)

**Goal:** Correctly flatten display:contents elements so nav items become direct flex children

**Files to modify:**
- `packages/shared/src/tree-builder.ts` (flattenDisplayContents)
- `packages/figma-plugin/src/rendering/css-converter.ts` (zero-size wrapper handling)
- `packages/browser-extension/src/content/extractor.ts` (verify extraction)

**Steps:**
1. **Debug:** Add logging to trace display:contents through pipeline
   - Verify `computedStyles["display"] === "contents"` in extracted data
   - Check if flattenDisplayContents() is called and what it receives
   
2. **Fix tree-builder:** Ensure flattenDisplayContents recursively promotes ALL children
   - Handle nested display:contents chains (li -> div -> div -> items)
   - Preserve item order after flattening
   
3. **Fix css-converter:** Don't create wrapper frames for display:contents elements
   - Currently zero-size wrappers get 1px height and VERTICAL layout
   - Should be completely removed, children promoted to parent
   
4. **Test:** Apple.com nav should have 14 direct children in ul, not 4

**Success criteria:**
- `ul#globalnav-list` has 14 children (not 4)
- No 93x1 flyout wrapper in output
- Menu items layout HORIZONTAL with correct spacing

**Risk:** Low -- this is a correctness fix, not a new feature

---

### Phase 2: Interaction Mode Refinement

**Goal:** Define clear behavior for interactionMode="none" vs "variants"

#### Phase 2A: interactionMode="none" behavior

**Current:** Renders everything as FRAME, filters hidden elements

**Desired behavior:**
1. Render the DEFAULT visual state only (what user sees without interaction)
2. **Hidden elements:** Filter visibility:hidden, opacity:0 elements (KEEP current behavior)
3. **Dropdown triggers:** Filter or minimize (1px height button frames are noise)
4. **Result:** Clean static wireframe showing only the default state

**Changes needed:**
- Better filtering of dropdown trigger buttons (0-height, opacity:0)
- Consider filtering elements with `aria-expanded="false"` related content
- NO components, NO instances, NO interaction wiring

#### Phase 2B: interactionMode="variants" behavior

**Current:** Creates ComponentSet for elements with pseudoStateStyles

**Desired behavior:**
1. Create components for interactive elements (links, buttons)
2. Wire hover/active/focus CSS state changes
3. **NEW:** Create components for elements with hidden interactive children

**Changes needed:**
- Keep existing pseudoStates.ts system (it works for CSS state changes)
- Add new "interactive element" detection for nav items with hidden submenus
- Create component variants that include visibility toggle
- Wire prototype interactions for dropdown open/close

**Files to modify:**
- `packages/figma-plugin/src/rendering/nodes.ts` (component creation logic)
- `packages/figma-plugin/src/rendering/pseudoStates.ts` (expand CSS diff capabilities)
- `packages/figma-plugin/src/rendering/css-converter.ts` (pass-through hidden children data)

**Risk:** Medium -- needs careful design to not break existing hover system

---

### Phase 3: Dropdown/Submenu Mechanism

**Goal:** Properly represent dropdown menus as Figma component states

**Architecture Design:**

```
ComponentSet "Nav Item - Store"
  |-- Variant "State=Default"
  |     li.globalnav-item (46x44)
  |       a.globalnav-link "Store"
  |
  |-- Variant "State=Hover" (when interactionMode=variants)
  |     li.globalnav-item (46x44)
  |       a.globalnav-link "Store" (underline, color change)
  |
  |-- Variant "State=Open" (when interactionMode=variants)  <-- NEW
  |     li.globalnav-item (46x44+dropdown)
  |       a.globalnav-link "Store"
  |       div.submenu-content (visible)
  |         ... dropdown links ...
  |       div.curtain (visible, backdrop-filter: blur)
```

**Detection heuristic:**
```
Element has dropdown IF:
  - Has child with visibility:hidden AND
  - That child has interactive content (links, buttons) AND
  - Parent has role="menubar" or is <nav> AND
  - Hidden child has significant content (not just a trigger button)
```

**Data flow:**
1. **Extraction:** Preserve visibility:hidden children in data (DON'T filter)
2. **Tree-builder:** Mark elements with `hasDropdown: true` metadata
3. **CSS-converter:** Pass hidden children through when interactionMode="variants"
4. **Nodes.ts:** Create multi-variant ComponentSet with Default + Open states
5. **PseudoStates.ts:** Extend to handle visibility toggle, not just CSS diff

**Implementation steps:**
1. Add `dropdownChildren` field to W2WFrameNode type
2. In extraction: when interactionMode="variants", keep visibility:hidden children in separate field
3. In css-converter: attach dropdownChildren to converted node
4. In nodes.ts: detect dropdown pattern, create Open variant
5. In pseudoStates.ts: new function `createDropdownVariants()` separate from CSS diff

**Figma interaction wiring:**
```
Default variant:
  ON_HOVER -> Hover variant (0.15s SMART_ANIMATE)
  ON_CLICK -> Open variant (0.2s SMART_ANIMATE)

Hover variant:
  ON_HOVER (exit) -> Default variant
  ON_CLICK -> Open variant

Open variant:
  ON_CLICK (outside) -> Default variant (0.2s SMART_ANIMATE)
```

**Risk:** High -- complex multi-state components, needs careful Figma API usage

---

### Phase 4: Nav Positioning & Layout Polish

**Goal:** Handle position:fixed/sticky navs and remaining layout issues

#### 4A: position:fixed/sticky

**Figma limitation:** No CSS-style fixed positioning. Options:
1. **Constraints:** Set node constraints to "TOP" + "LEFT-RIGHT" (stretches with frame)
2. **Fixed when scrolling:** Figma prototyping has "Fix position when scrolling" option
3. **Metadata annotation:** Add note/label indicating element is fixed-position

**Recommended approach:**
- Set Figma constraints (top + left-right stretch)
- Set `layoutPositioning: "ABSOLUTE"` with constraints for fixed elements
- If inside auto-layout parent: extract to top level of frame

#### 4B: justify-content: space-between

**Current:** Gap=0 because W2W reads CSS `gap` property, Apple uses `justify-content: space-between`

**Fix:**
- In css-converter: map `justify-content` to Figma's `primaryAxisAlignItems`
  - `space-between` -> `SPACE_BETWEEN`
  - `center` -> `CENTER`
  - `flex-end` -> `MAX`
  - `flex-start` -> `MIN`
- In nodes.ts: apply `primaryAxisAlignItems` to frame

**Note:** Figma's SPACE_BETWEEN works differently than CSS -- it only applies to auto-layout frames

#### 4C: backdrop-filter verification

**Code exists** (css-converter.ts lines 794-805) but need to verify:
- Does the extracted data include `backdrop-filter` style?
- Is the BACKGROUND_BLUR effect applied to the correct Figma node?
- Does it render visually in Figma?

**Test:** Import Apple nav, check if `nav#globalnav` has BACKGROUND_BLUR effect

---

### Phase 5: display:contents Comprehensive & Remaining Issues

**Goal:** Handle ALL display:contents patterns, not just nav

#### 5A: display:contents as general pattern

**Common use cases beyond nav:**
- Grid layouts with semantic wrappers (display:contents on wrapper, grid items promoted)
- Flex containers with intermediate wrappers
- CSS Container queries with display:contents fallback
- Web component shadow DOM patterns

**Implementation:**
- Make flattenDisplayContents universal in tree-builder
- Handle nested chains (up to 5 levels deep)
- Preserve styles from display:contents parent if relevant (color inheritance)
- Test with multiple websites (not just Apple)

#### 5B: Remaining items

| Item | Priority | Effort | Phase |
|------|----------|--------|-------|
| SVG -> Figma Vector | Medium | High | Future (separate feature) |
| Semantic naming | Low | Medium | Future |
| aria-expanded filtering | Low | Low | Phase 2A |
| Nav curtain backdrop | Medium | Medium | Phase 3 |

---

## Part 4: Dependency Graph

```
Phase 1 (display:contents)
  |
  v
Phase 2A (interactionMode=none cleanup)
  |
  +---> Phase 4B (justify-content)     [independent]
  +---> Phase 4C (backdrop-filter)     [independent]
  |
  v
Phase 2B (interactionMode=variants refinement)
  |
  v
Phase 3 (Dropdown/Submenu mechanism)
  |
  v
Phase 4A (position:fixed/sticky)
  |
  v
Phase 5 (display:contents comprehensive + cleanup)
```

**Parallelizable work:**
- Phase 4B and 4C can run in parallel with Phase 2A
- Phase 4A is independent but logically follows Phase 3

---

## Part 5: Testing Strategy

### Per-Phase Tests

**Phase 1:**
- Unit: `flattenDisplayContents()` with nested chains
- Integration: Apple.com nav produces 14 children
- Regression: existing sites don't break

**Phase 2:**
- Unit: interactionMode filtering behavior
- Integration: Apple nav renders clean in "none" mode
- Integration: Apple nav creates components in "variants" mode

**Phase 3:**
- Unit: dropdown detection heuristic
- Unit: createDropdownVariants() ComponentSet creation
- Integration: Apple nav dropdown opens/closes in prototype
- Edge cases: nested dropdowns, mega-menus, hover-triggered vs click-triggered

**Phase 4:**
- Unit: justify-content -> primaryAxisAlignItems mapping
- Unit: position:fixed -> constraints mapping
- Integration: Apple nav spacing correct (gap between items)

**Phase 5:**
- Comprehensive: 10+ websites with display:contents
- Regression: full test suite passes

### Reference Websites for Testing

| Website | Nav Type | display:contents | Dropdown | Fixed Nav |
|---------|----------|-----------------|----------|-----------|
| apple.com | Horizontal, mega-menu | Yes (3 levels) | JS-triggered | Yes |
| github.com | Horizontal, dropdown | No | Hover | Yes (sticky) |
| stripe.com | Horizontal, mega-menu | Yes | Hover | Yes |
| amazon.com | Horizontal, mega-menu | No | Hover + click | Yes |
| medium.com | Horizontal, simple | No | Click | Yes (sticky) |

---

## Part 6: Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| display:contents breaks other layouts | High | Medium | Extensive testing, opt-in flag |
| Dropdown components too complex | Medium | High | Start with simple hover, iterate |
| Figma API limits on ComponentSet | Medium | Low | Test with 5+ variants per set |
| Performance with many components | Medium | Medium | Lazy component creation |
| Interaction wiring breaks prototype | Low | Low | Default to no interactions if error |

---

## Summary: Priority Order

1. **Phase 1** (display:contents) -- Foundation, unblocks everything
2. **Phase 2A** (interactionMode=none) -- Clean static output
3. **Phase 4B** (justify-content) -- Quick win, big visual impact
4. **Phase 2B** (interactionMode=variants) -- Component system
5. **Phase 3** (Dropdown mechanism) -- Complex but high value
6. **Phase 4A** (position:fixed) -- Polish
7. **Phase 4C** (backdrop-filter verify) -- Quick check
8. **Phase 5** (comprehensive) -- Long-term quality
