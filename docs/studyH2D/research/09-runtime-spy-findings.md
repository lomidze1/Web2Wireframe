# Runtime Spy Findings — Tesla.com (2026-03-28)

## Data Sources
- `h2d-dom-mutation-1774721222366.json` — DOM Mutation Spy (2.4MB)
- `h2d-service-worker.json` — CDP Command Log (218KB, 681 calls)
- `www_tesla_com_1440w_default.json` — Decoded .h2d file (for comparison)

## Key Numbers

| Metric | Value |
|--------|-------|
| DOM elements h2d marked | 2,220 |
| Visible elements (w>0, h>0) | 1,741 |
| Elements in .h2d output | 806 |
| **Filtering ratio** | **63% filtered out** (1,414 elements removed) |
| Total DOM mutations | 4,650 |
| Capture duration | 27.7 seconds |
| Shadow roots found | 9 |
| Style elements injected | 5 |

## h2d Filtering Analysis

h2d marks 2,220 elements but only outputs 806. **What gets filtered?**

### Completely Filtered Tags (never appear in .h2d):
- `script` (53) — obvious, no visual
- `link` (115) — stylesheet references
- `meta` (30) — metadata
- `style` (13) — style blocks
- `head` (1), `title` (1), `noscript` (1)
- `br` (2) — line breaks become text flow
- `dialog` (2) — hidden modals
- `table/tbody/tr/td` (32) — converted to frames
- `h2` (7), `h3` (76), `kbd` (10) — **interesting: text-only elements become TEXT nodes, not FRAME**
- `video` (1) — not supported
- `grammarly-desktop-integration` (1) — browser extension

### Heavily Filtered Tags:
| Tag | DOM | .h2d | Filtered | Reason |
|-----|-----|------|----------|--------|
| a | 342 | 42 | 88% | Most links become TEXT, only visual wrappers become FRAME |
| li | 237 | 16 | 93% | List items → TEXT nodes or collapsed |
| span | 193 | 10 | 95% | Inline text → merged into parent TEXT |
| div | 680 | 376 | 45% | Empty/invisible divs removed |
| button | 88 | 28 | 68% | Hidden nav buttons removed |
| img | 91 | 40 | 56% | Lazy-loaded/off-screen images filtered |

### Key Insight: h2d's "UNKNOWN" tag (111 nodes in .h2d)
The .h2d file has 111 nodes with tag "UNKNOWN" — these are pseudo-elements (::before, ::after) that h2d converts to standalone nodes.

## CSS Layout Distribution

From DOM spy (1,741 visible elements):

| Display Value | Count | % |
|---------------|-------|---|
| block | 759 | 43.6% |
| flex | 387 | 22.2% |
| list-item | 223 | 12.8% |
| inline-flex | 184 | 10.6% |
| **grid** | **102** | **5.9%** |
| inline | 86 | 4.9% |

**Grid is significant:** 102 elements use CSS Grid on Tesla.com. This is ~6% of visible elements. Our tool has zero Grid support.

## Grid Elements Detail

Tesla.com uses CSS Grid for:
- Product grid layouts (3-column, 8-column patterns)
- Card grids with `gridTemplateColumns: 211px 211px 211px`
- Full-width layouts with `gridTemplateRows: 565px`

## Style Injections

h2d injects 5 style elements during capture:

1. **Extension popup styles** — Inter font import
2. **Scrollbar hide** — `body::-webkit-scrollbar{display:none}`
3. **Animation pause** — `animation-play-state: paused !important; transition-duration: 0s !important`
4. **Caret/transition hide** — `caret-color: transparent !important`
5. **Hover instant animations** — Same as #4 (for hover state capture)

### Why this matters:
- h2d **pauses all animations** before capturing — prevents mid-animation states
- h2d **hides scrollbars** — cleaner capture
- h2d **disables transitions** — instant state for hover captures
- **We don't do any of this** in W2W

## Comparison: What We Can Learn

### 1. Aggressive Filtering
h2d captures 2,220 elements but only serializes 806 (37%).
We should be similarly aggressive about filtering:
- Non-visual tags (script, meta, link, style, head)
- Zero-size elements
- Off-screen elements (negative y coordinates — many Tesla images have y:-1360)
- Pure text wrappers (span, a, li → merge into parent TEXT)

### 2. Text Merging
h2d converts h2/h3/span/a into TEXT nodes when they're pure text wrappers.
193 spans → 10 FRAME nodes means 183 spans became TEXT content of their parent.

### 3. Pre-Capture Style Injection
Inject these before capture:
- `animation-play-state: paused !important`
- `transition-duration: 0s !important`
- `caret-color: transparent !important`
- `body::-webkit-scrollbar { display: none }`

### 4. Grid Support is Needed
102 grid elements on just Tesla.com. Modern sites increasingly use Grid.
We need: `gridTemplateColumns`, `gridTemplateRows` → Figma's Grid layout.

---

## Service Worker CDP Data (681 calls)

### Timing Breakdown
| Phase | Calls | Time |
|-------|-------|------|
| Init (enable domains) | 4 | 1,836ms |
| DOM snapshot | 1 | 97ms |
| Element queries | 556 | 988ms |
| Asset extraction | 42 | 64ms |
| Hover states | 56 | 58ms |
| Font detection | 7 | 3ms |

### Asset Extraction
- 120 resources in browser cache (94 images)
- 42 extracted: 37 images + 5 CSS/fonts
- Total: 1.7MB in just 64ms (cache reads)
- Largest: Homepage-Promo-Meet-Model-Y-Desktop.jpg (213KB decoded)
- Also extracts Google Maps tiles (7 tiles)

### Platform Fonts Detected (7)
- Universal Sans Text Medium
- Universal Sans Display Medium
- Universal Sans Display
- Universal Sans Text
- Roboto
(each detected via CSS.getPlatformFontsForNode in ~0.4ms per call)

### Hover State Captures
56 elements got CSS.forcePseudoState with ['hover'] — primarily nav buttons and interactive elements.
