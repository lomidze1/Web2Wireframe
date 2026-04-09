# Bug Tracker — Manual Testing

## W-01: Web Tab | Website Colors + Website Fonts + Website Text + Real Assets + Direct + Auto Layout + None

**Test URL:** `https://web2wireframe.design`
**Viewport:** 1440px
**Status:** FAIL (4 bugs)

### BUG-001: SVG logos not rendered
- **Status:** OPEN
- **Element:** `<img src="/logo.svg">` (header + footer)
- **Expected:** Logo image visible
- **Actual:** Image placeholder icon (not rendered)
- **Root cause:** TBD — likely SVG/relative-path asset extraction issue

### BUG-002: `::before` bullet position incorrect (Auto Layout)
- **Status:** OPEN
- **Element:** `._list_wflxa_58 li::before` with `position: absolute; left: 0`
- **Expected:** Bullet aligned at left edge of list item (X=0, absolute positioned within parent)
- **Actual:** Bullet not positioned correctly, size 6x26
- **CSS:**
  ```css
  ._list_wflxa_58 li:before {
      content: "•";
      position: absolute;
      left: 0;
      color: var(--accent);
  }
  ```
- **Note:** Only affects Auto Layout mode. Figma auto-layout supports `positioning: "ABSOLUTE"` on children.
- **Figma docs:** https://developers.figma.com/docs/widgets/api/component-Frame/#positioning

### BUG-003: `text-decoration: underline` not rendered
- **Status:** OPEN
- **Element:** `<a class="_email_rue7f_124" href="mailto:...">`
- **Expected:** Underlined text
- **Actual:** No underline
- **CSS:**
  ```css
  ._email_rue7f_124 {
      text-decoration: underline;
      text-underline-offset: 6px;
      color: var(--accent-strong);
  }
  ```
- **Note:** Was working before, regression

### BUG-004: Duplicate text rendering (text + parent both create text nodes)
- **Status:** OPEN
- **Element:** `<a><div><img><strong>Web2Wireframe</strong></div></a>`
- **Expected:** "Web2Wireframe" appears once
- **Actual:** "Web2Wireframe" appears twice — once as text node "Container", once as "Web2Wireframe"
- **Root cause:** TBD — likely tree-builder creating text for both `<strong>` and parent `<div>`

---

## Summary

| Test | Status | Bugs |
|------|--------|------|
| W-01 | FAIL | BUG-001, BUG-002, BUG-003, BUG-004 |
| W-02 | - | - |
| W-03 | - | - |
| W-04 | - | - |
