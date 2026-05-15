# Design Updates — Phase 2: Components, Accessibility, Polish

**Branch:** `design-updates`
**Depends on:** Phase 1 (tokens + shared CSS) committed and verified.
**Audit source:** Same 3-agent audit as Phase 1.

This phase covers all remaining issues — component-level redesigns (Footer, SubHeader, Modals), accessibility fixes (a11y is a heavy chunk), and polish.

---

## Step 1 — Footer redesign (P0 #1, #2)

**New layout** (user-approved):
```
[Settings] [Help]      [   Extension   ]      [Plan pill] [Rebind]
   icon     icon           text button         Free 3/10    icon
   16px     16px              text-md            12px       16px
   ─── LEFT ───              ─── CENTER ───      ─── RIGHT ───
```

### Files
- `packages/figma-plugin/src/ui/components/footer/Footer.tsx`
- `packages/figma-plugin/src/ui/components/footer/Footer.css`

### TSX changes
1. Restructure into 3 groups:
   ```tsx
   <footer class={styles.footerBar} role="contentinfo">
     <div class={styles.leftGroup}>
       <button class={styles.iconBtn} aria-label="Open settings" onClick={openSettings}>
         <SettingsIcon />
       </button>
       <button class={styles.iconBtn} aria-label="Open help" onClick={openHelp}>
         <HelpIcon />
       </button>
     </div>
     <div class={styles.centerGroup}>
       <button class={styles.extensionBtn} onClick={openExtension}>Extension</button>
     </div>
     <div class={styles.rightGroup}>
       <button class={styles.planPill} aria-label={`Plan: ${planLabel}`} onClick={openPlan}>
         {isFreeUser ? `${used}/${limit}` : <span class={styles.proIndicator} />}
       </button>
       <button class={styles.iconBtn} aria-label="Re-apply original fonts" onClick={openRebind}>
         <RebindIcon />
       </button>
     </div>
   </footer>
   ```

2. Plan pill data wiring:
   - Read license state from `useLicense()` hook (or wherever current Plan modal reads it).
   - Free user → `${used}/${limit}` (e.g., `3/10`).
   - Pro user → small dot/ring indicator in `--accent` color, or simply "Pro" text.
   - Pro near cycle end → no special handling Phase 2 (note in TODO for Phase 3 if needed).

### CSS changes
1. Remove old `space-between` 5-button layout.
2. New layout — flex with 3 groups:
   ```css
   .footerBar {
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: var(--space-2) var(--space-3);
     background: var(--bg-darker);
     border-top: 1px solid var(--border-light);
     z-index: var(--z-footer);
   }
   .leftGroup, .rightGroup, .centerGroup { display: flex; align-items: center; gap: var(--space-2); }
   .centerGroup { flex: 1; justify-content: center; }
   ```
3. `.iconBtn` — single canonical icon button class (32×32 — fixes P1 #29 touch target):
   ```css
   .iconBtn {
     width: 32px;
     height: 32px;
     display: flex;
     align-items: center;
     justify-content: center;
     background: transparent;
     border: none;
     border-radius: var(--radius-sm);
     color: var(--text-secondary);
     cursor: pointer;
     transition: var(--transition-fast);
   }
   .iconBtn:hover { background: var(--border-light); color: var(--text); }
   .iconBtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
   ```
4. `.extensionBtn` — keep text button styling but lighter (it's a CTA-ish promo, not a primary CTA):
   ```css
   .extensionBtn {
     padding: var(--space-2) var(--space-4);
     background: transparent;
     border: 1px solid var(--border-light);
     border-radius: var(--radius-sm);
     color: var(--text);
     font-family: var(--font-display);
     font-size: var(--font-sm);
     cursor: pointer;
     transition: var(--transition-fast);
   }
   .extensionBtn:hover { border-color: var(--accent); color: var(--accent); }
   ```
5. `.planPill` — compact status pill:
   ```css
   .planPill {
     min-width: 44px;
     height: 24px;
     padding: 0 var(--space-2);
     display: inline-flex;
     align-items: center;
     justify-content: center;
     background: var(--border-light);
     border: 1px solid var(--border-color);
     border-radius: var(--radius-pill);
     color: var(--text-secondary);
     font-size: var(--font-xs);
     font-weight: 600;
     cursor: pointer;
     transition: var(--transition-fast);
   }
   .planPill:hover { border-color: var(--accent); color: var(--text); }
   .planPill[data-near-limit="true"] { color: var(--warning); border-color: var(--warning); }
   .proIndicator {
     width: 8px;
     height: 8px;
     border-radius: 50%;
     background: var(--accent);
   }
   ```

### Old classes to delete
- `.planBtn`, `.extensionBtn` (replaced — `.extensionBtn` reborn with new style above).
- Old `.footerIcon` 28×28 → renamed/superseded by `.iconBtn` 32×32.

### Tests
- Visual: Plan pill shows correctly for Free (`3/10`) and Pro (dot).
- A11y: tab order Settings → Help → Extension → Plan → Rebind.
- A11y: each icon button has `aria-label`; screen reader announces "Open settings, button" etc.
- Touch: each interactive ≥32×32px (Phase 2 target — full 44×44 if testing on iPad would block).

---

## Step 2 — SubHeader / Tab bar redesign (P1 #22, #23)

### Issue 22 — current tabs look like button-group, not tabs
4 separated bordered buttons with orange fill on active state → header always visually loud.

### Issue 23 — hidden 5th tab "extension"
Reachable only via Footer button. User can lose state when navigating away.

### Decision
Keep 4 visible tabs (Web, Area Selection, HTML, Screenshot). Browser Extension stays in its current code path but reachable from Footer's text button (Step 1 already handles this); it does NOT become a 5th tab. **Rationale:** Extension's flow is more like a modal/setup wizard than a sibling import method.

### TSX changes (`SubHeader.tsx`)
Add ARIA tablist semantics:
```tsx
<div class={styles.subHeader}>
  <div class={styles.contentNav} role="tablist" aria-orientation="horizontal" aria-label="Import method">
    {tabs.map((tab, i) => (
      <button
        role="tab"
        id={`tab-${tab.id}`}
        aria-selected={tab.id === activeTab}
        aria-controls={`panel-${tab.id}`}
        tabIndex={tab.id === activeTab ? 0 : -1}
        class={`${styles.tabBtn} ${tab.id === activeTab ? styles.tabBtnActive : ''}`}
        onClick={() => setActiveTab(tab.id)}
        onKeyDown={(e) => handleTabKeyDown(e, i)}
      >
        {tab.label}
      </button>
    ))}
  </div>
</div>
```

`handleTabKeyDown` — handles `ArrowLeft`/`ArrowRight`/`Home`/`End` (W3C tab pattern).

App.tsx — wrap rendered tab page in `<div role="tabpanel" id={\`panel-${activeTab}\`} aria-labelledby={\`tab-${activeTab}\`} tabIndex={0}>`.

### CSS changes (`SubHeader.css`)
Replace bordered-button pattern with underline-tab pattern:
```css
.contentNav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-light);
}
.tabBtn {
  flex: 1;
  padding: var(--space-3) var(--space-2);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: var(--font-sm);
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition-fast);
  white-space: nowrap;
}
.tabBtn:hover { color: var(--text); }
.tabBtn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tabBtnActive {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
```

### Cleanup
- Delete `.navButton`, `.navButtonActive` from `Import.css` (P0 #2 — duplicate of SubHeader.css).

---

## Step 3 — Modal accessibility — shared `useModal` hook (P0 #10, #11, #13)

This is the highest-value a11y fix — solves 9 modals at once.

### File: `packages/figma-plugin/src/ui/hooks/useModal.ts` (NEW)

Implements:
1. Focus trap (Tab cycling at first/last focusable).
2. Escape-to-close listener.
3. Initial focus on first focusable.
4. Focus restoration to opener on close.
5. Background `inert` (apply to `#root` or `.app`).
6. Returns ref + props to spread.

```typescript
import { useEffect, useRef } from 'preact/hooks';

interface UseModalOptions {
  isOpen: boolean;
  onClose: () => void;
  closeOnEsc?: boolean;
  closeOnOverlay?: boolean;
}

export function useModal({ isOpen, onClose, closeOnEsc = true }: UseModalOptions) {
  const modalRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement;

    // Focus first focusable
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.[0]?.focus();

    // Mark background inert
    const app = document.querySelector('.app');
    app?.setAttribute('inert', '');
    app?.setAttribute('aria-hidden', 'true');

    return () => {
      app?.removeAttribute('inert');
      app?.removeAttribute('aria-hidden');
      openerRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        // Focus trap
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, closeOnEsc]);

  return { modalRef };
}
```

### Apply to all 9 modals
For each: `Settings.tsx`, `Purchase.tsx`, `Help.tsx`, `HtmlWarningModal.tsx`, `FontFallbackModal.tsx`, `QuotaExceededModal.tsx`, `LayoutChoiceModal.tsx`, `ImportOptionsModal.tsx`, `planPopup/Plan.tsx`:

1. Import `useModal`.
2. Call hook: `const { modalRef } = useModal({ isOpen, onClose });`
3. Add `role="dialog" aria-modal="true" aria-labelledby="modal-title-X"` to modal container, `ref={modalRef}`.
4. Promote header `<span>` to `<h2 id="modal-title-X">`.
5. Verify Escape closes; Tab traps; opener regains focus.

### Special cases
- **LayoutChoiceModal** (P1 #25): currently has no close behavior. Add `onClose={onCancel}` semantics — closing without choosing = "cancel" → use defaults (auto-layout, since that's the more flexible choice). Document this.
- **FontFallbackModal**: add explicit close button (`.modalClose`) — currently has none.
- **HtmlWarningModal**: keep destructive-prevention (no overlay click) but add close button + Esc support.

### Modal sizing fix (P1 #24)
In `Modal.css`, replace fixed `height: 540px` with:
```css
.modal {
  max-height: min(540px, 90vh);
  /* height: auto by default */
}
```
Standardize `max-width: 480px` baseline; only specific modals override.

---

## Step 4 — Focus indicator restoration (P0 #18)

**Issue:** `global.css:112` has `button { outline: none }` — focus invisible everywhere.

### `global.css`
1. Remove `outline: none` from global `button` rule.
2. Add base `:focus-visible` for all interactive elements:
   ```css
   button:focus-visible,
   [role="button"]:focus-visible,
   a:focus-visible,
   input:focus-visible,
   textarea:focus-visible,
   select:focus-visible,
   [tabindex]:focus-visible {
     outline: 2px solid var(--accent);
     outline-offset: 2px;
   }
   ```
3. Sweep all `outline: none` from per-component CSS — only keep where a custom focus indicator (border-color change with adequate contrast) replaces it. Prefer always-using-outline.

### Test
Tab through every screen. Visible focus ring on every interactive element.

---

## Step 5 — Form labels + ARIA (P0 #14, #46)

### Web.tsx (URL input)
```tsx
<label class={styles.srOnly} for="url-input">Website URL</label>
<input
  id="url-input"
  class={styles.urlInput}
  aria-invalid={importState.status === 'error'}
  aria-describedby={importState.status === 'error' ? 'url-error' : undefined}
  type="url"
  placeholder="https://example.com"
  ...
/>
{importState.status === 'error' && (
  <div id="url-error" role="alert" class={styles.errorText}>{importState.message}</div>
)}
```

Add `.srOnly` (visually-hidden) class to `global.css`:
```css
.srOnly {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0);
  white-space: nowrap; border: 0;
}
```

### HTML.tsx (textareas)
- HTML textarea: `aria-label="HTML code"` or proper `<label>`.
- CSS textarea: `aria-label="CSS code"`.
- Currently `.codeLabel` `<div>` is purely visual — give it an `id` and use `aria-labelledby`.

### Screenshot.tsx (file input)
- File input: `aria-label="Upload screenshot image"`.
- The `.imageUploadArea` wrapper `<div onClick>` (P0 #17) — convert to `<button type="button">` and forward Enter/Space to file input click. OR make the `<input type="file">` the focusable element with `<label htmlFor>` styled as the area.

### Screenshot delete button
- `.deleteBtn` containing `✕` glyph → `<button aria-label="Remove uploaded image">`. Replace `✕` with SVG.

---

## Step 6 — Icon-only button names (P0 #15)

Across the app, every icon-only button needs `aria-label`. Already covered for:
- Footer icons (Step 1)
- Modal close `.modalClose` (Step 3)
- Screenshot delete (Step 5)

Remaining:
- `HTML.tsx:312, 329` `.maximizeBtn` (`⛶`) → `aria-label="Expand HTML editor"` + replace glyph with SVG (P3 #55).
- `HTML.tsx:436` `.expandCloseBtn` → `aria-label="Close expanded editor"`.

---

## Step 7 — Collapsible headers — keyboard accessibility (P0 #12)

### Issue
8+ `<div onClick>` collapsible section headers in `Settings.tsx` (`.configTitleCollapsible`) — keyboard users cannot expand any settings section.

### Fix pattern
For each `.configTitleCollapsible`:
```tsx
<button
  type="button"
  class={`${styles.configTitle} ${styles.configTitleCollapsible}`}
  aria-expanded={!collapsed.section}
  aria-controls="section-id"
  onClick={() => toggleCollapsed('section')}
>
  <span>Section name</span>
  <span class={styles.collapseIcon} aria-hidden="true">▸</span>
</button>
<div id="section-id" hidden={collapsed.section}>...</div>
```

CSS — `.configTitleCollapsible` styling stays the same (was a `<div>` block, now a `<button>` with `display: block` / `width: 100%` / `text-align: left`).

---

## Step 8 — Viewport checkbox keyboard fix (P0 #16)

### Issue
`Settings.tsx:548-555` and `SettingsPanel.tsx:170-186` use `<label>` wrapping a `readOnly` checkbox + `onClick={(e) => { e.preventDefault(); toggleViewport(...) }}` — Space key doesn't toggle.

### Fix
```tsx
<label class={styles.checkboxItem}>
  <input
    type="checkbox"
    checked={selected.includes(opt.value)}
    onChange={() => toggleViewport(opt.value)}
  />
  <span>{opt.label}</span>
</label>
```

Remove `readOnly`. Remove label-level `onClick={preventDefault}`. Wire `onChange` directly on input.

---

## Step 9 — Screenshot upload keyboard fix (P0 #17)

### Issue
`Screenshot.tsx:180-185` — `<div onClick>` wrapper, hidden file input. Keyboard users cannot upload.

### Fix (preferred — semantic label pattern)
```tsx
<label class={styles.imageUploadArea}>
  <input
    type="file"
    accept="image/*"
    class={styles.fileInput}
    aria-label="Upload screenshot image"
    onChange={handleFileChange}
  />
  <span class={styles.uploadIcon} aria-hidden="true"><CameraIcon /></span>
  <span>Drop image here or click to upload</span>
</label>
```

CSS:
```css
.fileInput {
  position: absolute;
  width: 1px; height: 1px; opacity: 0;
  /* visible to screen readers + focusable, but visually hidden */
}
.imageUploadArea {
  /* existing styling */
  cursor: pointer;
}
.imageUploadArea:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

This way the input is focusable; pressing Space/Enter when focused triggers file picker (browser default).

---

## Step 10 — Live regions for status messages (P1 #30)

### Files
- `Web.tsx:327` `.statusMessage`
- `HTML.tsx:343` `.statusMessage`
- `AreaSelection.tsx` `.statusMessage`
- `BrowserExtension.tsx` `.statusMessage`
- `Screenshot.tsx:258` `.errorText`
- `Plan.tsx:189-191` (loading/error notices)
- `RenderingLoader.tsx:86` `.stepText`

### Pattern
- Loading/success: `<div role="status" aria-live="polite">{message}</div>`
- Errors: `<div role="alert" aria-live="assertive" aria-atomic="true">{message}</div>`
- RenderingLoader step text: `aria-live="polite"`. SVG ring: `aria-hidden="true"`.

---

## Step 11 — Color contrast fixes (P1 #20, P2 #39, #40)

### CTA white-on-orange (P1 #20)
Files: `Modal.css:1173, 1393, 1760` (`.fontApplyBtn`, `.importOptionsConfirmBtn`, `.applyColorsBtn`)
- `color: #fff` on `var(--accent)` = 2.09:1 ❌
- → `color: var(--accent-fg)` (`#1c2f3a`) = 6.62:1 ✅

### Placeholder contrast (P2 #39)
- `--text-tertiary: #9fb2bc` → bump to `#c8d4dc` (still appropriately quiet but ≥4.5:1).
- Already token-driven from Phase 1.

### Dropdown chevron (P2 #40)
- `Modal.css:757, 1445` SVG `stroke='%23888'` ≈ 2.5:1 ❌
- → `stroke='%23b8c6cf'` (= `--text-secondary` value) = ~5:1 ✅
- Update inline SVG data URLs.

---

## Step 12 — Modal/component cleanup

### LayoutChoiceModal — replace emoji with SVG (P2 #42)
- 📐 → grid icon SVG
- 📍 → pin icon SVG
- Match Footer icon style (1.5px stroke).

### Help modal — replace emoji with SVG (P2 #42)
- 🛒, ❓, 💬, 📧, ✈️, 𝕏, 📨 → consistent SVG icon set.
- `𝕏` (Unicode math italic) is broken on non-Mac systems anyway (P3 #55).

### HTML maximize glyph (P3 #55)
- `⛶` → SVG path.

### BrowserExtension orange checkmark (P3 #57)
- `BrowserExtension.css:42-57` — change pseudo-element `content: "✓ "` color from `var(--accent)` (orange = warning) to `var(--success)`.

### HtmlWarningModal inline styles (P2 #41)
- Move inline `style={{...}}` rows into `Modal.css` as `.warningErrorRow`, `.warningErrorMore`.

### Screenshot inline styles (P3 #23)
- Inline upload caption → `Screenshot.css`.

### Screenshot error styling (P2 #44)
- Make `.errorText` consistent with `.statusMessage.error` pattern from other tabs.

---

## Step 13 — Modal.css split (P2 #50)

**Issue:** Modal.css = 1853 lines, 11+ feature scopes.

**Action:** Split into:
- `components/modalPopup/Modal.css` — shell only (overlay, modal, close, header)
- `components/modalPopup/planPopup/Plan.css` (already separate? verify)
- `components/modalPopup/Help.css` — Help-specific styles
- `components/modalPopup/Settings.css` — Settings-specific styles  
- `components/modalPopup/FontFallback.css`
- `components/modalPopup/Purchase.css`
- `components/modalPopup/QuotaExceeded.css`

Each `.tsx` imports its own CSS module. Modal shell stays shared.

**Note:** ensure `Modal.css.d.ts` regenerates per file. May need to update `vite.config.ts` / `package.json` typecheck.

---

## Step 14 — Misc cleanup / polish

### Class-naming consistency (P1 #37)
- Pick one modifier convention: suffix (`.fooActive`) — matches majority.
- Settings.tsx checkbox: `.checkboxItem.checked` → `.checkboxItem.checkboxItemActive`. Or accept compound for inputs (CSS `:checked + label` pattern).
- `.colorSwatch` declared 2× in Modal.css (lines 675, 1790) — rename second to `.colorSwatchSmall` (or merge if intentional).

### Toggle component dedup (P2 #35)
- Modal.css:1523 (32×18) and 1686 (36×20) → unify on 36×20 (better touch target). Single `.toggle` class.

### Modal close button dedup (P1 #36)
- Move `.expandCloseBtn` (HTML.css:437-456) styling into `Modal.css` as `.iconCloseBtn` and reuse.

### Hidden scrollbar utility (P3 #60)
- `Modal.css:467, 484, 1105` — extract `.hideScrollbar` utility class to `global.css`.

### z-index tokens (P3 #58)
- Already added in Phase 1. Replace literal z-indexes (100, 999, 1000, 4000) with `var(--z-footer/overlay/modal)`.

### Spinner unification (P3 #53)
- Create `components/spinner/Spinner.tsx` + `Spinner.css`.
- Replace 5 inline `.spinner` definitions across Web/HTML/Screenshot/AreaSelection/BrowserExtension CSS + RenderingLoader's bouncing dots.

### Settings cog SVG simplification (P3 #54)
- Replace 24-edge cog with 4-tooth cog at 16px (Feather Icons / Phosphor reference).

### RenderingLoader animation reduction (P2 #38)
- Drop pulsing 140px halo.
- Drop bouncing dots; show percentage in ring center instead.
- Keep SVG progress ring (clean primary indicator).

### HTML editor max-height (P2 #43)
- `HTML.css:46-58` — `max-height: 100px` → `max-height: 240px` (12 lines visible).
- Make maximize button affordance more discoverable (add label or larger hit area).

### Status message loading color (P2 #19 — was teal=loading=selected)
- Loading status → blue (`var(--info)`) instead of teal `var(--secondary)`.
- Selected state stays accent/teal.

### Headings hierarchy (P2 #48)
- Modal title `<span>` → `<h2>`.
- `Settings.tsx`'s `.configTitle` divs → `<h3>`.
- Tutorials panel's `<h1>` → `<h3>` (modal context, not page).
- `<fieldset>`/`<legend>` for radio groups in Settings.

### Decorative SVG/emoji aria-hidden (P2 #49)
- Sweep all decorative `<svg>`, emoji `<span>`: add `aria-hidden="true"`.
- Logo SVG (Help.tsx): `role="img" aria-label="Web2Wireframe logo"`.

### Tooltip-only info (P2 #45)
- `title=` attributes on Footer icons + SettingsPanel disabled tooltips → real Preact tooltip component triggered on hover AND focus.
- Critical context like "Not available in Screenshot mode" must be keyboard-discoverable.

### Reflow at 200% zoom (P2 #47)
- `ui.css:31` `.app { overflow: hidden }` → `overflow: auto` or remove if not needed.
- Modal max-height already fixed in Step 3.

### Rebind discoverability (P3 #56)
- Currently icon-only in Footer with verbose tooltip. Consider in-modal CTA after font fallback, but keep Footer slot for power users.
- Phase 2: improve tooltip to show on focus.

### Unique link text (P3 #18)
- Settings.tsx "Watch tutorial" repeated 3× → unique `aria-label` per ("Watch import basics tutorial" etc.).
- Add `rel="noopener noreferrer"` to all `target="_blank"` links (security + a11y).

### URL auto-prepend (P3 #23)
- Web.tsx auto-prepends `https://` on blur — accept (helpful default), document.

### Settings pattern uniformity (P3 #16)
- `<details>` in Settings.tsx — re-enable scrollbars in `.termSidebarContent` (or add scroll affordance).

---

## Verification checklist (Phase 2)

### Build & test
- [ ] `pnpm build` — clean
- [ ] `pnpm test` — all Plugin tests pass

### Manual testing — visual
- [ ] Footer: 5 items in correct positions; Plan pill shows `Free 3/10` for free users
- [ ] SubHeader: underline tabs, no orange-fill loud header
- [ ] All 9 modals: Esc closes, Tab traps focus, focus restored to opener
- [ ] All 4 import tabs: identical CTA, identical settings panel padding
- [ ] BrowserExtension: padding consistent with other tabs
- [ ] Settings collapsible sections: keyboard expand/collapse works
- [ ] Viewport checkboxes: Space toggles them
- [ ] Screenshot upload: keyboard-only flow works (Tab to area, Enter/Space opens file picker)

### Manual testing — accessibility
- [ ] Tab through entire app — focus visible everywhere
- [ ] Screen reader (VoiceOver) — modal opens announced as "dialog"
- [ ] Tablist navigation — Arrow keys move between tabs
- [ ] Status messages announce on change (loading → success/error)
- [ ] All icon-only buttons read meaningful labels

### Contrast verification
- [ ] CTA buttons: dark text on accent, ratio ≥ 4.5:1
- [ ] Placeholder text: ≥ 4.5:1
- [ ] Dropdown chevron: ≥ 3:1
- [ ] No remaining text contrast under 4.5:1 in design tokens

### Regression
- [ ] Plan modal still opens from footer pill
- [ ] Settings modal opens from footer icon
- [ ] Help modal opens from footer icon
- [ ] Rebind modal opens from footer icon
- [ ] Extension modal opens from footer text button
- [ ] All import paths still produce wireframe in Figma

---

## Files touched (Phase 2)

### NEW
- `packages/figma-plugin/src/ui/hooks/useModal.ts`
- `packages/figma-plugin/src/ui/components/spinner/Spinner.tsx`
- `packages/figma-plugin/src/ui/components/spinner/Spinner.css`
- Possibly: split modal CSS files (Step 13) — list TBD during implementation

### EDIT (heavy)
- `packages/figma-plugin/src/ui/styles/global.css` (focus-visible base, .srOnly, .hideScrollbar utilities)
- `packages/figma-plugin/src/ui/components/footer/Footer.tsx` + `Footer.css`
- `packages/figma-plugin/src/ui/components/subHeader/SubHeader.tsx` + `SubHeader.css`
- `packages/figma-plugin/src/ui/App.tsx` (tabpanel wrapping)
- `packages/figma-plugin/src/ui/components/modalPopup/Modal.css` (split + dedup + token sweep)
- All 9 modal `.tsx` files (useModal hook + ARIA + heading promotion)
- All 5 import page `.tsx` files (form labels, status live regions)
- `packages/figma-plugin/src/ui/components/settingsPanel/SettingsPanel.tsx` (checkbox fix)
- `packages/figma-plugin/src/ui/components/renderingLoader/RenderingLoader.tsx` + `RenderingLoader.css` (animation reduction, aria-hidden)
- `packages/figma-plugin/src/ui/pages/import/screenshot/Screenshot.tsx` (file upload semantic fix)
- `packages/figma-plugin/src/ui/pages/import/html/HTML.tsx` (maximize SVG, aria-labels, larger editor)
- `packages/figma-plugin/src/ui/pages/import/web/Web.tsx` (URL label + aria-invalid)
- `packages/figma-plugin/src/ui/pages/import/browserExtension/BrowserExtension.css` (checkmark color)
- All page CSS files (status loading color, removal of duplicates already done in Phase 1)

---

## Estimate

- Step 1 (Footer): 2-3h
- Step 2 (SubHeader): 1.5h
- Step 3 (useModal + 9 modals): 4-6h ⚠️ biggest
- Step 4 (focus): 1h
- Step 5 (form labels): 1h
- Step 6 (icon names): 0.5h
- Step 7 (collapsible): 1.5h
- Step 8 (checkbox fix): 0.5h
- Step 9 (screenshot upload): 1h
- Step 10 (live regions): 1h
- Step 11 (contrast): 0.5h
- Step 12 (cleanup): 2h
- Step 13 (Modal.css split): 2-3h
- Step 14 (misc polish): 3-4h

**Total: ~22-27 hours**

Recommend committing after each step (small reverts possible).

---

## Out of scope (explicit)

These are deliberately deferred:
- Toast notification system (referenced in font rebind feature memo) — separate work
- iOS-style 44×44 touch targets (we settle for 32×32 as Figma plugin standard)
- Pro near-cycle-end pill warning — Phase 3 if needed
- `inert` polyfill (assume modern browsers; Figma plugin context is Chromium)
