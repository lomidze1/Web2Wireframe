# Interactive States Research — W2W Plugin

**Date:** 2026-04-14
**Branch:** dev
**Scope:** Components, hover variants, interaction mode — full pipeline analysis

---

## 1. Current Pipeline Summary

### Data Flow: interactionMode="variants"
```
UI (SettingsPanel)
  → useTabSettings hook (localInteractionMode state)
  → Import page (Web/Html/BrowserExtension/AreaSelection)
  → parent.postMessage({ interactionMode: "variants" })
  → main.ts (receives, sets RenderContext.interactionMode)
  → convertW2WToWireframe(frame, { interactionMode })
  → css-converter: computeHoverDiff(normal, hover) → pseudoStateStyles
  → nodes.ts: if variants && pseudoStateStyles → createPseudoStateVariants()
  → pseudoStates.ts: ComponentSet + wirePrototypeInteractions()
  → main.ts: Components Section (right of wireframe)
```

### Key Files & Lines

| Stage | File | Lines | Function |
|-------|------|-------|----------|
| UI dropdown | `SettingsPanel.tsx` | 370-396 | "None" / "Interactive States" |
| State management | `useTabSettings.ts` | 112-114, 329-332 | localInteractionMode + session override |
| Message to sandbox | `Web.tsx` / `BrowserExtension.tsx` | 145 / 261 | interactionMode in postMessage |
| Sandbox reception | `main.ts` | 110, 343 | Destructure + RenderContext |
| W2W conversion | `main.ts` | 409-411 | Pass to convertW2WToWireframe |
| Hover diff | `css-converter.ts` | 484-486, 1282-1299 | computeHoverDiff() |
| Variant trigger | `nodes.ts` | 657-672 | Condition + dynamic import |
| Variant creation | `pseudoStates.ts` | 226-287 | createPseudoStateVariants() |
| Interaction wiring | `pseudoStates.ts` | 331-365 | wirePrototypeInteractions() |
| Component section | `main.ts` | 520-568 | Grid layout, right of wireframe |

---

## 2. Hover Capture (Browser Extension)

### How it works
`background/index.ts` lines 987-1030:
1. `w2wFindInteractiveNodes(frame)` — finds `<a>`, `<button>`, `[role=button]` (max 30)
2. For each: `DOM.querySelector(selector)` → `CSS.forcePseudoState(["hover"])` → 50ms wait
3. `EXTRACT_SUBTREE(selector)` — content script re-extracts with hover styles
4. `node.hover = hoverResult.data` — full W2WFrameNode subtree stored

### Selector construction (lines 1426-1460)
Priority: `#id` > `tag.class` > `tag[href="..."]` > null (skip)

### Limitations
- Max 30 elements per page
- Selector can match wrong element (tag.class not unique)
- Only captures `<a>`, `<button>`, `[role=button]` — NOT `<input>`, `cursor:pointer`, etc.
- Only `:hover` — NOT `:focus`, `:active`, `:focus-visible`
- Markers cleaned BEFORE hover capture (no `data-w2w-idx` available)

---

## 3. Hover Diff Computation

### computeHoverDiff() (css-converter.ts lines 1282-1299)
- Compares `node.styles` vs `node.hover.styles`
- Only tracks **11 CSS properties** that `applyCssDiffToNode()` can handle
- Converts camelCase → kebab-case (e.g., `backgroundColor` → `background-color`)
- Returns `undefined` if no meaningful changes detected

### Tracked Properties (HOVER_DIFF_PROPERTIES)
```
backgroundColor, background
borderColor, borderWidth, borderRadius
color, opacity
boxShadow, outlineColor
textDecoration, textDecorationLine
```

### NOT Tracked
- `transform`, `width`, `height`, `padding`, `margin`
- `visibility`, `display` (structural changes)
- `font-size`, `font-weight`, `letter-spacing`
- `cursor`, `outline-width`, `outline-style`

---

## 4. Component Creation (pseudoStates.ts)

### createPseudoStateVariants() (lines 226-287)

**Steps:**
1. Create `defaultComp = figma.createComponent()` with name "State=Default"
2. Copy frame properties + move children to component
3. For each active state: clone default, apply CSS diff, name "State=Hover"
4. `figma.combineAsVariants([defaultComp, hoverComp, ...])` → ComponentSetNode
5. `wirePrototypeInteractions()` — set ON_HOVER → CHANGE_TO with SMART_ANIMATE
6. Return `defaultInstance` for wireframe + `componentSet` for collection

### Variant Naming
```
"State=Default" — base state
"State=Hover"   — ON_HOVER trigger (auto-revert)
"State=Focus"   — ON_CLICK trigger (persistent)
"State=Active"  — ON_PRESS trigger (auto-revert, 0.1s)
```

### Transition Config
```typescript
{
  type: "SMART_ANIMATE",
  duration: stateKey === "active" ? 0.1 : 0.15,
  easing: { type: "EASE_OUT" },
}
```

---

## 5. Figma Plugin API — Components & Interactions

### Component Creation
- `figma.createComponent()` → ComponentNode
- `figma.createComponentFromNode(node)` → ComponentNode (cannot use on nodes inside instances)
- `figma.combineAsVariants([comp1, comp2], parent)` → ComponentSetNode
- Empty ComponentSets are illegal — must have at least 1 component

### Variant Properties
- Naming convention: `"Property=Value"` (comma-separated for multiple)
- `componentSet.variantGroupProperties` → `{ State: { values: ['Default', 'Hover'] } }`
- `componentSet.defaultVariant` → first ComponentNode
- `node.variantProperties` (deprecated) → `{ State: 'Hover' }`

### Interaction Triggers (Complete)
| Trigger | Auto-Revert? | Use Case |
|---------|:------------:|----------|
| `ON_CLICK` | No | Focus, navigation |
| `ON_HOVER` | Yes (legacy) | CSS :hover equivalent |
| `ON_PRESS` | Yes | CSS :active equivalent |
| `ON_DRAG` | No | Drag gestures |
| `MOUSE_ENTER` | No | Enter hotspot (new, with delay) |
| `MOUSE_LEAVE` | No | Leave hotspot (new, with delay) |
| `AFTER_TIMEOUT` | No | Auto-advance (timeout in ms) |
| `ON_KEY_DOWN` | No | Keyboard/gamepad |

### Navigation Types
| Value | Description |
|-------|-------------|
| `NAVIGATE` | Frame-to-frame navigation |
| `SWAP` | Swap overlay content |
| `OVERLAY` | Show as overlay |
| `SCROLL_TO` | Scroll to position |
| `CHANGE_TO` | **Change variant** (interactive components) |

### Reaction Structure
```typescript
{
  trigger: { type: 'ON_HOVER' },
  actions: [{
    type: 'NODE',
    destinationId: hoverVariant.id,
    navigation: 'CHANGE_TO',
    transition: {
      type: 'SMART_ANIMATE',
      duration: 0.15,
      easing: { type: 'EASE_OUT' }
    },
    preserveScrollPosition: false,
  }]
}
```

### Important Gotchas
- `setReactionsAsync` is **async** — must await
- `reactions` property is **read-only** — use `setReactionsAsync`
- `SMART_ANIMATE` requires matching layer names between variants
- `ON_HOVER` is **legacy** — `MOUSE_ENTER`/`MOUSE_LEAVE` is preferred for new designs
- Variant naming must follow `"Property=Value"` format exactly

---

## 6. Conditional Visibility Filtering (Phase 3A — implemented)

### Current behavior (css-converter.ts lines 209-226)
- **interactionMode="none":** visibility:hidden and opacity:0 elements are **FILTERED** (current default)
- **interactionMode="variants":** visibility:hidden and opacity:0 elements are **PRESERVED** with `isHiddenInDefault=true`
- In nodes.ts: `if (node.isHiddenInDefault) frame.visible = false`

### Purpose
Hidden elements (dropdown panels, curtains) exist in Figma tree but are not visible. They are ready for component variant where they become visible (e.g., dropdown open state).

---

## 7. What ACTUALLY Happens with Apple.com + Interactive States

### Current behavior (dev branch):
1. User selects "Interactive States"
2. Browser Extension captures Apple.com, hover capture finds ~20 `<a>` links
3. For each link: force :hover → re-extract → store in `node.hover`
4. css-converter: `computeHoverDiff()` detects color/underline changes
5. nodes.ts: creates ComponentSet per interactive link (State=Default + State=Hover)
6. Result: Apple nav links become components with hover color/underline variants
7. Components Section appears to the right with all ComponentSets

### What's NOT captured:
- Dropdown submenu panels (visibility:hidden → visible)
- Curtain overlay (opacity:0 → 1)
- Structural changes (new children appearing)
- Focus/active/focus-visible states
- `<input>`, `cursor:pointer` elements

---

## 8. Old-Way vs Current Dev

| Aspect | old-way | Current dev |
|--------|---------|-------------|
| Hover capture | None | CDP-based (background/index.ts) |
| CSS converter | None | css-converter.ts (new file) |
| Variant creation | None | pseudoStates.ts |
| Interaction mode UI | None | SettingsPanel dropdown |
| ComponentSet | None | Per-element with hover variant |
| Prototype wiring | None | ON_HOVER → CHANGE_TO → SMART_ANIMATE |
| Supported hover CSS | N/A | 11 properties |
| Max interactive elements | N/A | 30 per page |
| Hidden element handling | N/A | Conditional (Phase 3A) |

---

## 9. Known Issues & Gaps

1. **Selector reliability** — `tag.class` can match wrong DOM element
2. **Only `:hover`** — no `:focus`, `:active`, `:focus-visible` capture
3. **Only `<a>`, `<button>`, `[role=button]`** — misses `<input>`, cursor:pointer
4. **Structural hover changes lost** — dropdown panel reveal not captured (Phase 3B)
5. **Marker cleanup timing** — data-w2w-idx cleaned before hover capture
6. **11 CSS properties** — many hover effects not tracked (transform, width, etc.)
7. **SMART_ANIMATE naming** — variant layers must match names for smooth animation
8. **ON_HOVER is legacy** — Figma recommends MOUSE_ENTER/MOUSE_LEAVE
