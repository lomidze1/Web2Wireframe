# Apple.com Nav Research — W2W Import Analysis

**Date:** 2026-04-13 (updated)
**Source:** Web2Wireframe Plugin (Browser Extension CDP import)
**Website:** https://www.apple.com/ (1440px)
**Branch:** dev

## Figma Spy Results (spy-figma-nav.js on W2W import)

### Full nav tree
```
nav#globalnav (FRAME) 1440x44 layout=VERTICAL gap=0 pad=0,0,0,0 clip=false vis=true opacity=1 [1]
  div.globalnav-content:margin (FRAME) 1440x44 layout=VERTICAL gap=0 pad=208,0,208,0 [1]
    div.globalnav-content (FRAME) 1024x44 layout=VERTICAL gap=0 pad=22,0,22,0 [1]
      ul#globalnav-list (FRAME) 980x44 layout=HORIZONTAL gap=0 pad=0,0,0,0 [4 children]

        === Child 1: Apple Logo ===
        li.globalnav-item (FRAME) 30x44 layout=VERTICAL [1]
          a.globalnav-link (FRAME) 30x44 layout=HORIZONTAL pad=8,0,8,0 clip=true [1]
            span.globalnav-image-regular (FRAME) 14x44 layout=HORIZONTAL [1]
              SVG (FRAME) 14x44 layout=VERTICAL clip=true [1]
                Image Icon (FRAME) 24x24 layout=NONE clip=true [4]

        === Child 2: Flyout (ALL MENU ITEMS) ===
        div.globalnav-flyout (FRAME) 93x1 layout=VERTICAL gap=0 clip=false [11 children]
          div.globalnav-item Store (46x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item Mac (39x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item iPad (40x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item iPhone (54x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item Watch (51x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item Vision (50x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item AirPods (59x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item TV & Home (81x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item Entertainment (93x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item Accessories (83x44) -> ul -> li(44h) + li(1h)
          div.globalnav-item Support (60x44) -> ul -> li(44h) + li(1h)

        === Child 3: Search ===
        li.globalnav-item (FRAME) 31x44 layout=VERTICAL [1]
          a#globalnav-menubutton-link-search (FRAME) 31x44 layout=HORIZONTAL pad=8,0,8,0 clip=true [1]
            span.globalnav-image-regular (FRAME) 15x44 [1]
              SVG (FRAME) 15x44 clip=true [1]
                Image Icon (FRAME) 24x24 [4]

        === Child 4: Bag ===
        li#globalnav-bag (FRAME) 30x44 layout=VERTICAL [1]
          div.globalnav-bag-wrapper (FRAME) 30x44 [1]
            a#globalnav-menubutton-link-bag (FRAME) 30x44 layout=HORIZONTAL pad=8,0,8,0 [1]
              span.globalnav-image-regular (FRAME) 14x44 [1]
                SVG (FRAME) 14x44 clip=true [1]
```

### Stats
- Total 0x0 elements on page: **0**
- Nav children in ul: **4** (NOT flattened -- should be 14)
- Flyout container: **93x1** (min 1px height, VERTICAL layout)
- Component/Instance nodes: **0** (all FRAME)
- SVG rendering: **Placeholder** (Image Icon frame, not Vector)

---

## Pipeline Trace: How nav gets processed

### Stage 1: Browser Extension Extraction (extractor.ts)

**display:contents handling** (extractor.ts lines 209-222):
- `li.globalnav-menu` (display:contents) -> children promoted to parent
- `div.globalnav-flyout` (display:contents) -> children promoted
- `div.globalnav-menu-list` (display:contents) -> children promoted
- **Result:** 11 menu items should become direct children of `ul#globalnav-list`

**Zero-size wrapper handling** (extractor.ts lines 167-170, 280-287):
- After children processed, zero-size wrappers preserved if they have visible children
- Comment: "Apple globalnav uses 3 levels of 0x0 wrappers around visible nav items"

**Visibility filtering** (visibility.ts lines 21-71):
- `visibility:hidden` elements -> preserved for layout spacing
- `opacity:0` elements -> NOT filtered (visibility.ts doesn't check opacity)
- `display:none` elements -> skipped entirely

### Stage 2: Tree Builder (tree-builder.ts)

**flattenDisplayContents()** (tree-builder.ts lines 286-307):
- Recursively promotes children of `display:contents` elements
- Should flatten `li.globalnav-menu` -> `div.globalnav-flyout` -> `div.globalnav-menu-list`
- **PROBLEM:** The tree-builder DOES have this logic, but it only works if `computedStyles["display"] === "contents"` is present in the data

**visibility:hidden filtering** (tree-builder.ts line 1462):
- `visibility:hidden` -> return null (SKIPPED)
- This removes dropdown submenus that are hidden by default

### Stage 3: CSS Converter (css-converter.ts)

**Invisible element filtering** (css-converter.ts lines 175-184):
- `visibility === 'hidden'` -> skip rendering
- `opacity === 0` -> skip rendering
- Comment: "Apple.com flyout menus (visibility:hidden), globalnav-curtain (opacity:0)"

**Zero-size wrapper flattening** (css-converter.ts lines 201-224):
- `width < 1 && height < 1 && has children` -> flatten children into parent
- `width < 1 && height < 1 && no children` -> skip entirely

### Stage 4: Figma Plugin Rendering (nodes.ts)

**Component creation** (nodes.ts lines 644-659):
- Only when `interactionMode === "variants"` AND `pseudoStateStyles` exist
- Creates ComponentSet with default + hover/active variants
- Wires prototype interactions (ON_HOVER, ON_PRESS)

**Current behavior with interactionMode="none":**
- No Components, no Instances, all FRAME
- Dropdown triggers rendered as regular frames
- Hidden elements (opacity:0) skipped by css-converter

---

## Live DOM Analysis (from browser inspection)

### `display: contents` chain
```
li.globalnav-menu          -> display: contents (0x0)
  -> div.globalnav-flyout  -> display: contents (0x0)
    -> div.globalnav-menu-list -> display: contents (0x0)
        |-- div.globalnav-item-store (46x44)  <- these 11 items
        |-- div.globalnav-item-mac (39x44)       visually are direct
        |-- ...                                  flex children of ul
```

### Nav CSS properties
```css
nav#globalnav {
  position: fixed;
  z-index: 9999;
  top: 0;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: saturate(1.8) blur(20px);
}

ul#globalnav-list {
  display: flex;
  flex-direction: row;
  justify-content: space-between;  /* NOT gap! */
}
```

### Dropdown/Submenu mechanism
```
submenu:  visibility: hidden (exists but invisible)
curtain:  height=920, opacity=0 (overlay, JS-toggled)
buttons:  each menu item has a hidden <button> for dropdown trigger
```
- Dropdown opens via **JavaScript events**, not CSS :hover
- `visibility: hidden` -> `visibility: visible` on open
- `curtain` opacity: 0 -> 1 (dark overlay behind dropdown)

### SVG details
```
Apple logo: <svg width="14" height="44" viewBox="0 0 14 44"> -- 1 path
Search:     <svg width="15" height="44" viewBox="0 0 15 44"> -- 1 path
Bag:        <svg width="14" height="44" viewBox="0 0 14 44"> -- 1 path
```

---

## Identified Problems

### Critical
1. **`display: contents` not fully effective** -- 3 wrapper elements with display:contents should flatten their children into `ul#globalnav-list`. Result: 4 children instead of 14. The tree-builder HAS `flattenDisplayContents()` logic but somehow it's not working for this case.

2. **Flyout container breaks layout** -- `div.globalnav-flyout` rendered as 93x1 VERTICAL frame inside HORIZONTAL list. All 11 menu items stack vertically inside this tiny container instead of being HORIZONTAL flex items.

### High
3. **SVG = placeholder, not Vector** -- SVGs rendered as 24x24 "Image Icon" placeholders instead of real Figma Vector nodes. h2d renders them as editable Vectors.

4. **No Component system (interactionMode=none)** -- All nodes are FRAME. No INSTANCE/COMPONENT for reusable elements. Even without interactions, nav items could benefit from componentization.

5. **justify-content: space-between not converted** -- Gap shows as 0 because Apple uses space-between, not CSS gap. W2W doesn't convert justify-content to Figma's primaryAxisAlignItems.

### Medium
6. **position: fixed not handled** -- Nav should be fixed/sticky. Figma doesn't have CSS-style fixed positioning, but this could be noted as a constraint or handled with "Constraints" in Figma.

7. **backdrop-filter extraction exists but may not reach Figma** -- css-converter.ts (lines 794-805) has BACKGROUND_BLUR parsing, but if the nav's backdrop-filter style isn't in the data, it won't render.

8. **Interaction states not rendered (when interactionMode=none)** -- Dropdown buttons exist in data but no component variants created. When interactionMode="variants", these should get hover/active states.

9. **Each menu item has 2 sub-items (li 44h + li 1h)** -- The 1px-height submenu trigger items are visible in output but functionally useless without interaction support.

### Low
10. **Nav naming uses CSS class names** -- h2d uses semantic names ("Nav - Global", "List", "Item"). W2W uses class names (`nav#globalnav`, `div.globalnav-content`).

---

## What W2W Does RIGHT

1. **Margin wrapper** -- `div.globalnav-content:margin` with pad=208,0,208,0 correctly centers content
2. **Padding extraction** -- `a.globalnav-link` correctly has pad=8,0,8,0
3. **Min 1px height** -- Flyout gets 93x1 (not 0x0) in final Figma output
4. **clip=true on links** -- Overflow clipping correctly applied
5. **All menu items rendered** -- 11 items exist, just in wrong container structure
6. **0x0 count = 0** -- At Figma level, no truly 0x0 elements
7. **backdrop-filter parsing exists** in css-converter.ts (just needs data flow verification)
8. **Pseudo-state variant system exists** in pseudoStates.ts (needs interactionMode="variants")

---

## Pipeline Code References

| Stage | File | Key Lines | Function |
|-------|------|-----------|----------|
| Extraction | `browser-extension/src/content/extractor.ts` | 209-222 | display:contents handling |
| Extraction | `browser-extension/src/content/visibility.ts` | 21-71 | isHidden() filtering |
| Tree Build | `shared/src/tree-builder.ts` | 286-307 | flattenDisplayContents() |
| Tree Build | `shared/src/tree-builder.ts` | 1462 | visibility:hidden skip |
| CSS Convert | `figma-plugin/src/rendering/css-converter.ts` | 175-184 | Invisible element filter |
| CSS Convert | `figma-plugin/src/rendering/css-converter.ts` | 201-224 | Zero-size wrapper flatten |
| CSS Convert | `figma-plugin/src/rendering/css-converter.ts` | 794-805 | backdrop-filter -> BACKGROUND_BLUR |
| Rendering | `figma-plugin/src/rendering/nodes.ts` | 644-659 | Component variant creation |
| Rendering | `figma-plugin/src/rendering/pseudoStates.ts` | 226-287 | createPseudoStateVariants() |
| Settings | `figma-plugin/src/types/index.ts` | 246 | interactionMode type |
| UI | `figma-plugin/src/ui/components/settingsPanel/SettingsPanel.tsx` | 370-396 | Interaction dropdown |
