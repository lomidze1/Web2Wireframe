# Apple.com Nav Research — h2d Import Analysis

**Date:** 2026-04-13
**Source:** html.to.design (URL import + .h2d file decode)
**Website:** https://www.apple.com/ (1440px, Light, English-US)

## h2d JSON Structure (decoded from .h2d file)

### Decode method
- Format: `JSON -> deflateRaw -> XOR 57`
- Decode: `XOR 57 -> inflateRaw -> JSON.parse`
- Codec: `docs/studyH2D/h2d encoding way/h2d-codec.js`
- Decoded file: `docs/apple_website/decoded.json` (12MB)

### Top-level keys
```
name, doc, frame, assets, fonts, url, theme, width
```

### Nav tree in h2d JSON (extraction stage)
```
nav#globalnav (FRAME) 1440x44
  └── div.globalnav-content (FRAME) 1024x44
      └── ul#globalnav-list (FRAME) 996x44 [4 children]
          ├── li.globalnav-item (30x44) — Apple logo
          │     └── a → span → svg (14x44)
          ├── li.globalnav-item (0x0, display:contents) — FLYOUT WRAPPER
          │     └── div.globalnav-flyout (0x0, display:contents)
          │           └── div.globalnav-menu-list (0x0, 11 children)
          │                 ├── div.globalnav-item Store (46x44)
          │                 ├── div.globalnav-item Mac (39x44)
          │                 ├── div.globalnav-item iPad (40x44)
          │                 ├── div.globalnav-item iPhone (54x44)
          │                 ├── div.globalnav-item Watch (51x44)
          │                 ├── div.globalnav-item Vision (50x44)
          │                 ├── div.globalnav-item AirPods (59x44)
          │                 ├── div.globalnav-item TV & Home (81x44)
          │                 ├── div.globalnav-item Entertainment (93x44)
          │                 ├── div.globalnav-item Accessories (83x44)
          │                 └── div.globalnav-item Support (60x44)
          ├── li.globalnav-item Search (31x44)
          │     └── a → span → svg (15x44)
          └── li#globalnav-bag (30x44)
                └── div → a → span (14x44)
```

### Key CSS properties on hidden elements
```
li.globalnav-menu:       display: contents, opacity: 1, width: 0, height: 0
div.globalnav-flyout:    display: contents, opacity: 1, height: auto
div.globalnav-curtain:   display: inline, opacity: 1, height: auto (0x0 wrapper)
```

## h2d Figma Output (rendering stage)

### Figma spy results (from spy-figma-nav.js)

#### URL Import result:
```
Nav - Global (FRAME) 1440x44 layout=VERTICAL pad=222,0,222,0
  List (FRAME) 996x44 layout=HORIZONTAL gap=19.1 [14 children]
    Component 7 (INSTANCE) 30x44 — Apple logo
      Container → Component 3 → Vector (VECTOR) 12.97x15.94
    Item → List (FRAME) 46x44 VERTICAL [2 children] — Store
      Component 4 (INSTANCE) 22x44 opacity=0 — dropdown trigger (HIDDEN)
      Component 8 (INSTANCE) 46x44 — visible link
    Item → List (FRAME) 39x44 — Mac (same pattern)
    Item → List (FRAME) 40x44 — iPad
    Item → List (FRAME) 54x44 — iPhone
    Item → List (FRAME) 51x44 — Watch
    Item → List (FRAME) 50x44 — Vision
    Item → List (FRAME) 59x44 — AirPods
    Item → List (FRAME) 81x44 — TV & Home
    Item → List (FRAME) 93x44 — Entertainment
    Item → List (FRAME) 83x44 — Accessories
    Item → List (FRAME) 60x44 — Support
    Component 7 (INSTANCE) 31x44 — Search
      Container → Component 3 → Vector (VECTOR) 14.08x14.08
    Item (FRAME) 30x44 — Bag
      Component 7 → Container → Component 3 → Vector
```

#### .h2d File Import result (previous session data):
```
nav#globalnav (FRAME) 1440x44 layout=VERTICAL pad=0,0,0,0
  div.globalnav-content:margin (FRAME) 1440x44 layout=VERTICAL pad=208,0,208,0
    div.globalnav-content (FRAME) 1024x44 layout=VERTICAL pad=22,0,22,0
      ul#globalnav-list (FRAME) 980x44 layout=HORIZONTAL gap=0 [4 children]
        li.globalnav-item (30x44) — Apple logo
          a → span → SVG (FRAME) → Image Icon
        div.globalnav-flyout (93x1, VERTICAL) [11 children] — NOT 0x0!
          div.globalnav-item Store (46x44) ...
          div.globalnav-item Mac (39x44) ...
          ...11 items...
        li.globalnav-item Search (31x44)
        li#globalnav-bag (30x44)
```

## h2d Key Techniques

### 1. `display: contents` = Flatten (remove wrapper, promote children)
- JSON: `li.globalnav-menu` (0x0, display:contents) EXISTS
- Figma URL import: **REMOVED** — 11 children promoted to parent List (4 → 14 children)
- Figma .h2d import: Partially handled — flyout kept as 93x1 (min 1px, not 0x0)

### 2. Zero-size elements = Never 0x0
- h2d NEVER creates 0x0 Figma frames
- Total 0x0 elements in Figma: **0**
- Minimum dimension: 1px

### 3. Component System for Interactions
- `Component 3` = SVG icon wrapper (INSTANCE)
- `Component 4` = dropdown trigger button (opacity=0, hidden by default)
- `Component 7` = icon-only nav item (Apple logo, Search, Bag)
- `Component 8` = text/SVG nav link
- Hover interactions: Component 4 opacity changes 0 → 1

### 4. SVG → Figma Vector (not placeholder)
- Apple logo: Vector (VECTOR) 12.97x15.94 — real editable vector
- Search icon: Vector (VECTOR) 14.08x14.08
- NOT placeholder frames

### 5. Margin → Padding Wrapper
- `div.globalnav-content:margin` (1440x44, pad=208,0,208,0)
- CSS margin converted to wrapper frame's padding for centering

### 6. Gap Extraction
- h2d: gap=19.1px between nav items (correct)
- Extracted from CSS gap or calculated from item positions

### 7. Semantic Naming
- "Nav - Global", "List", "Item → List", "Container", "Component N"
- Not HTML class names

## Stats
- Total 0x0 elements: **0**
- Nav children in Figma: **14** (flattened from nested 4)
- Component types used: 4 (Component 3, 4, 7, 8)
- SVG rendered as: Vector (VECTOR)
