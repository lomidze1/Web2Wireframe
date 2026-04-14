# Interactive States — Improvement Plan

**Date:** 2026-04-14
**Status:** Phase 1-2-3 IMPLEMENTED

---

## Implemented (this session)

### Phase 1: Hover Capture Reliability (Browser Extension)

| Task | Status | Details |
|------|--------|---------|
| 1A. CLEANUP_MARKERS moved after hover capture | ✅ | Markers available during hover selector construction |
| 1B. Selector improvement | ✅ | ALL classes used (not just first), role fallback added, CSS escape fixed |
| 1C. Interactive detection expansion | ✅ | `<input>`, `<select>`, `<textarea>`, ARIA roles (link, tab, menuitem), tabindex |

### Phase 2: Expanded Hover CSS Properties (Figma Plugin)

| Task | Status | Details |
|------|--------|---------|
| 2A. HOVER_DIFF_PROPERTIES expanded | ✅ | +4: visibility, transform, outlineWidth, letterSpacing |
| 2B. applyCssDiffToNode expanded | ✅ | visibility→visible, transform→rotation, outline-width→strokeWeight, letter-spacing→textNode |
| 2C. applyRemovedProperty expanded | ✅ | visibility, transform, outline-width reset handlers |

### Phase 3: Tests

| Task | Status | Count |
|------|--------|-------|
| hover-diff-expanded.test.ts | ✅ | 6 tests |
| pseudo-state-expanded.test.ts | ✅ | 12 tests |

---

## Total: 15 CSS properties tracked (was 11)

| Property | Figma Mapping | New? |
|----------|--------------|------|
| backgroundColor / background | frame.fills | - |
| borderColor | frame.strokes | - |
| borderWidth | frame.strokeWeight | - |
| borderRadius | frame.cornerRadius | - |
| color | textNode.fills | - |
| opacity | frame.opacity | - |
| boxShadow | frame.effects (DROP_SHADOW) | - |
| outlineColor | frame.strokes + OUTSIDE | - |
| textDecoration / textDecorationLine | textNode.textDecoration | - |
| **visibility** | **frame.visible** | ✅ NEW |
| **transform** | **frame.rotation (rotate only)** | ✅ NEW |
| **outlineWidth** | **frame.strokeWeight + OUTSIDE** | ✅ NEW |
| **letterSpacing** | **textNode.letterSpacing** | ✅ NEW |

---

## Future Improvements (not implemented)

### Priority 1: font-weight support
- Requires `figma.loadFontAsync()` (async)
- applyCssDiffToNode is currently sync — needs refactor
- Medium effort, high value

### Priority 2: data-w2w-idx based selectors
- Markers exist during hover capture now (Phase 1A fix)
- But extractAttributes() doesn't capture data-w2w-idx (set after attributes extracted)
- Requires restructuring extractor traversal order

### Priority 3: Dropdown Component Variants (Phase 3B)
- Detect dropdown associations (nav item → hidden panel)
- Create multi-state ComponentSet (Default → Hover → Open)
- Complex — needs heuristic detection

### Priority 4: Additional pseudo-states
- `:focus`, `:active`, `:focus-visible` via CDP CSS.forcePseudoState
- Requires extending hover capture loop to multiple states
- Medium effort
