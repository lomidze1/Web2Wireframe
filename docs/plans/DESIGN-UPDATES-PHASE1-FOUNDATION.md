# Design Updates — Phase 1: Foundation

**Branch:** `design-updates` (created from `dev`, 2026-05-04)
**Audit source:** 3 parallel agents (UX critique, WCAG accessibility, design-system)
**Scope:** Foundation work — tokens, shared CSS, primary CTA, color/spacing scales. Phase 2 components depend on this.

---

## Context — User Decisions From Audit

The user reviewed all 60 audit findings and gave the following directives:

### User input on first 6 issues (custom decisions, NOT default audit recommendation)

| # | Audit recommended | User decision |
|---|---|---|
| 1 | Footer regroup — drop Extension btn | **Keep Extension as text button in CENTER.** New layout: `[Settings][Help] [Extension] [Plan][Rebind]` (3+1+2 — left/center/right). Extension stays text because it aids discoverability from Area Selection tab. |
| 2 | "Plan and Extension look duplicate" | **User disagrees** — they serve different roles (billing vs install promo). Visual de-duplication will happen via #1's icon-conversion of Plan. |
| 3 | Tab bar redesign (Figma underline tabs) | **Try, but on this branch.** If user dislikes after seeing it → revert from branch (no commenting-out workflow). |
| 4 | Primary CTA dedup | ✅ Agreed — proceed |
| 5 | Form-control dedup | ✅ Agreed — proceed |
| 6 | Unused tokens | ✅ Agreed — Claude decides keep-vs-delete based on whether they're worth adopting. |

### Issues 7-60: ALL approved for fix.

### ✅ Plan button shape — DECIDED (Option B)

Design agent verdict: **GO WITH MODIFICATION** — adopt new footer layout BUT keep Plan as a `Free 3/10` pill rather than pure icon, because quota awareness drives upgrade conversion.

**User confirmed Option B** (2026-05-04): Plan = compact pill showing live quota (`Free 3/10` for free users, subtle dot/ring indicator for Pro). Implementation details in Phase 2.

---

## Phase 1 Goals

1. Establish working design tokens (colors, spacing, radius, shadow, transition, font, z-index).
2. Extract shared form-control CSS used across 4 import pages (Web, HTML, Screenshot, AreaSelection).
3. Define and reuse a single primary CTA class.
4. Fix two dangerous broken-token bugs (`--accent-rgb` undefined, `--ai-*` orphans).

**Why Phase 1 first:** Phase 2 (component-level fixes, modal a11y, footer redesign) re-uses tokens and shared classes — doing components first then tokens means rewriting twice.

---

## Step 1 — Fix broken/orphan tokens (P0 quick wins)

**Issue 7:** `Modal.css:741, 1340, 1346, 1736, 1737` use `rgba(var(--accent-rgb), …)` but `--accent-rgb` is **never declared**. These rgba calls evaluate to invalid → fallback to transparent.

**Action:**
- File: `packages/figma-plugin/src/ui/styles/global.css`
- Add to `:root`:
  ```css
  --accent-rgb: 244, 162, 97;
  --bg-rgb: 38, 70, 83;        /* if not already there */
  --panel-rgb: 30, 58, 71;     /* if not already there */
  ```
- Verify: existing `var(--bg-rgb)` / `var(--panel-rgb)` references work; add if missing.

**Issue 8:** `Modal.css:1573, 1581` reference `var(--ai-text-primary)`, `var(--ai-accent-orange)` — leftovers from removed AI Generation tab.

**Action:**
- File: `packages/figma-plugin/src/ui/components/modalPopup/Modal.css`
- Replace with `var(--text)` / `var(--accent)`.
- Grep entire `ui/` for any other `--ai-*` tokens; remove all.

**Verify:** `pnpm build` — no CSS errors.

---

## Step 2 — Token scale audit (P0 #6)

For each unused token group: decide adopt-everywhere OR delete.

### `--radius-*` (currently 0 usage, 102 hardcoded usages)
- Existing values declared: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`
- Hardcoded distribution: 58× `6px`, 30× `8px`, 8× `10px`, 6× `12px` + stragglers (`4`, `16`, `18`, `20`, `999`, `50%`)
- **Decision: ADOPT.** Add `--radius-xs: 4px`, `--radius-pill: 999px`. Replace literals with vars per consolidated scale: 4 / 8 / 12 / 16 / 999 / 50%. The 6px and 10px values get rounded to nearest scale (6→8, 10→8 or 12 depending on context).

### `--transition-fast/normal/slow` (0 usage, 48 hardcoded `0.2s ease`)
- **Decision: ADOPT.** Define:
  ```css
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;
  ```
  Replace all `0.2s ease` literals with `var(--transition-normal)`.

### `--shadow-*` (0 usage)
- **Decision: ADOPT.** Define hierarchy:
  ```css
  --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.15);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 20px 50px rgba(0, 0, 0, 0.48);
  --shadow-accent: 0 2px 8px rgba(var(--accent-rgb), 0.25);  /* CTA glow */
  ```
- Map current literals: `0 1px 4px` → `--shadow-sm`, `0 4px 12px` / `0 6px 16px` → `--shadow-md`, `0 20px 50px` → `--shadow-lg`, accent-tinted → `--shadow-accent`.

### NEW tokens to add

```css
/* Spacing scale (4px base) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;

/* Type scale */
--font-xs: 11px;
--font-sm: 12px;
--font-md: 13px;
--font-lg: 14px;
--font-xl: 16px;
--font-2xl: 18px;

/* Status colors */
--success: #22c55e;            /* consolidates #2ecc71, #2ed573, #27ae60, #3dd97f */
--success-bg: rgba(34, 197, 94, 0.12);
--error: #ef4444;              /* consolidates #ff6b6b, #e74c3c, #e76f51 */
--error-bg: rgba(239, 68, 68, 0.12);
--warning: #f59e0b;
--info: #3b82f6;

/* Accent foreground (dark text on orange) — was 23× literal #1c2f3a */
--accent-fg: #1c2f3a;

/* Font stacks */
--font-display: "Montserrat", sans-serif;
--font-body: "Open Sans", sans-serif;
--font-mono: "Courier New", monospace;

/* z-index scale */
--z-footer: 100;
--z-overlay: 1000;
--z-modal: 4000;
```

### Tokens to DEPRECATE
- `--muted` — duplicate of `--text-secondary` (`#b8c6cf` declared twice). Keep `--text-secondary`, replace all `var(--muted)` references with `var(--text-secondary)`. Remove `--muted` declaration.
- `--success-color` — rename to `--success` (matches new naming).

---

## Step 3 — Replace hardcoded values across CSS

After tokens are defined, sweep:

### Color literal sweep (P1 #11, #12, #16)
Files: `Modal.css`, `Web.css`, `HTML.css`, `Screenshot.css`, `AreaSelection.css`, `BrowserExtension.css`, `Footer.css`, `SubHeader.css`, `Import.css`, `RenderingLoader.css`

| Find | Replace |
|---|---|
| `#f4a261` (33×) | `var(--accent)` |
| `#e89450` (6×) | `var(--accent-hover)` |
| `rgba(244, 162, 97, X)` (15×) | `rgba(var(--accent-rgb), X)` |
| `#1c2f3a` (23×) | `var(--accent-fg)` |
| `#2ecc71`, `#2ed573`, `#27ae60`, `#3dd97f` | `var(--success)` |
| `#ff6b6b`, `#e74c3c`, `#e76f51` | `var(--error)` |
| `#264653` (28×) | `var(--bg)` |
| `#888` chevron stroke | `var(--text-secondary)` (also fixes contrast P2 #40) |

### Defensive fallback removal (P3 #59)
Drop `, #f4a261` from `var(--accent, #f4a261)` etc. — `:root` guarantees declaration. Sweep across all CSS.

### Off-scale spacing → nearest scale (P1 #34)
| File / line | Current | New |
|---|---|---|
| `Modal.css:434` | `padding: 7px 10px` | `padding: var(--space-2) var(--space-3)` (8/12) |
| `Modal.css:789, 1120` | `padding: 14px 16px` | `padding: var(--space-3) var(--space-4)` (12/16) |
| `Modal.css:430` | `width: 76px` | `width: 80px` (or document why) |
| `RenderingLoader.css:190` | `width: 220px` | accept (animation width — flag, don't change) |

### Font stack replacement (P2 #51)
- 28× `font-family: "Montserrat"` → `var(--font-display)`
- 4× `font-family: "Open Sans"` → `var(--font-body)`
- `"Courier New"` → `var(--font-mono)`

### Border literal sweep (P3 #24)
- `rgba(255, 255, 255, 0.08)` (29×) → `var(--border-light)`
- `rgba(255, 255, 255, 0.06)` (22×) → `var(--border-color)`
- Audit existing `--border`, `--border-accent`, `--border-light`, `--border-color` — pick 2 (`--border` strong / `--border-subtle` weak), rename rest.

---

## Step 4 — Extract shared CTA (P0 #4)

**Issue:** `.importBtn`, `.htmlCreateBtn`, `.screenshotBtn`, `.areaGenerate` are byte-for-byte the same gradient block, declared 4 times across `Web.css`, `HTML.css`, `Screenshot.css`, `AreaSelection.css`.

**Action:**
- File: `packages/figma-plugin/src/ui/pages/import/Import.css`
- Add canonical class:
  ```css
  .btnPrimary {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
    color: var(--accent-fg);
    box-shadow: var(--shadow-accent);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-5);
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--font-md);
    cursor: pointer;
    transition: var(--transition-normal);
  }
  .btnPrimary:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
  .btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }
  ```
- Remove `.importBtn`, `.htmlCreateBtn`, `.screenshotBtn`, `.areaGenerate` from per-page CSS.
- Update TSX:
  - `Web.tsx`, `HTML.tsx`, `Screenshot.tsx`, `AreaSelection.tsx` — change `class={styles.importBtn}` → `class={styles.btnPrimary}` (CSS module re-imports from `Import.css` if not auto-bound, or rename via `@import` — check create-figma-plugin's CSS module loader).

**Note on CTA copy (P1 #19):** Standardize button text to `"Generate wireframe"` across all 4 tabs. Current variants: `Import` (Web) / `Generate Wireframe` (others) → unify. Drop ALL-CAPS + `letter-spacing: 0.5px`. Use sentence case.

**Verification:** Visual test all 4 import tabs — CTA looks identical.

---

## Step 5 — Extract shared form controls (P0 #5)

**Issue:** ~250 lines × 4 page CSS files = ~80% duplicate (form controls).

**Classes to extract** (move to `Import.css`, delete from per-page):
- `.dropdown` (custom select with chevron SVG)
- `.settingsBox` (border + padding container)
- `.settingRow`
- `.settingLabel`
- `.resetBtn`
- `.configureBtn`
- `.saveDefaultBtn`
- `.checkboxGroup`
- `.checkboxItem`
- `.collapseToggle`
- `.collapsibleContent`
- `.statusMessage` (and its `.success`/`.error` modifiers — token-driven now)
- `.spinner` (one canonical animation; consider replacing with shared `<Spinner />` Preact component — Phase 2)

**Method:**
1. Read all 4 page CSS files (Web/HTML/Screenshot/AreaSelection).
2. Diff each class definition — confirm 80%+ identical.
3. Move canonical version to `Import.css`.
4. For per-page divergences, decide: legitimate page-specific (keep override with comment), or accidental drift (delete).
5. Verify TSX classNames still resolve via CSS module re-export pattern, OR rename TSX references to point at `Import.css` module.

**Settings panel border fix (P1 #27):** `.settingsBox` currently uses `border: 2px solid var(--border-accent)` (orange). Change to `border: 1px solid var(--border-light)` (neutral). Reduces orange-overload.

---

## Step 6 — Padding consistency (P1 #26)

**Issue:** `BrowserExtension.css:11` uses `padding: 20px`, all other pages use `12px`. Switching tabs visibly shifts content boundaries.

**Action:** Change `BrowserExtension.css:11` to `padding: var(--space-3)` (12px). Standard across all 5 pages.

---

## Verification checklist

- [ ] `pnpm build` — clean, no CSS errors
- [ ] `pnpm test` — Plugin tests still pass
- [ ] Plugin loads in Figma — no broken styles
- [ ] All 4 import tabs render identically (Web/HTML/Screenshot/AreaSelection)
- [ ] Browser Extension tab padding matches others
- [ ] No `var(--accent-rgb)` errors in DevTools (rgba evaluates correctly)
- [ ] No `var(--ai-*)` references remain (`grep -r "ai-text-primary\|ai-accent-orange"` returns 0)
- [ ] Spot-check: 5 random colors are now token-driven, not literal

---

## Files touched (Phase 1)

**Edit:**
- `packages/figma-plugin/src/ui/styles/global.css` (add ~25 new tokens)
- `packages/figma-plugin/src/ui/styles/ui.css`
- `packages/figma-plugin/src/ui/components/modalPopup/Modal.css` (token replacement, orphan fixes)
- `packages/figma-plugin/src/ui/components/footer/Footer.css`
- `packages/figma-plugin/src/ui/components/subHeader/SubHeader.css`
- `packages/figma-plugin/src/ui/components/renderingLoader/RenderingLoader.css`
- `packages/figma-plugin/src/ui/pages/import/Import.css` (add `.btnPrimary` + shared form controls)
- `packages/figma-plugin/src/ui/pages/import/web/Web.css` (remove dups, keep page-specific)
- `packages/figma-plugin/src/ui/pages/import/html/HTML.css` (same)
- `packages/figma-plugin/src/ui/pages/import/screenshot/Screenshot.css` (same)
- `packages/figma-plugin/src/ui/pages/import/areaSelection/AreaSelection.css` (same)
- `packages/figma-plugin/src/ui/pages/import/browserExtension/BrowserExtension.css` (padding fix)
- `packages/figma-plugin/src/ui/pages/import/web/Web.tsx` (className update)
- `packages/figma-plugin/src/ui/pages/import/html/HTML.tsx` (same)
- `packages/figma-plugin/src/ui/pages/import/screenshot/Screenshot.tsx` (same)
- `packages/figma-plugin/src/ui/pages/import/areaSelection/AreaSelection.tsx` (same)

**No new files in Phase 1.**

---

## Estimate

- Steps 1-2 (tokens fix + scale): 1-2 hours
- Step 3 (sweep): 2-3 hours
- Step 4 (CTA): 1 hour
- Step 5 (form controls): 2-3 hours
- Step 6 (padding): 5 min
- **Total: ~7-9 hours focused work**

Phase 2 starts after Phase 1 is committed and visually verified by user.
