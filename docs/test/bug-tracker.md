# Bug Tracker — Manual Testing

> Generated: 2026-04-09
> Branch: `new-way`

---

## სტატუსი

| #       | ტესტი                                                              | სტატუსი  |
| ------- | ------------------------------------------------------------------ | -------- |
| W-01    | Web Tab: Website Colors + Website Fonts + Website Text + Real + AL | ❌ FAIL  |
| W-02    | Web Tab: Plugin Colors + Plugin Fonts + Semantic + Placeholders    | ⬜       |
| W-03    | Web Tab: Full features (Styles + Hover Variants)                   | ⬜       |
| W-04    | Web Tab: Full wireframe (Lines + Lorem + Absolute)                 | ⬜       |

### Legend

| Icon | მნიშვნელობა       |
| ---- | ----------------- |
| ✅   | Pass / სწორია     |
| ❌   | Fail / ბაგია      |
| ⚠️   | გადასახედი / TODO |
| ⬜   | არ შემოწმებულა    |

---

## W-01: Web Tab — Default Real-World

**URL:** `https://web2wireframe.design`
**Viewport:** 1440px
**Settings:** Website Colors + Website Fonts + Website Text + Real Assets + Direct + Auto Layout + None
**Status:** FAIL (4 bugs)

### ბაგები

| #       | ბაგი                                          | სტატუსი   |
| ------- | --------------------------------------------- | --------- |
| BUG-001 | SVG logos არ რენდერდება                        | ❌ OPEN   |
| BUG-002 | `::before` bullet პოზიცია არასწორია (AL)      | ❌ OPEN   |
| BUG-003 | `text-decoration: underline` არ რენდერდება    | ❌ OPEN   |
| BUG-004 | დუბლიკატი ტექსტი (text + parent ორივე ქმნის) | ❌ OPEN   |

---

### BUG-001: SVG logos not rendered

- **ელემენტი:** `<img src="/logo.svg">` (header + footer)
- **მოსალოდნელი:** Logo image visible
- **აქტუალური:** Image placeholder icon (not rendered)
- **მიზეზი:** TBD — SVG/relative-path asset extraction issue

---

### BUG-002: `::before` bullet position incorrect (Auto Layout)

- **ელემენტი:** `._list_wflxa_58 li::before` with `position: absolute; left: 0`
- **მოსალოდნელი:** Bullet aligned at left edge of list item
- **აქტუალური:** Bullet not positioned correctly, size 6x26
- **CSS:**
  ```css
  ._list_wflxa_58 li:before {
      content: "•";
      position: absolute;
      left: 0;
      color: var(--accent);
  }
  ```
- **შენიშვნა:** Only affects Auto Layout mode. Figma supports `positioning: "ABSOLUTE"` on children.

---

### BUG-003: `text-decoration: underline` not rendered

- **ელემენტი:** `<a class="_email_rue7f_124" href="mailto:...">`
- **მოსალოდნელი:** Underlined text
- **აქტუალური:** No underline
- **CSS:**
  ```css
  ._email_rue7f_124 {
      text-decoration: underline;
      text-underline-offset: 6px;
      color: var(--accent-strong);
  }
  ```
- **შენიშვნა:** Was working before, regression

---

### BUG-004: Duplicate text rendering

- **ელემენტი:** `<a><div><img><strong>Web2Wireframe</strong></div></a>`
- **მოსალოდნელი:** "Web2Wireframe" appears once
- **აქტუალური:** "Web2Wireframe" appears twice — once as "Container", once as text
- **მიზეზი:** TBD — tree-builder creating text for both `<strong>` and parent `<div>`
